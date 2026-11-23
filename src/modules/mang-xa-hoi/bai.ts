import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { taoCsv } from "@/lib/csv";
import { LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { batBuocQuyen, coQuyen, LoiThieuQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { nguoiGiuQuyen, taoThongBao } from "@/modules/thong-bao/service";
import { dieuKienXemBai, docCauHinhMxh, duyetDuocNguoiSoan } from "./chung";
import { layConnector } from "./connectors/danh-muc";
import { HUONG_DAN_LOI, TEN_NEN_TANG, type LoaiLoi, type TrangThaiBai } from "./hang-so";
import type { LuocDoBai, LuocDoGuiDuyet, LuocDoLocBai } from "./luoc-do";
import { duocChuyenBai, khoaDoiSoat, SUA_DUOC } from "./tinh-toan";

/**
 * Bài mạng xã hội (0.23.0, MXH-10 → MXH-35): soạn, gửi duyệt / duyệt / trả lại, đăng ngay, hẹn giờ, hủy lịch, đăng lại.
 *
 * Mọi đổi trạng thái khóa dòng bài trước (`SELECT … FOR UPDATE`, như `khoaChungTu` — QĐ-77) rồi mới đọc trạng thái.
 * Service KHÔNG gọi nền tảng: đăng = đặt các kênh sang QUEUED; worker nhận việc, gọi nền tảng, đọc lại xác minh.
 * Không có đường nào ở đây ghi PUBLISHED (ADR-05 — chỉ worker sau khi đọc lại khớp; trigger CSDL chặn thêm một lớp).
 */

type TacNhan = "user" | "ai";

async function khoaBai(tx: ClientTenant, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM social_posts WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`;
}

async function layBai(nc: NguCanh, id: string, khoa = false) {
  if (khoa) await khoaBai(nc.tx, id);
  const b = await nc.tx.socialPost.findFirst({
    where: { AND: [{ id, deletedAt: null }, await dieuKienXemBai(nc)] },
    include: {
      targets: { include: { connection: { select: { id: true, name: true, platform: true, status: true, disconnectedAt: true, externalId: true } } }, orderBy: { createdAt: "asc" } },
      media: { include: { attachment: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } } }, orderBy: { position: "asc" } },
    },
  });
  if (!b) throw new LoiKhongTimThay("Bài");
  return b;
}
type Bai = Awaited<ReturnType<typeof layBai>>;

/** Về nháp để sửa: bài đã hủy, hoặc bài lỗi mà không kênh nào có mã bài nền tảng (không thể sinh bài trùng). */
function veNhapDuoc(b: { status: string; targets: { externalPostId: string | null; status: string }[] }): boolean {
  if (b.status === "CANCELED") return true;
  return b.status === "FAILED" && b.targets.every((t) => !t.externalPostId && ["FAILED", "CANCELED", "SKIPPED"].includes(t.status));
}

function batBuocChuyen(b: { status: string }, sang: TrangThaiBai, viec: string) {
  if (!duocChuyenBai(b.status as TrangThaiBai, sang)) {
    throw new LoiNghiepVu(`Bài đang “${b.status}” — không ${viec} được.`, 409, "sai-trang-thai");
  }
}

/** Người này được sửa / gửi duyệt bài: người soạn có `mxh.create`, hoặc người có `mxh.update` (trong phạm vi xem). */
function duocSoan(nc: NguCanh, b: { createdBy: string }): boolean {
  return coQuyen(nc.hoSo, "mxh.update") || (coQuyen(nc.hoSo, "mxh.create") && b.createdBy === nc.hoSo.userId);
}

/** Bài cần duyệt trước khi đăng (SEC-09): bài do AI tạo khi Cấu hình bật. Thực tập sinh không có `mxh.update` nên luôn phải gửi duyệt. */
async function canDuyet(nc: NguCanh, b: { createdByType: string }): Promise<boolean> {
  return b.createdByType === "ai" && (await docCauHinhMxh(nc.tx)).aiPhaiDuyet;
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

function kenhCuaBaiRa(t: Bai["targets"][number]) {
  const loai = (t.errorClass ?? null) as LoaiLoi | null;
  return {
    id: t.id,
    kenhId: t.connectionId,
    tenKenh: t.connection.name,
    nenTang: t.connection.platform,
    tenNenTang: TEN_NEN_TANG[t.connection.platform] ?? t.connection.platform,
    trangThai: t.status,
    // Permalink chỉ hiện khi ĐÃ XÁC MINH (INV-4: UI chỉ lấy trạng thái từ CSDL).
    duongDan: t.status === "PUBLISHED" ? t.externalUrl : null,
    xacMinhLuc: t.verifiedAt,
    loaiLoi: loai,
    maLoi: t.errorCode,
    thongBaoLoi: t.errorMessage,
    huongDan: loai && (t.status === "FAILED" || t.status === "VERIFYING") ? HUONG_DAN_LOI[loai] : null,
    soLanThu: t.attemptCount,
    lanThuToi: t.nextAttemptAt,
    kenhCanNhapLai: t.connection.status === "NEEDS_REAUTH",
    // QA 0.23.0 (QĐ-207): không rõ bài đã lên chưa — người dùng kiểm tay trên site.
    canKiemTay: t.status === "NEEDS_CHECK",
    diaChiSite: t.connection.externalId,
  };
}

function baiRa(b: Bai) {
  return {
    id: b.id,
    tieuDe: b.title,
    noiDung: b.body,
    trangThai: b.status,
    henLuc: b.scheduledAt,
    cheDoDang: b.publishMode,
    doAiTao: b.createdByType === "ai",
    nguoiSoanId: b.createdBy,
    guiDuyetBoi: b.submittedBy,
    guiDuyetLuc: b.submittedAt,
    duyetBoi: b.approvedBy,
    duyetLuc: b.approvedAt,
    ghiChuDuyet: b.reviewNote,
    phienBan: b.revision,
    canHenLai: b.status === "APPROVED" && b.needsReschedule,
    dongTacGiaIds: b.coAuthorIds,
    taoLuc: b.createdAt,
    capNhatLuc: b.updatedAt,
    kenh: b.targets.map(kenhCuaBaiRa),
    anh: b.media.map((m) => ({ id: m.attachment.id, tenTep: m.attachment.fileName, kieu: m.attachment.mimeType, vaiTro: m.role })),
  };
}
export type BaiRa = ReturnType<typeof baiRa>;

export async function danhSachBai(nc: NguCanh, loc: z.infer<typeof LuocDoLocBai>) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const KICH = 30;
  const where = { AND: [{ deletedAt: null }, await dieuKienXemBai(nc), loc.trangThai ? { status: loc.trangThai } : {}] };
  const tong = await nc.tx.socialPost.count({ where });
  const [ds] = await Promise.all([
    nc.tx.socialPost.findMany({
      where,
      include: {
        targets: { include: { connection: { select: { id: true, name: true, platform: true, status: true, disconnectedAt: true, externalId: true } } }, orderBy: { createdAt: "asc" } },
        media: { include: { attachment: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } } }, orderBy: { position: "asc" } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (loc.trang - 1) * KICH,
      take: KICH,
    }),
  ]);
  const ten = await tenNguoi(nc, ds.map((b) => b.createdBy));
  return { tong, trang: loc.trang, soTrang: Math.max(1, Math.ceil(tong / KICH)), dong: ds.map((b) => ({ ...baiRa(b), nguoiSoan: ten.get(b.createdBy) ?? "—" })) };
}

/** Lịch: bài đã hẹn giờ / đang đăng / đã đăng trong khoảng [tu, den). */
export async function lichBai(nc: NguCanh, tu: Date, den: Date) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const ds = await nc.tx.socialPost.findMany({
    where: { AND: [{ deletedAt: null }, await dieuKienXemBai(nc), { scheduledAt: { gte: tu, lt: den } }] },
    select: { id: true, title: true, body: true, status: true, scheduledAt: true },
    orderBy: { scheduledAt: "asc" },
    take: 500,
  });
  return ds.map((b) => ({ id: b.id, tieuDe: b.title ?? b.body.slice(0, 80), trangThai: b.status, henLuc: b.scheduledAt }));
}

async function tenNguoi(nc: NguCanh, ids: (string | null)[]) {
  const ds = await nc.tx.user.findMany({ where: { id: { in: [...new Set(ids.filter((x): x is string => !!x))] } }, select: { id: true, fullName: true } });
  return new Map(ds.map((u) => [u.id, u.fullName]));
}

export async function chiTietBai(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const b = await layBai(nc, id);
  const ten = await tenNguoi(nc, [b.createdBy, b.submittedBy, b.approvedBy]);
  const lichSu = await nc.tx.socialPostReview.findMany({ where: { postId: id }, orderBy: { createdAt: "asc" } });
  const duyet = b.status === "PENDING_APPROVAL" ? await nguoiDuyetHopLe(nc, b) : { ok: false as const, lyDo: "" };
  const tenLs = await tenNguoi(nc, lichSu.map((l) => l.actorId));
  const st = b.status as TrangThaiBai;
  const soan = duocSoan(nc, b);
  const update = coQuyen(nc.hoSo, "mxh.update");
  const phaiDuyet = await canDuyet(nc, b);
  return {
    ...baiRa(b),
    canhBao: await canhBaoBai(nc, b),
    nguoiSoan: ten.get(b.createdBy) ?? "—",
    nguoiGuiDuyet: b.submittedBy ? ten.get(b.submittedBy) ?? "—" : null,
    nguoiDuyet: b.approvedBy ? ten.get(b.approvedBy) ?? "—" : null,
    phaiDuyet,
    lichSuDuyet: lichSu.map((l) => ({ hanhDong: l.action, nguoi: tenLs.get(l.actorId) ?? "—", ghiChu: l.note, luc: l.createdAt })),
    quyen: {
      sua: soan && SUA_DUOC.includes(st),
      guiDuyet: soan && (st === "DRAFT"),
      rutDuyet: st === "PENDING_APPROVAL" && (b.createdBy === nc.hoSo.userId || b.submittedBy === nc.hoSo.userId),
      duyet: st === "PENDING_APPROVAL" && duyet.ok,
      lyDoKhongDuyet: st === "PENDING_APPROVAL" && !duyet.ok ? duyet.lyDo : null,
      dang: update && (st === "DRAFT" || st === "APPROVED") && (!phaiDuyet || st === "APPROVED"),
      huyLich: update && st === "SCHEDULED",
      dangLai: update && (st === "FAILED" || st === "PARTIALLY_FAILED"),
      veNhap: soan && veNhapDuoc(b),
      xoa: (coQuyen(nc.hoSo, "mxh.delete") || (b.createdBy === nc.hoSo.userId && coQuyen(nc.hoSo, "mxh.create"))) && (st === "DRAFT" || st === "CANCELED"),
      dinhKem: soan && (st === "DRAFT" || st === "CANCELED"),
    },
  };
}

/**
 * Cảnh báo (không chặn) của bước kiểm bài — QA 0.23.0 (QĐ-208): ví dụ WordPress chỉ dùng ảnh đầu tiên làm ảnh đại diện,
 * ảnh thứ hai trở đi KHÔNG được đăng. Bài còn sửa được thì đếm ảnh hiện có; đã chụp thì đếm ảnh đã chụp.
 */
async function canhBaoBai(nc: NguCanh, b: Bai): Promise<string[]> {
  const soAnh = SUA_DUOC.includes(b.status as TrangThaiBai)
    ? await nc.tx.attachment.count({ where: { objectType: "social_post", objectId: b.id, deletedAt: null, mimeType: { startsWith: "image/" } } })
    : b.media.length;
  const ds: string[] = [];
  for (const t of b.targets) {
    const c = layConnector(t.connection.platform);
    for (const x of c?.canhBao?.({ soAnh }) ?? []) ds.push(`${t.connection.name}: ${x}`);
  }
  return [...new Set(ds)];
}

// ---------------------------------------------------------------------------
// Soạn
// ---------------------------------------------------------------------------

/** Kênh chọn phải: của doanh nghiệp (RLS), đang nối, nền tảng dùng được. */
async function kiemKenh(nc: NguCanh, kenhIds: string[]) {
  const ids = [...new Set(kenhIds)];
  if (!ids.length) return [];
  const ds = await nc.tx.socialConnection.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, platform: true, status: true, disconnectedAt: true } });
  if (ds.length !== ids.length) throw new LoiNghiepVu("Có kênh không tồn tại.", 404, "khong-tim-thay");
  for (const k of ds) {
    if (k.disconnectedAt) throw new LoiNghiepVu(`Kênh “${k.name}” đã ngắt.`, 409, "kenh-da-ngat");
    if (!layConnector(k.platform)) throw new LoiNghiepVu(`${TEN_NEN_TANG[k.platform] ?? k.platform} chưa được hỗ trợ.`, 409, "nen-tang-chua-ho-tro");
  }
  return ds;
}

async function datKenh(nc: NguCanh, postId: string, tieuDe: string | null, kenhIds: string[]) {
  await kiemKenh(nc, kenhIds);
  const cu = await nc.tx.socialPostTarget.findMany({ where: { postId }, select: { id: true, connectionId: true, status: true, errorClass: true } });
  const bo = cu.filter((t) => !kenhIds.includes(t.connectionId));
  if (bo.some((t) => !["PENDING", "CANCELED"].includes(t.status))) throw new LoiNghiepVu("Kênh đã vào lượt đăng không bỏ được.", 409, "sai-trang-thai");
  if (bo.length) await nc.tx.socialPostTarget.deleteMany({ where: { id: { in: bo.map((t) => t.id) } } });
  for (const kenhId of kenhIds) {
    const da = cu.find((t) => t.connectionId === kenhId);
    if (da) {
      await nc.tx.socialPostTarget.update({ where: { id: da.id }, // Kênh đã từng gửi (có lỗi cũ): giữ khóa đối soát cũ để lần sau còn tìm được bài lượt trước (nếu đã lên).
      data: { status: "PENDING", ...(da.errorClass ? {} : { reconcileKey: khoaDoiSoat(tieuDe, da.id) }), errorMessage: null, nextAttemptAt: null } });
    } else {
      const id = crypto.randomUUID();
      await nc.tx.socialPostTarget.create({ data: { id, tenantId: nc.tenantId, postId, connectionId: kenhId, status: "PENDING", reconcileKey: khoaDoiSoat(tieuDe, id) } });
    }
  }
}

/**
 * Tạo bài nháp. Có khóa lặp lại (`Idempotency-Key`, ADR-08): gửi lại cùng khóa trả bài đã tạo (`trung: true`), không
 * tạo bài thứ hai. `tacNhan: "ai"` — bài do trợ lý AI soạn (0.25), phải duyệt khi Cấu hình `mxh.ai_phai_duyet` = 1.
 */
export async function taoBai(nc: NguCanh, d: z.infer<typeof LuocDoBai>, tacNhan: TacNhan = "user") {
  batBuocQuyen(nc.hoSo, "mxh.create", { objectType: "social_post" });
  const khoa = d.khoaLapLai?.trim() || null;
  if (khoa) {
    const da = await nc.tx.socialPost.findFirst({ where: { idempotencyKey: khoa }, select: { id: true, createdBy: true } });
    if (da) {
      if (da.createdBy !== nc.hoSo.userId) throw new LoiNghiepVu("Khóa lặp lại đã được dùng cho bài khác.", 409, "khoa-lap-lai-trung");
      return { ...(await chiTietBai(nc, da.id)), trung: true };
    }
  }
  const id = crypto.randomUUID();
  try {
    await nc.tx.$executeRaw`SAVEPOINT tao_bai_mxh`;
    await nc.tx.socialPost.create({
      data: { id, tenantId: nc.tenantId, title: d.tieuDe?.trim() || null, body: d.noiDung, createdByType: tacNhan, idempotencyKey: khoa, createdBy: nc.hoSo.userId },
    });
    await nc.tx.$executeRaw`RELEASE SAVEPOINT tao_bai_mxh`;
  } catch (e) {
    // Hai yêu cầu cùng khóa chạy song song: bên sau gặp khóa duy nhất → trả bài của bên trước.
    if (khoa && laLoiTrung(e)) {
      await nc.tx.$executeRaw`ROLLBACK TO SAVEPOINT tao_bai_mxh`;
      const da = await nc.tx.socialPost.findFirst({ where: { idempotencyKey: khoa }, select: { id: true } });
      if (da) return { ...(await chiTietBai(nc, da.id)), trung: true };
    }
    throw e;
  }
  await datKenh(nc, id, d.tieuDe?.trim() || null, d.kenhIds);
  await nc.kiemToan({ action: "tao", objectType: "social_post", objectId: id, after: { tieuDe: d.tieuDe ?? null, soKenh: d.kenhIds.length, tacNhan } });
  await nc.suKien({ eventType: SU_KIEN.SOCIAL_POST_CREATED, objectType: "social_post", objectId: id, payload: { soKenh: d.kenhIds.length, tacNhan } });
  return { ...(await chiTietBai(nc, id)), trung: false };
}

/** Sửa bài: chỉ khi nháp / đã duyệt / đã hủy. Sửa bài đã duyệt → về nháp, mất duyệt (duyệt cái người ta thấy). */
export async function suaBai(nc: NguCanh, id: string, d: z.infer<typeof LuocDoBai>) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const b = await layBai(nc, id, true);
  if (!duocSoan(nc, b)) throw new LoiThieuQuyen("mxh.update", { objectType: "social_post", objectId: id });
  if (!SUA_DUOC.includes(b.status as TrangThaiBai)) throw new LoiNghiepVu("Bài đã gửi duyệt / hẹn giờ / đăng — không sửa được. Rút duyệt hoặc hủy lịch trước.", 409, "sai-trang-thai");
  const tieuDe = d.tieuDe?.trim() || null;
  await nc.tx.socialPost.update({
    where: { id },
    data: { title: tieuDe, body: d.noiDung, status: "DRAFT", approvedBy: null, approvedAt: null, needsReschedule: false, revision: { increment: 1 }, updatedBy: nc.hoSo.userId },
  });
  await datKenh(nc, id, tieuDe, d.kenhIds);
  await nc.kiemToan({ action: "sua", objectType: "social_post", objectId: id, before: { tieuDe: b.title, trangThai: b.status }, after: { tieuDe, trangThai: "DRAFT", soKenh: d.kenhIds.length } });
  await nc.suKien({ eventType: SU_KIEN.SOCIAL_POST_UPDATED, objectType: "social_post", objectId: id, payload: { boDuyet: b.status === "APPROVED" } });
  return chiTietBai(nc, id);
}

export async function xoaBai(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const b = await layBai(nc, id, true);
  const duoc = coQuyen(nc.hoSo, "mxh.delete") || (b.createdBy === nc.hoSo.userId && coQuyen(nc.hoSo, "mxh.create"));
  if (!duoc) throw new LoiThieuQuyen("mxh.delete", { objectType: "social_post", objectId: id });
  if (!["DRAFT", "CANCELED"].includes(b.status)) throw new LoiNghiepVu("Chỉ xóa được bài nháp hoặc đã hủy.", 409, "sai-trang-thai");
  await nc.tx.socialPost.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "xoa", objectType: "social_post", objectId: id, before: { tieuDe: b.title, trangThai: b.status } });
  return { id, daXoa: true };
}

// ---------------------------------------------------------------------------
// Kiểm nội dung, chụp ảnh
// ---------------------------------------------------------------------------

function kiemNoiDung(b: Bai) {
  if (!b.targets.length) throw new LoiNghiepVu("Chọn ít nhất một kênh.", 422, "chua-chon-kenh");
  const loi: string[] = [];
  for (const t of b.targets) {
    if (t.connection.disconnectedAt) loi.push(`Kênh “${t.connection.name}” đã ngắt.`);
    else if (t.connection.status === "NEEDS_REAUTH") loi.push(`Kênh “${t.connection.name}” cần nhập lại mật khẩu ứng dụng (Mạng xã hội → Kênh).`);
    const c = layConnector(t.connection.platform);
    if (!c) {
      loi.push(`${TEN_NEN_TANG[t.connection.platform]} chưa được hỗ trợ.`);
      continue;
    }
    for (const v of c.validate({ tieuDe: b.title, noiDung: b.body, soAnh: b.media.length })) loi.push(`${t.connection.name}: ${v.thongBao}`);
  }
  if (loi.length) throw new LoiNghiepVu(loi.join(" "), 422, "noi-dung-chua-hop-le", { loi });
}

/** Chụp ảnh của bài (tệp đính kèm loại social_post còn hiệu lực, là ảnh) vào social_post_media — thứ đã duyệt là thứ được đăng. */
async function chupAnh(nc: NguCanh, postId: string) {
  const tep = await nc.tx.attachment.findMany({
    where: { objectType: "social_post", objectId: postId, deletedAt: null, mimeType: { startsWith: "image/" } },
    select: { id: true },
    orderBy: [{ uploadedAt: "asc" }, { id: "asc" }],
  });
  await nc.tx.socialPostMedia.deleteMany({ where: { postId } });
  let i = 0;
  for (const t of tep) {
    await nc.tx.socialPostMedia.create({ data: { tenantId: nc.tenantId, postId, attachmentId: t.id, position: i, role: i === 0 ? "featured" : "inline" } });
    i++;
  }
}

function docHenLuc(henLuc: string | null | undefined, bayGio: Date): Date {
  if (!henLuc) throw new LoiNghiepVu("Chọn giờ đăng.", 400, "thieu-gio");
  const d = new Date(henLuc);
  if (Number.isNaN(d.getTime())) throw new LoiNghiepVu("Giờ đăng không hợp lệ.", 400, "sai-gio");
  if (d.getTime() <= bayGio.getTime()) throw new LoiNghiepVu("Giờ hẹn đã qua — chọn giờ ở tương lai hoặc dùng “Đăng ngay”.", 422, "gio-da-qua");
  if (d.getTime() - bayGio.getTime() > 366 * 86_400_000) throw new LoiNghiepVu("Chỉ hẹn trong vòng một năm.", 422, "gio-qua-xa");
  return d;
}

/** Xếp hàng: mọi kênh của bài sang QUEUED tại `luc`. Bài sang SCHEDULED (luc ở tương lai) hoặc PUBLISHING. */
async function xepHang(nc: NguCanh, b: Bai, luc: Date, bayGio: Date) {
  const sang: TrangThaiBai = luc.getTime() > bayGio.getTime() ? "SCHEDULED" : "PUBLISHING";
  batBuocChuyen(b, sang, sang === "SCHEDULED" ? "hẹn giờ" : "đăng");
  await chupAnh(nc, b.id);
  await nc.tx.socialPostTarget.updateMany({
    where: { postId: b.id, status: { in: ["PENDING", "CANCELED"] } },
    // Giữ errorClass của lượt trước (nếu có): worker đối soát trước khi gửi (QĐ-200).
    data: { status: "QUEUED", nextAttemptAt: luc, attemptCount: 0, errorMessage: null, lockedBy: null, lockedAt: null },
  });
  await nc.tx.socialPost.update({ where: { id: b.id }, data: { status: sang, scheduledAt: luc, needsReschedule: false, updatedBy: nc.hoSo.userId } });
  return sang;
}

// ---------------------------------------------------------------------------
// Đăng ngay / hẹn giờ / hủy lịch / đăng lại / về nháp
// ---------------------------------------------------------------------------

async function truocKhiDang(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_post", objectId: id });
  const b = await layBai(nc, id, true);
  if (!["DRAFT", "APPROVED"].includes(b.status)) throw new LoiNghiepVu(`Bài đang “${b.status}” — không đăng / hẹn giờ được.`, 409, "sai-trang-thai");
  if ((await canDuyet(nc, b)) && b.status !== "APPROVED") {
    throw new LoiNghiepVu("Bài do AI tạo phải được duyệt trước khi đăng (Cấu hình “Bài do AI tạo phải duyệt”). Bấm “Gửi duyệt”.", 409, "can-duyet");
  }
  // Bài đã duyệt mà người khác sửa thì đã về nháp (suaBai) — nên APPROVED ở đây đúng là bản đã duyệt.
  await chupAnh(nc, id);
  const sau = await layBai(nc, id);
  kiemNoiDung(sau);
  return sau;
}

export async function dangNgay(nc: NguCanh, id: string, bayGio: Date = new Date()) {
  const b = await truocKhiDang(nc, id);
  await xepHang(nc, b, bayGio, bayGio);
  await nc.kiemToan({ action: "dang-ngay-bai-mxh", objectType: "social_post", objectId: id, after: { soKenh: b.targets.length } });
  await nc.suKien({ eventType: SU_KIEN.SOCIAL_POST_SCHEDULED, objectType: "social_post", objectId: id, payload: { cheDo: "ngay", soKenh: b.targets.length } });
  return chiTietBai(nc, id);
}

export async function henGio(nc: NguCanh, id: string, henLuc: string, bayGio: Date = new Date()) {
  const luc = docHenLuc(henLuc, bayGio);
  const b = await truocKhiDang(nc, id);
  await xepHang(nc, b, luc, bayGio);
  await nc.kiemToan({ action: "hen-gio-bai-mxh", objectType: "social_post", objectId: id, after: { henLuc: luc.toISOString(), soKenh: b.targets.length } });
  await nc.suKien({ eventType: SU_KIEN.SOCIAL_POST_SCHEDULED, objectType: "social_post", objectId: id, payload: { cheDo: "hen-gio", henLuc: luc.toISOString() } });
  return chiTietBai(nc, id);
}

/** Hủy lịch: chỉ khi chưa kênh nào bắt đầu đăng. */
export async function huyLich(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_post", objectId: id });
  // Khóa các dòng kênh TRƯỚC dòng bài — đúng thứ tự worker dùng (kênh-bài → bài), tránh deadlock lúc đúng giờ hẹn
  // (QA 0.23.0, QĐ-209). Worker đang giữ (đã nhận việc) thì chờ nó commit rồi mới thấy trạng thái thật.
  await nc.tx.$queryRaw`SELECT id FROM social_post_targets WHERE post_id = ${id}::uuid ORDER BY id FOR UPDATE`;
  const b = await layBai(nc, id, true);
  batBuocChuyen(b, "CANCELED", "hủy lịch");
  const kenh = await nc.tx.socialPostTarget.findMany({ where: { postId: id }, select: { status: true } });
  if (kenh.some((k) => !["QUEUED", "PENDING", "CANCELED"].includes(k.status))) {
    throw new LoiNghiepVu("Đã tới giờ, bài đang được đăng — không hủy được.", 409, "dang-dang");
  }
  await nc.tx.socialPostTarget.updateMany({ where: { postId: id, status: { in: ["QUEUED", "PENDING"] } }, data: { status: "CANCELED", nextAttemptAt: null } });
  await nc.tx.socialPost.update({ where: { id }, data: { status: "CANCELED", updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "huy-lich-bai-mxh", objectType: "social_post", objectId: id, before: { henLuc: b.scheduledAt?.toISOString() ?? null } });
  await nc.suKien({ eventType: SU_KIEN.SOCIAL_POST_CANCELED, objectType: "social_post", objectId: id, payload: {} });
  return chiTietBai(nc, id);
}

/** Đăng lại các kênh LỖI (lượt mới — đếm lần thử từ 0). Kênh đã đăng không bị đụng. */
export async function dangLai(nc: NguCanh, id: string, bayGio: Date = new Date()) {
  batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_post", objectId: id });
  const b = await layBai(nc, id, true);
  batBuocChuyen(b, "PUBLISHING", "đăng lại");
  const loi = b.targets.filter((t) => t.status === "FAILED");
  if (!loi.length) throw new LoiNghiepVu("Không có kênh lỗi để đăng lại.", 409, "khong-co-kenh-loi");
  for (const t of loi) {
    if (t.connection.disconnectedAt) throw new LoiNghiepVu(`Kênh “${t.connection.name}” đã ngắt.`, 409, "kenh-da-ngat");
    if (t.connection.status === "NEEDS_REAUTH") throw new LoiNghiepVu(`Kênh “${t.connection.name}” cần nhập lại mật khẩu ứng dụng trước (Mạng xã hội → Kênh).`, 409, "kenh-can-nhap-lai");
  }
  // Giữ errorClass của lượt trước: worker thấy có lỗi cũ thì ĐỐI SOÁT trước khi gửi (không đăng trùng nếu lượt trước đã lên).
  await nc.tx.socialPostTarget.updateMany({
    where: { id: { in: loi.map((t) => t.id) } },
    data: { status: "QUEUED", nextAttemptAt: bayGio, attemptCount: 0, lockedBy: null, lockedAt: null },
  });
  await nc.tx.socialPost.update({ where: { id }, data: { status: "PUBLISHING", updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "dang-lai-bai-mxh", objectType: "social_post", objectId: id, after: { soKenh: loi.length } });
  await nc.suKien({ eventType: SU_KIEN.SOCIAL_POST_SCHEDULED, objectType: "social_post", objectId: id, payload: { cheDo: "dang-lai", soKenh: loi.length } });
  return chiTietBai(nc, id);
}

export async function veNhap(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const b = await layBai(nc, id, true);
  if (!duocSoan(nc, b)) throw new LoiThieuQuyen("mxh.update", { objectType: "social_post", objectId: id });
  batBuocChuyen(b, "DRAFT", "chuyển về nháp");
  if (!veNhapDuoc(b)) {
    throw new LoiNghiepVu("Chỉ bài đã hủy, hoặc bài lỗi mà chưa kênh nào nhận bài (không có mã bài trên nền tảng), mới chuyển về nháp để sửa. Bài đã lên một phần: tạo bài mới cho kênh lỗi.", 409, "sai-trang-thai");
  }
  // Giữ loại lỗi cũ trên kênh: lần đăng sau sẽ đối soát trước khi gửi (QĐ-200).
  await nc.tx.socialPostTarget.updateMany({ where: { postId: id, status: { in: ["CANCELED", "FAILED"] } }, data: { status: "PENDING", nextAttemptAt: null } });
  await nc.tx.socialPost.update({ where: { id }, data: { status: "DRAFT", approvedBy: null, approvedAt: null, scheduledAt: null, needsReschedule: false, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "ve-nhap-bai-mxh", objectType: "social_post", objectId: id });
  return chiTietBai(nc, id);
}

// ---------------------------------------------------------------------------
// Duyệt (MXH-20 → MXH-26)
// ---------------------------------------------------------------------------

/**
 * Người duyệt hợp lệ (luật tương đương QĐ-154 của Công việc, QĐ-197): có `mxh.approve`; KHÔNG là người soạn hay người
 * gửi duyệt (không tự duyệt — CHECK trong CSDL chặn thêm); và là cấp trên trong chuỗi quản lý của người soạn, hoặc Giám
 * đốc / Quản trị, hoặc người soạn nằm trong phạm vi `mxh.approve` của người duyệt.
 */
export async function nguoiDuyetHopLe(nc: NguCanh, b: { createdBy: string; submittedBy: string | null; coAuthorIds?: string[] }): Promise<{ ok: true } | { ok: false; lyDo: string }> {
  if (!coQuyen(nc.hoSo, "mxh.approve")) return { ok: false, lyDo: "Bạn không có quyền duyệt bài mạng xã hội." };
  const toi = nc.hoSo.userId;
  if (toi === b.createdBy || toi === b.submittedBy) return { ok: false, lyDo: "Không tự duyệt bài mình soạn hoặc mình gửi duyệt — cần người khác duyệt." };
  // QA 0.23.0 (QĐ-203): sửa nội dung / ảnh sau khi bài đã gửi duyệt = đồng tác giả. CHECK CSDL chặn thêm.
  if (b.coAuthorIds?.includes(toi)) return { ok: false, lyDo: "Bạn đã sửa nội dung bài sau khi bài được gửi duyệt — là đồng tác giả, cần người khác duyệt." };
  if (await duyetDuocNguoiSoan(nc.tx, nc.hoSo, b.createdBy)) return { ok: true };
  return { ok: false, lyDo: "Người soạn không thuộc phạm vi duyệt của bạn (cần cấp trên của họ, Giám đốc hoặc Quản trị)." };
}

/**
 * Gửi duyệt. `cheDo`: "ngay" (duyệt xong đăng luôn), "hen-gio" (duyệt xong hẹn đúng giờ đã chọn), "khong" (duyệt xong để
 * người có quyền đăng chọn giờ). Báo những người giữ `mxh.approve` (trừ người soạn / người gửi).
 */
export async function guiDuyet(nc: NguCanh, id: string, d: z.infer<typeof LuocDoGuiDuyet>, bayGio: Date = new Date()) {
  batBuocQuyen(nc.hoSo, "mxh.create", { objectType: "social_post", objectId: id });
  const b = await layBai(nc, id, true);
  if (!duocSoan(nc, b)) throw new LoiThieuQuyen("mxh.update", { objectType: "social_post", objectId: id });
  batBuocChuyen(b, "PENDING_APPROVAL", "gửi duyệt");
  if (b.status !== "DRAFT") throw new LoiNghiepVu("Chỉ gửi duyệt bài nháp.", 409, "sai-trang-thai");
  const luc = d.cheDo === "hen-gio" ? docHenLuc(d.henLuc, bayGio) : null;
  await chupAnh(nc, id);
  kiemNoiDung(await layBai(nc, id));
  await nc.tx.socialPost.update({
    where: { id },
    data: { status: "PENDING_APPROVAL", submittedBy: nc.hoSo.userId, submittedAt: bayGio, publishMode: d.cheDo === "khong" ? null : d.cheDo, scheduledAt: luc, reviewNote: null, updatedBy: nc.hoSo.userId },
  });
  await nc.tx.socialPostReview.create({ data: { tenantId: nc.tenantId, postId: id, action: "gui-duyet", actorId: nc.hoSo.userId, note: d.cheDo === "hen-gio" ? `Hẹn ${luc!.toISOString()}` : d.cheDo === "ngay" ? "Đăng ngay khi duyệt" : null } });
  const nguoiNhan = (await nguoiGiuQuyen(nc.tx, "mxh.approve", true)).filter((u) => u !== b.createdBy && u !== nc.hoSo.userId);
  const hoatDong = await nc.tx.user.findMany({ where: { id: { in: nguoiNhan }, status: "hoat-dong", isSystem: false }, select: { id: true } });
  for (const u of hoatDong) {
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: u.id, loai: "mxh-cho-duyet", tieuDe: `Bài mạng xã hội chờ duyệt: ${b.title ?? b.body.slice(0, 60)}`,
      duongDan: `/mang-xa-hoi/bai/${id}`, doiTuong: "social_post", doiTuongId: id, khoaChongTrung: `mxh-cho-duyet:${id}:${b.revision}`,
    });
  }
  await nc.kiemToan({ action: "gui-duyet-bai-mxh", objectType: "social_post", objectId: id, after: { cheDo: d.cheDo, henLuc: luc?.toISOString() ?? null } });
  await nc.suKien({ eventType: SU_KIEN.SOCIAL_POST_SUBMITTED, objectType: "social_post", objectId: id, payload: { cheDo: d.cheDo } });
  return chiTietBai(nc, id);
}

export async function rutDuyet(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "mxh.create", { objectType: "social_post", objectId: id });
  const b = await layBai(nc, id, true);
  if (b.status !== "PENDING_APPROVAL") throw new LoiNghiepVu("Bài không ở trạng thái chờ duyệt.", 409, "sai-trang-thai");
  if (b.createdBy !== nc.hoSo.userId && b.submittedBy !== nc.hoSo.userId) throw new LoiThieuQuyen("mxh.update", { objectType: "social_post", objectId: id });
  await nc.tx.socialPost.update({ where: { id }, data: { status: "DRAFT", updatedBy: nc.hoSo.userId } });
  await nc.tx.socialPostReview.create({ data: { tenantId: nc.tenantId, postId: id, action: "rut", actorId: nc.hoSo.userId } });
  await nc.kiemToan({ action: "rut-duyet-bai-mxh", objectType: "social_post", objectId: id });
  return chiTietBai(nc, id);
}

/** Danh sách "Chờ tôi duyệt": bài chờ duyệt mà tôi là người duyệt hợp lệ. */
export async function danhSachChoDuyet(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "mxh.approve");
  const ds = await nc.tx.socialPost.findMany({
    where: { status: "PENDING_APPROVAL", deletedAt: null },
    include: {
      targets: { include: { connection: { select: { id: true, name: true, platform: true, status: true, disconnectedAt: true, externalId: true } } } },
      media: { include: { attachment: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } } } },
    },
    orderBy: [{ submittedAt: "asc" }, { id: "asc" }],
    take: 200,
  });
  const ten = await tenNguoi(nc, ds.flatMap((b) => [b.createdBy, b.submittedBy]));
  const kq = [];
  for (const b of ds) {
    if ((await nguoiDuyetHopLe(nc, b)).ok) kq.push({ ...baiRa(b), nguoiSoan: ten.get(b.createdBy) ?? "—", nguoiGuiDuyet: b.submittedBy ? ten.get(b.submittedBy) ?? "—" : null });
  }
  return kq;
}

export async function duyetBai(nc: NguCanh, id: string, ghiChu: string | null = null, bayGio: Date = new Date()) {
  batBuocQuyen(nc.hoSo, "mxh.approve", { objectType: "social_post", objectId: id });
  const b = await layBai(nc, id, true);
  if (b.status !== "PENDING_APPROVAL") throw new LoiNghiepVu("Bài không ở trạng thái chờ duyệt.", 409, "sai-trang-thai");
  const hl = await nguoiDuyetHopLe(nc, b);
  if (!hl.ok) throw new LoiNghiepVu(hl.lyDo, 403, "khong-duoc-duyet");
  kiemNoiDung(b);
  // Duyệt xong chạy tiếp đúng ý người gửi: hẹn giờ (giờ còn ở tương lai) hoặc đăng ngay. QA 0.23.0 (QĐ-206): giờ hẹn đã
  // qua lúc duyệt — trễ ≤ `mxh.tre_hen_toi_da_phut` thì đăng ngay; trễ hơn thì "Đã duyệt – cần hẹn lại giờ" + báo người soạn.
  const treMs = b.publishMode === "hen-gio" && b.scheduledAt ? bayGio.getTime() - b.scheduledAt.getTime() : 0;
  const canHenLai = treMs > 0 && treMs > (await docCauHinhMxh(nc.tx)).treHenToiDaPhut * 60_000;
  await nc.tx.socialPost.update({ where: { id }, data: { status: "APPROVED", approvedBy: nc.hoSo.userId, approvedAt: bayGio, reviewNote: ghiChu, needsReschedule: canHenLai, updatedBy: nc.hoSo.userId } });
  await nc.tx.socialPostReview.create({ data: { tenantId: nc.tenantId, postId: id, action: "duyet", actorId: nc.hoSo.userId, note: ghiChu } });
  let sang: TrangThaiBai = "APPROVED";
  if (b.publishMode && !canHenLai) {
    const sau = await layBai(nc, id);
    const luc = b.publishMode === "hen-gio" && b.scheduledAt && b.scheduledAt.getTime() > bayGio.getTime() ? b.scheduledAt : bayGio;
    sang = await xepHang(nc, sau, luc, bayGio);
  }
  if (canHenLai) {
    for (const u of new Set([b.createdBy, b.submittedBy ?? b.createdBy])) {
      await taoThongBao(nc.tx, nc.tenantId, {
        nguoiNhanId: u, loai: "mxh-can-hen-lai", mucDo: "canh-bao", tieuDe: `Bài đã duyệt nhưng giờ hẹn đã qua — cần hẹn lại giờ: ${b.title ?? b.body.slice(0, 60)}`,
        noiDung: `Giờ hẹn ${b.scheduledAt!.toISOString()} đã trễ ${Math.round(treMs / 60_000)} phút lúc duyệt (quá ngưỡng Cấu hình “Duyệt trễ giờ hẹn tối đa”). Người có quyền đăng chọn giờ mới hoặc bấm Đăng ngay.`,
        duongDan: `/mang-xa-hoi/bai/${id}`, doiTuong: "social_post", doiTuongId: id, khoaChongTrung: `mxh-can-hen-lai:${id}:${b.revision}`,
      });
    }
  }
  await taoThongBao(nc.tx, nc.tenantId, {
    nguoiNhanId: b.submittedBy ?? b.createdBy, loai: "mxh-da-duyet", tieuDe: `Bài đã được duyệt: ${b.title ?? b.body.slice(0, 60)}`,
    duongDan: `/mang-xa-hoi/bai/${id}`, doiTuong: "social_post", doiTuongId: id, khoaChongTrung: `mxh-da-duyet:${id}:${b.revision}`,
  });
  await nc.kiemToan({ action: "duyet-bai-mxh", objectType: "social_post", objectId: id, after: { trangThai: sang, ghiChu, canHenLai } });
  await nc.suKien({ eventType: SU_KIEN.SOCIAL_POST_REVIEWED, objectType: "social_post", objectId: id, payload: { ketQua: "duyet", trangThai: sang } });
  return chiTietBai(nc, id);
}

export async function traLaiBai(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "mxh.approve", { objectType: "social_post", objectId: id });
  const b = await layBai(nc, id, true);
  if (b.status !== "PENDING_APPROVAL") throw new LoiNghiepVu("Bài không ở trạng thái chờ duyệt.", 409, "sai-trang-thai");
  const hl = await nguoiDuyetHopLe(nc, b);
  if (!hl.ok) throw new LoiNghiepVu(hl.lyDo, 403, "khong-duoc-duyet");
  await nc.tx.socialPost.update({ where: { id }, data: { status: "DRAFT", reviewNote: lyDo, approvedBy: null, approvedAt: null, needsReschedule: false, updatedBy: nc.hoSo.userId } });
  await nc.tx.socialPostReview.create({ data: { tenantId: nc.tenantId, postId: id, action: "tra-lai", actorId: nc.hoSo.userId, note: lyDo } });
  await taoThongBao(nc.tx, nc.tenantId, {
    nguoiNhanId: b.createdBy, loai: "mxh-tra-lai", mucDo: "canh-bao", tieuDe: `Bài bị trả lại: ${b.title ?? b.body.slice(0, 60)}`, noiDung: lyDo,
    duongDan: `/mang-xa-hoi/bai/${id}`, doiTuong: "social_post", doiTuongId: id, khoaChongTrung: `mxh-tra-lai:${id}:${b.revision}`,
  });
  await nc.kiemToan({ action: "tra-lai-bai-mxh", objectType: "social_post", objectId: id, after: { lyDo } });
  await nc.suKien({ eventType: SU_KIEN.SOCIAL_POST_REVIEWED, objectType: "social_post", objectId: id, payload: { ketQua: "tra-lai" } });
  return chiTietBai(nc, id);
}

/** Nhật ký gọi nền tảng của một bài (bằng chứng — mục 9.2 tài liệu gốc). */
export async function nhatKyDang(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const b = await layBai(nc, id);
  const ds = await nc.tx.socialPublishAttempt.findMany({ where: { targetId: { in: b.targets.map((t) => t.id) } }, orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }], take: 500 });
  const tenKenh = new Map(b.targets.map((t) => [t.id, t.connection.name]));
  return ds.map((a) => ({ id: a.id, kenh: tenKenh.get(a.targetId) ?? "—", lan: a.attemptNo, buoc: a.kind, ketQua: a.outcome, loaiLoi: a.errorClass, http: a.httpStatus, thongBao: a.message, batDau: a.startedAt, ketThuc: a.finishedAt }));
}

/** Xuất CSV danh sách bài (mxh.export). */
export async function xuatCsvBai(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "mxh.export");
  const ds = await nc.tx.socialPost.findMany({
    where: { AND: [{ deletedAt: null }, await dieuKienXemBai(nc)] },
    include: { targets: { include: { connection: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  await nc.kiemToan({ action: "xuat-csv", objectType: "social_post", after: { soDong: ds.length } });
  // QA 0.23.0: qua taoCsv — chống chèn công thức (CSV-01): tiêu đề "=HYPERLINK(…)" không được chạy khi mở bằng Excel.
  const dong: (string | null)[][] = [];
  for (const b of ds) for (const t of b.targets.length ? b.targets : [null]) {
    dong.push([b.title ?? b.body.slice(0, 80), b.status, gioVietNamCsv(b.scheduledAt), t?.connection.name ?? "", t?.status ?? "", t?.status === "PUBLISHED" ? t.externalUrl : ""]);
  }
  return taoCsv(["Tiêu đề", "Trạng thái", "Hẹn lúc (giờ Việt Nam)", "Kênh", "Trạng thái kênh", "Link đã xác minh"], dong);
}

/** "2026-12-07 09:00 +07:00" — giờ Việt Nam ghi rõ múi giờ (QA 0.23.0, QĐ-209). VN không có giờ mùa hè. */
export function gioVietNamCsv(d: Date | null | undefined): string {
  return d ? `${new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 16).replace("T", " ")} +07:00` : "";
}
