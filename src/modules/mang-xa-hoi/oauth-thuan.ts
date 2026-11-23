import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { LoaiLoi } from "./hang-so";

/**
 * Phần THUẦN của kết nối OAuth và gọi API Meta / Google (0.24.0, QĐ-210 → QĐ-215): quyền xin, dựng URL đăng nhập,
 * state, khóa phiên, signed_request của Meta, appsecret_proof, ngày quota YouTube, phân loại lỗi Graph / Google,
 * dựng multipart. Không chạm CSDL, mạng, đồng hồ (giờ truyền vào).
 *
 * CHƯA KIỂM VỚI API THẬT: dạng URL hộp thoại Facebook Login for Business (`config_id` thay `scope`), mã lỗi Graph,
 * lý do lỗi YouTube (`quotaExceeded`, `uploadLimitExceeded`), mốc ngày quota (nửa đêm giờ Thái Bình Dương).
 */

export const NHA_CUNG_CAP_OAUTH = ["META", "GOOGLE"] as const;
export type NhaCungCapOAuth = (typeof NHA_CUNG_CAP_OAUTH)[number];

export interface QuyenXin {
  ma: string;
  giaiThich: string;
  batBuoc: boolean;
}

/** Quyền xin khi kết nối — hiện trên màn hình đồng ý của Cowork trước khi chuyển sang nền tảng. */
export const QUYEN_XIN: Record<NhaCungCapOAuth, QuyenXin[]> = {
  META: [
    { ma: "pages_show_list", giaiThich: "Xem danh sách Page bạn quản lý — để bạn chọn Page nối vào Cowork.", batBuoc: true },
    { ma: "pages_manage_posts", giaiThich: "Đăng, sửa bài trên Page — để Cowork đăng bài thay bạn.", batBuoc: true },
    { ma: "pages_read_engagement", giaiThich: "Đọc bài của Page — để Cowork đọc lại xác minh bài đã lên và lấy đường dẫn bài.", batBuoc: true },
    { ma: "publish_video", giaiThich: "Đăng video / Reels lên Page.", batBuoc: true },
    { ma: "instagram_basic", giaiThich: "Xem tài khoản Instagram chuyên nghiệp gắn với Page.", batBuoc: true },
    { ma: "instagram_content_publish", giaiThich: "Đăng ảnh, carousel, Reels lên Instagram.", batBuoc: true },
    { ma: "business_management", giaiThich: "Chỉ cần khi Page thuộc Business Manager (Meta Business Suite) — Facebook yêu cầu để thấy Page đó.", batBuoc: false },
  ],
  GOOGLE: [
    { ma: "https://www.googleapis.com/auth/youtube.upload", giaiThich: "Tải video lên kênh YouTube của bạn.", batBuoc: true },
    { ma: "https://www.googleapis.com/auth/youtube.readonly", giaiThich: "Xem kênh và video của bạn — để chọn kênh và đọc lại xác minh video đã lên.", batBuoc: true },
    { ma: "https://www.googleapis.com/auth/drive.file", giaiThich: "Chỉ những tệp BẠN TỰ CHỌN trong Google Drive (qua hộp chọn tệp của Google) — Cowork không xem được tệp nào khác, không đổi quyền chia sẻ.", batBuoc: true },
  ],
};

export const TEN_OAUTH: Record<NhaCungCapOAuth, string> = { META: "Facebook / Instagram (Meta)", GOOGLE: "YouTube + Google Drive (Google)" };

/** Nhà cung cấp OAuth của một nền tảng kênh. */
export function nhaCungCapCuaNenTang(nenTang: string): NhaCungCapOAuth | null {
  if (nenTang === "FACEBOOK_PAGE" || nenTang === "INSTAGRAM") return "META";
  if (nenTang === "YOUTUBE") return "GOOGLE";
  return null;
}

export const HAN_STATE_MS = 10 * 60_000;

const LOI_KET_NOI: Record<string, string> = {
  "thieu-state": "Thiếu mã chống giả mạo — bắt đầu kết nối lại.",
  "state-sai": "Mã chống giả mạo (state) không đúng — liên kết có thể bị sửa. Bắt đầu kết nối lại.",
  "state-da-dung": "Liên kết kết nối đã được dùng — bắt đầu lại.",
  "state-het-han": "Quá 10 phút kể từ lúc bấm kết nối — bắt đầu lại.",
  "sai-phien": "Lần kết nối không thuộc phiên đăng nhập này — bắt đầu lại trên chính trình duyệt này.",
  "sai-nen-tang": "Đường quay về không đúng nền tảng.",
  "redirect-khong-khop": "Đường quay về không khớp Redirect URI đã đăng ký.",
  "tu-choi": "Bạn đã không cấp quyền trên nền tảng.",
  "thieu-code": "Nền tảng không trả mã cấp quyền.",
  "thieu-social-master-key": "Máy chủ chưa đặt khóa SOCIAL_MASTER_KEY — báo quản trị máy chủ.",
};

/**
 * Lời giải thích cho mã lỗi kết nối trên đường dẫn (`?loi-ket-noi=`). QA 0.24.0 (QĐ-223): CHỈ mã đã biết — không bao giờ
 * hiện nguyên văn tham số (người ngoài dựng liên kết chèn chữ tùy ý lên trang Kênh của Cowork: "gọi số … để hỗ trợ").
 */
export function thongBaoLoiKetNoi(ma: string | null | undefined): string {
  return (ma && Object.hasOwn(LOI_KET_NOI, ma) ? LOI_KET_NOI[ma] : null) ?? "Kết nối không thành công — bắt đầu lại từ màn hình Kênh.";
}

/** state ngẫu nhiên 32 byte — CHỈ đi trong URL tới nền tảng và quay về; CSDL lưu mã băm. */
export function sinhState(): string {
  return randomBytes(32).toString("base64url");
}

export function bamState(state: string): string {
  return createHash("sha256").update(`mxh-oauth-state:${state}`, "utf8").digest("hex");
}

/** Khóa phiên: gắn state với ĐÚNG phiên đăng nhập (người + doanh nghiệp + lúc ký phiên). */
export function maPhien(userId: string, tenantId: string, kyLucMs: number): string {
  return createHash("sha256").update(`mxh-phien:${tenantId}:${userId}:${kyLucMs}`, "utf8").digest("hex");
}

export function urlDangNhapMeta(o: { goc: string; appId: string; graphVersion: string; redirectUri: string; state: string; scopes: string[]; configId?: string | null }): string {
  const q = new URLSearchParams({ client_id: o.appId, redirect_uri: o.redirectUri, state: o.state, response_type: "code" });
  // Facebook Login for Business: cấu hình (config_id) mang sẵn danh sách quyền; không có thì xin bằng scope.
  if (o.configId) {
    q.set("config_id", o.configId);
    q.set("override_default_response_type", "true");
  } else q.set("scope", o.scopes.join(","));
  return `${o.goc}/${o.graphVersion}/dialog/oauth?${q.toString()}`;
}

export function urlDangNhapGoogle(o: { goc: string; clientId: string; redirectUri: string; state: string; scopes: string[] }): string {
  const q = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: o.scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: o.state,
  });
  return `${o.goc}/o/oauth2/v2/auth?${q.toString()}`;
}

/** appsecret_proof của Graph API: HMAC-SHA256(access_token, App Secret), hệ 16. */
export function appsecretProof(accessToken: string, appSecret: string): string {
  return createHmac("sha256", appSecret).update(accessToken, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// signed_request của Meta (Data Deletion Callback)
// ---------------------------------------------------------------------------

export interface NoiDungSignedRequest {
  algorithm: string;
  user_id: string;
  issued_at?: number;
}

/** Kiểm KHUÔN (không cần bí mật) — route công khai dùng để từ chối rác trước khi ghi. */
export function docKhuonSignedRequest(sr: string): { ok: true; noiDung: NoiDungSignedRequest } | { ok: false; ly: string } {
  if (typeof sr !== "string" || sr.length > 8192) return { ok: false, ly: "signed_request quá dài hoặc trống." };
  const m = /^([A-Za-z0-9_-]{20,200})\.([A-Za-z0-9_-]{10,8000})$/.exec(sr.trim());
  if (!m) return { ok: false, ly: "signed_request sai khuôn." };
  let nd: unknown;
  try {
    nd = JSON.parse(Buffer.from(m[2], "base64url").toString("utf8"));
  } catch {
    return { ok: false, ly: "signed_request: phần nội dung không phải JSON." };
  }
  const o = nd as Partial<NoiDungSignedRequest>;
  if (!o || typeof o !== "object" || String(o.algorithm).toUpperCase() !== "HMAC-SHA256") return { ok: false, ly: "signed_request: thuật toán phải là HMAC-SHA256." };
  if (typeof o.user_id !== "string" || !/^\d{1,40}$/.test(o.user_id)) return { ok: false, ly: "signed_request: thiếu user_id." };
  return { ok: true, noiDung: { algorithm: "HMAC-SHA256", user_id: o.user_id, issued_at: typeof o.issued_at === "number" ? o.issued_at : undefined } };
}

/** Kiểm CHỮ KÝ bằng App Secret (worker — nơi duy nhất mở được App Secret). So thời gian hằng. */
export function kiemSignedRequest(sr: string, appSecret: string): { ok: true; noiDung: NoiDungSignedRequest } | { ok: false; ly: string } {
  const k = docKhuonSignedRequest(sr);
  if (!k.ok) return k;
  const [chuKy, than] = sr.trim().split(".");
  const mong = createHmac("sha256", appSecret).update(than, "utf8").digest();
  const nhan = Buffer.from(chuKy, "base64url");
  if (nhan.length !== mong.length || !timingSafeEqual(nhan, mong)) return { ok: false, ly: "Chữ ký signed_request không khớp App Secret." };
  return k;
}

/** Dựng signed_request (bài thử / máy chủ giả). */
export function kySignedRequest(nd: Record<string, unknown>, appSecret: string): string {
  const than = Buffer.from(JSON.stringify(nd), "utf8").toString("base64url");
  return `${createHmac("sha256", appSecret).update(than, "utf8").digest("base64url")}.${than}`;
}

/** Mã xác nhận xóa dữ liệu: 16 ký tự chữ hoa + số (Meta yêu cầu chữ và số). */
export function sinhMaXacNhan(): string {
  const bang = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return [...randomBytes(16)].map((b) => bang[b % bang.length]).join("");
}

// ---------------------------------------------------------------------------
// Ngày quota YouTube (Google đặt lại quota lúc nửa đêm giờ Thái Bình Dương — chưa kiểm với API thật)
// ---------------------------------------------------------------------------

const DINH_DANG_PT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });

function phanPT(d: Date) {
  const p = Object.fromEntries(DINH_DANG_PT.formatToParts(d).map((x) => [x.type, x.value]));
  return { ngay: `${p.year}-${p.month}-${p.day}`, gio: Number(p.hour) };
}

/** Ngày quota (YYYY-MM-DD theo giờ Thái Bình Dương) của một thời điểm. */
export function ngayQuota(d: Date): string {
  return phanPT(d).ngay;
}

/** Thời điểm bắt đầu ngày quota KẾ TIẾP (00:00 giờ Thái Bình Dương, PST −8 hoặc PDT −7). */
export function batDauNgayQuotaSau(d: Date): Date {
  const [y, m, n] = ngayQuota(d).split("-").map(Number);
  for (const lech of [7, 8]) {
    const thu = new Date(Date.UTC(y, m - 1, n + 1, lech, 0, 0));
    const p = phanPT(thu);
    if (p.gio === 0 && p.ngay !== ngayQuota(d)) return thu;
  }
  return new Date(Date.UTC(y, m - 1, n + 1, 8, 0, 0));
}

// ---------------------------------------------------------------------------
// Phân loại lỗi
// ---------------------------------------------------------------------------

export interface LoiNenTang {
  loai: LoaiLoi;
  ma: string;
  thongBao: string;
  /** Hoãn (không tính lượt thử) — hạn mức / media nền tảng chưa xử lý xong. */
  hoanMs?: number;
}

/**
 * Lỗi Graph API `{ error: { message, type, code, error_subcode, is_transient } }`. Mã 190 (token hết hạn / bị thu hồi),
 * 10 / 200–299 (thiếu quyền) → NEEDS_REAUTH; 4, 17, 32, 613, 80001… (vượt tốc độ) → RETRYABLE; 1, 2, is_transient → RETRYABLE;
 * 9007 (media chưa sẵn sàng) → hoãn; còn lại 4xx → PERMANENT. CHƯA KIỂM VỚI API THẬT.
 */
export function phanLoaiLoiGraph(status: number, j: unknown): LoiNenTang {
  const e = ((j as { error?: Record<string, unknown> } | undefined)?.error ?? {}) as { message?: string; code?: number; error_subcode?: number; is_transient?: boolean; error_user_msg?: string };
  const code = typeof e.code === "number" ? e.code : null;
  const tin = (e.error_user_msg || e.message || `HTTP ${status}`).toString().replace(/\s+/g, " ").slice(0, 250);
  const ma = code !== null ? `graph-${code}${e.error_subcode ? `-${e.error_subcode}` : ""}` : `http-${status}`;
  if (code === 190 || code === 102 || code === 10 || (code !== null && code >= 200 && code <= 299)) return { loai: "NEEDS_REAUTH", ma, thongBao: `Meta từ chối quyền truy cập: ${tin}` };
  if (code === 9007 || e.error_subcode === 2207027) return { loai: "RETRYABLE", ma, thongBao: `Meta: media chưa xử lý xong (${tin}).`, hoanMs: 30_000 };
  if (code === 4 || code === 17 || code === 32 || code === 613 || (code !== null && code >= 80001 && code <= 80014)) return { loai: "RETRYABLE", ma, thongBao: `Meta: vượt giới hạn tốc độ gọi (${tin}).` };
  if (code === 1 || code === 2 || e.is_transient === true || status >= 500 || status === 429) return { loai: "RETRYABLE", ma, thongBao: `Meta tạm lỗi: ${tin}` };
  if (status === 401) return { loai: "NEEDS_REAUTH", ma, thongBao: `Meta từ chối quyền truy cập: ${tin}` };
  return { loai: "PERMANENT", ma, thongBao: `Meta từ chối: ${tin}` };
}

/**
 * Lỗi Google API `{ error: { code, message, errors: [{ reason }] } }` hoặc OAuth `{ error: "invalid_grant" }`.
 * 401 / invalid_grant → NEEDS_REAUTH; 403 quotaExceeded / uploadLimitExceeded / rateLimitExceeded → hoãn; 403 khác → NEEDS_REAUTH;
 * 429, 5xx → RETRYABLE; 4xx khác → PERMANENT. CHƯA KIỂM VỚI API THẬT.
 */
export function phanLoaiLoiGoogle(status: number, j: unknown): LoiNenTang {
  const o = (j ?? {}) as { error?: unknown; error_description?: string };
  if (typeof o.error === "string") {
    const tin = `${o.error}${o.error_description ? ` — ${o.error_description}` : ""}`.slice(0, 250);
    // QA 0.24.0 (QĐ-224): invalid_grant thường gặp nhất là màn hình OAuth của Google ở chế độ "Testing" — refresh token
    // chỉ sống 7 ngày. Nói rõ cách sửa thay vì chỉ "hết hạn".
    if (o.error === "invalid_grant") return { loai: "NEEDS_REAUTH", ma: `google-${o.error}`, thongBao: `Google không còn chấp nhận quyền đã cấp (${tin}). Bấm “Kết nối lại”. Nếu tuần nào cũng gặp: màn hình OAuth của Google đang ở chế độ Testing (Google chỉ cho token 7 ngày) — chuyển Internal hoặc xuất bản app (docs/HUONG-DAN-MANG-XA-HOI.md).` };
    if (o.error === "unauthorized_client" || o.error === "invalid_client") return { loai: "NEEDS_REAUTH", ma: `google-${o.error}`, thongBao: `Google không còn chấp nhận quyền đã cấp (${tin}).` };
    return status >= 500 ? { loai: "RETRYABLE", ma: `google-${o.error}`, thongBao: `Google tạm lỗi (${tin}).` } : { loai: "PERMANENT", ma: `google-${o.error}`, thongBao: `Google từ chối: ${tin}` };
  }
  const e = (o.error ?? {}) as { message?: string; errors?: { reason?: string }[] };
  const lyDo = e.errors?.[0]?.reason ?? "";
  const tin = (e.message ?? `HTTP ${status}`).replace(/\s+/g, " ").slice(0, 250);
  const ma = `google-${status}${lyDo ? `-${lyDo}` : ""}`;
  if (status === 401) return { loai: "NEEDS_REAUTH", ma, thongBao: `Google từ chối quyền truy cập: ${tin}` };
  if (status === 403 && ["quotaExceeded", "uploadLimitExceeded", "dailyLimitExceeded"].includes(lyDo)) return { loai: "RETRYABLE", ma, thongBao: `YouTube: hết hạn mức (${tin}).`, hoanMs: -1 };
  if (status === 403 && ["rateLimitExceeded", "userRateLimitExceeded"].includes(lyDo)) return { loai: "RETRYABLE", ma, thongBao: `Google: vượt tốc độ (${tin}).` };
  if (status === 403) return { loai: "NEEDS_REAUTH", ma, thongBao: `Google: không đủ quyền (${tin}).` };
  if (status === 429 || status >= 500 || status === 408) return { loai: "RETRYABLE", ma, thongBao: `Google tạm lỗi: ${tin}` };
  return { loai: "PERMANENT", ma, thongBao: `Google từ chối: ${tin}` };
}

// ---------------------------------------------------------------------------
// multipart/form-data (tải ảnh / video lên Graph API bằng byte — không cần URL công khai)
// ---------------------------------------------------------------------------

export function dungMultipart(truong: Record<string, string>, tep?: { ten: string; tenTep: string; mime: string; noiDung: Buffer }): { than: Buffer; contentType: string } {
  const ranh = `----cowork${randomBytes(12).toString("hex")}`;
  const phan: Buffer[] = [];
  for (const [k, v] of Object.entries(truong)) {
    phan.push(Buffer.from(`--${ranh}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`, "utf8"));
  }
  if (tep) {
    const ten = tep.tenTep.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80) || "tep";
    phan.push(Buffer.from(`--${ranh}\r\nContent-Disposition: form-data; name="${tep.ten}"; filename="${ten}"\r\nContent-Type: ${tep.mime}\r\n\r\n`, "utf8"));
    phan.push(tep.noiDung);
    phan.push(Buffer.from("\r\n", "utf8"));
  }
  phan.push(Buffer.from(`--${ranh}--\r\n`, "utf8"));
  return { than: Buffer.concat(phan), contentType: `multipart/form-data; boundary=${ranh}` };
}

/** Chuẩn hóa chữ để so khớp nội dung bài khi đối soát (Facebook / Instagram không có slug). */
export function chuanHoaDoiSoat(s: string | null | undefined): string {
  return (s ?? "").replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim().normalize("NFC");
}
