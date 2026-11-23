import { mkdtempSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

// Thư mục tệp đính kèm tạm + khóa chủ riêng của bài thử — đặt TRƯỚC khi nạp module. Không bao giờ in khóa.
process.env.THU_MUC_DINH_KEM = mkdtempSync(path.join(tmpdir(), "cowork-qa-mxh-lich-"));
process.env.SOCIAL_MASTER_KEY = randomBytes(32).toString("base64");
process.env.SOCIAL_MASTER_KEY_VERSION = "1";
delete process.env.ANTHROPIC_API_KEY;

import { voiTenant, prisma } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { buocChoNguoiDung } from "../src/lib/api-nhieu-buoc";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { seedNenMong } from "../prisma/seed/index";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { aadKenh } from "../src/modules/mang-xa-hoi/bao-mat/khoa-chu";
import { niemPhong } from "../src/modules/mang-xa-hoi/bao-mat/niem-phong";
import { ketNoiWordPress } from "../src/modules/mang-xa-hoi/kenh";
import { chiTietBai, dangLai, dangNgay, duyetBai, guiDuyet, taoBai, traLaiBai, veNhap } from "../src/modules/mang-xa-hoi/bai";
import { lichNoiDung } from "../src/modules/mang-xa-hoi/lich";
import { dangLaiKenh, suaKenhLoi } from "../src/modules/mang-xa-hoi/kenh-loi";
import { suaChienDich, taoChienDich } from "../src/modules/mang-xa-hoi/chien-dich";
import { sanPhamDeVietBai, trangThaiAiVietBai, vietBaiAi } from "../src/modules/mang-xa-hoi/ai/service";
import { choPhepLocalhostChoBaiThu } from "../src/modules/mang-xa-hoi/mang/goi-an-toan";
import { datNhaCungCapThu, LoiNhaCungCapAI, type DauVaoGoi, type NhaCungCapAI } from "../src/modules/tro-ly/nha-cung-cap";
import { dangBaiMotVong } from "../worker/mang-xa-hoi/dang-bai";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * QA ĐỘC LẬP 0.25.0 — Mạng xã hội giai đoạn 3 (QĐ-240 → QĐ-249). Mỗi khối dựng lại đúng một lỗi tìm được trên 8865b86
 * (feat/mxh-lich-ai) và kiểm bản sửa: AI gọi hai lần khi bấm đúp, lượt AI treo "đang gọi" khi bước ghi bài hỏng, hoàn
 * ngân sách khi không biết token đã tốn, lách duyệt qua "Đăng lại" bản sửa kênh lỗi bị trả lại, về nháp bài Facebook lỗi
 * không chắc chắn rồi sửa nội dung (đăng trùng), duyệt cũ còn dính sau khi sửa kênh lỗi, lịch nhận tháng năm 00xx (treo
 * máy chủ), danh sách sản phẩm cho AI không kiểm quyền AI, lớp đối chiếu giá vốn / nhà cung cấp thật trước khi gửi AI.
 * Phần thuần ở thu/don-vi/qa-mxh-lich-ai.test.ts. Chạy: npm run thu:qa-mxh-lich-ai.
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

// ---------------------------------------------------------------------------
// WordPress GIẢ (nhiều site theo tiền tố) — "400" = từ chối dứt khoát
// ---------------------------------------------------------------------------
const wp = { bai: new Map<number, { site: string; slug: string; title: string; content: string; status: string }>(), che: new Map<string, string[]>(), soTao: new Map<string, number>(), idTiep: 500 };
let cong = 0;
const site = (s: string) => `http://localhost:${cong}/${s}`;
function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
function docThan(req: IncomingMessage): Promise<Buffer> {
  return new Promise((ok) => { const m: Buffer[] = []; req.on("data", (c: Buffer) => m.push(c)); req.on("end", () => ok(Buffer.concat(m))); });
}
const may = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const m0 = /^\/([a-z0-9]+)(\/.*)$/.exec(url.pathname);
  if (!m0) return json(res, 404, {});
  const s = m0[1];
  const p = m0[2];
  const than = await docThan(req);
  const h = req.headers.authorization ?? "";
  const [u, ...mk] = Buffer.from(h.replace(/^Basic /, ""), "base64").toString("utf8").split(":");
  if (u !== "tacgia" || mk.join(":").replace(/\s+/g, "") !== MK_UNG_DUNG.replace(/\s+/g, "")) return json(res, 401, { code: "incorrect_password" });
  const r = p.slice("/wp-json/wp/v2".length);
  if (r === "/users/me") return json(res, 200, { id: 7, name: "Tác giả DEMO", capabilities: { publish_posts: true, upload_files: true } });
  if (r === "/posts" && req.method === "POST") {
    const cheDo = wp.che.get(s)?.shift() ?? "ok";
    if (cheDo === "400") return json(res, 400, { code: "rest_invalid_param", message: "Tham số không hợp lệ (giả)." });
    const d = JSON.parse(than.toString("utf8")) as { title: string; content: string; slug: string; status: string };
    const id = ++wp.idTiep;
    wp.bai.set(id, { site: s, slug: d.slug, title: d.title, content: d.content, status: d.status });
    wp.soTao.set(s, (wp.soTao.get(s) ?? 0) + 1);
    return json(res, 201, { id, status: d.status, slug: d.slug, link: `${site(s)}/?p=${id}` });
  }
  const m = /^\/posts\/(\d+)$/.exec(r);
  if (m && req.method === "GET") {
    const b = wp.bai.get(Number(m[1]));
    if (!b || b.site !== s) return json(res, 404, { code: "rest_post_invalid_id" });
    return json(res, 200, { id: Number(m[1]), status: b.status, slug: b.slug, link: `${site(s)}/?p=${m[1]}`, title: { raw: b.title } });
  }
  if (r === "/posts" && req.method === "GET") {
    const slug = url.searchParams.get("slug");
    return json(res, 200, [...wp.bai.entries()].filter(([, b]) => b.site === s && b.slug === slug).map(([id, b]) => ({ id, slug: b.slug, status: b.status, link: `${site(s)}/?p=${id}` })));
  }
  return json(res, 404, { code: "rest_no_route" });
});

// ---------------------------------------------------------------------------
// Nhà cung cấp AI GIẢ — ghi mọi lời nhắc; có "cổng" để giữ lượt gọi đầu lại (thử bấm đúp), có móc chạy giữa lượt.
// ---------------------------------------------------------------------------
const ai = {
  goi: [] as DauVaoGoi[], traLoi: "", nem: null as Error | null, tokenVao: 1000 as number | null, tokenRa: 500 as number | null,
  cong: null as Promise<void> | null, daVao: null as (() => void) | null, giuaLuot: null as (() => Promise<void>) | null,
};
const nccGia: NhaCungCapAI = {
  ten: "gia", model: "mo-hinh-gia",
  async goi(dv) {
    ai.goi.push(dv);
    const cho = ai.cong;
    ai.cong = null;
    ai.daVao?.();
    if (cho) await cho;
    if (ai.giuaLuot) await ai.giuaLuot();
    if (ai.nem) throw ai.nem;
    return { khoi: [{ loai: "van-ban", noiDung: ai.traLoi }], doiCongCu: false, tokensIn: ai.tokenVao, tokensOut: ai.tokenRa, model: "mo-hinh-gia" };
  },
};
const traLoiHopLe = (tieuDe: string) => JSON.stringify({ tieuDe, noiDung: "Máy in laser DEMO in nhanh 40 trang / phút, giá 4.990.000 đ. Bảo hành chính hãng.", hashtags: ["ITWQA"] });

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------
async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "198.51.100.26", "thu-qa-mxh-lich-ai"));
  }, { timeoutMs: 60_000 });
}
const buoc = (tenantId: string, userId: string) => buocChoNguoiDung(tenantId, async (tx) => (await layHoSoQuyen(tx, userId))!, "198.51.100.26", "thu-qa-mxh-lich-ai");

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string, khop?: RegExp): Promise<void> {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu = kieu === "quyen" ? e instanceof LoiThieuQuyen : kieu === "khong-thay" ? e instanceof LoiKhongTimThay : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    const dungChu = !khop || (e instanceof Error && khop.test(e.message));
    dat(ten, dungKieu && dungMa && dungChu, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}
const kenhBai = (id: string) => chu.socialPostTarget.findUniqueOrThrow({ where: { id } });

async function main() {
  await new Promise<void>((ok) => may.listen(0, "127.0.0.1", () => ok()));
  cong = (may.address() as { port: number }).port;
  choPhepLocalhostChoBaiThu(true);
  console.log("=== QA 0.25.0 — Mạng xã hội: lịch nội dung, kênh lỗi, AI viết bài, ngân sách AI ===\n");

  const T = (await seedNenMong(chu, `qa-mxh-lich-${DAU}`, "Doanh nghiệp QA lịch MXH")).id;
  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  async function nguoi(ten: string, vai: string, quanLy: string | null = null) {
    const u = await chu.user.create({
      data: {
        tenantId: T, email: `${ten}.${DAU}@qa.test`, passwordHash: "x", fullName: `${ten} DEMO`,
        userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
        staffProfile: { create: { tenantId: T, hiredAt: new Date("2025-01-01T00:00:00Z"), managerId: quanLy } },
      },
    });
    return u.id;
  }
  const gd = await nguoi("giam-doc", "ceo");
  const tpmk = await nguoi("tp-marketing", "marketing-manager", gd);
  const mk = await nguoi("marketing", "marketing", tpmk);
  const tts = await nguoi("thuc-tap-mk", "marketing-intern", tpmk);
  const kd = await nguoi("kinh-doanh", "sales", gd);
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "mxh.han_goi_giay": 5, "mxh.cho_doi_soat_giay": 0, "mxh.so_lan_thu_toi_da": 1 } }));
  const kA = await voi(T, mk, (nc) => ketNoiWordPress(nc, { diaChi: site("a"), tenDangNhap: "tacgia", matKhauUngDung: MK_UNG_DUNG, ten: "Site A QA DEMO" }));
  const kB = await voi(T, mk, (nc) => ketNoiWordPress(nc, { diaChi: site("b"), tenDangNhap: "tacgia", matKhauUngDung: MK_UNG_DUNG, ten: "Site B QA DEMO" }));
  dat("Nối 2 kênh WordPress giả", kA.trangThai === "ACTIVE" && kB.trangThai === "ACTIVE");

  // ==================================================================
  console.log("\n— 1. Bản sửa kênh lỗi BỊ TRẢ LẠI không được “Đăng lại” bởi người có quyền đăng (QĐ-234 → QĐ-243) —");
  wp.che.set("b", ["400"]);
  const b1 = await voi(T, tts, (nc) => taoBai(nc, { tieuDe: "Bài thực tập sinh QA DEMO", noiDung: "Nội dung gốc QA DEMO.", kenhIds: [kA.id, kB.id] }));
  await voi(T, tts, (nc) => guiDuyet(nc, b1.id, { cheDo: "ngay" }, sau(10)));
  await voi(T, tpmk, (nc) => duyetBai(nc, b1.id, null, sau(11)));
  await dangBaiMotVong(T, "qa-w1", sau(12));
  let ct1 = await voi(T, tts, (nc) => chiTietBai(nc, b1.id));
  const t1B = ct1.kenh.find((k) => k.kenhId === kB.id)!;
  dat("Bài thực tập sinh (đã duyệt) lỗi một phần: A đăng, B lỗi", ct1.trangThai === "PARTIALLY_FAILED" && t1B.trangThai === "FAILED");
  ct1 = await voi(T, tts, (nc) => suaKenhLoi(nc, b1.id, t1B.id, { noiDung: "Bản sửa CHƯA DUYỆT của thực tập sinh — giảm 90% DEMO" }, sau(20)));
  dat("Thực tập sinh (không có quyền đăng) sửa kênh lỗi → chờ duyệt phạm vi kênh lỗi", ct1.trangThai === "PENDING_APPROVAL" && ct1.phamViDuyet === "kenh-loi");
  await voi(T, tpmk, (nc) => traLaiBai(nc, b1.id, "Không được ghi giảm 90%"));
  const ctMk = await voi(T, mk, (nc) => chiTietBai(nc, b1.id));
  dat("Sau khi trả lại: Marketing (có quyền đăng, không có quyền duyệt) KHÔNG thấy nút đăng lại kênh / đăng lại bài", ctMk.trangThai === "PARTIALLY_FAILED" && !ctMk.quyenKenh[t1B.id].dangLaiKenh && !ctMk.quyen.dangLai, JSON.stringify({ k: ctMk.quyenKenh[t1B.id], dl: ctMk.quyen.dangLai }));
  await nemLoi("Marketing “Đăng lại kênh này” bản sửa đã bị trả lại → 409 can-duyet", "nghiep-vu", () => voi(T, mk, (nc) => dangLaiKenh(nc, b1.id, t1B.id, sau(30))), "can-duyet");
  await nemLoi("Marketing “Đăng lại” cả bài (mọi kênh lỗi) → 409 can-duyet", "nghiep-vu", () => voi(T, mk, (nc) => dangLai(nc, b1.id, sau(31))), "can-duyet");
  dat("Site B chưa nhận nội dung bị trả lại", ![...wp.bai.values()].some((b) => b.content.includes("CHƯA DUYỆT")));
  // Marketing tự sửa lại kênh B (người có quyền đăng, bài không bắt duyệt) → bản sửa của CHÍNH họ thì đăng lại được.
  await voi(T, mk, (nc) => suaKenhLoi(nc, b1.id, t1B.id, { noiDung: "Bản sửa của Marketing QA DEMO" }, sau(40)));
  const dl1 = await voi(T, mk, (nc) => dangLaiKenh(nc, b1.id, t1B.id, sau(41)));
  dat("…Marketing tự sửa lại nội dung kênh → đăng lại được (bản sửa của người có quyền đăng)", dl1.trangThai === "PUBLISHING");
  await dangBaiMotVong(T, "qa-w2", sau(42));
  dat("Worker đăng bản sửa của Marketing, không phải bản bị trả lại", [...wp.bai.values()].some((b) => b.site === "b" && b.content.includes("Bản sửa của Marketing")) && ![...wp.bai.values()].some((b) => b.content.includes("CHƯA DUYỆT")));

  // ==================================================================
  console.log("\n— 2. Sửa kênh lỗi không cần duyệt lại → bỏ dấu “đã duyệt” cũ (QĐ-197 / QĐ-243) —");
  wp.che.set("b", ["400"]);
  const b2 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Bài duyệt rồi lỗi QA DEMO", noiDung: "Nội dung đã duyệt QA DEMO.", kenhIds: [kA.id, kB.id] }));
  await voi(T, mk, (nc) => guiDuyet(nc, b2.id, { cheDo: "ngay" }, sau(100)));
  await voi(T, tpmk, (nc) => duyetBai(nc, b2.id, null, sau(101)));
  await dangBaiMotVong(T, "qa-w3", sau(102));
  const t2B = (await voi(T, mk, (nc) => chiTietBai(nc, b2.id))).kenh.find((k) => k.kenhId === kB.id)!;
  const ct2 = await voi(T, mk, (nc) => suaKenhLoi(nc, b2.id, t2B.id, { noiDung: "Nội dung MỚI người duyệt chưa xem QA DEMO" }, sau(110)));
  dat("Sửa nội dung kênh lỗi (bài không bắt duyệt): không còn ghi “đã duyệt bởi Trưởng phòng” cho nội dung người đó chưa xem", ct2.trangThai === "PARTIALLY_FAILED" && ct2.duyetBoi === null, `duyetBoi=${ct2.duyetBoi}`);

  // ==================================================================
  console.log("\n— 3. Về nháp bài Facebook lỗi KHÔNG CHẮC CHẮN rồi sửa nội dung = đăng trùng (QĐ-244) —");
  const fbId = crypto.randomUUID();
  const npFb = niemPhong(JSON.stringify({ loai: "meta", accessToken: "x" }), aadKenh(T, fbId));
  await chu.socialConnection.create({ data: { id: fbId, tenantId: T, platform: "FACEBOOK_PAGE", name: "Page QA DEMO", externalId: "223456789012345", authType: "oauth", oauthProvider: "META", createdBy: mk, credential: { create: { tenantId: T, ciphertext: npFb.ciphertext, iv: npFb.iv, authTag: npFb.authTag, wrappedKey: npFb.wrappedKey, keyVersion: npFb.keyVersion } } } });
  async function baiFbLoi(ketQua: string[]) {
    const p = await chu.socialPost.create({ data: { tenantId: T, title: "Bài FB lỗi QA DEMO", body: "Nội dung FB cũ QA DEMO", status: "FAILED", scheduledAt: MOC, createdBy: mk } });
    const t = await chu.socialPostTarget.create({ data: { tenantId: T, postId: p.id, connectionId: fbId, status: "FAILED", errorClass: ketQua.includes("unknown") ? "UNKNOWN" : ketQua.at(-1) === "permanent" ? "PERMANENT" : "RETRYABLE", reconcileKey: `fb-qa-${DAU}-${p.id.slice(0, 8)}`, contentKind: "fb-chu", attemptCount: ketQua.length } });
    for (const [i, k] of ketQua.entries()) await chu.socialPublishAttempt.create({ data: { tenantId: T, targetId: t.id, attemptNo: i + 1, kind: "publish", outcome: k, errorClass: k === "permanent" ? "PERMANENT" : k === "unknown" ? "UNKNOWN" : "RETRYABLE", httpStatus: k === "permanent" ? 400 : 500, startedAt: sau(i) } });
    return p.id;
  }
  const pFb = await baiFbLoi(["retryable", "permanent"]);
  const ctFb = await voi(T, mk, (nc) => chiTietBai(nc, pFb));
  dat("Bài Facebook từng lỗi tạm (500 — có thể đã lên): KHÔNG hiện nút “Về nháp để sửa”", !ctFb.quyen.veNhap);
  await nemLoi("…service từ chối về nháp (409) — sửa nội dung rồi đăng lại sẽ không đối soát ra bài cũ", "nghiep-vu", () => voi(T, mk, (nc) => veNhap(nc, pFb)), "sai-trang-thai", /theo NỘI DUNG|đăng trùng/);
  const pFbU = await baiFbLoi(["unknown"]);
  await nemLoi("Bài Facebook lỗi “không rõ” → cũng không về nháp được", "nghiep-vu", () => voi(T, mk, (nc) => veNhap(nc, pFbU)), "sai-trang-thai");
  const pFbOk = await baiFbLoi(["permanent"]);
  const vn = await voi(T, mk, (nc) => veNhap(nc, pFbOk));
  dat("Bài Facebook bị từ chối dứt khoát (400) → về nháp được như cũ", vn.trangThai === "DRAFT");
  // WordPress đối soát theo slug → về nháp được dù từng lỗi tạm.
  const pWp = await chu.socialPost.create({ data: { tenantId: T, title: "Bài WP lỗi tạm QA DEMO", body: "x", status: "FAILED", scheduledAt: MOC, createdBy: mk } });
  const tWp = await chu.socialPostTarget.create({ data: { tenantId: T, postId: pWp.id, connectionId: kA.id, status: "FAILED", errorClass: "RETRYABLE", reconcileKey: `wp-qa-${DAU}`, attemptCount: 1 } });
  await chu.socialPublishAttempt.create({ data: { tenantId: T, targetId: tWp.id, attemptNo: 1, kind: "publish", outcome: "retryable", errorClass: "RETRYABLE", httpStatus: 500, startedAt: MOC } });
  dat("Bài WordPress lỗi tạm (đối soát theo slug) → vẫn về nháp được", (await voi(T, mk, (nc) => veNhap(nc, pWp.id))).trangThai === "DRAFT");

  // ==================================================================
  console.log("\n— 4. Lịch: tháng năm 00xx không làm treo / quá tải máy chủ (QĐ-242) —");
  const t0 = Date.now();
  await nemLoi("Lịch tháng “0099-12” → 400 sai-ngay (trước khi sửa: dựng 694.000 ô ngày; “0000-01” lặp vô hạn)", "nghiep-vu", () => voi(T, mk, (nc) => lichNoiDung(nc, { kieu: "thang", thang: "0099-12" }, MOC)), "sai-ngay");
  dat("…trả lời ngay (< 500 ms)", Date.now() - t0 < 500, `${Date.now() - t0} ms`);
  await nemLoi("Lịch tuần năm 0000 → 400", "nghiep-vu", () => voi(T, mk, (nc) => lichNoiDung(nc, { kieu: "tuan", ngay: "0000-01-03" }, MOC)), "sai-ngay");

  // ==================================================================
  console.log("\n— 5. AI: dữ liệu sản phẩm, quyền, lớp đối chiếu giá vốn / nhà cung cấp (QĐ-240) —");
  datNhaCungCapThu(nccGia);
  const ncc = await chu.supplier.create({ data: { tenantId: T, code: `NCC${DAU}`.slice(0, 30), name: "Công Ty Bí Ẩn QA", nameNormalized: "cong ty bi an qa" } });
  const GIA_VON = 3_456_789;
  const GIA_NHAP = 3_210_000;
  const sp = await chu.product.create({
    data: {
      tenantId: T, sku: `QA-IN-${DAU}`, skuNormalized: `QA-IN-${DAU}`.toUpperCase(), name: "Máy in laser QA DEMO", nameNormalized: "may in laser qa demo",
      description: `In nhanh 40 trang / phút.\nLô 3.456.789 — đối tác Công Ty Bí Ẩn QA\nGiá-vốn: 3456789\nHợp đồng khung 3,210,000 / máy\nBảo hành 12 tháng tận nơi.`,
      specifications: { "Tốc độ": "40 ppm", "Mã lô": "3456789", "Đối tác": "Công Ty Bí Ẩn QA" },
      costPrice: GIA_VON, sellingPrice: 4_990_000, vatRate: 10, defaultSupplierId: ncc.id,
    },
  });
  await chu.supplierProductPrice.create({ data: { tenantId: T, productId: sp.id, supplierId: ncc.id, purchasePrice: GIA_NHAP } });
  await nemLoi("Kinh doanh (xem sản phẩm, KHÔNG dùng AI viết bài) không gọi được danh sách sản phẩm cho AI (tình trạng tồn)", "quyen", () => voi(T, kd, (nc) => sanPhamDeVietBai(nc, "QA")));
  const dsSp = await voi(T, mk, (nc) => sanPhamDeVietBai(nc, "QA"));
  const jSp = JSON.stringify(dsSp);
  dat("Danh sách sản phẩm cho AI (Marketing) không có giá vốn / giá nhập / tên nhà cung cấp dưới mọi dạng", dsSp.length === 1 && !/3456789|3\.456\.789|3,210,000|3210000|Bí Ẩn/.test(jSp) && jSp.includes("40 ppm") && jSp.includes("In nhanh 40 trang"), jSp);
  ai.traLoi = traLoiHopLe("Máy in QA DEMO");
  ai.goi.length = 0;
  await vietBaiAi(buoc(T, mk), { sanPhamIds: [sp.id], kenhIds: [kA.id], yeuCau: null, chienDichId: null, khoaLapLai: null }, MOC);
  const nhac = ai.goi.map((g) => g.heThong + JSON.stringify(g.tinNhan)).join("\n");
  dat("Lời nhắc gửi AI không có giá vốn / giá nhập / tên nhà cung cấp (nhãn lách dấu, số không nhãn, bảng)", !/3456789|3\.456\.789|3,210,000|3210000|Bí Ẩn/.test(nhac) && nhac.includes("40 ppm") && nhac.includes("4990000"), nhac.slice(0, 400));

  // ==================================================================
  console.log("\n— 6. AI: bấm đúp cùng Idempotency-Key → chỉ MỘT lần gọi AI (QĐ-239 / QĐ-245) —");
  const yc = (khoa: string | null, chienDichId: string | null = null) => ({ sanPhamIds: [sp.id], kenhIds: [kA.id], yeuCau: null, chienDichId, khoaLapLai: khoa });
  const khoa = `qa-dup-${DAU}`;
  ai.goi.length = 0;
  let mo!: () => void;
  ai.cong = new Promise<void>((ok) => { mo = ok; });
  const daVao = new Promise<void>((ok) => { ai.daVao = ok; });
  const soLuot0 = await chu.aiUsageLog.count({ where: { tenantId: T } });
  const lan1 = vietBaiAi(buoc(T, mk), yc(khoa), MOC);
  await daVao;
  ai.daVao = null;
  const lan2 = vietBaiAi(buoc(T, mk), yc(khoa), MOC).then((x) => ({ ok: x }), (e: unknown) => ({ loi: e }));
  // Cho lượt hai chạy hết phần có thể chạy trước khi thả lượt một.
  await new Promise((ok) => setTimeout(ok, 1500));
  mo();
  const [k1, k2] = await Promise.all([lan1, lan2]);
  const baiKhoa = await chu.socialPost.findMany({ where: { tenantId: T, idempotencyKey: khoa } });
  dat("Đúng MỘT lần gọi nhà cung cấp AI (lượt hai không gọi lại)", ai.goi.length === 1, `goi=${ai.goi.length}`);
  dat("Đúng MỘT lượt AI được ghi (không giữ chỗ ngân sách hai lần)", (await chu.aiUsageLog.count({ where: { tenantId: T } })) - soLuot0 === 1);
  const r2 = k2 as { ok?: { id: string }; loi?: unknown };
  dat("Lượt hai: 409 “đang viết” hoặc trả đúng bài của lượt một", (r2.loi instanceof LoiNghiepVu && r2.loi.ma === "ai-dang-viet") || r2.ok?.id === k1.id, r2.loi instanceof Error ? r2.loi.message : JSON.stringify(r2.ok?.id));
  dat("Một bài; mã lượt AI của bài là lượt đã gọi", baiKhoa.length === 1 && baiKhoa[0].aiUsageId !== null && (await chu.aiUsageLog.findUniqueOrThrow({ where: { id: baiKhoa[0].aiUsageId! } })).status === "xong");
  const lan3 = await vietBaiAi(buoc(T, mk), yc(khoa), MOC);
  dat("Bấm lại sau khi xong → trả bài cũ, không gọi AI", lan3.id === k1.id && lan3.trung && ai.goi.length === 1);

  // ==================================================================
  console.log("\n— 7. AI: bước ghi bài hỏng sau khi đã gọi AI → lượt AI không treo “đang gọi” (QĐ-236 / QĐ-246) —");
  const cdQa = await voi(T, mk, (nc) => taoChienDich(nc, { ten: `Chiến dịch QA ${DAU} DEMO` }));
  ai.giuaLuot = async () => { await chu.socialCampaign.update({ where: { id: cdQa.id }, data: { status: "luu-tru" } }); };
  ai.tokenVao = 1500;
  ai.tokenRa = 700;
  await nemLoi("Chiến dịch bị lưu trữ trong lúc AI đang viết → 409 rõ ràng", "nghiep-vu", () => vietBaiAi(buoc(T, mk), yc(null, cdQa.id), MOC), "chien-dich-luu-tru");
  ai.giuaLuot = null;
  const luotCuoi = await chu.aiUsageLog.findFirstOrThrow({ where: { tenantId: T }, orderBy: { createdAt: "desc" } });
  dat("Lượt AI đó ghi “lỗi” kèm số token THẬT đã tốn (không treo “đang gọi” giữ chỗ mãi)", luotCuoi.status === "loi" && luotCuoi.tokensIn === 1500 && luotCuoi.tokensOut === 700 && Number(luotCuoi.costVnd) > 0, JSON.stringify({ st: luotCuoi.status, vao: luotCuoi.tokensIn, ra: luotCuoi.tokensOut }));
  await voi(T, mk, (nc) => suaChienDich(nc, cdQa.id, { ten: cdQa.ten, trangThai: "hoat-dong" }));

  // ==================================================================
  console.log("\n— 8. Ngân sách: lỗi nhà cung cấp KHÔNG rõ đã tốn token → vẫn tính phần giữ chỗ; bị từ chối rõ → hoàn (QĐ-247) —");
  ai.tokenVao = null;
  ai.tokenRa = null;
  const da = async () => (await voi(T, mk, (nc) => trangThaiAiVietBai(nc, MOC))).nganSach;
  const ns0 = await da();
  ai.nem = new LoiNhaCungCapAI("Mô hình không trả lời trong 60 giây.", "het-thoi-gian");
  await nemLoi("Hết giờ chờ mô hình → 502", "nghiep-vu", () => vietBaiAi(buoc(T, mk), yc(null), MOC), "ai-loi-goi");
  const ns1 = await da();
  const giu = (await chu.aiUsageLog.findFirstOrThrow({ where: { tenantId: T }, orderBy: { createdAt: "desc" } })).tokensReserved;
  dat("Hết giờ (mô hình có thể đã chạy + tính tiền): ngân sách vẫn tính phần giữ chỗ (token + VND)", ns1.daDungToken - ns0.daDungToken === giu && ns1.daDungVnd > ns0.daDungVnd, `token +${ns1.daDungToken - ns0.daDungToken} / giữ ${giu}; vnd +${ns1.daDungVnd - ns0.daDungVnd}`);
  ai.nem = new LoiNhaCungCapAI("Nhà cung cấp AI trả lỗi 529.", "nha-cung-cap-529");
  await nemLoi("Nhà cung cấp từ chối (HTTP 529) → 502", "nghiep-vu", () => vietBaiAi(buoc(T, mk), yc(null), MOC), "ai-loi-goi");
  const ns2 = await da();
  dat("Bị từ chối rõ (không chạy mô hình): hoàn phần giữ chỗ", ns2.daDungToken === ns1.daDungToken && ns2.daDungVnd === ns1.daDungVnd);
  ai.nem = null;
  datNhaCungCapThu(null);

  // ==================================================================
  console.log("\n— 9. Hồi quy 0.24: đăng thường + đối soát vẫn chạy với nội dung riêng theo kênh —");
  const b9 = await voi(T, mk, (nc) => taoBai(nc, { tieuDe: "Hồi quy QA DEMO", noiDung: "Chung QA DEMO", kenhIds: [kA.id, kB.id], bienThe: [{ kenhId: kB.id, noiDung: "Riêng B QA DEMO", hashtags: ["qa"] }] }));
  await voi(T, mk, (nc) => dangNgay(nc, b9.id, sau(900)));
  await dangBaiMotVong(T, "qa-w9", sau(901));
  const ct9 = await voi(T, mk, (nc) => chiTietBai(nc, b9.id));
  const wpB9 = [...wp.bai.values()].filter((b) => b.site === "b").at(-1)!;
  dat("Hai kênh đăng; B nhận nội dung riêng + hashtag", ct9.trangThai === "PUBLISHED" && wpB9.content.includes("Riêng B QA DEMO") && wpB9.content.includes("#qa"));
  dat("Kênh đã đăng: CSDL chặn sửa nội dung riêng", await chu.$executeRaw`UPDATE social_post_targets SET hashtags = ARRAY['#x'] WHERE id = ${ct9.kenh[1].id}::uuid`.then(() => false, () => true));
  dat("Mã bài kênh A còn nguyên", (await kenhBai(ct9.kenh[0].id)).externalPostId !== null);

  may.close();
  await prisma.$disconnect();
  await chu.$disconnect();
  ketLuan("QA 0.25.0 — lịch nội dung, kênh lỗi, AI viết bài, ngân sách AI");
}

main().catch(async (e) => {
  console.error(e);
  may.close();
  await prisma.$disconnect().catch(() => undefined);
  await chu.$disconnect().catch(() => undefined);
  process.exit(1);
});
