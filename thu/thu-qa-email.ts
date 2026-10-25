import net from "node:net";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { prisma, voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { bamMatKhau } from "../src/lib/xac-thuc";
import { base32Giai, BUOC_GIAY, buocThoiGian, hotp } from "../src/lib/totp";
import { maHoa } from "../src/lib/ma-hoa";
import { docKetNoiDeGui, guiThuKiemTraKetNoi, luuKetNoi, xemKetNoi } from "../src/modules/email/ket-noi";
import {
  duyetChienDich,
  guiDuyetChienDich,
  guiThuThu,
  huyChienDich,
  suaChienDich,
  taoChienDich,
  taoMau,
  tamDungChienDich,
  tiepTucChienDich,
} from "../src/modules/email/service";
import { guiLoThu } from "../src/modules/email/gui";
import { ghiBam, huyNhanTin, thongTinHuyNhanTin } from "../src/modules/email/cong-khai";
import { docMaLienKet, kyMaLienKet } from "../src/modules/email/ma-lien-ket";
import { LuocDoKetNoiEmail, LuocDoMau, LuocDoTaoChienDich } from "../src/modules/email/luoc-do";
import { bienKhongHopLe, dungThu, LuocDoKhoi, type Khoi } from "../src/modules/email/tinh-toan";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { datLogoCongTy, docLogoCongTy, LuocDoLogo } from "../src/modules/ho-so-cong-ty/service";
import {
  batDau2Lop,
  datLai2Lop,
  kiemMaDangNhap,
  luuChinhSach2Lop,
  taoLaiMaKhoiPhuc,
  tat2Lop,
  xacNhan2Lop,
  xemQuanTri2Lop,
} from "../src/modules/xac-thuc-2-lop/service";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * KIỂM THỬ ĐỐI KHÁNG (QA độc lập) cho gói E 0.16.0 — email marketing, xác thực 2 lớp, logo.
 *
 * Bài này KHÔNG nằm trong `thu:tich-hop`. Chạy: `npm run thu:qa-email`.
 * Các kiểm chứng ĐỎ là lỗi thật đã báo cho agent code — giữ nguyên để làm bài hồi quy khi sửa.
 *
 * Thư đi qua **nodemailer thật** vào một máy chủ SMTP giả (`node:net`) có thể trả mọi kiểu mã
 * lỗi SMTP ở từng bước (AUTH, MAIL FROM, RCPT TO, DATA) — vì cách nodemailer gắn `code` /
 * `command` cho lỗi quyết định cách hệ thống phân loại (khác hẳn khi dùng vận chuyển giả).
 *
 * CHỈ chạy trên cơ sở dữ liệu phát triển.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}
if (!process.env.APP_ENC_KEY) {
  console.error("Thiếu APP_ENC_KEY trong .env.");
  process.exit(1);
}
process.env.APP_URL ??= "http://localhost:3000";
const KHOA_GOC = process.env.APP_ENC_KEY;

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const MAT_KHAU = "MatKhauQa2026!";

// ---------------------------------------------------------------------------
// Máy chủ SMTP giả, trả lỗi theo kịch bản
// ---------------------------------------------------------------------------

interface ThuNhan {
  tu: string;
  den: string[];
  du: string;
}
interface KichBanSmtp {
  /** Phản hồi cho lệnh AUTH (mặc định 235). */
  auth?: string;
  /** Phản hồi cho MAIL FROM (mặc định 250). */
  mail?: string;
  /** Phản hồi cho RCPT TO theo địa chỉ; trả undefined = 250. */
  rcpt?: (dc: string) => string | undefined;
  /** Phản hồi sau khi nhận xong thân thư (mặc định 250). */
  sauData?: string;
}
const hopThu: ThuNhan[] = [];
let kichBan: KichBanSmtp = {};
const lenhAuth: string[] = [];

function dungMayChuSmtp(): Promise<{ cong: number; dong: () => void }> {
  return new Promise((ok) => {
    const s = net.createServer((sock) => {
      let dem = "";
      let trongData = false;
      let thu: ThuNhan = { tu: "", den: [], du: "" };
      const gui = (x: string) => sock.write(`${x}\r\n`);
      gui("220 may-gia-qa ESMTP");
      sock.on("data", (b) => {
        dem += b.toString("utf8");
        while (true) {
          if (trongData) {
            const ket = dem.indexOf("\r\n.\r\n");
            if (ket < 0) return;
            thu.du = dem.slice(0, ket);
            dem = dem.slice(ket + 5);
            trongData = false;
            const tl = kichBan.sauData ?? "250 OK da nhan";
            if (tl.startsWith("2")) hopThu.push(thu);
            thu = { tu: "", den: [], du: "" };
            gui(tl);
            continue;
          }
          const xd = dem.indexOf("\r\n");
          if (xd < 0) return;
          const dong = dem.slice(0, xd);
          dem = dem.slice(xd + 2);
          const lenh = dong.slice(0, 4).toUpperCase();
          if (lenh === "EHLO") gui("250-may-gia-qa\r\n250-AUTH PLAIN\r\n250-8BITMIME\r\n250 SMTPUTF8");
          else if (lenh === "HELO") gui("250 may-gia-qa");
          else if (lenh === "AUTH") {
            lenhAuth.push(dong);
            gui(kichBan.auth ?? "235 2.7.0 Accepted");
          } else if (lenh === "MAIL") {
            thu.tu = dong.slice(10);
            gui(kichBan.mail ?? "250 OK");
          } else if (lenh === "RCPT") {
            const dc = /<([^>]+)>/.exec(dong)?.[1]?.toLowerCase() ?? "";
            const tl = kichBan.rcpt?.(dc);
            if (tl) gui(tl);
            else {
              thu.den.push(dc);
              gui("250 OK");
            }
          } else if (lenh === "DATA") {
            trongData = true;
            gui("354 Ket thuc bang <CRLF>.<CRLF>");
          } else if (lenh === "RSET") {
            thu = { tu: "", den: [], du: "" };
            gui("250 OK");
          } else if (lenh === "QUIT") {
            gui("221 Tam biet");
            sock.end();
          } else gui("250 OK");
        }
      });
      sock.on("error", () => {});
    });
    s.listen(0, "127.0.0.1", () => ok({ cong: (s.address() as net.AddressInfo).port, dong: () => s.close() }));
  });
}

/** Phần HTML của thư thô (giải base64 / quoted-printable). */
function layHtml(du: string): string {
  const i = du.search(/Content-Type: text\/html/i);
  if (i < 0) return "";
  const phan = du.slice(i);
  const tach = phan.indexOf("\r\n\r\n");
  const dau = phan.slice(0, tach);
  let than = phan.slice(tach + 4);
  const ranh = than.search(/\r\n--/);
  if (ranh >= 0) than = than.slice(0, ranh);
  if (/base64/i.test(dau)) return Buffer.from(than.replace(/\s/g, ""), "base64").toString("utf8");
  if (/quoted-printable/i.test(dau)) {
    return Buffer.from(than.replace(/=\r\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1").toString("utf8");
  }
  return than;
}
const dauThu = (du: string) => du.slice(0, du.indexOf("\r\n\r\n"));

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-qa-email"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "bat-ky";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string) {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu =
      kieu === "bat-ky" ? true
      : kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}

/** Chạy, trả lỗi (nếu có) để kiểm tiếp. */
async function batLoi(khoi: () => Promise<unknown>): Promise<unknown> {
  try {
    await khoi();
    return null;
  } catch (e) {
    return e;
  }
}

const maTaiBuoc = (khoa: string, buoc: number) => hotp(base32Giai(khoa), buoc);

let hash = "";
async function nguoi(tid: string, ten: string, vai: string) {
  const role = await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tid, code: vai } } });
  return (
    await chu.user.create({
      data: {
        tenantId: tid,
        email: `${ten}.${DAU}@qa.test`,
        passwordHash: hash,
        fullName: ten,
        userRoles: { create: { tenantId: tid, roleId: role.id } },
        staffProfile: { create: { tenantId: tid } },
      },
    })
  ).id;
}

/** Bật 2 lớp cho một người qua service thật; trả khóa + mã khôi phục. */
async function bat2Lop(T: string, uid: string) {
  const bd = await voi(T, uid, (nc) => batDau2Lop(nc));
  const s = buocThoiGian(Date.now());
  const xn = await voi(T, uid, (nc) => xacNhan2Lop(nc, maTaiBuoc(bd.khoa, s - 1)));
  return { khoa: bd.khoa, maKhoiPhuc: xn.maKhoiPhuc };
}

const KHOI: Khoi[] = [
  { loai: "tieu-de", noiDung: "Chào {{ten}}" },
  { loai: "doan-van", noiDung: "Ưu đãi cho {{cong_ty}}." },
  { loai: "nut", nhan: "Xem", url: "https://thegioitinhoc.vn/khuyen-mai" },
];

/** Chạy một lô gửi trong TIẾN TRÌNH RIÊNG (giống worker thứ hai) — trả số thư đã gửi. */
function chayTienTrinhGuiLo(T: string, ms: number): Promise<number> {
  return new Promise((ok, hong) => {
    const p = spawn("npx", ["tsx", "--env-file-if-exists=.env", "thu/thu-qa-email.ts", "--gui-lo", T, String(ms)], { stdio: ["ignore", "pipe", "inherit"] });
    let ra = "";
    p.stdout.on("data", (b) => (ra += b.toString()));
    p.on("exit", () => {
      const m = /DA_GUI=(\d+)/.exec(ra);
      if (m) ok(Number(m[1]));
      else hong(new Error(`tiến trình gửi lô không trả kết quả: ${ra}`));
    });
  });
}

// Đồng hồ giả cho guiLoThu: mỗi lô cách nhau > 1 phút để giới hạn tốc độ không xen vào kịch bản.
let dongHo = Date.now();
const nhip = () => new Date((dongHo += 61_000));

async function main() {
  console.log("=== QA đối kháng gói E: email marketing, 2 lớp, logo ===\n");
  hash = await bamMatKhau(MAT_KHAU);
  const smtp = await dungMayChuSmtp();
  const tenant = await seedNenMong(chu, `qa-email-${DAU}`, "Doanh nghiệp QA email");
  const T = tenant.id;
  const tenantB = await seedNenMong(chu, `qa-email-b-${DAU}`, "Doanh nghiệp QA email B");
  const TB = tenantB.id;
  // 0.18.0: bài này kiểm luật EM / MK trước 0.18 — tắt "bắt buộc sổ đồng ý" (EG-09, mặc định bật).
  // Sổ đồng ý được kiểm riêng ở thu/thu-email-gui-lon.ts.
  for (const t of [T, TB]) await chu.tenantSetting.create({ data: { tenantId: t, key: "email.bat_buoc_dong_y", value: 0 } });

  const gd = await nguoi(T, "giam-doc", "ceo");
  const qt = await nguoi(T, "quan-tri", "admin");
  const tpmkt = await nguoi(T, "tp-mkt", "marketing-manager");
  const mkt = await nguoi(T, "mkt", "marketing");
  const tts = await nguoi(T, "tts", "marketing-intern");
  const sales = await nguoi(T, "sales", "sales");
  const kyThuat = await nguoi(T, "ky-thuat", "technical");
  const ai = await nguoi(T, "tro-ly", "ai-assistant");
  const gdB = await nguoi(TB, "giam-doc-b", "ceo");
  await chu.tenantSetting.create({ data: { tenantId: T, key: "cong_ty.dia_chi", value: "1 Đường QA, Quận 1, TP.HCM" } });
  console.log("");

  // ==================================================================
  console.log("— A. Xác thực 2 lớp: cửa sổ mã, phát lại, song song —");
  const u2 = await nguoi(T, "nv-2lop", "sales");
  const k2 = await bat2Lop(T, u2);
  const kiem = (uid: string, m: string) => voiTenant(T, (tx) => kiemMaDangNhap(tx, uid, m));
  const s0 = buocThoiGian(Date.now());
  // Bước s0-1 đã dùng để bật → mọi mã ≤ s0-1 bị từ chối.
  dat("Mã của bước đã dùng lúc bật (s-1) không dùng lại được", (await kiem(u2, maTaiBuoc(k2.khoa, s0 - 1))) === null);
  dat("Mã cách 2 bước về trước (−60 giây) bị từ chối — cửa sổ chỉ ±1 bước", (await kiem(u2, maTaiBuoc(k2.khoa, s0 - 2))) === null);
  dat("Mã cách 2 bước về sau (+60 giây) bị từ chối", (await kiem(u2, maTaiBuoc(k2.khoa, s0 + 2))) === null);
  dat("Mã bước hiện tại dùng được", (await kiem(u2, maTaiBuoc(k2.khoa, s0))) === "totp");
  dat("Cùng mã đó lần hai bị từ chối (chặn phát lại)", (await kiem(u2, maTaiBuoc(k2.khoa, s0))) === null);
  dat("Mã của bước +1 vẫn dùng được (đồng hồ lệch)", (await kiem(u2, maTaiBuoc(k2.khoa, s0 + 1))) === "totp");
  dat("Sau khi dùng bước +1, mã bước hiện tại (cũ hơn) bị từ chối", (await kiem(u2, maTaiBuoc(k2.khoa, s0))) === null);
  dat("Mã 6 số có khoảng trắng / 7 số / chữ cái → từ chối, không ném lỗi", (await kiem(u2, "12 34 5")) === null && (await kiem(u2, "1234567")) === null && (await kiem(u2, "abcdef")) === null);

  const u3 = await nguoi(T, "nv-2lop-ss", "sales");
  const k3 = await bat2Lop(T, u3);
  const s1 = buocThoiGian(Date.now());
  const songSong = await Promise.all([kiem(u3, maTaiBuoc(k3.khoa, s1)), kiem(u3, maTaiBuoc(k3.khoa, s1)), kiem(u3, maTaiBuoc(k3.khoa, s1))]);
  dat("Ba yêu cầu song song cùng một mã TOTP → chỉ một yêu cầu thắng", songSong.filter((x) => x === "totp").length === 1, JSON.stringify(songSong));
  const mkp = k3.maKhoiPhuc[0];
  const songSongKp = await Promise.all([kiem(u3, mkp), kiem(u3, mkp), kiem(u3, mkp.toLowerCase())]);
  dat("Ba yêu cầu song song cùng một mã khôi phục → chỉ một yêu cầu thắng", songSongKp.filter((x) => x === "khoi-phuc").length === 1, JSON.stringify(songSongKp));
  dat("Mã khôi phục dùng lần hai bị từ chối", (await kiem(u3, mkp)) === null);
  dat("Mã khôi phục 6 ký tự số (đoán như TOTP) không đi nhánh mã khôi phục", (await kiem(u3, "000000")) === null);

  // XT-02: chép khóa mã hóa của người này sang người khác không giải được (AAD theo người).
  const u4 = await nguoi(T, "nv-2lop-chep", "sales");
  await bat2Lop(T, u4);
  const dongU3 = await chu.user.findUniqueOrThrow({ where: { id: u3 } });
  await chu.user.update({ where: { id: u4 }, data: { totpSecretEnc: dongU3.totpSecretEnc, totpLastStep: null } });
  const loiChep = await batLoi(async () => {
    const kq = await kiem(u4, maTaiBuoc(k3.khoa, buocThoiGian(Date.now()) + 1));
    if (kq) throw new Error("GIẢI ĐƯỢC");
  });
  dat("XT-02: khóa TOTP chép sang người khác không giải ra mã hợp lệ (AAD)", !(loiChep instanceof Error && loiChep.message === "GIẢI ĐƯỢC"));

  // ------------------------------------------------------------------
  console.log("\n— A2. 2 lớp: lộ bí mật qua API / nhật ký / sự kiện —");
  const u5 = await nguoi(T, "nv-2lop-lo", "sales");
  const bd5 = await voi(T, u5, (nc) => batDau2Lop(nc));
  const xn5 = await voi(T, u5, (nc) => xacNhan2Lop(nc, maTaiBuoc(bd5.khoa, buocThoiGian(Date.now()))));
  const moi5 = await voi(T, u5, (nc) => taoLaiMaKhoiPhuc(nc, xn5.maKhoiPhuc[0]));
  await voi(T, u5, (nc) => tat2Lop(nc, MAT_KHAU, moi5.maKhoiPhuc[0]));
  const qtView = await voi(T, gd, (nc) => xemQuanTri2Lop(nc));
  const tatCaMa = [bd5.khoa, ...xn5.maKhoiPhuc, ...moi5.maKhoiPhuc, ...xn5.maKhoiPhuc.map((m) => m.replace("-", "")), ...moi5.maKhoiPhuc.map((m) => m.replace("-", ""))];
  const chuoiNhatKy = JSON.stringify(await chu.auditLog.findMany({ where: { tenantId: T } })) + JSON.stringify(await chu.businessEvent.findMany({ where: { tenantId: T } })) + JSON.stringify(await chu.notification.findMany({ where: { tenantId: T } }));
  dat("Khóa TOTP và mã khôi phục không xuất hiện trong audit_logs / business_events / notifications", tatCaMa.every((m) => !chuoiNhatKy.includes(m)));
  dat("Màn hình quản trị 2 lớp không trả khóa / mã / bản mã hóa", tatCaMa.every((m) => !JSON.stringify(qtView).includes(m)) && !JSON.stringify(qtView).includes("v1:"));

  // ------------------------------------------------------------------
  console.log("\n— A3. 2 lớp: thử mã không giới hạn trong phiên (sinh lại mã khôi phục / tắt) —");
  const u6 = await nguoi(T, "nv-2lop-do", "sales");
  const k6 = await bat2Lop(T, u6);
  await chu.user.update({ where: { id: u6 }, data: { failedLoginCount: 0, lockedUntil: null } });
  let soLanBiTuChoi = 0;
  for (let i = 0; i < 12; i++) {
    const e = await batLoi(() => voi(T, u6, (nc) => taoLaiMaKhoiPhuc(nc, String(100000 + i))));
    if (e instanceof LoiNghiepVu && e.ma === "sai-ma") soLanBiTuChoi++;
  }
  for (let i = 0; i < 6; i++) await batLoi(() => voi(T, u6, (nc) => tat2Lop(nc, MAT_KHAU, String(200000 + i))));
  const sau6 = await chu.user.findUniqueOrThrow({ where: { id: u6 } });
  dat(
    "ĐỎ: đoán mã 18 lần qua 'sinh lại mã khôi phục' / 'tắt 2 lớp' phải bị khóa hoặc chặn tốc độ như bước đăng nhập (XT-05)",
    soLanBiTuChoi === 12 && (sau6.lockedUntil !== null || sau6.failedLoginCount > 0),
    `12/12 lần sai đều chỉ trả 'sai-ma', failedLoginCount=${sau6.failedLoginCount}, lockedUntil=${sau6.lockedUntil?.toISOString() ?? null} — người cầm phiên lấy cắp dò được mã (≈333k lần) để sinh mã khôi phục mới`,
  );
  void k6;

  // ------------------------------------------------------------------
  console.log("\n— A4. 2 lớp: phân quyền, chính sách, cách ly —");
  for (const [ten, uid] of [["Trưởng phòng Marketing", tpmkt], ["Kỹ thuật", kyThuat], ["Thực tập sinh marketing", tts], ["Trợ lý AI", ai]] as const) {
    await nemLoi(`${ten} không đổi được chính sách bắt buộc 2 lớp`, "quyen", () => voi(T, uid, (nc) => luuChinhSach2Lop(nc, ["sales"])));
    await nemLoi(`${ten} không đặt lại 2 lớp người khác`, "quyen", () => voi(T, uid, (nc) => datLai2Lop(nc, u2, "thử")));
  }
  await nemLoi("Quản trị (admin) cũng không tự đặt lại 2 lớp cho chính mình", "nghiep-vu", async () => {
    await bat2Lop(T, qt);
    await voi(T, qt, (nc) => datLai2Lop(nc, qt, "tự đặt lại"));
  }, "khong-tu-dat-lai");
  await nemLoi("Đặt lại 2 lớp: id người thuộc doanh nghiệp B → không tìm thấy", "khong-thay", () => voi(T, gd, (nc) => datLai2Lop(nc, gdB, "khác tenant")));
  await nemLoi("Đặt lại 2 lớp không ghi lý do → Zod chặn ở API (service nhận lyDo rỗng?)", "bat-ky", async () => {
    const { LuocDoDatLai2Lop } = await import("../src/modules/xac-thuc-2-lop/service");
    LuocDoDatLai2Lop.parse({ lyDo: " " });
  });

  // ==================================================================
  console.log("\n— B. Bí mật SMTP —");
  const MK_SMTP = `MkSmtpQa-${DAU}-${randomBytes(4).toString("hex")}`;
  await voi(T, gd, (nc) =>
    luuKetNoi(nc, LuocDoKetNoiEmail.parse({ host: "smtp.vidu.test", port: 465, baoMat: "tls", tenDangNhap: "gui@qa.test", matKhau: MK_SMTP, tenNguoiGui: "QA", emailNguoiGui: "gui@qa.test" })),
  );
  const knA = await chu.emailSetting.findFirstOrThrow({ where: { tenantId: T } });
  // AUTH qua máy chủ giả (đặt thẳng CSDL: none + tên đăng nhập để không cần TLS trong bài thử).
  await chu.emailSetting.update({ where: { id: knA.id }, data: { host: "127.0.0.1", port: smtp.cong, security: "none" } });
  kichBan = { auth: "535 5.7.8 Username and Password not accepted" };
  const kqAuth = await voi(T, gd, (nc) => guiThuKiemTraKetNoi(nc));
  dat("Sai mật khẩu SMTP (535) → thư thử báo lỗi đăng nhập rõ ràng", !kqAuth.ok && /đăng nhập|535/i.test(kqAuth.loi ?? ""), JSON.stringify(kqAuth));
  dat("Máy chủ SMTP nhận đúng mật khẩu đã giải mã (AUTH PLAIN)", lenhAuth.some((l) => Buffer.from(l.split(" ")[2] ?? "", "base64").toString("utf8").includes(MK_SMTP)));
  kichBan = {};
  const knSau = await chu.emailSetting.findFirstOrThrow({ where: { tenantId: T } });
  const chuoiB = JSON.stringify(kqAuth) + JSON.stringify(knSau.lastTestError) + JSON.stringify(await chu.auditLog.findMany({ where: { tenantId: T } })) + JSON.stringify(await chu.businessEvent.findMany({ where: { tenantId: T } }));
  dat("Mật khẩu SMTP (thuần lẫn bản mã) không có trong phản hồi lỗi / last_test_error / audit / sự kiện", !chuoiB.includes(MK_SMTP) && !chuoiB.includes(knA.passwordEnc!));
  const xemKn = await voi(T, gd, (nc) => xemKetNoi(nc));
  dat("xemKetNoi chỉ trả cờ coMatKhau", xemKn.ketNoi.coMatKhau === true && !JSON.stringify(xemKn).includes("v1:"));

  // AAD: chép bản mã của A sang B.
  await voi(TB, gdB, (nc) =>
    luuKetNoi(nc, LuocDoKetNoiEmail.parse({ host: "smtp.b.test", port: 465, baoMat: "tls", tenDangNhap: "b@b.test", matKhau: "MatKhauCuaB", tenNguoiGui: "B", emailNguoiGui: "b@b.test" })),
  );
  await chu.emailSetting.updateMany({ where: { tenantId: TB }, data: { passwordEnc: knA.passwordEnc } });
  const giaiB = await batLoi(async () => {
    const kn = await voiTenant(TB, (tx) => docKetNoiDeGui(tx, TB));
    if (kn?.smtp.matKhau === MK_SMTP) throw new Error("GIẢI ĐƯỢC");
  });
  dat("AAD: bản mã mật khẩu của doanh nghiệp A chép sang B không giải ra mật khẩu A", !(giaiB instanceof Error && giaiB.message === "GIẢI ĐƯỢC"));
  const thuB = await batLoi(() => voi(TB, gdB, (nc) => guiThuKiemTraKetNoi(nc)));
  dat(
    "ĐỎ: bản mã hỏng / khác khóa → thư thử báo lỗi nghiệp vụ rõ (LoiNghiepVu), không thành 500 'Hệ thống gặp lỗi'",
    thuB === null || thuB instanceof LoiNghiepVu,
    thuB instanceof Error ? `${thuB.name}: ${thuB.message}` : String(thuB),
  );

  // APP_ENC_KEY bị đổi (xoay khóa sai) hoặc mất.
  process.env.APP_ENC_KEY = randomBytes(32).toString("base64");
  const loiKhoaSai = await batLoi(() => voi(T, gd, (nc) => guiThuKiemTraKetNoi(nc)));
  dat(
    "ĐỎ: APP_ENC_KEY sai → thư thử báo 'khóa mã hóa không khớp' rõ ràng (LoiNghiepVu), không ném lỗi giải mã thô",
    loiKhoaSai instanceof LoiNghiepVu,
    loiKhoaSai instanceof Error ? `${loiKhoaSai.name}: ${loiKhoaSai.message}` : String(loiKhoaSai),
  );
  dat("APP_ENC_KEY sai: lỗi không chứa mật khẩu hay bản mã", !(loiKhoaSai instanceof Error) || (!loiKhoaSai.message.includes(MK_SMTP) && !loiKhoaSai.message.includes(knA.passwordEnc!)));
  const loi2LopKhoaSai = await batLoi(() => kiem(u2, "123456"));
  dat(
    "ĐỎ: APP_ENC_KEY sai → bước 2 đăng nhập trả lỗi có kiểm soát, không ném lỗi giải mã (route /api/dang-nhap/2-lop thành 500)",
    loi2LopKhoaSai === null || loi2LopKhoaSai instanceof LoiNghiepVu,
    loi2LopKhoaSai instanceof Error ? `${loi2LopKhoaSai.name}: ${loi2LopKhoaSai.message}` : String(loi2LopKhoaSai),
  );
  delete process.env.APP_ENC_KEY;
  await nemLoi("Thiếu APP_ENC_KEY → lưu mật khẩu SMTP báo 503 'chua-co-khoa-ma-hoa'", "nghiep-vu", () =>
    voi(T, gd, (nc) => luuKetNoi(nc, LuocDoKetNoiEmail.parse({ host: "smtp.vidu.test", port: 465, baoMat: "tls", tenDangNhap: "gui@qa.test", matKhau: "x", tenNguoiGui: "QA", emailNguoiGui: "gui@qa.test" }))),
  "chua-co-khoa-ma-hoa");
  await nemLoi("Thiếu APP_ENC_KEY → bật 2 lớp báo 503 'chua-co-khoa-ma-hoa'", "nghiep-vu", () => voi(T, sales, (nc) => batDau2Lop(nc)), "chua-co-khoa-ma-hoa");
  const loiThieuKhoa = await batLoi(() => voi(T, gd, (nc) => guiThuKiemTraKetNoi(nc)));
  dat(
    "ĐỎ: thiếu APP_ENC_KEY mà đã lưu mật khẩu → thư thử báo LoiNghiepVu rõ (không 500)",
    loiThieuKhoa instanceof LoiNghiepVu,
    loiThieuKhoa instanceof Error ? `${loiThieuKhoa.name}: ${loiThieuKhoa.message}` : String(loiThieuKhoa),
  );
  process.env.APP_ENC_KEY = KHOA_GOC;
  // Trả kết nối A về máy chủ giả, không đăng nhập, bật theo dõi.
  await chu.emailSetting.update({ where: { id: knA.id }, data: { host: "127.0.0.1", port: smtp.cong, security: "none", username: null, passwordEnc: null, trackingEnabled: true } });

  // ==================================================================
  console.log("\n— C. Nội dung thư: tiêm HTML / biến / URL / CRLF —");
  const bienMau = { ten: "<script>alert(1)</script>", cong_ty: `"><img src=x onerror=alert(2)>`, email: "x@y.vn", cong_ty_gui: "A&B <Cty>" };
  const thuTiem = dungThu("Chào {{ten}}", [...KHOI, { loai: "anh", url: "https://a.vn/x.png", moTa: `"><script>alert(3)</script>`, lienKet: "" }], bienMau, { tenCongTy: "<b>Cty</b>", diaChi: "<i>DC</i>", lienKetHuy: "https://a.vn/h" });
  dat("Tên / công ty / mô tả ảnh / chân thư chứa thẻ → bị thoát, không có <script> hay <img src=x>", !/<script/i.test(thuTiem.html) && !/<img src=x/i.test(thuTiem.html) && !/<b>Cty/.test(thuTiem.html) && thuTiem.html.includes("&lt;script&gt;"));
  dat("Tiêu đề thư dựng từ tên chứa thẻ: giữ nguyên chữ, không dòng mới", !/[\r\n]/.test(thuTiem.tieuDe));
  const thuLong = dungThu("{{ten}}", [{ loai: "doan-van", noiDung: "Xin chào {{ten}}" }], { ...bienMau, ten: "{{email}} {{cong_ty_gui}}" }, { tenCongTy: "C", diaChi: "D", lienKetHuy: "#" });
  dat("Giá trị biến chứa '{{email}}' không bị thay tiếp (không lộ email qua tên)", !thuLong.html.includes("x@y.vn") && thuLong.html.includes("{{email}}"));
  dat("Biến lồng '{{ {{ten}} }}' không làm hỏng lược đồ", LuocDoMau.safeParse({ ten: "Mẫu", tieuDe: "A {{ {{ten}} }}", khoi: KHOI }).success);
  dat("Biến viết hoa {{TEN}} / biến lạ {{mat_khau}} bị từ chối", bienKhongHopLe("{{TEN}} {{mat_khau}}").length === 2);
  for (const bien of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    const kq = LuocDoMau.safeParse({ ten: "Mẫu", tieuDe: `Xin chào {{${bien}}}`, khoi: KHOI });
    const ra = dungThu(`X {{${bien}}}`, [{ loai: "doan-van", noiDung: "a" }], bienMau, { tenCongTy: "C", diaChi: "D", lienKetHuy: "#" }).tieuDe;
    dat(`ĐỎ: EM-04 biến {{${bien}}} (thuộc tính Object.prototype) phải bị từ chối lúc lưu`, !kq.success, `lược đồ nhận; thư dựng ra tiêu đề: "${ra.slice(0, 60)}"`);
  }
  const urlXau = ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x", "http://a.vn", "//evil.test/x", "https://u:p@a.vn", "https://a.vn/{{ten}}", "https://a.vn/ x"];
  for (const u of urlXau) {
    dat(`URL nút '${u}' bị từ chối`, !LuocDoKhoi.safeParse({ loai: "nut", nhan: "x", url: u }).success && !LuocDoKhoi.safeParse({ loai: "anh", url: u, moTa: "" }).success);
  }
  const nutNhay = LuocDoKhoi.safeParse({ loai: "nut", nhan: "x", url: `https://a.vn/"onmouseover="alert(1)` });
  if (nutNhay.success) {
    const h = dungThu("t", [nutNhay.data], bienMau, { tenCongTy: "C", diaChi: "D", lienKetHuy: "#" }).html;
    dat("URL https có dấu nháy → được mã hóa / thoát, không thoát khỏi thuộc tính href", !h.includes(`"onmouseover`) && !h.includes(`" onmouseover`));
  } else dat("URL https có dấu nháy bị từ chối", true);

  // CRLF / chèn người nhận qua tên lead — gửi thật qua nodemailer.
  const lCrlf = await chu.lead.create({
    data: {
      tenantId: T,
      code: `LD-QA${DAU}-crlf`,
      fullName: "Khách\r\nBcc: ke-gian@evil.test\r\nX-Chen: 1",
      companyName: "Cty\r\nCc: ke-gian2@evil.test",
      email: `crlf.${DAU}@khach.test`,
      emailNormalized: `crlf.${DAU}@khach.test`,
      source: "qa-crlf",
      ownerId: sales,
    },
  });
  await chu.lead.create({
    data: {
      tenantId: T,
      code: `LD-QA${DAU}-ten-dc`,
      fullName: `Ke Gian <ke-gian3@evil.test>, ke-gian4@evil.test`,
      companyName: "<script>alert(1)</script>",
      email: `tendc.${DAU}@khach.test`,
      emailNormalized: `tendc.${DAU}@khach.test`,
      source: "qa-crlf",
      ownerId: sales,
    },
  });
  const mauCrlf = await voi(T, mkt, (nc) => taoMau(nc, LuocDoMau.parse({ ten: "Mẫu CRLF", tieuDe: "Chào {{ten}} – {{cong_ty}}", khoi: KHOI })));
  const cdCrlf = await voi(T, mkt, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "QA CRLF", mauId: mauCrlf.id, thamSo: { doiTuong: "lead", nguon: ["qa-crlf"] } })));
  await voi(T, mkt, (nc) => guiDuyetChienDich(nc, cdCrlf.id));
  await voi(T, tpmkt, (nc) => duyetChienDich(nc, cdCrlf.id));
  const truocCrlf = hopThu.length;
  await guiLoThu(T, nhip());
  const thuCrlf = hopThu.slice(truocCrlf);
  const tatCaRcpt = thuCrlf.flatMap((t) => t.den);
  dat("Tên / công ty chứa CRLF + 'Bcc:' không thêm người nhận nào (RCPT chỉ có địa chỉ thật)", thuCrlf.length === 2 && tatCaRcpt.every((d) => d.endsWith("@khach.test")), JSON.stringify(tatCaRcpt));
  dat("Không có dòng tiêu đề Bcc / Cc / X-Chen bị chèn", thuCrlf.every((t) => !/^(Bcc|Cc|X-Chen):/im.test(dauThu(t.du))));
  const htmlCrlf = thuCrlf.map((t) => layHtml(t.du)).join("\n");
  dat("Thư thật: tên công ty '<script>' bị thoát trong HTML", htmlCrlf.length > 0 && !/<script/i.test(htmlCrlf), htmlCrlf.slice(0, 120));
  void lCrlf;

  // ==================================================================
  console.log("\n— D. Liên kết công khai: huỷ nhận tin / mở / bấm —");
  const r0 = await chu.emailRecipient.findFirstOrThrow({ where: { campaignId: cdCrlf.id, status: "SENT" } });
  const maH = kyMaLienKet("huy", T, r0.id);
  const sua1 = (s: string, i: number) => s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1);
  dat("Sửa 1 ký tự phần chữ ký → mã bị từ chối", docMaLienKet(sua1(maH, maH.length - 3), "huy") === null);
  dat("Sửa 1 ký tự phần id người nhận → mã bị từ chối", docMaLienKet(sua1(maH, 30), "huy") === null);
  dat("Mã đúng nhưng cắt bớt 1 ký tự → từ chối", docMaLienKet(maH.slice(0, -1), "huy") === null);
  // Ghi chú: thêm 1 ký tự cuối vẫn giải ra đúng 51 byte (base64 bỏ 6 bit thừa) → cùng người nhận. Không phải giả mạo.
  dat("Mã ký bằng khóa khác → từ chối", docMaLienKet(kyMaLienKet("huy", T, r0.id, 0, randomBytes(32)), "huy") === null);
  const tt0 = await thongTinHuyNhanTin(maH);
  dat("Mở trang huỷ (GET) không đổi trạng thái và không lộ email", (await chu.emailRecipient.findUniqueOrThrow({ where: { id: r0.id } })).unsubscribedAt === null && !JSON.stringify(tt0).includes(r0.email));
  dat("Mã huỷ của người nhận này không đụng người nhận khác cùng chiến dịch", (await huyNhanTin(maH, { ip: null, userAgent: null })) && (await chu.emailRecipient.count({ where: { campaignId: cdCrlf.id, unsubscribedAt: { not: null } } })) === 1);
  dat("Chỉ số liên kết 65535 → không chuyển", (await ghiBam(kyMaLienKet("bam", T, r0.id, 65535), { ip: null, userAgent: null })) === null);
  dat("Mã 'bam' dùng làm 'huy' → từ chối", !(await huyNhanTin(kyMaLienKet("bam", T, r0.id, 0), { ip: null, userAgent: null })));

  // ==================================================================
  console.log("\n— E. Gửi: phân loại lỗi SMTP (nodemailer thật) —");
  let soKb = 0;
  async function taoKb(soNguoi: number) {
    const nguon = `qa-kb-${++soKb}`;
    const emails: string[] = [];
    for (let i = 0; i < soNguoi; i++) {
      const e = `kb${soKb}-${i}.${DAU}@nhan.test`;
      emails.push(e);
      await chu.lead.create({ data: { tenantId: T, code: `LD-QA${DAU}-${soKb}-${i}`, fullName: `Người ${i}`, email: e, emailNormalized: e, source: nguon, ownerId: sales } });
    }
    const cd = await voi(T, mkt, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: `KB ${soKb}`, mauId: mauCrlf.id, thamSo: { doiTuong: "lead", nguon: [nguon] } })));
    await voi(T, mkt, (nc) => guiDuyetChienDich(nc, cd.id));
    await voi(T, tpmkt, (nc) => duyetChienDich(nc, cd.id));
    return { cd, emails };
  }
  async function kichBanGui(soNguoi: number, kb: KichBanSmtp) {
    const { cd, emails } = await taoKb(soNguoi);
    kichBan = kb;
    const lo = await guiLoThu(T, nhip());
    kichBan = {};
    const dong = await chu.emailRecipient.findMany({ where: { campaignId: cd.id } });
    const c = await chu.emailCampaign.findUniqueOrThrow({ where: { id: cd.id } });
    const chan = await chu.emailSuppression.findMany({ where: { tenantId: T, email: { in: emails } } });
    return { cd, lo, dong, c, chan, emails };
  }
  async function donDep(id: string) {
    const c = await chu.emailCampaign.findUniqueOrThrow({ where: { id } });
    if (["SENDING", "PAUSED", "DRAFT", "PENDING_APPROVAL"].includes(c.status)) await voi(T, gd, (nc) => huyChienDich(nc, id, "Dọn kịch bản QA"));
  }

  const e1 = await kichBanGui(3, { rcpt: (dc) => (dc.startsWith("kb1-1.") ? "550 5.1.1 <user> User unknown" : undefined) });
  dat("550 5.1.1 ở RCPT: đúng người đó Lỗi + vào danh sách chặn 'email-hong'", e1.chan.length === 1 && e1.chan[0].email === e1.emails[1] && e1.chan[0].reason === "email-hong", JSON.stringify(e1.chan.map((c) => c.email)));
  dat("550 5.1.1: hai người còn lại vẫn nhận thư, không bị chặn", e1.dong.filter((d) => d.status === "SENT").length === 2);
  await donDep(e1.cd.id);

  const e2 = await kichBanGui(3, { rcpt: () => "550 5.4.5 Daily user sending quota exceeded" });
  dat(
    "ĐỎ: 550 5.4.5 'quota exceeded' ở RCPT là lỗi của HỘP THƯ GỬI — KHÔNG được đưa người nhận vào danh sách chặn",
    e2.chan.length === 0,
    `${e2.chan.length}/3 người nhận bị chặn vĩnh viễn 'email-hong': ${e2.chan.map((c) => c.note).join(" | ").slice(0, 160)}`,
  );
  dat(
    "ĐỎ: 550 5.4.5 quota → chiến dịch tự tạm dừng, thư trả về hàng chờ (không đốt cả danh sách thành Lỗi)",
    e2.c.status === "PAUSED" && e2.dong.every((d) => d.status === "QUEUED"),
    `trạng thái chiến dịch ${e2.c.status}; người nhận: ${e2.dong.map((d) => d.status).join(",")}`,
  );
  await donDep(e2.cd.id);

  const e3 = await kichBanGui(3, { mail: "550 5.4.5 Daily user sending limit exceeded. For more information, visit https://support.google.com" });
  dat(
    "ĐỎ: 550 5.4.5 ở MAIL FROM (Gmail hết hạn mức) — KHÔNG chặn người nhận",
    e3.chan.length === 0,
    `${e3.chan.length}/3 người nhận bị chặn 'email-hong' (nodemailer gắn code=EENVELOPE cho lỗi MAIL FROM → bị coi như lỗi RCPT)`,
  );
  dat(
    "ĐỎ: lỗi ở MAIL FROM (hộp thư gửi bị từ chối) → tạm dừng chiến dịch, trả thư về hàng chờ",
    e3.c.status === "PAUSED" && e3.dong.every((d) => d.status === "QUEUED"),
    `trạng thái ${e3.c.status}; người nhận: ${e3.dong.map((d) => d.status).join(",")}`,
  );
  await donDep(e3.cd.id);

  const e4 = await kichBanGui(3, { rcpt: () => "550 5.7.1 Sender not authorized to relay (SPF fail)" });
  dat("ĐỎ: 550 5.7.1 (chính sách / SPF của BÊN GỬI) ở RCPT — KHÔNG chặn người nhận", e4.chan.length === 0, `${e4.chan.length}/3 bị chặn`);
  await donDep(e4.cd.id);

  const e5 = await kichBanGui(3, { rcpt: () => "451 4.7.1 Rate limit exceeded, try again later" });
  dat("451 4.7.1 (tạm thời) ở RCPT — không chặn người nhận", e5.chan.length === 0);
  dat(
    "ĐỎ: 451 4.7.1 'rate limit' ở RCPT cho mọi người → không biến cả lô thành Lỗi vĩnh viễn (phải tạm dừng / trả hàng chờ)",
    !e5.dong.every((d) => d.status === "FAILED"),
    `người nhận: ${e5.dong.map((d) => d.status).join(",")}; chiến dịch ${e5.c.status}`,
  );
  await donDep(e5.cd.id);

  const e6 = await kichBanGui(3, { mail: "451 4.3.2 Mailbox temporarily over quota, try later" });
  dat(
    "ĐỎ: 4xx ở MAIL FROM (lỗi tạm thời của hộp thư gửi) → tạm dừng + trả hàng chờ, không ghi Lỗi",
    e6.c.status === "PAUSED" && e6.dong.every((d) => d.status === "QUEUED"),
    `trạng thái ${e6.c.status}; người nhận: ${e6.dong.map((d) => d.status).join(",")}`,
  );
  await donDep(e6.cd.id);

  const e7 = await kichBanGui(2, { sauData: "451 4.7.0 Temporary server error" });
  dat("4xx sau DATA → tạm dừng chiến dịch, thư về hàng chờ (đúng EM-13)", e7.c.status === "PAUSED" && e7.dong.every((d) => d.status === "QUEUED"), `${e7.c.status} ${e7.dong.map((d) => d.status).join(",")}`);
  await donDep(e7.cd.id);

  const e8 = await kichBanGui(2, { rcpt: () => "552 5.2.2 Mailbox full" });
  dat("552 5.2.2 hộp thư đầy → Lỗi nhưng không chặn vĩnh viễn", e8.chan.length === 0 && e8.dong.every((d) => d.status === "FAILED"));
  await donDep(e8.cd.id);

  // 535 trong lúc gửi chiến dịch → tạm dừng; lý do / thông báo không chứa mật khẩu.
  const MK2 = `MkHai-${DAU}`;
  await chu.emailSetting.update({ where: { id: knA.id }, data: { username: "gui@qa.test", passwordEnc: maHoa(MK2, `smtp:${T}`) } });
  const e9 = await kichBanGui(2, { auth: "535 5.7.8 Authentication credentials invalid" });
  dat("535 khi gửi chiến dịch → tự tạm dừng, thư về hàng chờ", e9.lo.tamDung && e9.c.status === "PAUSED" && e9.dong.every((d) => d.status === "QUEUED"));
  const tb9 = await chu.notification.findMany({ where: { tenantId: T, objectId: e9.cd.id } });
  dat("Lý do tạm dừng / thông báo không chứa mật khẩu SMTP", tb9.length > 0 && !JSON.stringify(tb9).includes(MK2) && !(e9.c.pauseReason ?? "").includes(MK2));
  await chu.emailSetting.update({ where: { id: knA.id }, data: { username: null, passwordEnc: null } });
  await donDep(e9.cd.id);

  // ==================================================================
  console.log("\n— E2. Gửi: lọc người nhận lúc duyệt —");
  const ng = "qa-loc";
  const tao = (ten: string, email: string | null, them: Record<string, unknown> = {}) =>
    chu.lead.create({ data: { tenantId: T, code: `LD-QA${DAU}-loc-${ten}`, fullName: ten, email, emailNormalized: email?.toLowerCase().trim() ?? null, source: ng, ownerId: sales, ...them } });
  await tao("hop-le", `hople.${DAU}@loc.test`);
  await tao("trung-hoa", `HOPLE.${DAU}@LOC.TEST`);
  await tao("sai1", "abc@khongcotld");
  await tao("sai2", "a b@loc.test");
  await tao("sai3", `x.${DAU}@loc.test\r\nBcc: a@evil.test`);
  await tao("tu-choi", `tuchoi.${DAU}@loc.test`, { marketingOptOutAt: new Date() });
  await tao("chan", `chan.${DAU}@loc.test`);
  await chu.emailSuppression.create({ data: { tenantId: T, email: `chan.${DAU}@loc.test`, reason: "huy-nhan-tin" } });
  await tao("chan-hoa", `Chan.${DAU}@Loc.Test`, { emailNormalized: null, phone: "0909000999", phoneNormalized: "0909000999" });
  const cdLoc = await voi(T, mkt, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "QA lọc", mauId: mauCrlf.id, thamSo: { doiTuong: "lead", nguon: [ng] } })));
  await voi(T, mkt, (nc) => guiDuyetChienDich(nc, cdLoc.id));
  const dLoc = await voi(T, tpmkt, (nc) => duyetChienDich(nc, cdLoc.id));
  const qLoc = await chu.emailRecipient.findMany({ where: { campaignId: cdLoc.id, status: "QUEUED" } });
  dat("Lọc lúc duyệt: chỉ 1 người hợp lệ (trùng hoa/thường, sai dạng, CRLF, đã từ chối, danh sách chặn — kể cả viết hoa — đều bị loại)", qLoc.length === 1 && qLoc[0].email === `hople.${DAU}@loc.test`, JSON.stringify({ q: qLoc.map((q) => q.email), tomTat: dLoc.tomTat }));
  await voi(T, gd, (nc) => huyChienDich(nc, cdLoc.id, "Dọn"));

  // ==================================================================
  console.log("\n— E3. Gửi: nhiều worker song song (tiến trình riêng, pool CSDL riêng) —");
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "email.so_thu_moi_phut": 3 } }));
  const ss = await taoKb(30);
  const truocSS = hopThu.length;
  const vuot: string[] = [];
  for (let lan = 0; lan < 4; lan++) {
    const t = nhip().getTime();
    const ra = await Promise.all([0, 1, 2].map(() => chayTienTrinhGuiLo(T, t)));
    const tong = ra.reduce((a, b) => a + b, 0);
    if (tong > 3) vuot.push(`lần ${lan + 1}: ${ra.join("+")}=${tong}`);
  }
  dat(
    "ĐỎ: ba worker (ba tiến trình) cùng phút không vượt tốc độ 3 thư/phút (EM-14: 'chạy hai worker cũng không vượt ngưỡng')",
    vuot.length === 0,
    vuot.join("; "),
  );
  const daGuiSS = hopThu.slice(truocSS);
  dat("Nhiều worker song song: không người nhận nào nhận hai thư", ss.emails.every((e) => daGuiSS.filter((t) => t.den.includes(e)).length <= 1));
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "email.so_thu_moi_phut": 50 } }));
  for (let i = 0; i < 3; i++) await guiLoThu(T, nhip());
  const sauSS = await chu.emailRecipient.findMany({ where: { campaignId: ss.cd.id } });
  dat("Chạy hết: mỗi người đúng một thư, không dòng kẹt", sauSS.every((r) => r.status === "SENT") && ss.emails.every((e) => hopThu.filter((t) => t.den.includes(e)).length === 1), sauSS.map((r) => r.status).join(","));
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "email.so_thu_moi_phut": 10 } }));

  // ==================================================================
  console.log("\n— E4. Gửi: sửa sau duyệt, chân thư bị gỡ sau duyệt —");
  const cdSua = await voi(T, mkt, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "QA sửa", mauId: mauCrlf.id, thamSo: { doiTuong: "lead", nguon: ["qa-kb-1"] } })));
  await voi(T, mkt, (nc) => guiDuyetChienDich(nc, cdSua.id));
  await nemLoi("Chờ duyệt: không sửa nội dung", "nghiep-vu", () => voi(T, mkt, (nc) => suaChienDich(nc, cdSua.id, { khoi: KHOI })), "sai-trang-thai");
  await voi(T, tpmkt, (nc) => duyetChienDich(nc, cdSua.id));
  await nemLoi("Đang gửi: không sửa nội dung / người nhận (kể cả người duyệt)", "nghiep-vu", () => voi(T, gd, (nc) => suaChienDich(nc, cdSua.id, { tieuDe: "Đổi sau duyệt" })), "sai-trang-thai");
  await voi(T, tpmkt, (nc) => tamDungChienDich(nc, cdSua.id, "kiểm"));
  await nemLoi("Tạm dừng: vẫn không sửa được", "nghiep-vu", () => voi(T, tpmkt, (nc) => suaChienDich(nc, cdSua.id, { khoi: [{ loai: "doan-van", noiDung: "Nội dung mới chưa duyệt" }] })), "sai-trang-thai");
  // Gỡ địa chỉ công ty sau khi đã duyệt rồi tiếp tục gửi.
  await chu.tenantSetting.updateMany({ where: { tenantId: T, key: "cong_ty.dia_chi" }, data: { value: "" } });
  await voi(T, tpmkt, (nc) => tiepTucChienDich(nc, cdSua.id));
  const truocCt = hopThu.length;
  await guiLoThu(T, nhip());
  const thuKhongDc = hopThu.slice(truocCt).map((t) => layHtml(t.du));
  dat(
    "ĐỎ: EM-09 — địa chỉ công ty bị gỡ sau khi duyệt thì worker không được gửi thư thiếu chân thư (đang gửi kèm '(chưa khai địa chỉ)')",
    !thuKhongDc.some((h) => h.includes("chưa khai địa chỉ")),
    `${thuKhongDc.filter((h) => h.includes("chưa khai địa chỉ")).length} thư đã đi với chân thư '(chưa khai địa chỉ)'`,
  );
  await chu.tenantSetting.updateMany({ where: { tenantId: T, key: "cong_ty.dia_chi" }, data: { value: "1 Đường QA, Quận 1, TP.HCM" } });
  await donDep(cdSua.id);

  // ==================================================================
  console.log("\n— F. Phân quyền email marketing —");
  const cdQ = await voi(T, mkt, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "QA quyền", mauId: mauCrlf.id, thamSo: { doiTuong: "lead", nguon: ["qa-kb-1"] } })));
  await voi(T, mkt, (nc) => guiDuyetChienDich(nc, cdQ.id));
  const knHop = LuocDoKetNoiEmail.parse({ host: "smtp.x.test", port: 465, baoMat: "tls", tenNguoiGui: "X", emailNguoiGui: "x@x.test" });
  for (const [ten, uid] of [["Kinh doanh", sales], ["Kỹ thuật", kyThuat], ["Thực tập sinh marketing", tts], ["Nhân viên marketing", mkt], ["Trưởng phòng marketing", tpmkt], ["Trợ lý AI", ai]] as const) {
    await nemLoi(`${ten} không xem / sửa được Kết nối email`, "quyen", async () => {
      const e1x = await batLoi(() => voi(T, uid, (nc) => xemKetNoi(nc)));
      const e2x = await batLoi(() => voi(T, uid, (nc) => luuKetNoi(nc, knHop)));
      if (e1x instanceof LoiThieuQuyen && e2x instanceof LoiThieuQuyen) throw e2x;
      throw new Error(`xem: ${String(e1x)}, lưu: ${String(e2x)}`);
    });
    await nemLoi(`${ten} không tải logo công ty`, "quyen", () => voi(T, uid, (nc) => datLogoCongTy(nc, { tenTep: "l.png", duLieuBase64: Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString("base64") })));
  }
  for (const [ten, uid] of [["Kinh doanh", sales], ["Kỹ thuật", kyThuat], ["Thực tập sinh marketing", tts], ["Nhân viên marketing", mkt], ["Trợ lý AI", ai]] as const) {
    await nemLoi(`${ten} không duyệt chiến dịch`, "quyen", () => voi(T, uid, (nc) => duyetChienDich(nc, cdQ.id)));
  }
  await nemLoi("Trợ lý AI không tạo / gửi duyệt / gửi thử chiến dịch", "quyen", async () => {
    const a = await batLoi(() => voi(T, ai, (nc) => taoMau(nc, LuocDoMau.parse({ ten: "AI", tieuDe: "x", khoi: KHOI }))));
    const b = await batLoi(() => voi(T, ai, (nc) => guiThuThu(nc, { tieuDe: "x", khoi: KHOI })));
    const c = await batLoi(() => voi(T, ai, (nc) => guiDuyetChienDich(nc, cdQ.id)));
    if ([a, b, c].every((x) => x instanceof LoiThieuQuyen)) throw a;
    throw new Error(`${String(a)} | ${String(b)} | ${String(c)}`);
  });
  await voi(T, tpmkt, (nc) => duyetChienDich(nc, cdQ.id));
  await nemLoi("Trợ lý AI không tiếp tục / huỷ chiến dịch đang gửi", "quyen", async () => {
    await voi(T, tpmkt, (nc) => tamDungChienDich(nc, cdQ.id, "x"));
    const a = await batLoi(() => voi(T, ai, (nc) => tiepTucChienDich(nc, cdQ.id)));
    const b = await batLoi(() => voi(T, ai, (nc) => huyChienDich(nc, cdQ.id, "AI huỷ")));
    if (a instanceof LoiThieuQuyen && b instanceof LoiThieuQuyen) throw a;
    throw new Error(`${String(a)} | ${String(b)}`);
  });
  await nemLoi("Thực tập sinh không tiếp tục chiến dịch tạm dừng", "quyen", () => voi(T, tts, (nc) => tiepTucChienDich(nc, cdQ.id)));
  await donDep(cdQ.id);
  await nemLoi("Doanh nghiệp B không duyệt chiến dịch của A", "khong-thay", () => voi(TB, gdB, (nc) => duyetChienDich(nc, cdQ.id)));

  // ==================================================================
  console.log("\n— G. Logo —");
  const PNG_DAU = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const b64 = (b: Buffer) => b.toString("base64");
  await nemLoi("SVG đổi đuôi .png → từ chối (kiểm byte)", "nghiep-vu", () => voi(T, gd, (nc) => datLogoCongTy(nc, LuocDoLogo.parse({ tenTep: "logo.png", duLieuBase64: b64(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>`)) }))), "kieu-tep");
  await nemLoi("SVG có BOM / khoảng trắng đầu, đuôi .png → từ chối", "nghiep-vu", () => voi(T, gd, (nc) => datLogoCongTy(nc, LuocDoLogo.parse({ tenTep: "logo.png", duLieuBase64: b64(Buffer.from(`﻿   <svg onload="alert(1)"/>`)) }))), "kieu-tep");
  await nemLoi("HTML đổi đuôi .jpg → từ chối", "nghiep-vu", () => voi(T, gd, (nc) => datLogoCongTy(nc, LuocDoLogo.parse({ tenTep: "logo.jpg", duLieuBase64: b64(Buffer.from("<html><script>alert(1)</script></html>")) }))), "kieu-tep");
  await nemLoi("GIF đặt tên .png → từ chối", "nghiep-vu", () => voi(T, gd, (nc) => datLogoCongTy(nc, LuocDoLogo.parse({ tenTep: "logo.png", duLieuBase64: b64(Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;")) }))), "kieu-tep");
  const polyglot = Buffer.concat([PNG_DAU, Buffer.alloc(24), Buffer.from("<html><script>alert(document.cookie)</script></html>")]);
  const lgP = await voi(T, gd, (nc) => datLogoCongTy(nc, LuocDoLogo.parse({ tenTep: "../../../etc/passwd.png", duLieuBase64: b64(polyglot) })));
  const docP = await voiTenant(T, (tx) => docLogoCongTy(tx));
  dat("Tệp đa định dạng (đầu PNG + đuôi HTML) chỉ lưu với MIME image/png (nhúng data:image/png trong <img>, không chạy script)", lgP.mime === "image/png" && docP?.mime === "image/png");
  const giaTriLogo = await chu.tenantSetting.findFirstOrThrow({ where: { tenantId: T, key: { contains: "logo" } } });
  dat("Tên tệp có '../' không được lưu / dùng làm đường dẫn", !JSON.stringify(giaTriLogo.value).includes("passwd") && !JSON.stringify(giaTriLogo.value).includes(".."));
  const vua = Buffer.concat([PNG_DAU, Buffer.alloc(512 * 1024 - PNG_DAU.length)]);
  dat("Đúng 512 KB được nhận", (await voi(T, gd, (nc) => datLogoCongTy(nc, LuocDoLogo.parse({ tenTep: "logo.png", duLieuBase64: b64(vua) })))).kichThuoc === 512 * 1024);
  await nemLoi("512 KB + 1 byte bị từ chối", "nghiep-vu", () => voi(T, gd, (nc) => datLogoCongTy(nc, LuocDoLogo.parse({ tenTep: "logo.png", duLieuBase64: b64(Buffer.concat([vua, Buffer.alloc(1)])) }))), "tep-qua-lon");
  const banIn = readFileSync("src/app/(in)/bao-gia/[id]/in/page.tsx", "utf8");
  dat("Bản in báo giá không dùng dangerouslySetInnerHTML / innerHTML (tên khách, điều khoản đi qua React)", !/dangerouslySetInnerHTML|innerHTML/.test(banIn));
  dat("Bản in chèn logo bằng data: với MIME lấy từ danh sách trắng (docLogoCongTy lọc MIME)", banIn.includes("data:${logo.mime};base64"));

  smtp.dong();
  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("QA đối kháng gói E");
}

void BUOC_GIAY;
const iLo = process.argv.indexOf("--gui-lo");
if (iLo > 0) {
  // Chế độ tiến trình con: một lô gửi như một worker độc lập.
  const [tid, ms] = process.argv.slice(iLo + 1);
  guiLoThu(tid, new Date(Number(ms)))
    .then(async (kq) => {
      console.log(`DA_GUI=${kq.daGui}`);
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
} else main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
