import { randomBytes } from "node:crypto";
import { voiTenant } from "../src/lib/db";
import { taoNguCanh } from "../src/lib/api";
import { layHoSoQuyen } from "../src/lib/phan-quyen";
import { maHoa } from "../src/lib/ma-hoa";
import { base32Giai, sinhKhoaTotp, totp } from "../src/lib/totp";
import { bamMatKhau } from "../src/lib/xac-thuc";
import { dinhKemTep } from "../src/modules/dinh-kem/service";
import { aadKenh } from "../src/modules/mang-xa-hoi/bao-mat/khoa-chu";
import { niemPhong } from "../src/modules/mang-xa-hoi/bao-mat/niem-phong";
import { kyMaMedia } from "../src/modules/mang-xa-hoi/media-ky";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * QA ĐỐI KHÁNG qua HTTP cho Mạng xã hội 0.23.0 — chạy vào một bản `next start` ĐANG CHẠY cùng CSDL + .env:
 *
 *   THU_URL=http://localhost:3402 npm run thu:qa-mang-xa-hoi-http
 *
 * Tài khoản quản trị lấy từ SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD (đọc trong mã, không in). Dựng thêm một doanh nghiệp
 * thử (Giám đốc có 2 lớp, Giám đốc chưa 2 lớp, Marketing, Kỹ thuật, Kinh doanh). CHỈ trên máy phát triển.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Không chạy trên môi trường thật.");
  process.exit(1);
}

const URL_GOC = (process.env.THU_URL ?? "http://localhost:3402").replace(/\/$/, "");
const ORIGIN = new URL(URL_GOC).origin;
const chu = clientChuSoHuu();
const DAU = Math.floor(performance.timeOrigin).toString(36);
const MAT_KHAU = `Qa-${DAU}-Mxh9`;
const MK_UNG_DUNG = `zzqa ${randomBytes(4).toString("hex")} MNOP qrst`;
const APP_SECRET = randomBytes(16).toString("hex");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), randomBytes(120)]);
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

interface PhanHoi { status: number; json: Record<string, unknown>; text: string; headers: Headers; cookies: Record<string, string> }

async function goi(duong: string, o: { method?: string; than?: unknown; cookie?: string } = {}): Promise<PhanHoi> {
  const headers: Record<string, string> = { "x-real-ip": ip() };
  if (o.than !== undefined) headers["content-type"] = "application/json";
  if (o.cookie) headers.cookie = o.cookie;
  if ((o.method ?? "GET") !== "GET") headers.origin = ORIGIN;
  const r = await fetch(`${URL_GOC}${duong}`, { method: o.method ?? "GET", headers, body: o.than === undefined ? undefined : JSON.stringify(o.than), redirect: "manual" });
  const buf = Buffer.from(await r.arrayBuffer());
  const text = buf.toString("utf8");
  let json: Record<string, unknown> = {};
  try { json = JSON.parse(text); } catch { /* HTML */ }
  const cookies: Record<string, string> = {};
  for (const c of r.headers.getSetCookie()) {
    const m = c.match(/^([^=]+)=([^;]*)/);
    if (m) cookies[m[1]] = m[2];
  }
  return { status: r.status, json, text, headers: r.headers, cookies };
}

async function main() {
  console.log(`=== QA HTTP Mạng xã hội 0.23.0: ${URL_GOC} ===\n`);
  if ((await goi("/api/khoe")).status !== 200) {
    console.error(`Máy chủ ${URL_GOC} không trả lời /api/khoe.`);
    process.exit(1);
  }

  // ---------------- Quản trị hệ thống (SEED_ADMIN_*) ----------------
  console.log("— A. Tài khoản quản trị (SEED_ADMIN_*) —");
  const email = process.env.THU_EMAIL ?? process.env.SEED_ADMIN_EMAIL;
  const mk = process.env.THU_MAT_KHAU ?? process.env.SEED_ADMIN_PASSWORD;
  if (!email || !mk) throw new Error("Thiếu SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.");
  const dnAd = await goi("/api/dang-nhap", { method: "POST", than: { maDoanhNghiep: process.env.THU_MA_DN ?? "itw", email, matKhau: mk } });
  const ckAd = dnAd.cookies.cowork_phien ? `cowork_phien=${dnAd.cookies.cowork_phien}` : "";
  dat("Quản trị đăng nhập được (phiên thật hoặc bước 2 lớp)", dnAd.status === 200 && (Boolean(ckAd) || Boolean(dnAd.cookies.cowork_2lop)), String(dnAd.status));
  if (ckAd) {
    for (const [duong, tu] of [["/mang-xa-hoi", "Mạng xã hội"], ["/mang-xa-hoi/kenh", "Kênh"], ["/quan-tri/ket-noi-nen-tang", "Kết nối nền tảng"]] as const) {
      const r = await goi(duong, { cookie: ckAd });
      const ok = (r.status === 200 && r.text.includes(tu) && !r.text.includes("Không hiển thị được trang này")) || (r.status === 307 && /bat-xac-thuc-2-lop|doi-mat-khau/.test(r.headers.get("location") ?? ""));
      dat(`GET ${duong} → 200 (hoặc chuyển sang đổi mật khẩu lần đầu / bật 2 lớp — chốt chặn có trước trang)`, ok, `${r.status} ${r.headers.get("location") ?? ""}`);
    }
  }

  // ---------------- Doanh nghiệp thử ----------------
  const tenant = await seedNenMong(chu, `qa-mxhh-${DAU}`, "DN QA MXH HTTP DEMO");
  const T = tenant.id;
  const bam = await bamMatKhau(MAT_KHAU);
  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  const khoaTotp = new Map<string, string>();
  async function nguoi(ten: string, vai: string, coTotp: boolean) {
    const u = await chu.user.create({
      data: { tenantId: T, email: `${ten}.${DAU}@thu.test`, passwordHash: bam, passwordChangedAt: new Date(Date.now() - 60_000), fullName: `${ten} DEMO`, userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } }, staffProfile: { create: { tenantId: T, hiredAt: new Date("2025-01-01T00:00:00Z") } } },
    });
    if (coTotp) {
      const k = sinhKhoaTotp();
      khoaTotp.set(u.id, k);
      await chu.user.update({ where: { id: u.id }, data: { totpSecretEnc: maHoa(k, `totp:${u.id}`), totpEnabledAt: new Date(Date.now() - 60_000) } });
    }
    return { id: u.id, email: `${ten}.${DAU}@thu.test` };
  }
  const gd = await nguoi("qa-gd", "ceo", true);
  const gdChua = await nguoi("qa-gd-chua", "ceo", false);
  const mkt = await nguoi("qa-mkt", "marketing", false);
  const ktv = await nguoi("qa-ktv", "technical", false);
  const kd = await nguoi("qa-kd", "sales", false);
  async function dangNhap(u: { id: string; email: string }): Promise<string> {
    const b1 = await goi("/api/dang-nhap", { method: "POST", than: { maDoanhNghiep: tenant.code, email: u.email, matKhau: MAT_KHAU } });
    if (b1.cookies.cowork_phien) return `cowork_phien=${b1.cookies.cowork_phien}`;
    const b2 = await goi("/api/dang-nhap/2-lop", { method: "POST", than: { ma: totp(base32Giai(khoaTotp.get(u.id)!), Date.now()) }, cookie: `cowork_2lop=${b1.cookies.cowork_2lop}` });
    if (!b2.cookies.cowork_phien) throw new Error(`Đăng nhập hỏng: ${b1.status}/${b2.status}`);
    return `cowork_phien=${b2.cookies.cowork_phien}`;
  }
  const [cGd, cGdChua, cMk, cKtv, cKd] = [await dangNhap(gd), await dangNhap(gdChua), await dangNhap(mkt), await dangNhap(ktv), await dangNhap(kd)];

  // Kênh + bản niêm phong dựng thẳng (máy chủ thật không gọi được WordPress giả qua http://localhost).
  const kenhId = crypto.randomUUID();
  const bn = niemPhong(JSON.stringify({ tenDangNhap: "tacgia", matKhau: MK_UNG_DUNG }), aadKenh(T, kenhId));
  await chu.socialConnection.create({ data: { id: kenhId, tenantId: T, platform: "WORDPRESS", name: "Site HTTP DEMO", externalId: "https://vi-du.vn", accountName: "tacgia", createdBy: gd.id, credential: { create: { tenantId: T, ...bn } } } });

  // ==================================================================
  console.log("\n— B. Kết nối nền tảng (API): 2 lớp bắt buộc, người khác chỉ thấy trạng thái —");
  const trangGdChua = await goi("/quan-tri/ket-noi-nen-tang", { cookie: cGdChua });
  dat("Giám đốc CHƯA bật 2 lớp: trang hiện cảnh báo, không có ô nhập", trangGdChua.status === 200 && trangGdChua.text.includes("chưa bật") && !trangGdChua.text.includes("Hướng dẫn từng bước"), String(trangGdChua.status));
  const putChua = await goi("/api/v1/mang-xa-hoi/thong-tin-app/meta", { method: "PUT", cookie: cGdChua, than: { appId: "123456789012", biMat: APP_SECRET } });
  dat("…gọi API trực tiếp → 403 can-2-lop", putChua.status === 403 && putChua.json.ma === "can-2-lop", `${putChua.status} ${putChua.text.slice(0, 120)}`);
  const ktChua = await goi("/api/v1/mang-xa-hoi/thong-tin-app/meta/kiem-tra", { method: "POST", cookie: cGdChua, than: { appId: "123456789012", biMat: APP_SECRET } });
  dat("…nút Kiểm tra qua API → 403", ktChua.status === 403, String(ktChua.status));
  const put = await goi("/api/v1/mang-xa-hoi/thong-tin-app/meta", { method: "PUT", cookie: cGd, than: { appId: "123456789012", biMat: APP_SECRET } });
  dat("Giám đốc ĐÃ bật 2 lớp: lưu được, phản hồi chỉ có 4 ký tự cuối", put.status === 200 && !put.text.includes(APP_SECRET) && put.text.includes(APP_SECRET.slice(-4)), `${put.status}`);
  const trangGd = await goi("/quan-tri/ket-noi-nen-tang", { cookie: cGd });
  dat("…trang có ô nhập + hướng dẫn, HTML không có App Secret", trangGd.status === 200 && trangGd.text.includes("Hướng dẫn từng bước") && !trangGd.text.includes(APP_SECRET));
  for (const [ten, ck] of [["Marketing", cMk], ["Kỹ thuật", cKtv]] as const) {
    const r = await goi("/quan-tri/ket-noi-nen-tang", { cookie: ck });
    dat(`${ten}: trang chỉ thấy trạng thái (không 4 ký tự cuối, không App ID)`, r.status === 200 && r.text.includes("chỉ xem được trạng thái") && !r.text.includes(APP_SECRET.slice(-4)) && !r.text.includes("123456789012"), String(r.status));
    const a = await goi("/api/v1/mang-xa-hoi/thong-tin-app", { cookie: ck });
    dat(`${ten}: API trạng thái không có giá trị`, a.status === 200 && !a.text.includes("123456789012") && !a.text.includes(APP_SECRET.slice(-4)));
    const p = await goi("/api/v1/mang-xa-hoi/thong-tin-app/meta", { method: "PUT", cookie: ck, than: { appId: "1", biMat: APP_SECRET } });
    dat(`${ten}: PUT → 403`, p.status === 403, String(p.status));
  }
  const kdTrang = await goi("/api/v1/mang-xa-hoi/thong-tin-app", { cookie: cKd });
  dat("Kinh doanh: API trạng thái → 403", kdTrang.status === 403, String(kdTrang.status));
  // Phiên tạo TRƯỚC khi bật 2 lớp: bật xong (securityChangedAt như service) → phiên cũ hết hiệu lực.
  const luc = new Date();
  const k = sinhKhoaTotp();
  await chu.user.update({ where: { id: gdChua.id }, data: { totpSecretEnc: maHoa(k, `totp:${gdChua.id}`), totpEnabledAt: luc, securityChangedAt: luc } });
  const cu = await goi("/api/v1/mang-xa-hoi/thong-tin-app/meta", { method: "PUT", cookie: cGdChua, than: { appId: "123456789012", biMat: APP_SECRET } });
  dat("Phiên cũ (trước khi bật 2 lớp) không dùng được để nhập thông tin app → 401", cu.status === 401, String(cu.status));
  const trangCu = await goi("/quan-tri/ket-noi-nen-tang", { cookie: cGdChua });
  dat("…trang với phiên cũ → về đăng nhập", trangCu.status === 307 && /dang-nhap/.test(trangCu.headers.get("location") ?? ""), `${trangCu.status} ${trangCu.headers.get("location")}`);

  // ==================================================================
  console.log("\n— C. Mạng xã hội: trang + API không lộ mật khẩu ứng dụng, SSRF qua máy chủ thật —");
  for (const duong of ["/mang-xa-hoi", "/mang-xa-hoi/kenh", "/mang-xa-hoi/soan", "/mang-xa-hoi/cho-duyet"]) {
    const r = await goi(duong, { cookie: cGd });
    dat(`GET ${duong} (Giám đốc) → 200, không lộ mật khẩu ứng dụng`, r.status === 200 && !r.text.includes("Không hiển thị được trang này") && !r.text.includes(MK_UNG_DUNG), String(r.status));
  }
  const kenhApi = await goi("/api/v1/mang-xa-hoi/kenh", { cookie: cMk });
  dat("API kênh: có kênh, không có mật khẩu / bản niêm phong", kenhApi.status === 200 && kenhApi.text.includes(kenhId) && !kenhApi.text.includes(MK_UNG_DUNG) && !/ciphertext|wrappedKey|wrapped_key/.test(kenhApi.text));
  const kdKenh = await goi("/api/v1/mang-xa-hoi/kenh", { cookie: cKd });
  dat("Kinh doanh không xem được kênh → 403", kdKenh.status === 403, String(kdKenh.status));
  const ssrf1 = await goi("/api/v1/mang-xa-hoi/kenh/kiem-tra", { method: "POST", cookie: cMk, than: { diaChi: "https://127.0.0.1", tenDangNhap: "a", matKhauUngDung: "12345678abc" } });
  dat("Kiểm tra site https://127.0.0.1 trên máy chủ thật → bị chặn (không gọi)", ssrf1.status === 200 && ssrf1.json.ok === false && /nội bộ|bị chặn/.test(String(ssrf1.json.thongBao)), ssrf1.text.slice(0, 160));
  const ssrf2 = await goi("/api/v1/mang-xa-hoi/kenh/kiem-tra", { method: "POST", cookie: cMk, than: { diaChi: "https://2130706433", tenDangNhap: "a", matKhauUngDung: "12345678abc" } });
  dat("…https://2130706433 (IP thập phân) → bị chặn", ssrf2.status === 200 && ssrf2.json.ok === false && /nội bộ|bị chặn/.test(String(ssrf2.json.thongBao)), ssrf2.text.slice(0, 160));
  const ssrf3 = await goi("/api/v1/mang-xa-hoi/kenh/kiem-tra", { method: "POST", cookie: cMk, than: { diaChi: "http://vi-du.vn", tenDangNhap: "a", matKhauUngDung: "12345678abc" } });
  dat("…http:// (không mã hóa) → 400", ssrf3.status === 400, String(ssrf3.status));
  const ssrf4 = await goi("/api/v1/mang-xa-hoi/kenh/kiem-tra", { method: "POST", cookie: cMk, than: { diaChi: "http://localhost:3402", tenDangNhap: "a", matKhauUngDung: "12345678abc" } });
  dat("…http://localhost (chế độ bài thử tắt trên máy chủ thật) → 400", ssrf4.status === 400, String(ssrf4.status));

  // Bài có ảnh → link ký công khai.
  const voi = <R>(u: string, f: (nc: ReturnType<typeof taoNguCanh>) => Promise<R>) => voiTenant(T, async (tx) => f(taoNguCanh(tx, T, (await layHoSoQuyen(tx, u))!, "127.0.0.1", "thu-qa-mxh-http")));
  const tao = await goi("/api/v1/mang-xa-hoi/bai", { method: "POST", cookie: cMk, than: { tieuDe: "Bài HTTP DEMO", noiDung: "Nội dung", kenhIds: [kenhId] } });
  const baiId = String(tao.json.id);
  dat("Tạo bài qua API → 200", tao.status === 200 && tao.json.trangThai === "DRAFT", `${tao.status} ${tao.text.slice(0, 120)}`);
  const tep = await voi(mkt.id, (nc) => dinhKemTep(nc, { loai: "social_post", doiTuongId: baiId, tenTep: "anh.png", noiDung: PNG }));
  await chu.socialPostMedia.create({ data: { tenantId: T, postId: baiId, attachmentId: tep.id, position: 0, role: "featured" } });
  const lk = await goi(`/api/v1/mang-xa-hoi/bai/${baiId}/link-media`, { method: "POST", cookie: cMk, than: { attachmentId: tep.id } });
  const ma = String(lk.json.url ?? "").split("/").pop() ?? "";
  const anh = await goi(`/api/cong-khai/mxh/media/${ma}`);
  dat("Link ảnh ký: 200, image/png, nosniff, không chuyển hướng, đúng byte", anh.status === 200 && anh.headers.get("content-type") === "image/png" && anh.headers.get("x-content-type-options") === "nosniff" && !anh.headers.get("location"), `${lk.status} ${anh.status} ${anh.headers.get("content-type")}`);
  dat("…sửa chữ ký → 403", (await goi(`/api/cong-khai/mxh/media/${ma.slice(0, -2)}AA`)).status === 403);
  const maCu = kyMaMedia({ tenantId: T, postId: baiId, attachmentId: tep.id, hetHanGiay: 946684800 });
  dat("…link hết hạn → 410", (await goi(`/api/cong-khai/mxh/media/${maCu}`)).status === 410);
  dat("…ký đúng nhưng doanh nghiệp khác → 404", (await goi(`/api/cong-khai/mxh/media/${kyMaMedia({ tenantId: (await chu.tenant.findFirstOrThrow({ where: { code: "itw" } })).id, postId: baiId, attachmentId: tep.id, hetHanGiay: 4102444800 })}`)).status === 404);
  const linkKd = await goi(`/api/v1/mang-xa-hoi/bai/${baiId}/link-media`, { method: "POST", cookie: cKd, than: { attachmentId: tep.id } });
  dat("Kinh doanh không tạo được link ảnh → 403", linkKd.status === 403, String(linkKd.status));
  // CSV qua HTTP
  await goi("/api/v1/mang-xa-hoi/bai", { method: "POST", cookie: cMk, than: { tieuDe: "=1+1 DEMO", noiDung: "x", kenhIds: [] } });
  const csv = await goi("/api/v1/mang-xa-hoi/bai/xuat", { cookie: cMk });
  dat("Xuất CSV qua HTTP: ô “=1+1” có dấu ' (CSV-01)", csv.status === 200 && csv.text.includes("'=1+1 DEMO"), String(csv.status));

  ketLuan("QA HTTP Mạng xã hội 0.23.0");
}

main().catch((e) => {
  console.error("Bài thử hỏng ngoài dự kiến:", e);
  process.exit(1);
});
