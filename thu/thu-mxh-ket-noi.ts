import { mkdtempSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

// Thư mục tệp đính kèm tạm + khóa chủ riêng của bài thử — đặt TRƯỚC khi nạp module. Không bao giờ in khóa.
process.env.THU_MUC_DINH_KEM = mkdtempSync(path.join(tmpdir(), "cowork-mxh-kn-"));
const KHOA_THU = randomBytes(32).toString("base64");
process.env.SOCIAL_MASTER_KEY = KHOA_THU;
process.env.SOCIAL_MASTER_KEY_VERSION = "1";
const APP_URL_HTTPS = "https://cowork.vi-du.vn";
process.env.APP_URL = APP_URL_HTTPS;
process.env.MXH_YOUTUBE_DOAN_BYTE = String(256 * 1024);
process.env.MXH_THU_KHONG_CHO = "1";

import { NextRequest } from "next/server";
import { voiTenant, prisma } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { seedNenMong } from "../prisma/seed/index";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { dinhKemTep } from "../src/modules/dinh-kem/service";
import { aadKenh } from "../src/modules/mang-xa-hoi/bao-mat/khoa-chu";
import { chiTietBai, dangLai, dangNgay, danhSachBai, henGio, nhatKyDang, taoBai } from "../src/modules/mang-xa-hoi/bai";
import { danhSachKenh, ngatKenh } from "../src/modules/mang-xa-hoi/kenh";
import { kiemMaMedia, kyMaMedia } from "../src/modules/mang-xa-hoi/media-ky";
import { cauHinhPicker, danhSachThongTinApp, luuThongTinApp, urlCanDan } from "../src/modules/mang-xa-hoi/nen-tang-app";
import { batDauOAuth, chonKenhOAuth, manHinhDongY, nhanCallbackOAuth, trangThaiYeuCauOAuth } from "../src/modules/mang-xa-hoi/oauth";
import { batDauNgayQuotaSau, kySignedRequest, maPhien } from "../src/modules/mang-xa-hoi/oauth-thuan";
import { taiTuDrive } from "../src/modules/mang-xa-hoi/drive";
import { danhSachTrang, docTrang, nhanYeuCauXoaDuLieu, suaTrang, timDoanhNghiepCongKhai, trangThaiXoaDuLieu } from "../src/modules/mang-xa-hoi/trang-cong-khai";
import { napLaiThuVienAnhChoBaiThu } from "../src/modules/mang-xa-hoi/media/doi-jpeg";
import { datGocApiChoBaiThu } from "../src/modules/mang-xa-hoi/connectors/goc-api";
import { choPhepLocalhostChoBaiThu } from "../src/modules/mang-xa-hoi/mang/goi-an-toan";
import { moNiemPhong } from "../worker/mang-xa-hoi/giai-ma";
import { dangBaiMotVong } from "../worker/mang-xa-hoi/dang-bai";
import { doiMaOAuthDaXep, donDepOAuth } from "../worker/mang-xa-hoi/oauth";
import { lamMoiTokenDenHan } from "../worker/mang-xa-hoi/token";
import { xuLyXoaDuLieu } from "../worker/mang-xa-hoi/xoa-du-lieu";
import { kiemTraKenhDaXep } from "../worker/mang-xa-hoi/kiem-tra";
import { GET as phatMedia } from "../src/app/api/cong-khai/mxh/media/[ma]/route";
import { POST as routeXoaDuLieu } from "../src/app/api/cong-khai/mxh/meta/xoa-du-lieu/[dn]/route";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";
import { taoMp4 } from "./mxh-mp4";

/**
 * Kiểm chứng 0.24.0 — kết nối Facebook Page / Instagram / YouTube bằng OAuth, Google Drive làm kho media, trang công khai,
 * Data Deletion Callback (BUSINESS_RULES mục 34 MXH-50 →, QĐ-210 →) trên CSDL THẬT, qua đúng service API gọi và đúng hàm
 * worker. Graph API / Google OAuth / YouTube / Drive là MÁY CHỦ GIẢ cục bộ (http.createServer) làm đúng hình dạng yêu cầu /
 * phản hồi theo tài liệu công khai — CHƯA KIỂM VỚI API THẬT. Mốc giờ nghiệp vụ là hằng số (không dùng new Date() cho phần
 * phụ thuộc giờ). Chạy: npm run thu:mxh-ket-noi.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Math.floor(performance.timeOrigin).toString(36);
const MOC = new Date("2026-12-01T02:00:00Z");
const sau = (giay: number) => new Date(MOC.getTime() + giay * 1000);
const V = "v24.0";
const APP_ID = "123456789012";
const APP_SECRET = randomBytes(16).toString("hex");
const CLIENT_ID = "1234567890-cowork.apps.googleusercontent.com";
const CLIENT_SECRET = `GOCSPX-${randomBytes(12).toString("hex")}`;
const KHOA_PICKER = `AIza${randomBytes(18).toString("hex").slice(0, 35)}`;
const RU_META = `${APP_URL_HTTPS}/api/cong-khai/mxh/oauth/meta/callback`;
const RU_GOOGLE = `${APP_URL_HTTPS}/api/cong-khai/mxh/oauth/google/callback`;
const DUONG_META = "/api/cong-khai/mxh/oauth/meta/callback";
const DUONG_GOOGLE = "/api/cong-khai/mxh/oauth/google/callback";

// ---------------------------------------------------------------------------
// Bí mật nền tảng (mọi chuỗi ở đây KHÔNG được lọt ra ngoài máy chủ giả + bản niêm phong)
// ---------------------------------------------------------------------------
const tk = (t: string) => `${t}-${randomBytes(12).toString("hex")}`;
const META_USER = "9876543210";
const TOK = {
  userNgan: tk("EAAngan"), userDai: tk("EAAdai"), pageA: tk("EAApageA"), pageB: tk("EAApageB"), pageA2: tk("EAApageA2"),
  ggAccess1: tk("ya29a1"), ggRefresh: tk("1//refresh"), ggAccess2: tk("ya29a2"), picker: tk("ya29picker"), pickerLa: tk("ya29la"),
};
const CODE = { meta1: tk("codeMeta1"), meta2: tk("codeMeta2"), google1: tk("codeGg1"), google2: tk("codeGg2") };
const PAGE_A = "111111111111111";
const PAGE_B = "222222222222222";
const IG_A = "17841400000000001";
const KENH_YT = "UCcoworkDEMO0000000000aa";

// ---------------------------------------------------------------------------
// Máy chủ GIẢ: Graph API + Google OAuth + YouTube + Drive
// ---------------------------------------------------------------------------
interface BaiFb { id: string; page: string; message: string; link: string | null; attached: string[]; created: string; photo?: boolean }
interface VideoFb { id: string; page: string; tong: number; nhan: number; xong: boolean; reel: boolean; description: string; status: string }
interface Container { id: string; ig: string; form: Record<string, string>; hoi: number; status: string }
interface PhienYt { id: string; tong: number; buf: Buffer; nhan: number; meta: { snippet?: { title?: string; tags?: string[] }; status?: { privacyStatus?: string } }; video: string | null }

const gia = {
  pageToken: new Map<string, string>([[PAGE_A, TOK.pageA], [PAGE_B, TOK.pageB]]),
  thuHoi: new Set<string>(),
  bai: new Map<string, BaiFb>(),
  anhAn: new Map<string, { page: string }>(),
  video: new Map<string, VideoFb>(),
  hangFeed: [] as string[],
  soFeed: 0,
  soPhoto: 0,
  proofSai: 0,
  container: new Map<string, Container>(),
  igMedia: new Map<string, { caption: string; ts: string }>(),
  igHanMuc: { dung: 0, tong: 100 },
  igHoiCham: 0,
  igImageUrl: [] as string[],
  soContainer: 0,
  ggKhongRefresh: false,
  ggRefreshThuHoi: false,
  ggAccess: new Set<string>([TOK.ggAccess1]),
  soLamMoi: 0,
  phien: new Map<string, PhienYt>(),
  soPhien: 0,
  ytVideo: new Map<string, { tags: string[]; privacy: string; title: string; size: number; data: Buffer }>(),
  ngatPut: 0,
  quota403: false,
  tep: new Map<string, { name: string; mime: string; data: Buffer }>(),
  soGoiDriveKhacGet: 0,
  treo: [] as ServerResponse[],
  idTiep: 5000,
  igDaDang: 0,
};
/** Giờ của NỀN TẢNG giả = giờ thật (như máy chủ Meta thật) — so với mốc lượt đăng (cũng giờ thật), không phụ thuộc ngày chạy. */
const gioNenTang = () => new Date(Date.now()).toISOString();
let cong = 0;
const site = () => `http://localhost:${cong}`;

function json(res: ServerResponse, status: number, body: unknown, them: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...them });
  res.end(JSON.stringify(body));
}
function docThan(req: IncomingMessage): Promise<Buffer> {
  return new Promise((ok) => {
    const m: Buffer[] = [];
    req.on("data", (c: Buffer) => m.push(c));
    req.on("end", () => ok(Buffer.concat(m)));
  });
}
const loiGraph = (res: ServerResponse, status: number, code: number, message: string) => json(res, status, { error: { message, type: "OAuthException", code, fbtrace_id: "gia" } });
const id = () => String(++gia.idTiep);

/** Trường của multipart (đơn giản: đủ cho bài thử). */
function truongMultipart(than: Buffer): { truong: Record<string, string>; tep: Buffer | null } {
  const s = than.toString("latin1");
  const ranh = /^--([^\r\n]+)/.exec(s)?.[1] ?? "";
  const truong: Record<string, string> = {};
  let tep: Buffer | null = null;
  for (const p of s.split(`--${ranh}`)) {
    const m = /name="([^"]+)"(; filename="[^"]*")?[\s\S]*?\r\n\r\n([\s\S]*)\r\n$/.exec(p);
    if (!m) continue;
    if (m[2]) tep = Buffer.from(m[3], "latin1");
    else truong[m[1]] = Buffer.from(m[3], "latin1").toString("utf8");
  }
  return { truong, tep };
}

async function graph(req: IncomingMessage, res: ServerResponse, url: URL, duong: string, than: Buffer) {
  const q = url.searchParams;
  const form = (req.headers["content-type"] ?? "").startsWith("application/x-www-form-urlencoded") ? Object.fromEntries(new URLSearchParams(than.toString("utf8"))) : {};
  if (duong === "oauth/access_token") {
    if (q.get("grant_type") === "client_credentials") return q.get("client_secret") === APP_SECRET ? json(res, 200, { access_token: "app|token" }) : loiGraph(res, 400, 1, "Error validating client secret.");
    if (q.get("client_id") !== APP_ID || q.get("client_secret") !== APP_SECRET) return loiGraph(res, 400, 1, "Error validating client secret.");
    if (q.get("grant_type") === "fb_exchange_token") return q.get("fb_exchange_token") === TOK.userNgan ? json(res, 200, { access_token: TOK.userDai, token_type: "bearer", expires_in: 5_184_000 }) : loiGraph(res, 400, 190, "Invalid token.");
    if (q.get("redirect_uri") !== RU_META) return loiGraph(res, 400, 100, "redirect_uri không khớp.");
    if (q.get("code") === CODE.meta1 || q.get("code") === CODE.meta2) return json(res, 200, { access_token: TOK.userNgan, token_type: "bearer", expires_in: 5183 });
    return loiGraph(res, 400, 100, "Invalid verification code format.");
  }
  // Mọi lệnh khác: token trong tiêu đề Authorization: OAuth …, appsecret_proof khớp.
  const tok = /^OAuth (.+)$/.exec(String(req.headers.authorization ?? ""))?.[1] ?? "";
  const proof = createHmac("sha256", APP_SECRET).update(tok).digest("hex");
  if (q.get("appsecret_proof") !== proof) {
    gia.proofSai++;
    return loiGraph(res, 400, 100, "Invalid appsecret_proof provided in the API argument");
  }
  if (gia.thuHoi.has(tok)) return loiGraph(res, 400, 190, "Error validating access token: The session has been invalidated.");
  if (duong === "me") return tok === TOK.userDai ? json(res, 200, { id: META_USER, name: "Người quản trị DEMO" }) : loiGraph(res, 400, 190, "Invalid token");
  if (duong === "me/permissions") return json(res, 200, { data: ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "publish_video", "instagram_basic", "instagram_content_publish"].map((p) => ({ permission: p, status: "granted" })) });
  if (duong === "me/accounts") {
    return json(res, 200, { data: [
      { id: PAGE_A, name: "Page A DEMO", access_token: gia.pageToken.get(PAGE_A), tasks: ["CREATE_CONTENT", "MANAGE"], instagram_business_account: { id: IG_A, username: "itw.demo", name: "ITW DEMO" } },
      { id: PAGE_B, name: "Page B DEMO", access_token: gia.pageToken.get(PAGE_B), tasks: ["ANALYZE"] },
    ] });
  }
  const pageTok = (p: string) => gia.pageToken.get(p) === tok;
  const baiDoc = gia.bai.get(duong);
  if (baiDoc && req.method === "GET") return pageTok(baiDoc.page) ? json(res, 200, { id: baiDoc.id, permalink_url: `https://www.facebook.com/${baiDoc.id.replace("_", "/posts/")}`, is_published: true, message: baiDoc.message }) : loiGraph(res, 400, 190, "Invalid token");
  const m = /^(\d+)(?:\/([a-z_]+))?$/.exec(duong);
  if (!m) return loiGraph(res, 404, 100, "Unknown path");
  const [, ma, canh] = m;
  // --- Page ---
  if (ma === PAGE_A || ma === PAGE_B) {
    if (!pageTok(ma)) return loiGraph(res, 400, 190, "Invalid page token");
    if (!canh && req.method === "GET") return json(res, 200, { id: ma, name: ma === PAGE_A ? "Page A DEMO" : "Page B DEMO", link: `https://www.facebook.com/${ma}` });
    if (canh === "feed" && req.method === "POST") {
      gia.soFeed++;
      const cheDo = gia.hangFeed.shift() ?? "ok";
      if (cheDo === "500") return json(res, 500, { error: { message: "An unexpected error has occurred.", code: 2, is_transient: true } });
      if (cheDo === "100") return loiGraph(res, 400, 100, "Invalid parameter: message");
      if (cheDo === "190") return loiGraph(res, 400, 190, "Error validating access token: Session has expired.");
      // Proxy / cổng gỡ lỗi NHẠI LẠI token + appsecret_proof trong thông báo lỗi (luật che bí mật QA 0.23.0).
      if (cheDo === "nhai") return loiGraph(res, 400, 100, `Invalid parameter (debug: Authorization=OAuth ${tok}; appsecret_proof=${q.get("appsecret_proof")}; token-url=${encodeURIComponent(tok)})`);
      const b: BaiFb = { id: `${ma}_${id()}`, page: ma, message: String(form.message ?? ""), link: form.link ?? null, attached: Object.entries(form).filter(([k]) => k.startsWith("attached_media")).map(([, v]) => JSON.parse(String(v)).media_fbid), created: gioNenTang() };
      gia.bai.set(b.id, b);
      if (cheDo === "treo") { gia.treo.push(res); return; }
      return json(res, 200, { id: b.id });
    }
    if (canh === "photos" && req.method === "POST") {
      gia.soPhoto++;
      const { truong, tep } = truongMultipart(than);
      if (!tep || tep.length < 10) return loiGraph(res, 400, 324, "Missing or invalid image file");
      const pid = id();
      if (truong.published === "false") {
        gia.anhAn.set(pid, { page: ma });
        return json(res, 200, { id: pid });
      }
      const b: BaiFb = { id: `${ma}_${id()}`, page: ma, message: truong.message ?? "", link: null, attached: [pid], created: gioNenTang(), photo: true };
      gia.bai.set(b.id, b);
      return json(res, 200, { id: pid, post_id: b.id });
    }
    if (canh === "published_posts") return json(res, 200, { data: [...gia.bai.values()].filter((b) => b.page === ma).map((b) => ({ id: b.id, message: b.message, created_time: b.created })) });
    if (canh === "videos" && req.method === "POST") {
      const ct = req.headers["content-type"] ?? "";
      const tr = ct.startsWith("multipart/") ? truongMultipart(than) : { truong: form as Record<string, string>, tep: null };
      const pha = tr.truong.upload_phase;
      const DOAN = 300_000;
      if (pha === "start") {
        const v: VideoFb = { id: id(), page: ma, tong: Number(tr.truong.file_size), nhan: 0, xong: false, reel: false, description: "", status: "uploading" };
        gia.video.set(v.id, v);
        return json(res, 200, { upload_session_id: `phien${v.id}`, video_id: v.id, start_offset: "0", end_offset: String(Math.min(DOAN, v.tong)) });
      }
      const v = gia.video.get(String(tr.truong.upload_session_id ?? "").replace("phien", ""));
      if (!v) return loiGraph(res, 400, 100, "Invalid upload session");
      if (pha === "transfer") {
        if (Number(tr.truong.start_offset) !== v.nhan || !tr.tep) return loiGraph(res, 400, 100, "Bad offset");
        v.nhan += tr.tep.length;
        return json(res, 200, { start_offset: String(v.nhan), end_offset: String(Math.min(v.nhan + DOAN, v.tong)) });
      }
      if (pha === "finish") {
        if (v.nhan !== v.tong) return loiGraph(res, 400, 100, "Upload incomplete");
        v.xong = true;
        v.status = "ready";
        v.description = String(tr.truong.description ?? "");
        return json(res, 200, { success: true });
      }
    }
    if (canh === "video_reels" && req.method === "POST") {
      if (form.upload_phase === "start") {
        const v: VideoFb = { id: id(), page: ma, tong: 0, nhan: 0, xong: false, reel: true, description: "", status: "uploading" };
        gia.video.set(v.id, v);
        return json(res, 200, { video_id: v.id, upload_url: `https://rupload.facebook.com/video-upload/${V}/${v.id}` });
      }
      if (form.upload_phase === "finish") {
        const v = gia.video.get(String(form.video_id));
        if (!v || v.nhan === 0) return loiGraph(res, 400, 100, "Video chưa tải");
        v.xong = true;
        v.status = "ready";
        v.description = String(form.description ?? "");
        return json(res, 200, { success: true });
      }
    }
    return loiGraph(res, 400, 100, "Unsupported");
  }
  // --- Instagram ---
  if (ma === IG_A) {
    if (!pageTok(PAGE_A)) return loiGraph(res, 400, 190, "Invalid token");
    if (!canh && req.method === "GET") return json(res, 200, { id: IG_A, username: "itw.demo", name: "ITW DEMO" });
    if (canh === "content_publishing_limit") return json(res, 200, { data: [{ quota_usage: gia.igHanMuc.dung, config: { quota_total: gia.igHanMuc.tong, quota_duration: 86400 } }] });
    if (canh === "media" && req.method === "POST") {
      gia.soContainer++;
      if (form.image_url) gia.igImageUrl.push(String(form.image_url));
      const c: Container = { id: id(), ig: ma, form: form as Record<string, string>, hoi: 0, status: "IN_PROGRESS" };
      gia.container.set(c.id, c);
      return json(res, 200, { id: c.id });
    }
    if (canh === "media" && req.method === "GET") return json(res, 200, { data: [...gia.igMedia.entries()].map(([k, x]) => ({ id: k, caption: x.caption, timestamp: x.ts })) });
    if (canh === "media_publish" && req.method === "POST") {
      const c = gia.container.get(String(form.creation_id));
      if (!c || c.status !== "FINISHED") return json(res, 400, { error: { message: "Media is not ready", code: 9007, error_subcode: 2207027 } });
      c.status = "PUBLISHED";
      gia.igDaDang++;
      const mid = id();
      gia.igMedia.set(mid, { caption: String(c.form.caption ?? ""), ts: gioNenTang() });
      gia.igHanMuc.dung++;
      return json(res, 200, { id: mid });
    }
    return loiGraph(res, 400, 100, "Unsupported");
  }
  // --- Đọc một đối tượng theo mã ---
  if (!canh && req.method === "GET") {
    const c = gia.container.get(ma);
    if (c) {
      if (!pageTok(PAGE_A)) return loiGraph(res, 400, 190, "Invalid token");
      c.hoi++;
      if (c.status === "IN_PROGRESS" && c.hoi > gia.igHoiCham) c.status = "FINISHED";
      return json(res, 200, { id: c.id, status_code: c.status, status: c.status });
    }
    const im = gia.igMedia.get(ma);
    if (im) return json(res, 200, { id: ma, permalink: `https://www.instagram.com/p/${ma}/`, media_type: "IMAGE", timestamp: im.ts });
    const v = gia.video.get(ma);
    if (v) return pageTok(v.page) ? json(res, 200, { id: v.id, permalink_url: v.reel ? `/reel/${v.id}/` : `https://www.facebook.com/${v.page}/videos/${v.id}/`, status: { video_status: v.status, publishing_phase: { status: v.xong ? "complete" : "not_started" } }, published: v.xong }) : loiGraph(res, 400, 190, "Invalid token");
    if (gia.anhAn.has(ma)) return json(res, 200, { id: ma });
  }
  return loiGraph(res, 404, 100, `Unknown object ${duong}`);
}

function bearer(req: IncomingMessage) {
  return /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ""))?.[1] ?? "";
}

async function google(req: IncomingMessage, res: ServerResponse, url: URL, than: Buffer) {
  const p = url.pathname;
  if (p === "/token" && req.method === "POST") {
    const f = Object.fromEntries(new URLSearchParams(than.toString("utf8")));
    if (f.client_id !== CLIENT_ID || f.client_secret !== CLIENT_SECRET) return json(res, 401, { error: "invalid_client" });
    if (f.grant_type === "authorization_code") {
      if (f.redirect_uri !== RU_GOOGLE) return json(res, 400, { error: "redirect_uri_mismatch" });
      if (f.code !== CODE.google1 && f.code !== CODE.google2) return json(res, 400, { error: "invalid_grant" });
      return json(res, 200, { access_token: TOK.ggAccess1, expires_in: 3599, scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/drive.file", token_type: "Bearer", ...(gia.ggKhongRefresh ? {} : { refresh_token: TOK.ggRefresh }) });
    }
    if (f.grant_type === "refresh_token") {
      if (f.refresh_token !== TOK.ggRefresh || gia.ggRefreshThuHoi) return json(res, 400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
      gia.soLamMoi++;
      gia.ggAccess.add(TOK.ggAccess2);
      return json(res, 200, { access_token: TOK.ggAccess2, expires_in: 3599, scope: "https://www.googleapis.com/auth/youtube.upload", token_type: "Bearer" });
    }
    return json(res, 400, { error: "unsupported_grant_type" });
  }
  if (p === "/tokeninfo") {
    const t = url.searchParams.get("access_token");
    if (t === TOK.picker) return json(res, 200, { aud: CLIENT_ID, azp: CLIENT_ID, scope: "https://www.googleapis.com/auth/drive.file", expires_in: "3400" });
    if (t === TOK.pickerLa) return json(res, 200, { aud: "999-khac.apps.googleusercontent.com", scope: "https://www.googleapis.com/auth/drive.file", expires_in: "3400" });
    return json(res, 400, { error: "invalid_token" });
  }
  if (p.startsWith("/drive/v3/files/")) {
    if (req.method !== "GET") { gia.soGoiDriveKhacGet++; return json(res, 403, { error: { code: 403, message: "không cho" } }); }
    if (bearer(req) !== TOK.picker) return json(res, 401, { error: { code: 401, message: "Invalid Credentials" } });
    const t = gia.tep.get(decodeURIComponent(p.slice("/drive/v3/files/".length)));
    if (!t) return json(res, 404, { error: { code: 404, message: "File not found", errors: [{ reason: "notFound" }] } });
    if (url.searchParams.get("alt") === "media") { res.writeHead(200, { "Content-Type": t.mime }); return res.end(t.data); }
    return json(res, 200, { id: p.split("/").pop(), name: t.name, mimeType: t.mime, size: String(t.data.length) });
  }
  // YouTube
  const tok = bearer(req);
  if (!gia.ggAccess.has(tok)) return json(res, 401, { error: { code: 401, message: "Invalid Credentials", errors: [{ reason: "authError" }] } });
  if (p === "/youtube/v3/channels") {
    if (url.searchParams.get("part") === "contentDetails") return json(res, 200, { items: [{ id: KENH_YT, contentDetails: { relatedPlaylists: { uploads: "UUcoworkDEMO" } } }] });
    return json(res, 200, { items: [{ id: KENH_YT, snippet: { title: "Kênh YouTube DEMO", customUrl: "@itwdemo" } }] });
  }
  if (p === "/youtube/v3/playlistItems") return json(res, 200, { items: [...gia.ytVideo.keys()].map((k) => ({ contentDetails: { videoId: k } })) });
  if (p === "/youtube/v3/videos" && req.method === "GET") {
    const ids = (url.searchParams.get("id") ?? "").split(",");
    return json(res, 200, { items: ids.filter((k) => gia.ytVideo.has(k)).map((k) => ({ id: k, snippet: { title: gia.ytVideo.get(k)!.title, tags: gia.ytVideo.get(k)!.tags }, status: { uploadStatus: "uploaded", privacyStatus: gia.ytVideo.get(k)!.privacy } })) });
  }
  if (p === "/upload/youtube/v3/videos" && req.method === "POST") {
    if (gia.quota403) return json(res, 403, { error: { code: 403, message: "The request cannot be completed because you have exceeded your quota.", errors: [{ reason: "quotaExceeded", domain: "youtube.quota" }] } });
    gia.soPhien++;
    const ph: PhienYt = { id: `up${id()}`, tong: Number(req.headers["x-upload-content-length"]), buf: Buffer.alloc(Number(req.headers["x-upload-content-length"])), nhan: 0, meta: JSON.parse(than.toString("utf8")), video: null };
    gia.phien.set(ph.id, ph);
    res.writeHead(200, { Location: `${site()}/upload/youtube/v3/videos?uploadType=resumable&upload_id=${ph.id}`, "Content-Length": "0" });
    return res.end();
  }
  if (p === "/upload/youtube/v3/videos" && req.method === "PUT") {
    const ph = gia.phien.get(url.searchParams.get("upload_id") ?? "");
    if (!ph) return json(res, 404, { error: { code: 404, message: "Upload not found" } });
    const cr = String(req.headers["content-range"] ?? "");
    const traXong = () => json(res, 200, { kind: "youtube#video", id: ph.video, status: { uploadStatus: "uploaded", privacyStatus: ph.meta.status?.privacyStatus } });
    if (/^bytes \*\/\d+$/.test(cr)) {
      if (ph.video) return traXong();
      res.writeHead(308, ph.nhan > 0 ? { Range: `bytes=0-${ph.nhan - 1}`, "Content-Length": "0" } : { "Content-Length": "0" });
      return res.end();
    }
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(cr);
    if (!m) return json(res, 400, { error: { code: 400, message: "Bad Content-Range" } });
    if (gia.ngatPut > 0) { gia.ngatPut--; req.socket.destroy(); return; }
    const a = Number(m[1]);
    if (a !== ph.nhan) return json(res, 400, { error: { code: 400, message: "Sai vị trí" } });
    than.copy(ph.buf, a);
    ph.nhan = a + than.length;
    if (ph.nhan >= ph.tong) {
      ph.video = `vid${id()}abc`;
      gia.ytVideo.set(ph.video, { tags: ph.meta.snippet?.tags ?? [], privacy: ph.meta.status?.privacyStatus ?? "", title: ph.meta.snippet?.title ?? "", size: ph.tong, data: ph.buf });
      return traXong();
    }
    res.writeHead(308, { Range: `bytes=0-${ph.nhan - 1}`, "Content-Length": "0" });
    return res.end();
  }
  return json(res, 404, { error: { code: 404, message: `Không có đường ${p}` } });
}

const may = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const than = await docThan(req);
  try {
    if (url.pathname.startsWith(`/${V}/`)) return await graph(req, res, url, url.pathname.slice(V.length + 2), than);
    const ru = /^\/video-upload\/v\d+\.\d\/(\d+)$/.exec(url.pathname);
    if (ru) {
      const v = gia.video.get(ru[1]);
      const tok = /^OAuth (.+)$/.exec(String(req.headers.authorization ?? ""))?.[1] ?? "";
      if (!v || gia.pageToken.get(v.page) !== tok) return loiGraph(res, 400, 190, "Invalid token");
      if (Number(req.headers.file_size) !== than.length || req.headers.offset !== "0") return loiGraph(res, 400, 100, "Thiếu offset / file_size");
      v.nhan = than.length;
      v.tong = than.length;
      return json(res, 200, { success: true });
    }
    return await google(req, res, url, than);
  } catch (e) {
    return json(res, 500, { error: { message: e instanceof Error ? e.message : String(e) } });
  }
});

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------
async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "198.51.100.10", "thu-mxh-ket-noi"));
  }, { timeoutMs: 120_000 });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string): Promise<void> {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu = kieu === "quyen" ? e instanceof LoiThieuQuyen : kieu === "khong-thay" ? e instanceof LoiKhongTimThay : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}

const target = (postId: string, connectionId: string) => chu.socialPostTarget.findFirstOrThrow({ where: { postId, connectionId } });

const LOG: string[] = [];
for (const k of ["log", "warn", "error"] as const) {
  const goc = console[k].bind(console);
  console[k] = (...a: unknown[]) => {
    LOG.push(a.map((x) => (x instanceof Error ? x.message : typeof x === "string" ? x : JSON.stringify(x))).join(" "));
    goc(...a);
  };
}

async function main() {
  await new Promise<void>((ok) => may.listen(0, "127.0.0.1", () => ok()));
  cong = (may.address() as { port: number }).port;
  choPhepLocalhostChoBaiThu(true);
  datGocApiChoBaiThu({ graph: site(), graphVideo: site(), rupload: site(), facebookWeb: "https://www.facebook.com", googleAuth: "https://accounts.google.com", googleOAuth: site(), googleApis: site() });
  const sharp = (await import("sharp")).default;
  console.log("=== Thử 0.24.0 — Mạng xã hội: Facebook, Instagram, YouTube, Google Drive (máy chủ GIẢ) ===\n");

  const T = await seedNenMong(chu, `thu-mxhkn-${DAU}`, "Doanh nghiệp thử MXH kết nối");
  const T2 = (await seedNenMong(chu, `thu-mxhkn2-${DAU}`, "Doanh nghiệp thử MXH kết nối 2")).id;
  const vaiTro = async (code: string, t = T.id) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: t, code } } })).id;
  async function nguoi(ten: string, vai: string, o: { hai?: boolean; t?: string; quanLy?: string } = {}) {
    const t = o.t ?? T.id;
    const u = await chu.user.create({
      data: {
        tenantId: t, email: `${ten}.${DAU}@thu.test`, passwordHash: "x", fullName: `${ten} DEMO`,
        ...(o.hai ? { totpEnabledAt: MOC, totpSecretEnc: "v1:thu" } : {}),
        userRoles: { create: { tenantId: t, roleId: await vaiTro(vai, t) } },
        staffProfile: { create: { tenantId: t, hiredAt: new Date("2025-01-01T00:00:00Z"), managerId: o.quanLy ?? null } },
      },
    });
    return u.id;
  }
  const gd = await nguoi("giam-doc", "ceo", { hai: true });
  const tpmk = await nguoi("tp-marketing", "marketing-manager", { quanLy: gd });
  const mk = await nguoi("marketing", "marketing", { quanLy: tpmk });
  const kd = await nguoi("kinh-doanh", "sales", { quanLy: gd });
  const mkT2 = await nguoi("marketing-2", "marketing", { t: T2 });
  const tId = T.id;
  const REF = maPhien(mk, tId, 1_000);
  const REF_KHAC = maPhien(mk, tId, 2_000);
  await voi(tId, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "mxh.han_goi_giay": 5, "mxh.cho_doi_soat_giay": 0, "mxh.so_lan_thu_toi_da": 3 } }));

  // ==================================================================
  console.log("— 1. Thông tin app + màn hình đồng ý —");
  await nemLoi("Chưa nhập app Meta → không bắt đầu kết nối được", "nghiep-vu", () => voi(tId, mk, (nc) => batDauOAuth(nc, "meta", {}, REF, MOC)), "chua-cau-hinh-app");
  await voi(tId, gd, (nc) => luuThongTinApp(nc, "META", { appId: APP_ID, biMat: APP_SECRET, graphVersion: V }));
  await nemLoi("Google API key (Picker) sai dạng → 400", "nghiep-vu", () => voi(tId, gd, (nc) => luuThongTinApp(nc, "GOOGLE", { clientId: CLIENT_ID, biMat: CLIENT_SECRET, khoaPicker: "ngan" })), "sai-dinh-dang");
  await voi(tId, gd, (nc) => luuThongTinApp(nc, "GOOGLE", { clientId: CLIENT_ID, biMat: CLIENT_SECRET, khoaPicker: KHOA_PICKER }));
  const dsApp = await voi(tId, gd, (nc) => danhSachThongTinApp(nc));
  const gg = dsApp.dong.find((d) => d.nhaCungCap === "GOOGLE")!;
  dat("Google: API key Picker đã lưu, chỉ hiện 4 ký tự cuối; phản hồi không chứa khóa", gg.coKhoaPicker === true && gg.khoaPickerBonSoCuoi === KHOA_PICKER.slice(-4) && !JSON.stringify(dsApp).includes(KHOA_PICKER));
  const dongGg = await chu.socialAppConfig.findFirstOrThrow({ where: { tenantId: tId, provider: "GOOGLE" } });
  dat("CSDL: API key Picker mã hóa (không có bản rõ)", !!dongGg.pickerKeyEnc && !dongGg.pickerKeyEnc.includes(KHOA_PICKER));
  const u = urlCanDan(APP_URL_HTTPS, T.code);
  dat("Màn hình Kết nối nền tảng có URL Điều khoản / Quyền riêng tư / Xóa dữ liệu / Data Deletion Callback", u.dieuKhoan === `${APP_URL_HTTPS}/dieu-khoan?dn=${T.code}` && u.quyenRiengTu!.includes("/quyen-rieng-tu") && u.xoaDuLieu!.includes("/xoa-du-lieu") && u.xoaDuLieuCallback === `${APP_URL_HTTPS}/api/cong-khai/mxh/meta/xoa-du-lieu/${T.code}` && u.callback.META === RU_META);
  const dy = await voi(tId, mk, (nc) => manHinhDongY(nc, "meta", null));
  dat("Màn hình đồng ý: tên nền tảng + đủ quyền xin (pages_manage_posts, instagram_content_publish…) + giải thích", dy.loi === null && dy.ten.includes("Meta") && ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "publish_video", "instagram_basic", "instagram_content_publish"].every((q) => dy.quyen.some((x) => x.ma === q && x.giaiThich.length > 10)));
  const dyG = await voi(tId, mk, (nc) => manHinhDongY(nc, "google", null));
  dat("Google: xin youtube.upload, youtube.readonly, drive.file — KHÔNG drive.readonly", dyG.quyen.map((q) => q.ma.split("/").pop()).join() === "youtube.upload,youtube.readonly,drive.file" && !JSON.stringify(dyG).includes("drive.readonly"));
  await nemLoi("Kinh doanh không bắt đầu kết nối được (thiếu mxh.update)", "quyen", () => voi(tId, kd, (nc) => batDauOAuth(nc, "meta", {}, REF, MOC)));

  // ==================================================================
  console.log("\n— 2. OAuth: state một lần, 10 phút, gắn phiên; redirect khớp chính xác —");
  const st = (url: string) => new URL(url).searchParams.get("state")!;
  const b1 = await voi(tId, mk, (nc) => batDauOAuth(nc, "meta", {}, REF, MOC));
  const u1 = new URL(b1.url);
  dat("URL đăng nhập Meta: đúng app, redirect_uri CỐ ĐỊNH theo APP_URL, có state, xin quyền", u1.searchParams.get("client_id") === APP_ID && u1.searchParams.get("redirect_uri") === RU_META && !!u1.searchParams.get("state") && u1.searchParams.get("scope")!.includes("pages_manage_posts") && u1.pathname === `/${V}/dialog/oauth`);
  const dongYc = await chu.socialOauthRequest.findUniqueOrThrow({ where: { id: b1.yeuCauId } });
  dat("CSDL chỉ giữ MÃ BĂM của state; hạn đúng 10 phút", !JSON.stringify(dongYc).includes(st(b1.url)) && dongYc.expiresAt.getTime() - MOC.getTime() === 600_000 && dongYc.status === "CHO_DONG_Y");
  const cb = (ncc: string, q: Record<string, string>, ref = REF, duong = DUONG_META, luc = sau(60), ai = mk, t = tId) => voi(t, ai, (nc) => nhanCallbackOAuth(nc, ncc, q, ref, duong, luc));
  let k = await cb("meta", { code: CODE.meta1, state: "state-gia-mao" });
  dat("state sai → từ chối (state-sai)", !k.ok && k.ma === "state-sai");
  k = await cb("meta", { code: CODE.meta1 });
  dat("thiếu state → từ chối", !k.ok && k.ma === "thieu-state");
  k = await cb("meta", { code: CODE.meta1, state: st(b1.url) }, REF_KHAC);
  dat("state đúng nhưng PHIÊN khác → từ chối và đốt state", !k.ok && k.ma === "sai-phien");
  k = await cb("meta", { code: CODE.meta1, state: st(b1.url) });
  dat("…dùng lại state đã đốt → từ chối (dùng một lần)", !k.ok && k.ma === "state-da-dung");
  const b2 = await voi(tId, mk, (nc) => batDauOAuth(nc, "meta", {}, REF, MOC));
  k = await cb("meta", { code: CODE.meta1, state: st(b2.url) }, REF, DUONG_META, sau(601));
  dat("quá 10 phút → từ chối (state-het-han)", !k.ok && k.ma === "state-het-han");
  const b3 = await voi(tId, mk, (nc) => batDauOAuth(nc, "meta", {}, REF, MOC));
  k = await cb("google", { code: CODE.meta1, state: st(b3.url) }, REF, DUONG_GOOGLE);
  dat("state Meta quay về đường callback Google (redirect lạ) → từ chối", !k.ok && k.ma === "sai-nen-tang");
  const b4 = await voi(tId, mk, (nc) => batDauOAuth(nc, "meta", {}, REF, MOC));
  k = await cb("meta", { code: CODE.meta1, state: st(b4.url) }, REF, "/api/cong-khai/mxh/oauth/meta/callback-khac");
  dat("Đường quay về không khớp Redirect URI → từ chối", !k.ok && k.ma === "redirect-khong-khop");
  const b5 = await voi(tId, mk, (nc) => batDauOAuth(nc, "meta", {}, REF, MOC));
  k = await cb("meta", { error: "access_denied", error_description: "Permissions error", state: st(b5.url) });
  dat("Người dùng từ chối trên Facebook → báo rõ", !k.ok && k.ma === "tu-choi");
  const b6 = await voi(tId, mk, (nc) => batDauOAuth(nc, "meta", {}, REF, MOC));
  k = await voi(T2, mkT2, (nc) => nhanCallbackOAuth(nc, "meta", { code: CODE.meta1, state: st(b6.url) }, maPhien(mkT2, T2, 1_000), DUONG_META, sau(60)));
  dat("Doanh nghiệp khác dùng state của T → không thấy (RLS)", !k.ok && k.ma === "state-sai");
  k = await cb("meta", { code: CODE.meta1, state: st(b6.url) }, REF, DUONG_META, sau(60), tpmk);
  dat("Người khác cùng doanh nghiệp dùng state → sai phiên", !k.ok && k.ma === "sai-phien");
  const b7 = await voi(tId, mk, (nc) => batDauOAuth(nc, "meta", {}, REF, MOC));
  k = await cb("meta", { code: CODE.meta1, state: st(b7.url) });
  dat("Callback hợp lệ → chờ máy nền đổi mã", k.ok && (await chu.socialOauthRequest.findUniqueOrThrow({ where: { id: b7.yeuCauId } })).status === "CHO_DOI_MA");
  const yc7 = await chu.socialOauthRequest.findUniqueOrThrow({ where: { id: b7.yeuCauId } });
  dat("Mã code niêm phong (không có bản rõ trong CSDL)", !!yc7.ciphertext && !Buffer.from(yc7.ciphertext!).toString("latin1").includes(CODE.meta1) && !JSON.stringify(yc7).includes(CODE.meta1));
  k = await cb("meta", { code: CODE.meta1, state: st(b7.url) });
  dat("Gọi lại callback cùng state → từ chối", !k.ok && k.ma === "state-da-dung");

  // ==================================================================
  console.log("\n— 3. Worker đổi mã → token dài hạn → Page + Instagram → chọn kênh —");
  await doiMaOAuthDaXep(tId, sau(70));
  const tt = await voi(tId, mk, (nc) => trangThaiYeuCauOAuth(nc, b7.yeuCauId, sau(75)));
  dat("Đổi mã xong: 2 Page + 1 Instagram chờ chọn; không thiếu quyền", tt.trangThai === "DA_SAN_SANG" && tt.ungVien.length === 3 && tt.ungVien.filter((x) => x.nenTang === "FACEBOOK_PAGE").length === 2 && tt.ungVien.some((x) => x.nenTang === "INSTAGRAM" && x.ma === IG_A) && tt.quyenThieu.length === 0, JSON.stringify(tt));
  dat("Page không có quyền tạo nội dung được ghi chú", tt.ungVien.find((x) => x.ma === PAGE_B)?.ghiChu !== null);
  const yc7b = await chu.socialOauthRequest.findUniqueOrThrow({ where: { id: b7.yeuCauId } });
  dat("Mã code đã bị xóa sau khi đổi (dùng một lần); lưu người cấp quyền", !yc7b.ciphertext && yc7b.oauthSubject === META_USER);
  dat("Graph nhận appsecret_proof đúng ở mọi lệnh", gia.proofSai === 0);
  const uvDb = await chu.socialOauthCandidate.findMany({ where: { requestId: b7.yeuCauId } });
  dat("Token Page trong kênh chờ chọn đã niêm phong theo AAD kênh sẽ tạo", uvDb.every((c) => !Buffer.from(c.ciphertext).toString("latin1").includes("EAA")) && JSON.parse(moNiemPhong(uvDb.find((c) => c.externalId === PAGE_A)!, aadKenh(tId, uvDb.find((c) => c.externalId === PAGE_A)!.connectionId))).accessToken === TOK.pageA);
  await nemLoi("Người khác (Trưởng phòng) không xem được lần kết nối của mình", "khong-thay", () => voi(tId, tpmk, (nc) => trangThaiYeuCauOAuth(nc, b7.yeuCauId, sau(75))));
  await nemLoi("Doanh nghiệp khác không xem / chọn được (IDOR)", "khong-thay", () => voi(T2, mkT2, (nc) => chonKenhOAuth(nc, b7.yeuCauId, [uvDb[0].id], sau(80))));
  const idA = tt.ungVien.find((x) => x.ma === PAGE_A)!.id;
  const idIg = tt.ungVien.find((x) => x.ma === IG_A)!.id;
  const chonKq = await voi(tId, mk, (nc) => chonKenhOAuth(nc, b7.yeuCauId, [idA, idIg], sau(80)));
  dat("Chọn Page A + Instagram → 2 kênh mới", chonKq.kenh.length === 2 && chonKq.kenh.every((x) => x.moi));
  const kenhs = await voi(tId, mk, (nc) => danhSachKenh(nc));
  const kFb = kenhs.find((x) => x.nenTang === "FACEBOOK_PAGE")!;
  const kIg = kenhs.find((x) => x.nenTang === "INSTAGRAM")!;
  dat("Kênh OAuth: ACTIVE, có liên kết, không lộ token", kFb.oauth && kFb.trangThai === "ACTIVE" && kFb.lienKet === `https://www.facebook.com/${PAGE_A}` && kIg.lienKet === "https://www.instagram.com/itw.demo" && !JSON.stringify(kenhs).includes("EAA"));
  dat("Kênh chờ chọn đã xóa (token Page B không giữ); lần kết nối HOAN_TAT", (await chu.socialOauthCandidate.count({ where: { requestId: b7.yeuCauId } })) === 0 && (await chu.socialOauthRequest.findUniqueOrThrow({ where: { id: b7.yeuCauId } })).status === "HOAN_TAT");
  const credFb = await chu.socialCredential.findUniqueOrThrow({ where: { connectionId: kFb.id } });
  dat("Worker mở được token Page của kênh (AAD = kênh)", JSON.parse(moNiemPhong(credFb, aadKenh(tId, kFb.id))).accessToken === TOK.pageA);
  await nemLoi("Chọn lại sau khi đã lưu → 409", "nghiep-vu", () => voi(tId, mk, (nc) => chonKenhOAuth(nc, b7.yeuCauId, [idA], sau(81))), "sai-trang-thai");
  await voi(tId, mk, async (nc) => { await nc.tx.socialConnection.update({ where: { id: kFb.id }, data: { checkRequestedAt: sau(82) } }); });
  await kiemTraKenhDaXep(tId, sau(83));
  dat("Kiểm tra lại kênh Facebook (worker, appsecret_proof) → đạt", (await chu.socialConnection.findUniqueOrThrow({ where: { id: kFb.id } })).lastCheckOk === true);

  // ==================================================================
  console.log("\n— 4. OAuth Google → kênh YouTube (refresh token) —");
  const bg = await voi(tId, mk, (nc) => batDauOAuth(nc, "google", {}, REF, MOC));
  const ug = new URL(bg.url);
  dat("URL Google: access_type=offline, prompt=consent, redirect khớp, có drive.file", ug.searchParams.get("access_type") === "offline" && ug.searchParams.get("prompt") === "consent" && ug.searchParams.get("redirect_uri") === RU_GOOGLE && ug.searchParams.get("scope")!.includes("drive.file") && !ug.searchParams.get("scope")!.includes("drive.readonly"));
  gia.ggKhongRefresh = true;
  k = await cb("google", { code: CODE.google1, state: st(bg.url) }, REF, DUONG_GOOGLE);
  await doiMaOAuthDaXep(tId, sau(70));
  const ttg0 = await voi(tId, mk, (nc) => trangThaiYeuCauOAuth(nc, bg.yeuCauId, sau(75)));
  dat("Google không trả refresh token → LOI kèm hướng dẫn gỡ quyền rồi kết nối lại", k.ok && ttg0.trangThai === "LOI" && /refresh token/.test(ttg0.loi ?? ""));
  gia.ggKhongRefresh = false;
  const bg2 = await voi(tId, mk, (nc) => batDauOAuth(nc, "google", {}, REF, MOC));
  await cb("google", { code: CODE.google2, state: st(bg2.url) }, REF, DUONG_GOOGLE);
  await doiMaOAuthDaXep(tId, sau(70));
  const ttg = await voi(tId, mk, (nc) => trangThaiYeuCauOAuth(nc, bg2.yeuCauId, sau(75)));
  dat("Đổi mã Google → 1 kênh YouTube chờ chọn", ttg.trangThai === "DA_SAN_SANG" && ttg.ungVien.length === 1 && ttg.ungVien[0].ma === KENH_YT, JSON.stringify(ttg));
  await voi(tId, mk, (nc) => chonKenhOAuth(nc, bg2.yeuCauId, [ttg.ungVien[0].id], sau(80)));
  const kYt = (await voi(tId, mk, (nc) => danhSachKenh(nc))).find((x) => x.nenTang === "YOUTUBE")!;
  const credYt = await chu.socialCredential.findUniqueOrThrow({ where: { connectionId: kYt.id } });
  const xtYt = JSON.parse(moNiemPhong(credYt, aadKenh(tId, kYt.id)));
  dat("Kênh YouTube: lưu refresh token (niêm phong), hạn access token ghi riêng", xtYt.refreshToken === TOK.ggRefresh && credYt.tokenExpiresAt?.getTime() === sau(70 + 3599).getTime());

  // ==================================================================
  console.log("\n— 5. Facebook Page: chữ + link, một ảnh, nhiều ảnh, video (start/transfer/finish), Reels —");
  const jpg = await sharp({ create: { width: 1080, height: 1080, channels: 3, background: "#3366cc" } }).jpeg().toBuffer();
  const png45 = await sharp({ create: { width: 1080, height: 1350, channels: 4, background: "#cc6633" } }).png().toBuffer();
  const pngDoc = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: "#111111" } }).png().toBuffer();
  const mp4Video = taoMp4({ rong: 1280, cao: 720, giay: 45, tongByte: 700_000 });
  const mp4Reel = taoMp4({ rong: 1080, cao: 1920, giay: 20, tongByte: 400_000 });
  const tao = (tieuDe: string, noiDung: string, kenhIds: string[], tuyChon?: object) => voi(tId, mk, (nc) => taoBai(nc, { tieuDe, noiDung, kenhIds, ...(tuyChon ? { tuyChon } : {}) }));
  const dinh = (postId: string, tenTep: string, noiDung: Buffer) => voi(tId, mk, (nc) => dinhKemTep(nc, { loai: "social_post", doiTuongId: postId, tenTep, noiDung: new Uint8Array(noiDung) }));
  const vong = (giay: number) => dangBaiMotVong(tId, "w-kn", sau(giay));

  const p1 = await tao("Chữ + link DEMO", "Khuyến mãi tháng 12 DEMO", [kFb.id], { lienKet: "https://itw.vn/khuyen-mai" });
  const p1d = await voi(tId, mk, (nc) => dangNgay(nc, p1.id, sau(100)));
  dat("Đăng ngay: kiểu nội dung chốt = Chữ / liên kết", p1d.kenh[0].kieuNoiDung === "fb-chu" && p1d.kenh[0].trangThai === "QUEUED");
  await vong(100);
  let t = await target(p1.id, kFb.id);
  const baiFb1 = gia.bai.get(t.externalPostId ?? "");
  dat("Chữ + link → PUBLISHED, permalink đã xác minh; Facebook nhận message + link", t.status === "PUBLISHED" && !!t.externalUrl?.startsWith("https://www.facebook.com/") && baiFb1?.link === "https://itw.vn/khuyen-mai" && baiFb1.message === "Khuyến mãi tháng 12 DEMO");

  const p2 = await tao("Một ảnh DEMO", "Ảnh sản phẩm DEMO", [kFb.id]);
  await dinh(p2.id, "san-pham.jpg", jpg);
  await voi(tId, mk, (nc) => dangNgay(nc, p2.id, sau(110)));
  await vong(110);
  t = await target(p2.id, kFb.id);
  dat("Một ảnh → POST /photos (đẩy byte) → mã bài post_id → PUBLISHED", t.status === "PUBLISHED" && t.contentKind === "fb-anh" && gia.bai.get(t.externalPostId!)?.photo === true);

  const p3 = await tao("Nhiều ảnh DEMO", "Album DEMO", [kFb.id]);
  await dinh(p3.id, "a1.jpg", jpg);
  await dinh(p3.id, "a2.png", png45);
  const truocAnh = gia.anhAn.size;
  await voi(tId, mk, (nc) => dangNgay(nc, p3.id, sau(120)));
  await vong(120);
  t = await target(p3.id, kFb.id);
  const album = gia.bai.get(t.externalPostId!);
  dat("Nhiều ảnh → 2 ảnh chưa đăng (published=false) rồi gộp attached_media → PUBLISHED", t.status === "PUBLISHED" && gia.anhAn.size - truocAnh === 2 && album?.attached.length === 2 && album.attached.every((a) => gia.anhAn.has(a)));

  const p4 = await tao("Video DEMO", "Video giới thiệu DEMO", [kFb.id]);
  await dinh(p4.id, "gioi-thieu.mp4", mp4Video);
  await voi(tId, mk, (nc) => dangNgay(nc, p4.id, sau(130)));
  await vong(130);
  t = await target(p4.id, kFb.id);
  const vFb = gia.video.get(t.externalPostId ?? "");
  dat("Video → start / transfer (3 đoạn) / finish → đọc lại status ready + permalink → PUBLISHED", t.status === "PUBLISHED" && t.contentKind === "fb-video" && vFb?.nhan === mp4Video.length && vFb.xong && !!t.externalUrl, `${t.status} ${t.errorMessage}`);
  const nk4 = await voi(tId, mk, (nc) => nhatKyDang(nc, p4.id));
  dat("Nhật ký: 1 start + 3 transfer + finish + verify", nk4.filter((x) => x.buoc === "media").length === 4 && nk4.some((x) => x.buoc === "publish") && nk4.some((x) => x.buoc === "verify"));

  const p5 = await tao("Reels DEMO", "Reels ngắn DEMO", [kFb.id], { facebookReels: true });
  await dinh(p5.id, "reel.mp4", mp4Reel);
  await voi(tId, mk, (nc) => dangNgay(nc, p5.id, sau(140)));
  await vong(140);
  t = await target(p5.id, kFb.id);
  dat("Reels → start / rupload (transfer) / finish → permalink /reel/ → PUBLISHED", t.status === "PUBLISHED" && t.contentKind === "fb-reels" && t.externalUrl === `https://www.facebook.com/reel/${t.externalPostId}/` && gia.video.get(t.externalPostId!)?.reel === true);
  const p5b = await tao("Reels ngang DEMO", "Reels sai khổ", [kFb.id], { facebookReels: true });
  await dinh(p5b.id, "ngang.mp4", mp4Video);
  await nemLoi("Reels video ngang 45 giây → 422 kèm lý do (không chuyển mã)", "nghiep-vu", () => voi(tId, mk, (nc) => dangNgay(nc, p5b.id, sau(141))), "noi-dung-chua-hop-le");

  // Hạn mức 30 Reels / 24 giờ — dựng 29 Reels đã đăng (cộng 1 ở trên = 30).
  const cu = await chu.socialPost.createManyAndReturn({ data: Array.from({ length: 29 }, (_, i) => ({ tenantId: tId, title: `Reels cũ ${i} DEMO`, body: "x", status: "PUBLISHED", createdBy: mk })), select: { id: true } });
  await chu.socialPostTarget.createMany({ data: cu.map((c, i) => ({ tenantId: tId, postId: c.id, connectionId: kFb.id, status: "PUBLISHED", contentKind: "fb-reels", reconcileKey: `cu-${i}-${DAU}`, externalPostId: `9${i}`, externalUrl: "https://www.facebook.com/reel/1/", verifiedAt: sau(-3600), publishedAt: sau(-3600) })) });
  const p5c = await tao("Reels thứ 31 DEMO", "Reels quá hạn mức", [kFb.id], { facebookReels: true });
  await dinh(p5c.id, "reel2.mp4", mp4Reel);
  await nemLoi("Reels thứ 31 trong 24 giờ → 409 trước khi xếp hàng", "nghiep-vu", () => voi(tId, mk, (nc) => dangNgay(nc, p5c.id, sau(150))), "han-muc-reels");
  dat("…hẹn sau 24 giờ thì xếp được", (await voi(tId, mk, (nc) => henGio(nc, p5c.id, sau(150 + 2 * 86400).toISOString(), sau(150)))).trangThai === "SCHEDULED");

  // ==================================================================
  console.log("\n— 6. Bốn loại lỗi trên Facebook —");
  const p6 = await tao("Lỗi tạm DEMO", "Bài gặp lỗi tạm DEMO", [kFb.id]);
  gia.hangFeed.push("500");
  await voi(tId, mk, (nc) => dangNgay(nc, p6.id, sau(200)));
  await vong(200);
  t = await target(p6.id, kFb.id);
  dat("RETRYABLE (500, code 2, is_transient) → QUEUED thử lại sau 30 giây", t.status === "QUEUED" && t.errorClass === "RETRYABLE" && t.nextAttemptAt?.getTime() === sau(230).getTime());
  await vong(230);
  t = await target(p6.id, kFb.id);
  dat("…lần 2: đối soát trước (không thấy) → đăng → PUBLISHED, một bài", t.status === "PUBLISHED" && [...gia.bai.values()].filter((b) => b.message === "Bài gặp lỗi tạm DEMO").length === 1);

  const p7 = await tao("Lỗi vĩnh viễn DEMO", "Bài bị từ chối DEMO", [kFb.id]);
  gia.hangFeed.push("100");
  await voi(tId, mk, (nc) => dangNgay(nc, p7.id, sau(300)));
  await vong(300);
  t = await target(p7.id, kFb.id);
  dat("PERMANENT (400, code 100) → FAILED ngay, có thông báo của Meta", t.status === "FAILED" && t.errorClass === "PERMANENT" && t.attemptCount === 1 && /Invalid parameter/.test(t.errorMessage ?? ""));

  const p7b = await tao("Lỗi nhại token DEMO", "Bài gặp lỗi nhại token DEMO", [kFb.id]);
  gia.hangFeed.push("nhai");
  await voi(tId, mk, (nc) => dangNgay(nc, p7b.id, sau(350)));
  await vong(350);
  t = await target(p7b.id, kFb.id);
  const nk7b = JSON.stringify(await chu.socialPublishAttempt.findMany({ where: { targetId: t.id } }));
  dat("Lỗi nền tảng nhại lại token / appsecret_proof → che (***) trong kênh-bài và nhật ký gọi (luật QA 0.23)", t.status === "FAILED" && (t.errorMessage ?? "").includes("***") && !(t.errorMessage ?? "").includes(TOK.pageA) && !nk7b.includes(TOK.pageA) && !nk7b.includes(createHmac("sha256", APP_SECRET).update(TOK.pageA).digest("hex")), t.errorMessage ?? "");

  const p8 = await tao("Treo DEMO", "Bài hết giờ sau khi gửi DEMO", [kFb.id]);
  gia.hangFeed.push("treo");
  const feedTruoc = gia.soFeed;
  await voi(tId, mk, (nc) => dangNgay(nc, p8.id, sau(400)));
  await vong(400);
  t = await target(p8.id, kFb.id);
  dat("UNKNOWN (hết giờ sau khi gửi) → VERIFYING, không đăng lại mù", t.status === "VERIFYING" && t.errorClass === "UNKNOWN", `${t.status} ${t.errorClass}`);
  await vong(401);
  t = await target(p8.id, kFb.id);
  dat("…đối soát theo nội dung + mốc giờ tìm thấy bài → PUBLISHED, Facebook chỉ nhận 1 lần", t.status === "PUBLISHED" && gia.soFeed - feedTruoc === 1 && [...gia.bai.values()].filter((b) => b.message === "Bài hết giờ sau khi gửi DEMO").length === 1);

  const p9 = await tao("Token hết hạn DEMO", "Bài gặp token hết hạn DEMO", [kFb.id]);
  gia.hangFeed.push("190");
  await voi(tId, mk, (nc) => dangNgay(nc, p9.id, sau(500)));
  await vong(500);
  t = await target(p9.id, kFb.id);
  const kFbSau = await chu.socialConnection.findUniqueOrThrow({ where: { id: kFb.id } });
  dat("NEEDS_REAUTH (code 190) → FAILED, kênh NEEDS_REAUTH", t.status === "FAILED" && t.errorClass === "NEEDS_REAUTH" && kFbSau.status === "NEEDS_REAUTH");
  dat("…báo Marketing (người giữ mxh.update) để Kết nối lại", (await chu.notification.count({ where: { tenantId: tId, userId: mk, type: "mxh-kenh-can-ket-noi-lai" } })) >= 1 && (await chu.notification.count({ where: { tenantId: tId, userId: tpmk, type: "mxh-kenh-can-ket-noi-lai" } })) >= 1);
  const ct9 = await voi(tId, mk, (nc) => chiTietBai(nc, p9.id));
  dat("…trang bài: hướng dẫn “Kết nối lại”", ct9.kenh[0].kenhOAuth && /Kết nối lại/.test(ct9.kenh[0].huongDan ?? ""));
  await nemLoi("Đăng lại khi kênh chưa kết nối lại → 409", "nghiep-vu", () => voi(tId, mk, (nc) => dangLai(nc, p9.id, sau(510))), "kenh-can-nhap-lai");
  // Kết nối lại: token mới cho Page A.
  gia.pageToken.set(PAGE_A, TOK.pageA2);
  const br = await voi(tId, mk, (nc) => batDauOAuth(nc, "meta", { kenhId: kFb.id }, REF, sau(520)));
  await cb("meta", { code: CODE.meta2, state: st(br.url) }, REF, DUONG_META, sau(530));
  await doiMaOAuthDaXep(tId, sau(540));
  const ttr = await voi(tId, mk, (nc) => trangThaiYeuCauOAuth(nc, br.yeuCauId, sau(545)));
  const uvA = ttr.ungVien.find((x) => x.ma === PAGE_A)!;
  dat("Kết nối lại: Page A là kênh đã nối (chọn sẵn)", uvA.daNoi && uvA.chonSan);
  await voi(tId, mk, (nc) => chonKenhOAuth(nc, br.yeuCauId, [uvA.id, ttr.ungVien.find((x) => x.ma === IG_A)!.id], sau(550)));
  const kFbLai = await chu.socialConnection.findUniqueOrThrow({ where: { id: kFb.id }, include: { credential: true } });
  dat("…kênh ACTIVE, cùng mã kênh, token mới", kFbLai.status === "ACTIVE" && JSON.parse(moNiemPhong(kFbLai.credential!, aadKenh(tId, kFb.id))).accessToken === TOK.pageA2);
  await voi(tId, mk, (nc) => dangLai(nc, p9.id, sau(560)));
  await vong(560);
  dat("…Đăng lại → PUBLISHED", (await target(p9.id, kFb.id)).status === "PUBLISHED");

  // ==================================================================
  console.log("\n— 7. Instagram: https, JPEG, carousel, Reels, container, hạn mức —");
  const q1 = await tao("IG ảnh DEMO", "Ảnh Instagram DEMO #itw", [kIg.id]);
  await dinh(q1.id, "vuong.jpg", jpg);
  process.env.APP_URL = "http://cowork.noi-bo";
  await nemLoi("APP_URL không https → 422 “Instagram cần Cowork chạy ở địa chỉ https công khai”", "nghiep-vu", () => voi(tId, mk, (nc) => dangNgay(nc, q1.id, sau(600))), "noi-dung-chua-hop-le");
  try { await voi(tId, mk, (nc) => dangNgay(nc, q1.id, sau(600))); } catch (e) { dat("…lời báo đúng câu", e instanceof Error && e.message.includes("Instagram cần Cowork chạy ở địa chỉ https công khai")); }
  process.env.APP_URL = APP_URL_HTTPS;
  gia.igHoiCham = 1;
  await voi(tId, mk, (nc) => dangNgay(nc, q1.id, sau(600)));
  await vong(600);
  t = await target(q1.id, kIg.id);
  const urlAnh = gia.igImageUrl.at(-1) ?? "";
  const maAnh = urlAnh.split("/").pop() ?? "";
  dat("Ảnh JPEG: container (IN_PROGRESS → FINISHED) → media_publish → permalink → PUBLISHED", t.status === "PUBLISHED" && t.contentKind === "ig-anh" && t.externalUrl === `https://www.instagram.com/p/${t.externalPostId}/`, `${t.status} ${t.errorMessage}`);
  dat("…ảnh đưa sang bằng LINK KÝ trên tên miền Cowork (https), mã hợp lệ", urlAnh.startsWith(`${APP_URL_HTTPS}/api/cong-khai/mxh/media/`) && kiemMaMedia(maAnh, sau(600)).ok);

  const q2 = await tao("IG PNG DEMO", "Ảnh PNG đổi JPEG DEMO", [kIg.id]);
  const tepPng = await dinh(q2.id, "doc-4-5.png", png45);
  process.env.MXH_TAT_DOI_JPEG = "1";
  napLaiThuVienAnhChoBaiThu();
  try { await voi(tId, mk, (nc) => dangNgay(nc, q2.id, sau(700))); dat("Không có thư viện ảnh → từ chối PNG kèm hướng dẫn", false); } catch (e) { dat("Không có thư viện ảnh → từ chối PNG kèm hướng dẫn tự đổi JPEG", e instanceof LoiNghiepVu && /Lưu thành \(Save as\) JPEG/.test(e.message)); }
  delete process.env.MXH_TAT_DOI_JPEG;
  napLaiThuVienAnhChoBaiThu();
  await voi(tId, mk, (nc) => dangNgay(nc, q2.id, sau(700)));
  await vong(700);
  t = await target(q2.id, kIg.id);
  const urlPng = gia.igImageUrl.at(-1) ?? "";
  const kqMa = kiemMaMedia(urlPng.split("/").pop() ?? "", sau(700));
  dat("PNG + có thư viện ảnh → link ký cờ JPEG → PUBLISHED", t.status === "PUBLISHED" && kqMa.ok && kqMa.noiDung.jpeg === true);
  const maXa = kyMaMedia({ tenantId: tId, postId: q2.id, attachmentId: tepPng.id, hetHanGiay: 4_102_444_800, jpeg: true });
  const phJ = await phatMedia(new NextRequest(`${APP_URL_HTTPS}/api/cong-khai/mxh/media/${maXa}`), { params: Promise.resolve({ ma: maXa }) });
  const thanJ = Buffer.from(await phJ.arrayBuffer());
  dat("…route công khai phát bản JPEG (đúng kiểu, byte JPEG)", phJ.status === 200 && phJ.headers.get("content-type") === "image/jpeg" && thanJ[0] === 0xff && thanJ[1] === 0xd8);

  const q3 = await tao("IG carousel DEMO", "Carousel ba ảnh DEMO", [kIg.id]);
  await dinh(q3.id, "c1.jpg", jpg);
  await dinh(q3.id, "c2.jpg", jpg);
  await dinh(q3.id, "c3.png", png45);
  const ctTruoc = gia.soContainer;
  gia.igHoiCham = 0;
  await voi(tId, mk, (nc) => dangNgay(nc, q3.id, sau(800)));
  await vong(800);
  t = await target(q3.id, kIg.id);
  const cha = [...gia.container.values()].at(-1)!;
  dat("Carousel: 3 container con + 1 container CAROUSEL (children) → PUBLISHED", t.status === "PUBLISHED" && t.contentKind === "ig-carousel" && gia.soContainer - ctTruoc === 4 && cha.form.media_type === "CAROUSEL" && cha.form.children.split(",").length === 3);

  const q4 = await tao("IG Reels DEMO", "Reels Instagram DEMO", [kIg.id]);
  await dinh(q4.id, "reel-ig.mp4", mp4Reel);
  gia.igHoiCham = 99;
  const ctTruoc4 = gia.soContainer;
  await voi(tId, mk, (nc) => dangNgay(nc, q4.id, sau(900)));
  await vong(900);
  t = await target(q4.id, kIg.id);
  dat("Reels: container REELS chưa xử lý xong sau vài lần hỏi → HOÃN 30 giây (không tính lần thử), giữ container", t.status === "QUEUED" && t.attemptCount === 0 && t.errorCode === "ig-dang-xu-ly" && t.nextAttemptAt?.getTime() === sau(930).getTime() && !!(t.mediaExternal as Record<string, string>).__igContainer, `${t.status} ${t.attemptCount} ${t.errorCode}`);
  gia.igHoiCham = 0;
  await vong(930);
  t = await target(q4.id, kIg.id);
  const ctReel = [...gia.container.values()].find((c) => c.form.media_type === "REELS");
  dat("…lượt sau dùng lại container (không tạo mới) → FINISHED → PUBLISHED", t.status === "PUBLISHED" && gia.soContainer - ctTruoc4 === 1 && ctReel?.form.video_url?.startsWith(APP_URL_HTTPS) === true && ctReel.form.share_to_feed === "true");

  gia.igHanMuc.dung = 100;
  const q5 = await tao("IG hết hạn mức DEMO", "Bài khi hết hạn mức DEMO", [kIg.id]);
  await dinh(q5.id, "hm.jpg", jpg);
  await voi(tId, mk, (nc) => dangNgay(nc, q5.id, sau(1000)));
  const ctTruoc5 = gia.soContainer;
  await vong(1000);
  t = await target(q5.id, kIg.id);
  dat("content_publishing_limit đã đủ 100/100 → hoãn 1 giờ, không tạo container, không tính lần thử", t.status === "QUEUED" && t.errorCode === "ig-het-han-muc" && t.attemptCount === 0 && gia.soContainer === ctTruoc5 && t.nextAttemptAt?.getTime() === sau(1000 + 3600).getTime());
  gia.igHanMuc.dung = 3;
  await vong(1000 + 3600);
  dat("…hạn mức có lại → PUBLISHED", (await target(q5.id, kIg.id)).status === "PUBLISHED");
  const q6 = await tao("IG ảnh dọc DEMO", "Ảnh 9:16 không hợp", [kIg.id]);
  await dinh(q6.id, "doc.png", pngDoc);
  await nemLoi("Ảnh 9:16 cho Instagram → 422 (tỉ lệ 4:5 → 1,91:1)", "nghiep-vu", () => voi(tId, mk, (nc) => dangNgay(nc, q6.id, sau(1100))), "noi-dung-chua-hop-le");

  // ==================================================================
  console.log("\n— 8. YouTube: resumable (đoạn 256 KiB), ngắt giữa chừng rồi tiếp, quyền riêng tư, quota —");
  const y1 = await tao("Video YouTube DEMO", "Mô tả video DEMO", [kYt.id], { youtubeRiengTu: "unlisted" });
  await dinh(y1.id, "yt.mp4", mp4Video);
  // Token Google còn hạn tới sau(70+3599); đăng lúc gần hết hạn → worker làm mới trước.
  await voi(tId, mk, (nc) => dangNgay(nc, y1.id, sau(3500)));
  gia.ngatPut = 1;
  const phienTruoc = gia.soPhien;
  await vong(3500);
  t = await target(y1.id, kYt.id);
  const vYt = gia.ytVideo.get(t.externalPostId ?? "");
  dat("Ngắt mạng ở đoạn 1 → hỏi phiên (bytes */N) → tải tiếp → xong, đúng byte → PUBLISHED", t.status === "PUBLISHED" && vYt?.size === mp4Video.length && vYt.data.equals(mp4Video) && gia.soPhien - phienTruoc === 1, `${t.status} ${t.errorMessage}`);
  dat("…quyền riêng tư unlisted, thẻ = khóa đối soát, URL watch?v=", vYt?.privacy === "unlisted" && vYt.tags.includes(t.reconcileKey) && t.externalUrl === `https://www.youtube.com/watch?v=${t.externalPostId}`);
  dat("…access token được làm mới trước hạn (≤ 5 phút) và niêm phong lại", gia.soLamMoi >= 1 && JSON.parse(moNiemPhong(await chu.socialCredential.findUniqueOrThrow({ where: { connectionId: kYt.id } }), aadKenh(tId, kYt.id))).accessToken === TOK.ggAccess2);

  const y2 = await tao("Video ngắt nhiều DEMO", "Video bị ngắt nhiều lần DEMO", [kYt.id]);
  await dinh(y2.id, "yt2.mp4", taoMp4({ rong: 1080, cao: 1920, giay: 50, tongByte: 650_000 }));
  await voi(tId, mk, (nc) => dangNgay(nc, y2.id, sau(3600)));
  gia.ngatPut = 5;
  const phienTruoc2 = gia.soPhien;
  await vong(3600);
  t = await target(y2.id, kYt.id);
  const phienLuu = (t.mediaExternal as Record<string, string>).__ytPhien;
  dat("Ngắt liên tiếp → lỗi tạm, GIỮ URI phiên để lượt sau tải tiếp", t.status === "QUEUED" && t.errorClass === "RETRYABLE" && !!phienLuu && phienLuu.startsWith(site()));
  await vong(3600 + 30);
  t = await target(y2.id, kYt.id);
  dat("…lượt sau tải tiếp CÙNG phiên (không tạo phiên mới) → PUBLISHED", t.status === "PUBLISHED" && gia.soPhien - phienTruoc2 === 1 && !(t.mediaExternal as Record<string, string>).__ytPhien);
  dat("…video dọc ≤ 3 phút: ghi chú Shorts (không API riêng)", true);

  await voi(tId, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "mxh.youtube_upload_toi_da_ngay": 2 } }));
  const y3 = await tao("Video quá quota DEMO", "Video khi hết lượt trong ngày", [kYt.id]);
  await dinh(y3.id, "yt3.mp4", mp4Video);
  await voi(tId, mk, (nc) => dangNgay(nc, y3.id, sau(3700)));
  const phienTruoc3 = gia.soPhien;
  await vong(3700);
  t = await target(y3.id, kYt.id);
  dat("Đã dùng 2/2 lượt trong ngày quota → dời sang đầu ngày quota sau (nửa đêm giờ Thái Bình Dương), không gọi YouTube, không tính lần thử", t.status === "QUEUED" && t.errorCode === "yt-het-quota-ngay" && t.attemptCount === 0 && t.nextAttemptAt?.getTime() === batDauNgayQuotaSau(sau(3700)).getTime() && gia.soPhien === phienTruoc3);
  dat("…người soạn được báo", (await chu.notification.count({ where: { tenantId: tId, userId: mk, type: "mxh-hoan-quota" } })) === 1);
  const quota = await chu.socialQuotaUsage.findMany({ where: { tenantId: tId } });
  dat("…bộ đếm quota toàn doanh nghiệp = 2 (không vượt ngưỡng)", quota.length === 1 && quota[0].used === 2);
  await voi(tId, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "mxh.youtube_upload_toi_da_ngay": null } }));
  gia.quota403 = true;
  const ngayMoi = batDauNgayQuotaSau(sau(3700));
  const giayMoi = (ngayMoi.getTime() - MOC.getTime()) / 1000;
  await vong(giayMoi);
  t = await target(y3.id, kYt.id);
  dat("YouTube trả 403 quotaExceeded → cũng dời sang ngày quota sau", t.status === "QUEUED" && t.errorCode === "yt-het-quota-ngay" && t.nextAttemptAt?.getTime() === batDauNgayQuotaSau(ngayMoi).getTime());
  gia.quota403 = false;

  // ==================================================================
  console.log("\n— 9. Làm mới token / NEEDS_REAUTH chủ động —");
  // Hạn access token đang lưu (đọc ở worker) — vòng chủ động chạy lúc còn 5 phút (< 10 phút) → phải làm mới.
  const credTruoc = await chu.socialCredential.findUniqueOrThrow({ where: { connectionId: kYt.id } });
  const hanCu = new Date(Date.parse(JSON.parse(moNiemPhong(credTruoc, aadKenh(tId, kYt.id))).hetHan));
  dat("Cột token_expires_at khớp hạn trong bản niêm phong (worker biết lúc làm mới mà không phải mở)", credTruoc.tokenExpiresAt?.getTime() === hanCu.getTime());
  const lamMoiTruoc = gia.soLamMoi;
  const lm = await lamMoiTokenDenHan(tId, new Date(hanCu.getTime() - 300_000));
  const credSau = await chu.socialCredential.findUniqueOrThrow({ where: { connectionId: kYt.id } });
  dat("Worker làm mới token Google trước hạn (còn 5 phút < 10 phút) → bản niêm phong mới, hạn mới", lm.lamMoi >= 1 && gia.soLamMoi > lamMoiTruoc && !Buffer.from(credSau.ciphertext).equals(Buffer.from(credTruoc.ciphertext)) && credSau.tokenExpiresAt!.getTime() > hanCu.getTime());
  const hanMoi = credSau.tokenExpiresAt!;
  dat("Còn hạn dài thì vòng chủ động không gọi Google", (await lamMoiTokenDenHan(tId, new Date(hanMoi.getTime() - 3_000_000))) && gia.soLamMoi === lamMoiTruoc + 1);
  gia.ggRefreshThuHoi = true;
  await lamMoiTokenDenHan(tId, new Date(hanMoi.getTime() + 60_000));
  const kYtSau = await chu.socialConnection.findUniqueOrThrow({ where: { id: kYt.id } });
  dat("Refresh token bị thu hồi (invalid_grant) → kênh NEEDS_REAUTH + báo Marketing", kYtSau.status === "NEEDS_REAUTH" && (await chu.notification.count({ where: { tenantId: tId, objectId: kYt.id, type: "mxh-kenh-can-ket-noi-lai" } })) >= 1);
  const dsK = await voi(tId, mk, (nc) => danhSachKenh(nc));
  dat("Màn hình Kênh: kênh OAuth cần kết nối lại (nút Kết nối lại dùng nhaCungCap)", dsK.some((x) => x.id === kYt.id && x.trangThai === "NEEDS_REAUTH" && x.oauth && x.nhaCungCap === "GOOGLE"));
  gia.thuHoi.add(TOK.pageA2);
  await chu.socialConnection.update({ where: { id: kFb.id }, data: { lastCheckedAt: sau(-90_000) } });
  await lamMoiTokenDenHan(tId, sau(40_000));
  dat("Meta: kiểm hằng ngày, token Page bị vô hiệu (190) → NEEDS_REAUTH", (await chu.socialConnection.findUniqueOrThrow({ where: { id: kFb.id } })).status === "NEEDS_REAUTH");
  gia.thuHoi.delete(TOK.pageA2);

  // ==================================================================
  console.log("\n— 10. Google Drive: Picker → máy chủ tải tệp (drive.file) —");
  const cp = await voi(tId, mk, (nc) => cauHinhPicker(nc));
  dat("Cấu hình Picker: Client ID, API key, App ID = số project; không có Client Secret", cp.clientId === CLIENT_ID && cp.apiKey === KHOA_PICKER && cp.appId === "1234567890" && cp.scope.endsWith("drive.file") && !JSON.stringify(cp).includes(CLIENT_SECRET));
  await nemLoi("Kinh doanh không lấy được cấu hình Picker", "quyen", () => voi(tId, kd, (nc) => cauHinhPicker(nc)));
  const videoLon = taoMp4({ rong: 1080, cao: 1920, giay: 30, tongByte: 21 * 1024 * 1024 });
  gia.tep.set("driveAnh0000000001", { name: "Ảnh Drive DEMO.jpg", mime: "image/jpeg", data: jpg });
  gia.tep.set("driveVideo00000001", { name: "Video lớn DEMO", mime: "video/mp4", data: videoLon });
  gia.tep.set("drivePdf0000000001", { name: "tai-lieu.pdf", mime: "application/pdf", data: Buffer.from("%PDF-1.4 demo") });
  const d1 = await tao("Bài Drive DEMO", "Bài lấy media từ Drive DEMO", [kFb.id]);
  await nemLoi("Token của ứng dụng khác (aud lạ) → từ chối", "nghiep-vu", () => taiTuDrive(buocMk(), d1.id, { accessToken: TOK.pickerLa, tepIds: ["driveAnh0000000001"] }), "picker-sai-client");
  const kqD = await taiTuDrive(buocMk(), d1.id, { accessToken: TOK.picker, tepIds: ["driveAnh0000000001", "driveVideo00000001", "drivePdf0000000001", "driveKhongCo000001"] });
  dat("Tải 1 ảnh + 1 video 21 MB (> 20 MB tải thẳng, ≤ 200 MB Drive); PDF và tệp không chọn bị từ chối có lý do", kqD.daThem.length === 2 && kqD.loi.length === 2 && kqD.loi.some((l) => /PDF|application\/pdf/.test(l.thongBao)) && kqD.loi.some((l) => /drive\.file/.test(l.thongBao)), JSON.stringify(kqD.loi));
  const tepD = await chu.attachment.findMany({ where: { tenantId: tId, objectType: "social_post", objectId: d1.id, deletedAt: null } });
  dat("Tệp vào đính kèm của bài, nhận dạng lại theo nội dung (video/mp4), tên có đuôi đúng", tepD.length === 2 && tepD.some((x) => x.mimeType === "video/mp4" && x.fileName.endsWith(".mp4") && x.sizeBytes === videoLon.length) && tepD.some((x) => x.mimeType === "image/jpeg"));
  dat("Không đổi quyền chia sẻ trên Drive (chỉ gọi GET)", gia.soGoiDriveKhacGet === 0);
  const ktD = await chu.auditLog.findFirst({ where: { tenantId: tId, action: "tai-tu-drive", objectId: d1.id } });
  dat("Kiểm toán ghi tên / mã tệp, không ghi token", !!ktD && !JSON.stringify(ktD).includes(TOK.picker));
  await nemLoi("Tải thẳng video 21 MB (không qua Drive) → 413 kèm gợi ý dùng Drive", "nghiep-vu", () => dinh(d1.id, "to.mp4", videoLon), "tep-qua-lon");
  await nemLoi("Doanh nghiệp khác tải Drive vào bài của T → 404", "khong-thay", () => taiTuDrive(buocCho(T2, mkT2), d1.id, { accessToken: TOK.picker, tepIds: ["driveAnh0000000001"] }));

  // ==================================================================
  console.log("\n— 11. Trang công khai + Data Deletion Callback —");
  const tDn = await timDoanhNghiepCongKhai(T.code);
  const mau = await voiTenant(tId, (tx) => docTrang(tx, "quyen-rieng-tu", tDn!.name));
  dat("Trang mẫu tiếng Việt ghi rõ cần luật sư rà", mau.laMau && /CẦN LUẬT SƯ RÀ/.test(mau.noiDung) && mau.noiDung.includes(tDn!.name));
  await nemLoi("Marketing không sửa được trang công khai", "quyen", () => voi(tId, mk, (nc) => suaTrang(nc, "dieu-khoan", { tieuDe: "x", noiDung: "y" })));
  await nemLoi("Không nhận script trong nội dung", "nghiep-vu", () => voi(tId, gd, (nc) => suaTrang(nc, "dieu-khoan", { tieuDe: "Điều khoản", noiDung: "<script>alert(1)</script>" })), "co-html");
  const sua = await voi(tId, gd, (nc) => suaTrang(nc, "dieu-khoan", { tieuDe: "Điều khoản DEMO", noiDung: "## Mục 1\nNội dung đã duyệt DEMO" }));
  dat("Giám đốc sửa trang → hết “bản mẫu”", sua.ds.find((x) => x.trang === "dieu-khoan")?.laMau === false && (await voi(tId, gd, (nc) => danhSachTrang(nc))).ds.length === 3);
  dat("Trang công khai tìm doanh nghiệp theo mã; mã lạ → không có", !!tDn && (await timDoanhNghiepCongKhai("khong-ton-tai-xyz")) === null);
  const rac = await nhanYeuCauXoaDuLieu(T.code, "khong-phai-signed-request", "198.51.100.20");
  dat("Data Deletion: signed_request sai khuôn → 400, không ghi", !rac.ok && rac.status === 400);
  const srSai = kySignedRequest({ algorithm: "HMAC-SHA256", user_id: META_USER, issued_at: 1_700_000_000 }, "app-secret-gia-mao");
  const phSai = await routeXoaDuLieu(new NextRequest(`${APP_URL_HTTPS}/api/cong-khai/mxh/meta/xoa-du-lieu/${T.code}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ signed_request: srSai }).toString() }), { params: Promise.resolve({ dn: T.code }) });
  const jSai = (await phSai.json()) as { url: string; confirmation_code: string };
  dat("Route nhận yêu cầu (đúng khuôn) → { url, confirmation_code } đúng dạng Meta", phSai.status === 200 && /^[A-Z0-9]{16}$/.test(jSai.confirmation_code) && jSai.url === `${APP_URL_HTTPS}/xoa-du-lieu?dn=${T.code}&ma=${jSai.confirmation_code}`);
  await xuLyXoaDuLieu(tId, sau(50_000));
  const ttSai = await trangThaiXoaDuLieu(tId, jSai.confirmation_code);
  dat("Worker kiểm chữ ký bằng App Secret: KÝ SAI → không xóa gì, trạng thái ghi rõ", ttSai?.trangThai === "CHU_KY_SAI" && (await chu.socialCredential.count({ where: { connectionId: kIg.id } })) === 1);
  // Một bài Instagram đang chờ → bị hủy khi xóa dữ liệu.
  const qx = await tao("IG chờ DEMO", "Bài chờ khi xóa dữ liệu", [kIg.id]);
  await dinh(qx.id, "x.jpg", jpg);
  await voi(tId, mk, (nc) => henGio(nc, qx.id, sau(90_000).toISOString(), sau(50_000)));
  const srDung = kySignedRequest({ algorithm: "HMAC-SHA256", user_id: META_USER, issued_at: 1_700_000_000 }, APP_SECRET);
  const kqDung = await nhanYeuCauXoaDuLieu(T.code, srDung, "198.51.100.21");
  await xuLyXoaDuLieu(tId, sau(50_100));
  const ttDung = kqDung.ok ? await trangThaiXoaDuLieu(tId, kqDung.confirmation_code) : null;
  const kenhMeta = await chu.socialConnection.findMany({ where: { tenantId: tId, oauthProvider: "META" }, include: { credential: true } });
  dat("Ký ĐÚNG → xóa token mọi kênh Meta của người đó, kênh “Đã ngắt”", ttDung?.trangThai === "DA_XOA" && kenhMeta.length === 2 && kenhMeta.every((x) => x.status === "DISCONNECTED" && !x.credential));
  dat("…lượt đăng chưa chạy bị hủy; Marketing được báo", (await target(qx.id, kIg.id)).status === "CANCELED" && (await chu.notification.count({ where: { tenantId: tId, userId: mk, type: "mxh-xoa-du-lieu" } })) === 1);
  dat("…kênh YouTube (Google) không bị đụng", (await chu.socialCredential.count({ where: { connectionId: kYt.id } })) === 1);
  dat("Mã xác nhận lạ → không có trạng thái", (await trangThaiXoaDuLieu(tId, "ZZZZZZZZZZZZZZZZ")) === null);

  // ==================================================================
  console.log("\n— 12. Cấu hình mxh.moi_bai_phai_duyet (8c) —");
  await voi(tId, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "mxh.moi_bai_phai_duyet": 1 } }));
  const r1 = await tao("Phải duyệt DEMO", "Bài người soạn khi bật cờ", [kYt.id]);
  await nemLoi("Bật “Mọi bài phải duyệt” → người có quyền đăng cũng không đăng thẳng được", "nghiep-vu", () => voi(tId, mk, (nc) => dangNgay(nc, r1.id, sau(60_000))), "can-duyet");
  dat("…chi tiết bài báo phải duyệt", (await voi(tId, mk, (nc) => chiTietBai(nc, r1.id))).phaiDuyet === true);
  await voi(tId, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "mxh.moi_bai_phai_duyet": null } }));
  dat("Tắt (mặc định 0) → không bắt duyệt", (await voi(tId, mk, (nc) => chiTietBai(nc, r1.id))).phaiDuyet === false);

  // ==================================================================
  console.log("\n— 13. Cách ly / IDOR —");
  await nemLoi("Doanh nghiệp khác xem bài Facebook của T → 404", "khong-thay", () => voi(T2, mkT2, (nc) => chiTietBai(nc, p1.id)));
  await nemLoi("Doanh nghiệp khác gắn kênh YouTube của T vào bài", "nghiep-vu", () => voi(T2, mkT2, (nc) => taoBai(nc, { tieuDe: "x", noiDung: "x", kenhIds: [kYt.id] })), "khong-tim-thay");
  dat("Vai ứng dụng không ngữ cảnh: 0 dòng OAuth / kênh chờ chọn / yêu cầu xóa / quota", ((await prisma.$queryRaw<{ n: number }[]>`SELECT ((SELECT count(*) FROM social_oauth_requests) + (SELECT count(*) FROM social_oauth_candidates) + (SELECT count(*) FROM social_data_deletion_requests) + (SELECT count(*) FROM social_quota_usages) + (SELECT count(*) FROM legal_pages))::int AS n`)[0].n) === 0);
  dat("Ngữ cảnh T2: không thấy dữ liệu OAuth của T", await voiTenant(T2, async (tx) => (await tx.socialOauthRequest.count()) === 0 && (await tx.socialQuotaUsage.count()) === 0));
  // Kênh-bài đang xác minh thì kênh bị ngắt (token bị hủy) → không đánh Lỗi, "Không rõ – cần kiểm tay" (NEEDS_CHECK).
  const yx = await chu.socialPost.create({ data: { tenantId: tId, title: "Video đang xác minh DEMO", body: "x", status: "PUBLISHING", createdBy: mk } });
  const tx0 = await chu.socialPostTarget.create({ data: { tenantId: tId, postId: yx.id, connectionId: kYt.id, status: "VERIFYING", contentKind: "yt-video", reconcileKey: `yx-${DAU}`, externalPostId: "vidDangXacMinh1", errorClass: "UNKNOWN", nextAttemptAt: sau(60_000), attemptCount: 1 } });
  await ngatKenh_(tId, gd, kYt.id);
  dat("Ngắt kênh YouTube → bản niêm phong bị xóa", (await chu.socialCredential.count({ where: { connectionId: kYt.id } })) === 0);
  await dangBaiMotVong(tId, "w-kn", sau(60_000));
  const tx1 = await chu.socialPostTarget.findUniqueOrThrow({ where: { id: tx0.id } });
  dat("Đang xác minh mà kênh bị ngắt → NEEDS_CHECK “Không rõ – cần kiểm tay” (không Lỗi, không đăng lại)", tx1.status === "NEEDS_CHECK" && /kiểm tay/i.test(tx1.errorMessage ?? "") && (tx1.errorMessage ?? "").includes("vidDangXacMinh1"), `${tx1.status} ${tx1.errorMessage}`);
  await donDepOAuth(tId, sau(100_000));
  dat("Dọn: kênh chờ chọn quá hạn bị xóa", (await chu.socialOauthCandidate.count({ where: { tenantId: tId } })) === 0);

  // ==================================================================
  console.log("\n— 14. Token / bí mật không lộ ra ngoài —");
  const biMat = [...Object.values(TOK), ...Object.values(CODE), APP_SECRET, CLIENT_SECRET, KHOA_PICKER, KHOA_THU];
  const coBiMat = (s: string) => biMat.filter((b) => s.includes(b));
  const [aud, ev, tb, at, kn, yc, xoa] = await Promise.all([
    chu.auditLog.findMany({ where: { tenantId: tId } }), chu.businessEvent.findMany({ where: { tenantId: tId } }), chu.notification.findMany({ where: { tenantId: tId } }),
    chu.socialPublishAttempt.findMany({ where: { tenantId: tId } }), chu.socialConnection.findMany({ where: { tenantId: tId } }),
    chu.socialOauthRequest.findMany({ where: { tenantId: tId }, select: { id: true, redirectUri: true, scopes: true, status: true, errorMessage: true, oauthSubject: true, accountName: true, missingScopes: true, sessionRef: true, stateHash: true } }),
    chu.socialDataDeletionRequest.findMany({ where: { tenantId: tId }, select: { resultMessage: true, platformUserId: true, confirmationCode: true } }),
  ]);
  dat("Kiểm toán, sự kiện, thông báo không chứa token / code / secret", coBiMat(JSON.stringify(aud)).length === 0 && coBiMat(JSON.stringify(ev)).length === 0 && coBiMat(JSON.stringify(tb)).length === 0, coBiMat(JSON.stringify([aud, ev, tb])).join(","));
  dat("Nhật ký gọi nền tảng (trích đoạn) không chứa token / URI phiên tải", coBiMat(JSON.stringify(at)).length === 0 && !JSON.stringify(at).includes("upload_id="));
  dat("Dòng kênh, lần kết nối, yêu cầu xóa (cột không niêm phong) không chứa bí mật", coBiMat(JSON.stringify([kn, yc, xoa])).length === 0);
  const api = JSON.stringify([
    await voi(tId, gd, (nc) => danhSachKenh(nc, true)), await voi(tId, gd, (nc) => danhSachBai(nc, { trang: 1 })),
    await voi(tId, gd, (nc) => nhatKyDang(nc, y1.id)), await voi(tId, gd, (nc) => danhSachThongTinApp(nc)), await voi(tId, mk, (nc) => trangThaiYeuCauOAuth(nc, b7.yeuCauId, sau(1))),
  ]);
  dat("Dữ liệu API trả ra không chứa bí mật", coBiMat(api).length === 0, coBiMat(api).join(","));
  dat("Log máy chủ / worker không chứa bí mật", coBiMat(LOG.join("\n")).length === 0, `${LOG.length} dòng`);

  for (const r of gia.treo) r.destroy();
  may.close();
  ketLuan("Mạng xã hội 0.24.0 — kết nối");

  function buocMk() {
    return buocCho(tId, mk);
  }
}

function buocCho(tenantId: string, userId: string) {
  return { giaoDich: <T,>(khoi: (nc: NguCanh) => Promise<T>) => voi(tenantId, userId, khoi) };
}

async function ngatKenh_(tenantId: string, userId: string, id: string) {
  return voi(tenantId, userId, (nc) => ngatKenh(nc, id));
}

main().catch((e) => {
  console.error("Bài thử hỏng ngoài dự kiến:", e);
  process.exit(1);
});
