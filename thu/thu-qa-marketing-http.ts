import { request } from "node:http";
import { bamKhoa } from "../src/modules/marketing/webhook";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * QA ĐỐI KHÁNG qua HTTP cho đường CÔNG KHAI của gói Marketing (0.16.0): /f, /lp,
 * /api/cong-khai/form, /api/cong-khai/webhook — chạy vào một bản `next start` ĐANG CHẠY.
 *
 *   THU_URL=http://localhost:3022 npm run thu:qa-marketing-http
 *
 * Dựng dữ liệu thẳng bằng vai chủ sở hữu (DATABASE_URL_OWNER) vào tenant "itw" và một tenant thử
 * mới — không cần đăng nhập. Bài ĐỎ là lỗi thật trong báo cáo QA. CHỈ trên máy phát triển.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Không chạy trên môi trường thật.");
  process.exit(1);
}

const URL_GOC = (process.env.THU_URL ?? "http://localhost:3022").replace(/\/$/, "");
const U = new URL(URL_GOC);
const HOST = U.host;
const ORIGIN = `${U.protocol}//${HOST}`;
const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const SO = String(Date.now()).slice(-6);
const dt = (n: number) => `07${String(n).padStart(2, "0")}${SO}`;
const ipNgauNhien = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

interface PhanHoi {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: string;
  json: Record<string, unknown>;
}

/** Gửi yêu cầu với đường dẫn THÔ (không chuẩn hóa `..`, `%2e`, `%00` như fetch). */
function goi(duong: string, o: { method?: string; headers?: Record<string, string>; body?: string | Buffer } = {}): Promise<PhanHoi> {
  return new Promise((ok, loi) => {
    const headers: Record<string, string> = { "x-real-ip": "10.255.0.1", ...(o.headers ?? {}) };
    if (!headers["x-real-ip"]) delete headers["x-real-ip"];
    const r = request({ host: U.hostname, port: U.port || 80, path: duong, method: o.method ?? "GET", headers }, (res) => {
      const parts: Buffer[] = [];
      res.on("data", (c) => parts.push(c));
      res.on("end", () => {
        const text = Buffer.concat(parts).toString("utf8");
        let json: Record<string, unknown> = {};
        try {
          json = JSON.parse(text);
        } catch {
          /* HTML */
        }
        ok({ status: res.statusCode ?? 0, headers: res.headers, text, json });
      });
    });
    r.on("error", loi);
    if (o.body !== undefined) r.write(o.body);
    r.end();
  });
}

const csp = (p: PhanHoi) => {
  const h = p.headers["content-security-policy"];
  return Array.isArray(h) ? h : h ? [h] : [];
};

function guiForm(ma: string, slug: string, than: unknown, o: { ip?: string; origin?: string | null; referer?: string; xff?: string; tho?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-real-ip": o.ip ?? ipNgauNhien() };
  if (o.origin !== null) headers.origin = o.origin ?? ORIGIN;
  if (o.referer) headers.referer = o.referer;
  if (o.xff) headers["x-forwarded-for"] = o.xff;
  return goi(`/api/cong-khai/form/${ma}/${slug}`, { method: "POST", headers, body: o.tho ?? JSON.stringify(than) });
}

function goiWebhook(ma: string, nguon: string, khoa: string | null, than: string, them: Record<string, string> = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-real-ip": ipNgauNhien(), ...them };
  if (khoa !== null) headers["x-cowork-key"] = khoa;
  return goi(`/api/cong-khai/webhook/${ma}/${nguon}`, { method: "POST", headers, body: than });
}

async function main() {
  console.log(`=== QA HTTP đường công khai Marketing: ${URL_GOC} ===\n`);
  const khoe = await goi("/api/khoe");
  if (khoe.status !== 200) {
    console.error(`Máy chủ ${URL_GOC} không trả lời /api/khoe (${khoe.status}).`);
    process.exit(1);
  }

  // ---------------- Dựng dữ liệu ----------------
  const itw = await chu.tenant.findFirstOrThrow({ where: { code: "itw" } });
  const tB = await seedNenMong(chu, `qa-mkh-${DAU}`, "DN thử QA HTTP B");
  console.log("");
  const vaiTro = async (tenantId: string, code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId, code } } })).id;
  const taoNguoi = async (tenantId: string, ten: string, vai: string) =>
    (await chu.user.create({ data: { tenantId, email: `${ten}.${DAU}@thu.test`, passwordHash: "x", fullName: ten, userRoles: { create: { tenantId, roleId: await vaiTro(tenantId, vai) } }, staffProfile: { create: { tenantId } } } })).id;
  const mkA = await taoNguoi(itw.id, "qa-http-mk", "marketing");
  const mkB = await taoNguoi(tB.id, "qa-http-mk-b", "marketing");
  const slug = `qa-http-${DAU}`;
  const truong = [{ khoa: "hoTen", nhan: "Họ tên", batBuoc: true }, { khoa: "dienThoai", nhan: "Số điện thoại", batBuoc: true }];
  const formA = await chu.marketingForm.create({ data: { tenantId: itw.id, slug, name: "QA HTTP", title: "Form QA HTTP", fields: truong, consentText: "Tôi đồng ý nhận tin", ownerId: mkA } });
  await chu.marketingForm.create({ data: { tenantId: tB.id, slug, name: "QA HTTP B", title: "Form QA HTTP của B", fields: truong, ownerId: mkB } });
  const formTat = await chu.marketingForm.create({ data: { tenantId: itw.id, slug: `${slug}-tat`, name: "QA tắt", title: "Form tắt", fields: truong, ownerId: mkA, status: "tat" } });
  void formTat;
  const xss = "<script>alert('xss-qa')</script>";
  const lpOk = await chu.landingPage.create({
    data: {
      tenantId: itw.id, slug: `lp-${slug}`, name: "LP QA", title: `Tiêu đề ${xss}`, ownerId: mkA, formId: formA.id, status: "xuat-ban", publishedAt: new Date(),
      blocks: [
        { loai: "tieu-de", tieuDe: `<img src=x onerror=alert('xss-qa')>`, phuDe: xss },
        { loai: "doan-van", tieuDe: "", noiDung: `${xss}\n\n"><svg onload=alert('xss-qa')>` },
        { loai: "nut-goi", nhan: "Liên kết", kieu: "lien-ket", giaTri: "https://example.com/?q=\"><script>alert('xss-qa')</script>" },
        { loai: "form", tieuDe: "Đăng ký" },
      ],
    },
  });
  const lpJs = await chu.landingPage.create({ data: { tenantId: itw.id, slug: `lp-js-${DAU}`, name: "LP js", title: "LP js", ownerId: mkA, status: "xuat-ban", publishedAt: new Date(), blocks: [{ loai: "nut-goi", nhan: "Bấm", kieu: "lien-ket", giaTri: "javascript:alert('xss-qa')" }] } });
  const lpData = await chu.landingPage.create({ data: { tenantId: itw.id, slug: `lp-data-${DAU}`, name: "LP data", title: "LP data", ownerId: mkA, status: "xuat-ban", publishedAt: new Date(), blocks: [{ loai: "anh", url: "data:image/svg+xml,<svg onload=alert(1)>", moTa: "x" }] } });
  const lpHtml = await chu.landingPage.create({ data: { tenantId: itw.id, slug: `lp-html-${DAU}`, name: "LP html", title: "LP html", ownerId: mkA, status: "xuat-ban", publishedAt: new Date(), blocks: [{ loai: "doan-van", noiDung: "x", html: xss }] } });
  const lpNhap = await chu.landingPage.create({ data: { tenantId: itw.id, slug: `lp-nhap-${DAU}`, name: "LP nháp", title: "LP nháp", ownerId: mkA, blocks: [{ loai: "tieu-de", tieuDe: "Nháp" }] } });
  const lpAn = await chu.landingPage.create({ data: { tenantId: itw.id, slug: `lp-an-${DAU}`, name: "LP ẩn", title: "LP ẩn", ownerId: mkA, status: "an", publishedAt: new Date(), blocks: [{ loai: "tieu-de", tieuDe: "Ẩn" }] } });
  const khoaA = `cwk_qa_a_${DAU}`;
  const khoaB = `cwk_qa_b_${DAU}`;
  const maWh = `qa-wh-${DAU}`;
  await chu.marketingWebhookSource.create({ data: { tenantId: itw.id, code: maWh, name: "QA A", keyHash: bamKhoa(khoaA), keyHint: khoaA.slice(-4), ownerId: mkA } });
  await chu.marketingWebhookSource.create({ data: { tenantId: tB.id, code: maWh, name: "QA B", keyHash: bamKhoa(khoaB), keyHint: khoaB.slice(-4), ownerId: mkB } });
  const khoaThuHoi = `cwk_qa_th_${DAU}`;
  await chu.marketingWebhookSource.create({ data: { tenantId: itw.id, code: `${maWh}-th`, name: "QA thu hồi", keyHash: bamKhoa(khoaThuHoi), keyHint: "xxxx", ownerId: mkA, status: "thu-hoi", revokedAt: new Date(), revokedBy: mkA } });

  // ---------------- 1. Trang công khai, CSP ----------------
  console.log("— 1. Trang công khai và khung nhúng (CSP) —");
  const trangF = await goi(`/f/itw/${slug}`);
  dat("/f/itw/<slug> mở được (200)", trangF.status === 200, String(trangF.status));
  dat("/f: đúng MỘT tiêu đề CSP và là frame-ancestors 'self' https:", csp(trangF).length === 1 && csp(trangF)[0].includes("frame-ancestors 'self' https:"), JSON.stringify(csp(trangF)));
  dat("/f: không kèm X-Frame-Options mâu thuẫn từ ứng dụng", !trangF.headers["x-frame-options"]);
  dat("/f: ô đồng ý nhận tin KHÔNG tích sẵn", /type="checkbox"/.test(trangF.text) && !/type="checkbox"[^>]*checked/.test(trangF.text));
  dat("/f: có ô bẫy chống bot", trangF.text.includes('name="website_url"'));
  dat("/f: không cho máy tìm kiếm lập chỉ mục", /<meta name="robots" content="noindex, ?nofollow"/.test(trangF.text));
  const trangFB = await goi(`/f/qa-mkh-${DAU}/${slug}`);
  dat("NM: cùng slug, mã DN B → trang của B (không lẫn A)", trangFB.status === 200 && trangFB.text.includes("Form QA HTTP của B") && !/>Form QA HTTP</.test(trangFB.text));
  const lp = await goi(`/lp/itw/lp-${slug}`);
  dat("/lp đang xuất bản mở được (200)", lp.status === 200, String(lp.status));
  dat("/lp: CSP vẫn frame-ancestors 'none' (không được nhúng)", csp(lp).length === 1 && csp(lp)[0].includes("frame-ancestors 'none'"), JSON.stringify(csp(lp)));
  for (const d of ["/dang-nhap", "/api/khoe"]) {
    const p = await goi(d);
    dat(`${d}: CSP frame-ancestors 'none'`, csp(p).length === 1 && csp(p)[0].includes("frame-ancestors 'none'"), JSON.stringify(csp(p)));
  }
  const fGia = await goi(`/fxyz/itw/${slug}`);
  dat("Đường /fxyz… không được nới khung nhúng", !csp(fGia).some((c) => c.includes("https:")));

  console.log("\n— 2. Landing không chạy được script / HTML tự do —");
  dat("/lp: không có <script>alert(…) thô trong HTML", !lp.text.includes("<script>alert('xss-qa')") && !lp.text.includes("<script>alert(&#x27;xss-qa"), "");
  dat("/lp: không có thẻ <img onerror> / <svg onload> thô", !/<img src=x onerror/i.test(lp.text) && !/<svg onload/i.test(lp.text));
  dat("/lp: nội dung nguy hiểm hiện thành chữ đã thoát", lp.text.includes("&lt;script&gt;alert("));
  dat("/lp: thẻ <title> đã thoát", !/<title>[^<]*<script>/i.test(lp.text));
  for (const [ten, p] of [["javascript: trong nút", lpJs], ["ảnh data:", lpData], ["khối có trường html lạ", lpHtml]] as const) {
    const r = await goi(`/lp/itw/${p.slug}`);
    dat(`/lp: khối bị sửa tay (${ten}) → 404, không dựng`, r.status === 404 && !r.text.includes("javascript:alert") && !r.text.includes("data:image/svg"), String(r.status));
  }
  dat("/lp: trang nháp → 404", (await goi(`/lp/itw/${lpNhap.slug}`)).status === 404);
  dat("/lp: trang ẩn → 404", (await goi(`/lp/itw/${lpAn.slug}`)).status === 404);
  dat("/lp: landing của itw không mở qua mã DN B", (await goi(`/lp/qa-mkh-${DAU}/lp-${slug}`)).status === 404);
  dat("/f: form tắt → 404", (await goi(`/f/itw/${slug}-tat`)).status === 404);
  const xemTruoc = (await chu.landingPage.findUniqueOrThrow({ where: { id: lpOk.id } })).viewsA + (await chu.landingPage.findUniqueOrThrow({ where: { id: lpOk.id } })).viewsB;
  await goi(`/lp/itw/lp-${slug}?v=b`);
  const sauXem = await chu.landingPage.findUniqueOrThrow({ where: { id: lpOk.id } });
  dat("/lp ?v=b khi không có biến thể B → tính vào A, không lỗi", sauXem.viewsB === 0 && sauXem.viewsA + sauXem.viewsB === xemTruoc + 1);

  console.log("\n— 3. Đường dẫn lạ → 404, không 500, không lộ thông tin —");
  const duongLa: [string, string][] = [
    ["mã DN không tồn tại", `/f/khong-co-${DAU}/${slug}`],
    ["slug không tồn tại", `/f/itw/khong-co-${DAU}`],
    ["mã DN chữ hoa", `/f/ITW/${slug}`],
    ["%2e%2e", `/f/%2e%2e/${slug}`],
    ["..%2f", `/f/itw/..%2F..%2Fdang-nhap`],
    ["%00 trong mã", `/f/itw%00/${slug}`],
    ["%00 trong slug", `/f/itw/${slug}%00`],
    ["unicode", `/f/itw/%C4%91%C4%83ng-k%C3%BD`],
    ["slug rất dài", `/f/itw/${"a".repeat(4000)}`],
    ["mã rất dài", `/f/${"a".repeat(4000)}/${slug}`],
    ["landing %00", `/lp/itw/lp-${slug}%00`],
    ["landing mã lạ", `/lp/%2e%2e/lp-${slug}`],
  ];
  for (const [ten, d] of duongLa) {
    const r = await goi(d);
    // 404, hoặc 307 về /dang-nhap khi Next chuẩn hóa `%2e%2e` ra khỏi tiền tố công khai — miễn không 500 / 200.
    dat(`${ten} → 404 / chuyển về đăng nhập (không 500, không 200)`, r.status === 404 || (r.status === 307 && String(r.headers.location ?? "").includes("/dang-nhap")), `${r.status}`);
    dat(`${ten} → không lộ nội dung form / lỗi CSDL`, !/>Form QA HTTP/.test(r.text) && !/prisma|invalid byte|22021|at async/i.test(r.text));
  }
  // Lách xác thực qua tiền tố công khai /f, /lp, /api/cong-khai
  for (const d of [`/f/%2e%2e/quan-tri/nguoi-dung`, `/lp/..%2F..%2Fbang-dieu-khien`, `/f/../quan-tri/nguoi-dung`, `/api/cong-khai/%2e%2e/v1/nguoi-dung`, `/api/cong-khai/../v1/nguoi-dung`]) {
    const r = await goi(d);
    dat(`Không lách đăng nhập qua ${d} (không 200)`, r.status !== 200, String(r.status));
    dat(`${d} → không trả dữ liệu người dùng`, !r.text.includes("admin@thegioitinhoc.vn"));
  }

  console.log("\n— 4. POST form: CSRF / Origin —");
  const okForm = await guiForm("itw", slug, { hoTen: "Khách HTTP", dienThoai: dt(1) });
  dat("Origin đúng → 200", okForm.status === 200, `${okForm.status} ${okForm.text.slice(0, 200)}`);
  dat("Trả lời tối giản (không lộ mã lead / người nhận)", okForm.status === 200 && !/LD-|leadId|nguoiNhan/i.test(okForm.text));
  for (const [ten, o] of [
    ["Origin lạ", { origin: "https://evil.example" }],
    ["Origin 'null'", { origin: "null" }],
    ["không Origin, không Referer", { origin: null }],
    ["không Origin, Referer lạ", { origin: null, referer: "https://evil.example/f" }],
    ["Origin giả hậu tố host", { origin: `http://${HOST}.evil.example` }],
    ["Origin giả tiền tố host", { origin: `http://evil${U.hostname}:${U.port}` }],
  ] as const) {
    const r = await guiForm("itw", slug, { hoTen: "CSRF", dienThoai: dt(2) }, o);
    dat(`CSRF: ${ten} → 403`, r.status === 403, String(r.status));
  }
  dat("Không lead nào được tạo từ các lần CSRF", (await chu.lead.count({ where: { tenantId: itw.id, phoneNormalized: dt(2) } })) === 0);
  const refOk = await guiForm("itw", slug, { hoTen: "Referer", dienThoai: dt(3) }, { origin: null, referer: `${ORIGIN}/f/itw/${slug}` });
  dat("Không Origin nhưng Referer đúng trang hệ thống → nhận (trình duyệt cũ)", refOk.status === 200, String(refOk.status));
  const formB = await guiForm(`qa-mkh-${DAU}`, slug, { hoTen: "Khách B", dienThoai: dt(4) });
  dat("NM: POST vào mã DN B → lead ở B, không ở itw", formB.status === 200 && (await chu.lead.count({ where: { tenantId: tB.id, phoneNormalized: dt(4) } })) === 1 && (await chu.lead.count({ where: { tenantId: itw.id, phoneNormalized: dt(4) } })) === 0);

  console.log("\n— 5. POST form: thân, honeypot, trường lạ —");
  const to = await guiForm("itw", slug, null, { tho: JSON.stringify({ hoTen: "To", dienThoai: dt(5), x: "a".repeat(20_100) }) });
  dat("Thân > 20 KB (ASCII) → 413", to.status === 413, String(to.status));
  const thanUnicode = JSON.stringify({ hoTen: "Unicode", dienThoai: dt(6), ghiChuLa: "ệ".repeat(19_000) });
  const toU = await guiForm("itw", slug, null, { tho: thanUnicode });
  dat(`MK-11: thân ≤ 20 KB tính theo BYTE — thân ${Buffer.byteLength(thanUnicode)} byte (chữ có dấu) → 413`, toU.status === 413, `HTTP ${toU.status}`);
  const rat = await guiForm("itw", slug, null, { tho: JSON.stringify({ hoTen: "x", dienThoai: dt(7), x: "a".repeat(2_000_000) }) });
  dat("Thân 2 MB → 413, máy chủ vẫn sống", rat.status === 413 && (await goi("/api/khoe")).status === 200, String(rat.status));
  for (const [ten, tho] of [["không phải JSON", "hoTen=a&dienThoai=1"], ["mảng JSON", "[1,2]"], ["chuỗi JSON", '"abc"'], ["rỗng", ""]] as const) {
    const r = await guiForm("itw", slug, null, { tho });
    dat(`Thân ${ten} → 400`, r.status === 400, String(r.status));
  }
  const bot = await guiForm("itw", slug, { hoTen: "Bot", dienThoai: dt(8), website_url: "https://spam.example" });
  dat("Honeypot: trả 200 như thành công…", bot.status === 200);
  dat("…nhưng không tạo lead", (await chu.lead.count({ where: { tenantId: itw.id, phoneNormalized: dt(8) } })) === 0);
  const la = await guiForm("itw", slug, { hoTen: "Trường lạ", dienThoai: dt(9), ownerId: mkB, stage: "CONVERTED", tenantId: tB.id, nguoiPhuTrachId: mkB, congTy: "Không có trong form" });
  const lLa = await chu.lead.findFirst({ where: { tenantId: itw.id, phoneNormalized: dt(9) } });
  dat("Trường ngoài danh mục / ngoài form bị bỏ", la.status === 200 && lLa?.ownerId !== mkB && lLa?.stage === "NEW_LEAD" && lLa?.companyName === null);
  const nul = await guiForm("itw", slug, { hoTen: "Nul\u0000Byte", dienThoai: dt(10) });
  dat("Ký tự NUL trong trường → 400 (không 500)", nul.status === 400, `${nul.status} ${nul.text.slice(0, 120)}`);
  const sai = await guiForm("itw", slug, { hoTen: "Thiếu SĐT" });
  dat("Thiếu trường bắt buộc → 400 kèm lỗi theo trường", sai.status === 400 && JSON.stringify(sai.json).includes("dienThoai"));
  const tat = await guiForm("itw", `${slug}-tat`, { hoTen: "Form tắt", dienThoai: dt(11) });
  dat("Form tắt → 404", tat.status === 404, String(tat.status));
  const khongDn = await guiForm(`khong-co-${DAU}`, slug, { hoTen: "Không DN", dienThoai: dt(11) });
  dat("Mã DN không tồn tại → 404 không lộ gì", khongDn.status === 404 && !khongDn.text.includes(itw.name) && !khongDn.text.includes("itw"), String(khongDn.status));
  const nulDn = await goi(`/api/cong-khai/form/itw%00/${slug}`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ hoTen: "a", dienThoai: dt(11) }) });
  dat("%00 trong mã DN (API) → 404", nulDn.status === 404, String(nulDn.status));
  const nulSlug = await goi(`/api/cong-khai/form/itw/${slug}%00`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", "x-real-ip": ipNgauNhien() }, body: JSON.stringify({ hoTen: "a", dienThoai: dt(11) }) });
  dat("%00 trong slug (API) → 404, không 500", nulSlug.status === 404, `${nulSlug.status} ${nulSlug.text.slice(0, 120)}`);

  // Khách bấm "Gửi" hai lần liền (hai yêu cầu song song) — MK-07
  let vongTrung = 0;
  for (let v = 0; v < 3; v++) {
    const so = dt(30 + v);
    await Promise.all([guiForm("itw", slug, { hoTen: "Bấm đúp", dienThoai: so }), guiForm("itw", slug, { hoTen: "Bấm đúp", dienThoai: so })]);
    if ((await chu.lead.count({ where: { tenantId: itw.id, phoneNormalized: so } })) > 1) vongTrung++;
  }
  dat("MK-07: bấm Gửi hai lần cùng lúc (2 POST song song) → chỉ 1 lead", vongTrung === 0, `${vongTrung}/3 vòng ra 2 lead mở cùng SĐT`);

  console.log("\n— 6. Giới hạn tốc độ form (20 / 10 phút / IP) —");
  const ip = ipNgauNhien();
  const ds: number[] = [];
  for (let i = 0; i < 20; i++) ds.push((await guiForm("itw", slug, { hoTen: "Tốc độ" }, { ip })).status);
  const lan21 = await guiForm("itw", slug, { hoTen: "Tốc độ" }, { ip });
  dat("20 lần đầu không bị chặn tốc độ", ds.every((x) => x !== 429), ds.join(","));
  dat("Lần 21 cùng IP → 429 + Retry-After", lan21.status === 429 && Boolean(lan21.headers["retry-after"]), String(lan21.status));
  const xff = await guiForm("itw", slug, { hoTen: "Tốc độ" }, { ip, xff: `${ipNgauNhien()}, ${ipNgauNhien()}` });
  dat("Đổi X-Forwarded-For (giữ X-Real-IP) không lách được", xff.status === 429, String(xff.status));
  const ipKhac = await guiForm("itw", slug, { hoTen: "Tốc độ" }, { ip: ipNgauNhien() });
  dat("(Thiết kế) Đổi X-Real-IP → đếm riêng: app tin X-Real-IP, nginx máy chủ phải GHI ĐÈ tiêu đề này", ipKhac.status !== 429, String(ipKhac.status));
  const cuoi = ipNgauNhien();
  const xs: number[] = [];
  for (let i = 0; i < 21; i++) xs.push((await guiForm("itw", slug, { hoTen: "XFF" }, { ip: "", xff: `${ipNgauNhien()}, ${cuoi}` })).status);
  dat("Không X-Real-IP: đổi phần tử ĐẦU của X-Forwarded-For không lách được (lấy phần tử cuối)", xs[20] === 429, xs.slice(-3).join(","));
  const dnKhac = await guiForm(`qa-mkh-${DAU}`, slug, { hoTen: "Tốc độ" }, { ip });
  dat("Giới hạn tính riêng theo doanh nghiệp (IP bị chặn ở itw vẫn gửi được vào DN B)", dnKhac.status !== 429, String(dnKhac.status));

  console.log("\n— 7. Webhook —");
  const than = (n: number) => JSON.stringify({ full_name: "Khách webhook", phone_number: dt(n) });
  dat("Webhook: thiếu khóa → 401", (await goiWebhook("itw", maWh, null, than(20))).status === 401);
  dat("Webhook: sai khóa → 401", (await goiWebhook("itw", maWh, "cwk_sai", than(20))).status === 401);
  dat("Webhook: khóa đúng của DN B gọi vào itw → 401", (await goiWebhook("itw", maWh, khoaB, than(20))).status === 401);
  dat("Webhook: khóa của itw gọi vào DN B → 401", (await goiWebhook(`qa-mkh-${DAU}`, maWh, khoaA, than(20))).status === 401);
  dat("Webhook: nguồn đã thu hồi (khóa đúng) → 401", (await goiWebhook("itw", `${maWh}-th`, khoaThuHoi, than(20))).status === 401);
  const r404 = await goiWebhook("itw", `khong-co-${DAU}`, khoaA, than(20));
  const r401 = await goiWebhook("itw", maWh, "cwk_sai", than(20));
  dat("Webhook: 'không có nguồn' và 'sai khóa' trả y hệt nhau", r404.status === r401.status && r404.text === r401.text, `${r404.status}/${r401.status}`);
  dat("Webhook: không lead nào được tạo từ các lần sai", (await chu.lead.count({ where: { phoneNormalized: dt(20) } })) === 0);
  dat("Webhook: thân không phải JSON (khóa đúng) → 400", (await goiWebhook("itw", maWh, khoaA, "khong-phai-json")).status === 400);
  const ok = await goiWebhook("itw", maWh, khoaA, than(21), { origin: "https://evil.example" });
  dat("Webhook: khóa đúng, Origin lạ → vẫn nhận (xác thực bằng khóa, miễn kiểm Origin)", ok.status === 200, `${ok.status} ${ok.text.slice(0, 120)}`);
  const bearer = await goi(`/api/cong-khai/webhook/itw/${maWh}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${khoaA}`, "x-real-ip": ipNgauNhien() }, body: than(22) });
  dat("Webhook: Authorization: Bearer cũng nhận", bearer.status === 200, String(bearer.status));
  dat("Webhook: khóa trên URL (?key=) KHÔNG được chấp nhận", (await goi(`/api/cong-khai/webhook/itw/${maWh}?key=${khoaA}`, { method: "POST", headers: { "content-type": "application/json" }, body: than(23) })).status === 401);
  dat("Webhook: lead tạo đúng trong itw", (await chu.lead.count({ where: { tenantId: itw.id, phoneNormalized: dt(21) } })) === 1);
  const toWh = await goiWebhook("itw", maWh, khoaA, JSON.stringify({ full_name: "To", phone: dt(24), x: "a".repeat(60_000) }));
  dat("Webhook: thân > 50 KB → 413", toWh.status === 413, String(toWh.status));
  const get = await goi(`/api/cong-khai/webhook/itw/${maWh}`);
  dat("Webhook: GET không được phép (405)", get.status === 405, String(get.status));
  const ipWh = ipNgauNhien();
  let dauTien429 = -1;
  for (let i = 0; i < 125; i++) {
    const r = await goi(`/api/cong-khai/webhook/itw/${maWh}`, { method: "POST", headers: { "content-type": "application/json", "x-cowork-key": "cwk_sai", "x-real-ip": ipWh }, body: "{}" });
    if (r.status === 429) {
      dauTien429 = i + 1;
      break;
    }
  }
  dat("Webhook: quá 120 lần/phút/IP → 429", dauTien429 === 121, String(dauTien429));

  await chu.$disconnect();
  ketLuan("QA HTTP Marketing");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
