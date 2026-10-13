import net from "node:net";
import { prisma, voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { guiThuKiemTraKetNoi, luuKetNoi, xemKetNoi } from "../src/modules/email/ket-noi";
import {
  chiTietChienDich,
  danhSachChienDich,
  duyetChienDich,
  guiDuyetChienDich,
  guiThuThu,
  huyChienDich,
  suaChienDich,
  taoChienDich,
  taoMau,
  tamDungChienDich,
  tiepTucChienDich,
  traVeNhapChienDich,
  xemTruocNguoiNhan,
} from "../src/modules/email/service";
import { guiLoThu, PHUT_KET } from "../src/modules/email/gui";
import { ghiBam, ghiMo, huyNhanTin, thongTinHuyNhanTin } from "../src/modules/email/cong-khai";
import { kyMaLienKet } from "../src/modules/email/ma-lien-ket";
import { LuocDoKetNoiEmail, LuocDoMau, LuocDoTaoChienDich } from "../src/modules/email/luoc-do";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { datLogoCongTy, docLogoCongTy, LuocDoLogo, xoaLogoCongTy } from "../src/modules/ho-so-cong-ty/service";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng email marketing (BUSINESS_RULES mục 23 — EM) trên CSDL THẬT, qua đúng service mà
 * API và worker gọi. Thư đi qua **nodemailer thật** vào một **máy chủ SMTP giả** viết bằng
 * `node:net` ngay trong bài thử — không thư nào ra Internet.
 *
 * CHỈ chạy trên cơ sở dữ liệu phát triển.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}
if (!process.env.APP_ENC_KEY) {
  console.error("Thiếu APP_ENC_KEY trong .env (openssl rand -base64 32) — email cần khóa mã hóa.");
  process.exit(1);
}
process.env.APP_URL ??= "http://localhost:3000";

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);

// ---------------------------------------------------------------------------
// Máy chủ SMTP giả
// ---------------------------------------------------------------------------

interface ThuNhan {
  tu: string;
  den: string[];
  du: string;
}
const hopThu: ThuNhan[] = [];
/** Địa chỉ mà máy chủ giả từ chối ở bước RCPT với 550 (giả email không tồn tại). */
const tuChoi = new Set<string>();

function dungMayChuSmtp(): Promise<{ cong: number; dong: () => void }> {
  return new Promise((ok) => {
    const s = net.createServer((sock) => {
      let dem = "";
      let trongData = false;
      let thu: ThuNhan = { tu: "", den: [], du: "" };
      const gui = (x: string) => sock.write(`${x}\r\n`);
      gui("220 may-gia ESMTP");
      sock.on("data", (b) => {
        dem += b.toString("utf8");
        while (true) {
          if (trongData) {
            const ket = dem.indexOf("\r\n.\r\n");
            if (ket < 0) return;
            thu.du = dem.slice(0, ket);
            dem = dem.slice(ket + 5);
            trongData = false;
            hopThu.push(thu);
            thu = { tu: "", den: [], du: "" };
            gui("250 OK da nhan");
            continue;
          }
          const xd = dem.indexOf("\r\n");
          if (xd < 0) return;
          const dong = dem.slice(0, xd);
          dem = dem.slice(xd + 2);
          const lenh = dong.slice(0, 4).toUpperCase();
          if (lenh === "EHLO") gui("250-may-gia\r\n250-8BITMIME\r\n250 SMTPUTF8");
          else if (lenh === "HELO") gui("250 may-gia");
          else if (lenh === "MAIL") {
            thu.tu = dong.slice(10);
            gui("250 OK");
          } else if (lenh === "RCPT") {
            const dc = /<([^>]+)>/.exec(dong)?.[1]?.toLowerCase() ?? "";
            if (tuChoi.has(dc)) gui("550 5.1.1 Hop thu khong ton tai");
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

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-email"));
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

const KHOI = [
  { loai: "tieu-de", noiDung: "Chào {{ten}}" },
  { loai: "doan-van", noiDung: "Ưu đãi tháng này cho {{cong_ty}}." },
  { loai: "nut", nhan: "Xem ưu đãi", url: "https://thegioitinhoc.vn/khuyen-mai" },
  { loai: "anh", url: "https://thegioitinhoc.vn/anh.png", moTa: "Ảnh", lienKet: "https://thegioitinhoc.vn/san-pham" },
];

async function main() {
  console.log("=== Thử email marketing (EM) ===\n");
  const smtp = await dungMayChuSmtp();
  const tenant = await seedNenMong(chu, `thu-email-${DAU}`, "Doanh nghiệp thử email");
  const T = tenant.id;
  const tenantB = await seedNenMong(chu, `thu-email-b-${DAU}`, "Doanh nghiệp thử email B");
  const vaiTro = async (tid: string, code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tid, code } } })).id;
  async function nguoi(tid: string, ten: string, vai: string) {
    const u = await chu.user.create({
      data: {
        tenantId: tid,
        email: `${ten}.${DAU}@thu.test`,
        passwordHash: "x",
        fullName: ten,
        userRoles: { create: { tenantId: tid, roleId: await vaiTro(tid, vai) } },
        staffProfile: { create: { tenantId: tid } },
      },
    });
    return u.id;
  }
  const gd = await nguoi(T, "giam-doc", "ceo");
  const tpmkt = await nguoi(T, "tp-marketing", "marketing-manager");
  const mkt = await nguoi(T, "marketing", "marketing");
  const ttsMkt = await nguoi(T, "tts-marketing", "marketing-intern");
  const sales = await nguoi(T, "sales", "sales");
  const gdB = await nguoi(tenantB.id, "giam-doc-b", "ceo");
  console.log("");

  // Dữ liệu: 6 lead (1 trùng email, 1 không email, 1 đã từ chối, 1 sẽ bị máy chủ nhận từ chối), 1 khách + 2 liên hệ.
  let soLead = 0;
  const lead = async (ten: string, email: string | null, them: Record<string, unknown> = {}) =>
    (
      await chu.lead.create({
        data: {
          tenantId: T,
          code: `LD-T${DAU}-${++soLead}`,
          fullName: ten,
          companyName: `Cty ${ten}`,
          email,
          emailNormalized: email?.toLowerCase() ?? null,
          phone: email ? null : "0909000111",
          phoneNormalized: email ? null : "0909000111",
          source: "website",
          ownerId: sales,
          ...them,
        },
      })
    ).id;
  const lA = await lead("Lead A", `a.${DAU}@khach.test`);
  await lead("Lead A trùng", `A.${DAU}@KHACH.test`);
  const lB = await lead("Lead B", `b.${DAU}@khach.test`);
  await lead("Lead không email", null);
  const lTuChoi = await lead("Lead đã từ chối", `tuchoi.${DAU}@khach.test`, { marketingOptOutAt: new Date() });
  const lHong = await lead("Lead hỏng", `hong.${DAU}@khach.test`);
  await lead("Lead khác nguồn", `zalo.${DAU}@khach.test`, { source: "zalo" });
  tuChoi.add(`hong.${DAU}@khach.test`);
  const kh = await chu.customer.create({
    data: { tenantId: T, code: `KH-T${DAU}`, name: "Khách Doanh Nghiệp", nameNormalized: "khach doanh nghiep", segment: "doanh-nghiep", ownerId: sales },
  });
  await chu.contact.create({ data: { tenantId: T, customerId: kh.id, fullName: "Liên hệ 1", email: `lh1.${DAU}@khach.test`, emailNormalized: `lh1.${DAU}@khach.test` } });

  // ------------------------------------------------------------------
  console.log("— Kết nối hộp thư gửi (EM-01, EM-02) —");
  await nemLoi("Nhân viên marketing không xem được kết nối (integration.view)", "quyen", () => voi(T, mkt, (nc) => xemKetNoi(nc)));
  const MAT_KHAU = `MatKhauUngDung-${DAU}`;
  await nemLoi("Không cho gửi mật khẩu qua kết nối không mã hóa", "nghiep-vu", () =>
    voi(T, gd, (nc) =>
      luuKetNoi(nc, LuocDoKetNoiEmail.parse({ host: "127.0.0.1", port: smtp.cong, baoMat: "none", tenDangNhap: "u", matKhau: MAT_KHAU, tenNguoiGui: "TGTH", emailNguoiGui: "noreply@tgth.test" })),
    ),
    "khong-ma-hoa-ket-noi",
  );
  await voi(T, gd, (nc) =>
    luuKetNoi(nc, LuocDoKetNoiEmail.parse({ host: "smtp.gmail.com", port: 465, baoMat: "tls", tenDangNhap: "tgth@gmail.com", matKhau: MAT_KHAU, tenNguoiGui: "TGTH", emailNguoiGui: "tgth@gmail.com" })),
  );
  const dongKn = await chu.emailSetting.findFirstOrThrow({ where: { tenantId: T } });
  dat("EM-02: mật khẩu lưu dạng mã hóa v1:…", dongKn.passwordEnc?.startsWith("v1:") === true);
  dat("EM-02: CSDL không chứa mật khẩu dạng thuần", !JSON.stringify(dongKn).includes(MAT_KHAU));
  const xem = await voi(T, gd, (nc) => xemKetNoi(nc));
  dat("EM-02: API trả cờ 'có mật khẩu', không trả mật khẩu", xem.ketNoi.coMatKhau && !JSON.stringify(xem).includes(MAT_KHAU) && !JSON.stringify(xem).includes(dongKn.passwordEnc!));
  await chu.$executeRawUnsafe(`SELECT 1`);
  const nhatKy = await chu.auditLog.findMany({ where: { tenantId: T, objectType: "email_setting" } });
  dat("EM-02: nhật ký kiểm toán không chứa mật khẩu (thuần lẫn mã hóa)", nhatKy.length > 0 && !JSON.stringify(nhatKy).includes(MAT_KHAU) && !JSON.stringify(nhatKy).includes(dongKn.passwordEnc!));
  // Sửa mà bỏ trống mật khẩu → giữ nguyên.
  await voi(T, gd, (nc) =>
    luuKetNoi(nc, LuocDoKetNoiEmail.parse({ host: "smtp.gmail.com", port: 465, baoMat: "tls", tenDangNhap: "tgth@gmail.com", tenNguoiGui: "TGTH Sửa", emailNguoiGui: "tgth@gmail.com" })),
  );
  dat("Sửa không nhập mật khẩu thì giữ nguyên mật khẩu cũ", (await chu.emailSetting.findFirstOrThrow({ where: { tenantId: T } })).passwordEnc === dongKn.passwordEnc);
  let lo = false;
  try {
    await chu.$executeRawUnsafe(`UPDATE email_settings SET password_enc = 'mat-khau-tho' WHERE tenant_id = '${T}'`);
  } catch {
    lo = true;
  }
  dat("EM-02 [CSDL]: CHECK chặn ghi mật khẩu dạng thuần", lo);

  // Trỏ sang máy chủ giả, không đăng nhập, bật theo dõi.
  await voi(T, gd, (nc) =>
    luuKetNoi(nc, LuocDoKetNoiEmail.parse({ host: "127.0.0.1", port: smtp.cong, baoMat: "none", xoaMatKhau: true, tenNguoiGui: "Thế Giới Tin Học", emailNguoiGui: "noreply@tgth.test", traLoi: "kinhdoanh@tgth.test", theoDoi: true })),
  );
  const kqThu = await voi(T, gd, (nc) => guiThuKiemTraKetNoi(nc));
  dat("Gửi thư thử tới email của người đang đăng nhập", kqThu.ok && hopThu.at(-1)?.den[0] === `giam-doc.${DAU}@thu.test`, JSON.stringify(kqThu));
  dat("Ghi kết quả lần thử", (await chu.emailSetting.findFirstOrThrow({ where: { tenantId: T } })).lastTestOk === true);

  // ------------------------------------------------------------------
  console.log("\n— Mẫu email (EM-03, EM-04) —");
  await nemLoi("Nhân viên kinh doanh không soạn được mẫu (không có marketing.*)", "quyen", () =>
    voi(T, sales, (nc) => taoMau(nc, LuocDoMau.parse({ ten: "Mẫu", tieuDe: "T", khoi: KHOI }))),
  );
  dat("Lược đồ từ chối khối HTML tự do", !LuocDoMau.safeParse({ ten: "Mẫu", tieuDe: "T", khoi: [{ loai: "html", noiDung: "<b>x</b>" }] }).success);
  dat("Lược đồ từ chối biến ngoài danh sách trắng", !LuocDoMau.safeParse({ ten: "Mẫu", tieuDe: "{{mat_khau}}", khoi: KHOI }).success);
  const mau = await voi(T, mkt, (nc) => taoMau(nc, LuocDoMau.parse({ ten: "Ưu đãi tháng 10", tieuDe: "Ưu đãi cho {{cong_ty}}", khoi: KHOI })));
  dat("Nhân viên marketing tạo mẫu", Boolean(mau.id));
  const truocThu = hopThu.length;
  await voi(T, mkt, (nc) => guiThuThu(nc, { tieuDe: "Ưu đãi cho {{cong_ty}}", khoi: LuocDoMau.parse({ ten: "Mẫu thử", tieuDe: "x", khoi: KHOI }).khoi }));
    dat("Gửi thử mẫu tới chính người soạn", hopThu.length === truocThu + 1 && hopThu.at(-1)!.den[0] === `marketing.${DAU}@thu.test`);
  dat("Gửi thử không tạo dòng người nhận nào", (await chu.emailRecipient.count({ where: { tenantId: T } })) === 0);

  // ------------------------------------------------------------------
  console.log("\n— Chiến dịch: người nhận, duyệt (EM-05 → EM-08, EM-12) —");
  const thamSoLead = { doiTuong: "lead", nguon: ["website"] };
  const xt = await voi(T, mkt, (nc) => xemTruocNguoiNhan(nc, "loc-don-gian", thamSoLead));
  dat("Xem trước: 6 lead nguồn website", xt.tong === 6, JSON.stringify(xt));
  dat("Xem trước: 3 hợp lệ (A, B, hỏng-chưa-biết)", xt.hopLe === 3, JSON.stringify(xt.biLoai));
  const lyDo = Object.fromEntries(xt.biLoai.map((b) => [b.lyDo, b.so]));
  dat("Xem trước loại: 1 trùng, 1 không email, 1 đã từ chối", lyDo["trung-email"] === 1 && lyDo["khong-co-email"] === 1 && lyDo["da-tu-choi"] === 1);
  await nemLoi("EM-12: nhân viên marketing không có customer.view thì không chọn được liên hệ", "nghiep-vu", () =>
    voi(T, mkt, (nc) => xemTruocNguoiNhan(nc, "loc-don-gian", { doiTuong: "lien-he" })),
    "thieu-quyen-nguon",
  );
  const xtLh = await voi(T, tpmkt, (nc) => xemTruocNguoiNhan(nc, "loc-don-gian", { doiTuong: "lien-he", phanKhuc: ["doanh-nghiep"] }));
  dat("Trưởng phòng marketing (customer.view) lọc liên hệ theo phân khúc", xtLh.hopLe === 1);
  await nemLoi("Nhân viên kinh doanh không xem được chiến dịch", "quyen", () => voi(T, sales, (nc) => danhSachChienDich(nc, { q: "", trangThai: "", trang: 1 })));

  const cd = await voi(T, mkt, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "Chiến dịch tháng 10", mauId: mau.id, thamSo: thamSoLead })));
  dat("Mã chiến dịch dạng EM-2026-0001", /^EM-\d{4}-\d{4}$/.test(cd.ma), cd.ma);
  await nemLoi("EM-06: không duyệt thẳng chiến dịch Nháp", "nghiep-vu", () => voi(T, tpmkt, (nc) => duyetChienDich(nc, cd.id)), "sai-trang-thai");
  await nemLoi("EM-09: chưa khai địa chỉ công ty thì không gửi duyệt được", "nghiep-vu", () => voi(T, mkt, (nc) => guiDuyetChienDich(nc, cd.id)), "thieu-chan-thu");
  await chu.tenantSetting.create({ data: { tenantId: T, key: "cong_ty.dia_chi", value: "123 Đường Thử, Quận 1, TP.HCM" } });
  const gd1 = await voi(T, mkt, (nc) => guiDuyetChienDich(nc, cd.id));
  dat("Gửi duyệt: dự kiến 3 người nhận", gd1.duKienNguoiNhan === 3);
  await nemLoi("EM-06: chờ duyệt thì không sửa nội dung", "nghiep-vu", () => voi(T, mkt, (nc) => suaChienDich(nc, cd.id, { ten: "Đổi tên" })), "sai-trang-thai");
  await nemLoi("Nhân viên marketing không duyệt được (thiếu marketing.approve)", "quyen", () => voi(T, mkt, (nc) => duyetChienDich(nc, cd.id)));
  await voi(T, tpmkt, (nc) => traVeNhapChienDich(nc, cd.id, "Sửa lại tiêu đề"));
  dat("Người duyệt trả về Nháp", (await chu.emailCampaign.findUniqueOrThrow({ where: { id: cd.id } })).status === "DRAFT");
  await voi(T, mkt, (nc) => suaChienDich(nc, cd.id, { tieuDe: "Ưu đãi riêng cho {{cong_ty}}" }));
  await voi(T, mkt, (nc) => guiDuyetChienDich(nc, cd.id));
  const duyet = await voi(T, tpmkt, (nc) => duyetChienDich(nc, cd.id));
  dat("Duyệt: 3 người vào hàng gửi", duyet.tomTat.hopLe === 3, JSON.stringify(duyet.tomTat));
  const dongNN = await chu.emailRecipient.findMany({ where: { campaignId: cd.id } });
  dat("EM-08: 3 dòng chờ gửi + 1 dòng bị loại 'đã từ chối' có lý do", dongNN.filter((r) => r.status === "QUEUED").length === 3 && dongNN.some((r) => r.status === "SKIPPED" && r.leadId === lTuChoi && (r.reason ?? "").length > 2));
  dat("Duyệt chụp lại cờ theo dõi", (await chu.emailCampaign.findUniqueOrThrow({ where: { id: cd.id } })).trackingEnabled === true);
  let trung = false;
  try {
    await chu.emailRecipient.create({ data: { tenantId: T, campaignId: cd.id, email: `a.${DAU}@khach.test`, name: "x", recipientType: "lead", leadId: lA } });
  } catch {
    trung = true;
  }
  dat("EM-07 [CSDL]: khóa duy nhất (chiến dịch, email) chặn dòng trùng", trung);
  dat("Sự kiện EMAIL_CAMPAIGN_APPROVED được ghi", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "EMAIL_CAMPAIGN_APPROVED", objectId: cd.id } })) === 1);

  // ------------------------------------------------------------------
  console.log("\n— Gửi qua hàng đợi (EM-13, EM-14) —");
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "email.so_thu_moi_phut": 1 } }));
  const truocGui = hopThu.length;
  const t0 = new Date();
  const lo1 = await guiLoThu(T, t0);
  dat("Tốc độ 1 thư/phút: lô đầu gửi đúng 1 thư", lo1.daGui === 1 && hopThu.length === truocGui + 1, JSON.stringify(lo1));
  const lo1b = await guiLoThu(T, new Date(t0.getTime() + 5_000));
  dat("Trong cùng phút không gửi thêm (đếm theo CSDL, không theo bộ nhớ)", lo1b.daGui === 0);
  const thuDau = hopThu.at(-1)!;
  dat("Thư có List-Unsubscribe trỏ /api/cong-khai/huy-nhan-tin/", /List-Unsubscribe:\s+<http:\/\/[^>]+\/api\/cong-khai\/huy-nhan-tin\/[A-Za-z0-9_-]+>/.test(thuDau.du));
  dat("Thư có List-Unsubscribe-Post một chạm (RFC 8058)", thuDau.du.includes("List-Unsubscribe-Post: List-Unsubscribe=One-Click"));
  dat("Thư có điểm ảnh mở và liên kết chuyển hướng (theo dõi đang bật)", thuDau.du.includes("/api/cong-khai/email/mo/") && thuDau.du.includes("/api/cong-khai/email/bam/"));
  dat("Thư có địa chỉ trả lời", /Reply-To: kinhdoanh@tgth\.test/i.test(thuDau.du));
  dat("Thư không lộ email người nhận trên liên kết", !/huy-nhan-tin\/[^\s"]*@/.test(thuDau.du));

  const daGui1 = await chu.emailRecipient.findFirstOrThrow({ where: { campaignId: cd.id, status: "SENT" } });
  const tt = await chu.interaction.findFirst({ where: { tenantId: T, type: "email", leadId: daGui1.leadId } });
  dat("TT-02: gửi thành công ghi tương tác 'email' vào dòng thời gian lead", Boolean(tt) && tt!.ownerId === mkt, tt?.subject ?? "");
  dat("Gửi email marketing không tự chuyển giai đoạn lead (khác LD-04)", (await chu.lead.findUniqueOrThrow({ where: { id: daGui1.leadId! } })).stage === "NEW_LEAD");

  // Người nhận bấm huỷ trong lúc còn chờ → lúc tới lượt bị loại.
  const choB = await chu.emailRecipient.findFirstOrThrow({ where: { campaignId: cd.id, leadId: lB } });
  if (choB.status === "QUEUED") {
    await chu.emailSuppression.create({ data: { tenantId: T, email: choB.email, reason: "huy-nhan-tin" } });
  }
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "email.so_thu_moi_phut": 10 } }));
  const lo2 = await guiLoThu(T, new Date(t0.getTime() + 61_000));
  const sauLo2 = await chu.emailRecipient.findMany({ where: { campaignId: cd.id } });
  const rB = sauLo2.find((r) => r.leadId === lB)!;
  dat("Người vừa từ chối trước lượt gửi bị loại, không nhận thư", choB.status !== "QUEUED" || (rB.status === "SKIPPED" && !hopThu.some((h) => h.den.includes(rB.email))), `${rB.status}`);
  const rHong = sauLo2.find((r) => r.leadId === lHong)!;
  dat("550 ở bước RCPT → lỗi kèm lý do", rHong.status === "FAILED" && (rHong.reason ?? "").includes("550"), `${rHong.status} ${rHong.reason}`);
  dat("Email hỏng vào danh sách chặn", (await chu.emailSuppression.count({ where: { tenantId: T, email: rHong.email, reason: "email-hong" } })) === 1);
  dat("Lô 2 không có lỗi kết nối", !lo2.tamDung, JSON.stringify(lo2));
  const lo3 = await guiLoThu(T, new Date(t0.getTime() + 122_000));
  dat("Hết người chờ → chiến dịch Đã gửi xong", lo3.xong.includes(cd.id) && (await chu.emailCampaign.findUniqueOrThrow({ where: { id: cd.id } })).status === "COMPLETED");
  dat("Báo người lập khi gửi xong", (await chu.notification.count({ where: { tenantId: T, userId: mkt, type: "email-xong" } })) === 1);
  const soThuTheoEmail = (e: string) => hopThu.filter((h) => h.den.includes(e)).length;
  dat("Không ai nhận hai thư của cùng chiến dịch", sauLo2.every((r) => soThuTheoEmail(r.email) <= 1));

  // ------------------------------------------------------------------
  console.log("\n— Huỷ nhận tin (EM-10) —");
  const maHuy = kyMaLienKet("huy", T, daGui1.id);
  const tt1 = await thongTinHuyNhanTin(maHuy);
  dat("Trang huỷ chỉ hiện email đã che và tên công ty gửi", Boolean(tt1) && tt1!.emailChe.includes("•••") && !tt1!.emailChe.includes(daGui1.email) && !tt1!.daHuy);
  dat("Huỷ nhận tin bằng mã ký", await huyNhanTin(maHuy, { ip: "1.2.3.4", userAgent: "thu" }));
  dat("Ghi marketing_opt_out_at trên lead", (await chu.lead.findUniqueOrThrow({ where: { id: daGui1.leadId! } })).marketingOptOutAt !== null);
  dat("Lead trùng email (viết hoa khác) cũng bị đánh dấu", (await chu.lead.count({ where: { tenantId: T, emailNormalized: daGui1.email, marketingOptOutAt: null } })) === 0);
  dat("Vào danh sách chặn theo email", (await chu.emailSuppression.count({ where: { tenantId: T, email: daGui1.email, reason: "huy-nhan-tin" } })) === 1);
  dat("Bấm lại lần nữa vẫn an toàn, không ghi thêm sự kiện", (await huyNhanTin(maHuy, { ip: null, userAgent: null })) && (await chu.emailEvent.count({ where: { recipientId: daGui1.id, eventType: "unsubscribe" } })) === 1);
  dat("Mã giả / mã của loại khác bị từ chối", !(await huyNhanTin(kyMaLienKet("mo", T, daGui1.id), { ip: null, userAgent: null })) && !(await huyNhanTin("x".repeat(68), { ip: null, userAgent: null })));
  dat("Mã ký cho tenant khác không chạm được người nhận tenant này (RLS)", !(await huyNhanTin(kyMaLienKet("huy", tenantB.id, daGui1.id), { ip: null, userAgent: null })));
  let suaDuoc = true;
  try {
    await chu.emailEvent.updateMany({ where: { recipientId: daGui1.id }, data: { ipAddress: "0.0.0.0" } });
  } catch {
    suaDuoc = false;
  }
  dat("Nhật ký email_events chỉ ghi thêm (trigger chặn sửa)", !suaDuoc);
  const xt2 = await voi(T, mkt, (nc) => xemTruocNguoiNhan(nc, "loc-don-gian", thamSoLead));
  dat("Mọi lần gửi sau đều loại người đã huỷ", xt2.hopLe === 0, JSON.stringify(xt2));

  // ------------------------------------------------------------------
  console.log("\n— Theo dõi mở / bấm (EM-11) —");
  await ghiMo(kyMaLienKet("mo", T, daGui1.id), { ip: null, userAgent: null });
  await ghiMo(kyMaLienKet("mo", T, daGui1.id), { ip: null, userAgent: null });
  const sauMo = await chu.emailRecipient.findUniqueOrThrow({ where: { id: daGui1.id } });
  dat("Đếm 2 lượt mở, giữ lần mở đầu", sauMo.openCount === 2 && sauMo.openedAt !== null);
  const dich = await ghiBam(kyMaLienKet("bam", T, daGui1.id, 1), { ip: null, userAgent: null });
  dat("Bấm liên kết thứ 2 → chuyển đúng URL trong thư", dich === "https://thegioitinhoc.vn/san-pham", String(dich));
  dat("Chỉ số ngoài danh sách liên kết → không chuyển (chống open redirect)", (await ghiBam(kyMaLienKet("bam", T, daGui1.id, 7), { ip: null, userAgent: null })) === null);
  const ct = await voi(T, mkt, (nc) => chiTietChienDich(nc, cd.id));
  dat("Thống kê: đã gửi, lỗi, mở, bấm, huỷ", ct.thongKe.daGui >= 1 && ct.thongKe.loi === 1 && ct.thongKe.mo === 1 && ct.thongKe.bam === 1 && ct.thongKe.huyNhanTin === 1, JSON.stringify(ct.thongKe));
  const ctTts = await voi(T, ttsMkt, (nc) => chiTietChienDich(nc, cd.id));
  dat("Thực tập sinh (không có crm.view) chỉ thấy email đã che", ctTts.nguoiNhan.dong.every((r) => r.email.includes("•••")));
  dat("Nhân viên marketing (có crm.view) thấy email đầy đủ của lead", ct.nguoiNhan.dong.some((r) => r.email === daGui1.email));

  // ------------------------------------------------------------------
  console.log("\n— Tạm dừng / tiếp tục / huỷ / kẹt giữa chừng —");
  for (const [i, ten] of ["c1", "c2", "c3"].entries()) await lead(`Lead đợt 2 ${i}`, `${ten}.${DAU}@dot2.test`, { source: "hoi-thao" });
  const cd2 = await voi(T, mkt, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "Đợt 2", mauId: mau.id, thamSo: { doiTuong: "lead", nguon: ["hoi-thao"] } })));
  await voi(T, mkt, (nc) => guiDuyetChienDich(nc, cd2.id));
  await voi(T, tpmkt, (nc) => duyetChienDich(nc, cd2.id));
  await voi(T, mkt, (nc) => tamDungChienDich(nc, cd2.id, "Kiểm lại nội dung"));
  const loDung = await guiLoThu(T, new Date(t0.getTime() + 300_000));
  dat("Chiến dịch tạm dừng thì không gửi", loDung.daGui === 0);
  await nemLoi("Nhân viên marketing không tự tiếp tục (cần marketing.approve)", "quyen", () => voi(T, mkt, (nc) => tiepTucChienDich(nc, cd2.id)));
  await voi(T, tpmkt, (nc) => tiepTucChienDich(nc, cd2.id));

  // Giả worker chết giữa chừng: một dòng đã nhận việc (SENDING) từ lâu.
  const ket = await chu.emailRecipient.findFirstOrThrow({ where: { campaignId: cd2.id, status: "QUEUED" } });
  await chu.emailRecipient.update({ where: { id: ket.id }, data: { status: "SENDING", attemptAt: new Date(t0.getTime() + 360_000 - (PHUT_KET + 1) * 60_000) } });
  // Hộp thư gửi hỏng → tự tạm dừng, trả về hàng chờ.
  await chu.emailSetting.updateMany({ where: { tenantId: T }, data: { port: 1 } });
  const loHong = await guiLoThu(T, new Date(t0.getTime() + 360_000));
  const c2 = await chu.emailCampaign.findUniqueOrThrow({ where: { id: cd2.id } });
  dat("EM-13: lỗi kết nối → chiến dịch tự tạm dừng kèm lý do", loHong.tamDung && c2.status === "PAUSED" && (c2.pauseReason ?? "").includes("Máy tự tạm dừng"), `${c2.status} ${c2.pauseReason}`);
  dat("EM-13: thư chưa đi được trả về hàng chờ", (await chu.emailRecipient.count({ where: { campaignId: cd2.id, status: "QUEUED" } })) === 2);
  dat("EM-13: báo người lập và người duyệt", (await chu.notification.count({ where: { tenantId: T, type: "email-tam-dung", objectId: cd2.id } })) === 2);
  const ketSau = await chu.emailRecipient.findUniqueOrThrow({ where: { id: ket.id } });
  dat("EM-14: dòng kẹt SENDING quá hạn → lỗi 'không rõ', KHÔNG gửi lại", ketSau.status === "FAILED" && soThuTheoEmail(ket.email) === 0, `${ketSau.status}`);
  await chu.emailSetting.updateMany({ where: { tenantId: T }, data: { port: smtp.cong } });
  await voi(T, tpmkt, (nc) => tiepTucChienDich(nc, cd2.id));
  await nemLoi("Nhân viên marketing không huỷ được chiến dịch đang gửi", "quyen", () => voi(T, mkt, (nc) => huyChienDich(nc, cd2.id, "Thôi")));
  const huy = await voi(T, tpmkt, (nc) => huyChienDich(nc, cd2.id, "Đổi kế hoạch"));
  dat("Huỷ: người còn chờ chuyển 'bị loại' kèm lý do", huy.soBoQua === 2 && (await chu.emailRecipient.count({ where: { campaignId: cd2.id, status: "SKIPPED" } })) === 2);
  const loSauHuy = await guiLoThu(T, new Date(t0.getTime() + 600_000));
  dat("Chiến dịch đã huỷ không gửi gì nữa", loSauHuy.daGui === 0);
  let huyKhongLyDo = false;
  try {
    await chu.emailCampaign.update({ where: { id: cd2.id }, data: { cancelReason: null } });
  } catch {
    huyKhongLyDo = true;
  }
  dat("[CSDL] chiến dịch huỷ phải có lý do", huyKhongLyDo);

  // ------------------------------------------------------------------
  console.log("\n— Logo công ty cho bản in báo giá —");
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
  const b64 = (b: Buffer) => b.toString("base64");
  await nemLoi("Nhân viên marketing không đổi được logo (setting.update)", "quyen", () =>
    voi(T, mkt, (nc) => datLogoCongTy(nc, LuocDoLogo.parse({ tenTep: "logo.png", duLieuBase64: b64(PNG) }))),
  );
  await nemLoi("Ruột PNG mà đặt tên .jpg → từ chối (kiểm byte đầu)", "nghiep-vu", () =>
    voi(T, gd, (nc) => datLogoCongTy(nc, LuocDoLogo.parse({ tenTep: "logo.jpg", duLieuBase64: b64(PNG) }))),
    "kieu-tep",
  );
  await nemLoi("SVG bị từ chối (chạy được script)", "nghiep-vu", () =>
    voi(T, gd, (nc) => datLogoCongTy(nc, LuocDoLogo.parse({ tenTep: "logo.svg", duLieuBase64: b64(Buffer.from("<svg onload='x()'/>")) }))),
    "kieu-tep",
  );
  await nemLoi("PDF hợp lệ nhưng không phải ảnh → từ chối", "nghiep-vu", () =>
    voi(T, gd, (nc) => datLogoCongTy(nc, LuocDoLogo.parse({ tenTep: "logo.pdf", duLieuBase64: b64(Buffer.from("%PDF-1.7 xxxxxxxx")) }))),
    "kieu-tep",
  );
  await nemLoi("Tệp RIFF không phải WebP (ví dụ WAV) → từ chối", "nghiep-vu", () =>
    voi(T, gd, (nc) => datLogoCongTy(nc, LuocDoLogo.parse({ tenTep: "logo.webp", duLieuBase64: b64(Buffer.from("RIFF\0\0\0\0WAVEfmt xxxxxxxx")) }))),
    "kieu-tep",
  );
  await nemLoi("Quá 512 KB → từ chối", "nghiep-vu", () =>
    voi(T, gd, (nc) => datLogoCongTy(nc, { tenTep: "logo.png", duLieuBase64: b64(Buffer.concat([PNG, Buffer.alloc(600 * 1024)])) })),
    "tep-qua-lon",
  );
  const lg = await voi(T, gd, (nc) => datLogoCongTy(nc, LuocDoLogo.parse({ tenTep: "logo.png", duLieuBase64: b64(PNG) })));
  dat("Logo PNG thật được lưu kèm mã băm", lg.mime === "image/png" && lg.kichThuoc === PNG.length && /^[0-9a-f]{64}$/.test(lg.sha256));
  const docLg = await voiTenant(T, (tx) => docLogoCongTy(tx));
  dat("Đọc lại đúng nội dung ảnh cho bản in", docLg?.duLieu === b64(PNG));
  const nkLogo = await chu.auditLog.findMany({ where: { tenantId: T, objectType: "setting" } });
  dat("Nhật ký ghi mã băm, không ghi nội dung ảnh", nkLogo.some((n) => JSON.stringify(n.after).includes(lg.sha256)) && !JSON.stringify(nkLogo).includes(b64(PNG)));
  dat("Doanh nghiệp B không thấy logo của A", (await voiTenant(tenantB.id, (tx) => docLogoCongTy(tx))) === null);
  await voi(T, gd, (nc) => xoaLogoCongTy(nc));
  dat("Gỡ logo", (await voiTenant(T, (tx) => docLogoCongTy(tx))) === null);

  // ------------------------------------------------------------------
  console.log("\n— Cách ly tenant —");
  const dsB = await voi(tenantB.id, gdB, (nc) => danhSachChienDich(nc, { q: "", trangThai: "", trang: 1 }));
  dat("Giám đốc doanh nghiệp B không thấy chiến dịch của A", dsB.tong === 0);
  await nemLoi("Doanh nghiệp B mở chiến dịch của A → không tìm thấy", "khong-thay", () => voi(tenantB.id, gdB, (nc) => chiTietChienDich(nc, cd.id)));
  const demB = await voiTenant(tenantB.id, async (tx) => ({
    nn: await tx.emailRecipient.count(),
    kn: await tx.emailSetting.count(),
    chan: await tx.emailSuppression.count(),
    sk: await tx.emailEvent.count(),
    mau: await tx.emailTemplate.count(),
  }));
  dat("RLS: B không đọc được người nhận / kết nối / danh sách chặn / sự kiện / mẫu của A", Object.values(demB).every((x) => x === 0), JSON.stringify(demB));
  const loB = await guiLoThu(tenantB.id);
  dat("Worker chạy cho B không đụng hàng chờ của A", loB.daGui === 0);

  smtp.dong();
  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("Thử email marketing");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
