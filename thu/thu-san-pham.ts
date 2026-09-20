import { prisma, voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { taoNhom, suaNhom, cayNhomSanPham, taoThuongHieu } from "../src/modules/danh-muc-san-pham/service";
import { taoNhaCungCap, chiTietNhaCungCap, suaNhaCungCap, danhSachNhaCungCap } from "../src/modules/nha-cung-cap/service";
import { chiTietSanPham, danhSachSanPham, datGiaNguon, giaChoBaoGia, goGiaNguon, suaSanPham, taoSanPham } from "../src/modules/san-pham/service";
import { nhapCsv, lichSuNhap, mauCsv, xuatSanPhamCsv } from "../src/modules/san-pham/nhap-xuat";
import { timKiemToanCuc } from "../src/modules/tim-kiem/service";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng nghiệp vụ Sản phẩm và bảng giá (Phase 3) trên cơ sở dữ liệu THẬT.
 * Luật: BUSINESS_RULES.md mục 5. Mỗi lần chạy một tenant thử riêng.
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
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-san-pham"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "dinh-dang";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string) {
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
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    return e instanceof LoiNghiepVu ? e : null;
  }
}

async function main() {
  console.log("=== Thử Sản phẩm và bảng giá (Phase 3) ===\n");
  const tenant = await seedNenMong(chu, `thu-sp-${DAU}`, "Doanh nghiệp thử sản phẩm");
  const T = tenant.id;
  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  const nguoi = async (ten: string, vai: string) =>
    (
      await chu.user.create({
        data: {
          tenantId: T,
          email: `${ten}.${DAU}@thu.test`,
          passwordHash: "x",
          fullName: ten,
          userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
          staffProfile: { create: { tenantId: T } },
        },
      })
    ).id;

  const muaHang = await nguoi("mua-hang", "purchasing");
  const kinhDoanh = await nguoi("kinh-doanh", "sales");
  const ketToan = await nguoi("ke-toan", "finance");
  console.log("");

  // ------------------------------------------------------------------
  console.log("— Nhóm và thương hiệu —");
  const cay = await voi(T, muaHang, (nc) => cayNhomSanPham(nc));
  dat("Seed tạo đủ 12 nhóm sản phẩm theo prompt", cay.length === 12, `có ${cay.length}`);
  dat("Nhóm Laptop bắt buộc số sê-ri, bảo hành 24 tháng", Boolean(cay.find((n) => n.ma === "laptop" && n.batBuocSerial && n.baoHanhMacDinh === 24)));
  const nhomCon = await voi(T, muaHang, (nc) =>
    taoNhom(nc, { ma: "Laptop Văn Phòng", ten: "Laptop văn phòng", chaId: cay.find((n) => n.ma === "laptop")!.id, batBuocSerial: true, baoHanhMacDinh: 24, vatMacDinh: 10, thuTu: 1 }),
  );
  dat("Mã nhóm được chuẩn hóa về chữ thường không dấu", nhomCon.code === "laptop-van-phong", nhomCon.code);
  await nemLoi("Mã nhóm trùng bị từ chối", "nghiep-vu", () => voi(T, muaHang, (nc) => taoNhom(nc, { ma: "laptop", ten: "Trùng", batBuocSerial: false, thuTu: 0 })), "trung");
  await nemLoi("Không đặt nhóm con làm cha của chính cha nó (chống vòng)", "nghiep-vu", () =>
    voi(T, muaHang, (nc) => suaNhom(nc, cay.find((n) => n.ma === "laptop")!.id, { chaId: nhomCon.id })),
  );
  const th = await voi(T, muaHang, (nc) => taoThuongHieu(nc, { ma: "dell", ten: "Dell", website: null, ghiChu: null }));
  dat("Tạo thương hiệu", th.code === "dell");
  await nemLoi("Kinh doanh không sửa được danh mục sản phẩm", "quyen", () =>
    voi(T, kinhDoanh, (nc) => taoThuongHieu(nc, { ma: "hp", ten: "HP", website: null, ghiChu: null })),
  );

  // ------------------------------------------------------------------
  console.log("\n— Nhà cung cấp —");
  const mst = `06${String(Date.now()).slice(-8)}`;
  const ncc1 = await voi(T, muaHang, (nc) => taoNhaCungCap(nc, { ten: "Công ty TNHH Phân Phối An Bình", maSoThue: mst, dienThoai: "028 3999 1111", email: null, nguoiLienHe: "Anh Bình", diaChi: null, website: null, dieuKhoanThanhToan: null, soNgayGiao: 3, ghiChu: null }));
  dat("Mã nhà cung cấp NCC-0001", ncc1.ma === "NCC-0001", ncc1.ma);
  const ncc2 = await voi(T, muaHang, (nc) => taoNhaCungCap(nc, { ten: "Nhà phân phối Minh Khoa", maSoThue: null, dienThoai: null, email: null, nguoiLienHe: null, diaChi: null, website: null, dieuKhoanThanhToan: null, soNgayGiao: 7, ghiChu: null }));
  dat("Mã nhà cung cấp tăng dần", ncc2.ma === "NCC-0002", ncc2.ma);
  await nemLoi("Trùng mã số thuế nhà cung cấp bị chặn", "nghiep-vu", () =>
    voi(T, muaHang, (nc) => taoNhaCungCap(nc, { ten: "Tên khác", maSoThue: `${mst.slice(0, 4)}.${mst.slice(4)}`, dienThoai: null, email: null, nguoiLienHe: null, diaChi: null, website: null, dieuKhoanThanhToan: null, soNgayGiao: null, ghiChu: null })),
    "trung-ma-so-thue",
  );
  await nemLoi("Kinh doanh không tạo được nhà cung cấp", "quyen", () =>
    voi(T, kinhDoanh, (nc) => taoNhaCungCap(nc, { ten: "Của kinh doanh", maSoThue: null, dienThoai: null, email: null, nguoiLienHe: null, diaChi: null, website: null, dieuKhoanThanhToan: null, soNgayGiao: null, ghiChu: null })),
  );
  const dsNcc = await voi(T, kinhDoanh, (nc) => danhSachNhaCungCap(nc, { q: "An Bình", trangThai: "", trang: 1, coTrang: 20 }));
  dat("Kinh doanh xem được danh sách nhà cung cấp (để biết nguồn hàng)", dsNcc.tong === 1);

  // ------------------------------------------------------------------
  console.log("\n— Sản phẩm —");
  const sp = await voi(T, muaHang, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({
      sku: "lap-dell-3420",
      ten: "Laptop Dell Vostro 3420 i5-1235U",
      nhomId: nhomCon.id,
      thuongHieuId: th.id,
      model: "V3420",
      donViTinh: "cai",
      giaVon: "15.200.000",
      giaBan: "17900000",
      thongSo: { CPU: "i5-1235U", RAM: "8GB" },
    })),
  );
  dat("SP-01: SKU lưu nguyên dạng nhập, khóa so trùng viết hoa", sp.sku === "lap-dell-3420");
  dat("SP-02: giá '15.200.000' đọc đúng 15,2 triệu", sp.giaVon === "15200000", String(sp.giaVon));
  dat("SP-03: kế thừa bảo hành và yêu cầu sê-ri từ nhóm", sp.baoHanhThang === 24 && sp.batBuocSerial);
  dat("Biên lợi nhuận tính được từ giá vốn và giá bán", sp.bienLoiNhuan === 15.1, String(sp.bienLoiNhuan));
  await nemLoi("SP-01: SKU khác cách viết vẫn bị coi là trùng", "nghiep-vu", () =>
    voi(T, muaHang, (nc) => taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: "LAP-DELL-3420", ten: "Hàng khác" }))),
    "trung-sku",
  );
  await nemLoi("SKU có ký tự lạ bị từ chối", "dinh-dang", () => voi(T, muaHang, (nc) => taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: "sp@01", ten: "Sai SKU" }))));
  await nemLoi("Đơn vị tính ngoài Dữ liệu gốc bị từ chối", "dinh-dang", () =>
    voi(T, muaHang, (nc) => taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: "SP-DVT", ten: "Sai đơn vị", donViTinh: "khong-co" }))),
  );
  await nemLoi("Kinh doanh không tạo được sản phẩm", "quyen", () =>
    voi(T, kinhDoanh, (nc) => taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: "SP-KD", ten: "Của kinh doanh" }))),
  );
  const xemKd = await voi(T, kinhDoanh, (nc) => danhSachSanPham(nc, { q: "vostro", nhom: "", thuongHieu: "", nhaCungCap: "", trangThai: "hoat-dong", thieuGia: "", sapXep: "moi-nhat", trang: 1, coTrang: 25 }));
  dat("Kinh doanh xem được sản phẩm (danh mục dùng chung, không phạm vi riêng)", xemKd.tong === 1);
  const timSku = await voi(T, ketToan, (nc) => danhSachSanPham(nc, { q: "LAP-DELL", nhom: "", thuongHieu: "", nhaCungCap: "", trangThai: "hoat-dong", thieuGia: "", sapXep: "moi-nhat", trang: 1, coTrang: 25 }));
  dat("Tìm theo SKU", timSku.tong === 1);

  // Lịch sử giá
  const ls0 = await chu.priceHistory.findMany({ where: { tenantId: T, productId: sp.id }, orderBy: { changedAt: "asc" } });
  dat("SP-08: giá lúc tạo được ghi vào lịch sử (giá vốn + giá bán)", ls0.length === 2 && ls0.every((h) => h.oldPrice === null));
  await voi(T, muaHang, (nc) => suaSanPham(nc, sp.id, { giaBan: "18500000", lyDoDoiGia: "Giá tháng 10" }));
  const ls1 = await chu.priceHistory.findMany({ where: { tenantId: T, productId: sp.id, priceType: "selling" }, orderBy: { changedAt: "desc" } });
  dat("SP-08: đổi giá bán ghi thêm dòng lịch sử có giá cũ và lý do", ls1[0].oldPrice?.toString() === "17900000" && ls1[0].newPrice?.toString() === "18500000" && ls1[0].reason === "Giá tháng 10");
  await voi(T, muaHang, (nc) => suaSanPham(nc, sp.id, { giaBan: "18500000" }));
  dat("Sửa mà giá không đổi thì KHÔNG ghi thêm lịch sử", (await chu.priceHistory.count({ where: { tenantId: T, productId: sp.id, priceType: "selling" } })) === 2);

  let chanSuaLichSu = false;
  try {
    await chu.priceHistory.update({ where: { id: ls1[0].id }, data: { newPrice: "1" } });
  } catch {
    chanSuaLichSu = true;
  }
  dat("SP-08: CSDL chặn sửa lịch sử giá (kể cả vai chủ sở hữu)", chanSuaLichSu);

  // ------------------------------------------------------------------
  console.log("\n— Bảng giá nhiều nguồn —");
  await voi(T, muaHang, (nc) => datGiaNguon(nc, sp.id, { nhaCungCapId: ncc1.id, giaMua: "15200000", tinhTrang: "con-hang", soNgayGiao: 3, thamChieu: "BG-09", ghiChu: null, lyDo: null }));
  await voi(T, muaHang, (nc) => datGiaNguon(nc, sp.id, { nhaCungCapId: ncc2.id, giaMua: "14900000", tinhTrang: "het-hang", soNgayGiao: 1, thamChieu: null, ghiChu: null, lyDo: null }));
  const ct = await voi(T, kinhDoanh, (nc) => chiTietSanPham(nc, sp.id));
  dat("SP-05: một sản phẩm giữ được nhiều nguồn giá", ct.giaNguon.length === 2);
  dat("SP-07: nguồn nên mua là nơi CÒN HÀNG dù giá cao hơn", ct.nenMua?.nhaCungCap.id === ncc1.id, JSON.stringify(ct.nenMua));
  await voi(T, muaHang, (nc) => datGiaNguon(nc, sp.id, { nhaCungCapId: ncc2.id, giaMua: "14500000", tinhTrang: "con-hang", soNgayGiao: 1, thamChieu: null, ghiChu: null, lyDo: "Giá mới" }));
  const ct2 = await voi(T, kinhDoanh, (nc) => chiTietSanPham(nc, sp.id));
  dat("SP-07: khi cả hai còn hàng thì chọn nguồn rẻ hơn", ct2.nenMua?.nhaCungCap.id === ncc2.id);
  dat("SP-05: cập nhật giá nguồn ghi lịch sử kèm nhà cung cấp", ct2.lichSuGia.some((h) => h.loai === "supplier" && h.giaCu === "14900000" && h.giaMoi === "14500000" && h.nhaCungCap?.id === ncc2.id));
  await nemLoi("Kinh doanh không đặt được giá nguồn", "quyen", () =>
    voi(T, kinhDoanh, (nc) => datGiaNguon(nc, sp.id, { nhaCungCapId: ncc1.id, giaMua: "1", tinhTrang: "con-hang", soNgayGiao: null, thamChieu: null, ghiChu: null, lyDo: null })),
  );
  const choBaoGia = await voi(T, kinhDoanh, (nc) => giaChoBaoGia(nc, [sp.id]));
  dat("Phase 4 lấy được giá vốn và nguồn tốt nhất của sản phẩm", choBaoGia[0].nguonTot?.nhaCungCapId === ncc2.id && choBaoGia[0].giaBan === "18500000");

  const giaNcc2 = ct2.giaNguon.find((g) => g.nhaCungCap.id === ncc2.id)!;
  await voi(T, muaHang, (nc) => goGiaNguon(nc, giaNcc2.id));
  const ct3 = await voi(T, muaHang, (nc) => chiTietSanPham(nc, sp.id));
  dat("Gỡ nguồn: dòng giá chuyển sang ngừng, nguồn nên mua đổi lại", ct3.nenMua?.nhaCungCap.id === ncc1.id && ct3.giaNguon.find((g) => g.id === giaNcc2.id)?.trangThai === "ngung-hoat-dong");
  dat("Gỡ nguồn vẫn ghi lịch sử (giá mới rỗng)", ct3.lichSuGia.some((h) => h.loai === "supplier" && h.giaMoi === null));
  await nemLoi("Ngừng nhà cung cấp còn dòng giá đang dùng bị chặn", "nghiep-vu", () => voi(T, muaHang, (nc) => suaNhaCungCap(nc, ncc1.id, { trangThai: "ngung-hoat-dong" })));
  const ctNcc = await voi(T, muaHang, (nc) => chiTietNhaCungCap(nc, ncc1.id));
  dat("Trang nhà cung cấp liệt kê mặt hàng đang báo giá", ctNcc.matHang.some((m) => m.sanPham.id === sp.id));

  // ------------------------------------------------------------------
  console.log("\n— Nhập và xuất CSV —");
  const csv = [
    "SKU;Tên;Nhóm;Thương hiệu;ĐVT;Giá vốn;Giá bán;VAT;Bảo hành",
    "lap-dell-3420;Laptop Dell Vostro 3420 i5-1235U;laptop-van-phong;Dell;cai;15.000.000;18.000.000;10;24",
    "MAN-DELL-24;Màn hình Dell 24 inch;laptop;Dell;cai;2.500.000;3.200.000;10;36",
    "SP-THIEU-TEN;;laptop;Dell;cai;1.000.000;1.500.000;10;12",
    "SP-NHOM-LA;Hàng nhóm lạ;khong-co-nhom;Dell;cai;1.000.000;1.500.000;10;12",
    "MAN-DELL-24;Trùng trong tệp;laptop;Dell;cai;1;2;10;12",
    "SP-GIA-SAI;Giá sai;laptop;Dell;cai;abc.def.ghi;1.500.000;10;12",
  ].join("\n");

  const xem = await voi(T, muaHang, (nc) => nhapCsv(nc, { tenTep: "bang-gia.csv", noiDung: csv, loai: "san-pham", nhaCungCapId: null, ghiThat: false }));
  dat("Xem trước: đếm đúng tạo / sửa / lỗi", xem.tongDong === 6 && xem.soTao === 1 && xem.soSua === 1 && xem.soLoi === 4, JSON.stringify({ t: xem.tongDong, tao: xem.soTao, sua: xem.soSua, loi: xem.soLoi }));
  dat("Xem trước KHÔNG ghi gì vào cơ sở dữ liệu", (await chu.product.count({ where: { tenantId: T } })) === 1);
  dat("Báo đúng dòng thiếu tên", xem.dong.some((r) => r.soDong === 4 && r.loi?.includes("Thiếu tên")));
  dat("Báo đúng dòng nhóm không tồn tại", xem.dong.some((r) => r.soDong === 5 && r.loi?.includes("khong-co-nhom")));
  dat("Báo đúng dòng SKU lặp trong tệp", xem.dong.some((r) => r.soDong === 6 && r.loi?.includes("lặp lại")));
  dat("Báo đúng dòng giá viết sai", xem.dong.some((r) => r.soDong === 7 && r.loi?.includes("số tiền")));

  const ghi = await voi(T, muaHang, (nc) => nhapCsv(nc, { tenTep: "bang-gia.csv", noiDung: csv, loai: "san-pham", nhaCungCapId: null, ghiThat: true }));
  dat("Nhập thật: tạo 1, sửa 1, bỏ qua 4 dòng hỏng", ghi.soTao === 1 && ghi.soSua === 1 && ghi.soLoi === 4);
  dat("Nhập thật ghi lại một phiếu nhập", Boolean(ghi.importJobId));
  const spSua = await chu.product.findFirstOrThrow({ where: { tenantId: T, skuNormalized: "LAP-DELL-3420" } });
  dat("Dòng trùng SKU cập nhật sản phẩm cũ, không tạo thêm", spSua.sellingPrice?.toString() === "18000000" && (await chu.product.count({ where: { tenantId: T } })) === 2);
  dat("SP-08: giá đổi qua CSV vẫn vào lịch sử, đánh dấu nguồn nhap-csv", (await chu.priceHistory.count({ where: { tenantId: T, productId: sp.id, source: "nhap-csv" } })) >= 1);
  const ls = await voi(T, muaHang, (nc) => lichSuNhap(nc));
  dat("Lịch sử nhập hiện lần nhập vừa rồi kèm người nhập", ls[0].tenTep === "bang-gia.csv" && ls[0].soTao === 1 && ls[0].nguoi === "mua-hang");

  const spMoi = await chu.product.findFirstOrThrow({ where: { tenantId: T, skuNormalized: "MAN-DELL-24" } });
  const csvGia = ["SKU,Giá mua,Tình trạng,Số ngày giao", `MAN-DELL-24,2.400.000,Còn hàng,2`, "KHONG-CO,1.000.000,Còn hàng,1"].join("\n");
  const nhapGia = await voi(T, muaHang, (nc) => nhapCsv(nc, { tenTep: "gia-ncc.csv", noiDung: csvGia, loai: "gia-nha-cung-cap", nhaCungCapId: ncc1.id, ghiThat: true }));
  dat("Nhập bảng giá nhà cung cấp: 1 dòng vào, 1 dòng báo chưa có sản phẩm", nhapGia.soSua === 1 && nhapGia.soLoi === 1);
  const giaMoi = await chu.supplierProductPrice.findFirstOrThrow({ where: { tenantId: T, productId: spMoi.id, supplierId: ncc1.id } });
  dat("Giá nhập từ CSV đúng số và tình trạng", giaMoi.purchasePrice.toString() === "2400000" && giaMoi.availability === "con-hang");
  await nemLoi("Nhập bảng giá mà chưa chọn nhà cung cấp bị chặn", "nghiep-vu", () =>
    voi(T, muaHang, (nc) => nhapCsv(nc, { tenTep: "x.csv", noiDung: csvGia, loai: "gia-nha-cung-cap", nhaCungCapId: null, ghiThat: false })),
    "thieu-nha-cung-cap",
  );
  await nemLoi("Tệp thiếu cột bắt buộc bị chặn kèm tên cột", "nghiep-vu", () =>
    voi(T, muaHang, (nc) => nhapCsv(nc, { tenTep: "x.csv", noiDung: "Cot1,Cot2\na,b", loai: "san-pham", nhaCungCapId: null, ghiThat: false })),
    "thieu-cot",
  );
  await nemLoi("Kinh doanh không nhập được tệp (chỉ xem)", "quyen", () =>
    voi(T, kinhDoanh, (nc) => nhapCsv(nc, { tenTep: "x.csv", noiDung: csv, loai: "san-pham", nhaCungCapId: null, ghiThat: true })),
  );

  const xuat = await voi(T, kinhDoanh, (nc) => xuatSanPhamCsv(nc, { trangThai: "hoat-dong" }));
  dat("Xuất CSV có BOM, đủ tiêu đề và cả hai sản phẩm", xuat.noiDung.startsWith("﻿") && xuat.noiDung.includes("LAP-DELL") === false && xuat.noiDung.includes("lap-dell-3420") && xuat.noiDung.includes("MAN-DELL-24"));
  dat("Tệp mẫu CSV tải được", mauCsv("san-pham").includes("SKU"));

  const kqTim = await voi(T, kinhDoanh, (nc) => timKiemToanCuc(nc, "MAN-DELL"));
  dat("Tìm kiếm toàn cục ra sản phẩm theo SKU", kqTim.some((k) => k.loai === "san-pham"));

  // ------------------------------------------------------------------
  console.log("\n— Cách ly tenant —");
  const khac = await chu.tenant.findFirst({ where: { code: "itw" }, select: { id: true } });
  if (khac) {
    const thay = await voiTenant(khac.id, (tx) => tx.product.count({ where: { id: sp.id } }));
    dat("Tenant khác không thấy sản phẩm của tenant thử", thay === 0);
  }

  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("Thử Sản phẩm");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
