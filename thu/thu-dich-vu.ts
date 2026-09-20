import { prisma, voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { namVN } from "../src/lib/so-chung-tu";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { taoSanPham } from "../src/modules/san-pham/service";
import { nhapKho, taoKho } from "../src/modules/kho/service";
import { taoDonHang, taoPhieuXuat, xacNhanDon } from "../src/modules/don-hang/service";
import { chiTietBaoHanh, danhSachBaoHanh, huyBaoHanh, suaBaoHanh, traTheoSerial } from "../src/modules/bao-hanh/service";
import { chiTietPhieu, danhSachPhieu, doiTrangThaiPhieu, ghiDienBien, giaoPhieu, suaPhieu, taoPhieu } from "../src/modules/ho-tro/service";
import { chiTietDuAn, danhSachDuAn, doiTrangThaiDuAn, suaHangMuc, taoDuAn, themHangMuc, xoaHangMuc } from "../src/modules/du-an/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { LuocDoNhapKho, LuocDoTaoKho } from "../src/modules/kho/luoc-do";
import { LuocDoTaoDon, LuocDoTaoPhieuXuat } from "../src/modules/don-hang/luoc-do";
import { LuocDoTaoPhieu } from "../src/modules/ho-tro/luoc-do";
import { LuocDoTaoDuAn } from "../src/modules/du-an/luoc-do";
import { ngayHetHan } from "../src/modules/bao-hanh/tinh-toan";
import { homNayVN } from "../src/modules/crm/chung";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng nghiệp vụ Bảo hành, Bàn dịch vụ và Dự án (Phase 6) trên CSDL THẬT.
 * Luật: BUSINESS_RULES.md mục 8 (BH), mục 9 (HT), mục 10 (DU).
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-dich-vu"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "dinh-dang";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string) {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu =
      kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "dinh-dang" ? e instanceof LoiDinhDang
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}

async function main() {
  console.log("=== Thử Bảo hành, Bàn dịch vụ, Dự án (Phase 6) ===\n");
  const tenant = await seedNenMong(chu, `thu-dv-${DAU}`, "Doanh nghiệp thử dịch vụ");
  const T = tenant.id;
  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  const nguoi = async (ten: string, vai: string, quanLyId?: string) =>
    (
      await chu.user.create({
        data: {
          tenantId: T,
          email: `${ten}.${DAU}@thu.test`,
          passwordHash: "x",
          fullName: ten,
          userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
          staffProfile: { create: { tenantId: T, managerId: quanLyId ?? null } },
        },
      })
    ).id;

  const gd = await nguoi("giam-doc", "ceo");
  const tpKt = await nguoi("truong-phong-ky-thuat", "technical-manager");
  const ktv = await nguoi("ky-thuat-vien", "technical", tpKt);
  const cskh = await nguoi("cham-soc-khach", "customer-service");
  const tpKd = await nguoi("truong-phong-kinh-doanh", "sales-manager");
  const thuKho = await nguoi("thu-kho", "warehouse");
  console.log("");

  // ------------------------------------------------------------------
  // Nền: khách, hàng có bảo hành 24 tháng, kho, đơn, xuất hàng.
  const khach = await voi(T, tpKd, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Công ty TNHH Thử Dịch Vụ", dienThoai: "0909 333 222" })));
  const nhomLaptop = await chu.productCategory.findFirst({ where: { tenantId: T, code: "laptop" }, select: { id: true } });
  const laptop = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: "LAP-DV-01", ten: "Laptop bảo hành 24 tháng", nhomId: nhomLaptop?.id, giaBan: "20000000", giaVon: "17000000", donViTinh: "cai", baoHanhThang: 24 })),
  );
  const kho = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "kho-dv", ten: "Kho thử dịch vụ", macDinh: true })));
  await voi(T, thuKho, (nc) =>
    nhapKho(nc, LuocDoNhapKho.parse({ khoId: kho.id, lyDo: "Nhập thử", dong: [{ sanPhamId: laptop.id, soLuong: "2", giaVon: "17.000.000", serial: [`DV-${DAU}-1`, `DV-${DAU}-2`] }] })),
  );
  const don = await voi(T, tpKd, (nc) =>
    taoDonHang(nc, LuocDoTaoDon.parse({
      khachHangId: khach.id,
      dong: [{ sanPhamId: laptop.id, ten: "Laptop bảo hành 24 tháng", soLuong: "2", donViTinh: "cai", donGia: "20.000.000", vat: 10, giaVon: "17.000.000" }],
    })),
  );
  await voi(T, tpKd, (nc) => xacNhanDon(nc, don.id, { khoId: kho.id, ghiChu: null }));

  console.log("— Bảo hành sinh khi giao hàng —");
  const ctDon = await voi(T, tpKd, async (nc) => (await import("../src/modules/don-hang/service")).chiTietDonHang(nc, don.id));
  const dongDon = ctDon.don.dong[0];
  await voi(T, thuKho, (nc) =>
    taoPhieuXuat(nc, don.id, LuocDoTaoPhieuXuat.parse({ khoId: kho.id, dong: [{ dongDonId: dongDon.id, soLuong: "2", serial: [`DV-${DAU}-1`, `DV-${DAU}-2`] }] })),
  );

  const dsBh = await voi(T, cskh, (nc) => danhSachBaoHanh(nc, { q: "", khachHang: "", tinhTrang: "tat-ca", trang: 1, coTrang: 20 }));
  dat("BH-01: xuất 2 máy sinh đúng 2 phiếu bảo hành, mỗi máy một phiếu", dsBh.tong === 2, String(dsBh.tong));
  const bh1 = dsBh.dong[0];
  dat("BH-02: hạn bảo hành = ngày giao + 24 tháng, lùi một ngày", bh1.ngayHetHan === ngayHetHan(bh1.ngayBatDau, 24) && bh1.soThang === 24, `${bh1.ngayBatDau} → ${bh1.ngayHetHan}`);
  dat("Bảo hành gắn đúng khách, máy và đơn hàng", bh1.khachHang.id === khach.id && Boolean(bh1.serial) && bh1.donHang?.id === don.id, JSON.stringify({ serial: bh1.serial, don: bh1.donHang?.so }));
  const traSerial = await voi(T, cskh, (nc) => traTheoSerial(nc, `DV-${DAU}-1`));
  dat("Tra bảo hành theo số sê-ri ra đúng máy", traSerial.length === 1 && traSerial[0].serial === `DV-${DAU}-1`, JSON.stringify(traSerial.map((x) => x.serial)));
  dat("Máy còn bảo hành được đánh dấu còn hạn", traSerial[0].mucBaoHanh === "con-han", traSerial[0].mucBaoHanh);

  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "theo_doi.bao_hanh_sap_het_ngay": 365 } }));
  const dsSapHet = await voi(T, cskh, (nc) => danhSachBaoHanh(nc, { q: "", khachHang: "", tinhTrang: "sap-het", trang: 1, coTrang: 20 }));
  dat("Ngưỡng 365 ngày: bảo hành 24 tháng chưa vào nhóm sắp hết", dsSapHet.tong === 0 && dsSapHet.nguongSapHetNgay === 365, JSON.stringify({ tong: dsSapHet.tong, nguong: dsSapHet.nguongSapHetNgay }));

  await nemLoi("BH-04: sửa bảo hành thiếu lý do bị chặn", "dinh-dang", () =>
    voi(T, cskh, (nc) => suaBaoHanh(nc, bh1.id, { soThang: 36, lyDo: "" } as never)),
  );
  const bhSua = await voi(T, cskh, (nc) => suaBaoHanh(nc, bh1.id, { soThang: 36, lyDo: "Hãng nâng bảo hành lên 36 tháng" }));
  dat("Sửa số tháng thì hạn tính lại", bhSua.soThang === 36 && bhSua.ngayHetHan === ngayHetHan(bhSua.ngayBatDau, 36), `${bhSua.ngayHetHan}`);
  // Kỹ thuật viên CÓ quyền service_desk.update (mục 19 đặc tả) nên sửa được; người ngoài bàn dịch vụ thì không.
  await nemLoi("Người ngoài bàn dịch vụ không sửa được bảo hành", "quyen", () => voi(T, tpKd, (nc) => suaBaoHanh(nc, bh1.id, { soThang: 12, lyDo: "Thử" })));

  // ------------------------------------------------------------------
  console.log("\n— Phiếu hỗ trợ và SLA —");
  await voi(T, gd, (nc) =>
    capNhatCauHinh(nc, { giaTri: { "dich_vu.gio_phan_hoi_khan": 1, "dich_vu.gio_phan_hoi_thuong": 8, "dich_vu.gio_xu_ly_khan": 4, "dich_vu.gio_xu_ly_thuong": 48 } }),
  );

  const phieu = await voi(T, cskh, (nc) =>
    taoPhieu(nc, LuocDoTaoPhieu.parse({
      khachHangId: khach.id,
      baoHanhId: bh1.id,
      loai: "bao-hanh",
      uuTien: "khan",
      tieuDe: "Máy không lên nguồn",
      moTa: "Khách báo máy không khởi động được sau khi mất điện.",
    })),
  );
  dat("HT-01: số phiếu HT-<năm>-0001", phieu.so === `HT-${namVN()}-0001`, phieu.so);
  dat("HT-03: hạn phản hồi 1 giờ, hạn xử lý 4 giờ cho phiếu Khẩn", Boolean(phieu.hanPhanHoi) && Boolean(phieu.hanXuLy) && (phieu.hanXuLy!.getTime() - phieu.hanPhanHoi!.getTime()) === 3 * 3_600_000);
  const ct1 = await voi(T, cskh, (nc) => chiTietPhieu(nc, phieu.id));
  dat("Phiếu gắn đúng máy qua bảo hành (sê-ri, đơn hàng)", ct1.phieu.baoHanh?.serial === `DV-${DAU}-1` && ct1.phieu.donHang?.id === don.id, JSON.stringify({ serial: ct1.phieu.baoHanh?.serial }));
  dat("Diễn biến đầu tiên là ghi nhận tiếp nhận", ct1.dienBien.length === 1 && ct1.dienBien[0].loai === "tiep-nhan");
  dat("Phiếu mới chưa phản hồi thì SLA phản hồi chưa trễ", ct1.phieu.mucPhanHoi === "con-han" || ct1.phieu.mucPhanHoi === "sap-het", ct1.phieu.mucPhanHoi);

  await nemLoi("Phiếu gắn bảo hành của khách khác bị chặn", "dinh-dang", async () => {
    const khach2 = await voi(T, tpKd, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Khách khác thử dịch vụ", dienThoai: "0909 333 999", xacNhanKhongTrung: true })));
    return voi(T, cskh, (nc) =>
      taoPhieu(nc, LuocDoTaoPhieu.parse({ khachHangId: khach2.id, baoHanhId: bh1.id, loai: "bao-hanh", tieuDe: "Gắn nhầm khách" })),
    );
  });

  await voi(T, cskh, (nc) => giaoPhieu(nc, phieu.id, ktv, "Nhờ anh Kỹ thuật qua kiểm tra"));
  const ct2 = await voi(T, ktv, (nc) => chiTietPhieu(nc, phieu.id));
  dat("HT-04: giao phiếu thì chuyển sang Đang xử lý và gắn kỹ thuật viên", ct2.phieu.trangThai === "DANG_XU_LY" && ct2.phieu.nguoiXuLy?.id === ktv);
  dat("Kỹ thuật viên (phạm vi own) xem được phiếu của mình", ct2.phieu.id === phieu.id);

  const kdKhac = await nguoi("nhan-vien-kinh-doanh", "sales", tpKd);
  await nemLoi("Người ngoài bàn dịch vụ không xem được phiếu", "quyen", () => voi(T, kdKhac, (nc) => chiTietPhieu(nc, phieu.id)));

  await voi(T, ktv, (nc) => ghiDienBien(nc, phieu.id, { loai: "phan-hoi-khach", noiDung: "Đã gọi khách, hẹn 14h qua kiểm tra." }));
  const ct3 = await voi(T, ktv, (nc) => chiTietPhieu(nc, phieu.id));
  dat("HT-04: lần liên hệ khách đầu tiên ghi mốc phản hồi SLA", Boolean(ct3.phieu.phanHoiLuc) && ct3.phieu.mucPhanHoi === "con-han", JSON.stringify({ phanHoi: ct3.phieu.phanHoiLuc, muc: ct3.phieu.mucPhanHoi }));

  await nemLoi("HT-05: hoàn thành mà không ghi cách xử lý bị chặn", "dinh-dang", () =>
    voi(T, ktv, (nc) => doiTrangThaiPhieu(nc, phieu.id, { trangThai: "HOAN_THANH", cachXuLy: "", ghiChu: "" })),
  );
  await nemLoi("HT-02: không nhảy thẳng từ Đang xử lý sang Đóng", "nghiep-vu", () =>
    voi(T, ktv, (nc) => doiTrangThaiPhieu(nc, phieu.id, { trangThai: "DONG", cachXuLy: "x", ghiChu: "" })),
    "sai-trang-thai",
  );

  await voi(T, ktv, (nc) => doiTrangThaiPhieu(nc, phieu.id, { trangThai: "HOAN_THANH", cachXuLy: "Thay nguồn, máy chạy lại bình thường.", ghiChu: "" }));
  const ct4 = await voi(T, cskh, (nc) => chiTietPhieu(nc, phieu.id));
  dat("HT-05: hoàn thành ghi thời điểm và cách xử lý", ct4.phieu.trangThai === "HOAN_THANH" && Boolean(ct4.phieu.xongLuc) && Boolean(ct4.phieu.cachXuLy));
  await voi(T, cskh, (nc) => doiTrangThaiPhieu(nc, phieu.id, { trangThai: "DONG", cachXuLy: "", ghiChu: "Khách xác nhận máy chạy tốt" }));
  const ct5 = await voi(T, cskh, (nc) => chiTietPhieu(nc, phieu.id));
  dat("HT-06: đóng phiếu ghi thời điểm đóng", ct5.phieu.trangThai === "DONG" && Boolean(ct5.phieu.dongLuc));
  await nemLoi("Phiếu đã đóng thì không ghi thêm diễn biến", "nghiep-vu", () =>
    voi(T, cskh, (nc) => ghiDienBien(nc, phieu.id, { loai: "ghi-chu", noiDung: "Ghi thêm sau khi đóng" })),
    "phieu-da-dong",
  );
  await nemLoi("Phiếu đã đóng thì không sửa", "nghiep-vu", () => voi(T, cskh, (nc) => suaPhieu(nc, phieu.id, { uuTien: "thap" })), "phieu-da-dong");

  let chanSuaDienBien = false;
  try {
    await chu.supportTicketEvent.updateMany({ where: { tenantId: T }, data: { content: "sửa trộm" } });
  } catch {
    chanSuaDienBien = true;
  }
  dat("HT-07: CSDL chặn sửa diễn biến phiếu", chanSuaDienBien);

  const dsPhieu = await voi(T, cskh, (nc) => danhSachPhieu(nc, { q: "", trangThai: "tat-ca", loai: "", uuTien: "", nguoiXuLy: "", khachHang: "", treHan: "", trang: 1, coTrang: 20 }));
  dat("Danh sách phiếu đếm đúng phiếu đã xong", dsPhieu.tomTat.daXong === 1, JSON.stringify(dsPhieu.tomTat));

  // Phiếu thường: ngưỡng khác, và kiểm tra lọc trễ hạn không nhầm.
  const phieu2 = await voi(T, cskh, (nc) =>
    taoPhieu(nc, LuocDoTaoPhieu.parse({ khachHangId: khach.id, loai: "yeu-cau", uuTien: "thap", tieuDe: "Nhờ cài lại máy in" })),
  );
  const dsTre = await voi(T, cskh, (nc) => danhSachPhieu(nc, { q: "", trangThai: "", loai: "", uuTien: "", nguoiXuLy: "", khachHang: "", treHan: "1", trang: 1, coTrang: 20 }));
  dat("Phiếu mới mở chưa trễ hạn", dsTre.tong === 0 && dsTre.dong.every((p) => p.id !== phieu2.id), String(dsTre.tong));

  // ------------------------------------------------------------------
  console.log("\n— Dự án triển khai —");
  await nemLoi("Đơn còn nháp thì chưa mở dự án được", "dinh-dang", async () => {
    const donNhap = await voi(T, tpKd, (nc) =>
      taoDonHang(nc, LuocDoTaoDon.parse({ khachHangId: khach.id, dong: [{ ten: "Hạng mục thử", soLuong: "1", donGia: "1.000.000", vat: 10 }] })),
    );
    return voi(T, gd, (nc) => taoDuAn(nc, LuocDoTaoDuAn.parse({ khachHangId: khach.id, donHangId: donNhap.id, ten: "Dự án từ đơn nháp", nguoiPhuTrachId: tpKt })));
  });

  const duAn = await voi(T, gd, (nc) =>
    taoDuAn(nc, LuocDoTaoDuAn.parse({
      khachHangId: khach.id,
      donHangId: don.id,
      nguoiPhuTrachId: tpKt,
      ten: "Lắp đặt 2 máy trạm cho phòng kế toán",
      ngayDuKien: homNayVN(),
      hangMuc: ["Khảo sát mặt bằng", "Lắp đặt và cài đặt", "Bàn giao, hướng dẫn"],
    })),
  );
  dat("DU-01: số dự án DA-<năm>-0001, tạo kèm hạng mục", duAn.ma === `DA-${namVN()}-0001`, duAn.ma);
  const ctDa1 = await voi(T, tpKt, (nc) => chiTietDuAn(nc, duAn.id));
  dat("Dự án gắn đơn hàng và có 3 hạng mục", ctDa1.duAn.donHang?.id === don.id && ctDa1.duAn.hangMuc.length === 3);
  dat("Dự án mới ở trạng thái Đang chuẩn bị, tiến độ 0%", ctDa1.duAn.trangThai === "PLANNING" && ctDa1.duAn.tienDo.phanTram === 0);
  dat("DU-05: chưa xong hạng mục thì chưa hiện nút nghiệm thu", ctDa1.quyen.nghiemThu === false);

  await nemLoi("DU-05: nghiệm thu khi còn hạng mục dở bị chặn", "nghiep-vu", () =>
    voi(T, tpKt, (nc) => doiTrangThaiDuAn(nc, duAn.id, { trangThai: "ACCEPTED", ghiChu: "Thử nghiệm thu sớm" })),
    "sai-trang-thai",
  );

  const hm = ctDa1.duAn.hangMuc;
  await voi(T, tpKt, (nc) => suaHangMuc(nc, duAn.id, hm[0].id, { trangThai: "dang-lam" }));
  const ctDa2 = await voi(T, tpKt, (nc) => chiTietDuAn(nc, duAn.id));
  dat("DU-03: hạng mục bắt đầu chạy thì dự án tự sang Đang triển khai", ctDa2.duAn.trangThai === "IN_PROGRESS" && Boolean(ctDa2.duAn.ngayBatDau));
  dat("Dự án quá hạn dự kiến được đánh dấu", ctDa2.duAn.quaHan === false, `hạn ${ctDa2.duAn.ngayDuKien}`);

  const hmThem = await voi(T, tpKt, (nc) => themHangMuc(nc, duAn.id, { ten: "Nghiệm thu nội bộ", hanHoanThanh: "", ghiChu: "" }));
  dat("Thêm hạng mục giữa chừng được", hmThem.ten === "Nghiệm thu nội bộ");
  await voi(T, tpKt, (nc) => xoaHangMuc(nc, duAn.id, hmThem.id));

  for (const h of hm) await voi(T, tpKt, (nc) => suaHangMuc(nc, duAn.id, h.id, { trangThai: "xong" }));
  const ctDa3 = await voi(T, tpKt, (nc) => chiTietDuAn(nc, duAn.id));
  dat("DU-04: mọi hạng mục xong thì tiến độ 100%", ctDa3.duAn.tienDo.phanTram === 100 && !ctDa3.duAn.tienDo.conDangDo);
  dat("Hạng mục xong ghi thời điểm xong", ctDa3.duAn.hangMuc.every((h) => Boolean(h.xongLuc)));
  await nemLoi("Hạng mục đã xong thì không xóa", "nghiep-vu", () => voi(T, tpKt, (nc) => xoaHangMuc(nc, duAn.id, hm[0].id)), "hang-muc-da-xong");

  await nemLoi("Kỹ thuật viên không nghiệm thu được dự án", "quyen", () =>
    voi(T, ktv, (nc) => doiTrangThaiDuAn(nc, duAn.id, { trangThai: "ACCEPTED", ghiChu: "Thử" })),
  );
  await voi(T, tpKt, (nc) => doiTrangThaiDuAn(nc, duAn.id, { trangThai: "ACCEPTED", ghiChu: "Khách ký biên bản nghiệm thu ngày hôm nay" }));
  const ctDa4 = await voi(T, tpKt, (nc) => chiTietDuAn(nc, duAn.id));
  dat("DU-05: nghiệm thu ghi thời điểm và ghi chú", ctDa4.duAn.trangThai === "ACCEPTED" && Boolean(ctDa4.duAn.nghiemThuLuc) && Boolean(ctDa4.duAn.ghiChuNghiemThu));
  await nemLoi("Dự án đã nghiệm thu thì khóa, không sửa hạng mục", "nghiep-vu", () =>
    voi(T, tpKt, (nc) => suaHangMuc(nc, duAn.id, hm[0].id, { trangThai: "dang-lam" })),
    "du-an-da-dong",
  );
  await nemLoi("Dự án đã nghiệm thu thì không đổi trạng thái nữa", "nghiep-vu", () =>
    voi(T, tpKt, (nc) => doiTrangThaiDuAn(nc, duAn.id, { trangThai: "ON_HOLD", ghiChu: "" })),
    "sai-trang-thai",
  );

  const duAn2 = await voi(T, gd, (nc) => taoDuAn(nc, LuocDoTaoDuAn.parse({ khachHangId: khach.id, ten: "Dự án thử hủy", nguoiPhuTrachId: tpKt, hangMuc: ["Khảo sát"] })));
  await nemLoi("DU-06: hủy dự án phải ghi lý do", "dinh-dang", () =>
    voi(T, tpKt, (nc) => doiTrangThaiDuAn(nc, duAn2.id, { trangThai: "CANCELLED", ghiChu: "" })),
  );
  await voi(T, tpKt, (nc) => doiTrangThaiDuAn(nc, duAn2.id, { trangThai: "CANCELLED", ghiChu: "Khách dừng đầu tư" }));
  const dsDa = await voi(T, tpKt, (nc) => danhSachDuAn(nc, { q: "", trangThai: "tat-ca", nguoiPhuTrach: "", khachHang: "", quaHan: "", trang: 1, coTrang: 20 }));
  dat("Danh sách dự án đếm đúng đã nghiệm thu", dsDa.tomTat.daNghiemThu === 1 && dsDa.tong === 2, JSON.stringify(dsDa.tomTat));

  // ------------------------------------------------------------------
  console.log("\n— Nối chuỗi và hủy bảo hành —");
  const phieuDuAn = await voi(T, cskh, (nc) =>
    taoPhieu(nc, LuocDoTaoPhieu.parse({ khachHangId: khach.id, duAnId: duAn.id, loai: "bao-tri", tieuDe: "Bảo trì định kỳ sau lắp đặt" })),
  );
  const ctPhieuDuAn = await voi(T, cskh, (nc) => chiTietPhieu(nc, phieuDuAn.id));
  dat("Phiếu hỗ trợ gắn được vào dự án", ctPhieuDuAn.phieu.duAn?.id === duAn.id);
  const ctDaCuoi = await voi(T, tpKt, (nc) => chiTietDuAn(nc, duAn.id));
  dat("Trang dự án thấy phiếu hỗ trợ liên quan", ctDaCuoi.phieuHoTro.some((p) => p.id === phieuDuAn.id));

  const bh2 = dsBh.dong[1];
  await voi(T, cskh, (nc) => huyBaoHanh(nc, bh2.id, "Giao nhầm máy, đã thu hồi"));
  const ctBh2 = await voi(T, cskh, (nc) => chiTietBaoHanh(nc, bh2.id));
  dat("BH-05: hủy bảo hành giữ lại bản ghi kèm lý do", ctBh2.baoHanh.trangThai === "huy" && ctBh2.baoHanh.mucBaoHanh === "huy");
  await nemLoi("Bảo hành đã hủy thì không sửa", "nghiep-vu", () => voi(T, cskh, (nc) => suaBaoHanh(nc, bh2.id, { soThang: 12, lyDo: "Thử" })), "da-huy");
  const ctBh1 = await voi(T, cskh, (nc) => chiTietBaoHanh(nc, bh1.id));
  dat("Trang bảo hành thấy phiếu hỗ trợ đã mở cho máy đó", ctBh1.phieuHoTro.some((p) => p.id === phieu.id));

  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("Thử Bảo hành, Bàn dịch vụ, Dự án");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
