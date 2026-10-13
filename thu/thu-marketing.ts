import { prisma, voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { namVN } from "../src/lib/so-chung-tu";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { chuyenDoiLead } from "../src/modules/lead/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { LuocDoChuyenDoiLead } from "../src/modules/lead/luoc-do";
import {
  chiTietChienDich,
  danhSachChienDich,
  danhSachTheoPhanKhuc,
  datDanhSachNhanLead,
  doiDongYNhanTin,
  doiKhoaWebhook,
  doiTrangThaiChienDich,
  doiTrangThaiLanding,
  docLandingCongKhai,
  duyetNganSach,
  ghiChiPhi,
  guiFormCongKhai,
  huyChiPhi,
  khoiMarketingBangDieuKhien,
  luuPhanKhuc,
  nhanQuaWebhook,
  nhapTayLead,
  nhatKyNhanLead,
  suaChienDich,
  taoChienDich,
  taoForm,
  taoLanding,
  taoNguonWebhook,
  thuHoiWebhook,
  xemTruocPhanKhuc,
  LuocDoLanding,
  LoiTuChoiNhan,
} from "../src/modules/marketing/service";
import { chayNhanCongKhai } from "../src/modules/marketing/cong-khai";
import { cheDienThoai } from "../src/modules/marketing/tinh-toan";
import { LuocDoForm, LuocDoLuuPhanKhuc, LuocDoNhapTayLead, LuocDoTaoChienDich } from "../src/modules/marketing/luoc-do";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng Marketing và thu lead (0.16.0) trên cơ sở dữ liệu THẬT, qua đúng service mà API gọi.
 * Luật được kiểm: BUSINESS_RULES.md mục 22 (MK). Mỗi lần chạy dựng một tenant thử mới.
 * CHỈ chạy trên cơ sở dữ liệu phát triển.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const SO = String(Date.now()).slice(-6);
const dt = (n: number) => `09${String(n).padStart(2, "0")}${SO}`;

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-marketing"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "dinh-dang" | "bat-ky";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string): Promise<unknown> {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
    return null;
  } catch (e) {
    const dungKieu =
      kieu === "bat-ky" ? true
      : kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "dinh-dang" ? e instanceof LoiDinhDang
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
    return e;
  }
}

const IP = "203.0.113.7";
const meta = { ip: IP, userAgent: "thu-marketing" };

async function main() {
  console.log("=== Thử Marketing và thu lead (0.16.0) ===\n");
  const tenant = await seedNenMong(chu, `thu-mk-${DAU}`, "Doanh nghiệp thử Marketing");
  const T = tenant.id;
  const MA_DN = tenant.code;
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
  const sale1 = await nguoi("sale-1", "sales");
  const sale2 = await nguoi("sale-2", "sales");
  const ktv = await nguoi("ky-thuat", "technical");
  console.log("");

  // ------------------------------------------------------------------
  console.log("— Chiến dịch, duyệt ngân sách (MK-01 → MK-03) —");
  const cd = await voi(T, nvmk, (nc) =>
    taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "Camera Tết 2027", kenh: "facebook", utmCampaign: "Camera-Tết-2027", nganSach: "10.000.000", ngayBatDau: "2026-10-01", ngayKetThuc: "2026-12-31" })),
  );
  dat("MK-01: mã chiến dịch CD-<năm>-0001", cd.ma === `CD-${namVN()}-0001`, cd.ma);
  dat("MK-01: utm_campaign chuẩn hóa bỏ dấu, chữ thường", cd.utmCampaign === "camera-tet-2027", String(cd.utmCampaign));
  await nemLoi("MK-01: trùng utm_campaign bị chặn", "nghiep-vu", () =>
    voi(T, tpmk, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "Chiến dịch trùng", kenh: "google", utmCampaign: "camera-tet-2027" }))),
    "trung-utm",
  );
  dat("MK-02: lược đồ chặn ngày kết thúc trước ngày bắt đầu", !LuocDoTaoChienDich.safeParse({ ten: "Sai ngày", kenh: "zalo", ngayBatDau: "2026-10-10", ngayKetThuc: "2026-10-01" }).success);
  await nemLoi("Kỹ thuật viên không xem được chiến dịch", "quyen", () => voi(T, ktv, (nc) => danhSachChienDich(nc, { q: "", trangThai: "", kenh: "", tuNgay: "", denNgay: "" })));
  const dsTts = await voi(T, tts, (nc) => danhSachChienDich(nc, { q: "", trangThai: "", kenh: "", tuNgay: "", denNgay: "" }));
  dat("Phạm vi own: thực tập sinh không thấy chiến dịch của người khác", dsTts.dong.length === 0);
  await nemLoi("MK-03: chưa duyệt ngân sách thì không chạy được", "nghiep-vu", () => voi(T, nvmk, (nc) => doiTrangThaiChienDich(nc, cd.id, "dang-chay")), "chua-duyet-ngan-sach");
  let chanCsdl = false;
  try {
    await chu.marketingCampaign.update({ where: { id: cd.id }, data: { status: "dang-chay" } });
  } catch {
    chanCsdl = true;
  }
  dat("MK-03: CSDL chặn chiến dịch có ngân sách chưa duyệt chạy (kể cả vai chủ sở hữu)", chanCsdl);
  await voi(T, nvmk, (nc) => doiTrangThaiChienDich(nc, cd.id, "cho-duyet"));
  const tbDuyet = await chu.notification.count({ where: { tenantId: T, userId: tpmk, type: "chien-dich-cho-duyet" } });
  dat("Gửi duyệt báo chuông cho người có marketing.approve", tbDuyet === 1);
  await nemLoi("Nhân viên Marketing không có quyền duyệt", "quyen", () => voi(T, nvmk, (nc) => duyetNganSach(nc, cd.id, { dongY: true })));
  await nemLoi("Từ chối duyệt phải có lý do", "nghiep-vu", () => voi(T, tpmk, (nc) => duyetNganSach(nc, cd.id, { dongY: false })), "thieu-ly-do");
  const daDuyet = await voi(T, tpmk, (nc) => duyetNganSach(nc, cd.id, { dongY: true, ghiChu: "Đồng ý" }));
  dat("Duyệt: ghi mức đã duyệt = ngân sách, quay về kế hoạch", daDuyet.nganSachDaDuyet === "10000000" && daDuyet.trangThai === "ke-hoach");
  const chay = await voi(T, nvmk, (nc) => doiTrangThaiChienDich(nc, cd.id, "dang-chay"));
  dat("Đã duyệt thì chạy được", chay.trangThai === "dang-chay");
  const tang = await voi(T, nvmk, (nc) => suaChienDich(nc, cd.id, { nganSach: "15000000" }));
  dat("MK-03: tăng ngân sách vượt mức đã duyệt khi đang chạy → về chờ duyệt", tang.trangThai === "cho-duyet" && tang.veChoDuyet);
  await voi(T, tpmk, (nc) => duyetNganSach(nc, cd.id, { dongY: true }));
  await voi(T, nvmk, (nc) => doiTrangThaiChienDich(nc, cd.id, "dang-chay"));
  const kiemToanDuyet = await chu.auditLog.count({ where: { tenantId: T, objectType: "marketing_campaign", objectId: cd.id, action: "duyet" } });
  dat("Duyệt ngân sách có Audit Log", kiemToanDuyet === 2);
  await nemLoi("Hủy chiến dịch đang chạy không phải bước hợp lệ", "nghiep-vu", () => voi(T, nvmk, (nc) => doiTrangThaiChienDich(nc, cd.id, "huy", "thử")), "sai-buoc");

  // Chiến dịch không ngân sách chạy ngay được
  const cd0 = await voi(T, tpmk, (nc) => taoChienDich(nc, LuocDoTaoChienDich.parse({ ten: "Zalo OA tự nhiên", kenh: "zalo" })));
  const cd0Chay = await voi(T, tpmk, (nc) => doiTrangThaiChienDich(nc, cd0.id, "dang-chay"));
  dat("Ngân sách 0 → không cần duyệt", cd0Chay.trangThai === "dang-chay");

  // ------------------------------------------------------------------
  console.log("\n— Chi phí (MK-04) —");
  const cp1 = await voi(T, nvmk, (nc) => ghiChiPhi(nc, cd.id, { ngay: "2026-10-05", soTien: "3000000", loai: "quang-cao", ghiChu: "Nạp FB" }));
  await voi(T, nvmk, (nc) => ghiChiPhi(nc, cd.id, { ngay: "2026-10-06", soTien: "1000000", loai: "noi-dung", ghiChu: null }));
  dat("Ghi chi phí: cộng dồn", cp1.daChi === 3_000_000);
  let chanAm = false;
  try {
    await chu.marketingCost.create({ data: { tenantId: T, campaignId: cd.id, costDate: new Date("2026-10-07"), amount: -5 } });
  } catch {
    chanAm = true;
  }
  dat("MK-04: CSDL chặn chi phí ≤ 0", chanAm);
  const cpHuy = await voi(T, nvmk, (nc) => ghiChiPhi(nc, cd.id, { ngay: "2026-10-07", soTien: "999000", loai: "khac", ghiChu: "ghi nhầm" }));
  await voi(T, nvmk, (nc) => huyChiPhi(nc, cpHuy.id, "Ghi nhầm chiến dịch"));
  dat("MK-04: hủy chi phí không xóa dòng", (await chu.marketingCost.count({ where: { id: cpHuy.id, status: "huy" } })) === 1);

  // ------------------------------------------------------------------
  console.log("\n— Một cửa nhận lead, chia vòng tròn, việc gọi lại (MK-06 → MK-09) —");
  await nemLoi("Nhân viên Marketing không đặt được danh sách nhận lead cho người không có crm.view", "nghiep-vu", () =>
    voi(T, nvmk, (nc) => datDanhSachNhanLead(nc, [sale1, ktv])), "nguoi-nhan-khong-hop-le",
  );
  await voi(T, tpmk, (nc) => datDanhSachNhanLead(nc, [sale1, sale2]));
  const form = await voi(T, nvmk, (nc) =>
    taoForm(nc, LuocDoForm.parse({
      ten: "Đăng ký tư vấn camera", tieuDe: "Nhận báo giá camera", nguon: "facebook", chienDichId: cd0.id,
      truong: [{ khoa: "hoTen", batBuoc: true }, { khoa: "dienThoai", batBuoc: true }, { khoa: "email" }, { khoa: "nhuCau" }],
      cauDongY: "Tôi đồng ý nhận tin khuyến mãi",
    })),
  );
  dat("Form: slug tự sinh từ tên", form.slug === "dang-ky-tu-van-camera", form.slug);
  dat("MK-11: lược đồ form chặn trường lạ ngoài danh mục", !LuocDoForm.safeParse({ ten: "Form lạ", tieuDe: "Form lạ", truong: [{ khoa: "nguoiPhuTrachId" }, { khoa: "dienThoai" }, { khoa: "hoTen" }] }).success);
  dat("MK-11: lược đồ form bắt có SĐT hoặc email", !LuocDoForm.safeParse({ ten: "Thiếu liên lạc", tieuDe: "Thiếu", truong: [{ khoa: "hoTen" }] }).success);

  const gui = (than: Record<string, unknown>, slug = form.slug) => voiTenant(T, (tx) => guiFormCongKhai(tx, T, slug, than, meta));
  const r1 = await gui({ hoTen: "Nguyễn Văn Một", dienThoai: `+84 ${dt(1).slice(1)}`, email: "Mot@Khach.vn", nhuCau: "8 camera", utm_source: "facebook", utm_campaign: "camera-tet-2027", dongYNhanTin: true });
  const r2 = await gui({ hoTen: "Trần Thị Hai", dienThoai: dt(2) });
  const r3 = await gui({ hoTen: "Lê Ba", dienThoai: dt(3) });
  const l1 = await chu.lead.findUniqueOrThrow({ where: { id: (r1 as { leadId: string }).leadId } });
  const l2 = await chu.lead.findUniqueOrThrow({ where: { id: (r2 as { leadId: string }).leadId } });
  const l3 = await chu.lead.findUniqueOrThrow({ where: { id: (r3 as { leadId: string }).leadId } });
  dat("MK-06: SĐT chuẩn hóa về 0xxxxxxxxx, email chữ thường", l1.phoneNormalized === dt(1) && l1.emailNormalized === "mot@khach.vn", `${l1.phoneNormalized} ${l1.emailNormalized}`);
  dat("MK-08: chia vòng tròn sale-1 → sale-2 → sale-1", l1.ownerId === sale1 && l2.ownerId === sale2 && l3.ownerId === sale1);
  dat("MK-10: utm_campaign khớp → gắn chiến dịch theo UTM, thắng chiến dịch của form", l1.campaignId === cd.id && l1.utmSource === "facebook");
  dat("MK-10: không có UTM → chiến dịch của form", l2.campaignId === cd0.id);
  dat("Lead mang nguồn của form và kênh nhận", l2.source === "facebook" && l2.captureChannel === "form");
  dat("MK-13: tự tích đồng ý → opt-in, ghi nguồn đồng ý", l1.marketingOptIn && l1.marketingConsentSource === `form:${form.slug}`);
  dat("MK-13: không tích → không opt-in", !l2.marketingOptIn);
  const viec1 = await chu.task.findFirst({ where: { leadId: l1.id } });
  dat("MK-09: sinh việc gọi lại cho sale được giao", viec1?.ownerId === sale1 && viec1.priority === "cao");
  dat("MK-09: chưa đặt hạn trong Cấu hình → việc không có hạn và nói rõ", viec1?.dueAt === null && Boolean(viec1?.description?.includes("Chưa đặt hạn gọi lại")));
  dat("MK-09: chuông báo sale được giao", (await chu.notification.count({ where: { tenantId: T, userId: sale1, type: "lead-moi" } })) === 2);
  const suKienLead = await chu.businessEvent.findFirst({ where: { tenantId: T, eventType: "LEAD_CAPTURED", objectId: l1.id } });
  dat("Business Event LEAD_CAPTURED do hệ thống (không có người đăng nhập)", suKienLead?.actorType === "system");
  dat("Audit Log tạo lead ghi IP", (await chu.auditLog.count({ where: { tenantId: T, objectType: "lead", objectId: l1.id, action: "tao", ipAddress: IP } })) === 1);

  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "marketing.phut_goi_lai_lead": 30 } }));
  const truocLuc = Date.now();
  const r4 = await gui({ hoTen: "Phạm Bốn", dienThoai: dt(4) });
  const viec4 = await chu.task.findFirstOrThrow({ where: { leadId: (r4 as { leadId: string }).leadId } });
  const lech = (viec4.dueAt?.getTime() ?? 0) - truocLuc;
  dat("MK-09: đã đặt 30 phút → hạn gọi lại = lúc nhận + 30 phút", lech >= 29 * 60_000 && lech <= 31 * 60_000, String(lech));

  // Trùng lead đang mở
  const soLeadTruoc = await chu.lead.count({ where: { tenantId: T } });
  const rTrung = await gui({ hoTen: "Một (đăng ký lại)", dienThoai: dt(1), nhuCau: "Thêm 2 camera" });
  dat("MK-07: trùng SĐT lead đang mở → ghi thêm, không tạo lead mới", rTrung.ketQua === "ghi-them" && (await chu.lead.count({ where: { tenantId: T } })) === soLeadTruoc);
  const tt1 = await chu.interaction.findFirst({ where: { leadId: l1.id }, orderBy: { createdAt: "desc" } });
  dat("MK-07: tương tác ghi vào lead cũ, người phụ trách giữ nguyên", Boolean(tt1?.content?.includes("Thêm 2 camera")) && tt1?.ownerId === sale1);
  dat("MK-07: còn việc đang mở thì không đẻ thêm việc gọi lại", (await chu.task.count({ where: { leadId: l1.id } })) === 1);
  dat("MK-07: lead không đổi giai đoạn vì ghi chú hệ thống", (await chu.lead.findUniqueOrThrow({ where: { id: l1.id } })).stage === "NEW_LEAD");

  // Trùng khách đã có
  const khach = await voi(T, sale2, (nc) =>
    taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Công ty Khách Cũ", lienHe: { hoTen: "Chị Liên Hệ", dienThoai: dt(5), email: `lienhe.${DAU}@khachcu.vn` } })),
  );
  const rKhach = await gui({ hoTen: "Chị Liên Hệ", dienThoai: dt(5) });
  const lKhach = await chu.lead.findUniqueOrThrow({ where: { id: (rKhach as { leadId: string }).leadId } });
  dat("MK-07: trùng liên hệ của khách → vẫn tạo lead, gắn khách trùng", rKhach.ketQua === "tao-moi" && lKhach.matchedCustomerId === khach.id);
  dat("MK-07: lead trùng khách giao cho người phụ trách khách (không chia vòng)", lKhach.ownerId === sale2);

  // Bẫy bot, dữ liệu sai
  const truocSpam = await chu.lead.count({ where: { tenantId: T } });
  const spam = await gui({ hoTen: "Bot", dienThoai: dt(6), website_url: "http://spam.example" });
  dat("MK-11: ô bẫy có dữ liệu → trả như thành công nhưng không tạo lead", spam.ketQua === "spam" && (await chu.lead.count({ where: { tenantId: T } })) === truocSpam);
  dat("MK-11: lần spam vào nhật ký", (await chu.leadCapture.count({ where: { tenantId: T, result: "spam" } })) === 1);
  await nemLoi("MK-11: thiếu trường bắt buộc → 400 kèm lỗi từng trường", "nghiep-vu", () => gui({ hoTen: "Thiếu SĐT", email: "a@b.vn" }), "du-lieu-sai");
  await nemLoi("MK-11: SĐT vô lý bị từ chối", "nghiep-vu", () => gui({ hoTen: "SĐT sai", dienThoai: "12" }), "du-lieu-sai");
  await nemLoi("MK-11: trường quá dài bị từ chối", "nghiep-vu", () => gui({ hoTen: "x".repeat(300), dienThoai: dt(7) }), "du-lieu-sai");
  // Đường công khai đầy đủ: từ chối được ghi nhật ký trong giao dịch riêng
  const truocTuChoi = await chu.leadCapture.count({ where: { tenantId: T, result: "tu-choi" } });
  await nemLoi("Đường công khai: dữ liệu sai bị từ chối", "bat-ky", () =>
    chayNhanCongKhai(MA_DN, "form", IP, (tx, tid) => guiFormCongKhai(tx, tid, form.slug, { hoTen: "Thiếu liên lạc" }, meta)),
  );
  dat("Lần bị từ chối vẫn vào nhật ký (giao dịch riêng)", (await chu.leadCapture.count({ where: { tenantId: T, result: "tu-choi" } })) === truocTuChoi + 1);
  const loiTenant = await nemLoi("QĐ-61: mã doanh nghiệp không tồn tại → 404", "khong-thay", () =>
    chayNhanCongKhai("khong-co-dn", "form", IP, (tx, tid) => guiFormCongKhai(tx, tid, form.slug, { hoTen: "A", dienThoai: dt(8) }, meta)),
  );
  void loiTenant;
  const itw = await chu.tenant.findFirst({ where: { code: "itw" } });
  if (itw) {
    await nemLoi("NM-01: form của tenant thử không mở được qua mã doanh nghiệp khác", "bat-ky", () =>
      chayNhanCongKhai("itw", "form", IP, (tx, tid) => guiFormCongKhai(tx, tid, form.slug, { hoTen: "Chéo", dienThoai: dt(9) }, meta)),
    );
    const cheo = await voiTenant(itw.id, async (tx) => ({
      cd: await tx.marketingCampaign.count({ where: { id: cd.id } }),
      nk: await tx.leadCapture.count({ where: { tenantId: T } }),
      f: await tx.marketingForm.count({ where: { id: form.id } }),
    }));
    dat("NM-01: tenant khác không thấy chiến dịch, form, nhật ký nhận lead", cheo.cd === 0 && cheo.nk === 0 && cheo.f === 0);
  }

  // Form tắt
  await chu.marketingForm.update({ where: { id: form.id }, data: { status: "tat" } });
  await nemLoi("MK-11: form tắt → không nhận", "nghiep-vu", () => gui({ hoTen: "Muộn", dienThoai: dt(8) }), "khong-tim-thay");
  await chu.marketingForm.update({ where: { id: form.id }, data: { status: "hoat-dong" } });

  // Không hỏi đồng ý thì không opt-in dù gửi true
  const formKhongHoi = await voi(T, nvmk, (nc) => taoForm(nc, LuocDoForm.parse({ ten: "Form không hỏi", tieuDe: "Liên hệ", truong: [{ khoa: "hoTen" }, { khoa: "email", batBuoc: true }] })));
  const rKH = await gui({ hoTen: "Khách Email", email: `kh.${DAU}@mail.vn`, dongYNhanTin: true }, formKhongHoi.slug);
  dat("MK-13: form không có câu hỏi đồng ý → không opt-in dù thân gửi true", !(await chu.lead.findUniqueOrThrow({ where: { id: (rKH as { leadId: string }).leadId } })).marketingOptIn);

  let chanOpt = false;
  try {
    await chu.lead.update({ where: { id: l1.id }, data: { marketingOptOutAt: new Date() } });
  } catch {
    chanOpt = true;
  }
  dat("MK-13: CSDL chặn vừa đồng ý vừa từ chối", chanOpt);
  let chanSuaNk = false;
  try {
    await chu.leadCapture.updateMany({ where: { tenantId: T }, data: { reason: "sửa" } });
  } catch {
    chanSuaNk = true;
  }
  dat("Nhật ký nhận lead chỉ ghi thêm (trigger chặn cả chủ sở hữu)", chanSuaNk);

  // Danh sách nhận lead trống → phụ trách chiến dịch
  await voi(T, tpmk, (nc) => datDanhSachNhanLead(nc, []));
  const rPt = await gui({ hoTen: "Không ai nhận", dienThoai: dt(10) });
  dat("MK-08: danh sách trống → giao người phụ trách chiến dịch", (await chu.lead.findUniqueOrThrow({ where: { id: (rPt as { leadId: string }).leadId } })).ownerId === tpmk);
  const rTf = await gui({ hoTen: "Form không chiến dịch", email: `kcd.${DAU}@mail.vn` }, formKhongHoi.slug);
  dat("MK-08: không chiến dịch → người phụ trách form", (await chu.lead.findUniqueOrThrow({ where: { id: (rTf as { leadId: string }).leadId } })).ownerId === nvmk);
  await voi(T, tpmk, (nc) => datDanhSachNhanLead(nc, [sale1, sale2]));

  // Nhập tay
  const tay = await voi(T, tts, (nc) => nhapTayLead(nc, LuocDoNhapTayLead.parse({ hoTen: "Khách hội thảo", dienThoai: dt(11), chienDichId: cd0.id })));
  dat("Nhập tay (thực tập sinh có marketing.create) đi qua cùng nhanLead", tay.ketQua === "tao-moi" && (await chu.lead.findUniqueOrThrow({ where: { id: tay.leadId } })).captureChannel === "nhap-tay");
  await nemLoi("Kỹ thuật viên không nhập tay lead ở Marketing", "quyen", () => voi(T, ktv, (nc) => nhapTayLead(nc, LuocDoNhapTayLead.parse({ hoTen: "KTV nhập", dienThoai: dt(12) }))));

  // ------------------------------------------------------------------
  console.log("\n— Che liên lạc (MK-15) —");
  const nkTts = await voi(T, tts, (nc) => nhatKyNhanLead(nc, { kenh: "form" }));
  const nkTp = await voi(T, tpmk, (nc) => nhatKyNhanLead(nc, { kenh: "form" }));
  const dongTts = nkTts.dong.find((d) => d.lead?.id === l1.id);
  const dongTp = nkTp.dong.find((d) => d.lead?.id === l1.id);
  dat("MK-15: thực tập sinh thấy SĐT lead đã che", dongTts?.lead?.dienThoai === cheDienThoai(l1.phone), String(dongTts?.lead?.dienThoai));
  dat("MK-15: thực tập sinh thấy email lead đã che", dongTts?.lead?.email === "m***@khach.vn", String(dongTts?.lead?.email));
  dat("MK-15: Trưởng phòng Marketing (có crm.view) thấy đủ", dongTp?.lead?.dienThoai !== null && !dongTp?.lead?.dienThoai?.includes("***"));
  const ctTts = await voi(T, gd, (nc) => chiTietChienDich(nc, cd.id));
  dat("Giám đốc xem chi tiết chiến dịch thấy đủ SĐT", ctTts.leads.every((l) => !l.daChe));

  // ------------------------------------------------------------------
  console.log("\n— Webhook (MK-12) —");
  const wh = await voi(T, nvmk, (nc) => taoNguonWebhook(nc, { ten: "Facebook Lead Ads", ma: "fb-lead-ads", chienDichId: cd.id, nguon: "facebook" }));
  dat("MK-12: khóa trả một lần, máy chủ chỉ giữ băm SHA-256", wh.khoa.startsWith("cwk_") && (await chu.marketingWebhookSource.findUniqueOrThrow({ where: { id: wh.nguon.id } })).keyHash !== wh.khoa);
  const kiemToanWh = await chu.auditLog.findFirst({ where: { tenantId: T, objectType: "marketing_webhook_source", objectId: wh.nguon.id } });
  dat("MK-12: khóa không nằm trong Audit Log", !JSON.stringify(kiemToanWh?.after ?? {}).includes(wh.khoa));
  const goiWh = (khoa: string | null, than: unknown, ma = "fb-lead-ads") => chayNhanCongKhai(MA_DN, "webhook", IP, (tx, tid) => nhanQuaWebhook(tx, tid, ma, khoa, than, meta));
  await nemLoi("MK-12: sai khóa → 401", "nghiep-vu", () => goiWh("cwk_sai", { full_name: "A", phone_number: dt(13) }), "sai-khoa");
  await nemLoi("MK-12: thiếu khóa → 401", "nghiep-vu", () => goiWh(null, { full_name: "A", phone_number: dt(13) }), "sai-khoa");
  const okWh = await goiWh(wh.khoa, { full_name: "Khách Facebook", phone_number: dt(13), email: `fb.${DAU}@mail.vn`, utm_source: "fb" });
  dat("MK-12: đúng khóa → nhận lead (tên trường kiểu Zapier)", okWh.ketQua === "tao-moi");
  const lWh = await chu.lead.findFirstOrThrow({ where: { tenantId: T, phoneNormalized: dt(13) } });
  dat("Webhook: lead gắn chiến dịch + nguồn của nguồn webhook", lWh.campaignId === cd.id && lWh.source === "facebook" && lWh.captureChannel === "webhook");
  await nemLoi("Webhook: thân không phải JSON object → từ chối", "nghiep-vu", () => goiWh(wh.khoa, "abc"), "du-lieu-sai");
  const doi = await voi(T, nvmk, (nc) => doiKhoaWebhook(nc, wh.nguon.id));
  await nemLoi("MK-12: đổi khóa → khóa cũ hết hiệu lực", "nghiep-vu", () => goiWh(wh.khoa, { full_name: "B", phone_number: dt(14) }), "sai-khoa");
  dat("MK-12: khóa mới dùng được", (await goiWh(doi.khoa, { full_name: "Khách B", phone_number: dt(14) })).ketQua === "tao-moi");
  await nemLoi("Thực tập sinh không thu hồi được nguồn (thiếu marketing.update)", "quyen", () => voi(T, tts, (nc) => thuHoiWebhook(nc, wh.nguon.id)));
  await voi(T, nvmk, (nc) => thuHoiWebhook(nc, wh.nguon.id));
  await nemLoi("MK-12: nguồn đã thu hồi → từ chối", "nghiep-vu", () => goiWh(doi.khoa, { full_name: "C", phone_number: dt(15) }), "sai-khoa");
  const nkWh = await chu.leadCapture.groupBy({ by: ["result"], where: { tenantId: T, webhookSourceId: wh.nguon.id }, _count: { _all: true } });
  const demTuChoi = nkWh.find((n) => n.result === "tu-choi")?._count._all ?? 0;
  dat("MK-12: mọi lần bị từ chối (sai khóa, thiếu khóa, thân sai, khóa cũ, đã thu hồi) đều vào nhật ký", demTuChoi === 5, String(demTuChoi));
  dat("LoiTuChoiNhan là lỗi nghiệp vụ", new LoiTuChoiNhan("x", 400, "x", { kenh: "form", lyDo: "x" }) instanceof LoiNghiepVu);

  // ------------------------------------------------------------------
  console.log("\n— Chuyển đổi, chỉ số CPL/ROAS (MK-05, MK-10) —");
  const cv = await voi(T, sale1, (nc) =>
    chuyenDoiLead(nc, l1.id, LuocDoChuyenDoiLead.parse({ khachMoi: { ten: "Công ty Một Camera" }, coHoi: { tieuDe: "8 camera", giaTri: "20000000", hanhDongKeTiep: "Khảo sát", ngayHanhDong: "2026-12-01" } })),
  );
  const khachMoi = await chu.customer.findUniqueOrThrow({ where: { id: cv.khachHangId } });
  const coHoi = await chu.opportunity.findUniqueOrThrow({ where: { id: cv.coHoiId! } });
  dat("MK-10: chuyển đổi → khách MỚI mang chiến dịch", khachMoi.campaignId === cd.id);
  dat("MK-10: cơ hội mang chiến dịch", coHoi.campaignId === cd.id);
  const cvCu = await voi(T, sale2, (nc) => chuyenDoiLead(nc, lKhach.id, LuocDoChuyenDoiLead.parse({ khachHangId: khach.id, taoLienHe: false })));
  dat("MK-10: chuyển vào khách CŨ không gắn chiến dịch cho khách (không thổi phồng ROAS)", (await chu.customer.findUniqueOrThrow({ where: { id: cvCu.khachHangId } })).campaignId === null);
  await chu.invoice.create({
    data: { tenantId: T, number: `HD-THU-${DAU}`, customerId: khachMoi.id, ownerId: sale1, status: "ISSUED", issueDate: new Date("2026-10-20"), dueDate: new Date("2026-11-20"), issuedAt: new Date(), issuedBy: sale1, subtotal: 20000000, total: 22000000 },
  });
  const ct = await voi(T, nvmk, (nc) => chiTietChienDich(nc, cd.id));
  const s = ct.chiSo;
  dat("MK-05: chi phí = khoản còn hiệu lực (3tr + 1tr)", s.chiPhi === 4_000_000, String(s.chiPhi));
  dat("MK-05: đếm lead của chiến dịch (form UTM + webhook ×2)", s.soLead === 3, String(s.soLead));
  dat("MK-05: CPL = chi phí / lead", s.cpl === Math.round(4_000_000 / 3), String(s.cpl));
  dat("MK-05: chuyển đổi = 1", s.soChuyenDoi === 1 && s.soDuDieuKien === 1);
  dat("MK-05: doanh thu = hóa đơn đã phát hành của khách mới, ROAS = 22tr/4tr", s.doanhThu === 22_000_000 && s.roas === 5.5, `${s.doanhThu} ${s.roas}`);
  const ct0 = await voi(T, nvmk, (nc) => chiTietChienDich(nc, cd0.id));
  dat("MK-05: chiến dịch chưa chi đồng nào → ROAS null (không phải 0)", ct0.chiSo.roas === null && ct0.chiSo.chiPhi === 0);

  // ------------------------------------------------------------------
  console.log("\n— Phân khúc (MK-14) —");
  dat("MK-14: điều kiện lạ ngoài danh mục bị từ chối", !LuocDoLuuPhanKhuc.safeParse({ ten: "Lạ", phanKhuc: { doiTuong: "lead", dieuKien: { sql: "1=1" } } }).success);
  const pk = await voi(T, nvmk, (nc) => luuPhanKhuc(nc, null, LuocDoLuuPhanKhuc.parse({ ten: "Lead Facebook", phanKhuc: { doiTuong: "lead", dieuKien: { nguon: ["facebook"], giaiDoan: ["NEW_LEAD", "CONTACTED", "QUALIFIED"] } } })));
  const xt = await voi(T, nvmk, (nc) => xemTruocPhanKhuc(nc, pk.phanKhuc!));
  dat("Xem trước: đếm tổng và số nhận được tin", xt.tong >= 5 && xt.nhanDuoc === 0, `${xt.tong}/${xt.nhanDuoc}`);
  await voi(T, sale2, (nc) => doiDongYNhanTin(nc, "lead", l2.id, { dongY: true, nguon: "Gọi điện 12/10" }));
  const dsGui = await voi(T, nvmk, (nc) => danhSachTheoPhanKhuc(nc, pk.id, { boCheDeGui: true }));
  dat("MK-14: danhSachTheoPhanKhuc chỉ trả người đã đồng ý (l2)", dsGui.length === 1 && dsGui[0].id === l2.id && dsGui[0].dienThoai === dt(2));
  await voi(T, nvmk, (nc) => doiDongYNhanTin(nc, "lead", l2.id, { dongY: false, nguon: "Khách gọi xin hủy" }));
  dat("MK-13: từ chối nhận tin → biến khỏi danh sách gửi", (await voi(T, nvmk, (nc) => danhSachTheoPhanKhuc(nc, pk.id))).length === 0);
  await nemLoi("Thực tập sinh không lấy được danh sách KHÔNG che để gửi", "quyen", () => voi(T, tts, (nc) => danhSachTheoPhanKhuc(nc, pk.id, { boCheDeGui: true })));
  const pkLh = await voi(T, tpmk, (nc) => luuPhanKhuc(nc, null, LuocDoLuuPhanKhuc.parse({ ten: "Liên hệ khách", phanKhuc: { doiTuong: "lien-he", dieuKien: { coDienThoai: "co" } } })));
  const xtNv = await voi(T, nvmk, (nc) => xemTruocPhanKhuc(nc, pkLh.phanKhuc!));
  const xtTp = await voi(T, tpmk, (nc) => xemTruocPhanKhuc(nc, pkLh.phanKhuc!));
  dat("MK-15: nhân viên Marketing (không có customer.view) thấy SĐT liên hệ khách đã che", xtNv.mau.length > 0 && xtNv.mau.every((m) => m.daChe));
  dat("MK-15: Trưởng phòng Marketing (có customer.view) thấy đủ", xtTp.mau.every((m) => !m.daChe));

  // ------------------------------------------------------------------
  console.log("\n— Landing page (MK-16) —");
  dat("MK-16: ảnh javascript: bị từ chối", !LuocDoLanding.safeParse({ ten: "LP", tieuDe: "LP", khoi: [{ loai: "anh", url: "javascript:alert(1)", moTa: "x" }] }).success);
  dat("MK-16: khối có thuộc tính lạ (html) bị từ chối", !LuocDoLanding.safeParse({ ten: "LP", tieuDe: "LP", khoi: [{ loai: "doan-van", noiDung: "x", html: "<b>x</b>" }] }).success);
  await nemLoi("MK-16: trang có khối form mà không chọn form → từ chối", "dinh-dang", () =>
    voi(T, nvmk, (nc) => taoLanding(nc, LuocDoLanding.parse({ ten: "Trang thiếu form", tieuDe: "Thiếu form" }))),
  );
  const lp = await voi(T, nvmk, (nc) =>
    taoLanding(nc, LuocDoLanding.parse({
      ten: "Camera Tết", tieuDe: "Camera Tết 2027", formId: form.id, chienDichId: cd.id,
      khoi: [{ loai: "tieu-de", tieuDe: "Camera Tết" }, { loai: "form", tieuDe: "Đăng ký" }],
      khoiB: [{ loai: "tieu-de", tieuDe: "Camera Tết — giảm 10%" }, { loai: "form" }],
    })),
  );
  dat("MK-16: landing nháp không mở công khai", (await voiTenant(T, (tx) => docLandingCongKhai(tx, lp.slug, "A"))) === null);
  await voi(T, nvmk, (nc) => doiTrangThaiLanding(nc, lp.id, "xuat-ban"));
  const xemB = await voiTenant(T, (tx) => docLandingCongKhai(tx, lp.slug, "B"));
  dat("A/B: xem biến thể B dựng đúng khối B", xemB?.bienThe === "B" && xemB.khoi[0].loai === "tieu-de" && (xemB.khoi[0] as { tieuDe: string }).tieuDe.includes("10%"));
  await voiTenant(T, (tx) => guiFormCongKhai(tx, T, form.slug, { hoTen: "Khách landing", dienThoai: dt(16), landingId: lp.id }, { ...meta, landingPageId: lp.id, landingVariant: "B" }));
  const nkLp = await chu.leadCapture.findFirst({ where: { tenantId: T, landingPageId: lp.id } });
  dat("Lượt gửi từ landing ghi kênh landing + biến thể", nkLp?.channel === "landing" && nkLp.landingVariant === "B");
  dat("Lượt xem biến thể B được đếm", (await chu.landingPage.findUniqueOrThrow({ where: { id: lp.id } })).viewsB === 1);

  // ------------------------------------------------------------------
  console.log("\n— Bảng điều hành —");
  dat("Khối Marketing: không có marketing.view → null", (await voi(T, ktv, (nc) => khoiMarketingBangDieuKhien(nc))) === null);
  const khoi = await voi(T, tpmk, (nc) => khoiMarketingBangDieuKhien(nc));
  dat("Khối Marketing: có số lead tháng và theo nguồn", Boolean(khoi && khoi.soLeadThang >= 0 && Array.isArray(khoi.theoNguon)));

  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("Thử Marketing");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
