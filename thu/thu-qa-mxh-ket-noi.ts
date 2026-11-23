import { mkdtempSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

// Thư mục tệp đính kèm tạm + khóa chủ riêng của bài thử — đặt TRƯỚC khi nạp module. Không bao giờ in khóa.
process.env.THU_MUC_DINH_KEM = mkdtempSync(path.join(tmpdir(), "cowork-qa-mxh-kn-"));
process.env.SOCIAL_MASTER_KEY = randomBytes(32).toString("base64");
process.env.SOCIAL_MASTER_KEY_VERSION = "1";
const APP_URL_HTTPS = "https://cowork.vi-du.vn";
process.env.APP_URL = APP_URL_HTTPS;
process.env.MXH_THU_KHONG_CHO = "1";

import { NextRequest } from "next/server";
import { prisma, voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiNghiepVu } from "../src/lib/loi";
import { seedNenMong } from "../prisma/seed/index";
import { dinhKemTep } from "../src/modules/dinh-kem/service";
import { aadKenh } from "../src/modules/mang-xa-hoi/bao-mat/khoa-chu";
import { niemPhong } from "../src/modules/mang-xa-hoi/bao-mat/niem-phong";
import { taoBai } from "../src/modules/mang-xa-hoi/bai";
import { kiemMaMedia, kyMaMedia } from "../src/modules/mang-xa-hoi/media-ky";
import { luuThongTinApp } from "../src/modules/mang-xa-hoi/nen-tang-app";
import { batDauOAuth, chonKenhOAuth, nhanCallbackOAuth, trangThaiYeuCauOAuth } from "../src/modules/mang-xa-hoi/oauth";
import { kiemSignedRequest, kySignedRequest, maPhien, phanLoaiLoiGoogle, thongBaoLoiKetNoi } from "../src/modules/mang-xa-hoi/oauth-thuan";
import { taiTuDrive } from "../src/modules/mang-xa-hoi/drive";
import { nhanYeuCauXoaDuLieu, trangThaiXoaDuLieu } from "../src/modules/mang-xa-hoi/trang-cong-khai";
import { instagram } from "../src/modules/mang-xa-hoi/connectors/instagram";
import { datGocApiChoBaiThu } from "../src/modules/mang-xa-hoi/connectors/goc-api";
import { choPhepLocalhostChoBaiThu, kiemDiaChi, LoiGoiMang } from "../src/modules/mang-xa-hoi/mang/goi-an-toan";
import { doiMaOAuthDaXep, donDepOAuth } from "../worker/mang-xa-hoi/oauth";
import { xuLyXoaDuLieu } from "../worker/mang-xa-hoi/xoa-du-lieu";
import { GET as phatMedia } from "../src/app/api/cong-khai/mxh/media/[ma]/route";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * QA ĐỐI KHÁNG 0.24.0 — kết nối Facebook / Instagram / YouTube / Google Drive, Data Deletion Callback (QĐ-220 → QĐ-226).
 * Mỗi mục chứng minh một lỗi tìm được khi rà nhánh feat/mxh-ket-noi (bài thử HỎNG trên mã cũ, ĐẠT sau khi sửa), kèm vài
 * bài hồi quy đối kháng (SSRF, link ký, signed_request, RLS). Google OAuth / Graph / Drive là MÁY CHỦ GIẢ cục bộ — CHƯA
 * KIỂM VỚI API THẬT. Chạy: npm run thu:qa-mxh-ket-noi.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Math.floor(performance.timeOrigin).toString(36);
const MOC = new Date("2026-12-02T03:00:00Z");
const sau = (giay: number) => new Date(MOC.getTime() + giay * 1000);
const V = "v24.0";
const APP_ID = "123456789012";
const APP_SECRET = randomBytes(16).toString("hex");
const CLIENT_ID = "1234567890-coworkqa.apps.googleusercontent.com";
const CLIENT_SECRET = `GOCSPX-${randomBytes(12).toString("hex")}`;
const RU_GOOGLE = `${APP_URL_HTTPS}/api/cong-khai/mxh/oauth/google/callback`;
const DUONG_GOOGLE = "/api/cong-khai/mxh/oauth/google/callback";
const tk = (t: string) => `${t}-${randomBytes(12).toString("hex")}`;
const TOK = { ggAccess: tk("ya29qa"), ggRefresh: tk("1//qarefresh"), picker: tk("ya29qapicker") };
const CODE = { race: tk("codeRace"), treo: tk("codeTreo") };
const KENH_YT = "UCcoworkQADEMO00000000aa";
const META_USER = "5550001112223";
const IG = "17841400000099999";

// ---------------------------------------------------------------------------
// Máy chủ GIẢ: Google OAuth (mã dùng một lần — dùng lại thì THU HỒI token đã cấp, RFC 6749 4.1.2), YouTube, Drive, Graph
// ---------------------------------------------------------------------------
const gia = {
  soDoiMa: new Map<string, number>(),
  maDaDung: new Set<string>(),
  accessHopLe: new Set<string>(),
  thuHoi: 0,
  soGoiDrive: 0,
  soTokenInfo: 0,
  igContainer404: true,
  soGoiIgMedia: 0,
};

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
function docThan(req: IncomingMessage): Promise<Buffer> {
  return new Promise((ok) => {
    const m: Buffer[] = [];
    req.on("data", (c: Buffer) => m.push(c));
    req.on("end", () => ok(Buffer.concat(m)));
  });
}
const ngu = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

const may = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const than = await docThan(req);
  const p = url.pathname;
  if (p === "/token" && req.method === "POST") {
    const f = Object.fromEntries(new URLSearchParams(than.toString("utf8")));
    if (f.client_id !== CLIENT_ID || f.client_secret !== CLIENT_SECRET) return json(res, 401, { error: "invalid_client" });
    if (f.grant_type === "authorization_code") {
      gia.soDoiMa.set(f.code, (gia.soDoiMa.get(f.code) ?? 0) + 1);
      await ngu(250);
      if (f.redirect_uri !== RU_GOOGLE) return json(res, 400, { error: "redirect_uri_mismatch" });
      if (gia.maDaDung.has(f.code)) {
        // Mã đã dùng: từ chối VÀ thu hồi token đã cấp từ mã đó (hành vi Google mô tả theo RFC 6749).
        gia.accessHopLe.delete(`${TOK.ggAccess}:${f.code}`);
        gia.thuHoi++;
        return json(res, 400, { error: "invalid_grant", error_description: "Code was already redeemed." });
      }
      gia.maDaDung.add(f.code);
      gia.accessHopLe.add(`${TOK.ggAccess}:${f.code}`);
      return json(res, 200, { access_token: `${TOK.ggAccess}:${f.code}`, refresh_token: TOK.ggRefresh, expires_in: 3599, scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/drive.file", token_type: "Bearer" });
    }
    return json(res, 400, { error: "unsupported_grant_type" });
  }
  if (p === "/tokeninfo") {
    gia.soTokenInfo++;
    if (url.searchParams.get("access_token") === TOK.picker) return json(res, 200, { aud: CLIENT_ID, azp: CLIENT_ID, scope: "https://www.googleapis.com/auth/drive.file", expires_in: "3400" });
    return json(res, 400, { error: "invalid_token" });
  }
  if (p.startsWith("/drive/v3/files/")) {
    gia.soGoiDrive++;
    const anh = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(2000)]);
    if (url.searchParams.get("alt") === "media") { res.writeHead(200, { "Content-Type": "image/jpeg" }); return res.end(anh); }
    return json(res, 200, { id: p.split("/").pop(), name: "Ảnh QA DEMO.jpg", mimeType: "image/jpeg", size: String(anh.length) });
  }
  if (p === "/youtube/v3/channels") {
    await ngu(50);
    const tok = /^Bearer (.+)$/.exec(String(req.headers.authorization ?? ""))?.[1] ?? "";
    if (!gia.accessHopLe.has(tok)) return json(res, 401, { error: { code: 401, message: "Invalid Credentials", errors: [{ reason: "authError" }] } });
    return json(res, 200, { items: [{ id: KENH_YT, snippet: { title: "Kênh YouTube QA DEMO", customUrl: "@qademo" } }] });
  }
  // Graph (Instagram đối soát)
  if (p === `/${V}/777000777`) {
    return gia.igContainer404 ? json(res, 404, { error: { message: "Unsupported get request. Object does not exist", code: 100, error_subcode: 33 } }) : json(res, 200, { id: "777000777", status_code: "FINISHED" });
  }
  if (p === `/${V}/${IG}/media` && req.method === "GET") {
    gia.soGoiIgMedia++;
    return json(res, 200, { data: [{ id: "9001", caption: "Chú thích bài QA DEMO", timestamp: new Date().toISOString() }] });
  }
  return json(res, 404, { error: { code: 404, message: `không có ${p}` } });
});
let cong = 0;
const site = () => `http://localhost:${cong}`;

// ---------------------------------------------------------------------------
async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "198.51.100.20", "thu-qa-mxh-ket-noi"));
  }, { timeoutMs: 120_000 });
}
const buocCho = (tenantId: string, userId: string) => ({ giaoDich: <T,>(khoi: (nc: NguCanh) => Promise<T>) => voi(tenantId, userId, khoi) });

async function main() {
  await new Promise<void>((ok) => may.listen(0, "127.0.0.1", () => ok()));
  cong = (may.address() as { port: number }).port;
  choPhepLocalhostChoBaiThu(true);
  datGocApiChoBaiThu({ graph: site(), graphVideo: site(), rupload: site(), googleOAuth: site(), googleApis: site() });
  console.log("=== QA 0.24.0 — Mạng xã hội kết nối (máy chủ GIẢ) ===\n");

  const T = await seedNenMong(chu, `qa-mxhkn-${DAU}`, "Doanh nghiệp QA MXH kết nối DEMO");
  const T2 = await seedNenMong(chu, `qa-mxhkn2-${DAU}`, "Doanh nghiệp QA MXH kết nối 2 DEMO");
  const tId = T.id;
  const vaiTro = async (code: string, t = tId) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: t, code } } })).id;
  async function nguoi(ten: string, roleId: string, o: { hai?: boolean; t?: string; quanLy?: string } = {}) {
    const t = o.t ?? tId;
    const u = await chu.user.create({
      data: {
        tenantId: t, email: `${ten}.${DAU}@qa.test`, passwordHash: "x", fullName: `${ten} DEMO`,
        ...(o.hai ? { totpEnabledAt: MOC, totpSecretEnc: "v1:thu" } : {}),
        userRoles: { create: { tenantId: t, roleId } },
        staffProfile: { create: { tenantId: t, hiredAt: new Date("2025-01-01T00:00:00Z"), managerId: o.quanLy ?? null } },
      },
    });
    return u.id;
  }
  const gd = await nguoi("qa-giam-doc", await vaiTro("ceo"), { hai: true });
  const mk = await nguoi("qa-marketing", await vaiTro("marketing"), { quanLy: gd });
  const tts = await nguoi("qa-thuc-tap", await vaiTro("marketing-intern"), { quanLy: mk });
  // Vai trò tự tạo "chỉ xem bài mạng xã hội" (Quản trị → Vai trò cho phép) — ví dụ trưởng phòng khác xem lịch đăng.
  const pXem = await chu.permission.findUniqueOrThrow({ where: { code: "mxh.view" } });
  const vXem = await chu.role.create({ data: { tenantId: tId, code: `qa-xem-mxh-${DAU}`, name: "Xem mạng xã hội DEMO", rolePermissions: { create: { tenantId: tId, permissionId: pXem.id, dataScope: "all" } } } });
  const xem = await nguoi("qa-chi-xem", vXem.id, { quanLy: gd });

  // ==================================================================
  console.log("— 1. QĐ-220: hai worker không được đổi CÙNG một mã OAuth —");
  await voi(tId, gd, (nc) => luuThongTinApp(nc, "GOOGLE", { clientId: CLIENT_ID, biMat: CLIENT_SECRET }));
  const REF = maPhien(mk, tId, 4_242);
  const bd = await voi(tId, mk, (nc) => batDauOAuth(nc, "google", {}, REF, MOC));
  const state = new URL(bd.url).searchParams.get("state")!;
  const cb = await voi(tId, mk, (nc) => nhanCallbackOAuth(nc, "google", { code: CODE.race, state }, REF, DUONG_GOOGLE, sau(30)));
  dat("Callback hợp lệ → CHO_DOI_MA (mã niêm phong)", cb.ok);
  // Hai worker (hai tiến trình) cùng vòng: cả hai đọc thấy CHO_DOI_MA trước khi bên nào gọi Google.
  await Promise.all([doiMaOAuthDaXep(tId, sau(35)), doiMaOAuthDaXep(tId, sau(35))]);
  dat("Mã OAuth chỉ được đổi ĐÚNG MỘT lần (không gửi mã đã dùng — Google sẽ thu hồi token)", gia.soDoiMa.get(CODE.race) === 1, `số lần đổi = ${gia.soDoiMa.get(CODE.race)}`);
  dat("…không có lần đổi lại nào làm Google thu hồi token", gia.thuHoi === 0, `thu hồi ${gia.thuHoi}`);
  const tt = await voi(tId, mk, (nc) => trangThaiYeuCauOAuth(nc, bd.yeuCauId, sau(40)));
  dat("…yêu cầu DA_SAN_SANG với đúng 1 kênh YouTube chờ chọn", tt.trangThai === "DA_SAN_SANG" && tt.ungVien.length === 1, `${tt.trangThai} / ${tt.ungVien.length} — ${tt.loi ?? ""}`);
  const kd1 = await chu.auditLog.count({ where: { tenantId: tId, action: "doi-ma-oauth", objectId: bd.yeuCauId } });
  dat("…kiểm toán đổi mã ghi đúng một lần", kd1 === 1, `${kd1}`);
  if (tt.ungVien.length) await voi(tId, mk, (nc) => chonKenhOAuth(nc, bd.yeuCauId, [tt.ungVien[0].id], sau(45)));
  dat("…chọn kênh → kênh YouTube ACTIVE", (await chu.socialConnection.count({ where: { tenantId: tId, platform: "YOUTUBE", status: "ACTIVE", disconnectedAt: null } })) === 1);

  // Worker chết SAU khi nhận mã (bản niêm phong đã xóa) → không treo "đang nhận quyền" mãi.
  const bd2 = await voi(tId, mk, (nc) => batDauOAuth(nc, "google", {}, REF, sau(100)));
  await voi(tId, mk, (nc) => nhanCallbackOAuth(nc, "google", { code: CODE.treo, state: new URL(bd2.url).searchParams.get("state")! }, REF, DUONG_GOOGLE, sau(120)));
  await chu.socialOauthRequest.update({ where: { id: bd2.yeuCauId }, data: { ciphertext: null, iv: null, authTag: null, wrappedKey: null, keyVersion: null } });
  await doiMaOAuthDaXep(tId, sau(130));
  dat("Mã đã được worker khác nhận → worker này bỏ qua (không gọi Google, không đánh LOI)", !gia.soDoiMa.has(CODE.treo) && (await chu.socialOauthRequest.findUniqueOrThrow({ where: { id: bd2.yeuCauId } })).status === "CHO_DOI_MA");
  await donDepOAuth(tId, sau(120 + 16 * 60));
  const yc2 = await chu.socialOauthRequest.findUniqueOrThrow({ where: { id: bd2.yeuCauId } });
  dat("…quá 15 phút chưa xong (worker chết) → dọn dẹp đánh LOI kèm lời giải thích tiếng Việt", yc2.status === "LOI" && /Máy nền dừng/.test(yc2.errorMessage ?? ""), yc2.status);

  // ==================================================================
  console.log("\n— 2. QĐ-221: Data Deletion Callback xóa cả DỮ LIỆU CÁ NHÂN của người cấp quyền —");
  await voi(tId, gd, (nc) => luuThongTinApp(nc, "META", { appId: APP_ID, biMat: APP_SECRET, graphVersion: V }));
  const TEN_NGUOI = "Nguyễn Văn Cấp Quyền DEMO";
  const taoKenhMeta = async (platform: "FACEBOOK_PAGE" | "INSTAGRAM", externalId: string, ten: string, daNgat: boolean) => {
    const id = crypto.randomUUID();
    await chu.socialConnection.create({
      data: {
        id, tenantId: tId, platform, name: ten, externalId, accountName: TEN_NGUOI, authType: "oauth", oauthProvider: "META", oauthSubject: META_USER,
        status: daNgat ? "DISCONNECTED" : "ACTIVE", disconnectedAt: daNgat ? sau(-86_400) : null, meta: { metaUserId: META_USER, tasks: ["MANAGE"] }, createdBy: mk,
        ...(daNgat ? {} : { credential: { create: { tenantId: tId, ...niemPhong(JSON.stringify({ loai: "meta", accessToken: tk("EAAqa") }), aadKenh(tId, id)) } } }),
      },
    });
    return id;
  };
  const kFb = await taoKenhMeta("FACEBOOK_PAGE", "333333333333333", "Page QA DEMO", false);
  const kIgCu = await taoKenhMeta("INSTAGRAM", IG, "@qa.demo", true);
  const ycMeta = await chu.socialOauthRequest.create({
    data: { tenantId: tId, userId: mk, provider: "META", sessionRef: REF, stateHash: randomBytes(32).toString("hex"), redirectUri: `${APP_URL_HTTPS}/api/cong-khai/mxh/oauth/meta/callback`, status: "HOAN_TAT", oauthSubject: META_USER, accountName: TEN_NGUOI, createdAt: sau(-600), expiresAt: sau(-60) },
  });
  const srDung = kySignedRequest({ algorithm: "HMAC-SHA256", user_id: META_USER, issued_at: 1_764_000_000 }, APP_SECRET);
  const nh = await nhanYeuCauXoaDuLieu(T.code, srDung, "203.0.113.9");
  dat("Route nhận signed_request đúng khuôn → { url, confirmation_code } trên APP_URL", nh.ok && nh.url.startsWith(`${APP_URL_HTTPS}/xoa-du-lieu?dn=`) && /^[A-Z0-9]{16}$/.test(nh.confirmation_code));
  await xuLyXoaDuLieu(tId, sau(200));
  const fb = await chu.socialConnection.findUniqueOrThrow({ where: { id: kFb }, include: { credential: true } });
  const igCu = await chu.socialConnection.findUniqueOrThrow({ where: { id: kIgCu } });
  dat("Kênh đang nối: token bị xóa, kênh DISCONNECTED", !fb.credential && fb.status === "DISCONNECTED");
  dat("Kênh đang nối: tên tài khoản Facebook + mã người dùng bị xóa", fb.accountName === null && fb.oauthSubject === null && !("metaUserId" in (fb.meta as object)), JSON.stringify({ a: fb.accountName, s: fb.oauthSubject, m: fb.meta }));
  dat("Kênh đã ngắt TỪ TRƯỚC của cùng người: tên + mã người dùng cũng bị xóa", igCu.accountName === null && igCu.oauthSubject === null && !("metaUserId" in (igCu.meta as object)), JSON.stringify({ a: igCu.accountName, s: igCu.oauthSubject }));
  const ycSau = await chu.socialOauthRequest.findUniqueOrThrow({ where: { id: ycMeta.id } });
  dat("Lần kết nối OAuth của người đó: tên + mã người dùng bị xóa", ycSau.accountName === null && ycSau.oauthSubject === null);
  dat("Tên Page (của doanh nghiệp) được giữ", fb.name === "Page QA DEMO");
  const trTh = nh.ok ? await trangThaiXoaDuLieu(tId, nh.confirmation_code) : null;
  dat("Trang trạng thái: DA_XOA, không lộ tên người / tên kênh", trTh?.trangThai === "DA_XOA" && !JSON.stringify(trTh).includes(TEN_NGUOI) && !JSON.stringify(trTh).includes("Page QA DEMO"));
  // Đối kháng: chữ ký giả, chữ ký của doanh nghiệp khác, độ dài khác, payload sửa.
  dat("signed_request ký bằng bí mật khác → sai chữ ký", !kiemSignedRequest(kySignedRequest({ algorithm: "HMAC-SHA256", user_id: META_USER }, randomBytes(16).toString("hex")), APP_SECRET).ok);
  const [cks, than] = srDung.split(".");
  const thanSua = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "1" }), "utf8").toString("base64url");
  dat("signed_request đổi payload giữ chữ ký → sai chữ ký", !kiemSignedRequest(`${cks}.${thanSua}`, APP_SECRET).ok && kiemSignedRequest(`${cks}.${than}`, APP_SECRET).ok);
  dat("signed_request chữ ký cụt (độ dài khác) → sai, không ném lỗi", !kiemSignedRequest(`${cks.slice(0, 30)}.${than}`, APP_SECRET).ok);
  dat("signed_request thuật toán khác HMAC-SHA256 → từ chối khuôn", !(await nhanYeuCauXoaDuLieu(T.code, kySignedRequest({ algorithm: "none", user_id: META_USER }, APP_SECRET), null)).ok);
  const nhT2 = await nhanYeuCauXoaDuLieu(T2.code, srDung, null);
  await xuLyXoaDuLieu(T2.id, sau(210));
  const trT2 = nhT2.ok ? await trangThaiXoaDuLieu(T2.id, nhT2.confirmation_code) : null;
  dat("Doanh nghiệp khác (chưa có app Meta) không xử lý được yêu cầu của T, không đụng kênh của T", trT2?.trangThai === "CHO_KIEM" && nh.ok && (await trangThaiXoaDuLieu(T2.id, nh.confirmation_code)) === null);

  // ==================================================================
  console.log("\n— 3. QĐ-222: Google Drive kiểm quyền thêm tệp TRƯỚC khi tải —");
  const baiMk = await voi(tId, mk, (nc) => taoBai(nc, { tieuDe: "Bài Drive QA DEMO", noiDung: "Nội dung bài Drive QA DEMO", kenhIds: [] }));
  gia.soGoiDrive = 0;
  gia.soTokenInfo = 0;
  let loiXem: unknown = null;
  try {
    await taiTuDrive(buocCho(tId, xem), baiMk.id, { accessToken: TOK.picker, tepIds: ["driveQaAnh00000001", "driveQaAnh00000002"] });
  } catch (e) {
    loiXem = e;
  }
  dat("Người CHỈ XEM bài → từ chối thiếu quyền", loiXem instanceof LoiThieuQuyen, loiXem instanceof Error ? loiXem.message : "không ném lỗi");
  dat("…máy chủ KHÔNG gọi Google (không tokeninfo, không tải tệp)", gia.soGoiDrive === 0 && gia.soTokenInfo === 0, `drive ${gia.soGoiDrive}, tokeninfo ${gia.soTokenInfo}`);
  const baiTts = await voi(tId, tts, (nc) => taoBai(nc, { tieuDe: "Bài thực tập QA DEMO", noiDung: "Bài của thực tập sinh QA DEMO", kenhIds: [] }));
  const kqTts = await taiTuDrive(buocCho(tId, tts), baiTts.id, { accessToken: TOK.picker, tepIds: ["driveQaAnh00000003"] });
  dat("Thực tập sinh vào bài CỦA MÌNH → tải được", kqTts.daThem.length === 1, JSON.stringify(kqTts.loi));
  const kqMk = await taiTuDrive(buocCho(tId, mk), baiMk.id, { accessToken: TOK.picker, tepIds: ["driveQaAnh00000004"] });
  dat("Marketing (mxh.update) vào bài nháp → tải được", kqMk.daThem.length === 1, JSON.stringify(kqMk.loi));
  const dsTepMk = await chu.attachment.count({ where: { tenantId: tId, objectType: "social_post", objectId: baiMk.id, deletedAt: null } });
  dat("…bài của Marketing có đúng 1 tệp (người chỉ xem không thêm được gì)", dsTepMk === 1, `${dsTepMk}`);

  // ==================================================================
  console.log("\n— 4. QĐ-223: trang Kênh không hiện nguyên văn ?loi-ket-noi= —");
  const chen = "Tài khoản bị khóa — gọi 0909 000 000 để được hỗ trợ";
  if (typeof thongBaoLoiKetNoi !== "function") dat("Có hàm thongBaoLoiKetNoi (chỉ mã đã biết)", false, "trang Kênh hiện nguyên văn tham số");
  else {
  dat("Mã lạ → câu chung, không chứa chữ do người ngoài dựng", !thongBaoLoiKetNoi(chen).includes("0909") && thongBaoLoiKetNoi(chen).length > 10);
  dat("Mã đã biết → lời giải thích tiếng Việt", /chống giả mạo/.test(thongBaoLoiKetNoi("state-sai")) && /SOCIAL_MASTER_KEY/.test(thongBaoLoiKetNoi("thieu-social-master-key")));
  dat("Mã trùng tên thuộc tính Object (constructor, __proto__) → câu chung", !/function|\[object/.test(thongBaoLoiKetNoi("constructor") + thongBaoLoiKetNoi("__proto__") + thongBaoLoiKetNoi("toString")));
  }

  // ==================================================================
  console.log("\n— 5. QĐ-225: đối soát Instagram khi container 404 —");
  const kenhIg = { id: kIgCu, diaChi: IG, tenDangNhap: null, meta: {} };
  const xtIg = { loai: "meta" as const, accessToken: tk("EAAig") };
  const bcIg = { hanMs: 5_000, app: { graphVersion: V } };
  const ndIg = { mediaDaTai: { __igContainer: "777000777" }, noiDung: "Chú thích bài QA DEMO", batDauLuot: new Date(Date.now() - 60_000) };
  const r404 = await instagram.reconcile(kenhIg, xtIg, "khoa", bcIg, ndIg);
  dat("Container 404 (Instagram đã dọn) + bài cùng chú thích đã lên → TÌM THẤY (không đăng lại → không trùng)", r404.ok && r404.externalId === "9001", JSON.stringify({ ok: r404.ok, id: r404.ok ? r404.externalId : null }));
  gia.igContainer404 = false;
  gia.soGoiIgMedia = 0;
  const rFin = await instagram.reconcile(kenhIg, xtIg, "khoa", bcIg, ndIg);
  dat("Container FINISHED (chắc chắn chưa đăng) → chưa có bài, không cần quét danh sách", rFin.ok && rFin.externalId === null && gia.soGoiIgMedia === 0);

  // ==================================================================
  console.log("\n— 6. QĐ-226: link ký phát media — Range, hạn, sửa mã, chéo doanh nghiệp —");
  const baiM = await voi(tId, mk, (nc) => taoBai(nc, { tieuDe: "Bài media QA DEMO", noiDung: "Bài media QA DEMO", kenhIds: [] }));
  const anh = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), randomBytes(5000)]);
  const tep = await voi(tId, mk, (nc) => dinhKemTep(nc, { loai: "social_post", doiTuongId: baiM.id, tenTep: "anh-qa.jpg", noiDung: new Uint8Array(anh) }));
  await chu.socialPostMedia.create({ data: { tenantId: tId, postId: baiM.id, attachmentId: tep.id, position: 0 } });
  const hetHan = Math.floor(Date.now() / 1000) + 3600;
  const ma = kyMaMedia({ tenantId: tId, postId: baiM.id, attachmentId: tep.id, hetHanGiay: hetHan });
  const phat = (m: string, h: Record<string, string> = {}) => phatMedia(new NextRequest(`${APP_URL_HTTPS}/api/cong-khai/mxh/media/${m}`, { headers: h }), { params: Promise.resolve({ ma: m }) });
  const p0 = await phat(ma);
  dat("Không Range → 200 cả tệp, đúng byte, Accept-Ranges: bytes", p0.status === 200 && Buffer.from(await p0.arrayBuffer()).equals(anh) && p0.headers.get("accept-ranges") === "bytes");
  const p1 = await phat(ma, { Range: "bytes=100-199" });
  dat("Range bytes=100-199 → 206, Content-Range đúng, đúng 100 byte", p1.status === 206 && p1.headers.get("content-range") === `bytes 100-199/${anh.length}` && Buffer.from(await p1.arrayBuffer()).equals(anh.subarray(100, 200)), `${p1.status} ${p1.headers.get("content-range")}`);
  const p2 = await phat(ma, { Range: "bytes=-10" });
  dat("Range bytes=-10 → 206 10 byte cuối", p2.status === 206 && Buffer.from(await p2.arrayBuffer()).equals(anh.subarray(anh.length - 10)));
  const p3 = await phat(ma, { Range: `bytes=${anh.length + 5}-` });
  dat("Range ngoài tệp → 416 kèm bytes */tổng", p3.status === 416 && p3.headers.get("content-range") === `bytes */${anh.length}`, String(p3.status));
  const [thanMa, ky] = ma.split(".");
  const thanSuaHan = Buffer.from(`${tId}|${baiM.id}|${tep.id}|${hetHan + 86_400}`, "utf8").toString("base64url");
  dat("Sửa hạn trong mã (giữ chữ ký) → 403", (await phat(`${thanSuaHan}.${ky}`)).status === 403);
  dat("Mã quá hạn → 410", (await phat(kyMaMedia({ tenantId: tId, postId: baiM.id, attachmentId: tep.id, hetHanGiay: Math.floor(Date.now() / 1000) - 1 }))).status === 410);
  dat("Mã ký đúng nhưng mang doanh nghiệp khác → 404 (RLS, không lộ tệp)", (await phat(kyMaMedia({ tenantId: T2.id, postId: baiM.id, attachmentId: tep.id, hetHanGiay: hetHan }))).status === 404);
  dat("Đường dẫn lạ (../, mã rác) → 403", (await phat("..%2F..%2Fetc%2Fpasswd")).status === 403 && (await phat(`${thanMa}.${"A".repeat(43)}`)).status === 403);
  dat("kiemMaMedia: cờ jpeg không thêm được vào mã đã ký", !kiemMaMedia(`${Buffer.from(`${tId}|${baiM.id}|${tep.id}|${hetHan}|jpeg`, "utf8").toString("base64url")}.${ky}`, new Date()).ok);

  // ==================================================================
  console.log("\n— 7. QĐ-224: Google invalid_grant (chế độ Testing 7 ngày) —");
  const lg = phanLoaiLoiGoogle(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
  dat("invalid_grant → NEEDS_REAUTH + hướng dẫn Kết nối lại + nhắc chế độ Testing 7 ngày", lg.loai === "NEEDS_REAUTH" && /Kết nối lại/.test(lg.thongBao) && /7 ngày/.test(lg.thongBao) && /Testing/.test(lg.thongBao), lg.thongBao);

  // ==================================================================
  console.log("\n— 8. Hồi quy đối kháng: SSRF, RLS —");
  const chan = async (u: string, dns: { address: string; family: 4 | 6 }[] = [{ address: "93.184.216.34", family: 4 }]) => {
    try {
      await kiemDiaChi(new URL(u), async () => dns);
      return false;
    } catch (e) {
      return e instanceof LoiGoiMang && (e.loai === "chan-dia-chi" || e.loai === "giao-thuc");
    }
  };
  choPhepLocalhostChoBaiThu(false);
  dat("SSRF: IP thập phân 2130706433 (= 127.0.0.1) bị chặn", await chan("https://2130706433/"));
  dat("SSRF: IP hệ 16 0x7f000001 bị chặn", await chan("https://0x7f000001/"));
  dat("SSRF: IPv6 ánh xạ ::ffff:127.0.0.1 / ::ffff:169.254.169.254 bị chặn", (await chan("https://[::ffff:127.0.0.1]/")) && (await chan("https://[::ffff:a9fe:a9fe]/")));
  dat("SSRF: IPv6 loopback / ULA / link-local bị chặn", (await chan("https://[::1]/")) && (await chan("https://[fd00::1]/")) && (await chan("https://[fe80::1]/")));
  dat("SSRF: tên miền phân giải ra IP nội bộ (DNS rebinding) bị chặn", await chan("https://graph.vi-du.vn/", [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }]));
  dat("SSRF: http:// (không phải https) bị chặn khi không bật chế độ thử", await chan(`http://localhost:${cong}/token`));
  choPhepLocalhostChoBaiThu(true);
  const n = (await prisma.$queryRaw<{ n: number }[]>`SELECT ((SELECT count(*) FROM social_oauth_requests) + (SELECT count(*) FROM social_oauth_candidates) + (SELECT count(*) FROM social_data_deletion_requests) + (SELECT count(*) FROM social_quota_usages) + (SELECT count(*) FROM legal_pages))::int AS n`)[0].n;
  dat("RLS: vai ứng dụng không ngữ cảnh doanh nghiệp thấy 0 dòng ở 5 bảng mới", n === 0, String(n));
  const t2Thay = await voiTenant(T2.id, async (tx) => (await tx.socialOauthRequest.count()) + (await tx.socialConnection.count({ where: { oauthProvider: { not: null } } })));
  dat("RLS: ngữ cảnh doanh nghiệp khác không thấy lần kết nối / kênh OAuth của T", t2Thay === 0, String(t2Thay));
  try {
    await voiTenant(T2.id, (tx) => tx.socialOauthCandidate.create({ data: { tenantId: tId, requestId: bd.yeuCauId, platform: "YOUTUBE", externalId: "x", name: "x", connectionId: crypto.randomUUID(), ciphertext: Buffer.alloc(4), iv: Buffer.alloc(12), authTag: Buffer.alloc(16), wrappedKey: Buffer.alloc(60), keyVersion: 1 } }));
    dat("RLS: ghi kênh chờ chọn sang doanh nghiệp khác bị chặn", false, "ghi được");
  } catch {
    dat("RLS: ghi kênh chờ chọn sang doanh nghiệp khác bị chặn", true);
  }
  void LoiNghiepVu;

  may.close();
  ketLuan("QA Mạng xã hội 0.24.0 — kết nối");
}

main().catch((e) => {
  console.error("Bài thử hỏng ngoài dự kiến:", e);
  process.exit(1);
});
