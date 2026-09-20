import { prisma, voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { namVN } from "../src/lib/so-chung-tu";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { taoNhaCungCap } from "../src/modules/nha-cung-cap/service";
import { datGiaNguon, taoSanPham } from "../src/modules/san-pham/service";
import { chotBaoGia, guiKhach, quyetDuyet, taoBaoGia, xinDuyet } from "../src/modules/bao-gia/service";
import {
  chiTietDonHang, danhSachDonHang, huyDon, suaDonHang, taoDonHang, taoDonTuBaoGia, taoPhieuXuat, xacNhanDon,
} from "../src/modules/don-hang/service";
import {
  danhSachKho, danhSachSerial, dieuChinhTon, doiSoatKho, ghiSoKho, nhapKho, suaKho, taoKho, theKho, tonKho, datMucTonToiThieu,
} from "../src/modules/kho/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { LuocDoTaoBaoGia } from "../src/modules/bao-gia/luoc-do";
import { LuocDoNhapKho, LuocDoTaoKho } from "../src/modules/kho/luoc-do";
import { LuocDoTaoDon, LuocDoTaoPhieuXuat } from "../src/modules/don-hang/luoc-do";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng nghiệp vụ Đơn hàng và Kho (Phase 5) trên cơ sở dữ liệu THẬT.
 * Luật: BUSINESS_RULES.md mục 6 (DH-01 → DH-09) và mục 7 (KHO-01 → KHO-08).
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
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-don-hang"));
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
  console.log("=== Thử Đơn hàng và Kho (Phase 5) ===\n");
  const tenant = await seedNenMong(chu, `thu-dh-${DAU}`, "Doanh nghiệp thử đơn hàng");
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
  const tp = await nguoi("truong-phong", "sales-manager");
  const nv = await nguoi("nhan-vien", "sales", tp);
  const kho1Nguoi = await nguoi("thu-kho", "warehouse");
  console.log("");

  // ------------------------------------------------------------------
  console.log("— Kho hàng —");
  const kho = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "kho-chinh", ten: "Kho chính", diaChi: "123 Đường Thử", macDinh: true })));
  dat("Tạo kho, mã viết hoa tự chuẩn hóa", kho.ma === "KHO-CHINH" && kho.macDinh, JSON.stringify(kho));
  const kho2 = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "kho-2", ten: "Kho chi nhánh" })));
  await nemLoi("Mã kho trùng bị chặn", "nghiep-vu", () => voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "KHO-CHINH", ten: "Trùng" }))), "trung-ma-kho");
  await nemLoi("Nhân viên kinh doanh không tạo được kho", "quyen", () => voi(T, nv, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "kho-nv", ten: "Của nhân viên" }))));
  dat("Thủ kho xem được danh sách kho", (await voi(T, kho1Nguoi, (nc) => danhSachKho(nc))).length === 2);

  // Dữ liệu nền: khách, nhà cung cấp, sản phẩm.
  const khach = await voi(T, nv, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Công ty TNHH Thử Đơn Hàng", dienThoai: "0909 777 111", diaChi: "456 Đường Giao Hàng" })));
  const ncc = await voi(T, gd, (nc) =>
    taoNhaCungCap(nc, { ten: "Nhà cung cấp Thử DH", maSoThue: null, nguoiLienHe: null, dienThoai: null, email: null, diaChi: null, website: null, dieuKhoanThanhToan: null, soNgayGiao: 3, ghiChu: null }),
  );
  const nhomSerial = await chu.productCategory.findFirst({ where: { tenantId: T, code: "laptop" }, select: { id: true } });
  const laptop = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: "LAP-THU-01", ten: "Laptop thử", nhomId: nhomSerial?.id, giaBan: "18000000", giaVon: "15000000", donViTinh: "cai" })),
  );
  dat("Sản phẩm nhóm laptop kế thừa quản lý số sê-ri", laptop.batBuocSerial === true, JSON.stringify(laptop.batBuocSerial));
  const chuot = await voi(T, gd, (nc) => taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: "CHUOT-THU", ten: "Chuột không dây", giaBan: "250000", giaVon: "150000", donViTinh: "cai" })));
  const nhomDichVu = await chu.productCategory.findFirst({ where: { tenantId: T, code: "dich-vu" }, select: { id: true } });
  const dichVu = await voi(T, gd, (nc) => taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: "DV-THU", ten: "Dịch vụ cài đặt", nhomId: nhomDichVu?.id, giaBan: "500000", giaVon: "0", donViTinh: "lan" })));
  await chu.product.update({ where: { id: dichVu.id }, data: { quanLyTon: false } });
  await voi(T, gd, (nc) => datGiaNguon(nc, laptop.id, { nhaCungCapId: ncc.id, giaMua: "15000000", tinhTrang: "con-hang", soNgayGiao: 3, thamChieu: null, ghiChu: null, lyDo: null }));

  // ------------------------------------------------------------------
  console.log("\n— Nhập kho —");
  await nemLoi("KHO-05: nhập hàng theo sê-ri mà thiếu sê-ri thì bị chặn", "nghiep-vu", () =>
    voi(T, kho1Nguoi, (nc) => nhapKho(nc, LuocDoNhapKho.parse({ khoId: kho.id, lyDo: "Nhập thử", dong: [{ sanPhamId: laptop.id, soLuong: "2", serial: ["SN-A"] }] }))),
    "thieu-serial",
  );
  const nhap = await voi(T, kho1Nguoi, (nc) =>
    nhapKho(nc, LuocDoNhapKho.parse({
      khoId: kho.id,
      lyDo: "Nhập mua của NCC Thử DH",
      dong: [
        { sanPhamId: laptop.id, soLuong: "3", giaVon: "15.000.000", serial: [`SN-${DAU}-1`, `SN-${DAU}-2`, `SN-${DAU}-3`] },
        { sanPhamId: chuot.id, soLuong: "20", giaVon: "150.000" },
      ],
    })),
  );
  dat("Nhập kho 2 mặt hàng, tồn cộng đúng", nhap.dong[0].tonSau === 3 && nhap.dong[1].tonSau === 20, JSON.stringify(nhap.dong));
  dat("Sê-ri vào kho ở trạng thái trong-kho", (await voi(T, kho1Nguoi, (nc) => danhSachSerial(nc, { q: `SN-${DAU}`, sanPham: "", kho: "", trangThai: "trong-kho", trang: 1, coTrang: 50 }))).tong === 3);
  await nemLoi("Sê-ri trùng bị chặn", "nghiep-vu", () =>
    voi(T, kho1Nguoi, (nc) => nhapKho(nc, LuocDoNhapKho.parse({ khoId: kho.id, lyDo: "Nhập lại", dong: [{ sanPhamId: laptop.id, soLuong: "1", serial: [`SN-${DAU}-1`] }] }))),
    "trung-serial",
  );
  await nemLoi("Nhân viên kinh doanh không nhập kho được", "quyen", () =>
    voi(T, nv, (nc) => nhapKho(nc, LuocDoNhapKho.parse({ khoId: kho.id, lyDo: "Thử", dong: [{ sanPhamId: chuot.id, soLuong: "1" }] }))),
  );

  console.log("\n— Điều chỉnh và cảnh báo tồn —");
  const dc = await voi(T, kho1Nguoi, (nc) => dieuChinhTon(nc, { khoId: kho.id, sanPhamId: chuot.id, chieu: "giam", soLuong: "2", lyDo: "Kiểm kê thiếu 2 cái", ghiChu: null }));
  dat("KHO-03: điều chỉnh giảm ghi đúng số dư mới", dc.sau.onHand === 18, JSON.stringify(dc.sau));
  await nemLoi("KHO-02: điều chỉnh giảm quá tồn bị chặn", "nghiep-vu", () =>
    voi(T, kho1Nguoi, (nc) => dieuChinhTon(nc, { khoId: kho.id, sanPhamId: chuot.id, chieu: "giam", soLuong: "999", lyDo: "Thử vượt tồn", ghiChu: null })),
    "ton-khong-du",
  );
  await voi(T, kho1Nguoi, (nc) => datMucTonToiThieu(nc, chuot.id, "25"));
  const tonCanhBao = await voi(T, kho1Nguoi, (nc) => tonKho(nc, { q: "", kho: "", canhBao: "1", trang: 1, coTrang: 20 }));
  dat("Lọc cảnh báo chỉ ra hàng dưới mức tối thiểu", tonCanhBao.dong.some((d) => d.sanPham.id === chuot.id && d.mucCanhBao === "sap-het"), JSON.stringify(tonCanhBao.dong.map((d) => [d.sanPham.sku, d.mucCanhBao])));

  // ------------------------------------------------------------------
  console.log("\n— Đơn hàng từ báo giá —");
  const bg = await voi(T, nv, (nc) =>
    taoBaoGia(nc, LuocDoTaoBaoGia.parse({
      khachHangId: khach.id,
      dong: [
        { sanPhamId: laptop.id, ten: "Laptop thử", soLuong: "2", donViTinh: "cai", donGia: "18.000.000", vat: 10, giaVon: "15.000.000" },
        { sanPhamId: dichVu.id, ten: "Dịch vụ cài đặt", soLuong: "2", donViTinh: "lan", donGia: "500.000", vat: 10, giaVon: "0" },
      ],
    })),
  );
  await nemLoi("DH-01: báo giá chưa chốt thì chưa tạo đơn được", "nghiep-vu", () => voi(T, tp, (nc) => taoDonTuBaoGia(nc, bg.id)), "bao-gia-chua-chot");

  await voi(T, nv, (nc) => xinDuyet(nc, bg.id, null));
  await voi(T, tp, (nc) => quyetDuyet(nc, bg.id, { quyetDinh: "cho-duyet", ghiChu: null }));
  await voi(T, nv, (nc) => guiKhach(nc, bg.id, { kenh: "email", ghiChu: null }));
  await voi(T, nv, (nc) => chotBaoGia(nc, bg.id, { ketQua: "ACCEPTED", ghiChu: "Khách đồng ý" }));

  const don = await voi(T, tp, (nc) => taoDonTuBaoGia(nc, bg.id));
  dat("DH-02: số đơn DH-<năm>-0001", don.so === `DH-${namVN()}-0001`, don.so);
  const ct1 = await voi(T, tp, (nc) => chiTietDonHang(nc, don.id));
  dat("Dòng hàng chép nguyên từ báo giá, giữ liên kết truy ngược", ct1.don.dong.length === 2 && ct1.don.dong.every((d) => d.dongBaoGiaId), JSON.stringify(ct1.don.dong.map((d) => d.ten)));
  dat("Tiền của đơn khớp báo giá đến từng đồng", ct1.don.tongCong === "40700000", ct1.don.tongCong);
  dat("Đơn nhớ nguồn gốc là báo giá nào", ct1.don.baoGia?.so === bg.so);
  const lai = await voi(T, tp, (nc) => taoDonTuBaoGia(nc, bg.id));
  dat("DH-01: gọi lại không đẻ đơn thứ hai", lai.id === don.id && lai.daCoTruoc === true, JSON.stringify(lai));

  // ------------------------------------------------------------------
  console.log("\n— Xác nhận, giữ chỗ, xuất hàng —");
  await nemLoi("Nhân viên kinh doanh không tự xác nhận đơn", "quyen", () => voi(T, nv, (nc) => xacNhanDon(nc, don.id, { khoId: kho.id, ghiChu: null })));
  await voi(T, tp, (nc) => xacNhanDon(nc, don.id, { khoId: kho.id, ghiChu: null }));
  const ct2 = await voi(T, tp, (nc) => chiTietDonHang(nc, don.id));
  dat("DH-04: xác nhận xong đơn sang Đã xác nhận", ct2.don.trangThai === "CONFIRMED" && Boolean(ct2.don.xacNhanLuc));
  const tonLaptop = (await voi(T, kho1Nguoi, (nc) => tonKho(nc, { q: "LAP-THU-01", kho: "", canhBao: "", trang: 1, coTrang: 20 }))).dong[0];
  dat("KHO-04: xác nhận giữ chỗ đúng số lượng, tồn không đổi", tonLaptop.tonKho === 3 && tonLaptop.giuCho === 2 && tonLaptop.conBanDuoc === 1, JSON.stringify(tonLaptop));
  dat("Dịch vụ không quản lý tồn thì không giữ chỗ", ct2.giuCho.every((g) => g.sanPhamId !== dichVu.id), JSON.stringify(ct2.giuCho));

  await nemLoi("DH-03: đơn đã xác nhận thì không sửa dòng hàng", "nghiep-vu", () => voi(T, tp, (nc) => suaDonHang(nc, don.id, { ghiChu: "Sửa lén" })), "da-xac-nhan");

  const dongLaptop = ct2.don.dong.find((d) => d.sanPhamId === laptop.id)!;
  const dongDichVu = ct2.don.dong.find((d) => d.sanPhamId === dichVu.id)!;
  await nemLoi("KHO-05: xuất hàng theo sê-ri mà thiếu sê-ri thì bị chặn", "nghiep-vu", () =>
    voi(T, kho1Nguoi, (nc) => taoPhieuXuat(nc, don.id, LuocDoTaoPhieuXuat.parse({ khoId: kho.id, dong: [{ dongDonId: dongLaptop.id, soLuong: "1" }] }))),
    "thieu-serial",
  );
  await nemLoi("DH-05: không xuất quá số lượng đặt", "nghiep-vu", () =>
    voi(T, kho1Nguoi, (nc) => taoPhieuXuat(nc, don.id, LuocDoTaoPhieuXuat.parse({ khoId: kho.id, dong: [{ dongDonId: dongLaptop.id, soLuong: "5", serial: [`SN-${DAU}-1`] }] }))),
    "xuat-qua-so-luong",
  );

  const px1 = await voi(T, kho1Nguoi, (nc) =>
    taoPhieuXuat(nc, don.id, LuocDoTaoPhieuXuat.parse({
      khoId: kho.id,
      nguoiNhan: "Anh Nam — kho khách",
      dong: [{ dongDonId: dongLaptop.id, soLuong: "1", serial: [`SN-${DAU}-1`] }],
    })),
  );
  dat("Phiếu xuất có số XK-<năm>-0001", px1.so === `XK-${namVN()}-0001`, px1.so);
  dat("DH-06: giao một phần thì đơn sang Giao một phần", px1.trangThaiDon === "PARTIALLY_DELIVERED", px1.trangThaiDon);
  const tonSauXuat = (await voi(T, kho1Nguoi, (nc) => tonKho(nc, { q: "LAP-THU-01", kho: "", canhBao: "", trang: 1, coTrang: 20 }))).dong[0];
  dat("Xuất hàng trừ tồn và nhả đúng phần giữ chỗ", tonSauXuat.tonKho === 2 && tonSauXuat.giuCho === 1, JSON.stringify(tonSauXuat));
  const serialDaBan = await voi(T, kho1Nguoi, (nc) => danhSachSerial(nc, { q: `SN-${DAU}-1`, sanPham: "", kho: "", trangThai: "da-ban", trang: 1, coTrang: 50 }));
  dat("Sê-ri đã xuất gắn với đơn của khách", serialDaBan.tong === 1 && serialDaBan.dong[0].donHang?.so === don.so, JSON.stringify(serialDaBan.dong[0]));
  await nemLoi("Sê-ri đã bán không xuất lại được", "nghiep-vu", () =>
    voi(T, kho1Nguoi, (nc) => taoPhieuXuat(nc, don.id, LuocDoTaoPhieuXuat.parse({ khoId: kho.id, dong: [{ dongDonId: dongLaptop.id, soLuong: "1", serial: [`SN-${DAU}-1`] }] }))),
    "serial-da-dung",
  );
  await nemLoi("Sê-ri ở kho khác không xuất từ kho này được", "nghiep-vu", () =>
    voi(T, kho1Nguoi, (nc) => taoPhieuXuat(nc, don.id, LuocDoTaoPhieuXuat.parse({ khoId: kho2.id, dong: [{ dongDonId: dongLaptop.id, soLuong: "1", serial: [`SN-${DAU}-2`] }] }))),
    "serial-khac-kho",
  );

  const px2 = await voi(T, kho1Nguoi, (nc) =>
    taoPhieuXuat(nc, don.id, LuocDoTaoPhieuXuat.parse({
      khoId: kho.id,
      dong: [
        { dongDonId: dongLaptop.id, soLuong: "1", serial: [`SN-${DAU}-2`] },
        { dongDonId: dongDichVu.id, soLuong: "2" },
      ],
    })),
  );
  dat("DH-06: giao đủ mọi dòng thì đơn sang Đã giao đủ", px2.trangThaiDon === "DELIVERED", px2.trangThaiDon);
  const ct3 = await voi(T, tp, (nc) => chiTietDonHang(nc, don.id));
  dat("Đơn giao xong ghi thời điểm hoàn thành và hết phần giữ chỗ", Boolean(ct3.don.hoanThanhLuc) && ct3.giuCho.length === 0, JSON.stringify(ct3.giuCho));
  dat("Đơn đã giao đủ thì không còn xuất được nữa", ct3.quyen.xuatHang === false);
  await nemLoi("DH-07: đơn đã giao đủ thì không hủy", "nghiep-vu", () => voi(T, tp, (nc) => huyDon(nc, don.id, "Thử hủy")), "da-giao-du");

  // ------------------------------------------------------------------
  console.log("\n— Hủy đơn nhả hàng giữ chỗ —");
  const don2 = await voi(T, tp, (nc) =>
    taoDonHang(nc, LuocDoTaoDon.parse({
      khachHangId: khach.id,
      dong: [{ sanPhamId: chuot.id, ten: "Chuột không dây", soLuong: "10", donViTinh: "cai", donGia: "250.000", vat: 10, giaVon: "150.000" }],
    })),
  );
  await voi(T, tp, (nc) => xacNhanDon(nc, don2.id, { khoId: kho.id, ghiChu: null }));
  const tonGiu = (await voi(T, kho1Nguoi, (nc) => tonKho(nc, { q: "CHUOT-THU", kho: "", canhBao: "", trang: 1, coTrang: 20 }))).dong[0];
  dat("Giữ chỗ 10 chuột, còn bán được 8", tonGiu.giuCho === 10 && tonGiu.conBanDuoc === 8, JSON.stringify(tonGiu));

  const don3 = await voi(T, tp, (nc) =>
    taoDonHang(nc, LuocDoTaoDon.parse({
      khachHangId: khach.id,
      dong: [{ sanPhamId: chuot.id, ten: "Chuột không dây", soLuong: "9", donViTinh: "cai", donGia: "250.000", vat: 10, giaVon: "150.000" }],
    })),
  );
  await nemLoi("KHO-04: xác nhận đơn khi hàng không đủ bị chặn", "nghiep-vu", () => voi(T, tp, (nc) => xacNhanDon(nc, don3.id, { khoId: kho.id, ghiChu: null })), "ton-khong-du");

  await voi(T, tp, (nc) => huyDon(nc, don2.id, "Khách đổi ý"));
  const tonSauHuy = (await voi(T, kho1Nguoi, (nc) => tonKho(nc, { q: "CHUOT-THU", kho: "", canhBao: "", trang: 1, coTrang: 20 }))).dong[0];
  dat("DH-07: hủy đơn nhả toàn bộ hàng giữ chỗ", tonSauHuy.giuCho === 0 && tonSauHuy.conBanDuoc === 18, JSON.stringify(tonSauHuy));
  await voi(T, tp, (nc) => xacNhanDon(nc, don3.id, { khoId: kho.id, ghiChu: null }));
  dat("Hàng nhả ra rồi thì đơn sau xác nhận được", (await voi(T, tp, (nc) => chiTietDonHang(nc, don3.id))).don.trangThai === "CONFIRMED");
  await voi(T, tp, (nc) => huyDon(nc, don3.id, "Dọn dữ liệu thử"));

  // ------------------------------------------------------------------
  console.log("\n— Sổ cái, đối soát, phạm vi —");
  const the = await voi(T, kho1Nguoi, (nc) => theKho(nc, { sanPham: chuot.id, kho: "", loai: "", trang: 1, coTrang: 50 }));
  dat("Thẻ kho ghi đủ nhập, điều chỉnh, giữ chỗ, nhả giữ chỗ", ["nhap", "dieu-chinh", "giu-cho", "nha-giu-cho"].every((l) => the.dong.some((d) => d.loai === l)), the.dong.map((d) => d.loai).join(","));
  dat("Mỗi dòng sổ cái ghi số dư sau giao dịch", the.dong.every((d) => typeof d.tonSau === "number"));

  let chanSua = false;
  try {
    await chu.inventoryTransaction.updateMany({ where: { tenantId: T }, data: { note: "sửa trộm" } });
  } catch {
    chanSua = true;
  }
  dat("KHO-01: CSDL chặn sửa sổ cái kho", chanSua);
  let chanXoa = false;
  try {
    await chu.inventoryTransaction.deleteMany({ where: { tenantId: T } });
  } catch {
    chanXoa = true;
  }
  dat("KHO-01: CSDL chặn xóa sổ cái kho", chanXoa);

  const doiSoat = await voi(T, gd, (nc) => doiSoatKho(nc));
  dat("Số dư khớp tổng sổ cái trên mọi cặp (kho, sản phẩm)", doiSoat.lech.length === 0, JSON.stringify(doiSoat.lech));

  const dsTp = await voi(T, tp, (nc) => danhSachDonHang(nc, { q: "", trangThai: "tat-ca", nguoiPhuTrach: "", khachHang: "", conPhaiGiao: "", trang: 1, coTrang: 20 }));
  dat("Trưởng phòng thấy đơn của cả nhóm", dsTp.tong === 3, String(dsTp.tong));
  dat("Tóm tắt đếm đúng đơn đã giao", dsTp.tomTat.soDaGiao === 1 && dsTp.tomTat.giaTriDaGiao === 40_700_000, JSON.stringify(dsTp.tomTat));
  const dsNv = await voi(T, nv, (nc) => danhSachDonHang(nc, { q: "", trangThai: "tat-ca", nguoiPhuTrach: "", khachHang: "", conPhaiGiao: "", trang: 1, coTrang: 20 }));
  dat("QĐ-13: nhân viên thấy đơn của khách mình phụ trách", dsNv.tong === 3, String(dsNv.tong));

  const nv2 = await nguoi("nhan-vien-2", "sales", tp);
  await nemLoi("Phạm vi: nhân viên khác không xem được đơn này", "khong-thay", () => voi(T, nv2, (nc) => chiTietDonHang(nc, don.id)));

  console.log("\n— Kho ngừng hoạt động —");
  await nemLoi("KHO-07: không ngừng kho khi còn hàng", "nghiep-vu", () => voi(T, gd, (nc) => suaKho(nc, kho.id, { trangThai: "ngung-hoat-dong" })), "kho-con-hang");
  const kho2Ngung = await voi(T, gd, (nc) => suaKho(nc, kho2.id, { trangThai: "ngung-hoat-dong" }));
  dat("Kho rỗng thì ngừng được", kho2Ngung.trangThai === "ngung-hoat-dong");
  await nemLoi("Không nhập vào kho đã ngừng", "nghiep-vu", () =>
    voi(T, kho1Nguoi, (nc) => nhapKho(nc, LuocDoNhapKho.parse({ khoId: kho2.id, lyDo: "Thử", dong: [{ sanPhamId: chuot.id, soLuong: "1" }] }))),
    "kho-ngung",
  );

  // Ghi sổ đồng thời: hai lần giữ chỗ chạy nối tiếp vẫn không vượt tồn.
  const truocDong = (await voi(T, kho1Nguoi, (nc) => tonKho(nc, { q: "CHUOT-THU", kho: "", canhBao: "", trang: 1, coTrang: 20 }))).dong[0];
  await voi(T, gd, (nc) => ghiSoKho(nc, { khoId: kho.id, sanPhamId: chuot.id, loai: "giu-cho", soLuong: truocDong.conBanDuoc, lyDo: "Thử khóa dòng" }));
  await nemLoi("Giữ chỗ vượt phần còn lại bị chặn", "nghiep-vu", () =>
    voi(T, gd, (nc) => ghiSoKho(nc, { khoId: kho.id, sanPhamId: chuot.id, loai: "giu-cho", soLuong: 1, lyDo: "Thử vượt" })),
    "ton-khong-du",
  );
  await voi(T, gd, (nc) => ghiSoKho(nc, { khoId: kho.id, sanPhamId: chuot.id, loai: "nha-giu-cho", soLuong: truocDong.conBanDuoc, lyDo: "Dọn dữ liệu thử" }));

  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("Thử Đơn hàng và Kho");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
