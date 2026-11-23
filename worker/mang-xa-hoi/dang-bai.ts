import { Prisma } from "../../src/generated/prisma/client";
import { voiTenant, type ClientTenant } from "../../src/lib/db";
import { ghiKiemToan } from "../../src/lib/kiem-toan";
import { ghiSuKien, SU_KIEN } from "../../src/lib/su-kien";
import { docTep, maBam } from "../../src/modules/dinh-kem/kho-tep";
import { capNhatTrangThaiBai, docCauHinhMxh, type CauHinhMxh } from "../../src/modules/mang-xa-hoi/chung";
import { layConnector } from "../../src/modules/mang-xa-hoi/connectors/danh-muc";
import type { BoiCanhGoi, BuocGoi, KenhGoi, LoiPhanLoai, NoiDungDang, SocialConnector, TepMedia, ThongTinXacThuc } from "../../src/modules/mang-xa-hoi/connectors/kieu";
import { HUONG_DAN_LOI, HUONG_DAN_LOI_OAUTH } from "../../src/modules/mang-xa-hoi/hang-so";
import { docTuyChon, LUAT, type KieuNoiDung, type TuyChonDang } from "../../src/modules/mang-xa-hoi/luat-nen-tang";
import { kyMaMedia } from "../../src/modules/mang-xa-hoi/media-ky";
import { appUrlHttps } from "../../src/modules/mang-xa-hoi/media/thong-so";
import { batDauNgayQuotaSau, ngayQuota } from "../../src/modules/mang-xa-hoi/oauth-thuan";
import { cauLoiGon, gianCachThuLai, quyetDinhSauLoi } from "../../src/modules/mang-xa-hoi/tinh-toan";
import { taoThongBao } from "../../src/modules/thong-bao/service";
import { danhDauCanKetNoiLai, moXtKenh } from "./token";

/**
 * Worker ĐĂNG BÀI (0.23.0, QĐ-200). Chỉ ở đây mới mở niêm phong mật khẩu ứng dụng (SEC-06).
 *
 * Nhận việc (giao dịch ngắn, `FOR UPDATE SKIP LOCKED` — hai worker không nhận cùng một kênh) → COMMIT → gọi nền tảng NGOÀI
 * giao dịch → ghi kết quả bằng giao dịch nhỏ, có điều kiện `locked_by = mình` (lượt bị coi là kẹt và giao cho worker khác
 * thì kết quả muộn không đè).
 *
 *  - QUEUED tới giờ → PUBLISHING (đếm lần thử). Lần thử thứ 2 trở đi, hoặc kênh có lỗi cũ (đăng lại) → ĐỐI SOÁT trước:
 *    thấy bài theo khóa đối soát thì nhận bài đó, không gửi lại.
 *  - Gửi xong có mã bài → VERIFYING → đọc lại ngay; khớp → PUBLISHED (có mã bài + permalink + mốc xác minh — trigger CSDL).
 *  - RETRYABLE → QUEUED giãn cách; hết lượt → FAILED. PERMANENT → FAILED. NEEDS_REAUTH → FAILED + kênh NEEDS_REAUTH + báo.
 *  - UNKNOWN (hết giờ sau khi đã gửi) → VERIFYING, chờ `mxh.cho_doi_soat_giay` rồi đối soát; không thấy → QUEUED lại.
 *  - PUBLISHING quá `mxh.phut_ket_dang` (worker chết giữa chừng) → VERIFYING (UNKNOWN) — không đăng lại mù.
 */

export interface ViecNhan {
  targetId: string;
  loai: "dang" | "xac-minh";
}

/** Nhận tối đa `gioiHan` việc tới hạn của một doanh nghiệp. */
export async function nhanViecDang(tenantId: string, workerId: string, bayGio: Date, gioiHan = 5): Promise<ViecNhan[]> {
  return voiTenant(tenantId, async (tx) => {
    const cfg = await docCauHinhMxh(tx);
    const moc = new Date(bayGio.getTime() - cfg.phutKetDang * 60_000);
    // Lượt kẹt: PUBLISHING quá lâu → đối soát ngay; VERIFYING đã nhận mà kẹt → mở lại cho lượt sau.
    await tx.$executeRaw`
      UPDATE social_post_targets SET status = 'VERIFYING', error_class = 'UNKNOWN', error_code = 'ket-dang',
             error_message = 'Lượt đăng bị gián đoạn (máy nền dừng giữa chừng) — đang đối soát.', next_attempt_at = ${bayGio},
             locked_by = NULL, locked_at = NULL, updated_at = ${bayGio}
      WHERE status = 'PUBLISHING' AND locked_at < ${moc}`;
    await tx.$executeRaw`
      UPDATE social_post_targets SET next_attempt_at = ${bayGio}, locked_by = NULL, locked_at = NULL, updated_at = ${bayGio}
      WHERE status = 'VERIFYING' AND next_attempt_at IS NULL AND locked_at < ${moc}`;
    const dong = await tx.$queryRaw<{ id: string; status: string; post_id: string }[]>`
      SELECT id::text AS id, status, post_id::text AS post_id FROM social_post_targets
      WHERE status IN ('QUEUED', 'VERIFYING') AND next_attempt_at <= ${bayGio}
      ORDER BY next_attempt_at, id
      LIMIT ${gioiHan}
      FOR UPDATE SKIP LOCKED`;
    const kq: ViecNhan[] = [];
    for (const d of dong) {
      if (d.status === "QUEUED") {
        await tx.$executeRaw`UPDATE social_post_targets SET status = 'PUBLISHING', locked_by = ${workerId}, locked_at = ${bayGio},
          attempt_count = attempt_count + 1, next_attempt_at = NULL, updated_at = ${bayGio} WHERE id = ${d.id}::uuid AND status = 'QUEUED'`;
        kq.push({ targetId: d.id, loai: "dang" });
      } else {
        await tx.$executeRaw`UPDATE social_post_targets SET locked_by = ${workerId}, locked_at = ${bayGio}, next_attempt_at = NULL,
          updated_at = ${bayGio} WHERE id = ${d.id}::uuid AND status = 'VERIFYING'`;
        kq.push({ targetId: d.id, loai: "xac-minh" });
      }
    }
    for (const postId of new Set(dong.map((d) => d.post_id))) await capNhatTrangThaiBai(tx, postId);
    return kq;
  });
}

interface DuLieuViec {
  target: { id: string; postId: string; status: string; attemptCount: number; externalPostId: string | null; reconcileKey: string; errorClass: string | null; mediaExternal: Record<string, string>; lockedBy: string | null; contentKind: KieuNoiDung | null; batDauLuot: Date | null };
  post: { title: string | null; body: string; createdBy: string; tuyChon: TuyChonDang };
  kenh: KenhGoi & { platform: string; status: string; disconnectedAt: Date | null; name: string; authType: string; oauthProvider: string | null };
  niemPhong: { ciphertext: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; authTag: Uint8Array<ArrayBuffer>; wrappedKey: Uint8Array<ArrayBuffer>; keyVersion: number } | null;
  media: { attachmentId: string; storedPath: string; mime: string; tenTep: string; sha256: string; dungLuong: number }[];
  nenTangDungDuoc: boolean;
  cfg: CauHinhMxh;
}

async function napViec(tx: ClientTenant, targetId: string): Promise<DuLieuViec | null> {
  const t = await tx.socialPostTarget.findFirst({
    where: { id: targetId },
    include: {
      post: { select: { title: true, body: true, createdBy: true, options: true, variants: { select: { platform: true, title: true, body: true } }, media: { include: { attachment: true }, orderBy: { position: "asc" } } } },
      connection: { include: { credential: true } },
    },
  });
  if (!t) return null;
  const nt = await tx.socialConnectorSetting.findFirst({ where: { platform: t.connection.platform } });
  const bien = t.post.variants.find((v) => v.platform === t.connection.platform);
  const c = t.connection.credential;
  const dau = await tx.socialPublishAttempt.findFirst({ where: { targetId: t.id }, orderBy: { startedAt: "asc" }, select: { startedAt: true } });
  return {
    target: { id: t.id, postId: t.postId, status: t.status, attemptCount: t.attemptCount, externalPostId: t.externalPostId, reconcileKey: t.reconcileKey, errorClass: t.errorClass, mediaExternal: (t.mediaExternal ?? {}) as Record<string, string>, lockedBy: t.lockedBy, contentKind: (t.contentKind ?? null) as KieuNoiDung | null, batDauLuot: dau?.startedAt ?? null },
    post: { title: bien?.title ?? t.post.title, body: bien?.body ?? t.post.body, createdBy: t.post.createdBy, tuyChon: docTuyChon(t.post.options) },
    kenh: { id: t.connection.id, diaChi: t.connection.externalId, tenDangNhap: t.connection.accountName, meta: (t.connection.meta ?? {}) as Record<string, unknown>, platform: t.connection.platform, status: t.connection.status, disconnectedAt: t.connection.disconnectedAt, name: t.connection.name, authType: t.connection.authType, oauthProvider: t.connection.oauthProvider },
    niemPhong: c ? { ciphertext: c.ciphertext, iv: c.iv, authTag: c.authTag, wrappedKey: c.wrappedKey, keyVersion: c.keyVersion } : null,
    media: t.post.media.filter((m) => !m.attachment.deletedAt).map((m) => ({ attachmentId: m.attachmentId, storedPath: m.attachment.storedPath, mime: m.attachment.mimeType, tenTep: m.attachment.fileName, sha256: m.attachment.sha256, dungLuong: m.attachment.sizeBytes })),
    nenTangDungDuoc: Boolean(nt && nt.availability === "AVAILABLE" && nt.enabled),
    cfg: await docCauHinhMxh(tx),
  };
}

async function ghiNhatKy(tx: ClientTenant, tenantId: string, targetId: string, lan: number, workerId: string, nhatKy: BuocGoi[]) {
  for (const b of nhatKy) {
    await tx.socialPublishAttempt.create({
      data: {
        tenantId, targetId, attemptNo: lan, kind: b.kieu, outcome: b.ketQua, errorClass: b.loaiLoi, httpStatus: b.httpStatus,
        message: b.thongBao ? cauLoiGon(b.thongBao, 500) : null, responseExcerpt: (b.trichDoan ?? undefined) as Prisma.InputJsonValue | undefined,
        workerId, startedAt: b.batDau, finishedAt: b.ketThuc,
      },
    });
  }
}

type KetThucViec =
  | { kieu: "da-dang"; externalId: string; url: string }
  /** 0.24: hoãn (hạn mức nền tảng / media đang xử lý) — QUEUED lại, KHÔNG tính lần thử. */
  | { kieu: "hoan"; sauMs: number; loi: LoiPhanLoai }
  | { kieu: "xac-minh-sau"; externalId: string | null; sauMs: number; loi: LoiPhanLoai }
  | { kieu: "thu-lai"; sauMs: number; loi: LoiPhanLoai }
  | { kieu: "that-bai"; loi: LoiPhanLoai; canNhapLai: boolean; externalId?: string | null };

export interface KetQuaXuLy {
  targetId: string;
  ketQua: KetThucViec["kieu"] | "bo-qua";
}

/** Ghi kết quả cuối của một việc. Điều kiện `locked_by = workerId`: lượt đã bị giao lại thì bỏ, không đè. */
async function ghiKetQua(tenantId: string, workerId: string, d: DuLieuViec, kt: KetThucViec, nhatKy: BuocGoi[], mediaDaTai: Record<string, string>, bayGio: Date): Promise<boolean> {
  return voiTenant(tenantId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM social_post_targets WHERE id = ${d.target.id}::uuid FOR UPDATE`;
    const hien = await tx.socialPostTarget.findFirst({ where: { id: d.target.id }, select: { lockedBy: true, status: true, attemptCount: true } });
    await ghiNhatKy(tx, tenantId, d.target.id, d.target.attemptCount, workerId, nhatKy);
    if (!hien || hien.lockedBy !== workerId || !["PUBLISHING", "VERIFYING"].includes(hien.status)) return false;
    const chung = { lockedBy: null, lockedAt: null, mediaExternal: mediaDaTai, updatedAt: bayGio };
    if (kt.kieu === "da-dang") {
      await tx.socialPostTarget.update({
        where: { id: d.target.id },
        data: { ...chung, status: "PUBLISHED", externalPostId: kt.externalId, externalUrl: kt.url, verifiedAt: bayGio, publishedAt: bayGio, errorClass: null, errorCode: null, errorMessage: null, nextAttemptAt: null },
      });
      await ghiSuKien(tx, { eventType: SU_KIEN.SOCIAL_TARGET_PUBLISHED, actorType: "system", objectType: "social_post", objectId: d.target.postId, payload: { kenhId: d.kenh.id, maBai: kt.externalId } });
    } else if (kt.kieu === "xac-minh-sau") {
      await tx.socialPostTarget.update({
        where: { id: d.target.id },
        data: { ...chung, status: "VERIFYING", ...(kt.externalId ? { externalPostId: kt.externalId } : {}), errorClass: kt.loi.loai, errorCode: kt.loi.ma, errorMessage: kt.loi.thongBao, nextAttemptAt: new Date(bayGio.getTime() + kt.sauMs) },
      });
    } else if (kt.kieu === "hoan") {
      await tx.socialPostTarget.update({
        where: { id: d.target.id },
        data: { ...chung, status: "QUEUED", attemptCount: Math.max(0, hien.attemptCount - 1), errorCode: kt.loi.ma, errorMessage: kt.loi.thongBao, nextAttemptAt: new Date(bayGio.getTime() + kt.sauMs) },
      });
    } else if (kt.kieu === "thu-lai") {
      await tx.socialPostTarget.update({
        where: { id: d.target.id },
        data: { ...chung, status: "QUEUED", errorClass: kt.loi.loai, errorCode: kt.loi.ma, errorMessage: kt.loi.thongBao, nextAttemptAt: new Date(bayGio.getTime() + kt.sauMs) },
      });
    } else {
      await tx.socialPostTarget.update({
        where: { id: d.target.id },
        data: { ...chung, status: "FAILED", ...(kt.externalId ? { externalPostId: kt.externalId } : {}), errorClass: kt.loi.loai, errorCode: kt.loi.ma, errorMessage: kt.loi.thongBao, nextAttemptAt: null },
      });
      if (kt.canNhapLai) {
        // Kênh cần cấp lại quyền + báo Marketing (0.24: kèm nút "Kết nối lại" với kênh OAuth).
        await danhDauCanKetNoiLai(tx, tenantId, d.kenh, kt.loi.thongBao, bayGio);
      }
      await ghiSuKien(tx, { eventType: SU_KIEN.SOCIAL_TARGET_FAILED, actorType: "system", objectType: "social_post", objectId: d.target.postId, payload: { kenhId: d.kenh.id, loaiLoi: kt.loi.loai, ma: kt.loi.ma } });
      await taoThongBao(tx, tenantId, {
        nguoiNhanId: d.post.createdBy, loai: "mxh-dang-loi", mucDo: "canh-bao",
        tieuDe: `Đăng lên “${d.kenh.name}” không thành công: ${d.post.title ?? d.post.body.slice(0, 50)}`,
        noiDung: `${kt.loi.thongBao} — ${kt.loi.loai === "NEEDS_REAUTH" && d.kenh.authType === "oauth" ? HUONG_DAN_LOI_OAUTH : HUONG_DAN_LOI[kt.loi.loai]}`, duongDan: `/mang-xa-hoi/bai/${d.target.postId}`,
        doiTuong: "social_post", doiTuongId: d.target.postId, khoaChongTrung: `mxh-dang-loi:${d.target.id}:${hien.attemptCount}:${kt.loi.ma}`,
      });
    }
    await capNhatTrangThaiBai(tx, d.target.postId);
    return true;
  });
}

/** Đọc lại; khớp → đã đăng. Lỗi tạm / chưa rõ → xác minh lại sau; 404 → thất bại; đọc lại hỏng quá nhiều lần → thất bại có giữ mã bài. */
async function xacMinh(c: SocialConnector, d: DuLieuViec, xt: ThongTinXacThuc, bc: BoiCanhGoi, externalId: string, nhatKy: BuocGoi[], soLanXacMinhTruoc: number): Promise<KetThucViec> {
  const v = await c.verify(d.kenh, xt, externalId, { tieuDe: d.post.title, khoaDoiSoat: d.target.reconcileKey, kieu: d.target.contentKind, noiDung: d.post.body }, bc);
  nhatKy.push(...v.nhatKy);
  if (v.ok) return { kieu: "da-dang", externalId: v.externalId, url: v.url };
  if (v.loai === "NEEDS_REAUTH") return { kieu: "that-bai", loi: v, canNhapLai: true, externalId };
  if (v.khongThay || v.loai === "PERMANENT") return { kieu: "that-bai", loi: v, canNhapLai: false, externalId };
  // Video nền tảng đang xử lý (Facebook / YouTube): chờ lâu hơn số lần thử thường (tới ~30 lần, mỗi lần 1 phút).
  if (v.ma.endsWith("dang-xu-ly") && soLanXacMinhTruoc + 1 < 30) return { kieu: "xac-minh-sau", externalId, sauMs: 60_000, loi: v };
  if (soLanXacMinhTruoc + 1 >= d.cfg.soLanThuToiDa) {
    return { kieu: "that-bai", canNhapLai: false, externalId, loi: { loai: "UNKNOWN", ma: "khong-xac-minh-duoc", thongBao: `Nền tảng đã nhận bài (mã ${externalId}) nhưng đọc lại không được sau ${d.cfg.soLanThuToiDa} lần — kiểm tra trực tiếp trên site. Không đánh dấu “đã đăng” khi chưa xác minh.`, httpStatus: v.httpStatus } };
  }
  return { kieu: "xac-minh-sau", externalId, sauMs: gianCachThuLai(soLanXacMinhTruoc + 1), loi: v };
}

/** Media của bài — byte đọc khi connector cần (kiểm mã băm mỗi lần đọc). */
function docMedia(d: DuLieuViec): TepMedia[] {
  return d.media.map((m) => ({
    attachmentId: m.attachmentId, tenTep: m.tenTep, mime: m.mime, dungLuong: m.dungLuong,
    docNoiDung: async () => {
      const noiDung = await docTep(m.storedPath);
      if (maBam(noiDung) !== m.sha256) throw new Error("Tệp media trên đĩa không khớp với tệp đã tải lên.");
      return noiDung;
    },
  }));
}

/** Giữ một lượt upload YouTube trong ngày quota (đếm chung doanh nghiệp). Hết ngưỡng → null. */
async function giuQuotaYoutube(tenantId: string, bayGio: Date, toiDa: number): Promise<number | null> {
  const ngay = ngayQuota(bayGio);
  const r = await voiTenant(tenantId, (tx) => tx.$queryRaw<{ used: number }[]>`
    INSERT INTO social_quota_usages (tenant_id, quota_key, quota_day, used, updated_at)
    VALUES (${tenantId}::uuid, 'youtube-upload', ${ngay}::date, 1, ${bayGio})
    ON CONFLICT (tenant_id, quota_key, quota_day) DO UPDATE SET used = social_quota_usages.used + 1, updated_at = ${bayGio}
    WHERE social_quota_usages.used < ${toiDa}
    RETURNING used`);
  return r.length ? Number(r[0].used) : null;
}

/** Dời lượt YouTube sang đầu ngày quota sau + báo người soạn (một lần / kênh-bài / ngày). */
async function hoanQuotaYoutube(tenantId: string, d: DuLieuViec, bayGio: Date, toiDa: number, loi?: LoiPhanLoai): Promise<KetThucViec> {
  const toi = batDauNgayQuotaSau(bayGio);
  const ngay = ngayQuota(bayGio);
  const thongBao = loi?.thongBao ?? `Đã dùng hết ${toiDa} lượt tải lên YouTube của ngày (Cấu hình “Số video tải lên YouTube tối đa mỗi ngày”).`;
  await voiTenant(tenantId, async (tx) => {
    await taoThongBao(tx, tenantId, {
      nguoiNhanId: d.post.createdBy, loai: "mxh-hoan-quota", mucDo: "canh-bao",
      tieuDe: `Video YouTube “${d.post.title ?? d.post.body.slice(0, 50)}” dời sang ngày sau`,
      noiDung: `${thongBao} Cowork tự đăng lúc ${toi.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} (đầu ngày hạn mức mới của Google).`,
      duongDan: `/mang-xa-hoi/bai/${d.target.postId}`, doiTuong: "social_post", doiTuongId: d.target.postId, khoaChongTrung: `mxh-yt-quota:${d.target.id}:${ngay}`,
    });
    await ghiKiemToan(tx, { action: "hoan-dang-quota-mxh", objectType: "social_post", objectId: d.target.postId, after: { kenhId: d.kenh.id, ngayQuota: ngay, toi: toi.toISOString(), boi: "worker" } });
  });
  return { kieu: "hoan", sauMs: Math.max(60_000, toi.getTime() - bayGio.getTime()), loi: { loai: "RETRYABLE", ma: "yt-het-quota-ngay", thongBao: `${thongBao} Dời sang ngày sau.`, httpStatus: loi?.httpStatus ?? null } };
}

/** Xử lý một việc đã nhận. Không bao giờ ném ra ngoài (lỗi bất ngờ → ghi thành lỗi tạm, thử lại có giãn cách). */
export async function xuLyViec(tenantId: string, workerId: string, viec: ViecNhan, bayGio: Date, env: NodeJS.ProcessEnv = process.env): Promise<KetQuaXuLy> {
  const d = await voiTenant(tenantId, (tx) => napViec(tx, viec.targetId));
  if (!d || d.target.lockedBy !== workerId) return { targetId: viec.targetId, ketQua: "bo-qua" };
  const nhatKy: BuocGoi[] = [];
  let mediaDaTai = { ...d.target.mediaExternal };
  const xong = async (kt: KetThucViec): Promise<KetQuaXuLy> => {
    const ghi = await ghiKetQua(tenantId, workerId, d, kt, nhatKy, mediaDaTai, bayGio);
    return { targetId: d.target.id, ketQua: ghi ? kt.kieu : "bo-qua" };
  };

  const c = layConnector(d.kenh.platform);
  if (!c || !d.nenTangDungDuoc) return xong({ kieu: "that-bai", canNhapLai: false, loi: { loai: "PERMANENT", ma: "nen-tang-tat", thongBao: "Nền tảng chưa được hỗ trợ hoặc đang tắt trên máy chủ.", httpStatus: null } });
  if (d.kenh.disconnectedAt || !d.niemPhong) return xong({ kieu: "that-bai", canNhapLai: false, loi: { loai: "PERMANENT", ma: "kenh-da-ngat", thongBao: "Kênh đã ngắt.", httpStatus: null } });
  if (d.kenh.status === "NEEDS_REAUTH") return xong({ kieu: "that-bai", canNhapLai: true, loi: { loai: "NEEDS_REAUTH", ma: "kenh-can-nhap-lai", thongBao: d.kenh.authType === "oauth" ? "Kênh cần kết nối lại." : "Kênh cần nhập lại mật khẩu ứng dụng.", httpStatus: null } });

  // Mở bí mật (kênh OAuth: kèm thông tin app; Google: làm mới access token trước hạn).
  const mo = await moXtKenh(tenantId, d.kenh, d.niemPhong, bayGio, d.cfg.hanGoiMs, env);
  if (!mo.ok) {
    if (mo.canKetNoiLai) return xong({ kieu: "that-bai", canNhapLai: true, loi: mo.loi });
    // Thiếu / sai SOCIAL_MASTER_KEY, thiếu thông tin app: lỗi của máy chủ, không phải của bài — thử lại sau.
    if (mo.loi.ma === "khoa-chu") console.error(`[worker] mxh: không mở được niêm phong kênh ${d.kenh.id}`);
    return xong({ kieu: "thu-lai", sauMs: 10 * 60_000, loi: mo.loi });
  }
  const xt: ThongTinXacThuc = mo.xt;
  const goc = (env.APP_URL ?? "").trim().replace(/\/+$/, "");
  const bc: BoiCanhGoi = {
    hanMs: d.cfg.hanGoiMs,
    app: mo.app,
    linkMedia: appUrlHttps(env)
      ? (attachmentId, jpeg) => `${goc}/api/cong-khai/mxh/media/${kyMaMedia({ tenantId, postId: d.target.postId, attachmentId, hetHanGiay: Math.floor(bayGio.getTime() / 1000) + d.cfg.hanLinkMediaPhut * 60, ...(jpeg ? { jpeg: true } : {}) })}`
      : undefined,
  };
  const ndDoiSoat: Partial<NoiDungDang> = { noiDung: d.post.body, kieu: d.target.contentKind, mediaDaTai, batDauLuot: d.target.batDauLuot, media: docMedia(d) };

  try {
    let externalId = d.target.externalPostId;
    // --- Xác minh / đối soát ---
    if (viec.loai === "xac-minh") {
      const soXm = await voiTenant(tenantId, (tx) => tx.socialPublishAttempt.count({ where: { targetId: d.target.id, kind: "verify", attemptNo: d.target.attemptCount, outcome: { not: "success" } } }));
      if (!externalId) {
        const ds = await c.reconcile(d.kenh, xt, d.target.reconcileKey, bc, ndDoiSoat);
        nhatKy.push(...ds.nhatKy);
        if (!ds.ok) {
          if (ds.loai === "NEEDS_REAUTH") return xong({ kieu: "that-bai", loi: ds, canNhapLai: true });
          return xong({ kieu: "xac-minh-sau", externalId: null, sauMs: gianCachThuLai(soXm + 1), loi: ds });
        }
        if (!ds.externalId) {
          // Không thấy bài → lượt trước chưa lên. Đăng lại (an toàn) nếu còn lượt.
          if (d.target.attemptCount >= d.cfg.soLanThuToiDa) {
            return xong({ kieu: "that-bai", canNhapLai: false, loi: { loai: "RETRYABLE", ma: "het-luot", thongBao: "Đối soát không thấy bài trên nền tảng và đã hết lượt thử.", httpStatus: null } });
          }
          return xong({ kieu: "thu-lai", sauMs: 0, loi: { loai: "UNKNOWN", ma: "doi-soat-khong-thay", thongBao: "Đối soát: bài chưa lên — sẽ đăng lại.", httpStatus: null } });
        }
        externalId = ds.externalId;
      }
      return xong(await xacMinh(c, d, xt, bc, externalId, nhatKy, soXm));
    }

    // --- Đăng ---
    if (d.target.attemptCount > 1 || d.target.errorClass) {
      const ds = await c.reconcile(d.kenh, xt, d.target.reconcileKey, bc, ndDoiSoat);
      nhatKy.push(...ds.nhatKy);
      if (ds.ok && ds.externalId) return xong(await xacMinh(c, d, xt, bc, ds.externalId, nhatKy, 0));
      if (!ds.ok) {
        // Không đối soát được thì KHÔNG gửi (có thể trùng) — xử lý như lỗi của lần này.
        const qd = quyetDinhSauLoi(ds.loai === "UNKNOWN" ? "RETRYABLE" : ds.loai, d.target.attemptCount, d.cfg.soLanThuToiDa, d.cfg.choDoiSoatMs);
        if (qd.loai === "thu-lai") return xong({ kieu: "thu-lai", sauMs: qd.sauMs, loi: ds });
        return xong({ kieu: "that-bai", loi: ds, canNhapLai: qd.loai === "that-bai" && qd.canNhapLai });
      }
    }
    // Hạn mức trước khi gửi (0.24): Reels Facebook 30 / 24 giờ / Page; YouTube — giữ một lượt trong ngày quota.
    if (d.target.contentKind === "fb-reels") {
      const dem = await voiTenant(tenantId, (tx) => tx.socialPostTarget.count({ where: { connectionId: d.kenh.id, contentKind: "fb-reels", status: "PUBLISHED", publishedAt: { gte: new Date(bayGio.getTime() - 86_400_000) }, id: { not: d.target.id } } }));
      if (dem >= LUAT.FACEBOOK_PAGE.reelsMoi24Gio) return xong({ kieu: "hoan", sauMs: 3_600_000, loi: { loai: "RETRYABLE", ma: "han-muc-reels", thongBao: `Page đã đăng ${dem} Reels trong 24 giờ qua (Facebook cho tối đa ${LUAT.FACEBOOK_PAGE.reelsMoi24Gio}) — hoãn 1 giờ.`, httpStatus: null } });
    }
    if (d.target.contentKind === "yt-video" && !mediaDaTai.__ytPhien) {
      const dung = await giuQuotaYoutube(tenantId, bayGio, d.cfg.youtubeToiDaNgay);
      if (dung === null) return xong(await hoanQuotaYoutube(tenantId, d, bayGio, d.cfg.youtubeToiDaNgay));
    }
    const media = docMedia(d);
    const kq = await c.publish(d.kenh, xt, { tieuDe: d.post.title, noiDung: d.post.body, khoaDoiSoat: d.target.reconcileKey, media, mediaDaTai, kieu: d.target.contentKind, tuyChon: d.post.tuyChon, batDauLuot: d.target.batDauLuot }, bc);
    nhatKy.push(...kq.nhatKy);
    mediaDaTai = kq.mediaDaTai;
    if (kq.ok) return xong(await xacMinh(c, d, xt, bc, kq.externalId, nhatKy, 0));
    if (kq.hoanMs !== undefined) {
      if (kq.hoanMs < 0) return xong(await hoanQuotaYoutube(tenantId, d, bayGio, d.cfg.youtubeToiDaNgay, kq));
      return xong({ kieu: "hoan", sauMs: kq.hoanMs, loi: kq });
    }
    const qd = quyetDinhSauLoi(kq.loai, d.target.attemptCount, d.cfg.soLanThuToiDa, d.cfg.choDoiSoatMs);
    if (qd.loai === "thu-lai") return xong({ kieu: "thu-lai", sauMs: qd.sauMs, loi: kq });
    if (qd.loai === "doi-soat") return xong({ kieu: "xac-minh-sau", externalId: null, sauMs: qd.sauMs, loi: kq });
    return xong({ kieu: "that-bai", loi: kq, canNhapLai: qd.canNhapLai });
  } catch (e) {
    console.error(`[worker] mxh: lỗi bất ngờ khi xử lý kênh-bài ${d.target.id}: ${cauLoiGon(e, 200)}`);
    const loi: LoiPhanLoai = { loai: "RETRYABLE", ma: "loi-noi-bo", thongBao: cauLoiGon(e, 200), httpStatus: null };
    // Lỗi trong khi đang ĐĂNG mà đã có nhật ký gửi đi → không chắc bài đã lên chưa → đối soát.
    if (viec.loai === "dang" && nhatKy.some((b) => b.kieu === "publish")) return xong({ kieu: "xac-minh-sau", externalId: null, sauMs: d.cfg.choDoiSoatMs, loi: { ...loi, loai: "UNKNOWN" } });
    if (d.target.attemptCount >= d.cfg.soLanThuToiDa) return xong({ kieu: "that-bai", loi, canNhapLai: false });
    return xong(viec.loai === "dang" ? { kieu: "thu-lai", sauMs: gianCachThuLai(d.target.attemptCount), loi } : { kieu: "xac-minh-sau", externalId: d.target.externalPostId, sauMs: gianCachThuLai(1), loi });
  }
}

/** Một vòng cho một doanh nghiệp: nhận việc rồi xử lý lần lượt. */
export async function dangBaiMotVong(tenantId: string, workerId: string, bayGio: Date, gioiHan = 5, env: NodeJS.ProcessEnv = process.env): Promise<KetQuaXuLy[]> {
  const viec = await nhanViecDang(tenantId, workerId, bayGio, gioiHan);
  const kq: KetQuaXuLy[] = [];
  for (const v of viec) kq.push(await xuLyViec(tenantId, workerId, v, bayGio, env));
  return kq;
}
