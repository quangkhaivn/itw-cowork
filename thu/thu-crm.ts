import { prisma, voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { capSoChungTu, KIEU_SO, namVN } from "../src/lib/so-chung-tu";
import { chiTietKhachHang, danhSachKhachHang, khach360, suaKhachHang, taoKhachHang, taoLienHe } from "../src/modules/khach-hang/service";
import { chiTietCoHoi, danhSachCoHoi, doiGiaiDoan, duLieuPipeline, suaCoHoi, taoCoHoi } from "../src/modules/co-hoi/service";
import { chiTietLead, chuyenDoiLead, danhSachLead, loaiLead, suaLead, taoLead } from "../src/modules/lead/service";
import { ghiTuongTac } from "../src/modules/tuong-tac/service";
import { danhSachViec, suaViec, taoViec } from "../src/modules/cong-viec/service";
import { timKiemToanCuc } from "../src/modules/tim-kiem/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { LuocDoTaoCoHoi } from "../src/modules/co-hoi/luoc-do";
import { LuocDoTaoLead, LuocDoChuyenDoiLead } from "../src/modules/lead/luoc-do";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng nghiệp vụ CRM (Phase 2) trên cơ sở dữ liệu THẬT, qua đúng service mà API gọi.
 * Luật được kiểm: BUSINESS_RULES.md mục 3 (KH, LD, CH, CV, TT).
 *
 * Mỗi lần chạy dựng một tenant thử mới (nhật ký chỉ-ghi-thêm nên không xóa được tenant cũ).
 * CHỈ chạy trên cơ sở dữ liệu phát triển.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
// MST thử 10 chữ số, khác nhau giữa các lần chạy (tenant mới mỗi lần nên không bắt buộc, nhưng rõ ràng hơn).
const MST_1 = `03${String(Date.now()).slice(-8)}`;
const MST_2 = `04${String(Date.now()).slice(-8)}`;
const HOM_NAY = new Date().toISOString().slice(0, 10);
const NGAY_MAI = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-crm"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "dinh-dang";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string): Promise<LoiNghiepVu | null> {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
    return null;
  } catch (e) {
    const dungKieu =
      kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "dinh-dang" ? e instanceof LoiDinhDang
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
    return e instanceof LoiNghiepVu ? e : null;
  }
}

async function main() {
  console.log("=== Thử CRM (Phase 2) ===\n");
  const tenant = await seedNenMong(chu, `thu-crm-${DAU}`, "Doanh nghiệp thử CRM");
  const T = tenant.id;
  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;

  async function nguoi(ten: string, vai: string, quanLyId?: string) {
    const u = await chu.user.create({
      data: {
        tenantId: T,
        email: `${ten}.${DAU}@thu.test`,
        passwordHash: "x",
        fullName: ten,
        userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
        staffProfile: { create: { tenantId: T, managerId: quanLyId ?? null } },
      },
    });
    return u.id;
  }
  const gd = await nguoi("giam-doc", "ceo");
  const tp = await nguoi("truong-phong", "sales-manager");
  const nv1 = await nguoi("nhan-vien-1", "sales", tp);
  const nv2 = await nguoi("nhan-vien-2", "sales", tp);
  const ngoai = await nguoi("nguoi-ngoai", "sales");
  const kyThuat = await nguoi("ky-thuat", "technical");
  console.log("");

  // ------------------------------------------------------------------
  console.log("— Khách hàng —");
  const k1 = await voi(T, nv1, (nc) =>
    taoKhachHang(nc, LuocDoTaoKhachHang.parse({
      ten: "Công ty TNHH Thiết Bị Ánh Dương",
      maSoThue: `${MST_1.slice(0, 4)}.${MST_1.slice(4)}`,
      dienThoai: "+84 909 111 222",
      email: "Mua.Hang@AnhDuong.vn",
      phanKhuc: "doanh-nghiep",
      lienHe: { hoTen: "Trần Mua Hàng", dienThoai: "0912 333 444", email: "tmh@anhduong.vn" },
    })),
  );
  dat("KH-01: mã khách dạng KH-000001", /^KH-\d{6}$/.test(k1.ma), k1.ma);
  dat("KH-05: người tạo là người phụ trách mặc định", k1.nguoiPhuTrach.id === nv1);
  const dongK1 = await chu.customer.findUniqueOrThrow({ where: { id: k1.id } });
  dat("KH-07: điện thoại chuẩn hóa về 0xxxxxxxxx", dongK1.phoneNormalized === "0909111222", String(dongK1.phoneNormalized));
  dat("KH-07: email chữ thường", dongK1.emailNormalized === "mua.hang@anhduong.vn");
  dat("KH-02: MST chuẩn hóa chỉ còn chữ số", dongK1.taxCodeNormalized === MST_1);
  dat("Tên chuẩn hóa bỏ dấu và bỏ loại hình pháp nhân", dongK1.nameNormalized === "thiet bi anh duong", dongK1.nameNormalized);
  dat("Tạo kèm liên hệ chính", (await chu.contact.count({ where: { customerId: k1.id, isPrimary: true } })) === 1);

  await nemLoi("KH-05: nhân viên 'own' không giao khách cho đồng nghiệp", "nghiep-vu", () =>
    voi(T, nv1, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Khách giao sai", nguoiPhuTrachId: nv2 }))),
    "ngoai-pham-vi",
  );
  await nemLoi("Mã dữ liệu gốc không tồn tại bị từ chối", "dinh-dang", () =>
    voi(T, nv1, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Khách phân khúc lạ", phanKhuc: "khong-co" }))),
  );
  await nemLoi("MST sai dạng (8 số) bị từ chối", "dinh-dang", () =>
    voi(T, nv1, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Khách MST sai", maSoThue: "12345678" }))),
  );

  const loiMst = await nemLoi("KH-02 + KH-04: trùng MST bị chặn kể cả khi khách cũ ngoài phạm vi người nhập", "nghiep-vu", () =>
    voi(T, nv2, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Tên khác hẳn", maSoThue: MST_1, xacNhanKhongTrung: true }))),
    "trung-ma-so-thue",
  );
  dat("Thông báo trùng MST nêu mã khách cũ", Boolean(loiMst?.message.includes(k1.ma)));

  const loiDt = await nemLoi("KH-03: trùng điện thoại của LIÊN HỆ → cảnh báo, chưa lưu", "nghiep-vu", () =>
    voi(T, nv2, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Khách mới hoàn toàn", dienThoai: "0912333444" }))),
    "co-the-trung",
  );
  const uv = (loiDt?.chiTiet as { ungVien: { id: string; moDuoc: boolean; lyDo: string[] }[] } | undefined)?.ungVien ?? [];
  dat("Cảnh báo trả đúng khách cũ", uv.some((u) => u.id === k1.id && u.lyDo.includes("Trùng số điện thoại")));
  dat("KH-04: khách ngoài phạm vi được đánh dấu không mở được", uv.every((u) => u.moDuoc === false));
  const k2 = await voi(T, nv2, (nc) =>
    taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Khách mới hoàn toàn", dienThoai: "0912333444", maSoThue: MST_2, xacNhanKhongTrung: true })),
  );
  dat("KH-03: xác nhận 'khách mới' thì lưu được", Boolean(k2.id));

  await nemLoi("KH-03: tên gần giống ('Ánh Dương Co., Ltd') → cảnh báo", "nghiep-vu", () =>
    voi(T, gd, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Thiết bị Ánh Dương Co., Ltd" }))),
    "co-the-trung",
  );

  // Phạm vi
  await nemLoi("Phạm vi own: NV2 không xem được khách của NV1", "khong-thay", () => voi(T, nv2, (nc) => chiTietKhachHang(nc, k1.id)));
  const dsTp = await voi(T, tp, (nc) => danhSachKhachHang(nc, { q: "", nguoiPhuTrach: "", phanKhuc: "", trangThai: "", trang: 1, coTrang: 20 }));
  dat("Phạm vi team: trưởng phòng thấy khách của cả NV1 và NV2", dsTp.tong === 2, `thấy ${dsTp.tong}`);
  const dsNgoai = await voi(T, ngoai, (nc) => danhSachKhachHang(nc, { q: "", nguoiPhuTrach: "", phanKhuc: "", trangThai: "", trang: 1, coTrang: 20 }));
  dat("Người ngoài nhóm không thấy khách nào", dsNgoai.tong === 0);
  const timSo = await voi(T, nv1, (nc) => danhSachKhachHang(nc, { q: "0909 111", nguoiPhuTrach: "", phanKhuc: "", trangThai: "", trang: 1, coTrang: 20 }));
  dat("Tìm khách theo số điện thoại viết có khoảng trắng", timSo.tong === 1);
  const timMst = await voi(T, nv1, (nc) => danhSachKhachHang(nc, { q: MST_1.slice(0, 6), nguoiPhuTrach: "", phanKhuc: "", trangThai: "", trang: 1, coTrang: 20 }));
  dat("Tìm khách theo mã số thuế", timMst.tong === 1);

  await nemLoi("NV2 không sửa được khách của NV1", "khong-thay", () => voi(T, nv2, (nc) => suaKhachHang(nc, k1.id, { ten: "Sửa trộm", xacNhanKhongTrung: false })));
  const k1Sua = await voi(T, tp, (nc) => suaKhachHang(nc, k1.id, { diaChi: "748 Lạc Long Quân", xacNhanKhongTrung: false }));
  dat("Trưởng phòng sửa được khách của cấp dưới", k1Sua.diaChi === "748 Lạc Long Quân");
  const nhatKySua = await chu.auditLog.findFirst({ where: { tenantId: T, objectType: "customer", objectId: k1.id, action: "sua" } });
  dat("Sửa khách có Audit Log trước/sau", (nhatKySua?.after as { diaChi?: string } | null)?.diaChi === "748 Lạc Long Quân");
  await nemLoi("Kỹ thuật viên (chỉ xem khách) không tạo được khách", "quyen", () =>
    voi(T, kyThuat, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Khách của kỹ thuật" }))),
  );

  // Cấp số đồng thời
  const soDongThoi = await Promise.all(Array.from({ length: 12 }, () => voiTenant(T, (tx) => capSoChungTu(tx, KIEU_SO.lead))));
  dat("KH-01: 12 lần cấp số đồng thời ra 12 số khác nhau", new Set(soDongThoi).size === 12, soDongThoi.join(","));

  // ------------------------------------------------------------------
  console.log("\n— Cơ hội —");
  const ch1 = await voi(T, nv1, (nc) =>
    taoCoHoi(nc, LuocDoTaoCoHoi.parse({
      khachHangId: k1.id,
      tieuDe: "20 bộ PC văn phòng",
      giaTri: "240.000.000",
      hanhDongKeTiep: "Gửi cấu hình đề xuất",
      ngayHanhDong: HOM_NAY,
    })),
  );
  dat("CH-08: mã cơ hội CH-<năm VN>-0001", ch1.ma === `CH-${namVN()}-0001`, ch1.ma);
  dat("Giá trị '240.000.000' ghi đúng 240 triệu", ch1.giaTri === "240000000", ch1.giaTri);
  await nemLoi("CH-07: NV2 không mở cơ hội trên khách của NV1", "khong-thay", () =>
    voi(T, nv2, (nc) => taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: k1.id, tieuDe: "Cơ hội trộm", hanhDongKeTiep: "Gọi", ngayHanhDong: HOM_NAY }))),
  );
  dat("CH-02: lược đồ từ chối cơ hội thiếu hành động kế tiếp", !LuocDoTaoCoHoi.safeParse({ khachHangId: k1.id, tieuDe: "Thiếu", ngayHanhDong: HOM_NAY }).success);

  let chanCsdl = false;
  try {
    await chu.opportunity.update({ where: { id: ch1.id }, data: { nextAction: null } });
  } catch {
    chanCsdl = true;
  }
  dat("CH-02: CSDL chặn cơ hội đang mở mà xóa hành động kế tiếp (kể cả vai chủ sở hữu)", chanCsdl);

  const quyenNv2 = await voi(T, nv2, async (nc) => {
    try {
      await chiTietCoHoi(nc, ch1.id);
      return "thay";
    } catch (e) {
      return e instanceof LoiKhongTimThay ? "khong-thay" : String(e);
    }
  });
  dat("Phạm vi: NV2 không thấy cơ hội của NV1", quyenNv2 === "khong-thay");

  const ch1b = await voi(T, nv1, (nc) => doiGiaiDoan(nc, ch1.id, { giaiDoan: "QUOTATION" }));
  dat("Đổi giai đoạn giữ hành động kế tiếp, xác suất theo gợi ý", ch1b.giaiDoan === "QUOTATION" && ch1b.xacSuat === 40, `${ch1b.giaiDoan} ${ch1b.xacSuat}`);
  await nemLoi("CH-03: thua mà không có lý do bị từ chối", "dinh-dang", () => voi(T, nv1, (nc) => doiGiaiDoan(nc, ch1.id, { giaiDoan: "LOST" })));
  await nemLoi("CH-03: lý do thua ngoài Dữ liệu gốc bị từ chối", "dinh-dang", () =>
    voi(T, nv1, (nc) => doiGiaiDoan(nc, ch1.id, { giaiDoan: "LOST", lyDoThua: "tu-che" })),
  );
  const thua = await voi(T, nv1, (nc) => doiGiaiDoan(nc, ch1.id, { giaiDoan: "LOST", lyDoThua: "gia-cao", ghiChuThua: "Đối thủ rẻ hơn 5%" }));
  dat("CH-05: thua → xác suất 0 và có thời điểm đóng", thua.xacSuat === 0 && Boolean(thua.dongLuc));
  dat("Sự kiện OPPORTUNITY_LOST được ghi", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "OPPORTUNITY_LOST", objectId: ch1.id } })) === 1);
  await nemLoi("Cơ hội đã đóng không sửa được", "nghiep-vu", () => voi(T, nv1, (nc) => suaCoHoi(nc, ch1.id, { tieuDe: "Sửa sau khi thua" })), "da-dong");
  await nemLoi("CH-06: nhân viên không mở lại được cơ hội đã đóng", "quyen", () =>
    voi(T, nv1, (nc) => doiGiaiDoan(nc, ch1.id, { giaiDoan: "NEGOTIATION", hanhDongKeTiep: "Gọi lại", ngayHanhDong: NGAY_MAI })),
  );
  await nemLoi("CH-02: mở lại mà không nhập hành động kế tiếp bị từ chối", "dinh-dang", () =>
    voi(T, tp, (nc) => doiGiaiDoan(nc, ch1.id, { giaiDoan: "NEGOTIATION" })),
  );
  const moLai = await voi(T, tp, (nc) => doiGiaiDoan(nc, ch1.id, { giaiDoan: "NEGOTIATION", hanhDongKeTiep: "Gọi lại chốt giá", ngayHanhDong: NGAY_MAI }));
  dat("CH-06: trưởng phòng mở lại được; lý do thua và thời điểm đóng bị xóa", moLai.giaiDoan === "NEGOTIATION" && !moLai.lyDoThua && !moLai.dongLuc);
  const thang = await voi(T, nv1, (nc) => doiGiaiDoan(nc, ch1.id, { giaiDoan: "WON" }));
  dat("CH-05: thắng → xác suất 100", thang.xacSuat === 100);

  const ch2 = await voi(T, nv2, (nc) =>
    taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: k2.id, tieuDe: "Camera nhà xưởng", giaTri: 100000000, xacSuat: 50, hanhDongKeTiep: "Khảo sát", ngayHanhDong: "2020-01-01" })),
  );
  const dsCh = await voi(T, tp, (nc) => danhSachCoHoi(nc, { q: "", giaiDoan: "dang-mo", nguoiPhuTrach: "", khachHang: "", quaHan: "", trang: 1, coTrang: 20 }));
  dat("CH-09: pipeline có trọng số = 100tr × 50% = 50tr", dsCh.pipeline.coTrongSo === 50_000_000 && dsCh.pipeline.tong === 100_000_000, JSON.stringify(dsCh.pipeline));
  const quaHan = await voi(T, tp, (nc) => danhSachCoHoi(nc, { q: "", giaiDoan: "dang-mo", nguoiPhuTrach: "", khachHang: "", quaHan: "1", trang: 1, coTrang: 20 }));
  dat("Lọc cơ hội quá hạn hành động kế tiếp", quaHan.tong === 1 && quaHan.dong[0].id === ch2.id);
  const pl = await voi(T, tp, (nc) => duLieuPipeline(nc, { nguoiPhuTrach: "" }));
  dat("Pipeline Kanban có đủ 8 cột (3 lead + 5 cơ hội)", pl.cot.length === 8, pl.cot.map((c) => c.giaiDoan).join(","));
  dat("Thẻ quá hạn được đánh dấu trên Kanban", pl.cot.find((c) => c.giaiDoan === "OPPORTUNITY")?.the.some((t) => t.id === ch2.id && t.quaHan) === true);

  // ------------------------------------------------------------------
  console.log("\n— Lead —");
  await nemLoi("LD-02: lead không có điện thoại lẫn email bị từ chối", "dinh-dang", () =>
    voi(T, nv1, (nc) => taoLead(nc, LuocDoTaoLead.parse({ hoTen: "Không liên lạc được" }))),
  );
  const ld = await voi(T, nv1, (nc) =>
    taoLead(nc, LuocDoTaoLead.parse({ hoTen: "Lê Văn Khách", congTy: "Nhà máy Bao Bì Sao Mai", dienThoai: "0988 777 666", nguon: "website", nhuCau: "30 camera cho nhà xưởng", giaTriUocTinh: "90000000" })),
  );
  dat("Mã lead dạng LD-000xxx", /^LD-\d{6}$/.test(ld.ma), ld.ma);
  dat("Sự kiện LEAD_CAPTURED được ghi", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "LEAD_CAPTURED", objectId: ld.id } })) === 1);
  await nemLoi("LD-03: lead trùng số điện thoại với lead đang mở → cảnh báo", "nghiep-vu", () =>
    voi(T, nv1, (nc) => taoLead(nc, LuocDoTaoLead.parse({ hoTen: "Người khác", dienThoai: "0988777666" }))),
    "co-the-trung",
  );
  await nemLoi("LD-03: lead trùng điện thoại liên hệ của khách cũ → cảnh báo", "nghiep-vu", () =>
    voi(T, nv1, (nc) => taoLead(nc, LuocDoTaoLead.parse({ hoTen: "Trần Mua Hàng", dienThoai: "0912333444" }))),
    "co-the-trung",
  );

  await voi(T, nv1, (nc) => ghiTuongTac(nc, { loai: "call", tieuDe: "Gọi xác nhận nhu cầu", khachHangId: null, lienHeId: null, leadId: ld.id, coHoiId: null, noiDung: "Khách cần báo giá tuần sau", ketQua: null, luc: null }));
  const ldSauGoi = await voi(T, nv1, (nc) => chiTietLead(nc, ld.id));
  dat("LD-04: tương tác đầu tiên chuyển lead sang Đã liên hệ", ldSauGoi.lead.giaiDoan === "CONTACTED");
  await nemLoi("Tương tác không được ở tương lai", "dinh-dang", () =>
    voi(T, nv1, (nc) => ghiTuongTac(nc, { loai: "note", tieuDe: "Tương lai", khachHangId: k1.id, lienHeId: null, leadId: null, coHoiId: null, noiDung: null, ketQua: null, luc: new Date(Date.now() + 86400000) })),
  );
  const viecLead = await voi(T, nv1, (nc) => taoViec(nc, { tieuDe: "Gửi hồ sơ năng lực", uuTien: "cao", han: new Date(Date.now() + 3600000), leadId: ld.id, khachHangId: null, coHoiId: null, moTa: null, nguoiPhuTrachId: null }));

  // LD-05 tính nguyên tử: chuyển đổi với MST trùng khách cũ → lỗi → không có gì được ghi.
  const truocKhach = await chu.customer.count({ where: { tenantId: T } });
  const truocLienHe = await chu.contact.count({ where: { tenantId: T } });
  await nemLoi("LD-05: chuyển đổi với MST đã có → lỗi", "nghiep-vu", () =>
    voi(T, nv1, (nc) =>
      chuyenDoiLead(nc, ld.id, LuocDoChuyenDoiLead.parse({
        khachMoi: { ten: "Nhà máy Bao Bì Sao Mai", maSoThue: MST_1 },
        coHoi: { tieuDe: "30 camera", giaTri: "90000000", hanhDongKeTiep: "Khảo sát", ngayHanhDong: NGAY_MAI },
      })),
    ),
    "trung-ma-so-thue",
  );
  dat(
    "LD-05: lỗi giữa chừng không để lại khách/liên hệ dở dang",
    (await chu.customer.count({ where: { tenantId: T } })) === truocKhach && (await chu.contact.count({ where: { tenantId: T } })) === truocLienHe,
  );
  dat("LD-05: lead vẫn mở sau khi chuyển đổi thất bại", (await chu.lead.findUniqueOrThrow({ where: { id: ld.id } })).stage === "CONTACTED");

  const cd = await voi(T, nv1, (nc) =>
    chuyenDoiLead(nc, ld.id, LuocDoChuyenDoiLead.parse({
      khachMoi: { ten: "Nhà máy Bao Bì Sao Mai", phanKhuc: "nha-may" },
      coHoi: { tieuDe: "30 camera nhà xưởng", giaTri: "90000000", hanhDongKeTiep: "Khảo sát mặt bằng", ngayHanhDong: NGAY_MAI },
    })),
  );
  dat("LD-05: chuyển đổi tạo khách + cơ hội, lead thành CONVERTED", cd.lead.giaiDoan === "CONVERTED" && Boolean(cd.khachHangId) && Boolean(cd.coHoiId));
  const lhMoi = await chu.contact.findFirst({ where: { customerId: cd.khachHangId } });
  dat("LD-05: liên hệ lấy từ người của lead, là liên hệ chính", lhMoi?.fullName === "Lê Văn Khách" && lhMoi?.phoneNormalized === "0988777666" && lhMoi.isPrimary);
  const tt = await chu.interaction.findFirst({ where: { leadId: ld.id } });
  dat("Tương tác cũ của lead đi theo sang khách", tt?.customerId === cd.khachHangId);
  dat("Công việc của lead đi theo sang khách", (await chu.task.findUniqueOrThrow({ where: { id: viecLead.id } })).customerId === cd.khachHangId);
  await nemLoi("LD-06: không chuyển đổi lại lead đã chuyển", "nghiep-vu", () =>
    voi(T, nv1, (nc) => chuyenDoiLead(nc, ld.id, LuocDoChuyenDoiLead.parse({ khachHangId: k1.id }))),
    "khong-dang-mo",
  );
  await nemLoi("LD-06: không sửa lead đã chuyển", "nghiep-vu", () => voi(T, nv1, (nc) => suaLead(nc, ld.id, { hoTen: "Sửa", xacNhanKhongTrung: false })), "da-chuyen-doi");

  const ld2 = await voi(T, nv1, (nc) => taoLead(nc, LuocDoTaoLead.parse({ hoTen: "Khách ảo", email: `ao.${DAU}@thu.test` })));
  await voi(T, nv1, (nc) => loaiLead(nc, ld2.id, "Số ảo, không có nhu cầu"));
  const dsLd = await voi(T, nv1, (nc) => danhSachLead(nc, { q: "", giaiDoan: "", nguon: "", nguoiPhuTrach: "", trang: 1, coTrang: 20 }));
  dat("Danh sách lead mặc định chỉ hiện lead đang mở", dsLd.dong.every((l) => ["NEW_LEAD", "CONTACTED", "QUALIFIED"].includes(l.giaiDoan)));
  const moLaiLd = await voi(T, nv1, (nc) => suaLead(nc, ld2.id, { giaiDoan: "NEW_LEAD", xacNhanKhongTrung: false }));
  dat("Lead đã loại mở lại được, lý do loại bị xóa", moLaiLd.giaiDoan === "NEW_LEAD" && !moLaiLd.lyDoLoai);

  // ------------------------------------------------------------------
  console.log("\n— Tương tác, công việc, Customer 360 —");
  await voi(T, nv1, (nc) => ghiTuongTac(nc, { loai: "meeting", tieuDe: "Họp chốt cấu hình", coHoiId: ch1.id, khachHangId: null, lienHeId: null, leadId: null, noiDung: null, ketQua: "Khách đồng ý", luc: null }));
  const ttCh = await chu.interaction.findFirst({ where: { tenantId: T, opportunityId: ch1.id } });
  dat("TT-03: tương tác gắn cơ hội tự gắn khách của cơ hội", ttCh?.customerId === k1.id);
  let chanTt = false;
  try {
    await chu.interaction.create({ data: { tenantId: T, type: "note", subject: "Mồ côi", ownerId: nv1 } });
  } catch {
    chanTt = true;
  }
  dat("TT-02: CSDL chặn tương tác không gắn khách lẫn lead", chanTt);

  await nemLoi("CV: nhân viên 'own' không giao việc cho đồng nghiệp", "nghiep-vu", () =>
    voi(T, nv1, (nc) => taoViec(nc, { tieuDe: "Giao sai", nguoiPhuTrachId: nv2, uuTien: "thap", han: null, khachHangId: null, leadId: null, coHoiId: null, moTa: null })),
    "ngoai-pham-vi",
  );
  const viec = await voi(T, tp, (nc) =>
    taoViec(nc, { tieuDe: "Gọi lại khách Ánh Dương", nguoiPhuTrachId: nv1, uuTien: "khan", han: new Date(Date.now() - 3600000), khachHangId: k1.id, leadId: null, coHoiId: null, moTa: null }),
  );
  dat("Trưởng phòng giao việc cho cấp dưới", viec.nguoiPhuTrach.id === nv1 && viec.quaHan);
  const dsViec = await voi(T, nv1, (nc) => danhSachViec(nc, { cheDo: "qua-han", trangThai: "", nguoiPhuTrach: "", q: "", trang: 1, coTrang: 30 }));
  dat("CV-02: việc quá hạn hiện trong danh sách quá hạn", dsViec.dong.some((v) => v.id === viec.id) && dsViec.soQuaHanCuaToi >= 1);
  const xong = await voi(T, nv1, (nc) => suaViec(nc, viec.id, { trangThai: "xong" }));
  dat("CV-01: hoàn thành ghi thời điểm xong", xong.trangThai === "xong" && Boolean(xong.xongLuc));
  await nemLoi("CV: NV2 không sửa được việc của NV1", "khong-thay", () => voi(T, nv2, (nc) => suaViec(nc, viec.id, { trangThai: "huy" })));

  const k360 = await voi(T, nv1, (nc) => khach360(nc, k1.id));
  const loai = new Set(k360.dongThoiGian.map((m) => m.loai));
  dat("Customer 360: dòng thời gian có tạo khách, cơ hội, thắng, tương tác, việc", ["khach-hang", "co-hoi", "thang", "tuong-tac", "viec-xong"].every((x) => loai.has(x)), [...loai].join(","));
  dat("Customer 360: dòng thời gian xếp mới nhất trước", k360.dongThoiGian.every((m, i, a) => i === 0 || a[i - 1].thoiDiem >= m.thoiDiem));
  dat("Customer 360: thống kê cơ hội thắng", k360.thongKe.soCoHoiThang === 1 && k360.thongKe.giaTriDaThang === 240_000_000);

  const lhThem = await voi(T, nv1, (nc) => taoLienHe(nc, k1.id, { hoTen: "Kế toán Ánh Dương", email: "ketoan@anhduong.vn", laChinh: true }));
  dat("Đặt liên hệ chính mới thì liên hệ chính cũ bị bỏ cờ", (await chu.contact.count({ where: { customerId: k1.id, isPrimary: true } })) === 1 && lhThem.laChinh);

  // ------------------------------------------------------------------
  console.log("\n— Tìm kiếm toàn cục —");
  const kqTim = await voi(T, nv1, (nc) => timKiemToanCuc(nc, MST_1));
  dat("Tìm theo MST ra khách hàng", kqTim.some((k) => k.loai === "khach-hang" && k.href.endsWith(k1.id)));
  const kqTimDt = await voi(T, nv1, (nc) => timKiemToanCuc(nc, "0912 333 444"));
  dat("Tìm theo điện thoại liên hệ ra liên hệ, dẫn về khách", kqTimDt.some((k) => k.loai === "lien-he" && k.href.includes(k1.id)));
  const kqTimNv2 = await voi(T, nv2, (nc) => timKiemToanCuc(nc, "Ánh Dương"));
  dat("Tìm kiếm tôn trọng phạm vi: NV2 không thấy khách của NV1", !kqTimNv2.some((k) => k.href.endsWith(k1.id)));
  const kqCh = await voi(T, nv1, (nc) => timKiemToanCuc(nc, ch1.ma));
  dat("Tìm theo mã cơ hội", kqCh.some((k) => k.loai === "co-hoi"));

  // ------------------------------------------------------------------
  console.log("\n— Cách ly tenant —");
  const tenantKhac = await chu.tenant.findFirst({ where: { code: "itw" } });
  if (tenantKhac) {
    const thay = await voiTenant(tenantKhac.id, (tx) => tx.customer.count({ where: { id: k1.id } }));
    dat("Tenant khác không thấy khách của tenant thử", thay === 0);
  }

  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("Thử CRM");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
