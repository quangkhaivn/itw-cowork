import type { NguCanh } from "@/lib/api";
import { LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { aadOAuth, trangThaiKhoaChu } from "./bao-mat/khoa-chu";
import { niemPhong } from "./bao-mat/niem-phong";
import { gocApi } from "./connectors/goc-api";
import { layConnector } from "./connectors/danh-muc";
import { GRAPH_VERSION_MAC_DINH, NHAN_KHA_DUNG, TEN_NEN_TANG, type KhaDung } from "./hang-so";
import { BIEN_MOI_TRUONG } from "./nen-tang-app";
import { bamState, HAN_STATE_MS, NHA_CUNG_CAP_OAUTH, QUYEN_XIN, sinhState, TEN_OAUTH, urlDangNhapGoogle, urlDangNhapMeta, type NhaCungCapOAuth } from "./oauth-thuan";

/**
 * Kết nối kênh bằng OAuth (0.24.0, QĐ-210) — phía ứng dụng web. KHÔNG có bí mật nào được mở ở đây (SEC-06):
 *
 *  1. `batDauOAuth`: người có `mxh.update` bấm “Tiếp tục” trên màn hình đồng ý của Cowork → sinh `state` ngẫu nhiên (CSDL
 *     chỉ giữ MÃ BĂM), hạn 10 phút, gắn phiên + người + doanh nghiệp; Redirect URI dựng từ APP_URL (không bao giờ từ
 *     tham số / host của yêu cầu) → trả URL hộp thoại của nền tảng.
 *  2. `nhanCallbackOAuth`: nền tảng chuyển về `/api/cong-khai/mxh/oauth/<nền tảng>/callback` (kèm cookie phiên — SameSite
 *     Lax). Kiểm: state tồn tại, đúng nền tảng, đúng đường callback, đúng người + phiên, CHƯA dùng, CHƯA hết hạn → đánh dấu
 *     đã dùng (cập nhật có điều kiện — hai lần gọi cùng lúc chỉ một lần qua) và NIÊM PHONG mã `code`.
 *  3. Worker mở mã, đổi lấy token (cần App Secret), lấy Page / Instagram / kênh YouTube → "kênh chờ chọn", token niêm
 *     phong với AAD của kênh SẼ tạo.
 *  4. `chonKenhOAuth`: người dùng chọn → tạo / cập nhật kênh bằng cách CHÉP bản niêm phong; kênh không chọn bị xóa token.
 */

export function batBuocNhaCungCapOAuth(x: string): NhaCungCapOAuth {
  const u = x.toUpperCase();
  if ((NHA_CUNG_CAP_OAUTH as readonly string[]).includes(u)) return u as NhaCungCapOAuth;
  throw new LoiNghiepVu("Nền tảng không kết nối bằng OAuth.", 404, "khong-tim-thay");
}

const NEN_TANG_CUA: Record<NhaCungCapOAuth, string[]> = { META: ["FACEBOOK_PAGE", "INSTAGRAM"], GOOGLE: ["YOUTUBE"] };

function goc(): string {
  return (process.env.APP_URL ?? "").trim().replace(/\/+$/, "");
}

/** Redirect URI CỐ ĐỊNH theo APP_URL — đúng chuỗi phải dán sang Meta / Google (urlCanDan). */
export function redirectUri(ncc: NhaCungCapOAuth): string {
  const g = goc();
  if (!g) throw new LoiNghiepVu("Máy chủ chưa đặt APP_URL (địa chỉ Cowork) — không dựng được Redirect URI. Báo quản trị máy chủ.", 503, "thieu-app-url");
  let u: URL;
  try {
    u = new URL(g);
  } catch {
    throw new LoiNghiepVu("APP_URL không hợp lệ.", 503, "thieu-app-url");
  }
  const cucBo = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  if (u.protocol !== "https:" && !cucBo) throw new LoiNghiepVu("Meta / Google chỉ nhận Redirect URI https — APP_URL của Cowork phải là https://…", 503, "can-https");
  return `${g}/api/cong-khai/mxh/oauth/${ncc.toLowerCase()}/callback`;
}

/** Thông tin app KHÔNG bí mật cần cho URL đăng nhập + máy chủ có bí mật chưa (không mở bí mật). */
async function thongTinAppCongKhai(nc: NguCanh, ncc: NhaCungCapOAuth) {
  const d = await nc.tx.socialAppConfig.findFirst({ where: { provider: ncc } });
  const cong = (d?.publicConfig ?? {}) as Record<string, string>;
  const b = BIEN_MOI_TRUONG[ncc];
  const coManHinh = Boolean(d?.ciphertext) && Boolean(ncc === "GOOGLE" ? cong.clientId : cong.appId);
  const coMayChu = Boolean(process.env[b.ma]?.trim() && process.env[b.biMat]?.trim());
  if (!coManHinh && !coMayChu) {
    throw new LoiNghiepVu(`Chưa nhập thông tin app ${TEN_OAUTH[ncc]}. Giám đốc / Quản trị vào Quản trị → Kết nối nền tảng (API) để nhập trước.`, 409, "chua-cau-hinh-app");
  }
  if (coManHinh) return { ma: ncc === "GOOGLE" ? cong.clientId : cong.appId, graphVersion: cong.graphVersion || GRAPH_VERSION_MAC_DINH, configId: cong.configId || null };
  return { ma: process.env[b.ma]!.trim(), graphVersion: cong.graphVersion || GRAPH_VERSION_MAC_DINH, configId: cong.configId || null };
}

async function batBuocCoNenTangDungDuoc(nc: NguCanh, ncc: NhaCungCapOAuth) {
  const ds = await nc.tx.socialConnectorSetting.findMany({ where: { platform: { in: NEN_TANG_CUA[ncc] } } });
  const dung = ds.filter((d) => d.availability === "AVAILABLE" && d.enabled && layConnector(d.platform));
  if (!dung.length) {
    const d = ds[0];
    throw new LoiNghiepVu(`${TEN_OAUTH[ncc]}: ${d ? NHAN_KHA_DUNG[d.availability as KhaDung] ?? d.availability : "chưa hỗ trợ"}.`, 409, "nen-tang-chua-ho-tro");
  }
  return dung.map((d) => d.platform);
}

/** Màn hình đồng ý của Cowork: tên nền tảng, quyền xin + giải thích, Redirect URI, kênh sẽ kết nối lại (nếu có). */
export async function manHinhDongY(nc: NguCanh, nccNhap: string, kenhId: string | null) {
  batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_connection" });
  const ncc = batBuocNhaCungCapOAuth(nccNhap);
  let loi: string | null = null;
  let nenTang: string[] = [];
  try {
    nenTang = await batBuocCoNenTangDungDuoc(nc, ncc);
    await thongTinAppCongKhai(nc, ncc);
    redirectUri(ncc);
  } catch (e) {
    loi = e instanceof LoiNghiepVu ? e.message : "Không bắt đầu kết nối được.";
  }
  const kenh = kenhId ? await nc.tx.socialConnection.findFirst({ where: { id: kenhId, disconnectedAt: null }, select: { id: true, name: true, platform: true } }) : null;
  return {
    nhaCungCap: ncc,
    ten: TEN_OAUTH[ncc],
    nenTang: nenTang.map((p) => TEN_NEN_TANG[p] ?? p),
    quyen: QUYEN_XIN[ncc],
    kenhKetNoiLai: kenh ? { id: kenh.id, ten: kenh.name, nenTang: TEN_NEN_TANG[kenh.platform] ?? kenh.platform } : null,
    loi,
  };
}

export async function batDauOAuth(nc: NguCanh, nccNhap: string, d: { kenhId?: string | null }, sessionRef: string, bayGio: Date = new Date()) {
  batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_connection" });
  const ncc = batBuocNhaCungCapOAuth(nccNhap);
  const k = trangThaiKhoaChu();
  if (!k.coKhoa) throw new LoiNghiepVu(k.loi ?? "Máy chủ chưa đặt SOCIAL_MASTER_KEY.", 503, "thieu-social-master-key");
  await batBuocCoNenTangDungDuoc(nc, ncc);
  const app = await thongTinAppCongKhai(nc, ncc);
  const ru = redirectUri(ncc);
  if (d.kenhId) {
    const kenh = await nc.tx.socialConnection.findFirst({ where: { id: d.kenhId, disconnectedAt: null }, select: { platform: true } });
    if (!kenh) throw new LoiKhongTimThay("Kênh");
    if (!NEN_TANG_CUA[ncc].includes(kenh.platform)) throw new LoiNghiepVu("Kênh này không kết nối qua nền tảng đó.", 409, "sai-nen-tang");
  }
  const state = sinhState();
  const scopes = QUYEN_XIN[ncc].map((q) => q.ma);
  const yc = await nc.tx.socialOauthRequest.create({
    data: {
      tenantId: nc.tenantId, userId: nc.hoSo.userId, provider: ncc, sessionRef, stateHash: bamState(state), redirectUri: ru, scopes,
      reconnectConnectionId: d.kenhId ?? null, status: "CHO_DONG_Y", createdAt: bayGio, expiresAt: new Date(bayGio.getTime() + HAN_STATE_MS),
    },
    select: { id: true },
  });
  const url = ncc === "META"
    ? urlDangNhapMeta({ goc: gocApi().facebookWeb, appId: app.ma, graphVersion: app.graphVersion, redirectUri: ru, state, scopes, configId: app.configId })
    : urlDangNhapGoogle({ goc: gocApi().googleAuth, clientId: app.ma, redirectUri: ru, state, scopes });
  await nc.kiemToan({ action: "bat-dau-ket-noi-oauth", objectType: "social_oauth_request", objectId: yc.id, after: { nenTang: ncc, ketNoiLai: d.kenhId ?? null } });
  return { yeuCauId: yc.id, url };
}

export type KetQuaCallback = { ok: true; yeuCauId: string } | { ok: false; ma: string; thongBao: string; yeuCauId?: string };

/**
 * Nhận callback. `duongDan` = pathname thật của yêu cầu (so khớp CHÍNH XÁC với Redirect URI đã dùng). Không ném lỗi
 * nghiệp vụ — trả kết quả để route chuyển hướng về màn hình Kênh kèm lời giải thích.
 */
export async function nhanCallbackOAuth(nc: NguCanh, nccNhap: string, q: { code?: string | null; state?: string | null; error?: string | null; error_description?: string | null }, sessionRef: string, duongDan: string, bayGio: Date = new Date()): Promise<KetQuaCallback> {
  let ncc: NhaCungCapOAuth;
  try {
    ncc = batBuocNhaCungCapOAuth(nccNhap);
  } catch {
    return { ok: false, ma: "sai-nen-tang", thongBao: "Đường quay về không hợp lệ." };
  }
  if (!q.state || q.state.length > 200) return { ok: false, ma: "thieu-state", thongBao: "Thiếu mã chống giả mạo (state) — bắt đầu kết nối lại từ màn hình Kênh." };
  const yc = await nc.tx.socialOauthRequest.findFirst({ where: { stateHash: bamState(q.state) } });
  if (!yc) {
    await nc.kiemToan({ action: "callback-oauth-tu-choi", objectType: "social_oauth_request", after: { nenTang: ncc, lyDo: "state-sai" } });
    return { ok: false, ma: "state-sai", thongBao: "Mã chống giả mạo (state) không đúng — có thể liên kết bị sửa. Bắt đầu kết nối lại từ màn hình Kênh." };
  }
  const huy = async (ma: string, thongBao: string, trangThai: "LOI" | "HET_HAN" = "LOI") => {
    // Đốt state: dùng một lần, kể cả khi hỏng.
    await nc.tx.socialOauthRequest.updateMany({ where: { id: yc.id, status: "CHO_DONG_Y" }, data: { status: trangThai, errorMessage: thongBao, callbackAt: bayGio } });
    await nc.kiemToan({ action: "callback-oauth-tu-choi", objectType: "social_oauth_request", objectId: yc.id, after: { nenTang: ncc, lyDo: ma } });
    return { ok: false as const, ma, thongBao, yeuCauId: yc.id };
  };
  if (yc.provider !== ncc) return huy("sai-nen-tang", "Mã quay về không thuộc nền tảng này (đường chuyển hướng lạ).");
  let duongMong = "";
  try {
    duongMong = new URL(yc.redirectUri).pathname;
  } catch {
    /* giữ rỗng */
  }
  if (duongDan !== duongMong) return huy("redirect-khong-khop", "Đường quay về không khớp Redirect URI đã đăng ký.");
  if (yc.userId !== nc.hoSo.userId || yc.sessionRef !== sessionRef) return huy("sai-phien", "Phiên kết nối không thuộc phiên đăng nhập này — bắt đầu lại từ màn hình Kênh trên chính trình duyệt này.");
  if (yc.status !== "CHO_DONG_Y") return { ok: false, ma: "state-da-dung", thongBao: "Liên kết kết nối này đã được dùng — bắt đầu lại từ màn hình Kênh.", yeuCauId: yc.id };
  if (yc.expiresAt.getTime() <= bayGio.getTime()) return huy("state-het-han", "Phiên kết nối quá 10 phút — bắt đầu lại từ màn hình Kênh.", "HET_HAN");
  if (q.error) return huy("tu-choi", `Bạn đã không cấp quyền trên ${TEN_OAUTH[ncc]} (${String(q.error_description ?? q.error).slice(0, 200)}).`);
  if (!q.code || q.code.length > 2048) return huy("thieu-code", "Nền tảng không trả mã cấp quyền.");
  const k = trangThaiKhoaChu();
  if (!k.coKhoa) return huy("thieu-social-master-key", k.loi ?? "Máy chủ chưa đặt SOCIAL_MASTER_KEY.");
  const bn = niemPhong(q.code, aadOAuth(nc.tenantId, yc.id));
  const n = await nc.tx.socialOauthRequest.updateMany({ where: { id: yc.id, status: "CHO_DONG_Y" }, data: { status: "CHO_DOI_MA", callbackAt: bayGio, ...bn } });
  if (n.count !== 1) return { ok: false, ma: "state-da-dung", thongBao: "Liên kết kết nối này đã được dùng.", yeuCauId: yc.id };
  await nc.kiemToan({ action: "callback-oauth", objectType: "social_oauth_request", objectId: yc.id, after: { nenTang: ncc } });
  return { ok: true, yeuCauId: yc.id };
}

/** Trạng thái một lần kết nối + kênh chờ chọn (chỉ người bắt đầu xem được). Không trả bản niêm phong. */
export async function trangThaiYeuCauOAuth(nc: NguCanh, id: string, bayGio: Date = new Date()) {
  batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_oauth_request", objectId: id });
  const yc = await nc.tx.socialOauthRequest.findFirst({
    where: { id, userId: nc.hoSo.userId },
    select: { id: true, provider: true, status: true, errorMessage: true, accountName: true, missingScopes: true, reconnectConnectionId: true, exchangedAt: true, candidates: { select: { id: true, platform: true, externalId: true, name: true, meta: true, existing: true, connectionId: true }, orderBy: [{ platform: "asc" }, { name: "asc" }] } },
  });
  if (!yc) throw new LoiKhongTimThay("Lần kết nối");
  const hetHanChon = yc.exchangedAt ? new Date(yc.exchangedAt.getTime() + HAN_CHON_MS) : null;
  return {
    id: yc.id,
    nhaCungCap: yc.provider,
    ten: TEN_OAUTH[yc.provider as NhaCungCapOAuth],
    trangThai: yc.status === "DA_SAN_SANG" && hetHanChon && hetHanChon.getTime() <= bayGio.getTime() ? "HET_HAN" : yc.status,
    loi: yc.errorMessage,
    taiKhoan: yc.accountName,
    quyenThieu: yc.missingScopes,
    ketNoiLai: yc.reconnectConnectionId,
    ungVien: yc.candidates.map((c) => {
      const m = (c.meta ?? {}) as Record<string, unknown>;
      return {
        id: c.id, nenTang: c.platform, tenNenTang: TEN_NEN_TANG[c.platform] ?? c.platform, ten: c.name, ma: c.externalId, daNoi: c.existing,
        ghiChu: typeof m.ghiChu === "string" ? m.ghiChu : null, chonSan: c.connectionId === yc.reconnectConnectionId,
      };
    }),
  };
}

const HAN_CHON_MS = 30 * 60_000;

export async function chonKenhOAuth(nc: NguCanh, id: string, ungVienIds: string[], bayGio: Date = new Date()) {
  batBuocQuyen(nc.hoSo, "mxh.update", { objectType: "social_oauth_request", objectId: id });
  await nc.tx.$queryRaw`SELECT id FROM social_oauth_requests WHERE id = ${id}::uuid FOR UPDATE`;
  const yc = await nc.tx.socialOauthRequest.findFirst({ where: { id, userId: nc.hoSo.userId } });
  if (!yc) throw new LoiKhongTimThay("Lần kết nối");
  if (yc.status !== "DA_SAN_SANG") throw new LoiNghiepVu(yc.status === "HOAN_TAT" ? "Lần kết nối này đã lưu xong." : "Lần kết nối chưa sẵn sàng hoặc đã hỏng — bắt đầu lại.", 409, "sai-trang-thai");
  if (!yc.exchangedAt || yc.exchangedAt.getTime() + HAN_CHON_MS <= bayGio.getTime()) {
    await nc.tx.socialOauthCandidate.deleteMany({ where: { requestId: id } });
    await nc.tx.socialOauthRequest.update({ where: { id }, data: { status: "HET_HAN", errorMessage: "Quá 30 phút chưa chọn kênh." } });
    throw new LoiNghiepVu("Quá 30 phút chưa chọn kênh — bắt đầu kết nối lại.", 409, "het-han");
  }
  const ids = [...new Set(ungVienIds)];
  const uv = await nc.tx.socialOauthCandidate.findMany({ where: { requestId: id, id: { in: ids } } });
  if (uv.length !== ids.length) throw new LoiKhongTimThay("Kênh chờ chọn");
  const kq: { id: string; ten: string; nenTang: string; moi: boolean }[] = [];
  for (const c of uv) {
    const st = await nc.tx.socialConnectorSetting.findFirst({ where: { platform: c.platform } });
    if (!st || st.availability !== "AVAILABLE" || !st.enabled || !layConnector(c.platform)) throw new LoiNghiepVu(`${TEN_NEN_TANG[c.platform] ?? c.platform} đang tắt.`, 409, "nen-tang-tat");
    const niem = { ciphertext: c.ciphertext, iv: c.iv, authTag: c.authTag, wrappedKey: c.wrappedKey, keyVersion: c.keyVersion, tokenExpiresAt: c.tokenExpiresAt, refreshedAt: bayGio };
    const meta = { ...((c.meta ?? {}) as object), ketNoiLuc: bayGio.toISOString() };
    const daCo = await nc.tx.socialConnection.findFirst({ where: { id: c.connectionId, disconnectedAt: null }, select: { id: true, meta: true } });
    if (daCo) {
      await nc.tx.socialCredential.upsert({ where: { connectionId: c.connectionId }, create: { connectionId: c.connectionId, tenantId: nc.tenantId, ...niem, updatedBy: nc.hoSo.userId }, update: { ...niem, updatedBy: nc.hoSo.userId } });
      await nc.tx.socialConnection.update({
        where: { id: c.connectionId },
        data: { status: "ACTIVE", name: c.name, accountName: yc.accountName, oauthSubject: yc.oauthSubject, meta: { ...((daCo.meta ?? {}) as object), ...meta }, lastCheckedAt: bayGio, lastCheckOk: true, lastCheckMessage: "Đã kết nối lại qua OAuth.", checkRequestedAt: null, updatedBy: nc.hoSo.userId },
      });
      await nc.kiemToan({ action: "ket-noi-lai-kenh-mxh", objectType: "social_connection", objectId: c.connectionId, after: { nenTang: c.platform, ma: c.externalId, phienBanKhoa: c.keyVersion } });
      kq.push({ id: c.connectionId, ten: c.name, nenTang: c.platform, moi: false });
    } else {
      try {
        await nc.tx.$executeRaw`SAVEPOINT tao_kenh_oauth`;
        await nc.tx.socialConnection.create({
          data: {
            id: c.connectionId, tenantId: nc.tenantId, platform: c.platform, name: c.name, externalId: c.externalId, accountName: yc.accountName,
            authType: "oauth", oauthProvider: yc.provider, oauthSubject: yc.oauthSubject, status: "ACTIVE", meta, lastCheckedAt: bayGio, lastCheckOk: true,
            lastCheckMessage: "Đã kết nối qua OAuth.", createdBy: nc.hoSo.userId, credential: { create: { tenantId: nc.tenantId, ...niem, updatedBy: nc.hoSo.userId } },
          },
        });
        await nc.tx.$executeRaw`RELEASE SAVEPOINT tao_kenh_oauth`;
      } catch (e) {
        if (laLoiTrung(e)) {
          await nc.tx.$executeRaw`ROLLBACK TO SAVEPOINT tao_kenh_oauth`;
          throw new LoiNghiepVu(`${TEN_NEN_TANG[c.platform]} “${c.name}” đã được nối — dùng “Kết nối lại” ở kênh đó.`, 409, "kenh-da-noi");
        }
        throw e;
      }
      await nc.kiemToan({ action: "ket-noi-kenh-mxh", objectType: "social_connection", objectId: c.connectionId, after: { nenTang: c.platform, ma: c.externalId, cach: "oauth", phienBanKhoa: c.keyVersion } });
      kq.push({ id: c.connectionId, ten: c.name, nenTang: c.platform, moi: true });
    }
    await nc.suKien({ eventType: SU_KIEN.SOCIAL_CONNECTION_CHANGED, objectType: "social_connection", objectId: c.connectionId, payload: { hanhDong: daCo ? "ket-noi-lai" : "ket-noi", nenTang: c.platform } });
  }
  // Token của kênh KHÔNG chọn bị hủy cùng lúc (xóa dòng chờ chọn).
  await nc.tx.socialOauthCandidate.deleteMany({ where: { requestId: id } });
  await nc.tx.socialOauthRequest.update({ where: { id }, data: { status: "HOAN_TAT", completedAt: bayGio } });
  return { kenh: kq };
}
