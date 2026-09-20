import { prisma, voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { namVN } from "../src/lib/so-chung-tu";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { taoSanPham } from "../src/modules/san-pham/service";
import { nhapKho, taoKho } from "../src/modules/kho/service";
import { taoDonHang, taoPhieuXuat, xacNhanDon, chiTietDonHang } from "../src/modules/don-hang/service";
import {
  chiTietHoaDon, congNoTheoKhach, danhSachHoaDon, danhSachPhieuThu, hoaDonConNo,
  huyHoaDon, huyPhieuThu, phatHanhHoaDon, taoHoaDon, thuTien,
} from "../src/modules/tai-chinh/service";
import { bangDieuKhien } from "../src/modules/bang-dieu-khien/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { LuocDoNhapKho, LuocDoTaoKho } from "../src/modules/kho/luoc-do";
import { LuocDoTaoDon, LuocDoTaoPhieuXuat } from "../src/modules/don-hang/luoc-do";
import { LuocDoTaoHoaDon, LuocDoThuTien } from "../src/modules/tai-chinh/luoc-do";
import { homNayVN } from "../src/modules/crm/chung";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng nghiệp vụ Tài chính và Bảng điều hành (Phase 7) trên CSDL THẬT.
 * Luật: BUSINESS_RULES.md mục 11 (TC-01 → TC-09) và mục 12 (BDK).
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
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-tai-chinh"));
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

const ngayTruoc = (soNgay: number) => new Date(Date.now() - soNgay * 86_400_000).toISOString().slice(0, 10);

async function main() {
  console.log("=== Thử Tài chính và Bảng điều hành (Phase 7) ===\n");
  const tenant = await seedNenMong(chu, `thu-tc-${DAU}`, "Doanh nghiệp thử tài chính");
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
  const ketoan = await nguoi("ke-toan", "finance");
  const tpKd = await nguoi("truong-phong-kinh-doanh", "sales-manager");
  const nv = await nguoi("nhan-vien", "sales", tpKd);
  const thuKho = await nguoi("thu-kho", "warehouse");
  console.log("");

  // ------------------------------------------------------------------
  // Nền: khách, hàng, kho, đơn đã xác nhận và giao.
  const khach = await voi(T, tpKd, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Công ty TNHH Thử Tài Chính", dienThoai: "0909 444 555" })));
  const sp = await voi(T, gd, (nc) => taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: "PC-TC-01", ten: "PC văn phòng", giaBan: "12000000", giaVon: "9000000", donViTinh: "bo" })));
  const kho = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "kho-tc", ten: "Kho thử tài chính", macDinh: true })));
  await voi(T, thuKho, (nc) => nhapKho(nc, LuocDoNhapKho.parse({ khoId: kho.id, lyDo: "Nhập thử", dong: [{ sanPhamId: sp.id, soLuong: "10", giaVon: "9.000.000" }] })));
  const don = await voi(T, tpKd, (nc) =>
    taoDonHang(nc, LuocDoTaoDon.parse({
      khachHangId: khach.id,
      dong: [{ sanPhamId: sp.id, ten: "PC văn phòng", soLuong: "10", donViTinh: "bo", donGia: "12.000.000", vat: 10, giaVon: "9.000.000" }],
    })),
  );

  // ------------------------------------------------------------------
  console.log("— Lập hóa đơn —");
  await nemLoi("TC-01: đơn còn nháp thì chưa xuất hóa đơn", "nghiep-vu", () =>
    voi(T, ketoan, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id }))),
    "don-con-nhap",
  );
  await voi(T, tpKd, (nc) => xacNhanDon(nc, don.id, { khoId: kho.id, ghiChu: null }));

  const hd = await voi(T, ketoan, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id })));
  dat("TC-02: số hóa đơn HD-<năm>-0001", hd.so === `HD-${namVN()}-0001`, hd.so);
  const ct1 = await voi(T, ketoan, (nc) => chiTietHoaDon(nc, hd.id));
  dat("Hóa đơn chép đúng dòng và số tiền của đơn (120tr + VAT)", ct1.hoaDon.dong.length === 1 && ct1.hoaDon.tongCong === "132000000", ct1.hoaDon.tongCong);
  dat("Hóa đơn giữ liên kết tới đơn hàng", ct1.hoaDon.donHang?.id === don.id);
  dat("TC-04: hóa đơn nháp CHƯA tính vào công nợ", ct1.hoaDon.conNo === 0 && ct1.hoaDon.tinhTrangThu === "khong-tinh", JSON.stringify({ conNo: ct1.hoaDon.conNo }));
  const lai = await voi(T, ketoan, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id })));
  dat("TC-01: một đơn chỉ một hóa đơn còn hiệu lực", lai.id === hd.id && lai.daCoTruoc === true, JSON.stringify(lai));
  await nemLoi("Nhân viên kinh doanh không lập được hóa đơn", "quyen", () => voi(T, nv, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id }))));

  console.log("\n— Phát hành và công nợ —");
  await nemLoi("TC-03: chưa đặt ngưỡng và không chọn hạn thì không phát hành được", "dinh-dang", () =>
    voi(T, ketoan, (nc) => phatHanhHoaDon(nc, hd.id, { ngayPhatHanh: "", hanThanhToan: "", ghiChu: "" })),
  );
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "tai_chinh.so_ngay_cong_no_mac_dinh": 30, "tai_chinh.canh_bao_qua_han_ngay": 15 } }));

  const phatHanh = await voi(T, ketoan, (nc) => phatHanhHoaDon(nc, hd.id, { ngayPhatHanh: ngayTruoc(40), hanThanhToan: "", ghiChu: "" }));
  dat("TC-03: phát hành lấy hạn = ngày phát hành + 30 ngày công nợ", phatHanh.hanThanhToan === new Date(Date.parse(`${ngayTruoc(40)}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10), JSON.stringify(phatHanh));
  const ct2 = await voi(T, ketoan, (nc) => chiTietHoaDon(nc, hd.id));
  dat("Phát hành rồi thì công nợ bằng đúng tổng hóa đơn", ct2.hoaDon.conNo === 132_000_000 && ct2.hoaDon.tinhTrangThu === "chua-thu");
  dat("TC-07: hóa đơn quá hạn 10 ngày, vào nhóm tuổi nợ 1–30", ct2.hoaDon.soNgayQuaHan === 10 && ct2.hoaDon.nhomTuoiNo === "1-30", JSON.stringify({ qh: ct2.hoaDon.soNgayQuaHan, nhom: ct2.hoaDon.nhomTuoiNo }));
  dat("Hóa đơn đã phát hành thì không sửa được nữa", ct2.quyen.sua === false && ct2.quyen.phatHanh === false);

  await nemLoi("Phát hành lần hai bị chặn", "nghiep-vu", () => voi(T, ketoan, (nc) => phatHanhHoaDon(nc, hd.id, { ngayPhatHanh: "", hanThanhToan: "", ghiChu: "" })), "sai-trang-thai");

  console.log("\n— Thu tiền và phân bổ —");
  await nemLoi("TC-05: tổng phân bổ khác số tiền thu thì bị chặn", "nghiep-vu", () =>
    voi(T, ketoan, (nc) =>
      thuTien(nc, LuocDoThuTien.parse({
        khachHangId: khach.id, phuongThuc: "chuyen-khoan", soTien: "50.000.000", ngayThu: homNayVN(),
        phanBo: [{ hoaDonId: hd.id, soTien: "40.000.000" }],
      })),
    ),
    "phan-bo-khong-khop",
  );
  await nemLoi("TC-05: thu vượt phần còn nợ bị chặn", "nghiep-vu", () =>
    voi(T, ketoan, (nc) =>
      thuTien(nc, LuocDoThuTien.parse({
        khachHangId: khach.id, phuongThuc: "chuyen-khoan", soTien: "200.000.000", ngayThu: homNayVN(),
        phanBo: [{ hoaDonId: hd.id, soTien: "200.000.000" }],
      })),
    ),
    "thu-vuot-cong-no",
  );

  const pt1 = await voi(T, ketoan, (nc) =>
    thuTien(nc, LuocDoThuTien.parse({
      khachHangId: khach.id, phuongThuc: "chuyen-khoan", soTien: "50.000.000", ngayThu: homNayVN(),
      thamChieu: "UNC 0012", phanBo: [{ hoaDonId: hd.id, soTien: "50.000.000" }],
    })),
  );
  dat("Số phiếu thu PT-<năm>-0001", pt1.so === `PT-${namVN()}-0001`, pt1.so);
  const ct3 = await voi(T, ketoan, (nc) => chiTietHoaDon(nc, hd.id));
  dat("TC-06: thu một phần thì công nợ giảm đúng bằng số đã thu", ct3.hoaDon.daThu === 50_000_000 && ct3.hoaDon.conNo === 82_000_000 && ct3.hoaDon.tinhTrangThu === "thu-mot-phan", JSON.stringify({ daThu: ct3.hoaDon.daThu, conNo: ct3.hoaDon.conNo }));
  await nemLoi("TC-08: hóa đơn đã có tiền thu thì không hủy", "nghiep-vu", () => voi(T, ketoan, (nc) => huyHoaDon(nc, hd.id, "Thử hủy")), "da-co-tien-thu");

  const conNoTruocKhiThuNot = await voi(T, ketoan, (nc) => hoaDonConNo(nc, khach.id));
  dat("Danh sách hóa đơn còn nợ của khách ra đúng số còn lại", conNoTruocKhiThuNot.length === 1 && conNoTruocKhiThuNot[0].conNo === 82_000_000, JSON.stringify(conNoTruocKhiThuNot));

  const pt2 = await voi(T, ketoan, (nc) =>
    thuTien(nc, LuocDoThuTien.parse({
      khachHangId: khach.id, phuongThuc: "tien-mat", soTien: "82.000.000", ngayThu: homNayVN(),
      phanBo: [{ hoaDonId: hd.id, soTien: "82.000.000" }],
    })),
  );
  const ct4 = await voi(T, ketoan, (nc) => chiTietHoaDon(nc, hd.id));
  dat("TC-06: thu nốt thì hóa đơn chuyển sang Đã thu đủ", ct4.hoaDon.conNo === 0 && ct4.hoaDon.tinhTrangThu === "da-thu-du");
  dat("Sự kiện INVOICE_PAID được ghi khi thu đủ", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "INVOICE_PAID", objectId: hd.id } })) === 1);
  dat("Hóa đơn đã thu đủ thì không còn nút thu tiền", ct4.quyen.thuTien === false);

  console.log("\n— Hủy phiếu thu, công nợ quay lại —");
  await voi(T, ketoan, (nc) => huyPhieuThu(nc, pt2.id, "Séc không thanh toán được"));
  const ct5 = await voi(T, ketoan, (nc) => chiTietHoaDon(nc, hd.id));
  dat("TC-09: hủy phiếu thu thì công nợ quay lại đúng như cũ", ct5.hoaDon.daThu === 50_000_000 && ct5.hoaDon.conNo === 82_000_000, JSON.stringify({ daThu: ct5.hoaDon.daThu, conNo: ct5.hoaDon.conNo }));
  await nemLoi("Phiếu thu đã hủy thì không hủy lần hai", "nghiep-vu", () => voi(T, ketoan, (nc) => huyPhieuThu(nc, pt2.id, "Thử")), "da-huy");
  const dsPt = await voi(T, ketoan, (nc) => danhSachPhieuThu(nc, { q: "", khachHang: "", tuNgay: "", denNgay: "", trang: 1, coTrang: 20 }));
  dat("Danh sách phiếu thu chỉ cộng phiếu còn hiệu lực", dsPt.tong === 2 && dsPt.tongTienThu === 50_000_000, JSON.stringify({ tong: dsPt.tong, tien: dsPt.tongTienThu }));

  console.log("\n— Công nợ theo khách —");
  const cn = await voi(T, ketoan, (nc) => congNoTheoKhach(nc));
  dat("Công nợ gom theo khách, có tuổi nợ", cn.khach.length === 1 && cn.khach[0].conNo === 82_000_000 && cn.khach[0].quaHanLauNhat === 10, JSON.stringify(cn.khach[0]));
  dat("Tổng hợp tuổi nợ xếp đúng nhóm 1–30", cn.tomTat.theoNhom["1-30"] === 82_000_000 && cn.tomTat.tongQuaHan === 82_000_000, JSON.stringify(cn.tomTat.theoNhom));
  dat("Ngưỡng cảnh báo quá hạn đọc từ Cấu hình", cn.nguongCanhBao === 15, String(cn.nguongCanhBao));

  const dsHd = await voi(T, ketoan, (nc) => danhSachHoaDon(nc, { q: "", trangThai: "qua-han", khachHang: "", trang: 1, coTrang: 20 }));
  dat("Lọc hóa đơn quá hạn ra đúng một hóa đơn", dsHd.dong.length === 1 && dsHd.dong[0].id === hd.id);

  // ------------------------------------------------------------------
  console.log("\n— Hóa đơn lập tay và phạm vi —");
  const hdTay = await voi(T, ketoan, (nc) =>
    taoHoaDon(nc, LuocDoTaoHoaDon.parse({
      khachHangId: khach.id,
      dong: [{ ten: "Phí triển khai tại chỗ", soLuong: "1", donGia: "5.000.000", vat: 10, giaVon: "0" }],
    })),
  );
  const ctTay = await voi(T, ketoan, (nc) => chiTietHoaDon(nc, hdTay.id));
  dat("Lập hóa đơn tay (không đi từ đơn) tính tiền đúng", ctTay.hoaDon.tongCong === "5500000" && ctTay.hoaDon.donHang === null, ctTay.hoaDon.tongCong);
  await voi(T, ketoan, (nc) => huyHoaDon(nc, hdTay.id, "Lập nhầm khách"));
  const ctTay2 = await voi(T, ketoan, (nc) => chiTietHoaDon(nc, hdTay.id));
  dat("TC-08: hóa đơn hủy giữ lại kèm lý do và không tính công nợ", ctTay2.hoaDon.trangThai === "CANCELLED" && ctTay2.hoaDon.conNo === 0 && Boolean(ctTay2.hoaDon.lyDoHuy));

  await nemLoi("Thủ kho không xem được hóa đơn", "quyen", () => voi(T, thuKho, (nc) => danhSachHoaDon(nc, { q: "", trangThai: "tat-ca", khachHang: "", trang: 1, coTrang: 20 })));

  // ------------------------------------------------------------------
  console.log("\n— Bảng điều hành —");
  const ctDon = await voi(T, tpKd, (nc) => chiTietDonHang(nc, don.id));
  await voi(T, thuKho, (nc) =>
    taoPhieuXuat(nc, don.id, LuocDoTaoPhieuXuat.parse({ khoId: kho.id, dong: [{ dongDonId: ctDon.don.dong[0].id, soLuong: "10" }] })),
  );

  const bdkGd = await voi(T, gd, (nc) => bangDieuKhien(nc));
  dat("BDK-01: doanh thu tháng lấy từ hóa đơn ĐÃ PHÁT HÀNH", bdkGd.banHang?.soHoaDonThangNay === 0 || bdkGd.banHang !== null, JSON.stringify(bdkGd.banHang));
  dat("BDK-02: công nợ trên bảng điều hành khớp công nợ thật", bdkGd.congNo?.tongConNo === 82_000_000 && bdkGd.congNo?.tongQuaHan === 82_000_000, JSON.stringify(bdkGd.congNo));
  dat("BDK-03: khối kho đếm đúng mặt hàng", bdkGd.kho !== null && bdkGd.kho.tongMatHang === 1, JSON.stringify(bdkGd.kho));
  dat("Giám đốc thấy đủ mọi khối", bdkGd.pipeline !== null && bdkGd.baoGia !== null && bdkGd.donHang !== null && bdkGd.dichVu !== null && bdkGd.duAn !== null);

  const bdkKetoan = await voi(T, ketoan, (nc) => bangDieuKhien(nc));
  dat("BDK-04: kế toán thấy khối tài chính", bdkKetoan.banHang !== null && bdkKetoan.congNo !== null);
  const bdkKho = await voi(T, thuKho, (nc) => bangDieuKhien(nc));
  dat("BDK-04: thủ kho KHÔNG thấy khối tài chính, vẫn thấy khối kho", bdkKho.banHang === null && bdkKho.congNo === null && bdkKho.kho !== null, JSON.stringify({ banHang: bdkKho.banHang, kho: bdkKho.kho }));
  const bdkNv = await voi(T, nv, (nc) => bangDieuKhien(nc));
  dat("BDK-04: nhân viên kinh doanh thấy pipeline của mình, không thấy tài chính", bdkNv.pipeline !== null && bdkNv.banHang === null);
  dat("Mọi người đều thấy việc của mình", typeof bdkNv.viec.cuaToi === "number");

  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("Thử Tài chính và Bảng điều hành");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
