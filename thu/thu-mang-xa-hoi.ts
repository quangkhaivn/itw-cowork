import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

// Thư mục tệp đính kèm tạm cho bài thử — đặt TRƯỚC khi nạp module kho tệp.
process.env.THU_MUC_DINH_KEM = mkdtempSync(path.join(tmpdir(), "cowork-mxh-"));
// Khóa chủ riêng của bài thử (không đụng .env). Không bao giờ in ra.
const KHOA_THU = randomBytes(32).toString("base64");
process.env.SOCIAL_MASTER_KEY = KHOA_THU;
process.env.SOCIAL_MASTER_KEY_VERSION = "1";

import { NextRequest } from "next/server";
import { voiTenant, prisma } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { kiemTraGioiHanAI } from "../src/lib/vai-tro";
import { seedNenMong } from "../prisma/seed/index";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { dinhKemTep } from "../src/modules/dinh-kem/service";
import { viecThietLap } from "../src/modules/thiet-lap-ban-dau/service";
import { aadApp, aadKenh, docKhoaChu, trangThaiKhoaChu } from "../src/modules/mang-xa-hoi/bao-mat/khoa-chu";
import { niemPhong } from "../src/modules/mang-xa-hoi/bao-mat/niem-phong";
import { danhSachKenh, doiMatKhauKenh, ketNoiWordPress, kiemTraThongTinWordPress, ngatKenh, yeuCauKiemTraKenh } from "../src/modules/mang-xa-hoi/kenh";
import {
  chiTietBai, dangLai, dangNgay, danhSachBai, danhSachChoDuyet, duyetBai, guiDuyet, henGio, huyLich, nhatKyDang, suaBai, taoBai, traLaiBai,
} from "../src/modules/mang-xa-hoi/bai";
import { docMediaCongKhai, kiemMaMedia, kyMaMedia, taoLinkMedia } from "../src/modules/mang-xa-hoi/media-ky";
import { danhSachThongTinApp, datGocGraphChoBaiThu, kiemTraThongTinApp, luuThongTinApp, xoaBiMatApp } from "../src/modules/mang-xa-hoi/nen-tang-app";
import { choPhepLocalhostChoBaiThu, goiAnToan, kiemDiaChi, LoiGoiMang } from "../src/modules/mang-xa-hoi/mang/goi-an-toan";
import { chuanHoaDiaChiSite } from "../src/modules/mang-xa-hoi/tinh-toan";
import { bocLaiKhoa, moNiemPhong } from "../worker/mang-xa-hoi/giai-ma";
import { dangBaiMotVong, nhanViecDang, xuLyViec } from "../worker/mang-xa-hoi/dang-bai";
import { docThongTinApp, kiemTraAppDaXep, kiemTraKenhDaXep } from "../worker/mang-xa-hoi/kiem-tra";
import { GET as phatMedia } from "../src/app/api/cong-khai/mxh/media/[ma]/route";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng 0.23.0 — Mạng xã hội: nền tảng + WordPress (BUSINESS_RULES mục 34, QĐ-193 →) trên CSDL THẬT, qua đúng service
 * mà API gọi và đúng hàm worker. WordPress / Meta Graph là MÁY CHỦ GIẢ cục bộ (http.createServer) — không gọi mạng thật.
 * Không dùng giờ thật cho phần phụ thuộc giờ: mốc nghiệp vụ là hằng số. Chạy: npm run thu:mang-xa-hoi.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Math.floor(performance.timeOrigin).toString(36);
const MOC = new Date("2026-12-01T02:00:00Z");
const sau = (giay: number) => new Date(MOC.getTime() + giay * 1000);
const MK_UNG_DUNG = `abcd EFGH ${DAU.slice(0, 4)} ijkl MNOP qrst`;
const MK_UNG_DUNG_2 = `wxyz 1234 ${DAU.slice(-4)} 5678 ABCD efgh`;
const APP_SECRET = randomBytes(16).toString("hex");
const APP_SECRET_SAI = randomBytes(16).toString("hex");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(200)]);

// ---------------------------------------------------------------------------
// Máy chủ WordPress + Meta Graph GIẢ
// ---------------------------------------------------------------------------
interface BaiGia { id: number; slug: string; title: string; content: string; status: string; featured: number | null; userId: string }
const wp = {
  nguoi: new Map<string, string>(),
  bai: new Map<number, BaiGia>(),
  anh: new Map<number, { mime: string; size: number }>(),
  hangDoiTao: [] as string[],
  soYeuCauTao: 0,
  soBaiTao: 0,
  soAnhTai: 0,
  idTiep: 100,
  treo: [] as ServerResponse[],
  authNhan: [] as string[],
};
let cong = 0;
const site = () => `http://localhost:${cong}`;

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

function nguoiDangNhap(req: IncomingMessage): string | null {
  const h = req.headers.authorization ?? "";
  wp.authNhan.push(h);
  if (!h.startsWith("Basic ")) return null;
  const [u, ...p] = Buffer.from(h.slice(6), "base64").toString("utf8").split(":");
  const mk = wp.nguoi.get(u);
  return mk && mk.replace(/\s+/g, "") === p.join(":").replace(/\s+/g, "") ? u : null;
}

const may = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  // Site WordPress đặt trong thư mục con (https://vi-du.vn/site-hai) — REST API nằm dưới thư mục đó.
  const p = url.pathname.replace(/^\/(site-hai|ba)(?=\/)/, "");
  const than = await docThan(req);
  // --- Graph API giả ---
  if (/^\/v\d+\.\d\/oauth\/access_token$/.test(p)) {
    return url.searchParams.get("client_id") === "123456789012" && url.searchParams.get("client_secret") === APP_SECRET
      ? json(res, 200, { access_token: "app-token-gia", token_type: "bearer" })
      : json(res, 400, { error: { message: "Error validating client secret.", code: 1 } });
  }
  // --- Đường thử SSRF ---
  if (p === "/chuyen-khac") { res.writeHead(302, { Location: `http://127.0.0.2:${cong}/wp-json/wp/v2/users/me` }); return res.end(); }
  if (p === "/chuyen-cung") { res.writeHead(302, { Location: "/dich-cung" }); return res.end(); }
  if (p === "/dich-cung") return json(res, 200, { ok: true });
  if (p === "/to") { res.writeHead(200, { "Content-Type": "application/octet-stream" }); return res.end(Buffer.alloc(2 * 1024 * 1024)); }
  // --- WordPress REST giả ---
  if (!p.startsWith("/wp-json/wp/v2/")) return json(res, 404, { code: "rest_no_route", message: "Không có đường." });
  const u = nguoiDangNhap(req);
  if (!u) return json(res, 401, { code: "incorrect_password", message: "Mật khẩu ứng dụng không đúng." });
  const r = p.slice("/wp-json/wp/v2".length);
  if (r === "/users/me" && req.method === "GET") return json(res, 200, { id: 7, name: `Tác giả DEMO ${u}`, capabilities: { publish_posts: true, upload_files: true } });
  if (r === "/media" && req.method === "POST") {
    const id = ++wp.idTiep;
    wp.anh.set(id, { mime: String(req.headers["content-type"]), size: than.length });
    wp.soAnhTai++;
    return json(res, 201, { id, source_url: `${site()}/anh/${id}`, mime_type: req.headers["content-type"] });
  }
  if (r === "/posts" && req.method === "POST") {
    wp.soYeuCauTao++;
    const cheDo = wp.hangDoiTao.shift() ?? "ok";
    const d = JSON.parse(than.toString("utf8")) as { title: string; content: string; slug: string; status: string; featured_media?: number };
    const tao = () => {
      const id = ++wp.idTiep;
      const b: BaiGia = { id, slug: d.slug, title: d.title, content: d.content, status: d.status, featured: d.featured_media ?? null, userId: u };
      wp.bai.set(id, b);
      wp.soBaiTao++;
      return b;
    };
    if (cheDo === "500") return json(res, 500, { code: "internal_server_error", message: "Lỗi máy chủ (giả)." });
    if (cheDo === "400") return json(res, 400, { code: "rest_invalid_param", message: "Tham số không hợp lệ: content." });
    if (cheDo === "treo-tao") { tao(); wp.treo.push(res); return; }
    if (cheDo === "treo-khong-tao") { wp.treo.push(res); return; }
    if (cheDo === "ok-khong-id") { tao(); return json(res, 201, { status: "publish" }); }
    const b = tao();
    return json(res, 201, { id: b.id, status: b.status, slug: b.slug, link: `${site()}/?p=${b.id}` });
  }
  const m = /^\/posts\/(\d+)$/.exec(r);
  if (m && req.method === "GET") {
    const b = wp.bai.get(Number(m[1]));
    if (!b) return json(res, 404, { code: "rest_post_invalid_id", message: "Không có bài." });
    return json(res, 200, { id: b.id, status: b.status, slug: b.slug, link: `${site()}/?p=${b.id}`, title: { raw: b.title } });
  }
  if (r === "/posts" && req.method === "GET") {
    const slug = url.searchParams.get("slug");
    return json(res, 200, [...wp.bai.values()].filter((b) => b.slug === slug).map((b) => ({ id: b.id, slug: b.slug, status: b.status })));
  }
  return json(res, 404, { code: "rest_no_route", message: "Không có đường." });
});

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------
async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "198.51.100.9", "thu-mxh"));
  }, { timeoutMs: 60_000 });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "csdl";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string): Promise<void> {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu = kieu === "quyen" ? e instanceof LoiThieuQuyen : kieu === "khong-thay" ? e instanceof LoiKhongTimThay : kieu === "csdl" ? !(e instanceof LoiNghiepVu) : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}

async function trangThaiKenhBai(id: string) {
  return chu.socialPostTarget.findUniqueOrThrow({ where: { id } });
}

// Ghi lại mọi dòng log trong lúc chạy worker / service — kiểm không có bí mật.
const LOG: string[] = [];
for (const k of ["log", "warn", "error"] as const) {
  const goc = console[k].bind(console);
  console[k] = (...a: unknown[]) => {
    LOG.push(a.map((x) => (x instanceof Error ? `${x.message}` : typeof x === "string" ? x : JSON.stringify(x))).join(" "));
    goc(...a);
  };
}

async function main() {
  await new Promise<void>((ok) => may.listen(0, "127.0.0.1", () => ok()));
  cong = (may.address() as { port: number }).port;
  choPhepLocalhostChoBaiThu(true);
  datGocGraphChoBaiThu(`http://localhost:${cong}`);
  console.log("=== Thử 0.23.0 — Mạng xã hội: nền tảng + WordPress ===\n");

  const T = (await seedNenMong(chu, `thu-mxh-${DAU}`, "Doanh nghiệp thử MXH")).id;
  const T2 = (await seedNenMong(chu, `thu-mxh2-${DAU}`, "Doanh nghiệp thử MXH 2")).id;
  const vaiTro = async (code: string, t = T) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: t, code } } })).id;
  async function nguoi(ten: string, vai: string, o: { hai?: boolean; t?: string; quanLy?: string } = {}) {
    const t = o.t ?? T;
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
  const ad = await nguoi("quan-tri", "admin");
  const tpmk = await nguoi("tp-marketing", "marketing-manager", { quanLy: gd });
  const mk = await nguoi("marketing", "marketing", { quanLy: tpmk });
  const tts = await nguoi("thuc-tap-mk", "marketing-intern", { quanLy: tpmk });
  const kd = await nguoi("kinh-doanh", "sales", { quanLy: gd });
  const ktv = await nguoi("ky-thuat", "technical", { quanLy: gd });
  const mkT2 = await nguoi("marketing-2", "marketing", { t: T2 });
  wp.nguoi.set("tacgia", MK_UNG_DUNG);
  wp.nguoi.set("tacgia2", MK_UNG_DUNG_2);
  // Hạn gọi ngắn nhất (5 giây) để thử hết giờ; đối soát ngay (0 giây).
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "mxh.han_goi_giay": 5, "mxh.cho_doi_soat_giay": 0, "mxh.so_lan_thu_toi_da": 3 } }));

  // ==================================================================
  console.log("— 1. Quyền mxh.* (QĐ-193) —");
  dat("Trợ lý AI không có quyền mxh.* (kiemTraGioiHanAI)", kiemTraGioiHanAI().dat);
  const quyenCua = async (code: string) => (await chu.rolePermission.findMany({ where: { tenantId: T, role: { code }, permission: { module: "mxh" } }, select: { dataScope: true, permission: { select: { code: true } } } }));
  const qTts = await quyenCua("marketing-intern");
  dat("Thực tập sinh Marketing: chỉ mxh.view + mxh.create, phạm vi own", qTts.length === 2 && qTts.every((q) => q.dataScope === "own") && qTts.map((q) => q.permission.code).sort().join() === "mxh.create,mxh.view");
  dat("Nhân viên Marketing: 5 mã (không approve)", (await quyenCua("marketing")).length === 5 && !(await quyenCua("marketing")).some((q) => q.permission.code === "mxh.approve"));
  dat("Trưởng phòng Marketing: đủ 6 mã", (await quyenCua("marketing-manager")).length === 6);
  dat("Trợ lý AI trong CSDL: 0 mã mxh", (await quyenCua("ai-assistant")).length === 0);
  // Migration idempotent cho MỌI doanh nghiệp: doanh nghiệp demo (seed:mau) đã có quyền.
  const demo = await chu.tenant.findFirst({ where: { code: "itw" } });
  if (demo) dat("Doanh nghiệp có sẵn (itw) được cấp mxh.* cho Trưởng phòng Marketing", (await chu.rolePermission.count({ where: { tenantId: demo.id, role: { code: "marketing-manager" }, permission: { module: "mxh" } } })) === 6);
  await nemLoi("Kinh doanh không xem được kênh", "quyen", () => voi(T, kd, (nc) => danhSachKenh(nc)));
  await nemLoi("Kỹ thuật không xem được bài", "quyen", () => voi(T, ktv, (nc) => danhSachBai(nc, { trang: 1 })));
  await nemLoi("Thực tập sinh không nối được kênh", "quyen", () => voi(T, tts, (nc) => kiemTraThongTinWordPress(nc, { diaChi: site(), tenDangNhap: "tacgia", matKhauUngDung: MK_UNG_DUNG })));

  // ==================================================================
  console.log("\n— 2. Khóa chủ SOCIAL_MASTER_KEY + niêm phong envelope (SEC-05, QĐ-194) —");
  const encGoc = process.env.APP_ENC_KEY;
  dat("Thiếu SOCIAL_MASTER_KEY → báo rõ, KHÔNG rơi về APP_ENC_KEY", (() => { const k = trangThaiKhoaChu({ APP_ENC_KEY: encGoc } as unknown as NodeJS.ProcessEnv); return !k.coKhoa && /SOCIAL_MASTER_KEY/.test(k.loi ?? ""); })());
  dat("SOCIAL_MASTER_KEY trùng APP_ENC_KEY → từ chối", !trangThaiKhoaChu({ APP_ENC_KEY: KHOA_THU, SOCIAL_MASTER_KEY: KHOA_THU } as unknown as NodeJS.ProcessEnv).coKhoa);
  dat("Khóa sai độ dài → từ chối", !trangThaiKhoaChu({ SOCIAL_MASTER_KEY: "ngan" } as unknown as NodeJS.ProcessEnv).coKhoa);
  const bn = niemPhong("bí-mật-thử", aadKenh(T, "11111111-1111-4111-8111-111111111111"));
  dat("Niêm phong: data key bọc 60 byte, IV 12, tag 16, phiên bản 1", bn.wrappedKey.length === 60 && bn.iv.length === 12 && bn.authTag.length === 16 && bn.keyVersion === 1);
  dat("Hai lần niêm phong cùng bản rõ ra hai bản khác nhau (data key riêng)", Buffer.from(niemPhong("bí-mật-thử", "x").wrappedKey).compare(Buffer.from(niemPhong("bí-mật-thử", "x").wrappedKey)) !== 0);
  dat("Worker mở đúng AAD → ra bản rõ", moNiemPhong(bn, aadKenh(T, "11111111-1111-4111-8111-111111111111")) === "bí-mật-thử");
  let moSai = false;
  try { moNiemPhong(bn, aadKenh(T2, "11111111-1111-4111-8111-111111111111")); } catch { moSai = true; }
  dat("Mở bằng AAD doanh nghiệp khác → hỏng", moSai);
  const khoaV2 = randomBytes(32).toString("base64");
  const envXoay = { SOCIAL_MASTER_KEY: khoaV2, SOCIAL_MASTER_KEY_VERSION: "2", SOCIAL_MASTER_KEY_V1: KHOA_THU } as unknown as NodeJS.ProcessEnv;
  const boc = bocLaiKhoa(bn, aadKenh(T, "11111111-1111-4111-8111-111111111111"), envXoay);
  dat("Xoay khóa: bọc lại sang phiên bản 2, bản mã giữ nguyên, mở được bằng khóa mới", boc.keyVersion === 2 && moNiemPhong({ ...bn, ...boc }, aadKenh(T, "11111111-1111-4111-8111-111111111111"), envXoay) === "bí-mật-thử");
  let moCu = false;
  try { moNiemPhong({ ...bn, ...boc }, aadKenh(T, "11111111-1111-4111-8111-111111111111"), { SOCIAL_MASTER_KEY: KHOA_THU } as unknown as NodeJS.ProcessEnv); } catch { moCu = true; }
  dat("…bản đã bọc lại không mở bằng khóa cũ", moCu);
  dat("docKhoaChu phiên bản không có khóa → lỗi rõ", (() => { try { docKhoaChu(3, envXoay); return false; } catch (e) { return /SOCIAL_MASTER_KEY_V3/.test((e as Error).message); } })());

  // ==================================================================
  console.log("\n— 3. Kênh WordPress (kiểm tra kết nối, niêm phong, HTTPS, SSRF) —");
  const kt = await voi(T, mk, (nc) => kiemTraThongTinWordPress(nc, { diaChi: site(), tenDangNhap: "tacgia", matKhauUngDung: MK_UNG_DUNG }));
  dat("Kiểm tra kết nối (chưa lưu) đúng mật khẩu → đạt", kt.ok, kt.thongBao);
  const ktSai = await voi(T, mk, (nc) => kiemTraThongTinWordPress(nc, { diaChi: site(), tenDangNhap: "tacgia", matKhauUngDung: "sai mat khau 1234" }));
  dat("Sai mật khẩu → NEEDS_REAUTH + hướng dẫn", !ktSai.ok && ktSai.loai === "NEEDS_REAUTH" && !!ktSai.huongDan);
  dat("Chưa lưu gì khi chỉ kiểm tra", (await chu.socialConnection.count({ where: { tenantId: T } })) === 0);
  await nemLoi("Lưu kênh sai mật khẩu → 422, không lưu", "nghiep-vu", () => voi(T, mk, (nc) => ketNoiWordPress(nc, { diaChi: site(), tenDangNhap: "tacgia", matKhauUngDung: "sai mat khau 1234" })), "kiem-tra-ket-noi-hong");
  const kenh = await voi(T, mk, (nc) => ketNoiWordPress(nc, { diaChi: `${site()}/wp-admin/`, tenDangNhap: "tacgia", matKhauUngDung: MK_UNG_DUNG, ten: "Site DEMO" }));
  dat("Nối kênh: địa chỉ chuẩn hóa (bỏ /wp-admin), ACTIVE", kenh.diaChi === site() && kenh.trangThai === "ACTIVE" && kenh.coBiMat);
  dat("Phản hồi không chứa mật khẩu ứng dụng", !JSON.stringify(kenh).includes(MK_UNG_DUNG) && !JSON.stringify(kenh).includes(MK_UNG_DUNG.replace(/ /g, "")));
  const cred = await chu.socialCredential.findUniqueOrThrow({ where: { connectionId: kenh.id } });
  dat("CSDL chỉ có bản niêm phong (không có bản rõ)", !Buffer.from(cred.ciphertext).toString("latin1").includes("abcd") && cred.keyVersion === 1);
  dat("Worker mở niêm phong ra đúng thông tin", JSON.parse(moNiemPhong(cred, aadKenh(T, kenh.id))).matKhau === MK_UNG_DUNG);
  await nemLoi("Nối trùng site → 409", "nghiep-vu", () => voi(T, mk, (nc) => ketNoiWordPress(nc, { diaChi: site(), tenDangNhap: "tacgia", matKhauUngDung: MK_UNG_DUNG })), "kenh-da-noi");
  dat("Chỉ nhận HTTPS: http://vi-du.vn bị từ chối", !chuanHoaDiaChiSite("http://vi-du.vn").hopLe && chuanHoaDiaChiSite("vi-du.vn/wp-json").url === "https://vi-du.vn");
  const ktNoiBo = await voi(T, mk, (nc) => kiemTraThongTinWordPress(nc, { diaChi: "https://10.1.2.3", tenDangNhap: "a", matKhauUngDung: MK_UNG_DUNG }));
  dat("Site trỏ IP nội bộ → chặn (SSRF), lỗi PERMANENT", !ktNoiBo.ok && ktNoiBo.loai === "PERMANENT" && /nội bộ/.test(ktNoiBo.thongBao));
  const kenh2 = await voi(T, gd, (nc) => ketNoiWordPress(nc, { diaChi: `${site()}/site-hai`, tenDangNhap: "tacgia2", matKhauUngDung: MK_UNG_DUNG_2, ten: "Site hai DEMO" }));
  dat("Nối kênh thứ hai (tài khoản khác)", kenh2.trangThai === "ACTIVE");
  // Kiểm tra lại kênh đã lưu: xếp việc → worker mở niêm phong.
  await voi(T, mk, (nc) => yeuCauKiemTraKenh(nc, kenh.id, MOC));
  dat("Kiểm tra lại: route chỉ xếp việc", (await chu.socialConnection.findUniqueOrThrow({ where: { id: kenh.id } })).checkRequestedAt !== null);
  dat("…worker kiểm xong 1 kênh, xóa mốc, ghi kết quả đạt", (await kiemTraKenhDaXep(T, MOC)) === 1 && (await chu.socialConnection.findUniqueOrThrow({ where: { id: kenh.id } })).lastCheckOk === true);

  // ==================================================================
  console.log("\n— 4. Đăng ngay thành công + đọc lại xác minh (ADR-05) —");
  const b1 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Khai trương chi nhánh DEMO", noiDung: "Đoạn một <b>không phải HTML</b>.\n\nĐoạn hai: https://vi-du.vn", kenhIds: [kenh.id] }));
  await voi(T, mk, (nc) => dinhKemTep(nc, { loai: "social_post", doiTuongId: b1.id, tenTep: "anh-dai-dien.png", noiDung: PNG }));
  const b1Dang = await voi(T, mk, (nc) => dangNgay(nc, b1.id, MOC));
  dat("Đăng ngay → bài PUBLISHING, kênh QUEUED (chưa ai nói “đã đăng”)", b1Dang.trangThai === "PUBLISHING" && b1Dang.kenh[0].trangThai === "QUEUED" && b1Dang.kenh[0].duongDan === null);
  dat("Ảnh được chụp vào social_post_media (ảnh đại diện)", b1Dang.anh.length === 1 && b1Dang.anh[0].vaiTro === "featured");
  const truocTao = wp.soBaiTao;
  const kq1 = await dangBaiMotVong(T, "w-thu-1", MOC);
  const t1 = await trangThaiKenhBai(b1Dang.kenh[0].id);
  dat("Worker: đăng + đọc lại → PUBLISHED có mã bài, permalink, mốc xác minh", kq1[0]?.ketQua === "da-dang" && t1.status === "PUBLISHED" && !!t1.externalPostId && !!t1.externalUrl && !!t1.verifiedAt, JSON.stringify(kq1));
  dat("Máy chủ WordPress nhận đúng 1 bài + 1 ảnh đại diện", wp.soBaiTao === truocTao + 1 && wp.bai.get(Number(t1.externalPostId))?.featured !== null && wp.soAnhTai === 1);
  const baiWp = wp.bai.get(Number(t1.externalPostId))!;
  dat("Nội dung gửi là HTML đã thoát (không nhận HTML tự do)", baiWp.content.includes("&lt;b&gt;") && baiWp.content.includes("<p>") && baiWp.slug === t1.reconcileKey);
  const ct1 = await voi(T, mk, (nc) => chiTietBai(nc, b1.id));
  dat("Bài PUBLISHED; link đã xác minh hiện ra", ct1.trangThai === "PUBLISHED" && ct1.kenh[0].duongDan === t1.externalUrl);
  const nk1 = await voi(T, mk, (nc) => nhatKyDang(nc, b1.id));
  dat("Nhật ký gọi nền tảng: media → publish → verify", nk1.map((x) => x.buoc).join(",") === "media,publish,verify");

  // ==================================================================
  console.log("\n— 5. Trigger CSDL: chỉ PUBLISHED khi có mã bài + xác minh —");
  const b2 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài thử trigger DEMO", noiDung: "Nội dung", kenhIds: [kenh.id] }));
  const tg = b2.kenh[0].id;
  await nemLoi("Đặt PUBLISHED không có external_post_id → CSDL chặn (cả vai chủ sở hữu)", "csdl", () => chu.$executeRaw`UPDATE social_post_targets SET status = 'PUBLISHED', external_url = 'https://x', verified_at = now() WHERE id = ${tg}::uuid`);
  await nemLoi("Có mã bài nhưng chưa xác minh → chặn", "csdl", () => chu.$executeRaw`UPDATE social_post_targets SET status = 'PUBLISHED', external_post_id = '1', external_url = 'https://x' WHERE id = ${tg}::uuid`);
  await nemLoi("Đã PUBLISHED thì không lùi trạng thái", "csdl", () => chu.$executeRaw`UPDATE social_post_targets SET status = 'FAILED' WHERE id = ${t1.id}::uuid`);
  await nemLoi("Đã PUBLISHED thì không đổi mã bài nền tảng", "csdl", () => chu.$executeRaw`UPDATE social_post_targets SET external_post_id = '999' WHERE id = ${t1.id}::uuid`);
  await nemLoi("Nhật ký gọi nền tảng chỉ ghi thêm (không sửa)", "csdl", () => chu.$executeRaw`UPDATE social_publish_attempts SET outcome = 'success' WHERE target_id = ${t1.id}::uuid`);

  // ==================================================================
  console.log("\n— 6. Lỗi 5xx → thử lại có giãn cách, đối soát trước khi gửi lại —");
  wp.hangDoiTao.push("500", "500");
  await voi(T, mk, (nc) => dangNgay(nc, b2.id, sau(10)));
  const tr5 = wp.soYeuCauTao;
  await dangBaiMotVong(T, "w-thu-1", sau(10));
  let x = await trangThaiKenhBai(tg);
  dat("Lần 1: 500 → QUEUED, RETRYABLE, hẹn sau 30 giây", x.status === "QUEUED" && x.errorClass === "RETRYABLE" && x.nextAttemptAt?.getTime() === sau(40).getTime(), `${x.status} ${x.errorClass} ${x.nextAttemptAt?.toISOString()}`);
  dat("…chưa tới giờ thì không gửi lại", (await dangBaiMotVong(T, "w-thu-1", sau(39))).length === 0);
  await dangBaiMotVong(T, "w-thu-1", sau(40));
  x = await trangThaiKenhBai(tg);
  dat("Lần 2: 500 → hẹn sau 60 giây", x.status === "QUEUED" && x.attemptCount === 2 && x.nextAttemptAt?.getTime() === sau(100).getTime());
  await dangBaiMotVong(T, "w-thu-1", sau(100));
  x = await trangThaiKenhBai(tg);
  dat("Lần 3: thành công → PUBLISHED", x.status === "PUBLISHED", x.status);
  dat("Máy chủ nhận 3 yêu cầu tạo, chỉ 1 bài; đối soát chạy trước lần 2 và 3", wp.soYeuCauTao - tr5 === 3 && [...wp.bai.values()].filter((b) => b.slug === x.reconcileKey).length === 1 && (await chu.socialPublishAttempt.count({ where: { targetId: tg, kind: "reconcile" } })) === 2);

  // ==================================================================
  console.log("\n— 7. 401 → NEEDS_REAUTH (kênh cần nhập lại) —");
  const b3 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài kênh hai DEMO", noiDung: "Nội dung kênh hai", kenhIds: [kenh2.id] }));
  wp.nguoi.set("tacgia2", "mat khau da thu hoi");
  await voi(T, mk, (nc) => dangNgay(nc, b3.id, sau(200)));
  await dangBaiMotVong(T, "w-thu-1", sau(200));
  x = await trangThaiKenhBai(b3.kenh[0].id);
  const k2 = await chu.socialConnection.findUniqueOrThrow({ where: { id: kenh2.id } });
  dat("401 → kênh-bài FAILED NEEDS_REAUTH, không thử lại", x.status === "FAILED" && x.errorClass === "NEEDS_REAUTH" && x.attemptCount === 1);
  dat("…kênh chuyển NEEDS_REAUTH", k2.status === "NEEDS_REAUTH");
  dat("…người soạn nhận thông báo kèm hướng dẫn", (await chu.notification.count({ where: { tenantId: T, userId: mk, type: "mxh-dang-loi" } })) >= 1);
  dat("…bài FAILED", (await voi(T, mk, (nc) => chiTietBai(nc, b3.id))).trangThai === "FAILED");
  await nemLoi("Đăng lại khi kênh chưa nhập lại → 409", "nghiep-vu", () => voi(T, mk, (nc) => dangLai(nc, b3.id, sau(210))), "kenh-can-nhap-lai");
  wp.nguoi.set("tacgia2", MK_UNG_DUNG_2);
  await voi(T, gd, (nc) => doiMatKhauKenh(nc, kenh2.id, { matKhauUngDung: MK_UNG_DUNG_2 }));
  await voi(T, mk, (nc) => dangLai(nc, b3.id, sau(220)));
  await dangBaiMotVong(T, "w-thu-1", sau(220));
  dat("Nhập lại mật khẩu ứng dụng → đăng lại → PUBLISHED", (await trangThaiKenhBai(b3.kenh[0].id)).status === "PUBLISHED");

  // ==================================================================
  console.log("\n— 8. Hết giờ SAU KHI đã gửi → UNKNOWN → đối soát, không đăng trùng —");
  const b4 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài hết giờ DEMO", noiDung: "Nội dung hết giờ", kenhIds: [kenh.id] }));
  wp.hangDoiTao.push("treo-tao");
  await voi(T, mk, (nc) => dangNgay(nc, b4.id, sau(300)));
  const tr8 = wp.soYeuCauTao;
  await dangBaiMotVong(T, "w-thu-1", sau(300));
  x = await trangThaiKenhBai(b4.kenh[0].id);
  dat("Hết giờ sau khi gửi → VERIFYING, UNKNOWN (không FAILED, không PUBLISHED)", x.status === "VERIFYING" && x.errorClass === "UNKNOWN" && !x.externalPostId, `${x.status} ${x.errorClass}`);
  dat("…bài vẫn “Đang đăng”", (await voi(T, mk, (nc) => chiTietBai(nc, b4.id))).trangThai === "PUBLISHING");
  await dangBaiMotVong(T, "w-thu-1", sau(301));
  x = await trangThaiKenhBai(b4.kenh[0].id);
  dat("Đối soát thấy bài theo khóa đối soát → xác minh → PUBLISHED", x.status === "PUBLISHED" && !!x.externalPostId);
  dat("…KHÔNG gửi yêu cầu tạo lần hai; nền tảng chỉ có 1 bài", wp.soYeuCauTao - tr8 === 1 && [...wp.bai.values()].filter((b) => b.slug === x.reconcileKey).length === 1);
  // Hết giờ mà bài CHƯA lên → đối soát không thấy → đăng lại (an toàn).
  const b5 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài chưa lên DEMO", noiDung: "Nội dung", kenhIds: [kenh.id] }));
  wp.hangDoiTao.push("treo-khong-tao");
  await voi(T, mk, (nc) => dangNgay(nc, b5.id, sau(400)));
  await dangBaiMotVong(T, "w-thu-1", sau(400));
  await dangBaiMotVong(T, "w-thu-1", sau(401));
  x = await trangThaiKenhBai(b5.kenh[0].id);
  dat("Hết giờ, bài chưa lên: đối soát không thấy → xếp đăng lại", x.status === "QUEUED" && x.errorCode === "doi-soat-khong-thay");
  await dangBaiMotVong(T, "w-thu-1", sau(401));
  x = await trangThaiKenhBai(b5.kenh[0].id);
  dat("…đăng lại → PUBLISHED, đúng 1 bài", x.status === "PUBLISHED" && [...wp.bai.values()].filter((b) => b.slug === x.reconcileKey).length === 1);
  // 2xx thiếu mã bài → không coi là đăng.
  const b5b = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài thiếu mã DEMO", noiDung: "Nội dung", kenhIds: [kenh.id] }));
  wp.hangDoiTao.push("ok-khong-id");
  await voi(T, mk, (nc) => dangNgay(nc, b5b.id, sau(450)));
  await dangBaiMotVong(T, "w-thu-1", sau(450));
  x = await trangThaiKenhBai(b5b.kenh[0].id);
  dat("201 mà không có mã bài → UNKNOWN, không PUBLISHED", x.status === "VERIFYING" && x.errorClass === "UNKNOWN");
  await dangBaiMotVong(T, "w-thu-1", sau(451));
  dat("…đối soát tìm ra bài → PUBLISHED (1 bài)", (await trangThaiKenhBai(b5b.kenh[0].id)).status === "PUBLISHED");

  // ==================================================================
  console.log("\n— 9. 400 → PERMANENT, không thử lại; đăng lại thủ công —");
  const b6 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài bị từ chối DEMO", noiDung: "Nội dung", kenhIds: [kenh.id] }));
  wp.hangDoiTao.push("400");
  await voi(T, mk, (nc) => dangNgay(nc, b6.id, sau(500)));
  await dangBaiMotVong(T, "w-thu-1", sau(500));
  x = await trangThaiKenhBai(b6.kenh[0].id);
  dat("400 → FAILED PERMANENT sau 1 lần, có thông báo của nền tảng", x.status === "FAILED" && x.errorClass === "PERMANENT" && x.attemptCount === 1 && /Tham số không hợp lệ/.test(x.errorMessage ?? ""));
  const ct6 = await voi(T, mk, (nc) => chiTietBai(nc, b6.id));
  dat("Giao diện có hướng dẫn sửa + nút đăng lại", !!ct6.kenh[0].huongDan && ct6.quyen.dangLai);
  dat("…worker không tự thử lại", (await dangBaiMotVong(T, "w-thu-1", sau(9999))).filter((k) => k.targetId === x.id).length === 0);
  await voi(T, mk, (nc) => dangLai(nc, b6.id, sau(600)));
  await dangBaiMotVong(T, "w-thu-1", sau(600));
  dat("Đăng lại → PUBLISHED", (await trangThaiKenhBai(b6.kenh[0].id)).status === "PUBLISHED");

  // ==================================================================
  console.log("\n— 10. Đồng thời: hai worker cùng nhận một kênh-bài —");
  const b7 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài đồng thời DEMO", noiDung: "Nội dung", kenhIds: [kenh.id] }));
  await voi(T, mk, (nc) => dangNgay(nc, b7.id, sau(700)));
  const tr10 = wp.soYeuCauTao;
  const [n1, n2] = await Promise.all([nhanViecDang(T, "w-A", sau(700)), nhanViecDang(T, "w-B", sau(700))]);
  dat("Chỉ một worker nhận được việc (FOR UPDATE SKIP LOCKED)", n1.length + n2.length === 1, `${n1.length}+${n2.length}`);
  const viec = [...n1, ...n2][0];
  const ai = n1.length ? "w-A" : "w-B";
  const khac = n1.length ? "w-B" : "w-A";
  dat("Worker không giữ khóa xử lý → bỏ qua, không gọi nền tảng", (await xuLyViec(T, khac, viec, sau(700))).ketQua === "bo-qua" && wp.soYeuCauTao === tr10);
  await Promise.all([xuLyViec(T, ai, viec, sau(700)), xuLyViec(T, khac, viec, sau(700))]);
  dat("Đúng 1 lần gọi tạo bài, PUBLISHED", wp.soYeuCauTao - tr10 === 1 && (await trangThaiKenhBai(viec.targetId)).status === "PUBLISHED");
  // Lượt kẹt (worker chết giữa chừng) → đối soát, không đăng lại mù.
  const b8 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài kẹt DEMO", noiDung: "Nội dung", kenhIds: [kenh.id] }));
  await voi(T, mk, (nc) => dangNgay(nc, b8.id, sau(800)));
  await nhanViecDang(T, "w-chet", sau(800));
  x = await trangThaiKenhBai(b8.kenh[0].id);
  dat("Worker nhận rồi “chết”: kênh-bài PUBLISHING", x.status === "PUBLISHING" && x.lockedBy === "w-chet");
  await nhanViecDang(T, "w-song", sau(800 + 60 * 11), 0);
  x = await trangThaiKenhBai(b8.kenh[0].id);
  dat("Quá mxh.phut_ket_dang → VERIFYING (UNKNOWN), không QUEUED", x.status === "VERIFYING" && x.errorCode === "ket-dang");
  await dangBaiMotVong(T, "w-song", sau(800 + 60 * 11));
  await dangBaiMotVong(T, "w-song", sau(800 + 60 * 11));
  dat("…đối soát không thấy → đăng → PUBLISHED, đúng 1 bài", (await trangThaiKenhBai(b8.kenh[0].id)).status === "PUBLISHED" && [...wp.bai.values()].filter((b) => b.slug === x.reconcileKey).length === 1);

  // ==================================================================
  console.log("\n— 11. Hẹn giờ, hủy lịch —");
  const b9 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài hẹn giờ DEMO", noiDung: "Nội dung hẹn giờ", kenhIds: [kenh.id] }));
  await nemLoi("Hẹn giờ đã qua → 422", "nghiep-vu", () => voi(T, mk, (nc) => henGio(nc, b9.id, sau(-60).toISOString(), sau(1000))), "gio-da-qua");
  const hen = sau(1000 + 600);
  const b9h = await voi(T, mk, (nc) => henGio(nc, b9.id, hen.toISOString(), sau(1000)));
  dat("Hẹn giờ → SCHEDULED, kênh QUEUED đúng giờ hẹn", b9h.trangThai === "SCHEDULED" && b9h.kenh[0].lanThuToi?.getTime() === hen.getTime());
  dat("Trước giờ hẹn 1 giây: worker không đăng", (await dangBaiMotVong(T, "w-thu-1", new Date(hen.getTime() - 1000))).length === 0);
  await dangBaiMotVong(T, "w-thu-1", hen);
  dat("Đúng giờ hẹn: đăng + xác minh → PUBLISHED (lệch 0 giây theo đồng hồ worker; vòng thật 15 giây)", (await trangThaiKenhBai(b9h.kenh[0].id)).status === "PUBLISHED");
  const b10 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài hủy lịch DEMO", noiDung: "Nội dung", kenhIds: [kenh.id] }));
  await voi(T, mk, (nc) => henGio(nc, b10.id, sau(5000).toISOString(), sau(1000)));
  const b10h = await voi(T, mk, (nc) => huyLich(nc, b10.id));
  dat("Hủy lịch → bài CANCELED, kênh CANCELED", b10h.trangThai === "CANCELED" && b10h.kenh[0].trangThai === "CANCELED");
  dat("…worker không đăng bài đã hủy", (await dangBaiMotVong(T, "w-thu-1", sau(6000))).every((k) => k.targetId !== b10h.kenh[0].id));
  const b11 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài đang đăng DEMO", noiDung: "Nội dung", kenhIds: [kenh.id] }));
  await voi(T, mk, (nc) => henGio(nc, b11.id, sau(7000).toISOString(), sau(1000)));
  await nhanViecDang(T, "w-giu", sau(7000));
  await nemLoi("Tới giờ, đang đăng → không hủy được", "nghiep-vu", () => voi(T, mk, (nc) => huyLich(nc, b11.id)), "sai-trang-thai");
  await xuLyViec(T, "w-giu", { targetId: (await chu.socialPostTarget.findFirstOrThrow({ where: { postId: b11.id } })).id, loai: "dang" }, sau(7000));

  // ==================================================================
  console.log("\n— 12. Duyệt: không tự duyệt, chuỗi cấp trên, bài AI phải duyệt (SEC-09) —");
  const b12 = await voi(T, tts, (nc) => taoBai(nc, { tieuDe: "Bài thực tập sinh DEMO", noiDung: "Nội dung thực tập", kenhIds: [kenh.id] }));
  await nemLoi("Thực tập sinh không đăng ngay được", "quyen", () => voi(T, tts, (nc) => dangNgay(nc, b12.id, sau(8000))));
  await voi(T, tts, (nc) => guiDuyet(nc, b12.id, { cheDo: "hen-gio", henLuc: sau(9000).toISOString() }, sau(8000)));
  dat("Thực tập sinh gửi duyệt (kèm giờ hẹn) → PENDING_APPROVAL", (await voi(T, tts, (nc) => chiTietBai(nc, b12.id))).trangThai === "PENDING_APPROVAL");
  dat("Trưởng phòng Marketing (cấp trên) nhận thông báo chờ duyệt", (await chu.notification.count({ where: { userId: tpmk, type: "mxh-cho-duyet", objectId: b12.id } })) === 1);
  dat("Bài hiện trong “Chờ duyệt” của Trưởng phòng", (await voi(T, tpmk, (nc) => danhSachChoDuyet(nc))).some((b) => b.id === b12.id));
  await nemLoi("Thực tập sinh không duyệt được (thiếu quyền)", "quyen", () => voi(T, tts, (nc) => duyetBai(nc, b12.id, null, sau(8000))));
  await nemLoi("Nhân viên Marketing không duyệt được", "quyen", () => voi(T, mk, (nc) => duyetBai(nc, b12.id, null, sau(8000))));
  const b12d = await voi(T, tpmk, (nc) => duyetBai(nc, b12.id, "Được", sau(8000)));
  dat("Trưởng phòng duyệt → SCHEDULED đúng giờ thực tập sinh chọn", b12d.trangThai === "SCHEDULED" && b12d.henLuc?.getTime() === sau(9000).getTime() && b12d.nguoiDuyet !== null);
  const b13 = await voi(T, tpmk, (nc) => taoBai(nc, { tieuDe: "Bài trưởng phòng DEMO", noiDung: "Nội dung", kenhIds: [kenh.id] }));
  await voi(T, tpmk, (nc) => guiDuyet(nc, b13.id, { cheDo: "khong" }, sau(8000)));
  await nemLoi("Không tự duyệt bài mình soạn → 403", "nghiep-vu", () => voi(T, tpmk, (nc) => duyetBai(nc, b13.id, null, sau(8000))), "khong-duoc-duyet");
  dat("Bài tự soạn KHÔNG hiện trong “Chờ duyệt” của chính mình", !(await voi(T, tpmk, (nc) => danhSachChoDuyet(nc))).some((b) => b.id === b13.id));
  await nemLoi("CSDL chặn approved_by = created_by (CHECK)", "csdl", () => chu.$executeRaw`UPDATE social_posts SET approved_by = created_by WHERE id = ${b13.id}::uuid`);
  const b13d = await voi(T, gd, (nc) => duyetBai(nc, b13.id, null, sau(8000)));
  dat("Giám đốc duyệt (không chọn giờ) → APPROVED", b13d.trangThai === "APPROVED");
  await voi(T, tpmk, (nc) => suaBai(nc, b13.id, { tieuDe: "Bài trưởng phòng DEMO (sửa)", noiDung: "Nội dung mới", kenhIds: [kenh.id] }));
  dat("Sửa bài đã duyệt → về nháp, mất duyệt", (await voi(T, tpmk, (nc) => chiTietBai(nc, b13.id))).trangThai === "DRAFT" && (await chu.socialPost.findUniqueOrThrow({ where: { id: b13.id } })).approvedBy === null);
  // Bài do AI tạo.
  const bAi = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài AI soạn DEMO", noiDung: "Nội dung AI", kenhIds: [kenh.id] }, "ai"));
  await nemLoi("Bài AI (cờ bật mặc định) đăng ngay → 409 cần duyệt", "nghiep-vu", () => voi(T, mk, (nc) => dangNgay(nc, bAi.id, sau(8000))), "can-duyet");
  await voi(T, mk, (nc) => guiDuyet(nc, bAi.id, { cheDo: "ngay" }, sau(8000)));
  const bAiTra = await voi(T, tpmk, (nc) => traLaiBai(nc, bAi.id, "Sửa lại câu kêu gọi"));
  dat("Trả lại → nháp, có lý do, người soạn được báo", bAiTra.trangThai === "DRAFT" && bAiTra.ghiChuDuyet === "Sửa lại câu kêu gọi" && (await chu.notification.count({ where: { userId: mk, type: "mxh-tra-lai" } })) === 1);
  await voi(T, mk, (nc) => guiDuyet(nc, bAi.id, { cheDo: "ngay" }, sau(8100)));
  const bAiD = await voi(T, tpmk, (nc) => duyetBai(nc, bAi.id, null, sau(8100)));
  dat("Duyệt bài AI (chế độ đăng ngay) → PUBLISHING, kênh QUEUED", bAiD.trangThai === "PUBLISHING" && bAiD.kenh[0].trangThai === "QUEUED");
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "mxh.ai_phai_duyet": 0 } }));
  const bAi2 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài AI hai DEMO", noiDung: "Nội dung AI", kenhIds: [kenh.id] }, "ai"));
  dat("Tắt cờ “AI phải duyệt” → bài AI đăng được không cần duyệt", (await voi(T, mk, (nc) => dangNgay(nc, bAi2.id, sau(8200)))).trangThai === "PUBLISHING");
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "mxh.ai_phai_duyet": null } }));
  await dangBaiMotVong(T, "w-thu-1", sau(9999));
  await dangBaiMotVong(T, "w-thu-1", sau(9999));

  // ==================================================================
  console.log("\n— 13. Khóa lặp lại (ADR-08) —");
  const l1 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài lặp DEMO", noiDung: "x", kenhIds: [kenh.id], khoaLapLai: `khoa-${DAU}` }));
  const l2 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài lặp DEMO", noiDung: "x", kenhIds: [kenh.id], khoaLapLai: `khoa-${DAU}` }));
  dat("Gửi lại cùng khóa → trả bài cũ, không tạo bài thứ hai", l1.id === l2.id && l2.trung === true && (await chu.socialPost.count({ where: { tenantId: T, idempotencyKey: `khoa-${DAU}` } })) === 1);
  const [s1, s2] = await Promise.all([
    voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Song song DEMO", noiDung: "x", kenhIds: [], khoaLapLai: `ss-${DAU}` })),
    voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Song song DEMO", noiDung: "x", kenhIds: [], khoaLapLai: `ss-${DAU}` })),
  ]).catch(() => [null, null]);
  dat("Hai yêu cầu song song cùng khóa → một bài", (await chu.socialPost.count({ where: { tenantId: T, idempotencyKey: `ss-${DAU}` } })) === 1 && (!s1 || !s2 || s1.id === s2.id));

  // ==================================================================
  console.log("\n— 14. Cách ly doanh nghiệp / IDOR —");
  await nemLoi("Doanh nghiệp khác xem bài → 404", "khong-thay", () => voi(T2, mkT2, (nc) => chiTietBai(nc, b1.id)));
  await nemLoi("Doanh nghiệp khác đăng lại bài → 404", "khong-thay", () => voi(T2, mkT2, (nc) => dangLai(nc, b6.id, sau(1))));
  await nemLoi("Doanh nghiệp khác ngắt kênh → 404", "khong-thay", () => voi(T2, mkT2, (nc) => ngatKenh(nc, kenh.id)));
  await nemLoi("Doanh nghiệp khác gắn kênh của T vào bài → 404", "nghiep-vu", () => voi(T2, mkT2, (nc) => taoBai(nc, { tieuDe: "x", noiDung: "x", kenhIds: [kenh.id] })), "khong-tim-thay");
  dat("Doanh nghiệp khác: danh sách kênh rỗng", (await voi(T2, mkT2, (nc) => danhSachKenh(nc))).length === 0);
  const ungDung = prisma;
  dat("Vai ứng dụng không ngữ cảnh: 0 bản niêm phong", ((await ungDung.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM social_credentials`)[0].n) === 0);
  dat("Vai ứng dụng ngữ cảnh T2: không thấy bản niêm phong / bài của T", await voiTenant(T2, async (tx) => (await tx.socialCredential.count()) === 0 && (await tx.socialPost.count({ where: { tenantId: T } })) === 0));
  dat("Vai ứng dụng chỉ ĐỌC danh mục nền tảng", await (async () => { try { await ungDung.$executeRaw`UPDATE social_connector_settings SET availability = 'AVAILABLE' WHERE platform = 'FACEBOOK_PAGE'`; return false; } catch { return true; } })());
  const bT2 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài chờ DEMO", noiDung: "x", kenhIds: [kenh.id] }));
  await voi(T, mk, (nc) => dangNgay(nc, bT2.id, sau(20000)));
  dat("Worker của T2 không nhận việc của T", (await nhanViecDang(T2, "w-T2", sau(20000))).length === 0);
  await dangBaiMotVong(T, "w-thu-1", sau(20000));
  // Chép bản niêm phong của kênh T sang một kênh khác → mở hỏng (AAD gắn kênh).
  let chepHong = false;
  try { moNiemPhong(cred, aadKenh(T, kenh2.id)); } catch { chepHong = true; }
  dat("Bản niêm phong chép sang kênh khác → không mở được", chepHong);

  // ==================================================================
  console.log("\n— 15. Link ảnh có ký, ngắn hạn (QĐ-198) —");
  const anh1 = (await voi(T, mk, (nc) => chiTietBai(nc, b1.id))).anh[0];
  const link = await voi(T, mk, (nc) => taoLinkMedia(nc, b1.id, anh1.id, MOC));
  const ma = link.url.split("/").pop()!;
  dat("Link hết hạn sau 60 phút (Cấu hình mặc định)", link.hetHan.getTime() === MOC.getTime() + 3600_000);
  dat("Còn hạn (59 phút) → hợp lệ", kiemMaMedia(ma, sau(59 * 60)).ok);
  const hetHan = kiemMaMedia(ma, sau(61 * 60));
  dat("Quá hạn (61 phút) → het-han", !hetHan.ok && hetHan.ly === "het-han");
  const phan = ma.split(".");
  const giaHan = Buffer.from(phan[0], "base64url").toString("utf8").replace(/\|\d+$/, "|4102444800");
  dat("Sửa hạn trong mã → sai chữ ký", (() => { const k = kiemMaMedia(`${Buffer.from(giaHan).toString("base64url")}.${phan[1]}`, MOC); return !k.ok && k.ly === "sai-chu-ky"; })());
  dat("Sửa chữ ký → sai chữ ký", (() => { const k = kiemMaMedia(`${phan[0]}.${(phan[1][0] === "A" ? "B" : "A") + phan[1].slice(1)}`, MOC); return !k.ok && k.ly === "sai-chu-ky"; })());
  const tep = await voiTenant(T, (tx) => docMediaCongKhai(tx, { tenantId: T, postId: b1.id, attachmentId: anh1.id, hetHanGiay: 0 }));
  dat("Phục vụ đúng tệp (byte khớp), đúng kiểu", !!tep && tep.noiDung.equals(PNG) && tep.mime === "image/png");
  const maXa = kyMaMedia({ tenantId: T, postId: b1.id, attachmentId: anh1.id, hetHanGiay: 4102444800 });
  const ph = await phatMedia(new NextRequest(`http://localhost/api/cong-khai/mxh/media/${maXa}`), { params: Promise.resolve({ ma: maXa }) });
  const thanPh = Buffer.from(await ph.arrayBuffer());
  dat("Route công khai: 200, Content-Type image/png, không chuyển hướng, đúng byte", ph.status === 200 && ph.headers.get("content-type") === "image/png" && !ph.headers.get("location") && thanPh.equals(PNG));
  dat("…có kiểm toán phát ảnh", (await chu.auditLog.count({ where: { tenantId: T, action: "phat-media-mxh", objectId: anh1.id } })) >= 1);
  const maCu = kyMaMedia({ tenantId: T, postId: b1.id, attachmentId: anh1.id, hetHanGiay: 946684800 });
  dat("Route: link hết hạn → 410", (await phatMedia(new NextRequest(`http://localhost/x/${maCu}`), { params: Promise.resolve({ ma: maCu }) })).status === 410);
  dat("Route: chữ ký sửa → 403", (await phatMedia(new NextRequest("http://localhost/x"), { params: Promise.resolve({ ma: `${maXa.slice(0, -2)}AA` }) })).status === 403);
  const maKhacBai = kyMaMedia({ tenantId: T, postId: b2.id, attachmentId: anh1.id, hetHanGiay: 4102444800 });
  dat("Route: tệp không thuộc bài trong mã → 404", (await phatMedia(new NextRequest("http://localhost/x"), { params: Promise.resolve({ ma: maKhacBai }) })).status === 404);
  const maT2 = kyMaMedia({ tenantId: T2, postId: b1.id, attachmentId: anh1.id, hetHanGiay: 4102444800 });
  dat("Route: mã ký đúng nhưng doanh nghiệp khác → 404 (RLS)", (await phatMedia(new NextRequest("http://localhost/x"), { params: Promise.resolve({ ma: maT2 }) })).status === 404);
  await nemLoi("Doanh nghiệp khác không tạo được link ảnh của T", "khong-thay", () => voi(T2, mkT2, (nc) => taoLinkMedia(nc, b1.id, anh1.id, MOC)));

  // ==================================================================
  console.log("\n— 16. Chống SSRF (SEC-04, QĐ-196) —");
  const gia = (ds: string[]) => async () => ds.map((a) => ({ address: a, family: (a.includes(":") ? 6 : 4) as 4 | 6 }));
  const chan = async (u: string, ds: string[]) => { try { await kiemDiaChi(new URL(u), gia(ds)); return false; } catch (e) { return e instanceof LoiGoiMang && !e.daGui; } };
  dat("Tên miền phân giải ra 10.x → chặn", await chan("https://noi-bo.vi-du.vn", ["10.0.0.5"]));
  dat("Một trong nhiều địa chỉ là nội bộ → chặn", await chan("https://hai.vi-du.vn", ["93.184.216.34", "192.168.1.10"]));
  dat("169.254.169.254 (metadata) → chặn", await chan("https://169.254.169.254/latest/meta-data", []));
  dat("metadata.google.internal → chặn theo tên", await chan("https://metadata.google.internal/", ["8.8.8.8"]));
  dat("100.100.100.200 (CGNAT / metadata Alibaba) → chặn", await chan("https://x.vi-du.vn", ["100.100.100.200"]));
  dat("IPv6 loopback / ánh xạ IPv4 / ULA → chặn", (await chan("https://[::1]/", [])) && (await chan("https://[::ffff:127.0.0.1]/", [])) && (await chan("https://x.vi-du.vn", ["fd00:ec2::254"])));
  dat("Địa chỉ công khai → cho", !(await chan("https://vi-du.vn", ["93.184.216.34"])));
  dat("http:// (không phải localhost thử) → chặn", await chan("http://vi-du.vn", ["93.184.216.34"]));
  choPhepLocalhostChoBaiThu(false);
  dat("Tắt chế độ bài thử: http://localhost → chặn", await chan(`http://localhost:${cong}/`, ["127.0.0.1"]));
  dat("…https://127.0.0.1 → chặn", await chan(`https://127.0.0.1:${cong}/`, []));
  choPhepLocalhostChoBaiThu(true);
  const loiGoi = async (yc: Parameters<typeof goiAnToan>[0]) => { try { await goiAnToan(yc); return null; } catch (e) { return e instanceof LoiGoiMang ? e.loai : "khac"; } };
  dat("Chuyển hướng sang máy khác → không theo", (await loiGoi({ url: `${site()}/chuyen-khac`, hanMs: 3000 })) === "chuyen-huong");
  dat("Chuyển hướng cùng máy (GET) → theo", (await goiAnToan({ url: `${site()}/chuyen-cung`, hanMs: 3000 })).status === 200);
  dat("Phản hồi vượt trần dung lượng → dừng", (await loiGoi({ url: `${site()}/to`, hanMs: 3000, tranPhanHoi: 1024 * 1024 })) === "qua-lon");

  // ==================================================================
  console.log("\n— 17. Quản trị → Kết nối nền tảng (API) (QĐ-199) —");
  const dsMk = await voi(T, mk, (nc) => danhSachThongTinApp(nc));
  dat("Marketing thấy trạng thái, không thấy giá trị", !dsMk.quanLy && dsMk.dong.every((d) => d.congKhai === null && d.bonSoCuoi === null));
  dat("Kỹ thuật thấy trạng thái", !(await voi(T, ktv, (nc) => danhSachThongTinApp(nc))).quanLy);
  await nemLoi("Kinh doanh không xem được", "quyen", () => voi(T, kd, (nc) => danhSachThongTinApp(nc)));
  await nemLoi("Quản trị CHƯA bật 2 lớp → không nhập được", "nghiep-vu", () => voi(T, ad, (nc) => luuThongTinApp(nc, "META", { appId: "123456789012", biMat: APP_SECRET })), "can-2-lop");
  await nemLoi("Marketing không nhập được", "quyen", () => voi(T, mk, (nc) => luuThongTinApp(nc, "META", { appId: "123456789012", biMat: APP_SECRET })));
  await nemLoi("App Secret sai định dạng → 400", "nghiep-vu", () => voi(T, gd, (nc) => luuThongTinApp(nc, "META", { appId: "123456789012", biMat: "khong-hop-le" })), "sai-dinh-dang");
  const kqKt = await voi(T, gd, (nc) => kiemTraThongTinApp(nc, "META", { appId: "123456789012", biMat: APP_SECRET }));
  dat("Kiểm tra Meta (bản rõ vừa nhập, Graph giả) → đúng", kqKt.trangThai === "ok", kqKt.thongBao);
  const kqSai = await voi(T, gd, (nc) => kiemTraThongTinApp(nc, "META", { appId: "123456789012", biMat: APP_SECRET_SAI }));
  dat("App Secret sai → Meta từ chối", kqSai.trangThai === "loi" && /từ chối/.test(kqSai.thongBao));
  const luu = await voi(T, gd, (nc) => luuThongTinApp(nc, "META", { appId: "123456789012", biMat: APP_SECRET }));
  const meta = luu.dong.find((d) => d.nhaCungCap === "META")!;
  dat("Lưu: chỉ hiện 4 ký tự cuối, Graph API điền sẵn", meta.bonSoCuoi === APP_SECRET.slice(-4) && meta.congKhai?.graphVersion === "v24.0" && meta.daCauHinh && meta.nguon === "man-hinh");
  dat("Phản hồi không chứa App Secret", !JSON.stringify(luu).includes(APP_SECRET));
  const dongApp = await chu.socialAppConfig.findFirstOrThrow({ where: { tenantId: T, provider: "META" } });
  dat("CSDL: bản niêm phong (AAD doanh nghiệp + nền tảng)", !!dongApp.ciphertext && moNiemPhong({ ciphertext: dongApp.ciphertext!, iv: dongApp.iv!, authTag: dongApp.authTag!, wrappedKey: dongApp.wrappedKey!, keyVersion: dongApp.keyVersion! }, aadApp(T, "META")) === APP_SECRET);
  const kt2 = await chu.auditLog.findFirst({ where: { tenantId: T, action: "doi-bi-mat-app-mxh" } });
  dat("Kiểm toán ghi “đã đổi App Secret Meta”, không có giá trị", !!kt2 && JSON.stringify(kt2.after).includes("đã đổi App Secret Meta") && !JSON.stringify(kt2).includes(APP_SECRET) && !JSON.stringify(kt2).includes(APP_SECRET.slice(-4)));
  const cho = await voi(T, gd, (nc) => kiemTraThongTinApp(nc, "META", {}));
  dat("Kiểm tra bí mật đã lưu → xếp việc cho worker", "dangCho" in cho && cho.dangCho === true);
  await kiemTraAppDaXep(T, MOC);
  dat("…worker mở niêm phong, gọi Graph giả → đạt", (await chu.socialAppConfig.findFirstOrThrow({ where: { tenantId: T, provider: "META" } })).checkStatus === "ok");
  dat("Google: Client ID sai dạng → 400", await (async () => { try { await voi(T, gd, (nc) => luuThongTinApp(nc, "GOOGLE", { clientId: "abc" })); return false; } catch (e) { return e instanceof LoiNghiepVu && e.ma === "sai-dinh-dang"; } })());
  await voi(T, gd, (nc) => luuThongTinApp(nc, "GOOGLE", { clientId: "1234567890-abcdefghij.apps.googleusercontent.com", biMat: "GOCSPX-abcdefghijklmnopqrstuvwx" }));
  dat("Google: kiểm định dạng (không gọi mạng)", (await voi(T, gd, (nc) => kiemTraThongTinApp(nc, "GOOGLE", {}))).trangThai === "chi-dinh-dang");
  await nemLoi("X / TikTok / LinkedIn: chưa hỗ trợ → 409", "nghiep-vu", () => voi(T, gd, (nc) => luuThongTinApp(nc, "TIKTOK", { appId: "1" })), "nen-tang-chua-ho-tro");
  dat("Danh sách có X, TikTok, LinkedIn ở trạng thái chưa hỗ trợ", luu.chuaHoTro.length === 3 && luu.chuaHoTro.every((c) => !c.hoTro));
  const envDp = { ...process.env, ZALO_APP_ID: "1234567890", ZALO_SECRET_KEY: "zalo-secret-thu-1234" };
  const tt = await docThongTinApp(T, "ZALO", envDp);
  dat("Chưa nhập Zalo trên màn hình → worker dùng biến môi trường máy chủ (dự phòng)", tt?.nguon === "may-chu" && tt.cong.appId === "1234567890");
  dat("Meta đã nhập → worker dùng giá trị màn hình", (await docThongTinApp(T, "META"))?.nguon === "man-hinh");
  await voi(T, gd, (nc) => xoaBiMatApp(nc, "GOOGLE"));
  dat("Xóa bí mật Google → chưa cấu hình", !(await voi(T, gd, (nc) => danhSachThongTinApp(nc))).dong.find((d) => d.nhaCungCap === "GOOGLE")!.daCauHinh);
  delete process.env.SOCIAL_MASTER_KEY;
  dat("Máy chủ thiếu khóa: màn hình báo rõ lý do", (await voi(T, gd, (nc) => danhSachThongTinApp(nc))).khoaChu.coKhoa === false);
  await nemLoi("…lưu bí mật mới → 503 thieu-social-master-key", "nghiep-vu", () => voi(T, gd, (nc) => luuThongTinApp(nc, "ZALO", { appId: "1234567890", biMat: "zalo-secret-1234" })), "thieu-social-master-key");
  await nemLoi("…nối kênh → 503", "nghiep-vu", () => voi(T, mk, (nc) => ketNoiWordPress(nc, { diaChi: `${site()}/ba`, tenDangNhap: "tacgia", matKhauUngDung: MK_UNG_DUNG })), "thieu-social-master-key");
  process.env.SOCIAL_MASTER_KEY = KHOA_THU;

  // ==================================================================
  console.log("\n— 18. Thiết lập ban đầu —");
  const tlGd = await voi(T, gd, (nc) => viecThietLap(nc));
  const vKenh = tlGd.nhom.flatMap((n) => n.viec).find((v) => v.ma === "ket-noi-kenh-mxh");
  const vApp = tlGd.nhom.flatMap((n) => n.viec).find((v) => v.ma === "thong-tin-app-mxh");
  dat("“Kết nối kênh mạng xã hội” (Marketing) — đã có kênh → xong", vKenh?.xong === true);
  dat("“Nhập thông tin app Meta / Google” (Quản trị) — Meta có, Google đã xóa → còn 1", vApp?.conThieu === 1, JSON.stringify(vApp));
  const tlMk2 = await voi(T2, mkT2, (nc) => viecThietLap(nc));
  dat("Doanh nghiệp chưa nối kênh → Marketing thấy việc còn thiếu", tlMk2.nhom.flatMap((n) => n.viec).find((v) => v.ma === "ket-noi-kenh-mxh")?.conThieu === 1);

  // ==================================================================
  console.log("\n— 19. Bí mật không xuất hiện trong API, nhật ký, kiểm toán —");
  const biMat = [MK_UNG_DUNG, MK_UNG_DUNG.replace(/ /g, ""), MK_UNG_DUNG_2, APP_SECRET, KHOA_THU, ...[...new Set(wp.authNhan.filter((h) => h.length > 10))].map((h) => h.slice(6))];
  const coBiMat = (s: string) => biMat.some((b) => s.includes(b));
  const [aud, ev, tb, at, kn] = await Promise.all([
    chu.auditLog.findMany({ where: { tenantId: T } }), chu.businessEvent.findMany({ where: { tenantId: T } }), chu.notification.findMany({ where: { tenantId: T } }),
    chu.socialPublishAttempt.findMany({ where: { tenantId: T } }), chu.socialConnection.findMany({ where: { tenantId: T } }),
  ]);
  dat("Kiểm toán không chứa mật khẩu ứng dụng / App Secret / tiêu đề Authorization", !coBiMat(JSON.stringify(aud)), `${aud.length} dòng`);
  dat("Sự kiện nghiệp vụ, thông báo không chứa bí mật", !coBiMat(JSON.stringify(ev)) && !coBiMat(JSON.stringify(tb)));
  dat("Nhật ký gọi nền tảng, dòng kênh không chứa bí mật", !coBiMat(JSON.stringify(at)) && !coBiMat(JSON.stringify(kn)));
  const api = JSON.stringify([await voi(T, gd, (nc) => danhSachKenh(nc, true)), await voi(T, gd, (nc) => danhSachBai(nc, { trang: 1 })), await voi(T, gd, (nc) => nhatKyDang(nc, b2.id)), await voi(T, gd, (nc) => danhSachThongTinApp(nc))]);
  dat("Dữ liệu API trả ra không chứa bí mật", !coBiMat(api));
  dat("Log máy chủ / worker trong suốt bài thử không chứa bí mật", !coBiMat(LOG.join("\n")), `${LOG.length} dòng log`);

  // ==================================================================
  console.log("\n— 20. Route / mã web không import được hàm giải mã (SEC-06) —");
  const GOC = path.resolve(__dirname, "..");
  const tepSrc: string[] = [];
  const duyet = (d: string) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) { if (f !== "generated") duyet(p); } else if (/\.(ts|tsx)$/.test(f)) tepSrc.push(p); } };
  duyet(path.join(GOC, "src"));
  const giai = (tu: string, s: string): string | null => {
    const goc = s.startsWith("@/") ? path.join(GOC, "src", s.slice(2)) : s.startsWith(".") ? path.resolve(path.dirname(tu), s) : null;
    if (!goc) return null;
    for (const duoi of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) { try { if (statSync(goc + duoi).isFile()) return goc + duoi; } catch { /* thử tiếp */ } }
    return goc;
  };
  const daDen = new Set<string>();
  const hang = tepSrc.filter((f) => f.includes(`${path.sep}app${path.sep}`));
  let lot: string | null = null;
  while (hang.length) {
    const f = hang.pop()!;
    if (daDen.has(f)) continue;
    daDen.add(f);
    if (f.startsWith(path.join(GOC, "worker"))) { lot = f; break; }
    let noi = "";
    try { noi = readFileSync(f, "utf8"); } catch { continue; }
    for (const m of noi.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g)) { const g = giai(f, m[1]); if (g) hang.push(g); }
  }
  dat(`Đồ thị import từ ${tepSrc.filter((f) => f.includes(`${path.sep}app${path.sep}`)).length} tệp route / trang: không chạm worker/`, lot === null && daDen.size > 100, lot ?? `${daDen.size} tệp`);
  dat("Không tệp nào trong src/ import worker/", tepSrc.every((f) => !/from\s+["'][^"']*\/worker\//.test(readFileSync(f, "utf8"))));
  const mxhSrc = tepSrc.filter((f) => f.includes(`${path.sep}mang-xa-hoi${path.sep}`));
  dat("Phân hệ mang-xa-hoi trong src/ không có createDecipheriv / moNiemPhong", mxhSrc.length > 5 && mxhSrc.every((f) => { const s = readFileSync(f, "utf8"); return !s.includes("createDecipheriv") && !/moNiemPhong|bocLaiKhoa/.test(s); }));
  dat("Luật ESLint cấm src/ import worker/", readFileSync(path.join(GOC, "eslint.config.mjs"), "utf8").includes("**/worker/**"));

  // ==================================================================
  console.log("\n— 21. Tự sinh SOCIAL_MASTER_KEY (bộ cài, trien-khai.sh — QĐ-201) —");
  const tm = mkdtempSync(path.join(tmpdir(), "cowork-env-"));
  const tepEnv = path.join(tm, ".env");
  writeFileSync(tepEnv, "APP_ENC_KEY=abc\nSOCIAL_MASTER_KEY=\n");
  execFileSync("bash", [path.join(GOC, "scripts/sinh-social-master-key.sh"), tepEnv], { stdio: "pipe" });
  const lan1 = readFileSync(tepEnv, "utf8");
  const khoa1 = /^SOCIAL_MASTER_KEY=(.+)$/m.exec(lan1)?.[1] ?? "";
  dat(".env chưa có khóa → sinh khóa 32 byte, giữ dòng cũ", Buffer.from(khoa1, "base64").length === 32 && lan1.startsWith("APP_ENC_KEY=abc\n") && (lan1.match(/^SOCIAL_MASTER_KEY=/gm) ?? []).length === 1);
  copyFileSync(tepEnv, `${tepEnv}.truoc`);
  const raLan2 = execFileSync("bash", [path.join(GOC, "scripts/sinh-social-master-key.sh"), tepEnv], { stdio: "pipe" }).toString();
  dat("Chạy lại → KHÔNG đè khóa đã có, không in khóa", readFileSync(tepEnv, "utf8") === readFileSync(`${tepEnv}.truoc`, "utf8") && !raLan2.includes(khoa1));
  dat("trien-khai.sh gọi script sinh khóa trước khi nạp .env", /sinh-social-master-key\.sh[\s\S]*source \.env/.test(readFileSync(path.join(GOC, "trien-khai.sh"), "utf8")));
  for (const ps of ["may-ca-nhan/cai-nhanh.ps1", "may-ca-nhan/cai-dat.ps1"]) {
    const s = readFileSync(path.join(GOC, ps), "utf8");
    dat(`${ps}: tạo .env mới có SOCIAL_MASTER_KEY; .env cũ thiếu thì thêm, không đè`, /SOCIAL_MASTER_KEY=\$\(/.test(s) && /-not \(Select-String -Path \$TepEnv -Pattern '\^SOCIAL_MASTER_KEY=\.\+'/.test(s));
  }
  dat("Sao lưu .env mã hóa nguyên tệp (gồm SOCIAL_MASTER_KEY); thử phục hồi kiểm khóa", readFileSync(path.join(GOC, "scripts/sao-luu.sh"), "utf8").includes("SOCIAL_MASTER_KEY") && readFileSync(path.join(GOC, "scripts/thu-phuc-hoi.sh"), "utf8").includes("SOCIAL_MASTER_KEY"));
  dat("docker-compose: worker có khóa và đọc được thư mục tệp đính kèm", /worker:[\s\S]*SOCIAL_MASTER_KEY[\s\S]*dinh-kem:ro/.test(readFileSync(path.join(GOC, "docker-compose.yml"), "utf8")));

  for (const r of wp.treo) r.destroy();
  may.close();
  ketLuan("Mạng xã hội 0.23.0");
}

main().catch((e) => {
  console.error("Bài thử hỏng ngoài dự kiến:", e);
  process.exit(1);
});
