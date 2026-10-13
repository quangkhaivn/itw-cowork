import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen } from "../src/lib/phan-quyen";
import { docBangCsv } from "../src/lib/csv";
import { taoKhachHang, taoLienHe } from "../src/modules/khach-hang/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { gopKhach, xemTruocGop } from "../src/modules/khach-hang/gop";
import { nhapKhachCsv, xuatKhachCsv } from "../src/modules/khach-hang/nhap-xuat";
import { banGiao, xemTruocBanGiao } from "../src/modules/ban-giao/service";
import {
  datDanhSachNhanLead,
  doiDongYNhanTin,
  doiTrangThaiChienDich,
  luuPhanKhuc,
  nhapTayLead,
  taoChienDich,
  taoForm,
  taoLanding,
  taoNguonWebhook,
  LuocDoLanding,
} from "../src/modules/marketing/service";
import { LuocDoForm, LuocDoLuuPhanKhuc, LuocDoNhapTayLead, LuocDoTaoChienDich } from "../src/modules/marketing/luoc-do";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng TƯƠNG TÁC CHÉO giữa gói K (Khách hàng nâng cao, BUSINESS_RULES mục 21) và gói M
 * (Marketing và thu lead, mục 22) sau khi gộp vào 0.16.0:
 *   - Bàn giao khi nghỉ việc (KHN-17) chuyển cả chiến dịch, form, nguồn webhook, phân khúc,
 *     landing page và suất nhận lead vòng tròn của người nghỉ.
 *   - Gộp khách (KHN-12) chuyển lead "trùng khách" (`leads.matched_customer_id`) và mang chiến dịch
 *     chạm đầu tiên (`customers.campaign_id`, MK-10) sang khách giữ lại khi khách giữ lại chưa có.
 *   - Nhận lead (MK-07) trùng SĐT của khách ĐÃ GỘP thì gắn khách giữ lại (KHN-13), không gắn khách đã gộp.
 *   - Xuất CSV khách (KHN-16) có cột "Liên hệ nhận tin" (MK-13); nhập lại tệp xuất không coi là cột lạ
 *     và KHÔNG ghi cờ đồng ý.
 * CHỈ chạy trên cơ sở dữ liệu phát triển.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const SO = String(Date.now()).slice(-6);
const dt = (n: number) => `08${String(n).padStart(2, "0")}${SO}`;

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-gop-k-m"));
  });
}

async function main() {
  console.log("=== Thử tương tác chéo gói K × gói M (0.16.0) ===\n");
  const tenant = await seedNenMong(chu, `thu-km-${DAU}`, "Doanh nghiệp thử K×M");
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
  const sale1 = await nguoi("sale-1", "sales");
  const sale2 = await nguoi("sale-2", "sales");
  const sale3 = await nguoi("sale-3", "sales");

  // ------------------------------------------------------------------
  console.log("— Bàn giao (KHN-17) gồm việc marketing (mục 22) —");
  const cdMo = await voi(T, nvmk, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: `Chiến dịch mở ${DAU}`, kenh: "zalo", utmCampaign: `mo-${DAU}` })));
  const cdHuy = await voi(T, nvmk, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: `Chiến dịch hủy ${DAU}`, kenh: "google", utmCampaign: `huy-${DAU}` })));
  await voi(T, nvmk, (nc) => doiTrangThaiChienDich(nc, cdHuy.id, "huy", "Không chạy nữa"));
  const form = await voi(T, nvmk, (nc) =>
    taoForm(nc, LuocDoForm.parse({ ten: `Form bàn giao ${DAU}`, tieuDe: "Đăng ký", truong: [{ khoa: "hoTen", batBuoc: true }, { khoa: "dienThoai", batBuoc: true }] })),
  );
  const wh = await voi(T, nvmk, (nc) => taoNguonWebhook(nc, { ten: "Zapier bàn giao", ma: `zap-${DAU}`, chienDichId: cdMo.id, nguon: "facebook" }));
  const pk = await voi(T, nvmk, (nc) => luuPhanKhuc(nc, null, LuocDoLuuPhanKhuc.parse({ ten: `Phân khúc ${DAU}`, phanKhuc: { doiTuong: "lead", dieuKien: { giaiDoan: ["NEW_LEAD"] } } })));
  const lp = await voi(T, nvmk, (nc) =>
    taoLanding(nc, LuocDoLanding.parse({ ten: `Landing ${DAU}`, tieuDe: "Trang", formId: form.id, khoi: [{ loai: "tieu-de", tieuDe: "Xin chào" }, { loai: "form" }] })),
  );
  const xt = await voi(T, gd, (nc) => xemTruocBanGiao(nc, nvmk));
  const so = (ma: string) => xt.loai.find((l) => l.ma === ma)?.so;
  dat("Xem trước đếm chiến dịch chưa kết thúc (bỏ chiến dịch đã hủy)", so("chien-dich") === 1, JSON.stringify(xt.loai));
  dat("Xem trước đếm form, nguồn webhook, phân khúc, landing", so("form-dang-ky") === 1 && so("nguon-webhook") === 1 && so("phan-khuc") === 1 && so("landing") === 1);
  const kq = await voi(T, gd, (nc) => banGiao(nc, nvmk, { nguoiNhanId: tpmk, khoaTaiKhoan: true }));
  dat("Bàn giao chuyển đủ như xem trước và khóa tài khoản", kq.tong === xt.tong && kq.daKhoa, JSON.stringify(kq.daChuyen));
  dat("Trưởng phòng Marketing có marketing.view → không cảnh báo thiếu quyền", kq.thieuQuyenXem.length === 0, JSON.stringify(kq.thieuQuyenXem));
  const sauCd = await chu.marketingCampaign.findMany({ where: { id: { in: [cdMo.id, cdHuy.id] } }, select: { id: true, ownerId: true } });
  dat("Chiến dịch mở sang người nhận; chiến dịch đã hủy giữ người cũ (lịch sử)",
    sauCd.find((c) => c.id === cdMo.id)?.ownerId === tpmk && sauCd.find((c) => c.id === cdHuy.id)?.ownerId === nvmk);
  dat("Form, nguồn webhook, phân khúc, landing sang người nhận",
    (await chu.marketingForm.findUniqueOrThrow({ where: { id: form.id } })).ownerId === tpmk &&
    (await chu.marketingWebhookSource.findUniqueOrThrow({ where: { id: wh.nguon.id } })).ownerId === tpmk &&
    (await chu.marketingSegment.findUniqueOrThrow({ where: { id: pk.id } })).ownerId === tpmk &&
    (await chu.landingPage.findUniqueOrThrow({ where: { id: lp.id } })).ownerId === tpmk);

  await voi(T, tpmk, (nc) => datDanhSachNhanLead(nc, [sale1, sale2]));
  const kq1 = await voi(T, gd, (nc) => banGiao(nc, sale1, { nguoiNhanId: sale3, khoaTaiKhoan: true }));
  const ds1 = await chu.marketingLeadAssignee.findMany({ where: { tenantId: T }, orderBy: { sortOrder: "asc" }, select: { userId: true, status: true } });
  dat("MK-08 × KHN-17: suất nhận lead của người nghỉ chuyển nguyên sang người nhận (giữ thứ tự vòng)",
    kq1.daChuyen["nhan-lead"] === 1 && ds1[0]?.userId === sale3 && ds1[0]?.status === "hoat-dong" && !ds1.some((d) => d.userId === sale1), JSON.stringify(ds1));
  const kq2 = await voi(T, gd, (nc) => banGiao(nc, sale2, { nguoiNhanId: sale3, khoaTaiKhoan: false }));
  const ds2 = await chu.marketingLeadAssignee.findMany({ where: { tenantId: T }, select: { userId: true, status: true } });
  dat("Người nhận đã có suất → suất người nghỉ chuyển tạm dừng, không xóa, không nhân đôi",
    kq2.daChuyen["nhan-lead"] === 1 && ds2.find((d) => d.userId === sale2)?.status === "tam-dung" && ds2.filter((d) => d.userId === sale3).length === 1, JSON.stringify(ds2));

  // ------------------------------------------------------------------
  console.log("\n— Gộp khách (KHN-12) với dữ liệu marketing —");
  const giu = await voi(T, sale3, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ xacNhanKhongTrung: true, ten: `Khách giữ ${DAU}`, dienThoai: dt(1) })));
  const biGop = await voi(T, sale3, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ xacNhanKhongTrung: true, ten: `Khách gộp ${DAU}`, dienThoai: dt(2) })));
  await chu.customer.update({ where: { id: biGop.id }, data: { campaignId: cdMo.id } });
  const ldTrung = await voi(T, tpmk, (nc) => nhapTayLead(nc, LuocDoNhapTayLead.parse({ hoTen: "Người cũ quay lại", dienThoai: dt(2) })));
  dat("MK-07: lead trùng SĐT khách → gắn khách đó", (await chu.lead.findUniqueOrThrow({ where: { id: ldTrung.leadId } })).matchedCustomerId === biGop.id);
  const xtg = await voi(T, gd, (nc) => xemTruocGop(nc, giu.id, biGop.id));
  dat("Xem trước gộp liệt kê leads.matched_customer_id (đọc từ catalog)", xtg.chuyen.some((c) => c.bang === "leads.matched_customer_id" && c.so === 1), JSON.stringify(xtg.chuyen));
  dat("Xem trước gộp: bổ sung chiến dịch hiện mã + tên, không hiện id", xtg.boSung.some((b) => b.truong === "Chiến dịch marketing" && b.giaTri.includes(cdMo.ma)), JSON.stringify(xtg.boSung));
  await voi(T, gd, (nc) => gopKhach(nc, { giuLaiId: giu.id, biGopId: biGop.id, lyDo: "Trùng khách thử K×M" }));
  dat("Lead trùng khách chuyển sang khách giữ lại", (await chu.lead.findUniqueOrThrow({ where: { id: ldTrung.leadId } })).matchedCustomerId === giu.id);
  dat("MK-10: khách giữ lại chưa có chiến dịch → nhận chiến dịch của khách bị gộp", (await chu.customer.findUniqueOrThrow({ where: { id: giu.id } })).campaignId === cdMo.id);

  // SĐT chỉ còn trên dòng khách đã gộp (khách giữ lại có SĐT riêng), không có lead mở nào trùng.
  const giu2 = await voi(T, sale3, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ xacNhanKhongTrung: true, ten: `Khách giữ 2 ${DAU}`, dienThoai: dt(7) })));
  const gop2 = await voi(T, sale3, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ xacNhanKhongTrung: true, ten: `Khách gộp 2 ${DAU}`, dienThoai: dt(8) })));
  await voi(T, gd, (nc) => gopKhach(nc, { giuLaiId: giu2.id, biGopId: gop2.id, lyDo: "Trùng khách thử K×M lần 2" }));
  const ldSau = await voi(T, tpmk, (nc) => nhapTayLead(nc, LuocDoNhapTayLead.parse({ hoTen: "Gọi theo số cũ", dienThoai: dt(8) })));
  const ldSauDb = await chu.lead.findUniqueOrThrow({ where: { id: ldSau.leadId } });
  dat("KHN-13 × MK-07: lead trùng SĐT của khách ĐÃ GỘP gắn khách giữ lại, không gắn khách đã gộp",
    ldSau.ketQua === "tao-moi" && ldSauDb.matchedCustomerId === giu2.id, `ketQua=${ldSau.ketQua} matched=${ldSauDb.matchedCustomerId} giu=${giu2.id} gop=${gop2.id}`);

  // ------------------------------------------------------------------
  console.log("\n— Xuất / nhập CSV khách với cờ nhận tin (MK-13) —");
  const kCsv = await voi(T, sale3, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ xacNhanKhongTrung: true, ten: `Khách CSV ${DAU}`, dienThoai: dt(3) })));
  await voi(T, sale3, (nc) => taoLienHe(nc, kCsv.id, { hoTen: "Anh Từ Chối", dienThoai: dt(4) }));
  const lh = await chu.contact.findFirstOrThrow({ where: { customerId: kCsv.id } });
  await voi(T, sale3, (nc) => doiDongYNhanTin(nc, "lien-he", lh.id, { dongY: false, nguon: "Khách gọi xin hủy" }));
  const xuat = await voi(T, gd, (nc) => xuatKhachCsv(nc, { q: `Khách CSV ${DAU}` }));
  const bang = docBangCsv(xuat.noiDung, [{ truong: "ten", ten: ["tên"] }, { truong: "nhanTin", ten: ["liên hệ nhận tin"] }]);
  dat("Xuất CSV có cột 'Liên hệ nhận tin' = Từ chối (từ chối luôn thắng)", bang.dong.some((d) => d.duLieu.ten === `Khách CSV ${DAU}` && d.duLieu.nhanTin === "Từ chối"), xuat.noiDung.split("\n")[0]);
  const nhapLai = await voi(T, gd, (nc) => nhapKhachCsv(nc, { tenTep: "xuat-lai.csv", noiDung: xuat.noiDung, ghiThat: false, xacNhanTrung: false }));
  dat("Nhập lại tệp vừa xuất: cột 'Liên hệ nhận tin' không bị coi là cột lạ", !nhapLai.cotLa.some((c) => c.includes("nhận tin")), JSON.stringify(nhapLai.cotLa));
  const csvDongY = ["Tên,Điện thoại,Liên hệ chính,ĐT liên hệ,Liên hệ nhận tin", `Khách nhập đồng ý ${DAU},${dt(5)},Chị Nhập,${dt(6)},Đồng ý`].join("\n");
  await voi(T, gd, (nc) => nhapKhachCsv(nc, { tenTep: "dong-y.csv", noiDung: csvDongY, ghiThat: true, xacNhanTrung: true }));
  const lhNhap = await chu.contact.findFirst({ where: { tenantId: T, fullName: "Chị Nhập" }, select: { marketingOptIn: true } });
  dat("MK-13: nhập CSV KHÔNG bật đồng ý nhận tin (đồng ý phải do chính người đó)", lhNhap !== null && lhNhap.marketingOptIn === false);

  ketLuan("Thử tương tác chéo K × M");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => chu.$disconnect());
