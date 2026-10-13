import net from "node:net";
import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiNghiepVu } from "../src/lib/loi";
import { luuKetNoi } from "../src/modules/email/ket-noi";
import { duyetChienDich, guiDuyetChienDich, taoChienDich, taoMau, xemTruocNguoiNhan } from "../src/modules/email/service";
import { guiLoThu } from "../src/modules/email/gui";
import { huyNhanTin } from "../src/modules/email/cong-khai";
import { kyMaLienKet } from "../src/modules/email/ma-lien-ket";
import { LuocDoKetNoiEmail, LuocDoMau, LuocDoTaoChienDich } from "../src/modules/email/luoc-do";
import { guiFormCongKhai, luuPhanKhuc, taoForm } from "../src/modules/marketing/service";
import { LuocDoForm, LuocDoLuuPhanKhuc } from "../src/modules/marketing/luoc-do";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng TƯƠNG TÁC CHÉO gói M (Marketing và thu lead, BUSINESS_RULES mục 22) × gói E (Email
 * marketing, mục 23) sau khi gộp vào 0.16.0:
 *   - Nguồn người nhận "phan-khuc" (EM-12 × MK-14): chỉ người ĐÃ đồng ý và CHƯA từ chối; sale và
 *     thực tập sinh Marketing không lách được để lấy email.
 *   - Hủy nhận tin qua liên kết trong thư (E) với lead / liên hệ đã đồng ý ở M: chạy được (CHECK
 *     `*_dong_y_nhan_tin_check` của M cấm hai cờ cùng bật) và hai cờ nhất quán.
 *   - Form công khai của M sau khi khách đã hủy ở E không bật lại đồng ý (MK-13), kể cả khi email
 *     chỉ còn trong danh sách chặn của E.
 * CHỈ chạy trên cơ sở dữ liệu phát triển.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}
if (!process.env.APP_ENC_KEY) {
  console.error("Thiếu APP_ENC_KEY trong .env — email cần khóa mã hóa.");
  process.exit(1);
}
process.env.APP_URL ??= "http://localhost:3000";

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);

/** Máy chủ SMTP giả tối giản: nhận mọi thư, ghi người nhận. */
const daNhan: string[] = [];
function dungSmtpGia(): Promise<{ cong: number; dong: () => void }> {
  return new Promise((ok) => {
    const s = net.createServer((sock) => {
      let dem = "";
      let trongData = false;
      const gui = (x: string) => sock.write(`${x}\r\n`);
      gui("220 may-gia ESMTP");
      sock.on("data", (b) => {
        dem += b.toString("utf8");
        while (true) {
          if (trongData) {
            const ket = dem.indexOf("\r\n.\r\n");
            if (ket < 0) return;
            dem = dem.slice(ket + 5);
            trongData = false;
            gui("250 OK");
            continue;
          }
          const xd = dem.indexOf("\r\n");
          if (xd < 0) return;
          const dong = dem.slice(0, xd);
          dem = dem.slice(xd + 2);
          const lenh = dong.slice(0, 4).toUpperCase();
          if (lenh === "EHLO") gui("250-may-gia\r\n250 8BITMIME");
          else if (lenh === "RCPT") {
            daNhan.push(/<([^>]+)>/.exec(dong)?.[1]?.toLowerCase() ?? "");
            gui("250 OK");
          } else if (lenh === "DATA") {
            trongData = true;
            gui("354 Tiep");
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
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-gop-m-e"));
  });
}

async function biChan(ten: string, khoi: () => Promise<unknown>, ma?: string) {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dung = e instanceof LoiThieuQuyen || (e instanceof LoiNghiepVu && (!ma || e.ma === ma));
    dat(ten, dung, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

const KHOI = [{ loai: "doan-van", noiDung: "Chào {{ten}}, ưu đãi tháng này." }];

async function main() {
  console.log("=== Thử tương tác chéo gói M × gói E (0.16.0) ===\n");
  const smtp = await dungSmtpGia();
  const tenant = await seedNenMong(chu, `thu-me-${DAU}`, "Doanh nghiệp thử M×E");
  const T = tenant.id;
  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  async function nguoi(ten: string, vai: string) {
    const u = await chu.user.create({
      data: {
        tenantId: T, email: `${ten}.${DAU}@thu.test`, passwordHash: "x", fullName: ten,
        userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
        staffProfile: { create: { tenantId: T } },
      },
    });
    return u.id;
  }
  const gd = await nguoi("giam-doc", "ceo");
  const tpmk = await nguoi("truong-phong-mk", "marketing-manager");
  const nvmk = await nguoi("nhan-vien-mk", "marketing");
  const tts = await nguoi("thuc-tap-mk", "marketing-intern");
  const sale = await nguoi("sale", "sales");
  await chu.tenantSetting.create({ data: { tenantId: T, key: "cong_ty.dia_chi", value: "123 Đường Thử, Quận 1, TP.HCM" } });

  const emA = `dong-y.${DAU}@khach.test`;
  const emB = `chua-dong-y.${DAU}@khach.test`;
  const emC = `tu-choi.${DAU}@khach.test`;
  let soLead = 0;
  const lead = async (ten: string, email: string, them: Record<string, unknown> = {}) =>
    (await chu.lead.create({
      data: { tenantId: T, code: `LD-T${DAU}-${++soLead}`, fullName: ten, email, emailNormalized: email, source: "website", ownerId: sale, ...them },
    })).id;
  const bayGio = new Date();
  const lA = await lead("Đã đồng ý", emA, { marketingOptIn: true, marketingOptInAt: bayGio, marketingConsentSource: "form:thu" });
  const lA2 = await lead("Đã đồng ý (lead cũ cùng email)", emA, { stage: "DISQUALIFIED", disqualifiedReason: "Trùng", marketingOptIn: true, marketingOptInAt: bayGio, marketingConsentSource: "form:thu" });
  await lead("Chưa đồng ý", emB);
  await lead("Đã từ chối", emC, { marketingOptOutAt: bayGio, marketingConsentSource: "nhap-tay" });
  const kh = await chu.customer.create({ data: { tenantId: T, code: `KH-T${DAU}`, name: "Khách M×E", nameNormalized: "khach m e", ownerId: sale } });
  const lh = await chu.contact.create({
    data: { tenantId: T, customerId: kh.id, fullName: "Liên hệ cùng email", email: emA, emailNormalized: emA, marketingOptIn: true, marketingOptInAt: bayGio, marketingConsentSource: "nhap-tay" },
  });

  const pk = await voi(T, tpmk, (nc) => luuPhanKhuc(nc, null, LuocDoLuuPhanKhuc.parse({ ten: `Lead website ${DAU}`, phanKhuc: { doiTuong: "lead", dieuKien: { nguon: ["website"] } } })));
  const thamSo = { phanKhucId: pk.id, tenPhanKhuc: `Lead website ${DAU}` };

  // ------------------------------------------------------------------
  console.log("— Nguồn người nhận 'phân khúc' (EM-12 × MK-14) —");
  const xt = await voi(T, nvmk, (nc) => xemTruocNguoiNhan(nc, "phan-khuc", thamSo));
  dat("Phân khúc chỉ trả người ĐÃ đồng ý và CHƯA từ chối (2 lead đồng ý cùng email → 1 người nhận)", xt.tong === 2 && xt.hopLe === 1, JSON.stringify({ tong: xt.tong, hopLe: xt.hopLe, biLoai: xt.biLoai }));
  dat("Mô tả nguồn nêu tên phân khúc và 'chỉ người đã đồng ý'", xt.moTa.includes(`Lead website ${DAU}`) && xt.moTa.includes("đồng ý"), xt.moTa);
  await biChan("Sale (không có marketing.view) không dùng được nguồn phân khúc", () => voi(T, sale, (nc) => xemTruocNguoiNhan(nc, "phan-khuc", thamSo)));
  await biChan("Thực tập sinh Marketing (không có marketing.update) không lấy được email theo phân khúc", () => voi(T, tts, (nc) => xemTruocNguoiNhan(nc, "phan-khuc", thamSo)), "thieu-quyen-nguon");
  await biChan("Tham số phân khúc sai khuôn bị từ chối", () => voi(T, nvmk, (nc) => xemTruocNguoiNhan(nc, "phan-khuc", { phanKhucId: "khong-phai-uuid" })).catch((e) => {
    throw e instanceof Error && e.name === "ZodError" ? new LoiNghiepVu("zod", 400, "zod") : e;
  }));

  await voi(T, gd, (nc) =>
    luuKetNoi(nc, LuocDoKetNoiEmail.parse({ host: "127.0.0.1", port: smtp.cong, baoMat: "none", tenNguoiGui: "TGTH", emailNguoiGui: "noreply@tgth.test" })),
  );
  const mau = await voi(T, nvmk, (nc) => taoMau(nc, LuocDoMau.parse({ ten: `Mẫu ${DAU}`, tieuDe: "Ưu đãi", khoi: KHOI })));
  const cd = await voi(T, nvmk, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "Đợt gửi theo phân khúc", mauId: mau.id, nguon: "phan-khuc", thamSo })));
  const gdu = await voi(T, nvmk, (nc) => guiDuyetChienDich(nc, cd.id));
  dat("Gửi duyệt đợt gửi theo phân khúc: dự kiến 1 người", gdu.duKienNguoiNhan === 1);
  const duyet = await voi(T, tpmk, (nc) => duyetChienDich(nc, cd.id));
  dat("Duyệt: đúng 1 người vào hàng gửi", duyet.tomTat.hopLe === 1, JSON.stringify(duyet.tomTat));
  await guiLoThu(T, new Date());
  dat("SMTP giả chỉ nhận thư của người đã đồng ý", daNhan.length === 1 && daNhan[0] === emA, JSON.stringify(daNhan));

  // ------------------------------------------------------------------
  console.log("\n— Hủy nhận tin qua liên kết email với người đã đồng ý ở Marketing —");
  const nn = await chu.emailRecipient.findFirstOrThrow({ where: { campaignId: cd.id, status: "SENT" } });
  let kqHuy = false;
  let loiHuy = "";
  try {
    kqHuy = await huyNhanTin(kyMaLienKet("huy", T, nn.id), { ip: "1.2.3.4", userAgent: "thu" });
  } catch (e) {
    loiHuy = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }
  dat("Hủy nhận tin chạy được với lead/liên hệ đang đồng ý (không vấp CHECK của M)", kqHuy, loiHuy);
  const sau = await chu.lead.findMany({ where: { id: { in: [lA, lA2] } }, select: { marketingOptIn: true, marketingOptOutAt: true, marketingConsentSource: true } });
  dat("Mọi lead cùng email: đồng ý = false, có thời điểm từ chối, ghi nguồn", sau.length === 2 && sau.every((l) => !l.marketingOptIn && l.marketingOptOutAt && l.marketingConsentSource === "huy-nhan-tin-email"), JSON.stringify(sau));
  const lhSau = await chu.contact.findUniqueOrThrow({ where: { id: lh.id } });
  dat("Liên hệ khách cùng email cũng chuyển từ chối, hai cờ nhất quán", !lhSau.marketingOptIn && lhSau.marketingOptOutAt !== null);
  dat("Danh sách chặn của E có email này", (await chu.emailSuppression.count({ where: { tenantId: T, email: emA, reason: "huy-nhan-tin" } })) === 1);
  const xtSau = await voi(T, nvmk, (nc) => xemTruocNguoiNhan(nc, "phan-khuc", thamSo));
  dat("Sau khi hủy, phân khúc không còn ai nhận được", xtSau.hopLe === 0 && xtSau.tong === 0, JSON.stringify({ tong: xtSau.tong, hopLe: xtSau.hopLe }));

  // ------------------------------------------------------------------
  console.log("\n— Form công khai của M sau khi đã hủy ở E (MK-13) —");
  const form = await voi(T, nvmk, (nc) =>
    taoForm(nc, LuocDoForm.parse({ ten: `Form M×E ${DAU}`, tieuDe: "Đăng ký", truong: [{ khoa: "hoTen", batBuoc: true }, { khoa: "email", batBuoc: true }], cauDongY: "Tôi đồng ý nhận tin" })),
  );
  const meta = { ip: "203.0.113.9", userAgent: "thu-gop-m-e" };
  await voiTenant(T, (tx) => guiFormCongKhai(tx, T, form.slug, { hoTen: "Đã đồng ý", email: emA, dongYNhanTin: true }, meta));
  const lASau = await chu.lead.findUniqueOrThrow({ where: { id: lA } });
  dat("Gửi lại form có tích đồng ý KHÔNG bật lại nhận tin trên lead đã hủy qua email", !lASau.marketingOptIn && lASau.marketingOptOutAt !== null);
  // Email chỉ còn trong danh sách chặn của E (không lead / liên hệ nào mang email đó).
  const emZ = `chi-trong-ds-chan.${DAU}@khach.test`;
  await chu.emailSuppression.create({ data: { tenantId: T, email: emZ, reason: "huy-nhan-tin" } });
  const rZ = await voiTenant(T, (tx) => guiFormCongKhai(tx, T, form.slug, { hoTen: "Người lạ đã hủy", email: emZ, dongYNhanTin: true }, meta));
  const lZ = await chu.lead.findUniqueOrThrow({ where: { id: (rZ as { leadId: string }).leadId } });
  dat("MK-13 × danh sách chặn E: lead mới không được coi là đồng ý, mang lời từ chối", !lZ.marketingOptIn && lZ.marketingOptOutAt !== null, JSON.stringify({ optIn: lZ.marketingOptIn, optOut: lZ.marketingOptOutAt, nguon: lZ.marketingConsentSource }));

  smtp.dong();
  ketLuan("Thử tương tác chéo M × E");
}

main()
  .catch(async (e) => {
    console.error(e);
    await chu.$disconnect();
    process.exit(1);
  })
  .finally(() => chu.$disconnect());
