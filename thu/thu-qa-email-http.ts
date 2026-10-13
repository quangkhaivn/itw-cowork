import net from "node:net";
import { readFileSync } from "node:fs";
import { SignJWT } from "jose";
import { prisma } from "../src/lib/db";
import { bamMatKhau } from "../src/lib/xac-thuc";
import { base32Giai, buocThoiGian, hotp, sinhKhoaTotp, sinhMaKhoiPhuc } from "../src/lib/totp";
import { maHoa } from "../src/lib/ma-hoa";
import { bamMaKhoiPhuc } from "../src/modules/xac-thuc-2-lop/service";
import { guiLoThu } from "../src/modules/email/gui";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * KIỂM THỬ ĐỐI KHÁNG QUA HTTP (QA độc lập) — gói E 0.16.0: đăng nhập 2 bước, phiên tạm, bắt buộc
 * 2 lớp, thu hồi phiên, kết nối email, liên kết công khai trong thư.
 *
 * Chạy vào một máy chủ ĐANG CHẠY (bản production `next start`):
 *   THU_URL=http://localhost:3023 THU_SMTP_CONG=2573 npm run thu:qa-email-http
 * Bài tự dựng người dùng thử trong doanh nghiệp `itw` bằng client chủ sở hữu (CSDL phát triển),
 * tự dựng máy chủ SMTP giả ở cổng THU_SMTP_CONG, và gọi `guiLoThu()` trong tiến trình (đúng hàm
 * worker gọi mỗi nhịp) để thư đi thật qua nodemailer. KHÔNG nằm trong `thu:tich-hop`.
 * THU_LOG_MAY_CHU (tùy chọn): đường dẫn log của máy chủ để dò bí mật bị in ra log.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}
const URL_GOC = (process.env.THU_URL ?? "http://localhost:3023").replace(/\/$/, "");
const CONG_SMTP = Number(process.env.THU_SMTP_CONG ?? 2573);
const HOST = new URL(URL_GOC).host;
// Liên kết trong thư phải trỏ về máy chủ đang thử (gocUrl() đọc biến lúc gọi).
process.env.APP_URL = URL_GOC;


const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const MAT_KHAU = "MatKhauQaHttp2026!";
const ipNgauNhien = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

interface PhanHoi {
  status: number;
  json: Record<string, unknown>;
  text: string;
  cookies: Record<string, string>;
  setCookie: string[];
  location: string | null;
  headers: Headers;
  ms: number;
}

async function goi(
  duongDan: string,
  { phuongThuc = "GET", than, cookie, origin = `http://${HOST}`, ip = "10.9.9.9" }: { phuongThuc?: string; than?: unknown; cookie?: string | null; origin?: string | null; ip?: string } = {},
): Promise<PhanHoi> {
  const headers: Record<string, string> = { "x-real-ip": ip };
  if (than !== undefined) headers["content-type"] = "application/json";
  if (cookie) headers.cookie = cookie;
  if (origin && phuongThuc !== "GET") headers.origin = origin;
  const t0 = performance.now();
  const r = await fetch(`${URL_GOC}${duongDan}`, { method: phuongThuc, headers, body: than === undefined ? undefined : JSON.stringify(than), redirect: "manual" });
  const text = await r.text();
  const ms = performance.now() - t0;
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    // HTML / ảnh
  }
  const setCookie = r.headers.getSetCookie();
  const cookies: Record<string, string> = {};
  for (const c of setCookie) {
    const m = /^([^=]+)=([^;]*)/.exec(c);
    if (m) cookies[m[1]] = m[2];
  }
  return { status: r.status, json, text, cookies, setCookie, location: r.headers.get("location"), headers: r.headers, ms };
}

const phien = (r: PhanHoi) => (r.cookies.cowork_phien ? `cowork_phien=${r.cookies.cowork_phien}` : null);
const dn1 = (email: string, matKhau: string, ip: string) => goi("/api/dang-nhap", { phuongThuc: "POST", than: { maDoanhNghiep: "itw", email, matKhau }, ip });
const dn2 = (cookieTam: string | null, ma: string, ip: string) => goi("/api/dang-nhap/2-lop", { phuongThuc: "POST", than: { ma }, cookie: cookieTam, ip });
const tam = (r: PhanHoi) => (r.cookies.cowork_2lop ? `cowork_2lop=${r.cookies.cowork_2lop}` : null);

// ---------------------------------------------------------------------------
// SMTP giả
// ---------------------------------------------------------------------------

const hopThu: { den: string[]; du: string }[] = [];
function dungSmtp(): Promise<() => void> {
  return new Promise((ok, hong) => {
    const s = net.createServer((sock) => {
      let dem = "";
      let trongData = false;
      let thu = { den: [] as string[], du: "" };
      const gui = (x: string) => sock.write(`${x}\r\n`);
      gui("220 qa-http ESMTP");
      sock.on("data", (b) => {
        dem += b.toString("utf8");
        while (true) {
          if (trongData) {
            const k = dem.indexOf("\r\n.\r\n");
            if (k < 0) return;
            thu.du = dem.slice(0, k);
            dem = dem.slice(k + 5);
            trongData = false;
            hopThu.push(thu);
            thu = { den: [], du: "" };
            gui("250 OK");
            continue;
          }
          const xd = dem.indexOf("\r\n");
          if (xd < 0) return;
          const dong = dem.slice(0, xd);
          dem = dem.slice(xd + 2);
          const l = dong.slice(0, 4).toUpperCase();
          if (l === "EHLO") gui("250-qa-http\r\n250 8BITMIME");
          else if (l === "RCPT") {
            thu.den.push(/<([^>]+)>/.exec(dong)?.[1]?.toLowerCase() ?? "");
            gui("250 OK");
          } else if (l === "DATA") {
            trongData = true;
            gui("354 go");
          } else if (l === "QUIT") {
            gui("221 bye");
            sock.end();
          } else gui("250 OK");
        }
      });
      sock.on("error", () => {});
    });
    s.on("error", hong);
    s.listen(CONG_SMTP, "127.0.0.1", () => ok(() => s.close()));
  });
}

/** Bỏ mã hóa quoted-printable / gập dòng tiêu đề để đọc URL trong thư thô. */
function moThu(du: string): string {
  return du.replace(/=\r\n/g, "").replace(/=3D/g, "=").replace(/\r\n[ \t]+/g, " ");
}

const maTai = (khoa: string, buoc: number) => hotp(base32Giai(khoa), buoc);

async function main() {
  console.log(`=== QA HTTP gói E: ${URL_GOC} (SMTP giả :${CONG_SMTP}) ===\n`);
  const dongSmtp = await dungSmtp();
  const tenant = await chu.tenant.findUniqueOrThrow({ where: { code: "itw" } });
  const T = tenant.id;
  const hash = await bamMatKhau(MAT_KHAU);
  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  async function nguoi(ten: string, vai: string) {
    const u = await chu.user.create({
      data: {
        tenantId: T,
        email: `qa-${ten}.${DAU}@qa.test`,
        passwordHash: hash,
        fullName: `QA ${ten}`,
        userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
        staffProfile: { create: { tenantId: T } },
      },
    });
    return { id: u.id, email: u.email };
  }
  /** Bật 2 lớp thẳng trong CSDL bằng đúng hàm mã hóa / băm của hệ thống (máy chủ dùng chung .env). */
  async function bat2Lop(id: string) {
    const khoa = sinhKhoaTotp();
    const ma = sinhMaKhoiPhuc(10);
    await chu.user.update({ where: { id }, data: { totpSecretEnc: maHoa(khoa, `totp:${id}`), totpEnabledAt: new Date(), totpLastStep: BigInt(buocThoiGian(Date.now()) - 5) } });
    await chu.userRecoveryCode.createMany({ data: ma.map((m) => ({ tenantId: T, userId: id, codeHash: bamMaKhoiPhuc(id, m) })) });
    return { khoa, ma };
  }

  const gd = await nguoi("giam-doc", "ceo");
  const nv = await nguoi("nv-2lop", "sales");
  const nvKhoa = await nguoi("nv-khoa", "sales");
  const nvNhieu = await nguoi("nv-nhieu", "sales");
  const nvKhac = await nguoi("nv-khac", "sales");
  const nv5 = await nguoi("nv-thu-hoi", "sales");
  const nvTam = await nguoi("nv-tam", "sales");
  const kt = await nguoi("ky-thuat", "technical");
  const tpmkt = await nguoi("tp-mkt", "marketing-manager");
  const tts = await nguoi("tts", "marketing-intern");
  const k = await bat2Lop(nv.id);
  const kKhoa = await bat2Lop(nvKhoa.id);
  const kNhieu = await bat2Lop(nvNhieu.id);
  const k5 = await bat2Lop(nv5.id);
  const kTam = await bat2Lop(nvTam.id);

  // ------------------------------------------------------------------
  console.log("— 1. Phiên tạm giữa hai bước (XT-04) —");
  const ip1 = ipNgauNhien();
  const b1 = await dn1(nv.email, MAT_KHAU, ip1);
  dat("Mật khẩu đúng + bật 2 lớp → 200 can2Lop, CHƯA cấp cookie phiên thật", b1.status === 200 && b1.json.can2Lop === true && !b1.cookies.cowork_phien, JSON.stringify(b1.json));
  const ckTam = b1.setCookie.find((c) => c.startsWith("cowork_2lop=")) ?? "";
  dat("Cookie tạm HttpOnly, SameSite, Path=/api/dang-nhap, Max-Age=300", /HttpOnly/i.test(ckTam) && /SameSite=lax/i.test(ckTam) && /Path=\/api\/dang-nhap/i.test(ckTam) && /Max-Age=300/i.test(ckTam), ckTam.replace(/=[^;]{20,}/, "=…"));
  const tokenTam = b1.cookies.cowork_2lop ?? "";
  const tai = JSON.parse(Buffer.from(tokenTam.split(".")[1] ?? "", "base64url").toString() || "{}");
  dat("Token tạm có p='2lop' và hạn đúng 300 giây", tai.p === "2lop" && tai.exp - tai.iat === 300, JSON.stringify({ p: tai.p, han: tai.exp - tai.iat }));

  const API = ["/api/v1/nguoi-dung", "/api/v1/khach-hang", "/api/v1/tai-khoan/2-lop", "/api/v1/xac-thuc-2-lop", "/api/v1/email/ket-noi", "/api/v1/email/chien-dich", "/api/v1/phien-ban", "/api/v1/thong-bao", "/api/v1/bang-dieu-khien"];
  const TRANG = ["/bang-dieu-khien", "/quan-tri/xac-thuc-2-lop", "/quan-tri/ket-noi-email", "/marketing/email/chien-dich", "/bat-xac-thuc-2-lop", "/doi-mat-khau"];
  for (const ten of ["cowork_phien", "cowork_2lop"]) {
    const ck = `${ten}=${tokenTam}`;
    const apiLot = [];
    for (const a of API) {
      const r = await goi(a, { cookie: ck });
      if (r.status !== 401) apiLot.push(`${a}→${r.status}`);
    }
    dat(`Token tạm đặt vào cookie '${ten}' → mọi API /api/v1 trả 401`, apiLot.length === 0, apiLot.join(", "));
    const trangLot = [];
    for (const p of TRANG) {
      const r = await goi(p, { cookie: ck });
      if (!(r.status === 307 && (r.location ?? "").includes("/dang-nhap"))) trangLot.push(`${p}→${r.status} ${r.location}`);
    }
    dat(`Token tạm đặt vào cookie '${ten}' → mọi trang hệ thống chuyển về /dang-nhap`, trangLot.length === 0, trangLot.join(", "));
  }
  const dmk = await goi("/api/v1/tai-khoan/doi-mat-khau", { phuongThuc: "POST", cookie: `cowork_phien=${tokenTam}`, than: { matKhauHienTai: MAT_KHAU, matKhauMoi: "X".repeat(12), nhapLai: "X".repeat(12) } });
  dat("Token tạm không đổi được mật khẩu (route cho phép khi bị bắt đổi mật khẩu)", dmk.status === 401, String(dmk.status));
  const tatTam = await goi("/api/v1/tai-khoan/2-lop/tat", { phuongThuc: "POST", cookie: `cowork_phien=${tokenTam}`, than: { matKhau: MAT_KHAU, ma: "000000" } });
  dat("Token tạm không gọi được 'tắt 2 lớp'", tatTam.status === 401);

  const khongTam = await dn2(null, maTai(k.khoa, buocThoiGian(Date.now())), ipNgauNhien());
  dat("Gọi thẳng bước 2 không có phiên tạm → 401 het-phien-tam", khongTam.status === 401 && khongTam.json.ma === "het-phien-tam");
  const khoaKy = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const hetHan = await new SignJWT({ tid: T, email: nv.email, ms: Date.now() - 400_000, p: "2lop" }).setProtectedHeader({ alg: "HS256" }).setSubject(nv.id).setIssuedAt(Math.floor(Date.now() / 1000) - 400).setExpirationTime(Math.floor(Date.now() / 1000) - 100).sign(khoaKy);
  const rHet = await dn2(`cowork_2lop=${hetHan}`, maTai(k.khoa, buocThoiGian(Date.now())), ipNgauNhien());
  dat("Phiên tạm quá 5 phút (exp đã qua) → 401 het-phien-tam, mã đúng cũng không vào được", rHet.status === 401 && rHet.json.ma === "het-phien-tam" && !rHet.cookies.cowork_phien);
  const gia = await new SignJWT({ tid: T, email: nv.email, ms: Date.now(), p: "2lop" }).setProtectedHeader({ alg: "HS256" }).setSubject(nv.id).setIssuedAt().setExpirationTime("5m").sign(new TextEncoder().encode("khoa-gia-mao-khoa-gia-mao-khoa-gia-mao-123"));
  dat("Phiên tạm ký bằng khóa giả → 401", (await dn2(`cowork_2lop=${gia}`, "123456", ipNgauNhien())).status === 401);
  const thuong = await new SignJWT({ tid: T, email: nv.email, ms: Date.now() }).setProtectedHeader({ alg: "HS256" }).setSubject(nv.id).setIssuedAt().setExpirationTime("5m").sign(khoaKy);
  dat("Token phiên THẬT (không có p) đưa vào bước 2 → 401 (không đổi vai trò được)", (await dn2(`cowork_2lop=${thuong}`, "123456", ipNgauNhien())).status === 401);

  // ------------------------------------------------------------------
  console.log("\n— 2. Bước 2: mã sai / cũ / phát lại / đúng (XT-05) —");
  const ck1 = tam(b1);
  const s = buocThoiGian(Date.now());
  const sai = await dn2(ck1, "000000", ip1);
  const cu = await dn2(ck1, maTai(k.khoa, s - 2), ip1);
  const kpSai = await dn2(ck1, "ABCDE-FGHIJ", ip1);
  dat("Mã sai / mã cũ 60 giây / mã khôi phục sai → cùng một câu lỗi 401", [sai, cu, kpSai].every((r) => r.status === 401 && r.json.thongBao === sai.json.thongBao) && !("ma" in sai.json), JSON.stringify([sai.json, cu.json, kpSai.json]));
  const tg = [sai.ms, cu.ms, kpSai.ms].map((x) => Math.round(x));
  const dung = await dn2(ck1, maTai(k.khoa, s), ip1);
  dat("Mã đúng → 200, cấp cookie phiên thật, xoá cookie tạm", dung.status === 200 && Boolean(dung.cookies.cowork_phien) && dung.cookies.cowork_2lop === "", JSON.stringify(dung.json));
  console.log(`    (thời gian phản hồi bước 2: sai ${tg.join("/")} ms, đúng ${Math.round(dung.ms)} ms)`);
  const C0 = phien(dung)!;
  dat("Phiên thật dùng được: /api/v1/tai-khoan/2-lop → daBat", (await goi("/api/v1/tai-khoan/2-lop", { cookie: C0 })).json.daBat === true);
  const b1b = await dn1(nv.email, MAT_KHAU, ip1);
  const lai = await dn2(tam(b1b), maTai(k.khoa, s), ip1);
  dat("Phát lại đúng mã vừa dùng ở lần đăng nhập mới → 401", lai.status === 401);
  // Token tạm đã hoàn tất đăng nhập: trình duyệt đã xoá cookie, nhưng JWT còn hạn 5 phút.
  const ipT = ipNgauNhien();
  const bT = await dn1(nvTam.email, MAT_KHAU, ipT);
  const sT = buocThoiGian(Date.now());
  const xongT = await dn2(tam(bT), maTai(kTam.khoa, sT), ipT);
  const dungLai = await dn2(tam(bT), kTam.ma[0], ipT);
  dat(
    "Thông tin: token tạm đã dùng xong một lần — dùng lại kèm một mã hợp lệ khác",
    xongT.status === 200,
    "",
  );
  console.log(`    (dùng lại token tạm đã hoàn tất đăng nhập + mã khôi phục: ${dungLai.status === 200 ? "VẪN cấp phiên mới — token tạm không bị vô hiệu sau khi dùng (rủi ro thấp: vẫn cần một mã đúng)" : `bị từ chối (${dungLai.status})`})`);
  const ckAudit = JSON.stringify(await chu.auditLog.findMany({ where: { tenantId: T, objectId: nv.id } })) + JSON.stringify(await chu.businessEvent.findMany({ where: { tenantId: T, objectId: nv.id } }));
  dat("Nhật ký đăng nhập 2 lớp không chứa khóa / mã khôi phục / mã đã nhập", !ckAudit.includes(k.khoa) && !k.ma.some((m) => ckAudit.includes(m)) && !ckAudit.includes(maTai(k.khoa, s)));

  // ------------------------------------------------------------------
  console.log("\n— 3. Khóa tài khoản theo ngưỡng Cấu hình (XT-05) —");
  const nguong = await chu.tenantSetting.findFirst({ where: { tenantId: T, key: "bao_mat.so_lan_sai_toi_da" } });
  const N = typeof nguong?.value === "number" ? nguong.value : 5;
  const ipK = ipNgauNhien();
  const bk = await dn1(nvKhoa.email, MAT_KHAU, ipK);
  const kq: number[] = [];
  for (let i = 0; i < N; i++) kq.push((await dn2(tam(bk), String(111111 + i), ipK)).status);
  const uKhoa = await chu.user.findUniqueOrThrow({ where: { id: nvKhoa.id } });
  dat(`Sai mã ${N} lần (ngưỡng Cấu hình) → tài khoản bị khóa (locked_until)`, uKhoa.lockedUntil !== null && uKhoa.lockedUntil > new Date(), `trạng thái: ${kq.join(",")}`);
  const dungKhiKhoa = await dn2(tam(bk), maTai(kKhoa.khoa, buocThoiGian(Date.now())), ipNgauNhien());
  dat("Đang khóa: mã ĐÚNG cũng bị 429, không cấp phiên", dungKhiKhoa.status === 429 && !dungKhiKhoa.cookies.cowork_phien, String(dungKhiKhoa.status));
  const mkKhiKhoa = await dn1(nvKhoa.email, MAT_KHAU, ipNgauNhien());
  dat("Đang khóa: bước mật khẩu cũng 429 (dùng chung bộ đếm)", mkKhiKhoa.status === 429);

  // ------------------------------------------------------------------
  console.log("\n— 4. Đăng nhập ĐÚNG nhiều lần không được coi là 'sai quá nhiều' —");
  const ipN = ipNgauNhien();
  const ketQuaN: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = await dn1(nvNhieu.email, MAT_KHAU, ipN);
    const b = await dn2(tam(a), kNhieu.ma[i], ipN);
    ketQuaN.push(b.status);
  }
  dat(
    "ĐỎ: 6 lần đăng nhập 2 bước ĐÚNG liên tiếp (mã khôi phục khác nhau) đều thành công — bộ đếm Redis '2-lop:tk' phải xoá khi đúng như bước mật khẩu",
    ketQuaN.every((x) => x === 200),
    `trạng thái: ${ketQuaN.join(",")} — lần 6 bị 429 'Nhập sai quá nhiều lần' dù chưa sai lần nào`,
  );

  // ------------------------------------------------------------------
  console.log("\n— 5. Tắt / đặt lại 2 lớp thu hồi phiên cũ (XT-07, XT-08) —");
  const ip5 = ipNgauNhien();
  const a1 = await dn1(nv5.email, MAT_KHAU, ip5);
  const C1r = await dn2(tam(a1), maTai(k5.khoa, buocThoiGian(Date.now())), ip5);
  const C1 = phien(C1r)!;
  const a2 = await dn1(nv5.email, MAT_KHAU, ip5);
  const C2r = await dn2(tam(a2), k5.ma[0], ip5);
  const C2 = phien(C2r)!;
  dat("Hai phiên song song của cùng người đều dùng được", (await goi("/api/v1/tai-khoan/2-lop", { cookie: C1 })).status === 200 && (await goi("/api/v1/tai-khoan/2-lop", { cookie: C2 })).status === 200);
  const tat = await goi("/api/v1/tai-khoan/2-lop/tat", { phuongThuc: "POST", cookie: C2, than: { matKhau: MAT_KHAU, ma: k5.ma[1] } });
  dat("Tắt 2 lớp (mật khẩu + mã khôi phục) → 200 và cookie mới cho máy đang dùng", tat.status === 200 && Boolean(tat.cookies.cowork_phien), JSON.stringify(tat.json));
  dat("Tắt 2 lớp: phiên cũ ở máy khác → 401", (await goi("/api/v1/tai-khoan/2-lop", { cookie: C1 })).status === 401);
  dat("Tắt 2 lớp: chính cookie cũ của máy vừa tắt → 401 (đã thay bằng cookie mới)", (await goi("/api/v1/tai-khoan/2-lop", { cookie: C2 })).status === 401);
  const C3 = phien(tat)!;
  const bd = await goi("/api/v1/tai-khoan/2-lop/bat-dau", { phuongThuc: "POST", cookie: C3 });
  const khoaMoi = String(bd.json.khoa ?? "");
  const xn = await goi("/api/v1/tai-khoan/2-lop/xac-nhan", { phuongThuc: "POST", cookie: C3, than: { ma: maTai(khoaMoi, buocThoiGian(Date.now())) } });
  dat("Bật lại 2 lớp qua API → 10 mã khôi phục + cookie mới", xn.status === 200 && Array.isArray(xn.json.maKhoiPhuc) && (xn.json.maKhoiPhuc as unknown[]).length === 10 && Boolean(xn.cookies.cowork_phien));
  dat("Bật 2 lớp: cookie trước khi bật → 401", (await goi("/api/v1/tai-khoan/2-lop", { cookie: C3 })).status === 401);
  const C4 = phien(xn)!;
  const tt = await goi("/api/v1/tai-khoan/2-lop", { cookie: C4 });
  dat("Trạng thái 2 lớp không trả khóa / bản mã", !tt.text.includes(khoaMoi) && !tt.text.includes("v1:"));

  const ipG = ipNgauNhien();
  const g1 = await dn1(gd.email, MAT_KHAU, ipG);
  const CG = phien(g1)!;
  dat("Giám đốc (chưa bật 2 lớp, không bị bắt) đăng nhập 1 bước", g1.status === 200 && Boolean(CG));
  const ql = await goi("/api/v1/xac-thuc-2-lop", { cookie: CG });
  dat("Màn hình quản trị 2 lớp không trả khóa / mã / bản mã", ql.status === 200 && !ql.text.includes(khoaMoi) && !ql.text.includes("v1:") && !((xn.json.maKhoiPhuc as string[] | undefined) ?? []).some((m) => ql.text.includes(m)));
  const s5 = await dn1(nvKhac.email, MAT_KHAU, ipNgauNhien());
  const dlNv = await goi(`/api/v1/nguoi-dung/${nv5.id}/dat-lai-2-lop`, { phuongThuc: "POST", cookie: phien(s5), than: { lyDo: "thử chiếm" } });
  dat("Nhân viên (không có user.update) đặt lại 2 lớp người khác → 403", dlNv.status === 403);
  const dlMinh = await goi(`/api/v1/nguoi-dung/${gd.id}/dat-lai-2-lop`, { phuongThuc: "POST", cookie: CG, than: { lyDo: "tự đặt lại" } });
  dat("Tự đặt lại 2 lớp cho chính mình → 409", dlMinh.status === 409);
  const khacTenant = await chu.user.findFirst({ where: { tenantId: { not: T }, totpEnabledAt: { not: null } } });
  if (khacTenant) {
    const dlKhac = await goi(`/api/v1/nguoi-dung/${khacTenant.id}/dat-lai-2-lop`, { phuongThuc: "POST", cookie: CG, than: { lyDo: "khác doanh nghiệp" } });
    dat("Đặt lại 2 lớp người của doanh nghiệp khác → 404, người đó vẫn giữ 2 lớp", dlKhac.status === 404 && (await chu.user.findUniqueOrThrow({ where: { id: khacTenant.id } })).totpEnabledAt !== null, String(dlKhac.status));
  }
  const dlKhongLyDo = await goi(`/api/v1/nguoi-dung/${nv5.id}/dat-lai-2-lop`, { phuongThuc: "POST", cookie: CG, than: {} });
  dat("Đặt lại 2 lớp không ghi lý do → 400", dlKhongLyDo.status === 400);
  const dl = await goi(`/api/v1/nguoi-dung/${nv5.id}/dat-lai-2-lop`, { phuongThuc: "POST", cookie: CG, than: { lyDo: "Mất điện thoại" } });
  dat("Giám đốc đặt lại 2 lớp → 200; phiên đang mở của người đó → 401", dl.status === 200 && (await goi("/api/v1/tai-khoan/2-lop", { cookie: C4 })).status === 401);
  const csrf = await goi(`/api/v1/nguoi-dung/${nvNhieu.id}/dat-lai-2-lop`, { phuongThuc: "POST", cookie: CG, than: { lyDo: "csrf" }, origin: "https://evil.test" });
  dat("Đặt lại 2 lớp từ Origin lạ → 403 (CSRF)", csrf.status === 403);

  // ------------------------------------------------------------------
  console.log("\n— 6. Vai trò bắt buộc 2 lớp (XT-06) —");
  const csCu = await goi("/api/v1/xac-thuc-2-lop", { cookie: CG });
  const datCs = await goi("/api/v1/xac-thuc-2-lop", { phuongThuc: "PUT", cookie: CG, than: { vaiTro: ["technical"] } });
  dat("Giám đốc đặt 'Kỹ thuật viên' bắt buộc 2 lớp", datCs.status === 200);
  const sTp = await dn1(tpmkt.email, MAT_KHAU, ipNgauNhien());
  dat("Trưởng phòng marketing không đổi được chính sách 2 lớp → 403", (await goi("/api/v1/xac-thuc-2-lop", { phuongThuc: "PUT", cookie: phien(sTp), than: { vaiTro: [] } })).status === 403);
  const k1 = await dn1(kt.email, MAT_KHAU, ipNgauNhien());
  const CK = phien(k1);
  const apiChan = [];
  for (const a of ["/api/v1/khach-hang", "/api/v1/thong-bao", "/api/v1/ho-tro", "/api/v1/tim-kiem?q=a", "/api/v1/tro-ly"]) {
    const r = await goi(a, { cookie: CK });
    if (!(r.status === 403 && r.json.ma === "phai-bat-2-lop")) apiChan.push(`${a}→${r.status} ${String(r.json.ma ?? "")}`);
  }
  dat("Bị bắt mà chưa bật: API nghiệp vụ → 403 phai-bat-2-lop", apiChan.length === 0, apiChan.join(", "));
  const trTo = await goi("/api/v1/tro-ly", { phuongThuc: "POST", cookie: CK, than: { cauHoi: "liệt kê khách hàng" } });
  dat("Bị bắt mà chưa bật: gọi trợ lý AI (POST) → 403", trTo.status === 403 || trTo.status === 404 || trTo.status === 405, String(trTo.status));
  const trangChan = [];
  for (const p of ["/bang-dieu-khien", "/crm/khach-hang", "/dich-vu/ho-tro"]) {
    const r = await goi(p, { cookie: CK });
    if (!(r.status === 307 && (r.location ?? "").includes("/bat-xac-thuc-2-lop"))) trangChan.push(`${p}→${r.status} ${r.location}`);
  }
  dat("Bị bắt mà chưa bật: trang hệ thống → chuyển /bat-xac-thuc-2-lop", trangChan.length === 0, trangChan.join(", "));
  dat("Bị bắt mà chưa bật: mở được trang bật 2 lớp", (await goi("/bat-xac-thuc-2-lop", { cookie: CK })).status === 200);
  dat("Bị bắt mà chưa bật: đọc trạng thái 2 lớp của mình được", (await goi("/api/v1/tai-khoan/2-lop", { cookie: CK })).status === 200);
  const bdK = await goi("/api/v1/tai-khoan/2-lop/bat-dau", { phuongThuc: "POST", cookie: CK });
  dat("Bị bắt mà chưa bật: bắt đầu bật được", bdK.status === 200 && typeof bdK.json.khoa === "string");
  const xnK = await goi("/api/v1/tai-khoan/2-lop/xac-nhan", { phuongThuc: "POST", cookie: CK, than: { ma: maTai(String(bdK.json.khoa), buocThoiGian(Date.now())) } });
  const CK2 = phien(xnK);
  dat("Bật xong: API nghiệp vụ mở lại", xnK.status === 200 && (await goi("/api/v1/khach-hang", { cookie: CK2 })).status === 200);
  const tatK = await goi("/api/v1/tai-khoan/2-lop/tat", { phuongThuc: "POST", cookie: CK2, than: { matKhau: MAT_KHAU, ma: (xnK.json.maKhoiPhuc as string[])[0] } });
  dat("Vai trò bắt buộc: không tự tắt được → 403 bat-buoc-2-lop", tatK.status === 403 && tatK.json.ma === "bat-buoc-2-lop");
  dat("Đăng xuất được", (await goi("/api/dang-xuat", { phuongThuc: "POST", cookie: CK2 })).status === 200);
  await goi("/api/v1/xac-thuc-2-lop", { phuongThuc: "PUT", cookie: CG, than: { vaiTro: (csCu.json.chinhSach as string[]) ?? [] } });

  // ------------------------------------------------------------------
  console.log("\n— 7. Kết nối email qua HTTP (EM-01, EM-02) —");
  const MK = `MkSmtpHttp-${DAU}`;
  const luu = await goi("/api/v1/email/ket-noi", { phuongThuc: "PUT", cookie: CG, than: { host: "smtp.vidu.test", port: 465, baoMat: "tls", tenDangNhap: "gui@qa.test", matKhau: MK, tenNguoiGui: "QA", emailNguoiGui: "gui@qa.test" } });
  const xem = await goi("/api/v1/email/ket-noi", { cookie: CG });
  dat("Lưu kết nối có mật khẩu → phản hồi lưu / xem không chứa mật khẩu hay bản mã", luu.status === 200 && xem.status === 200 && !luu.text.includes(MK) && !xem.text.includes(MK) && !xem.text.includes("v1:") && xem.json.ketNoi !== undefined);
  const crlf = await goi("/api/v1/email/ket-noi", { phuongThuc: "PUT", cookie: CG, than: { host: "127.0.0.1", port: CONG_SMTP, baoMat: "none", tenNguoiGui: "QA\r\nBcc: x@evil.test", emailNguoiGui: "gui@qa.test" } });
  dat("Tên người gửi có CRLF → 400", crlf.status === 400);
  const hostXau = await goi("/api/v1/email/ket-noi", { phuongThuc: "PUT", cookie: CG, than: { host: "smtp.x.test\r\nRCPT TO:<a@b>", port: 25, baoMat: "none", tenNguoiGui: "QA", emailNguoiGui: "gui@qa.test" } });
  dat("Host có CRLF → 400", hostXau.status === 400);
  const nonePw = await goi("/api/v1/email/ket-noi", { phuongThuc: "PUT", cookie: CG, than: { host: "127.0.0.1", port: CONG_SMTP, baoMat: "none", tenDangNhap: "u", tenNguoiGui: "QA", emailNguoiGui: "gui@qa.test" } });
  dat("Không mã hóa + tên đăng nhập (giữ mật khẩu cũ) → 422", nonePw.status === 422, String(nonePw.status));
  for (const [ten, ck] of [["Trưởng phòng marketing", phien(sTp)], ["Nhân viên kinh doanh", phien(s5)]] as const) {
    dat(`${ten}: GET /api/v1/email/ket-noi → 403`, (await goi("/api/v1/email/ket-noi", { cookie: ck })).status === 403);
    const tr = await goi("/quan-tri/ket-noi-email", { cookie: ck });
    const chuyen = (tr.status === 307 && (tr.location ?? "").includes("khong-co-quyen")) || (tr.status === 200 && tr.text.includes("NEXT_REDIRECT;replace;/khong-co-quyen"));
    dat(`${ten}: trang Kết nối email → khong-co-quyen, không lộ host / tài khoản SMTP`, chuyen && !tr.text.includes("smtp.vidu.test") && !tr.text.includes("gui@qa.test"), `${tr.status} ${tr.location}`);
  }
  const sTts = await dn1(tts.email, MAT_KHAU, ipNgauNhien());
  dat("Thực tập sinh marketing: tải logo → 403", (await goi("/api/v1/ho-so-cong-ty/logo", { phuongThuc: "PUT", cookie: phien(sTts), than: { tenTep: "l.png", duLieuBase64: "iVBORw0KGgoAAAAAAAAA" } })).status === 403);

  // Trỏ về SMTP giả, không đăng nhập, bật theo dõi.
  const knGia = await goi("/api/v1/email/ket-noi", { phuongThuc: "PUT", cookie: CG, than: { host: "127.0.0.1", port: CONG_SMTP, baoMat: "none", xoaMatKhau: true, tenNguoiGui: "QA HTTP", emailNguoiGui: "gui@qa.test", theoDoi: true } });
  dat("Trỏ kết nối về SMTP giả", knGia.status === 200, knGia.text.slice(0, 200));
  const guiThu = await goi("/api/v1/email/ket-noi/gui-thu", { phuongThuc: "POST", cookie: CG });
  dat("Gửi thư thử qua HTTP → thư tới đúng email của người bấm", guiThu.status === 200 && guiThu.json.ok === true && hopThu.at(-1)?.den[0] === gd.email.toLowerCase(), guiThu.text.slice(0, 200));

  // ------------------------------------------------------------------
  console.log("\n— 8. Liên kết công khai trong thư thật (EM-10, EM-11) —");
  const coDc = await chu.tenantSetting.findFirst({ where: { tenantId: T, key: "cong_ty.dia_chi" } });
  if (!coDc) await chu.tenantSetting.create({ data: { tenantId: T, key: "cong_ty.dia_chi", value: "Địa chỉ QA HTTP" } });
  const nguon = `qa-http-${DAU}`;
  const emailNhan = `nhan.${DAU}@khach.test`;
  await chu.lead.create({ data: { tenantId: T, code: `LD-QAH-${DAU}`, fullName: "Khách QA", email: emailNhan, emailNormalized: emailNhan, source: nguon, ownerId: nvKhac.id } });
  const mau = await goi("/api/v1/email/mau", {
    phuongThuc: "POST",
    cookie: CG,
    than: { ten: "Mẫu QA HTTP", tieuDe: "Chào {{ten}}", khoi: [{ loai: "doan-van", noiDung: "Xin chào" }, { loai: "nut", nhan: "Xem", url: "https://thegioitinhoc.vn/qa" }] },
  });
  const cd = await goi("/api/v1/email/chien-dich", { phuongThuc: "POST", cookie: CG, than: { ten: "QA HTTP", mauId: mau.json.id, thamSo: { doiTuong: "lead", nguon: [nguon] } } });
  const cdId = String(cd.json.id);
  const gdy = await goi(`/api/v1/email/chien-dich/${cdId}/gui-duyet`, { phuongThuc: "POST", cookie: CG });
  const dy = await goi(`/api/v1/email/chien-dich/${cdId}/duyet`, { phuongThuc: "POST", cookie: CG });
  dat("Tạo mẫu → chiến dịch → gửi duyệt → duyệt qua HTTP", mau.status === 200 && cd.status === 200 && gdy.status === 200 && dy.status === 200, [mau.status, cd.status, gdy.status, dy.status, dy.text.slice(0, 150)].join(" "));
  const truoc = hopThu.length;
  await guiLoThu(T);
  const thu = hopThu.slice(truoc).find((h) => h.den.includes(emailNhan));
  dat("Worker (guiLoThu) gửi thư qua SMTP giả", Boolean(thu));
  const raw = moThu(thu?.du ?? "");
  const goc = URL_GOC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const urlHuy = new RegExp(`List-Unsubscribe:\\s*<${goc}(/api/cong-khai/huy-nhan-tin/[A-Za-z0-9_-]+)>`).exec(raw)?.[1] ?? "";
  const urlBam = new RegExp(`${goc}(/api/cong-khai/email/bam/[A-Za-z0-9_-]+)`).exec(raw)?.[1] ?? "";
  const urlMo = new RegExp(`${goc}(/api/cong-khai/email/mo/[A-Za-z0-9_-]+)`).exec(raw)?.[1] ?? "";
  const maHuy = urlHuy.split("/").pop() ?? "";
  dat("Thư có đủ ba liên kết công khai", Boolean(urlHuy && urlBam && urlMo), JSON.stringify({ urlHuy, urlBam, urlMo }));
  const ngNhan = await chu.emailRecipient.findFirstOrThrow({ where: { campaignId: cdId, email: emailNhan } });

  const getApi = await goi(urlHuy);
  dat("GET vào đích một chạm → không huỷ (405)", getApi.status === 405 && (await chu.emailRecipient.findUniqueOrThrow({ where: { id: ngNhan.id } })).unsubscribedAt === null, String(getApi.status));
  const trangHuy = await goi(`/huy-nhan-tin/${maHuy}`);
  dat("Mở trang huỷ (GET) → 200, không huỷ, không lộ email đầy đủ", trangHuy.status === 200 && !trangHuy.text.includes(emailNhan) && (await chu.emailRecipient.findUniqueOrThrow({ where: { id: ngNhan.id } })).unsubscribedAt === null);
  const sua = maHuy.slice(0, -2) + (maHuy.at(-2) === "A" ? "B" : "A") + maHuy.at(-1);
  const rSua = await goi(`/api/cong-khai/huy-nhan-tin/${sua}`, { phuongThuc: "POST", origin: null });
  dat("POST mã sửa 1 ký tự → 404, không lộ lý do", rSua.status === 404 && !rSua.text.includes(emailNhan));
  dat("Trang huỷ với mã sửa → báo không hợp lệ, không lộ gì", !(await goi(`/huy-nhan-tin/${sua}`)).text.includes("@khach.test"));
  const motCham = await goi(urlHuy, { phuongThuc: "POST", origin: null });
  dat("POST một chạm KHÔNG có Origin (như Gmail) → 200, đã huỷ, vào danh sách chặn", motCham.status === 200 && (await chu.emailRecipient.findUniqueOrThrow({ where: { id: ngNhan.id } })).unsubscribedAt !== null && (await chu.emailSuppression.count({ where: { tenantId: T, email: emailNhan } })) === 1);
  const rBam = await goi(urlBam);
  dat("Bấm liên kết → 302 tới đúng URL trong nội dung", rBam.status === 302 && rBam.location === "https://thegioitinhoc.vn/qa", `${rBam.status} ${rBam.location}`);
  const maBam = urlBam.split("/").pop() ?? "";
  dat("Mã bấm sửa 1 ký tự → 404, không chuyển hướng", (await goi(`/api/cong-khai/email/bam/${maBam.slice(0, 10)}${maBam[10] === "A" ? "B" : "A"}${maBam.slice(11)}`)).status === 404);
  dat("Mã bấm dùng cho điểm 'huỷ' → 404", (await goi(`/api/cong-khai/huy-nhan-tin/${maBam}`, { phuongThuc: "POST", origin: null })).status === 404);
  const rMo = await goi(urlMo);
  const rMoRac = await goi("/api/cong-khai/email/mo/rac");
  dat("Điểm ảnh mở trả GIF, mã rác cũng trả GIF (không lộ gì)", rMo.status === 200 && rMo.headers.get("content-type") === "image/gif" && rMoRac.status === 200 && rMoRac.headers.get("content-type") === "image/gif");
  dat("Không có cookie phiên vẫn gọi được đường công khai (không bị proxy chặn)", motCham.status === 200 && rBam.status === 302);
  const apiCongKhaiKhac = await goi("/api/cong-khai/../v1/nguoi-dung", { phuongThuc: "POST", origin: null });
  dat("Tiền tố /api/cong-khai không mở cửa cho API khác (../v1) → không 2xx", apiCongKhaiKhac.status >= 400, String(apiCongKhaiKhac.status));
  await goi(`/api/v1/email/chien-dich/${cdId}/huy`, { phuongThuc: "POST", cookie: CG, than: { lyDo: "Dọn QA" } });

  // ------------------------------------------------------------------
  console.log("\n— 9. Rò rỉ bí mật ra log máy chủ —");
  const duongLog = process.env.THU_LOG_MAY_CHU;
  if (duongLog) {
    const log = readFileSync(duongLog, "utf8");
    const bi = [MK, khoaMoi, k.khoa, ...k.ma, ...((xn.json.maKhoiPhuc as string[] | undefined) ?? [])];
    dat("Log máy chủ không chứa mật khẩu SMTP / khóa TOTP / mã khôi phục", bi.every((b) => !log.includes(b)));
  } else console.log("  (bỏ qua: không có THU_LOG_MAY_CHU)");

  dongSmtp();
  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("QA HTTP gói E");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
