import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

// Thư mục tệp đính kèm tạm + khóa chủ riêng của bài thử (không đụng .env, không in ra) — đặt TRƯỚC khi nạp module.
process.env.THU_MUC_DINH_KEM = mkdtempSync(path.join(tmpdir(), "cowork-qa-mxh-"));
const KHOA_1 = randomBytes(32).toString("base64");
process.env.SOCIAL_MASTER_KEY = KHOA_1;
process.env.SOCIAL_MASTER_KEY_VERSION = "1";
for (const k of Object.keys(process.env)) if (/^SOCIAL_MASTER_KEY_V\d+$/.test(k)) delete process.env[k];

import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { seedNenMong } from "../prisma/seed/index";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { dinhKemTep } from "../src/modules/dinh-kem/service";
import { aadKenh } from "../src/modules/mang-xa-hoi/bao-mat/khoa-chu";
import { niemPhong } from "../src/modules/mang-xa-hoi/bao-mat/niem-phong";
import { danhSachKenh, ketNoiWordPress, ngatKenh, yeuCauKiemTraKenh } from "../src/modules/mang-xa-hoi/kenh";
import { chiTietBai, dangLai, dangNgay, danhSachChoDuyet, duyetBai, gioVietNamCsv, guiDuyet, henGio, huyLich, nhatKyDang, suaBai, taoBai, traLaiBai, veNhap, xuatCsvBai } from "../src/modules/mang-xa-hoi/bai";
import { chuanHoaTieuDeWp } from "../src/modules/mang-xa-hoi/connectors/wordpress";
import { choPhepLocalhostChoBaiThu, goiAnToan, kiemDiaChi, LoiGoiMang } from "../src/modules/mang-xa-hoi/mang/goi-an-toan";
import { gioVietNamSangIso } from "../src/modules/mang-xa-hoi/tinh-toan";
import { kiemMaMedia, kyMaMedia, taoLinkMedia, taoLinkMediaHeThong } from "../src/modules/mang-xa-hoi/media-ky";
import { LoiNghiepVu } from "../src/lib/loi";
import { moNiemPhong } from "../worker/mang-xa-hoi/giai-ma";
import { dangBaiMotVong, nhanViecDang, xuLyViec } from "../worker/mang-xa-hoi/dang-bai";
import { bocLaiMotDoanhNghiep } from "../worker/mang-xa-hoi/boc-lai-khoa";
import { kiemTraKenhDaXep } from "../worker/mang-xa-hoi/kiem-tra";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * QA ĐỐI KHÁNG 0.23.0 — Mạng xã hội: nền tảng + WordPress. Mỗi mục tái hiện một lỗi QA tìm ra (đã sửa) hoặc khẳng định
 * một chốt chặn đã kiểm mà không thấy lỗi. WordPress là máy chủ GIẢ cục bộ; mốc nghiệp vụ là hằng số (không phụ thuộc
 * giờ thật / thứ trong tuần). Chạy: npm run thu:qa-mang-xa-hoi.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Math.floor(performance.timeOrigin).toString(36);
const MOC = new Date("2026-12-06T17:30:00Z"); // 00:30 Chủ nhật giờ VN — cố ý chọn ngày "khó"
const sau = (giay: number) => new Date(MOC.getTime() + giay * 1000);
const MK = `qaqa EFGH ${DAU.slice(0, 4)} ijkl MNOP qrst`;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(300)]);
const ngu = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// WordPress GIẢ. "tacgia" là tài khoản Tác giả (KHÔNG có unfiltered_html) → tiêu đề bị lọc kses như WordPress thật.
// ---------------------------------------------------------------------------
interface BaiGia { id: number; slug: string; title: string; status: string }
const wp = {
  bai: new Map<number, BaiGia>(),
  idTiep: 5000,
  soYeuCauTao: 0,
  treoMedia: 0,
  choMedia: [] as (() => void)[],
  doiTieuDe: false,
  /** Site (plugin bảo mật / chế độ gỡ lỗi) nhại lại tiêu đề Authorization + mật khẩu trong thông báo lỗi. */
  nhaiBiMat: false,
  /** Lần tạo bài tới trả 400 với mã lỗi rất dài (plugin tự đặt). */
  maDai: false,
};
let cong = 0;
const site = () => `http://localhost:${cong}`;

/** Mô phỏng wp_filter_kses trên tiêu đề: & lẻ → &amp;, < không mở thẻ → &lt;, gỡ thẻ script. */
function kses(s: string): string {
  return s
    .replace(/<\/?script[^>]*>/gi, "")
    .replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, "&amp;")
    .replace(/<(?![a-z/!])/gi, "&lt;");
}

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

const may = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const p = url.pathname.replace(/^\/(nhai|dai|cs|cs2|cs3)(?=\/)/, "");
  const than = await docThan(req);
  // Chuỗi chuyển hướng cùng máy, mỗi bước chậm — thử hạn giờ tính cho cả lần gọi.
  const cham = /^\/cham\/(\d+)$/.exec(p);
  if (cham) {
    await ngu(700);
    const n = Number(cham[1]);
    if (n <= 0) return json(res, 200, { ok: true });
    res.writeHead(302, { Location: `/cham/${n - 1}` });
    return res.end();
  }
  if (!p.startsWith("/wp-json/wp/v2/")) return json(res, 404, { code: "rest_no_route" });
  const h = req.headers.authorization ?? "";
  // REST công khai (không đăng nhập): chỉ đọc bài đã công khai, không có title.raw — như WordPress thật.
  if (!h && req.method === "GET") {
    const rr = p.slice("/wp-json/wp/v2".length);
    const mm = /^\/posts\/(\d+)$/.exec(rr);
    const congKhai = (b: BaiGia) => ({ id: b.id, status: b.status, slug: b.slug, link: `${site()}/?p=${b.id}` });
    if (mm) { const b = wp.bai.get(Number(mm[1])); return b && b.status === "publish" ? json(res, 200, congKhai(b)) : json(res, 401, { code: "rest_forbidden" }); }
    if (rr === "/posts") return json(res, 200, [...wp.bai.values()].filter((b) => b.status === "publish" && b.slug === url.searchParams.get("slug")).map(congKhai));
  }
  const [u, ...pw] = Buffer.from(h.slice(6), "base64").toString("utf8").split(":");
  if (u !== "tacgia" || pw.join(":").replace(/\s+/g, "") !== MK.replace(/\s+/g, "")) return json(res, 401, { code: "incorrect_password", message: "Sai." });
  const r = p.slice("/wp-json/wp/v2".length);
  if (wp.nhaiBiMat) {
    const giai = Buffer.from(h.slice(6), "base64").toString("utf8");
    return json(res, r === "/users/me" ? 403 : 400, { code: "rest_forbidden", message: `<p>Debug: header ${h} — user:pass ${giai} — pass ${giai.split(":").slice(1).join(":").replace(/\s+/g, "")}</p>` });
  }
  if (r === "/users/me") return json(res, 200, { id: 9, name: "Tác giả DEMO", capabilities: { publish_posts: true, upload_files: true } });
  if (r === "/media" && req.method === "POST") {
    const id = ++wp.idTiep;
    if (wp.treoMedia > 0) {
      wp.treoMedia--;
      await new Promise<void>((tha) => wp.choMedia.push(tha));
    }
    return json(res, 201, { id, mime_type: req.headers["content-type"] });
  }
  if (r === "/posts" && req.method === "POST" && wp.maDai) {
    wp.maDai = false;
    return json(res, 400, { code: `plugin_${"x".repeat(300)}`, message: "Plugin từ chối." });
  }
  if (r === "/posts" && req.method === "POST") {
    wp.soYeuCauTao++;
    const d = JSON.parse(than.toString("utf8")) as { title: string; slug: string; status: string };
    const id = ++wp.idTiep;
    // WordPress thật: slug trùng → thêm "-2".
    const trung = [...wp.bai.values()].some((b) => b.slug === d.slug);
    const b: BaiGia = { id, slug: trung ? `${d.slug}-2` : d.slug, title: wp.doiTieuDe ? "Tiêu đề bị đổi hẳn" : kses(d.title), status: d.status };
    wp.bai.set(id, b);
    return json(res, 201, { id, status: b.status, slug: b.slug, link: `${site()}/?p=${id}` });
  }
  const m = /^\/posts\/(\d+)$/.exec(r);
  if (m && req.method === "GET") {
    const b = wp.bai.get(Number(m[1]));
    if (!b) return json(res, 404, { code: "rest_post_invalid_id" });
    return json(res, 200, { id: b.id, status: b.status, slug: b.slug, link: `${site()}/?p=${b.id}`, title: { raw: b.title, rendered: b.title } });
  }
  if (r === "/posts" && req.method === "GET") {
    const slug = url.searchParams.get("slug");
    return json(res, 200, [...wp.bai.values()].filter((b) => b.slug === slug).map((b) => ({ id: b.id, slug: b.slug, status: b.status })));
  }
  return json(res, 404, { code: "rest_no_route" });
});

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => viec(taoNguCanh(tx, tenantId, (await layHoSoQuyen(tx, userId))!, "198.51.100.7", "thu-qa-mxh")), { timeoutMs: 60_000 });
}
const kenhBai = (postId: string) => chu.socialPostTarget.findFirstOrThrow({ where: { postId } });
const soBaiTheoKhoa = (khoa: string) => [...wp.bai.values()].filter((b) => b.slug.startsWith(khoa)).length;

async function main() {
  await new Promise<void>((ok) => may.listen(0, "127.0.0.1", () => ok()));
  cong = (may.address() as { port: number }).port;
  choPhepLocalhostChoBaiThu(true);
  console.log("=== QA đối kháng 0.23.0 — Mạng xã hội ===\n");

  const T = (await seedNenMong(chu, `qa-mxh-${DAU}`, "DN QA MXH DEMO")).id;
  const T2 = (await seedNenMong(chu, `qa-mxh2-${DAU}`, "DN QA MXH 2 DEMO")).id;
  const vaiTro = async (code: string, t: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: t, code } } })).id;
  async function nguoi(ten: string, vai: string, t = T, quanLy: string | null = null) {
    const u = await chu.user.create({
      data: {
        tenantId: t, email: `${ten}.${DAU}@thu.test`, passwordHash: "x", fullName: `${ten} DEMO`,
        userRoles: { create: { tenantId: t, roleId: await vaiTro(vai, t) } },
        staffProfile: { create: { tenantId: t, hiredAt: new Date("2025-01-01T00:00:00Z"), managerId: quanLy } },
      },
    });
    return u.id;
  }
  const gd = await nguoi("qa-gd", "ceo");
  const mk = await nguoi("qa-mk", "marketing");
  const gd2 = await nguoi("qa-gd2", "ceo", T2);
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "mxh.han_goi_giay": 20, "mxh.cho_doi_soat_giay": 0, "mxh.so_lan_thu_toi_da": 3 } }));
  const kenh = await voi(T, mk, (nc) => ketNoiWordPress(nc, { diaChi: site(), tenDangNhap: "tacgia", matKhauUngDung: MK, ten: "Site QA DEMO" }));
  const kenhT2 = await voi(T2, gd2, (nc) => ketNoiWordPress(nc, { diaChi: site(), tenDangNhap: "tacgia", matKhauUngDung: MK, ten: "Site QA 2 DEMO" }));

  // ==================================================================
  console.log("— QA-1. Tiêu đề có “&” / “<” với tài khoản Tác giả (kses) — bài đã lên không được báo Lỗi —");
  dat("chuanHoaTieuDeWp: “A &amp; B” ≡ “A & B”, “&lt;” ≡ “<”, &#8211; ≡ –", chuanHoaTieuDeWp("A &amp; B &lt; 10 &#8211; x") === chuanHoaTieuDeWp("A & B < 10 – x"));
  dat("…tiêu đề khác thật vẫn khác", chuanHoaTieuDeWp("Khai trương") !== chuanHoaTieuDeWp("Khuyến mãi"));
  const tieuDe = "Laptop & phụ kiện — giá < 10 triệu DEMO";
  const b1 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe, noiDung: "Nội dung QA-1", kenhIds: [kenh.id] }));
  await voi(T, mk, (nc) => dangNgay(nc, b1.id, MOC));
  await dangBaiMotVong(T, "w-qa", MOC);
  let x = await kenhBai(b1.id);
  dat("WordPress lưu tiêu đề đã lọc (“&amp;”, “&lt;”) — máy giả mô phỏng đúng", [...wp.bai.values()].some((b) => b.title.includes("&amp;") && b.title.includes("&lt;")));
  dat("Đọc lại sau kses → PUBLISHED (không FAILED “doc-lai-khong-khop”)", x.status === "PUBLISHED", `${x.status} ${x.errorCode} ${x.errorMessage}`);
  dat("…đúng 1 bài trên WordPress", soBaiTheoKhoa(x.reconcileKey) === 1);
  wp.doiTieuDe = true;
  const b1b = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Tiêu đề gốc QA DEMO", noiDung: "Nội dung", kenhIds: [kenh.id] }));
  await voi(T, mk, (nc) => dangNgay(nc, b1b.id, sau(10)));
  await dangBaiMotVong(T, "w-qa", sau(10));
  x = await kenhBai(b1b.id);
  dat("Tiêu đề trên site khác hẳn → vẫn KHÔNG đánh dấu đã đăng (doc-lai-khong-khop)", x.status !== "PUBLISHED" && x.errorCode === "doc-lai-khong-khop", `${x.status} ${x.errorCode}`);
  wp.doiTieuDe = false;

  // ==================================================================
  console.log("\n— QA-2. Hai worker: lô dài, mốc giữ khóa cũ → worker kia coi là kẹt và đăng trùng —");
  const p1 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Lô dài một DEMO", noiDung: "x", kenhIds: [kenh.id] }));
  const p2 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Lô dài hai DEMO", noiDung: "x", kenhIds: [kenh.id] }));
  await voi(T, mk, (nc) => dinhKemTep(nc, { loai: "social_post", doiTuongId: p2.id, tenTep: "anh.png", noiDung: PNG }));
  const T0 = sau(1000);
  await voi(T, mk, (nc) => dangNgay(nc, p1.id, T0));
  await voi(T, mk, (nc) => dangNgay(nc, p2.id, T0));
  const viec = await nhanViecDang(T, "w-A", T0);
  const t1 = (await kenhBai(p1.id)).id;
  const t2 = (await kenhBai(p2.id)).id;
  dat("Worker A nhận cả lô (2 việc) lúc T0", viec.length === 2 && viec.some((v) => v.targetId === t1) && viec.some((v) => v.targetId === t2));
  await xuLyViec(T, "w-A", viec.find((v) => v.targetId === t1)!, T0);
  // Việc thứ hai bắt đầu sau 9 phút (lô dài); tải ảnh chậm.
  wp.treoMedia = 1;
  const truocTao = wp.soYeuCauTao;
  const choA = xuLyViec(T, "w-A", viec.find((v) => v.targetId === t2)!, new Date(T0.getTime() + 9 * 60_000));
  for (let i = 0; i < 100 && wp.choMedia.length === 0; i++) await ngu(50);
  dat("Worker A đang tải ảnh của việc thứ hai", wp.choMedia.length === 1);
  // Worker B chạy lúc T0 + 11 phút (quá mxh.phut_ket_dang tính từ lúc A NHẬN lô, nhưng A mới BẮT ĐẦU việc này 2 phút).
  const T11 = new Date(T0.getTime() + 11 * 60_000);
  await dangBaiMotVong(T, "w-B", T11);
  await dangBaiMotVong(T, "w-B", T11);
  const giuaChung = await chu.socialPostTarget.findUniqueOrThrow({ where: { id: t2 } });
  dat("Worker B KHÔNG coi việc đang chạy là kẹt (vẫn PUBLISHING, A giữ khóa)", giuaChung.status === "PUBLISHING" && giuaChung.lockedBy === "w-A", `${giuaChung.status} ${giuaChung.lockedBy}`);
  for (const tha of wp.choMedia.splice(0)) tha();
  await choA;
  x = await chu.socialPostTarget.findUniqueOrThrow({ where: { id: t2 } });
  dat("Đúng 1 yêu cầu tạo bài, 1 bài trên WordPress (không trùng)", wp.soYeuCauTao - truocTao === 1 && soBaiTheoKhoa(x.reconcileKey) === 1, `yêu cầu ${wp.soYeuCauTao - truocTao}, bài ${soBaiTheoKhoa(x.reconcileKey)}`);
  dat("…kênh-bài PUBLISHED", x.status === "PUBLISHED", x.status);

  // Ngưỡng "kẹt" không ngắn hơn thời gian một lượt hợp lệ (4 lần gọi × hạn gọi).
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "mxh.han_goi_giay": 120, "mxh.phut_ket_dang": 2 } }));
  const p3 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Ngưỡng kẹt DEMO", noiDung: "x", kenhIds: [kenh.id] }));
  const T1 = sau(5000);
  await voi(T, mk, (nc) => dangNgay(nc, p3.id, T1));
  const v3 = await nhanViecDang(T, "w-A", T1);
  await nhanViecDang(T, "w-B", new Date(T1.getTime() + 3 * 60_000), 0);
  x = await kenhBai(p3.id);
  dat("Hạn gọi 120 giây, “kẹt sau 2 phút”: lượt mới chạy 3 phút KHÔNG bị coi là kẹt", x.status === "PUBLISHING" && x.lockedBy === "w-A", `${x.status} ${x.lockedBy}`);
  await nhanViecDang(T, "w-B", new Date(T1.getTime() + 11 * 60_000), 0);
  dat("…quá 5 × hạn gọi (10 phút) thì vẫn chuyển đối soát (worker chết thật)", (await kenhBai(p3.id)).status === "VERIFYING");
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "mxh.han_goi_giay": 20, "mxh.phut_ket_dang": null } }));
  dat("Worker A tới muộn (đã mất khóa) → bỏ qua, không gọi nền tảng", (await xuLyViec(T, "w-A", v3[0], new Date(T1.getTime() + 12 * 60_000))).ketQua === "bo-qua");
  await dangBaiMotVong(T, "w-B", new Date(T1.getTime() + 12 * 60_000));
  await dangBaiMotVong(T, "w-B", new Date(T1.getTime() + 12 * 60_000));
  dat("…đối soát rồi đăng → PUBLISHED, 1 bài", (await kenhBai(p3.id)).status === "PUBLISHED" && soBaiTheoKhoa((await kenhBai(p3.id)).reconcileKey) === 1);

  // Mốc của TỪNG việc lấy từ đồng hồ (worker thật), không dùng một mốc cho cả vòng.
  const q1 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Đồng hồ một DEMO", noiDung: "x", kenhIds: [kenh.id] }));
  const q2 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Đồng hồ hai DEMO", noiDung: "x", kenhIds: [kenh.id] }));
  const T2h = sau(9000);
  await voi(T, mk, (nc) => dangNgay(nc, q1.id, T2h));
  await voi(T, mk, (nc) => dangNgay(nc, q2.id, T2h));
  const gio = [new Date(T2h.getTime() + 60_000), new Date(T2h.getTime() + 120_000)];
  let i = 0;
  await dangBaiMotVong(T, "w-C", T2h, 5, process.env, () => gio[Math.min(i++, 1)]);
  const xm = [(await kenhBai(q1.id)).verifiedAt?.getTime(), (await kenhBai(q2.id)).verifiedAt?.getTime()].sort();
  dat("dangBaiMotVong dùng đồng hồ cho từng việc (mốc xác minh = lúc bắt đầu việc)", xm[0] === gio[0].getTime() && xm[1] === gio[1].getTime(), JSON.stringify(xm));
  dat("worker/index.ts không truyền một mốc cố định cho cả vòng", !/vongMangXaHoi\(prisma, workerId, new Date\(\)\)/.test(readFileSync(path.join(__dirname, "../worker/index.ts"), "utf8")));

  // Hạn giờ tính cho cả lần gọi — chuỗi chuyển hướng cùng máy không nhân hạn lên.
  const tg = Date.now();
  let loaiLoi: string | null = null;
  try { await goiAnToan({ url: `${site()}/cham/3`, hanMs: 1500 }); } catch (e) { loaiLoi = e instanceof LoiGoiMang ? e.loai : "khac"; }
  dat("3 lần chuyển hướng × 0,7 giây với hạn 1,5 giây → hết giờ (không chờ 2,8 giây)", loaiLoi !== null && loaiLoi.startsWith("het-gio") && Date.now() - tg < 2500, `${loaiLoi} ${Date.now() - tg}ms`);

  // ==================================================================
  console.log("\n— QA-3. Xoay khóa trong lúc có người nhập lại mật khẩu ứng dụng — không mất bí mật —");
  const K2 = randomBytes(32).toString("base64");
  const envXoay = { ...process.env, SOCIAL_MASTER_KEY: K2, SOCIAL_MASTER_KEY_VERSION: "2", SOCIAL_MASTER_KEY_V1: KHOA_1 } as NodeJS.ProcessEnv;
  const banMoi = JSON.stringify({ tenDangNhap: "tacgia", matKhau: `${MK} moi` });
  // App (đã chạy khóa mới) niêm phong lại trong một giao dịch còn mở; bọc lại khóa chạy song song.
  let tha!: () => void;
  const cho = new Promise<void>((r) => { tha = r; });
  const giu = chu.$transaction(async (tx) => {
    const bn = niemPhong(banMoi, aadKenh(T, kenh.id), { khoa: Buffer.from(K2, "base64"), phienBan: 2 });
    await tx.socialCredential.update({ where: { connectionId: kenh.id }, data: bn });
    await cho;
  }, { timeout: 30_000 });
  await ngu(300);
  const xoay = bocLaiMotDoanhNghiep(T, envXoay);
  await ngu(800);
  tha();
  await giu;
  await xoay;
  const dong = await chu.socialCredential.findUniqueOrThrow({ where: { connectionId: kenh.id } });
  let mo: string | null = null;
  try { mo = moNiemPhong(dong, aadKenh(T, kenh.id), envXoay); } catch { mo = null; }
  dat("Sau khi xoay: bí mật vừa nhập lại vẫn mở được bằng khóa mới (không bị ghép data key cũ)", mo === banMoi, mo === null ? "không mở được — mất bí mật" : "khác bản vừa nhập");
  // Xoay khóa bình thường: không mất, chạy lại được, thiếu khóa cũ thì báo rõ và không đổi gì.
  const truocXoay = await chu.socialCredential.findUniqueOrThrow({ where: { connectionId: kenhT2.id } });
  const kq1 = await bocLaiMotDoanhNghiep(T2, envXoay);
  const sauXoay = await chu.socialCredential.findUniqueOrThrow({ where: { connectionId: kenhT2.id } });
  dat("Bọc lại: phiên bản 2, bản mã giữ nguyên, mở được bằng khóa mới", kq1.kenh === 1 && sauXoay.keyVersion === 2 && Buffer.from(sauXoay.ciphertext).equals(Buffer.from(truocXoay.ciphertext)) && JSON.parse(moNiemPhong(sauXoay, aadKenh(T2, kenhT2.id), envXoay)).matKhau === MK);
  dat("Chạy lại → 0 dòng (idempotent)", (await bocLaiMotDoanhNghiep(T2, envXoay)).kenh === 0);
  const envThieu = { ...process.env, SOCIAL_MASTER_KEY: randomBytes(32).toString("base64"), SOCIAL_MASTER_KEY_VERSION: "3" } as NodeJS.ProcessEnv;
  let loiThieu = "";
  try { await bocLaiMotDoanhNghiep(T2, envThieu); } catch (e) { loiThieu = e instanceof Error ? e.message : String(e); }
  dat("Thiếu khóa phiên bản cũ → lỗi nêu tên biến, CSDL không đổi", /SOCIAL_MASTER_KEY_V2/.test(loiThieu) && (await chu.socialCredential.findUniqueOrThrow({ where: { connectionId: kenhT2.id } })).keyVersion === 2, loiThieu);

  // ==================================================================
  console.log("\n— QA-4. Xuất CSV bài: chống chèn công thức (CSV-01) —");
  await voi(T, mk, (nc) => taoBai(nc, { tieuDe: '=HYPERLINK("http://vi-du.vn","Bấm") DEMO', noiDung: "@SUM(1+1)", kenhIds: [] }));
  const csv = await voi(T, gd, (nc) => xuatCsvBai(nc));
  dat("Ô bắt đầu bằng “=” được thêm dấu ' (Excel hiện nguyên văn)", csv.includes(`'=HYPERLINK`) && !/(^|[\r\n,])"?=HYPERLINK/.test(csv));
  dat("…vẫn có BOM + tiêu đề cột tiếng Việt", csv.startsWith("﻿Tiêu đề,Trạng thái"));

  // ==================================================================
  console.log("\n— QA-5. Hẹn giờ theo giờ Việt Nam, không theo múi giờ của trình duyệt (MXH-16) —");
  const tzCu = process.env.TZ;
  process.env.TZ = "UTC";
  dat("“2026-12-07T09:00” (ô datetime-local) = 02:00 UTC dù máy đặt múi giờ UTC", gioVietNamSangIso("2026-12-07T09:00") === "2026-12-07T02:00:00.000Z");
  process.env.TZ = "America/New_York";
  dat("…và dù máy đặt múi giờ New York", gioVietNamSangIso("2026-12-07T09:00:30") === "2026-12-07T02:00:30.000Z");
  if (tzCu === undefined) delete process.env.TZ; else process.env.TZ = tzCu;
  dat("Chuỗi đã có múi giờ giữ nguyên; sai dạng → null", gioVietNamSangIso("2026-12-07T09:00:00+07:00") === "2026-12-07T02:00:00.000Z" && gioVietNamSangIso("mai 9h") === null && gioVietNamSangIso("") === null);
  dat("Màn hình bài dùng gioVietNamSangIso cho hẹn giờ / gửi duyệt", readFileSync(path.join(__dirname, "../src/components/mang-xa-hoi/ThaoTacBai.tsx"), "utf8").includes("gioVietNamSangIso"));

  // ==================================================================
  console.log("\n— QA-6. Tự sinh SOCIAL_MASTER_KEY: dòng có cặp nháy rỗng là CHƯA có khóa —");
  const tm = mkdtempSync(path.join(tmpdir(), "cowork-qa-env-"));
  for (const [so, ten, dong] of [[1, "nháy kép rỗng", 'SOCIAL_MASTER_KEY=""'], [2, "nháy đơn rỗng", "SOCIAL_MASTER_KEY=''"], [3, "chỉ dấu cách", "SOCIAL_MASTER_KEY=   "]] as const) {
    const tep = path.join(tm, `.env-${so}`);
    writeFileSync(tep, `APP_ENC_KEY=abc\n${dong}\nTEN_CONG_TY=Thế Giới Tin Học\n`);
    execFileSync("bash", [path.join(__dirname, "../scripts/sinh-social-master-key.sh"), tep], { stdio: "pipe" });
    const s = readFileSync(tep, "utf8");
    const khoa = /^SOCIAL_MASTER_KEY=(.*)$/gm;
    const ds = [...s.matchAll(khoa)].map((m) => m[1]);
    dat(`${ten} → sinh khóa 32 byte, chỉ còn 1 dòng, giữ chữ có dấu`, ds.length === 1 && Buffer.from(ds[0], "base64").length === 32 && s.includes("TEN_CONG_TY=Thế Giới Tin Học"));
  }
  const tepCo = path.join(tm, ".env-co");
  writeFileSync(tepCo, 'SOCIAL_MASTER_KEY="abcdEFGH1234abcdEFGH1234abcdEFGH1234abcdEFG="\n');
  execFileSync("bash", [path.join(__dirname, "../scripts/sinh-social-master-key.sh"), tepCo], { stdio: "pipe" });
  dat("Khóa có giá trị trong nháy → giữ nguyên", readFileSync(tepCo, "utf8") === 'SOCIAL_MASTER_KEY="abcdEFGH1234abcdEFGH1234abcdEFGH1234abcdEFG="\n');
  for (const ps of ["may-ca-nhan/cai-nhanh.ps1", "may-ca-nhan/cai-dat.ps1"]) {
    const s = readFileSync(path.join(__dirname, "..", ps), "utf8");
    dat(`${ps}: đọc .env bằng UTF-8, nháy rỗng là chưa có khóa (đọc mã — máy thử không có PowerShell)`, s.includes("Get-Content -Encoding UTF8 $TepEnv") && s.includes(`-Pattern '^SOCIAL_MASTER_KEY=["'']?[A-Za-z0-9+/]'`));
  }

  // ==================================================================
  console.log("\n— QA-8. Site nhại lại mật khẩu ứng dụng trong thông báo lỗi — không được lưu / hiện cho người chỉ có mxh.view —");
  const kenh3 = await voi(T, mk, (nc) => ketNoiWordPress(nc, { diaChi: `${site()}/nhai`, tenDangNhap: "tacgia", matKhauUngDung: MK, ten: "Site nhại DEMO" }));
  wp.nhaiBiMat = true;
  const b8 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài site nhại DEMO", noiDung: "x", kenhIds: [kenh3.id] }));
  await voi(T, mk, (nc) => dangNgay(nc, b8.id, sau(20000)));
  await dangBaiMotVong(T, "w-qa", sau(20000));
  await voi(T, mk, (nc) => yeuCauKiemTraKenh(nc, kenh3.id, sau(20001)));
  await kiemTraKenhDaXep(T, sau(20001));
  wp.nhaiBiMat = false;
  const xB8 = await kenhBai(b8.id);
  const hdr = `Basic ${Buffer.from(`tacgia:${MK}`, "utf8").toString("base64")}`;
  const biMat8 = [MK, MK.replace(/\s+/g, ""), hdr.slice(6), hdr];
  const lo = (s: string) => biMat8.filter((b) => s.includes(b)).length;
  dat("Site trả lỗi (FAILED) — máy giả đúng là có nhại bí mật", xB8.status === "FAILED" && /Debug/.test(xB8.errorMessage ?? ""), `${xB8.status} ${xB8.errorMessage}`);
  const dongLo = JSON.stringify([
    xB8,
    await chu.socialPublishAttempt.findMany({ where: { targetId: xB8.id } }),
    await chu.notification.findMany({ where: { tenantId: T, objectId: b8.id } }),
    await chu.socialConnection.findUniqueOrThrow({ where: { id: kenh3.id } }),
    await chu.auditLog.findMany({ where: { tenantId: T } }),
    await chu.businessEvent.findMany({ where: { tenantId: T } }),
  ]);
  dat("CSDL (kênh-bài, nhật ký gọi, thông báo, kênh, kiểm toán, sự kiện) không chứa mật khẩu / tiêu đề Authorization", lo(dongLo) === 0, `${lo(dongLo)} dạng bí mật bị lưu`);
  const apiLo = JSON.stringify([await voi(T, mk, (nc) => chiTietBai(nc, b8.id)), await voi(T, mk, (nc) => nhatKyDang(nc, b8.id)), await voi(T, mk, (nc) => danhSachKenh(nc))]);
  dat("API chi tiết bài / nhật ký / kênh không trả bí mật", lo(apiLo) === 0);

  // Mã lỗi site trả về dài hơn cột error_code (100) → vẫn ghi được kết quả, không kẹt.
  const kenh4 = await voi(T, mk, (nc) => ketNoiWordPress(nc, { diaChi: `${site()}/dai`, tenDangNhap: "tacgia", matKhauUngDung: MK, ten: "Site mã dài DEMO" }));
  wp.maDai = true;
  const b9 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài mã lỗi dài DEMO", noiDung: "x", kenhIds: [kenh4.id] }));
  await voi(T, mk, (nc) => dangNgay(nc, b9.id, sau(21000)));
  const kq9 = await dangBaiMotVong(T, "w-qa", sau(21000));
  const x9 = await kenhBai(b9.id);
  dat("Site trả mã lỗi 300 ký tự → FAILED PERMANENT ngay, mã lưu ≤ 100 ký tự (không đối soát / thử lại vòng vo)", x9.status === "FAILED" && x9.errorClass === "PERMANENT" && (x9.errorCode ?? "").length <= 100 && kq9.some((k) => k.ketQua === "that-bai"), `${x9.status} ${x9.errorClass} ${x9.errorCode?.length} ${JSON.stringify(kq9)}`);

  // ==================================================================
  console.log("\n— QA-7. Chốt chặn đã kiểm, không thấy lỗi —");
  const cred = await chu.socialCredential.findUniqueOrThrow({ where: { connectionId: kenhT2.id } });
  const hong = (f: () => unknown) => { try { f(); return false; } catch { return true; } };
  dat("Chép bản niêm phong của T2 sang kênh của T (AAD khác) → không mở được", hong(() => moNiemPhong(cred, aadKenh(T, kenh.id), envXoay)));
  const sua1 = Buffer.from(cred.ciphertext); sua1[0] ^= 1;
  dat("Sửa 1 byte bản mã → không mở được", hong(() => moNiemPhong({ ...cred, ciphertext: new Uint8Array(sua1) }, aadKenh(T2, kenhT2.id), envXoay)));
  const sua2 = Buffer.from(cred.wrappedKey); sua2[40] ^= 1;
  dat("Sửa data key đã bọc → không mở được", hong(() => moNiemPhong({ ...cred, wrappedKey: new Uint8Array(sua2) }, aadKenh(T2, kenhT2.id), envXoay)));
  dat("Đổi phiên bản khóa ghi trên dòng → không mở được (AAD bọc gắn phiên bản)", hong(() => moNiemPhong({ ...cred, keyVersion: 1 }, aadKenh(T2, kenhT2.id), envXoay)));
  const chan = async (u: string) => { try { await kiemDiaChi(new URL(u), async () => [{ address: "93.184.216.34", family: 4 }]); return false; } catch (e) { return e instanceof LoiGoiMang && e.loai === "chan-dia-chi"; } };
  choPhepLocalhostChoBaiThu(false);
  dat("IP thập phân / bát phân / hex (2130706433, 0177.0.0.1, 0x7f.1) → URL chuẩn hóa thành 127.0.0.1 → chặn", (await chan("https://2130706433/")) && (await chan("https://0177.0.0.1/")) && (await chan("https://0x7f.1/")));
  dat("[::ffff:7f00:1], [::ffff:a9fe:a9fe] (metadata) → chặn", (await chan("https://[::ffff:7f00:1]/")) && (await chan("https://[::ffff:a9fe:a9fe]/")));
  dat("Tên miền phân giải ra ::ffff:10.0.0.1 → chặn", await (async () => { try { await kiemDiaChi(new URL("https://x.vi-du.vn/"), async () => [{ address: "::ffff:10.0.0.1", family: 6 }]); return false; } catch (e) { return e instanceof LoiGoiMang; } })());
  choPhepLocalhostChoBaiThu(true);
  const maA = kyMaMedia({ tenantId: T, postId: p2.id, attachmentId: "11111111-1111-4111-8111-111111111111", hetHanGiay: 4102444800 });
  const [thanA, kyA] = maA.split(".");
  const thanB = Buffer.from(Buffer.from(thanA, "base64url").toString("utf8").replace("11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222")).toString("base64url");
  dat("Link ảnh: chữ ký của tệp A dùng cho tệp B → sai chữ ký", (() => { const k = kiemMaMedia(`${thanB}.${kyA}`, MOC); return !k.ok && k.ly === "sai-chu-ky"; })());
  dat("Link ảnh: đường dẫn kiểu ../ hoặc ký tự lạ → sai dạng", !kiemMaMedia("../../etc/passwd", MOC).ok && !kiemMaMedia(`${thanA}%2F.${kyA}`, MOC).ok);
  const ct = await voi(T, mk, (nc) => chiTietBai(nc, p2.id));
  dat("Chi tiết bài không lộ bí mật / bản niêm phong", !JSON.stringify(ct).includes(MK) && !JSON.stringify(ct).includes("wrappedKey") && !JSON.stringify(ct).includes("ciphertext"));

  // ==================================================================
  console.log("\n— QA-10. Chính sách sau QA (QĐ-203 → QĐ-209) —");
  const tpmk = await nguoi("qa-tpmk", "marketing-manager", T, gd);
  const tts = await nguoi("qa-tts", "marketing-intern", T, tpmk);
  // Người duyệt phạm vi hẹp (vai trò tự tạo: mxh.approve + mxh.view phạm vi own), không nằm trong chuỗi quản lý của tts.
  const vaiHep = await chu.role.create({ data: { tenantId: T, code: `duyet-hep-${DAU}`, name: "Duyệt hẹp DEMO", isBuiltIn: false } });
  for (const ma of ["mxh.approve", "mxh.view"]) {
    const q = await chu.permission.findUniqueOrThrow({ where: { code: ma } });
    await chu.rolePermission.create({ data: { tenantId: T, roleId: vaiHep.id, permissionId: q.id, dataScope: "own" } });
  }
  const hep = (await chu.user.create({ data: { tenantId: T, email: `qa-hep.${DAU}@thu.test`, passwordHash: "x", fullName: "qa-hep DEMO", userRoles: { create: { tenantId: T, roleId: vaiHep.id } }, staffProfile: { create: { tenantId: T, hiredAt: new Date("2025-01-01T00:00:00Z") } } } })).id;
  const k5 = await voi(T, mk, (nc) => ketNoiWordPress(nc, { diaChi: `${site()}/cs`, tenDangNhap: "tacgia", matKhauUngDung: MK, ten: "Site chính sách DEMO" }));
  const loiMa = async (f: () => Promise<unknown>): Promise<string> => { try { await f(); return "khong-loi"; } catch (e) { return e instanceof LoiNghiepVu ? e.ma : e instanceof LoiThieuQuyen ? "thieu-quyen" : `khac:${e instanceof Error ? e.message.slice(0, 80) : e}`; } };
  const S = (giay: number) => sau(30000 + giay);

  // --- 1. Đồng tác giả không được duyệt (QĐ-203) ---
  const c1 = await voi(T, tts, (nc) => taoBai(nc, { tieuDe: "Đồng tác giả DEMO", noiDung: "Bản của thực tập sinh", kenhIds: [k5.id] }));
  await voi(T, tts, (nc) => guiDuyet(nc, c1.id, { cheDo: "khong" }, S(0)));
  await voi(T, tpmk, (nc) => traLaiBai(nc, c1.id, "Viết lại đoạn mở"));
  await voi(T, tpmk, (nc) => suaBai(nc, c1.id, { tieuDe: "Đồng tác giả DEMO", noiDung: "Trưởng phòng viết lại đoạn mở", kenhIds: [k5.id] }));
  dat("Trưởng phòng sửa nội dung sau khi bài đã gửi duyệt → ghi là đồng tác giả (trigger CSDL)", (await chu.socialPost.findUniqueOrThrow({ where: { id: c1.id } })).coAuthorIds.includes(tpmk));
  await voi(T, tts, (nc) => guiDuyet(nc, c1.id, { cheDo: "khong" }, S(1)));
  dat("…đồng tác giả duyệt → 403 khong-duoc-duyet", (await loiMa(() => voi(T, tpmk, (nc) => duyetBai(nc, c1.id, null, S(2))))) === "khong-duoc-duyet");
  dat("…không hiện trong “Chờ duyệt” của đồng tác giả; chi tiết bài ghi lý do", !(await voi(T, tpmk, (nc) => danhSachChoDuyet(nc))).some((b) => b.id === c1.id) && /đồng tác giả/.test((await voi(T, tpmk, (nc) => chiTietBai(nc, c1.id))).quyen.lyDoKhongDuyet ?? ""));
  dat("…CHECK CSDL chặn approved_by là đồng tác giả (kể cả vai chủ sở hữu)", await (async () => { try { await chu.$executeRaw`UPDATE social_posts SET approved_by = ${tpmk}::uuid WHERE id = ${c1.id}::uuid`; return false; } catch { return true; } })());
  dat("…danh sách đồng tác giả chỉ thêm, không bớt (trigger)", await (async () => { try { await chu.$executeRaw`UPDATE social_posts SET co_author_ids = '{}' WHERE id = ${c1.id}::uuid`; return false; } catch { return true; } })());
  dat("…người khác (Giám đốc) duyệt được", (await voi(T, gd, (nc) => duyetBai(nc, c1.id, null, S(3)))).trangThai === "APPROVED");
  // Đổi ảnh sau khi gửi duyệt cũng là sửa nội dung.
  const c2 = await voi(T, tts, (nc) => taoBai(nc, { tieuDe: "Ảnh đồng tác giả DEMO", noiDung: "x", kenhIds: [k5.id] }));
  await voi(T, tts, (nc) => guiDuyet(nc, c2.id, { cheDo: "khong" }, S(4)));
  await voi(T, tpmk, (nc) => traLaiBai(nc, c2.id, "Thiếu ảnh"));
  await voi(T, tpmk, (nc) => dinhKemTep(nc, { loai: "social_post", doiTuongId: c2.id, tenTep: "anh.png", noiDung: PNG }));
  await voi(T, tts, (nc) => guiDuyet(nc, c2.id, { cheDo: "khong" }, S(5)));
  dat("Trưởng phòng thêm ảnh sau khi bài đã gửi duyệt → đồng tác giả, không duyệt được", (await loiMa(() => voi(T, tpmk, (nc) => duyetBai(nc, c2.id, null, S(6))))) === "khong-duoc-duyet");
  // Sửa TRƯỚC lần gửi duyệt đầu tiên không tính (đúng chính sách: "sau khi bài được gửi duyệt").
  const c3 = await voi(T, tts, (nc) => taoBai(nc, { tieuDe: "Sửa trước khi gửi DEMO", noiDung: "x", kenhIds: [k5.id] }));
  await voi(T, tpmk, (nc) => suaBai(nc, c3.id, { tieuDe: "Sửa trước khi gửi DEMO", noiDung: "Trưởng phòng góp ý trước", kenhIds: [k5.id] }));
  await voi(T, tts, (nc) => guiDuyet(nc, c3.id, { cheDo: "khong" }, S(7)));
  dat("Sửa trước lần gửi duyệt đầu tiên → không là đồng tác giả, duyệt được", (await voi(T, tpmk, (nc) => duyetBai(nc, c3.id, null, S(8)))).trangThai === "APPROVED");

  // --- 2. Đăng lỗi / cần kết nối lại: báo người soạn + người duyệt có phạm vi (QĐ-204) ---
  const c4 = await voi(T, tts, (nc) => taoBai(nc, { tieuDe: "Bài lỗi báo người duyệt DEMO", noiDung: "x", kenhIds: [k5.id] }));
  await voi(T, tts, (nc) => guiDuyet(nc, c4.id, { cheDo: "ngay" }, S(10)));
  await voi(T, gd, (nc) => duyetBai(nc, c4.id, null, S(10)));
  wp.maDai = true;
  await dangBaiMotVong(T, "w-qa", S(10));
  const tbLoi = await chu.notification.findMany({ where: { tenantId: T, objectId: c4.id, type: "mxh-dang-loi" }, select: { userId: true } });
  const nhanLoi = tbLoi.map((x) => x.userId).sort();
  dat("Đăng lỗi → báo người soạn (thực tập sinh) + Trưởng phòng + Giám đốc, mỗi người 1 lần", nhanLoi.join() === [tts, tpmk, gd].sort().join(), JSON.stringify(nhanLoi));
  dat("…KHÔNG báo người duyệt phạm vi hẹp (không bao người soạn), không báo Marketing (không có quyền duyệt)", !nhanLoi.includes(hep) && !nhanLoi.includes(mk));
  await dangBaiMotVong(T, "w-qa", S(20));
  dat("…chạy lại không báo trùng", (await chu.notification.count({ where: { tenantId: T, objectId: c4.id, type: "mxh-dang-loi" } })) === 3);
  // Người soạn cũng là người duyệt → chỉ 1 thông báo.
  const c5 = await voi(T, tpmk, (nc) => taoBai(nc, { tieuDe: "Bài lỗi của Trưởng phòng DEMO", noiDung: "x", kenhIds: [k5.id] }));
  await voi(T, tpmk, (nc) => dangNgay(nc, c5.id, S(30)));
  wp.maDai = true;
  await dangBaiMotVong(T, "w-qa", S(30));
  dat("Người soạn kiêm người duyệt → đúng 1 thông báo cho người đó", (await chu.notification.count({ where: { tenantId: T, objectId: c5.id, type: "mxh-dang-loi", userId: tpmk } })) === 1);

  // --- 3. Link ảnh ký: chỉ mxh.update hoặc luồng đăng (QĐ-205) ---
  const c6 = await voi(T, tts, (nc) => taoBai(nc, { tieuDe: "Bài có ảnh link DEMO", noiDung: "x", kenhIds: [k5.id] }));
  const anhC6 = await voi(T, tts, (nc) => dinhKemTep(nc, { loai: "social_post", doiTuongId: c6.id, tenTep: "a.png", noiDung: PNG }));
  await chu.socialPostMedia.create({ data: { tenantId: T, postId: c6.id, attachmentId: anhC6.id, position: 0, role: "featured" } });
  dat("Thực tập sinh không tạo được link ảnh ký cho bài của mình", (await loiMa(() => voi(T, tts, (nc) => taoLinkMedia(nc, c6.id, anhC6.id, S(40))))) === "thieu-quyen");
  dat("Marketing (mxh.update) tạo được", (await voi(T, mk, (nc) => taoLinkMedia(nc, c6.id, anhC6.id, S(40)))).url.includes("/api/cong-khai/mxh/media/"));
  dat("Luồng đăng (worker, không người dùng) tạo được qua taoLinkMediaHeThong", (await voiTenant(T, (tx) => taoLinkMediaHeThong(tx, T, c6.id, anhC6.id, S(40)))).url.includes("/api/cong-khai/mxh/media/"));

  // --- 4. Duyệt khi giờ hẹn đã qua (QĐ-206) ---
  const c7 = await voi(T, tts, (nc) => taoBai(nc, { tieuDe: "Trễ ít DEMO", noiDung: "x", kenhIds: [k5.id] }));
  await voi(T, tts, (nc) => guiDuyet(nc, c7.id, { cheDo: "hen-gio", henLuc: S(600).toISOString() }, S(50)));
  dat("Duyệt trễ 30 phút (≤ 60 phút mặc định) → đăng ngay", (await voi(T, tpmk, (nc) => duyetBai(nc, c7.id, null, S(600 + 30 * 60)))).trangThai === "PUBLISHING");
  const c8 = await voi(T, tts, (nc) => taoBai(nc, { tieuDe: "Trễ nhiều DEMO", noiDung: "x", kenhIds: [k5.id] }));
  await voi(T, tts, (nc) => guiDuyet(nc, c8.id, { cheDo: "hen-gio", henLuc: S(600).toISOString() }, S(50)));
  const d8 = await voi(T, tpmk, (nc) => duyetBai(nc, c8.id, null, S(600 + 2 * 3600)));
  dat("Duyệt trễ 2 giờ → “Đã duyệt – cần hẹn lại giờ”, kênh chưa xếp hàng", d8.trangThai === "APPROVED" && d8.canHenLai && d8.kenh.every((k) => k.trangThai === "PENDING"));
  dat("…người soạn được báo cần hẹn lại", (await chu.notification.count({ where: { tenantId: T, objectId: c8.id, type: "mxh-can-hen-lai", userId: tts } })) === 1);
  const hen8 = new Date("2026-12-31T02:00:00Z");
  const d8b = await voi(T, mk, (nc) => henGio(nc, c8.id, hen8.toISOString(), S(600 + 2 * 3600)));
  dat("…Marketing hẹn giờ mới → SCHEDULED, hết cờ cần hẹn lại", d8b.trangThai === "SCHEDULED" && !d8b.canHenLai);
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "mxh.tre_hen_toi_da_phut": 0 } }));
  const c9 = await voi(T, tts, (nc) => taoBai(nc, { tieuDe: "Ngưỡng 0 DEMO", noiDung: "x", kenhIds: [k5.id] }));
  await voi(T, tts, (nc) => guiDuyet(nc, c9.id, { cheDo: "hen-gio", henLuc: S(700).toISOString() }, S(50)));
  dat("Cấu hình ngưỡng 0 phút: trễ 1 phút cũng phải hẹn lại", (await voi(T, tpmk, (nc) => duyetBai(nc, c9.id, null, S(760)))).canHenLai === true);
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "mxh.tre_hen_toi_da_phut": null } }));

  // --- 6. Nhiều ảnh WordPress: cảnh báo rõ (QĐ-208) ---
  await voi(T, tts, (nc) => dinhKemTep(nc, { loai: "social_post", doiTuongId: c6.id, tenTep: "b.png", noiDung: Buffer.concat([PNG, Buffer.from([1])]) }));
  const ct6 = await voi(T, tts, (nc) => chiTietBai(nc, c6.id));
  dat("Bài 2 ảnh → cảnh báo “WordPress chỉ dùng ảnh đầu tiên làm ảnh đại diện”", ct6.canhBao.some((c) => c.includes("WordPress chỉ dùng ảnh đầu tiên làm ảnh đại diện") && c.includes("1 ảnh còn lại")), JSON.stringify(ct6.canhBao));
  dat("Bài 1 ảnh / không ảnh → không cảnh báo", (await voi(T, tts, (nc) => chiTietBai(nc, c7.id))).canhBao.length === 0);

  // --- 5. Ngắt kênh khi kênh-bài đang xác minh (QĐ-207) ---
  const k6 = await voi(T, mk, (nc) => ketNoiWordPress(nc, { diaChi: `${site()}/cs2`, tenDangNhap: "tacgia", matKhauUngDung: MK, ten: "Site sẽ ngắt DEMO" }));
  const e1 = await voi(T, tts, (nc) => taoBai(nc, { tieuDe: "Đã lên rồi mới ngắt DEMO", noiDung: "x", kenhIds: [k6.id] }));
  const e2 = await voi(T, tts, (nc) => taoBai(nc, { tieuDe: "Chưa rõ rồi ngắt DEMO", noiDung: "x", kenhIds: [k6.id] }));
  for (const e of [e1, e2]) await voi(T, mk, (nc) => dangNgay(nc, e.id, S(900)));
  const te1 = await kenhBai(e1.id);
  const te2 = await kenhBai(e2.id);
  // Lượt gửi hết giờ SAU khi gửi: kênh-bài “Đang xác minh”. e1 thật ra đã lên site, e2 chưa (hoặc chỉ là bản nháp).
  await chu.$executeRaw`UPDATE social_post_targets SET status = 'VERIFYING', error_class = 'UNKNOWN', error_code = 'het-gio-sau-gui', attempt_count = 1, next_attempt_at = ${S(900)} WHERE id IN (${te1.id}::uuid, ${te2.id}::uuid)`;
  wp.bai.set(++wp.idTiep, { id: wp.idTiep, slug: te1.reconcileKey, title: "Đã lên rồi mới ngắt DEMO", status: "publish" });
  wp.bai.set(++wp.idTiep, { id: wp.idTiep, slug: te2.reconcileKey, title: "Chưa rõ rồi ngắt DEMO", status: "draft" });
  await voi(T, mk, (nc) => ngatKenh(nc, k6.id));
  const truocNgat = wp.soYeuCauTao;
  await dangBaiMotVong(T, "w-qa", S(901));
  const x1 = await kenhBai(e1.id);
  const x2 = await kenhBai(e2.id);
  dat("Ngắt kênh, bài đã công khai → đối soát công khai (không mật khẩu) → PUBLISHED có permalink", x1.status === "PUBLISHED" && !!x1.externalUrl && !!x1.verifiedAt, `${x1.status} ${x1.errorCode}`);
  dat("Ngắt kênh, đối soát không ra → “Không rõ – cần kiểm tay” (không Lỗi), lời nhắn có địa chỉ site", x2.status === "NEEDS_CHECK" && (x2.errorMessage ?? "").includes(`${site()}/cs2`), `${x2.status} ${x2.errorMessage}`);
  dat("…không gửi bài mới lên site", wp.soYeuCauTao === truocNgat);
  const ct2 = await voi(T, tts, (nc) => chiTietBai(nc, e2.id));
  dat("…màn hình: cảnh báo cần kiểm tay + link site; không “Đăng lại”, không “Về nháp”", ct2.kenh[0].canKiemTay && ct2.kenh[0].diaChiSite === `${site()}/cs2` && !ct2.quyen.dangLai && !ct2.quyen.veNhap);
  dat("…người soạn + người duyệt được báo “cần kiểm tay”", (await chu.notification.count({ where: { tenantId: T, objectId: e2.id, type: "mxh-can-kiem-tay", userId: { in: [tts, tpmk, gd] } } })) === 3);
  dat("…đăng lại / về nháp qua API cũng bị chặn", (await loiMa(() => voi(T, mk, (nc) => dangLai(nc, e2.id, S(902))))) !== "khong-loi" && (await loiMa(() => voi(T, mk, (nc) => veNhap(nc, e2.id)))) === "sai-trang-thai");

  // --- 2b. Kênh chuyển “cần kết nối lại” khi kiểm tra lại → báo người nối kênh + người duyệt có phạm vi ---
  wp.nhaiBiMat = true;
  await voi(T, mk, (nc) => yeuCauKiemTraKenh(nc, k5.id, S(950)));
  await kiemTraKenhDaXep(T, S(950));
  wp.nhaiBiMat = false;
  const tbKn = (await chu.notification.findMany({ where: { tenantId: T, objectId: k5.id, type: "mxh-can-ket-noi-lai" }, select: { userId: true } })).map((x) => x.userId).sort();
  dat("Kênh cần kết nối lại → báo người nối kênh (Marketing) + Trưởng phòng + Giám đốc, không báo người duyệt phạm vi hẹp", tbKn.join() === [mk, tpmk, gd].sort().join(), JSON.stringify(tbKn));

  // --- 8. Điểm thấp (QĐ-209) ---
  choPhepLocalhostChoBaiThu(false);
  dat("[::127.0.0.1] (IPv4-compatible, ::/96) và [::ffff:0:7f00:1] (IPv4-translated) → chặn", (await chan("https://[::127.0.0.1]/")) && (await chan("https://[::ffff:0:7f00:1]/")) && (await chan("https://[::7f00:1]/")));
  choPhepLocalhostChoBaiThu(true);
  dat("gioVietNamCsv: 02:00Z → “2026-12-31 09:00 +07:00”", gioVietNamCsv(hen8) === "2026-12-31 09:00 +07:00");
  const csv2 = await voi(T, gd, (nc) => xuatCsvBai(nc));
  dat("CSV: cột “Hẹn lúc (giờ Việt Nam)” ghi giờ VN kèm +07:00", csv2.includes("Hẹn lúc (giờ Việt Nam)") && csv2.includes("2026-12-31 09:00 +07:00") && !csv2.includes(hen8.toISOString()));
  // Hủy lịch đúng lúc worker nhận việc: worker giữ khóa kênh-bài rồi cập nhật bài. Hủy lịch khóa theo cùng thứ tự → không deadlock.
  const h1 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Hủy lịch đúng giờ DEMO", noiDung: "x", kenhIds: [k5.id] }));
  await chu.$executeRaw`UPDATE social_connections SET status = 'ACTIVE' WHERE id = ${k5.id}::uuid`;
  await voi(T, mk, (nc) => henGio(nc, h1.id, S(5000).toISOString(), S(1000)));
  const th1 = await kenhBai(h1.id);
  let thaW!: () => void;
  const choW = new Promise<void>((ok) => { thaW = ok; });
  let loiWorker: unknown = null;
  const giuW = chu.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM social_post_targets WHERE id = ${th1.id}::uuid FOR UPDATE`;
    await tx.$executeRaw`UPDATE social_post_targets SET status = 'PUBLISHING', locked_by = 'w-gia', locked_at = ${S(5000)} WHERE id = ${th1.id}::uuid`;
    await choW;
    await tx.$executeRaw`UPDATE social_posts SET status = 'PUBLISHING' WHERE id = ${h1.id}::uuid`;
  }, { timeout: 30_000 }).catch((e) => { loiWorker = e; });
  await ngu(200);
  const huy = loiMa(() => voi(T, mk, (nc) => huyLich(nc, h1.id)));
  await ngu(500);
  thaW();
  await giuW;
  const kqHuy = await huy;
  dat("Hủy lịch đúng lúc worker nhận việc: không deadlock — worker ghi xong, hủy lịch trả 409", loiWorker === null && ["dang-dang", "sai-trang-thai"].includes(kqHuy), `worker: ${loiWorker instanceof Error ? loiWorker.message.slice(0, 120) : loiWorker}; hủy: ${kqHuy}`);
  dat("DEPLOYMENT ghi rõ: nhiều worker cùng lúc được hỗ trợ", /Chạy nhiều worker cùng lúc là cấu hình ĐƯỢC HỖ TRỢ/.test(readFileSync(path.join(__dirname, "../DEPLOYMENT.md"), "utf8")));

  for (const t of wp.choMedia.splice(0)) t();
  may.close();
  ketLuan("QA Mạng xã hội 0.23.0");
}

main().catch((e) => {
  console.error("Bài thử hỏng ngoài dự kiến:", e);
  process.exit(1);
});
