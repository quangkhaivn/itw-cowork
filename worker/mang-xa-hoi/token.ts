import { voiTenant, type ClientTenant } from "../../src/lib/db";
import { ghiKiemToan } from "../../src/lib/kiem-toan";
import { aadKenh } from "../../src/modules/mang-xa-hoi/bao-mat/khoa-chu";
import { niemPhong } from "../../src/modules/mang-xa-hoi/bao-mat/niem-phong";
import { docCauHinhMxh } from "../../src/modules/mang-xa-hoi/chung";
import { layConnector } from "../../src/modules/mang-xa-hoi/connectors/danh-muc";
import type { LoiPhanLoai, ThongTinAppGoi, ThongTinXacThuc } from "../../src/modules/mang-xa-hoi/connectors/kieu";
import { lamMoiTokenGoogle } from "../../src/modules/mang-xa-hoi/connectors/oauth-mang";
import { GRAPH_VERSION_MAC_DINH, TEN_NEN_TANG, type NhaCungCapApp } from "../../src/modules/mang-xa-hoi/hang-so";
import { nguoiGiuQuyen, taoThongBao } from "../../src/modules/thong-bao/service";
import { moNiemPhong } from "./giai-ma";
import { docThongTinApp } from "./kiem-tra";

/**
 * Token kênh OAuth ở worker (0.24.0, QĐ-210): mở niêm phong, làm mới token Google TRƯỚC HẠN (≤ 5 phút còn lại khi dùng,
 * ≤ 10 phút với vòng làm mới chủ động), niêm phong lại bằng data key mới; hết hạn / bị thu hồi → kênh NEEDS_REAUTH +
 * báo Marketing (người giữ `mxh.update`) + nút "Kết nối lại" trên màn hình Kênh.
 */

export interface KenhToken {
  id: string;
  platform: string;
  name: string;
  authType: string;
  oauthProvider: string | null;
}

export interface DongNiemPhong {
  ciphertext: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  authTag: Uint8Array<ArrayBuffer>;
  wrappedKey: Uint8Array<ArrayBuffer>;
  keyVersion: number;
}

export type KetQuaMoXt = { ok: true; xt: ThongTinXacThuc; app: ThongTinAppGoi } | { ok: false; loi: LoiPhanLoai; canKetNoiLai: boolean };

const CON_LAI_KHI_DUNG_MS = 5 * 60_000;
const CON_LAI_LAM_MOI_MS = 10 * 60_000;

/** Đánh dấu kênh cần kết nối lại + báo Marketing (người giữ mxh.update). Chống trùng theo kênh / ngày. */
export async function danhDauCanKetNoiLai(tx: ClientTenant, tenantId: string, kenh: KenhToken, thongBao: string, bayGio: Date): Promise<void> {
  await tx.socialConnection.update({ where: { id: kenh.id }, data: { status: "NEEDS_REAUTH", lastCheckOk: false, lastCheckMessage: thongBao, lastCheckedAt: bayGio } });
  await ghiKiemToan(tx, { action: "kenh-can-ket-noi-lai", objectType: "social_connection", objectId: kenh.id, after: { nenTang: kenh.platform, lyDo: thongBao.slice(0, 200), boi: "worker" } });
  const nguoi = await nguoiGiuQuyen(tx, "mxh.update", true);
  const hoatDong = await tx.user.findMany({ where: { id: { in: nguoi }, status: "hoat-dong", isSystem: false }, select: { id: true } });
  const ngay = bayGio.toISOString().slice(0, 10);
  const oauth = kenh.authType === "oauth";
  for (const u of hoatDong) {
    await taoThongBao(tx, tenantId, {
      nguoiNhanId: u.id, loai: "mxh-kenh-can-ket-noi-lai", mucDo: "canh-bao",
      tieuDe: `Kênh ${TEN_NEN_TANG[kenh.platform] ?? kenh.platform} “${kenh.name}” cần ${oauth ? "kết nối lại" : "nhập lại mật khẩu ứng dụng"}`,
      noiDung: `${thongBao} — Vào Mạng xã hội → Kênh, bấm “${oauth ? "Kết nối lại" : "Nhập lại mật khẩu"}”.`,
      duongDan: "/mang-xa-hoi/kenh", doiTuong: "social_connection", doiTuongId: kenh.id, khoaChongTrung: `mxh-ket-noi-lai:${kenh.id}:${ngay}`,
    });
  }
}

async function luuTokenMoi(tenantId: string, connectionId: string, xt: ThongTinXacThuc, hetHan: Date, bayGio: Date) {
  const bn = niemPhong(JSON.stringify(xt), aadKenh(tenantId, connectionId));
  await voiTenant(tenantId, async (tx) => {
    await tx.socialCredential.update({ where: { connectionId }, data: { ...bn, tokenExpiresAt: hetHan, refreshedAt: bayGio } });
    await ghiKiemToan(tx, { action: "lam-moi-token-mxh", objectType: "social_connection", objectId: connectionId, after: { hetHan: hetHan.toISOString(), phienBanKhoa: bn.keyVersion, boi: "worker" } });
  });
}

/**
 * Mở thông tin xác thực của một kênh cho lần gọi nền tảng. Kênh OAuth: kèm thông tin app (Graph version + App Secret cho
 * appsecret_proof); Google: làm mới access token nếu còn < `conLaiMs`.
 */
export async function moXtKenh(tenantId: string, kenh: KenhToken, dong: DongNiemPhong, bayGio: Date, hanMs: number, env: NodeJS.ProcessEnv = process.env, conLaiMs = CON_LAI_KHI_DUNG_MS): Promise<KetQuaMoXt> {
  let xt: ThongTinXacThuc;
  try {
    xt = JSON.parse(moNiemPhong(dong, aadKenh(tenantId, kenh.id), env)) as ThongTinXacThuc;
  } catch (e) {
    const thongBao = e instanceof Error && e.name === "LoiKhoaChuMxh" ? e.message : "Không mở được bí mật của kênh (SOCIAL_MASTER_KEY không khớp lúc lưu?). Báo quản trị máy chủ.";
    return { ok: false, canKetNoiLai: false, loi: { loai: "RETRYABLE", ma: "khoa-chu", thongBao, httpStatus: null } };
  }
  if (kenh.authType !== "oauth") return { ok: true, xt, app: {} };
  const ncc = (kenh.oauthProvider ?? "META") as NhaCungCapApp;
  let tt: Awaited<ReturnType<typeof docThongTinApp>>;
  try {
    tt = await docThongTinApp(tenantId, ncc, env);
  } catch {
    tt = null;
  }
  if (!tt) return { ok: false, canKetNoiLai: false, loi: { loai: "RETRYABLE", ma: "thieu-thong-tin-app", thongBao: `Chưa có (hoặc không mở được) thông tin app ${ncc === "META" ? "Meta" : "Google"} — Giám đốc / Quản trị nhập ở Quản trị → Kết nối nền tảng (API).`, httpStatus: null } };
  if (ncc === "META") return { ok: true, xt, app: { graphVersion: tt.cong.graphVersion || GRAPH_VERSION_MAC_DINH, appSecret: tt.biMat } };

  const hetHan = xt.hetHan ? Date.parse(xt.hetHan) : 0;
  if (xt.accessToken && hetHan - bayGio.getTime() > conLaiMs) return { ok: true, xt, app: {} };
  if (!xt.refreshToken) return { ok: false, canKetNoiLai: true, loi: { loai: "NEEDS_REAUTH", ma: "khong-co-refresh-token", thongBao: "Kênh Google không có refresh token — kết nối lại.", httpStatus: null } };
  const r = await lamMoiTokenGoogle({ clientId: tt.cong.clientId ?? "", clientSecret: tt.biMat, refreshToken: xt.refreshToken, hanMs, bayGio });
  if (!r.ok) return { ok: false, canKetNoiLai: r.loai === "NEEDS_REAUTH", loi: { loai: r.loai, ma: r.ma, thongBao: r.thongBao, httpStatus: null } };
  const moi: ThongTinXacThuc = { loai: "google", accessToken: r.giaTri.accessToken, refreshToken: r.giaTri.refreshToken ?? xt.refreshToken, hetHan: r.giaTri.hetHan.toISOString() };
  await luuTokenMoi(tenantId, kenh.id, moi, r.giaTri.hetHan, bayGio);
  return { ok: true, xt: moi, app: {} };
}

/**
 * Vòng làm mới chủ động: kênh Google còn < 10 phút → làm mới; kênh Meta chưa kiểm trong 24 giờ → đọc thử Page / tài
 * khoản (token Page không hết hạn cố định nhưng bị vô hiệu khi đổi mật khẩu / gỡ quyền). Hỏng vì quyền → NEEDS_REAUTH.
 */
export async function lamMoiTokenDenHan(tenantId: string, bayGio: Date, env: NodeJS.ProcessEnv = process.env): Promise<{ lamMoi: number; canKetNoiLai: number }> {
  const ds = await voiTenant(tenantId, async (tx) => ({
    google: await tx.socialConnection.findMany({
      where: { authType: "oauth", oauthProvider: "GOOGLE", status: "ACTIVE", disconnectedAt: null, credential: { tokenExpiresAt: { lt: new Date(bayGio.getTime() + CON_LAI_LAM_MOI_MS) } } },
      include: { credential: true }, take: 20,
    }),
    meta: await tx.socialConnection.findMany({
      where: { authType: "oauth", oauthProvider: "META", status: "ACTIVE", disconnectedAt: null, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(bayGio.getTime() - 86_400_000) } }] },
      include: { credential: true }, take: 20,
    }),
    hanMs: (await docCauHinhMxh(tx)).hanGoiMs,
  }));
  let lamMoi = 0;
  let can = 0;
  for (const k of [...ds.google, ...ds.meta]) {
    if (!k.credential) continue;
    const r = await moXtKenh(tenantId, k, k.credential, bayGio, ds.hanMs, env, CON_LAI_LAM_MOI_MS);
    if (!r.ok) {
      if (r.canKetNoiLai) {
        await voiTenant(tenantId, (tx) => danhDauCanKetNoiLai(tx, tenantId, k, r.loi.thongBao, bayGio));
        can++;
      }
      continue;
    }
    if (k.oauthProvider === "GOOGLE") {
      lamMoi++;
      continue;
    }
    const c = layConnector(k.platform);
    if (!c) continue;
    const kq = await c.kiemTraKetNoi({ id: k.id, diaChi: k.externalId, tenDangNhap: k.accountName, meta: (k.meta ?? {}) as Record<string, unknown> }, r.xt, { hanMs: ds.hanMs, app: r.app });
    if (!kq.ok && kq.loai === "NEEDS_REAUTH") {
      await voiTenant(tenantId, (tx) => danhDauCanKetNoiLai(tx, tenantId, k, kq.thongBao, bayGio));
      can++;
    } else {
      await voiTenant(tenantId, (tx) => tx.socialConnection.update({ where: { id: k.id }, data: { lastCheckedAt: bayGio, lastCheckOk: kq.ok, lastCheckMessage: kq.thongBao } }));
    }
  }
  return { lamMoi, canKetNoiLai: can };
}
