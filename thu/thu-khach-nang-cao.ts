import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { homNayVN } from "../src/modules/crm/chung";
import { congNgay } from "../src/modules/nhac-viec/tinh-toan";
import { chiTietKhachHang, danhSachKhachHang, demTheoHanhTrinh, suaKhachHang, taoKhachHang, taoLienHe } from "../src/modules/khach-hang/service";
import { LuocDoLocKhachHang, LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { doiGiaiDoan, taoCoHoi } from "../src/modules/co-hoi/service";
import { LuocDoTaoCoHoi } from "../src/modules/co-hoi/luoc-do";
import { ghiTuongTac } from "../src/modules/tuong-tac/service";
import { taoViec } from "../src/modules/cong-viec/service";
import { chuyenDoiLead, taoLead } from "../src/modules/lead/service";
import { LuocDoChuyenDoiLead, LuocDoTaoLead } from "../src/modules/lead/luoc-do";
import { guiKhach, quyetDuyet, taoBaoGia, xinDuyet } from "../src/modules/bao-gia/service";
import { LuocDoTaoBaoGia } from "../src/modules/bao-gia/luoc-do";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { chayQuet } from "../src/modules/nhac-viec/service";
import {
  danhSachTrangThaiHanhTrinh, doiHanhTrinh, lichSuHanhTrinh, suaTrangThaiHanhTrinh, taoTrangThaiHanhTrinh,
  tongQuanHanhTrinh, xepThuTuTrangThai,
} from "../src/modules/hanh-trinh/service";
import { LuocDoTrangThaiHanhTrinh } from "../src/modules/hanh-trinh/luoc-do";
import { danhSachNhomKhach, datNhomChoKhach, ganKhachVaoNhom, taoNhomKhach } from "../src/modules/nhom-khach/service";
import { LuocDoHangLoat, thaoTacHangLoat } from "../src/modules/khach-hang/hang-loat";
import { danhSachBoLoc, goBoLoc, kiemTraThamSoBoLoc, luuBoLoc, luuTuyChonDanhSach, tuyChonDanhSach } from "../src/modules/khach-hang/bo-loc";
import { diemCuaKhach, luuDiemNguon, tinhLaiToanBo, xemCauHinhDiem } from "../src/modules/cham-diem/service";
import { gopKhach, xemTruocGop } from "../src/modules/khach-hang/gop";
import { nhapKhachCsv, xuatKhachCsv } from "../src/modules/khach-hang/nhap-xuat";
import { banGiao, xemTruocBanGiao } from "../src/modules/ban-giao/service";
import { timCongCu } from "../src/modules/tro-ly/cong-cu";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng gói "Khách hàng nâng cao" (0.16.0) trên CSDL THẬT, qua đúng service mà API gọi.
 * Luật: BUSINESS_RULES.md mục 21 (KHN-01 → KHN-17).
 *
 * Mỗi lần chạy dựng hai tenant thử mới (nhật ký chỉ-ghi-thêm nên không xóa được tenant cũ).
 * CHỈ chạy trên cơ sở dữ liệu phát triển.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const so8 = String(Date.now()).slice(-8);
const MST = (dau: string) => `${dau}${so8}`;
const HOM_NAY = homNayVN();
const NGAY_MAI = congNgay(HOM_NAY, 1);

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-khach-nang-cao"));
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

async function nemLoiCsdl(ten: string, khoi: () => Promise<unknown>) {
  try {
    await khoi();
    dat(ten, false, "CSDL không chặn");
  } catch {
    dat(ten, true);
  }
}

const loc = (x: Record<string, unknown> = {}) => LuocDoLocKhachHang.parse(x);

async function main() {
  console.log("=== Thử Khách hàng nâng cao (0.16.0) ===\n");
  const tenant = await seedNenMong(chu, `thu-khn-${DAU}`, "Doanh nghiệp thử Khách hàng nâng cao");
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
  const kyThuat = await nguoi("ky-thuat", "technical");
  const nghiViec = await nguoi("nghi-viec", "sales", tp);
  console.log("");

  // ------------------------------------------------------------------
  console.log("— Hành trình: danh mục trạng thái —");
  const danhMuc = await voi(T, nv1, (nc) => danhSachTrangThaiHanhTrinh(nc));
  dat("Doanh nghiệp mới có 5 trạng thái khởi tạo", danhMuc.length === 5, String(danhMuc.length));
  dat("Trạng thái khởi tạo không có số ngày đứng lâu (không bịa số)", danhMuc.every((t) => t.soNgayDungLau === null));
  const st = Object.fromEntries(danhMuc.map((t) => [t.ma, t]));
  dat("KHN-03: mốc tự chuyển gắn sẵn cho Khách mới / Đang tư vấn / Đã báo giá / Đã chốt đơn",
    st["khach-moi"].mocTuDong === "tao-khach" && st["dang-tu-van"].mocTuDong === "co-hoi-mo" && st["da-bao-gia"].mocTuDong === "bao-gia-da-gui" && st["da-chot-don"].mocTuDong === "don-xac-nhan");
  const tpHasApprove = await chu.rolePermission.count({ where: { role: { tenantId: T, code: "sales-manager" }, permission: { code: "customer.approve" } } });
  dat("Trưởng phòng Kinh doanh có customer.approve (khớp vai-tro.ts, QĐ-37)", tpHasApprove === 1);

  await nemLoi("Nhân viên không tạo được trạng thái hành trình", "quyen", () =>
    voi(T, nv1, (nc) => taoTrangThaiHanhTrinh(nc, LuocDoTrangThaiHanhTrinh.parse({ ten: "Thử", mau: "#123456" }))),
  );
  const ttMoi = await voi(T, tp, (nc) => taoTrangThaiHanhTrinh(nc, LuocDoTrangThaiHanhTrinh.parse({ ten: "Đã khảo sát", mau: "#7C3AED" })));
  dat("Trưởng phòng tạo được trạng thái; mã sinh từ tên", ttMoi?.ma === "da-khao-sat", ttMoi?.ma);
  await nemLoi("KHN-03: một mốc chỉ gắn một trạng thái", "nghiep-vu", () =>
    voi(T, tp, (nc) => taoTrangThaiHanhTrinh(nc, LuocDoTrangThaiHanhTrinh.parse({ ten: "Mới 2", mau: "#123456", mocTuDong: "tao-khach" }))),
    "trung-moc",
  );
  await nemLoi("KHN-03: trạng thái thất bại không nhận mốc tự chuyển", "nghiep-vu", () =>
    voi(T, tp, (nc) => taoTrangThaiHanhTrinh(nc, LuocDoTrangThaiHanhTrinh.parse({ ten: "Bỏ", mau: "#123456", loai: "that-bai", mocTuDong: "co-hoi-thang" }))),
    "moc-that-bai",
  );
  dat("Lược đồ từ chối màu sai dạng", !LuocDoTrangThaiHanhTrinh.safeParse({ ten: "X", mau: "đỏ" }).success);
  await nemLoiCsdl("KHN-01: CSDL chặn màu sai dạng kể cả vai chủ sở hữu", () =>
    chu.customerJourneyStage.update({ where: { id: ttMoi!.id }, data: { color: "red" } }),
  );
  await nemLoiCsdl("KHN-14: CSDL chặn số ngày đứng lâu ngoài 1–365", () =>
    chu.customerJourneyStage.update({ where: { id: ttMoi!.id }, data: { staleDays: 0 } }),
  );
  await nemLoi("Sắp xếp thiếu trạng thái bị từ chối", "nghiep-vu", () => voi(T, tp, (nc) => xepThuTuTrangThai(nc, [ttMoi!.id])), "lech-danh-sach");
  // Đưa "Đã khảo sát" vào giữa "Đang tư vấn" và "Đã báo giá".
  const thuTu = [st["khach-moi"].id, st["dang-tu-van"].id, ttMoi!.id, st["da-bao-gia"].id, st["da-chot-don"].id, st["ngung-quan-tam"].id];
  const sauXep = await voi(T, tp, (nc) => xepThuTuTrangThai(nc, thuTu));
  dat("Sắp xếp lưu đúng thứ tự mới", sauXep.map((t) => t.id).join() === thuTu.join());

  // ------------------------------------------------------------------
  console.log("\n— Hành trình: tự chuyển bước và đổi tay —");
  const k1 = await voi(T, nv1, (nc) =>
    taoKhachHang(nc, LuocDoTaoKhachHang.parse({ xacNhanKhongTrung: true, ten: `Công ty Hành Trình Một ${DAU}`, maSoThue: MST("31"), dienThoai: "0901000001" })),
  );
  const k1Sau = await voi(T, nv1, (nc) => chiTietKhachHang(nc, k1.id));
  dat("KHN-04: tạo khách tự vào trạng thái mốc 'tao-khach'", k1Sau.hanhTrinh?.id === st["khach-moi"].id, k1Sau.hanhTrinh?.ten);
  dat("KHN-01: customers.status không bị đụng", k1Sau.trangThai === "tiem-nang");
  const ls1 = await chu.customerJourneyHistory.findMany({ where: { customerId: k1.id } });
  dat("KHN-02: lần tự chuyển ghi lịch sử (tự động, có mốc, có người gây ra)", ls1.length === 1 && ls1[0].isAuto && ls1[0].milestone === "tao-khach" && ls1[0].changedBy === nv1 && ls1[0].fromStageId === null);

  const ch1 = await voi(T, nv1, (nc) =>
    taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: k1.id, tieuDe: "10 PC", giaTri: "100000000", hanhDongKeTiep: "Gọi", ngayHanhDong: NGAY_MAI })),
  );
  dat("KHN-04: mở cơ hội tự chuyển sang 'Đang tư vấn'", (await voi(T, nv1, (nc) => chiTietKhachHang(nc, k1.id))).hanhTrinh?.id === st["dang-tu-van"].id);

  await voi(T, nv1, (nc) => doiHanhTrinh(nc, k1.id, { trangThaiId: st["da-bao-gia"].id, ghiChu: "Đã gửi giá qua Zalo" }));
  await voi(T, nv1, (nc) =>
    taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: k1.id, tieuDe: "Thêm máy in", giaTri: "5000000", hanhDongKeTiep: "Gọi", ngayHanhDong: NGAY_MAI })),
  );
  dat("KHN-04: tự chuyển KHÔNG lùi (cơ hội mới không kéo về 'Đang tư vấn')", (await voi(T, nv1, (nc) => chiTietKhachHang(nc, k1.id))).hanhTrinh?.id === st["da-bao-gia"].id);
  const ls1b = await voi(T, nv1, (nc) => lichSuHanhTrinh(nc, k1.id));
  dat("Lịch sử có lần đổi tay kèm ghi chú và người đổi", ls1b.some((l) => !l.tuDong && l.ghiChu === "Đã gửi giá qua Zalo" && l.nguoi === "nhan-vien-1"));

  await nemLoi("Phạm vi own: NV2 không đổi được hành trình khách của NV1", "khong-thay", () =>
    voi(T, nv2, (nc) => doiHanhTrinh(nc, k1.id, { trangThaiId: st["khach-moi"].id, ghiChu: null })),
  );
  await nemLoi("Kỹ thuật viên (chỉ xem khách) không đổi được hành trình", "quyen", () =>
    voi(T, kyThuat, (nc) => doiHanhTrinh(nc, k1.id, { trangThaiId: st["khach-moi"].id, ghiChu: null })),
  );

  // Thất bại → chỉ mốc mạnh kéo lại.
  await voi(T, nv1, (nc) => doiHanhTrinh(nc, k1.id, { trangThaiId: st["ngung-quan-tam"].id, ghiChu: "Khách hoãn" }));
  await voi(T, nv1, (nc) =>
    taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: k1.id, tieuDe: "Hỏi lại", giaTri: "1000000", hanhDongKeTiep: "Gọi", ngayHanhDong: NGAY_MAI })),
  );
  dat("KHN-04: khách thất bại — mở cơ hội KHÔNG kéo lại", (await voi(T, nv1, (nc) => chiTietKhachHang(nc, k1.id))).hanhTrinh?.id === st["ngung-quan-tam"].id);
  const bg = await voi(T, gd, (nc) =>
    taoBaoGia(nc, LuocDoTaoBaoGia.parse({ khachHangId: k1.id, coHoiId: ch1.id, dong: [{ ten: "Dịch vụ cài đặt", soLuong: "1", donGia: "1.000.000", vat: 10, giaVon: "0" }] })),
  );
  await voi(T, gd, (nc) => xinDuyet(nc, bg.id, null));
  await voi(T, gd, (nc) => quyetDuyet(nc, bg.id, { quyetDinh: "cho-duyet", ghiChu: null }));
  await voi(T, gd, (nc) => guiKhach(nc, bg.id, { kenh: "email", ghiChu: null }));
  dat("KHN-04: gửi báo giá (mốc mạnh) kéo khách thất bại về 'Đã báo giá'", (await voi(T, nv1, (nc) => chiTietKhachHang(nc, k1.id))).hanhTrinh?.id === st["da-bao-gia"].id);
  await voi(T, nv1, (nc) => doiGiaiDoan(nc, ch1.id, { giaiDoan: "WON" }));

  await nemLoiCsdl("KHN-02: lịch sử hành trình chỉ ghi thêm — không sửa được kể cả vai chủ sở hữu", () =>
    chu.customerJourneyHistory.updateMany({ where: { customerId: k1.id }, data: { note: "sửa" } }),
  );
  await nemLoiCsdl("KHN-02: không xóa được lịch sử hành trình", () => chu.customerJourneyHistory.deleteMany({ where: { customerId: k1.id } }));
  const evt = await chu.businessEvent.count({ where: { tenantId: T, eventType: "CUSTOMER_JOURNEY_CHANGED", objectId: k1.id } });
  const audit = await chu.auditLog.count({ where: { tenantId: T, objectId: k1.id, action: { in: ["doi-hanh-trinh", "tu-chuyen-hanh-trinh"] } } });
  const soLs = await chu.customerJourneyHistory.count({ where: { customerId: k1.id } });
  dat("Mỗi lần đổi hành trình có đủ Business Event + Audit Log", evt === soLs && audit === soLs, `${evt}/${audit}/${soLs}`);

  await nemLoi("Ngừng trạng thái còn khách bị chặn", "nghiep-vu", () => voi(T, tp, (nc) => suaTrangThaiHanhTrinh(nc, st["da-bao-gia"].id, { trangThai: "ngung-hoat-dong" })), "con-khach");

  // ------------------------------------------------------------------
  console.log("\n— Phễu chuyển đổi —");
  const k2 = await voi(T, nv2, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ xacNhanKhongTrung: true, ten: `Công ty Hành Trình Hai ${DAU}`, dienThoai: "0901000002" })));
  const tq = await voi(T, tp, (nc) => tongQuanHanhTrinh(nc, { tu: HOM_NAY, den: HOM_NAY }));
  const buocMoi = tq.pheu.buoc.find((b) => b.id === st["khach-moi"].id);
  const buocBg = tq.pheu.buoc.find((b) => b.id === st["da-bao-gia"].id);
  dat("KHN-06: phễu tính khách tạo trong kỳ (2 khách của nhóm)", tq.pheu.tong === 2, String(tq.pheu.tong));
  dat("KHN-06: cả hai khách đã chạm bước đầu", buocMoi?.soDat === 2);
  dat("KHN-06: bước 'Đã báo giá' có 1 khách (50%)", buocBg?.soDat === 1 && buocBg.tyLeTrenTong === 50, JSON.stringify(buocBg));
  dat("KHN-06: trạng thái thất bại không phải bước phễu", !tq.pheu.buoc.some((b) => b.id === st["ngung-quan-tam"].id));
  const tqNv2 = await voi(T, nv2, (nc) => tongQuanHanhTrinh(nc, { tu: HOM_NAY, den: HOM_NAY }));
  dat("Phễu theo phạm vi: NV2 chỉ thấy khách của mình", tqNv2.pheu.tong === 1 && tqNv2.tong === 1);
  const dem = await voi(T, tp, (nc) => demTheoHanhTrinh(nc, loc()));
  dat("Đếm theo hành trình cho thẻ trạng thái", dem.theoId[st["da-bao-gia"].id] === 1 && dem.theoId[st["khach-moi"].id] === 1 && dem.tong === 2);

  // ------------------------------------------------------------------
  console.log("\n— Nhóm khách hàng —");
  await nemLoi("Nhân viên không tạo được nhóm", "quyen", () => voi(T, nv1, (nc) => taoNhomKhach(nc, { ten: "VIP", mau: "#FF0000" })));
  const vip = await voi(T, tp, (nc) => taoNhomKhach(nc, { ten: "VIP", mau: "#FF0000" }));
  const truongHoc = await voi(T, tp, (nc) => taoNhomKhach(nc, { ten: "Trường học", mau: "#00AA00" }));
  await nemLoi("KHN-05: tên nhóm không trùng (không phân biệt hoa thường)", "nghiep-vu", () => voi(T, tp, (nc) => taoNhomKhach(nc, { ten: "vip", mau: "#000000" })), "trung-ten");
  const gan = await voi(T, nv1, (nc) => ganKhachVaoNhom(nc, vip!.id, [k1.id]));
  dat("NV1 gắn khách của mình vào nhóm", gan === 1);
  await nemLoi("KHN-05: NV1 không gắn khách của NV2 vào nhóm", "nghiep-vu", () => voi(T, nv1, (nc) => ganKhachVaoNhom(nc, vip!.id, [k2.id])), "ngoai-pham-vi");
  await voi(T, nv1, (nc) => datNhomChoKhach(nc, k1.id, [vip!.id, truongHoc!.id]));
  const theoNhom = await voi(T, tp, (nc) => danhSachKhachHang(nc, loc({ nhom: truongHoc!.id })));
  dat("Lọc danh sách theo nhóm", theoNhom.tong === 1 && theoNhom.dong[0].id === k1.id && theoNhom.dong[0].nhom.length === 2);
  const dsNhomNv2 = await voi(T, nv2, (nc) => danhSachNhomKhach(nc));
  dat("Số khách của nhóm tính theo phạm vi người xem (NV2 thấy 0)", dsNhomNv2.nhom.find((n) => n.id === vip!.id)?.soKhach === 0);

  // ------------------------------------------------------------------
  console.log("\n— Thao tác hàng loạt —");
  const k1b = await voi(T, nv1, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ xacNhanKhongTrung: true, ten: `Công ty Lô Hàng ${DAU}`, dienThoai: "0901000003" })));
  const hl = await voi(T, nv1, (nc) => thaoTacHangLoat(nc, { ids: [k1.id, k1b.id], thaoTac: "doi-hanh-trinh", giaTri: ttMoi!.id }));
  dat("Đổi hành trình hàng loạt", hl.soDoi === 2);
  await nemLoi("KHN-10: lô có khách ngoài phạm vi → từ chối CẢ lô", "nghiep-vu", () =>
    voi(T, nv1, (nc) => thaoTacHangLoat(nc, { ids: [k1.id, k2.id], thaoTac: "gan-nhom", giaTri: truongHoc!.id })),
    "ngoai-pham-vi",
  );
  dat("Lô bị từ chối không ghi gì (k1b chưa vào nhóm)", (await chu.customerGroupMember.count({ where: { customerId: k1b.id } })) === 0);
  await nemLoi("KHN-10 + KH-05: NV (own) không giao khách cho đồng nghiệp hàng loạt", "nghiep-vu", () =>
    voi(T, nv1, (nc) => thaoTacHangLoat(nc, { ids: [k1b.id], thaoTac: "doi-phu-trach", giaTri: nv2 })),
    "ngoai-pham-vi",
  );
  const giao = await voi(T, tp, (nc) => thaoTacHangLoat(nc, { ids: [k1b.id], thaoTac: "doi-phu-trach", giaTri: nv2 }));
  dat("Trưởng phòng giao khách hàng loạt trong nhóm mình", giao.soDoi === 1 && (await chu.customer.findUniqueOrThrow({ where: { id: k1b.id } })).ownerId === nv2);
  dat("Lược đồ chặn lô quá 500 khách", !LuocDoHangLoat.safeParse({ ids: Array.from({ length: 501 }, () => crypto.randomUUID()), thaoTac: "gan-nhom", giaTri: vip!.id }).success);

  // ------------------------------------------------------------------
  console.log("\n— Lọc nhanh, sắp xếp, bộ lọc đã lưu, tùy chọn cột —");
  const cuaToi = await voi(T, tp, (nc) => danhSachKhachHang(nc, loc({ nhanh: "cua-toi" })));
  dat("Lọc nhanh 'Của tôi' (trưởng phòng không phụ trách khách nào)", cuaToi.tong === 0);
  const coCh = await voi(T, tp, (nc) => danhSachKhachHang(nc, loc({ nhanh: "co-co-hoi-mo" })));
  dat("Lọc nhanh 'Có cơ hội đang mở'", coCh.tong === 1 && coCh.dong[0].id === k1.id);
  const chuaTt = await voi(T, tp, (nc) => danhSachKhachHang(nc, loc({ nhanh: "chua-tuong-tac" })));
  dat("Lọc nhanh 'Chưa tương tác' ra cả 3 khách", chuaTt.tong === 3, String(chuaTt.tong));
  const nongChuaDat = await voi(T, tp, (nc) => danhSachKhachHang(nc, loc({ nhanh: "nong" })));
  dat("KHN-08: chưa đặt ngưỡng Nóng → lọc 'Khách nóng' báo chưa đặt, không đoán", nongChuaDat.tong === 0 && Boolean(nongChuaDat.canhBao));
  dat("Giá trị lọc nhanh lạ bị lược đồ từ chối", !LuocDoLocKhachHang.safeParse({ nhanh: "xoa-het" }).success && !LuocDoLocKhachHang.safeParse({ sapXep: "id; DROP" }).success);

  const bl1 = await voi(T, nv1, (nc) => luuBoLoc(nc, { ten: "Khách VIP của tôi", thamSo: { nhom: vip!.id, nhanh: "cua-toi", la: "x" }, dungChung: false }));
  dat("Lưu bộ lọc cá nhân — khóa lạ bị bỏ", bl1.thamSo.nhom === vip!.id && bl1.thamSo.nhanh === "cua-toi" && !("la" in bl1.thamSo));
  await nemLoi("KHN-07: nhân viên không lưu được bộ lọc dùng chung", "quyen", () => voi(T, nv1, (nc) => luuBoLoc(nc, { ten: "Chung", thamSo: {}, dungChung: true })));
  const blChung = await voi(T, tp, (nc) => luuBoLoc(nc, { ten: "Khách của NV2", thamSo: { nguoiPhuTrach: nv2 }, dungChung: true }));
  const dsBlNv1 = await voi(T, nv1, (nc) => danhSachBoLoc(nc));
  dat("NV1 thấy bộ lọc của mình + bộ lọc dùng chung", dsBlNv1.length === 2 && dsBlNv1.some((b) => b.id === blChung.id && b.dungChung));
  const apChung = await voi(T, nv1, (nc) => danhSachKhachHang(nc, loc(dsBlNv1.find((b) => b.id === blChung.id)!.thamSo)));
  dat("KHN-07: bộ lọc dùng chung áp vào NV1 vẫn chỉ ra khách trong phạm vi NV1 (0 khách của NV2)", apChung.tong === 0);
  const blBan = await chu.savedView.create({
    data: { tenantId: T, ownerId: nv1, screen: "khach-hang", name: "Bộ lọc sửa tay", filters: { nhanh: "xoa-het", sapXep: "id; DROP", q: "abc", nhom: "khong-phai-uuid" } },
  });
  const blBanDoc = (await voi(T, nv1, (nc) => danhSachBoLoc(nc))).find((b) => b.id === blBan.id);
  dat("KHN-07: giá trị lưu trong CSDL không nằm trong danh mục bị loại khi đọc", blBanDoc?.thamSo.q === "abc" && !blBanDoc.thamSo.nhanh && !blBanDoc.thamSo.sapXep && !blBanDoc.thamSo.nhom, JSON.stringify(blBanDoc?.thamSo));
  dat("Hàm kiểm tham số loại khóa và giá trị lạ", JSON.stringify(kiemTraThamSoBoLoc({ sapXep: "diem", nhanh: "abc", x: 1 })) === JSON.stringify({ sapXep: "diem" }));
  await nemLoi("NV1 không gỡ được bộ lọc dùng chung của trưởng phòng", "quyen", () => voi(T, nv1, (nc) => goBoLoc(nc, blChung.id)));
  await nemLoi("Cột lạ bị từ chối", "nghiep-vu", () => voi(T, nv1, (nc) => luuTuyChonDanhSach(nc, { cot: ["mat-khau"] })), "cot-la");
  const tc = await voi(T, nv1, (nc) => luuTuyChonDanhSach(nc, { cot: ["diem", "hanh-trinh"], boLocMacDinhId: bl1.id }));
  dat("Lưu cột + bộ lọc mặc định theo người dùng", tc.cot.join() === "diem,hanh-trinh" && tc.macDinh?.id === bl1.id);
  await chu.userListPreference.updateMany({ where: { userId: nv1 }, data: { columns: ["mat-khau", 5] } });
  dat("Cột lưu sai trong CSDL → về bộ cột mặc định", (await voi(T, nv1, (nc) => tuyChonDanhSach(nc))).cot.includes("phu-trach"));
  await voi(T, nv1, (nc) => goBoLoc(nc, bl1.id));
  dat("Gỡ bộ lọc mặc định thì không còn mặc định", (await voi(T, nv1, (nc) => tuyChonDanhSach(nc))).macDinh === null);

  // ------------------------------------------------------------------
  console.log("\n— Chấm điểm khách —");
  const d0 = await voi(T, nv1, (nc) => diemCuaKhach(nc, k1b.id).catch(() => null));
  dat("Phạm vi: NV1 không xem điểm khách đã giao cho NV2", d0 === null);
  const truocTt = (await chu.customer.findUniqueOrThrow({ where: { id: k1.id } })).leadScore ?? 0;
  for (let i = 0; i < 2; i++) {
    await voi(T, nv1, (nc) => ghiTuongTac(nc, { loai: "meeting", tieuDe: `Gặp lần ${i + 1}`, khachHangId: k1.id, lienHeId: null, leadId: null, coHoiId: null, noiDung: null, ketQua: null, luc: null }));
  }
  const sauTt = (await chu.customer.findUniqueOrThrow({ where: { id: k1.id } })).leadScore ?? 0;
  dat("KHN-09: ghi tương tác tự tính lại điểm (tăng)", sauTt > truocTt, `${truocTt} → ${sauTt}`);
  const dk1 = await voi(T, nv1, (nc) => diemCuaKhach(nc, k1.id));
  dat("KHN-08: điểm trong 0–100 và có diễn giải từng phần", dk1.diemHienTai !== null && dk1.diemHienTai >= 0 && dk1.diemHienTai <= 100 && dk1.phan.length >= 3, JSON.stringify(dk1.phan));
  dat("Diễn giải có phần tương tác, gặp mặt, báo giá, đã có liên lạc", ["Tương tác", "Gặp mặt", "Báo giá", "điện thoại hoặc email"].every((s) => dk1.phan.some((p) => p.nhan.includes(s))));
  dat("KHN-08: chưa đặt ngưỡng → không xếp hạng Nóng/Ấm", dk1.hang === null);
  await nemLoiCsdl("KHN-08: CSDL chặn điểm > 100", () => chu.customer.update({ where: { id: k1.id }, data: { leadScore: 150 } }));
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "diem_khach.nguong_nong": sauTt, "diem_khach.nguong_am": 1 } }));
  const nong = await voi(T, tp, (nc) => danhSachKhachHang(nc, loc({ nhanh: "nong", sapXep: "diem" })));
  dat("Đặt ngưỡng → lọc 'Khách nóng' ra đúng khách", nong.tong === 1 && nong.dong[0].id === k1.id && !nong.canhBao);
  const xepDiem = await voi(T, tp, (nc) => danhSachKhachHang(nc, loc({ sapXep: "diem" })));
  dat("Sắp xếp theo điểm: khách điểm cao nhất lên đầu", xepDiem.dong[0].id === k1.id);
  dat("Có ngưỡng thì xếp hạng Nóng", (await voi(T, nv1, (nc) => diemCuaKhach(nc, k1.id))).hang === "nong");
  await nemLoi("Nhân viên không bấm 'Tính lại toàn bộ'", "quyen", () => voi(T, nv1, (nc) => tinhLaiToanBo(nc)));
  await nemLoi("Nhân viên không sửa điểm theo nguồn", "quyen", () => voi(T, nv1, (nc) => luuDiemNguon(nc, { website: 20 })));
  await voi(T, gd, (nc) => luuDiemNguon(nc, { website: 20 }));
  await voi(T, nv1, (nc) => suaKhachHang(nc, k1.id, { nguon: "website", xacNhanKhongTrung: false }));
  const tl = await voi(T, tp, (nc) => tinhLaiToanBo(nc));
  dat("Tính lại toàn bộ chạy và báo số khách", tl.soKhach >= 3, JSON.stringify(tl));
  dat("Điểm nguồn đã đặt được cộng", (await voi(T, nv1, (nc) => diemCuaKhach(nc, k1.id))).phan.some((p) => p.nhan.startsWith("Nguồn") && p.diem === 20));
  const cauHinhDiem = await voi(T, nv1, (nc) => xemCauHinhDiem(nc));
  dat("Màn hình chấm điểm nói rõ đang dùng trọng số (mặc định) và đã có hạng", cauHinhDiem.cauHinh.diemMoiTuongTac === 5 && cauHinhDiem.thongKe.coHang);

  const congCu = timCongCu("diem_hanh_trinh_khach")!;
  const ccKq = (await voi(T, nv1, (nc) => congCu.chay(nc, { khachHangId: k1.id }))) as { diem: number; lichSuHanhTrinh: unknown[] };
  dat("Trợ lý: công cụ đọc điểm + hành trình trả đúng điểm và lịch sử", ccKq.diem === (await voi(T, nv1, (nc) => diemCuaKhach(nc, k1.id))).diemHienTai && ccKq.lichSuHanhTrinh.length > 0);
  await nemLoi("Trợ lý: công cụ điểm/hành trình theo phạm vi người hỏi (NV2 không đọc khách NV1)", "khong-thay", () => voi(T, nv2, (nc) => congCu.chay(nc, { khachHangId: k1.id })));

  // ------------------------------------------------------------------
  console.log("\n— Nhắc việc: đứng lâu + sinh nhật —");
  await voi(T, tp, (nc) => suaTrangThaiHanhTrinh(nc, ttMoi!.id, { soNgayDungLau: 3 }));
  await chu.customer.updateMany({ where: { id: { in: [k1.id] } }, data: { journeyStageChangedAt: new Date(Date.now() - 5 * 86_400_000) } });
  const loc2 = await voi(T, nv1, (nc) => danhSachKhachHang(nc, loc({ nhanh: "dung-lau" })));
  dat("Lọc nhanh 'Đứng lâu' ra khách quá ngưỡng của trạng thái", loc2.tong === 1 && loc2.dong[0].id === k1.id);
  const [m, d] = HOM_NAY.slice(5).split("-");
  const lhSn = await voi(T, nv1, (nc) => taoLienHe(nc, k1.id, { hoTen: "Chị Sinh Nhật", dienThoai: "0912000111", ngaySinh: `1990-${m}-${d}` }));
  dat("Liên hệ lưu ngày sinh", lhSn.ngaySinh === `1990-${m}-${d}`);
  const snLoc = await voi(T, nv1, (nc) => danhSachKhachHang(nc, loc({ nhanh: "sinh-nhat-thang-nay" })));
  dat("Lọc nhanh 'Sinh nhật trong tháng'", snLoc.tong === 1);
  const q1 = await voi(T, gd, (nc) => chayQuet(nc.tx, T, { ngay: HOM_NAY, trigger: "tay", nguoiChayId: gd }));
  const viecDl = await chu.dailyActionItem.findMany({ where: { tenantId: T, ruleCode: "khach-dung-lau" } });
  const viecSn = await chu.dailyActionItem.findMany({ where: { tenantId: T, ruleCode: "sinh-nhat-lien-he" } });
  dat("KHN-14: quét sinh việc 'đứng lâu' cho người phụ trách khách", viecDl.length === 1 && viecDl[0].userId === nv1 && viecDl[0].objectId === k1.id, JSON.stringify(q1.quyTac.filter((q) => q.ma === "khach-dung-lau")));
  dat("KHN-15: quét sinh việc sinh nhật cho người phụ trách khách", viecSn.length === 1 && viecSn[0].userId === nv1 && viecSn[0].objectId === lhSn.id);
  await voi(T, gd, (nc) => chayQuet(nc.tx, T, { ngay: HOM_NAY, trigger: "tay", nguoiChayId: gd }));
  dat("Chạy lại trong ngày không nhân đôi", (await chu.dailyActionItem.count({ where: { tenantId: T, ruleCode: { in: ["khach-dung-lau", "sinh-nhat-lien-he"] } } })) === 2);
  await voi(T, gd, (nc) => chayQuet(nc.tx, T, { ngay: NGAY_MAI, trigger: "tay", nguoiChayId: gd }));
  dat("KHN-14: hôm sau KHÔNG nhắc lại cùng một lần đứng lâu", (await chu.dailyActionItem.count({ where: { tenantId: T, ruleCode: "khach-dung-lau" } })) === 1);
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "theo_doi.sinh_nhat_nhac_truoc_ngay": 1 } }));
  const homQua = congNgay(HOM_NAY, -1);
  await voi(T, gd, (nc) => chayQuet(nc.tx, T, { ngay: homQua, trigger: "tay", nguoiChayId: gd }));
  dat("KHN-15: đặt nhắc trước 1 ngày → hôm trước sinh nhật đã có việc", (await chu.dailyActionItem.count({ where: { tenantId: T, ruleCode: "sinh-nhat-lien-he", forDate: new Date(`${homQua}T00:00:00Z`) } })) === 1);

  // ------------------------------------------------------------------
  console.log("\n— Gộp khách trùng —");
  const giu = await voi(T, nv1, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ xacNhanKhongTrung: true, ten: `Công ty Giữ Lại ${DAU}`, dienThoai: "0901000010", lienHe: { hoTen: "Anh Giữ" } })));
  const gop = await voi(T, nv1, (nc) =>
    taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Cty Bị Gộp ${DAU}`, maSoThue: MST("32"), email: "gop@thu.test", lienHe: { hoTen: "Chị Gộp", laChinh: true }, xacNhanKhongTrung: true })),
  );
  // Dựng đủ loại bản ghi gắn với khách bị gộp.
  const chGop = await voi(T, nv1, (nc) => taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: gop.id, tieuDe: "Cơ hội gộp", giaTri: "1", hanhDongKeTiep: "Gọi", ngayHanhDong: NGAY_MAI })));
  await voi(T, nv1, (nc) => ghiTuongTac(nc, { loai: "call", tieuDe: "Gọi khách gộp", khachHangId: gop.id, lienHeId: null, leadId: null, coHoiId: chGop.id, noiDung: null, ketQua: null, luc: null }));
  await voi(T, nv1, (nc) => taoViec(nc, { tieuDe: "Việc của khách gộp", uuTien: "cao", han: null, khachHangId: gop.id, leadId: null, coHoiId: null, moTa: null, nguoiPhuTrachId: null }));
  await voi(T, gd, (nc) => taoBaoGia(nc, LuocDoTaoBaoGia.parse({ khachHangId: gop.id, dong: [{ ten: "Dịch vụ", soLuong: "1", donGia: "1000", vat: 10, giaVon: "0" }] })));
  const ldGop = await voi(T, nv1, (nc) => taoLead(nc, LuocDoTaoLead.parse({ hoTen: "Lead gộp", dienThoai: "0988000123" })));
  await voi(T, nv1, (nc) => chuyenDoiLead(nc, ldGop.id, LuocDoChuyenDoiLead.parse({ khachHangId: gop.id, taoLienHe: false })));
  await voi(T, nv1, (nc) => ganKhachVaoNhom(nc, vip!.id, [gop.id, giu.id]));
  await voi(T, nv1, (nc) => ganKhachVaoNhom(nc, truongHoc!.id, [gop.id]));
  // Một khách đã gộp trước đó vào "gop" — sau khi gộp phải trỏ thẳng sang "giu".
  const cu = await voi(T, nv1, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ xacNhanKhongTrung: true, ten: `Khách Cũ Đã Gộp ${DAU}`, dienThoai: "0901000011" })));
  await chu.customer.update({ where: { id: cu.id }, data: { status: "da-gop", mergedIntoId: gop.id, mergedAt: new Date(), mergedBy: gd } });

  // Liệt kê MỌI cột tham chiếu khách bằng information_schema, đếm trước/sau từng bảng.
  const cotFk = await chu.$queryRaw<{ bang: string; cot: string }[]>`
    SELECT kcu.table_name::text AS bang, kcu.column_name::text AS cot
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name AND kcu.constraint_schema = rc.constraint_schema
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name AND ccu.constraint_schema = rc.unique_constraint_schema
    WHERE rc.constraint_schema = 'public' AND ccu.table_name = 'customers' AND ccu.column_name = 'id'
    ORDER BY 1, 2
  `;
  dat("information_schema liệt kê ≥ 17 cột tham chiếu khách (gồm bảng mới)", cotFk.length >= 17 && cotFk.some((c) => c.bang === "customer_group_members"), cotFk.map((c) => `${c.bang}.${c.cot}`).join(", "));
  const demFk = async (id: string) => {
    const kq: Record<string, number> = {};
    for (const { bang, cot } of cotFk) {
      const r = await chu.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${bang}" WHERE "${cot}" = $1::uuid`, id);
      kq[`${bang}.${cot}`] = r[0].n;
    }
    return kq;
  };
  const truocGiu = await demFk(giu.id);
  const truocGop = await demFk(gop.id);
  dat("Khách bị gộp có bản ghi ở ≥ 7 bảng", Object.values(truocGop).filter((n) => n > 0).length >= 7, JSON.stringify(truocGop));

  await nemLoi("KHN-11: nhân viên (không có customer.approve) không gộp được", "quyen", () => voi(T, nv1, (nc) => gopKhach(nc, { giuLaiId: giu.id, biGopId: gop.id, lyDo: "Trùng" })));
  const kGd = await voi(T, gd, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ xacNhanKhongTrung: true, ten: `Khách Của Giám Đốc ${DAU}`, dienThoai: "0901000012" })));
  await nemLoi("KHN-11: khách ngoài phạm vi sửa của người gộp → không tìm thấy", "khong-thay", () => voi(T, tp, (nc) => gopKhach(nc, { giuLaiId: giu.id, biGopId: kGd.id, lyDo: "Trùng" })));
  const kKhacMst = await voi(T, nv1, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Cty Khác MST ${DAU}`, maSoThue: MST("33"), xacNhanKhongTrung: true })));
  await nemLoi("KHN-11: hai khách khác mã số thuế không gộp được", "nghiep-vu", () => voi(T, tp, (nc) => gopKhach(nc, { giuLaiId: kKhacMst.id, biGopId: gop.id, lyDo: "Thử" })), "khac-ma-so-thue");
  const xt = await voi(T, tp, (nc) => xemTruocGop(nc, giu.id, gop.id));
  dat("Xem trước gộp liệt kê số bản ghi từng bảng và trường sẽ bổ sung", xt.chuyen.find((c) => c.bang === "opportunities.customer_id")?.so === 1 && xt.boSung.some((b) => b.truong === "Mã số thuế"));
  const kqGop = await voi(T, tp, (nc) => gopKhach(nc, { giuLaiId: giu.id, biGopId: gop.id, lyDo: "Cùng một công ty nhập hai lần" }));
  const sauGiu = await demFk(giu.id);
  const sauGop = await demFk(gop.id);
  let khongMat = true;
  const chiTietMat: string[] = [];
  for (const k of Object.keys(truocGiu)) {
    if (k === "customers.merged_into_id") continue;
    const tong0 = truocGiu[k] + truocGop[k];
    const tong1 = sauGiu[k] + sauGop[k];
    // Bảng nối nhóm: nhóm trùng (VIP) gộp còn một dòng — đúng nghĩa "một khách một lần trong nhóm".
    const kyVong = k === "customer_group_members.customer_id" ? tong0 - 1 : tong0;
    if (tong1 !== kyVong) {
      khongMat = false;
      chiTietMat.push(`${k}: ${tong0}→${tong1}`);
    }
  }
  dat("KHN-12: KHÔNG mất bản ghi nào ở mọi bảng có customer_id (đếm trước/sau)", khongMat, chiTietMat.join("; "));
  const conLai = Object.entries(sauGop).filter(([k, n]) => n > 0 && k !== "customer_journey_history.customer_id");
  dat("KHN-12: khách bị gộp không còn bản ghi nào trỏ vào (trừ lịch sử chỉ-ghi-thêm)", conLai.length === 0, JSON.stringify(conLai));
  dat("Lịch sử hành trình của khách bị gộp giữ nguyên", sauGop["customer_journey_history.customer_id"] === truocGop["customer_journey_history.customer_id"]);
  const gopSau = await chu.customer.findUniqueOrThrow({ where: { id: gop.id } });
  dat("KHN-12: khách bị gộp KHÔNG bị xóa — trạng thái da-gop, trỏ sang khách giữ lại", gopSau.status === "da-gop" && gopSau.mergedIntoId === giu.id && gopSau.mergedBy === tp);
  dat("Khách gộp từ trước được trỏ thẳng sang khách giữ lại", (await chu.customer.findUniqueOrThrow({ where: { id: cu.id } })).mergedIntoId === giu.id);
  const giuSau = await chu.customer.findUniqueOrThrow({ where: { id: giu.id } });
  dat("Bổ sung MST, email còn trống từ khách bị gộp", giuSau.taxCodeNormalized === MST("32") && giuSau.emailNormalized === "gop@thu.test");
  dat("Khách giữ lại chỉ còn một liên hệ chính", (await chu.contact.count({ where: { customerId: giu.id, isPrimary: true } })) === 1);
  dat("Kết quả gộp báo số đã chuyển", kqGop.daChuyen["opportunities.customer_id"] === 1);
  dat("Audit Log gộp ghi đủ trước/sau", (await chu.auditLog.count({ where: { tenantId: T, action: "gop-khach", objectId: { in: [giu.id, gop.id] } } })) === 2);
  dat("Business Event CUSTOMER_MERGED", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "CUSTOMER_MERGED", objectId: giu.id } })) === 1);
  await nemLoiCsdl("KHN-12: CSDL chặn da-gop mà không trỏ khách giữ lại", () => chu.customer.update({ where: { id: k2.id }, data: { status: "da-gop" } }));
  await nemLoi("KHN-13: không mở cơ hội mới trên khách đã gộp", "nghiep-vu", () =>
    voi(T, nv1, (nc) => taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: gop.id, tieuDe: "Sai", giaTri: "1", hanhDongKeTiep: "Gọi", ngayHanhDong: NGAY_MAI }))),
    "da-gop",
  );
  await nemLoi("KHN-13: không sửa khách đã gộp", "nghiep-vu", () => voi(T, gd, (nc) => suaKhachHang(nc, gop.id, { ghiChu: "x", xacNhanKhongTrung: false })), "da-gop");
  const dsSauGop = await voi(T, gd, (nc) => danhSachKhachHang(nc, loc({ q: "Bị Gộp" })));
  dat("Danh sách mặc định ẩn khách đã gộp", dsSauGop.tong === 0);
  dat("Tra trạng thái 'đã gộp' vẫn thấy khách", (await voi(T, gd, (nc) => danhSachKhachHang(nc, loc({ q: "Bị Gộp", trangThai: "da-gop" })))).tong === 1);

  // ------------------------------------------------------------------
  console.log("\n— Xuất / nhập CSV —");
  await nemLoi("Kỹ thuật viên (không có customer.export) không xuất CSV", "quyen", () => voi(T, kyThuat, (nc) => xuatKhachCsv(nc, {})));
  const xuatNv2 = await voi(T, nv2, (nc) => xuatKhachCsv(nc, {}));
  dat("Xuất CSV theo phạm vi: NV2 không thấy khách của NV1", !xuatNv2.noiDung.includes(`Hành Trình Một ${DAU}`) && xuatNv2.noiDung.includes(`Hành Trình Hai ${DAU}`));
  const xuat = await voi(T, tp, (nc) => xuatKhachCsv(nc, { nhom: vip!.id }));
  const dongXuat = xuat.noiDung.trim().split("\r\n");
  dat("Xuất theo bộ lọc: tiêu đề + đúng số khách của nhóm", dongXuat.length === 1 + 2 && dongXuat[0].includes("Trạng thái hành trình") && dongXuat[0].includes("Người phụ trách (email)"), String(dongXuat.length));
  dat("Dòng xuất có hành trình, nhóm, email người phụ trách", dongXuat.some((l) => l.includes("VIP") && l.includes(`nhan-vien-1.${DAU}@thu.test`)));

  const csv = [
    "Mã KH,Tên,MST,Điện thoại,Người phụ trách (email),Trạng thái,Trạng thái hành trình,Nhóm,Liên hệ chính,ĐT liên hệ,Ngày sinh liên hệ,Cột lạ",
    `,Công ty Nhập Mới ${DAU},${MST("34")},0907000001,,Đang giao dịch,Đã khảo sát,Trường học,Anh Nhập,0907000002,05/06/1980,x`,
    `,Tên đổi qua MST,${MST("31")},,,,,,,,,`,
    `,Khách trùng điện thoại,,0901000002,,,,,,,,`,
    `,Khách hành trình lạ,,0907000003,,,Bước không có,,,,,`,
    `,Khách ngày sinh sai,,0907000004,,,,,Bà Sai Ngày,,31/02/1990,`,
    `,Khách phụ trách lạ,,0907000005,ai-do@khong-co.vn,,,,,,,`,
    `KH-999999,Mã không có,,,,,,,,,,`,
  ].join("\n");
  const demTruoc = await chu.customer.count({ where: { tenantId: T } });
  const xemTruoc = await voi(T, nv1, (nc) => nhapKhachCsv(nc, { tenTep: "khach.csv", noiDung: csv, ghiThat: false, xacNhanTrung: false }));
  dat("KHN-16: xem trước không ghi gì", (await chu.customer.count({ where: { tenantId: T } })) === demTruoc && (await chu.importJob.count({ where: { tenantId: T } })) === 0);
  dat("Xem trước: 1 tạo, 1 cập nhật theo MST, 5 bỏ qua", xemTruoc.soTao === 1 && xemTruoc.soSua === 1 && xemTruoc.soLoi === 5, JSON.stringify(xemTruoc.dong));
  dat("KH-03: dòng trùng điện thoại bị bỏ qua kèm khách có thể trùng", Boolean(xemTruoc.dong.find((x) => x.soDong === 4)?.loi?.includes("Có thể trùng")));
  dat("Cột lạ được báo", xemTruoc.cotLa.includes("Cột lạ"));
  dat("Lỗi dòng nói rõ lý do (hành trình lạ / ngày sinh / email phụ trách / mã KH)",
    ["Bước không có", "31/02/1990", "ai-do@khong-co.vn", "KH-999999"].every((s) => xemTruoc.dong.some((x) => x.loi?.includes(s))));
  // NV1 có MST của k1 nên dòng 3 cập nhật k1 (trong phạm vi NV1).
  const ghiCsv = await voi(T, nv1, (nc) => nhapKhachCsv(nc, { tenTep: "khach.csv", noiDung: csv, ghiThat: true, xacNhanTrung: false }));
  dat("Ghi thật cho kết quả trùng khít xem trước", ghiCsv.soTao === xemTruoc.soTao && ghiCsv.soSua === xemTruoc.soSua && ghiCsv.soLoi === xemTruoc.soLoi);
  const kNhap = await chu.customer.findFirstOrThrow({ where: { tenantId: T, taxCodeNormalized: MST("34") }, include: { contacts: true, groupMembers: true } });
  dat("Khách nhập mới có trạng thái giao dịch, hành trình, nhóm, liên hệ + ngày sinh",
    kNhap.status === "dang-giao-dich" && kNhap.journeyStageId === ttMoi!.id && kNhap.groupMembers.length === 1 && kNhap.contacts[0]?.birthDate?.toISOString().slice(0, 10) === "1980-06-05");
  dat("Dòng trùng MST cập nhật tên khách cũ", (await chu.customer.findUniqueOrThrow({ where: { id: k1.id } })).name === "Tên đổi qua MST");
  dat("Mỗi lần ghi lưu một import_jobs", (await chu.importJob.count({ where: { tenantId: T, type: "khach-hang" } })) === 1);
  const csv2 = ["Tên,Điện thoại", "Khách trùng điện thoại,0901000002"].join("\n");
  const xacNhan = await voi(T, nv1, (nc) => nhapKhachCsv(nc, { tenTep: "khach2.csv", noiDung: csv2, ghiThat: true, xacNhanTrung: true }));
  dat("KH-03: tích 'đã kiểm trùng' thì dòng trùng mềm được tạo", xacNhan.soTao === 1);
  await nemLoi("Kỹ thuật viên không nhập CSV khách", "quyen", () => voi(T, kyThuat, (nc) => nhapKhachCsv(nc, { tenTep: "x.csv", noiDung: csv2, ghiThat: false, xacNhanTrung: false })));

  // ------------------------------------------------------------------
  console.log("\n— Bàn giao khi nghỉ việc —");
  const kNv = await voi(T, nghiViec, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ xacNhanKhongTrung: true, ten: `Khách Người Nghỉ ${DAU}`, dienThoai: "0901000020" })));
  const chMo = await voi(T, nghiViec, (nc) => taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: kNv.id, tieuDe: "Đang mở", giaTri: "1", hanhDongKeTiep: "Gọi", ngayHanhDong: NGAY_MAI })));
  const chDong = await voi(T, nghiViec, (nc) => taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: kNv.id, tieuDe: "Đã thắng", giaTri: "1", hanhDongKeTiep: "Gọi", ngayHanhDong: NGAY_MAI })));
  await voi(T, nghiViec, (nc) => doiGiaiDoan(nc, chDong.id, { giaiDoan: "WON" }));
  await voi(T, nghiViec, (nc) => taoLead(nc, LuocDoTaoLead.parse({ hoTen: "Lead người nghỉ", dienThoai: "0988000999" })));
  await voi(T, nghiViec, (nc) => taoViec(nc, { tieuDe: "Việc dở dang", uuTien: "cao", han: null, khachHangId: kNv.id, leadId: null, coHoiId: null, moTa: null, nguoiPhuTrachId: null }));
  await nemLoi("Trưởng phòng (không có user.update) không bàn giao được", "quyen", () => voi(T, tp, (nc) => xemTruocBanGiao(nc, nghiViec)));
  const xtbg = await voi(T, gd, (nc) => xemTruocBanGiao(nc, nghiViec));
  const soLoai = (ma: string) => xtbg.loai.find((l) => l.ma === ma)?.so;
  dat("KHN-17: xem trước đếm đúng từng loại", soLoai("khach-hang") === 1 && soLoai("co-hoi") === 1 && soLoai("lead") === 1 && soLoai("cong-viec") === 1, JSON.stringify(xtbg.loai));
  dat("Xem trước không ghi gì", (await chu.customer.findUniqueOrThrow({ where: { id: kNv.id } })).ownerId === nghiViec);
  await nemLoi("Không bàn giao cho chính người đó", "nghiep-vu", () => voi(T, gd, (nc) => banGiao(nc, nghiViec, { nguoiNhanId: nghiViec, khoaTaiKhoan: true })), "cung-nguoi");
  await chu.user.update({ where: { id: kyThuat }, data: { status: "ngung-hoat-dong" } });
  await nemLoi("Không bàn giao cho người đã ngừng hoạt động", "nghiep-vu", () => voi(T, gd, (nc) => banGiao(nc, nghiViec, { nguoiNhanId: kyThuat, khoaTaiKhoan: true })), "nguoi-nhan-ngung");
  const kqBg = await voi(T, gd, (nc) => banGiao(nc, nghiViec, { nguoiNhanId: nv2, khoaTaiKhoan: true, ghiChu: "Nghỉ việc 30/10" }));
  dat("Bàn giao chuyển đủ số việc như xem trước", kqBg.tong === xtbg.tong && kqBg.daKhoa, JSON.stringify(kqBg));
  dat("Khách, cơ hội mở chuyển sang người nhận", (await chu.customer.findUniqueOrThrow({ where: { id: kNv.id } })).ownerId === nv2 && (await chu.opportunity.findUniqueOrThrow({ where: { id: chMo.id } })).ownerId === nv2);
  dat("Cơ hội đã đóng giữ nguyên người làm (lịch sử không bị viết lại)", (await chu.opportunity.findUniqueOrThrow({ where: { id: chDong.id } })).ownerId === nghiViec);
  dat("Tài khoản người nghỉ bị khóa", (await chu.user.findUniqueOrThrow({ where: { id: nghiViec } })).status === "ngung-hoat-dong");
  dat("Audit Log + Business Event bàn giao", (await chu.auditLog.count({ where: { tenantId: T, action: "ban-giao", objectId: nghiViec } })) === 1 && (await chu.businessEvent.count({ where: { tenantId: T, eventType: "USER_HANDOVER", objectId: nghiViec } })) === 1);

  // ------------------------------------------------------------------
  console.log("\n— Cách ly doanh nghiệp (bảng mới) —");
  const tenantB = await seedNenMong(chu, `thu-khn-b-${DAU}`, "Doanh nghiệp thử B");
  const gdB = (await chu.user.create({
    data: {
      tenantId: tenantB.id, email: `gd-b.${DAU}@thu.test`, passwordHash: "x", fullName: "GĐ B",
      userRoles: { create: { tenantId: tenantB.id, roleId: (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tenantB.id, code: "ceo" } } })).id } },
    },
  })).id;
  const dmB = await voi(tenantB.id, gdB, (nc) => danhSachTrangThaiHanhTrinh(nc));
  dat("NM-01: doanh nghiệp B chỉ thấy 5 trạng thái của mình", dmB.length === 5 && !dmB.some((t) => t.id === ttMoi!.id));
  dat("NM-01: B không thấy nhóm khách của A", (await voi(tenantB.id, gdB, (nc) => danhSachNhomKhach(nc))).nhom.length === 0);
  dat("NM-01: B không thấy bộ lọc dùng chung của A", (await voi(tenantB.id, gdB, (nc) => danhSachBoLoc(nc))).length === 0);
  const lsB = await voiTenant(tenantB.id, (tx) => tx.customerJourneyHistory.count());
  dat("NM-01: RLS — B đếm 0 dòng lịch sử hành trình", lsB === 0);
  await nemLoi("NM-01: B không đổi được hành trình khách của A", "khong-thay", () => voi(tenantB.id, gdB, (nc) => doiHanhTrinh(nc, k1.id, { trangThaiId: dmB[0].id, ghiChu: null })));
  const rlsBang = await chu.$queryRaw<{ relname: string; relrowsecurity: boolean }[]>`
    SELECT relname::text, relrowsecurity FROM pg_class
    WHERE relname IN ('customer_journey_stages','customer_journey_history','customer_groups','customer_group_members','saved_views','user_list_preferences')
  `;
  dat("RLS bật cho cả 6 bảng mới", rlsBang.length === 6 && rlsBang.every((r) => r.relrowsecurity));

  await chu.$disconnect();
  ketLuan("Khách hàng nâng cao");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
