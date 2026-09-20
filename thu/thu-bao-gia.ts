import { prisma, voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { namVN } from "../src/lib/so-chung-tu";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { taoCoHoi } from "../src/modules/co-hoi/service";
import { taoNhaCungCap } from "../src/modules/nha-cung-cap/service";
import { datGiaNguon, taoSanPham } from "../src/modules/san-pham/service";
import {
  chiTietBaoGia, chotBaoGia, danhSachBaoGia, goiYSanPham, guiKhach, quyetDuyet,
  suaPhienBan, taoBaoGia, taoPhienBanMoi, xemPhienBan, xinDuyet,
} from "../src/modules/bao-gia/service";
import { capNhatHoSoCongTy, docHoSoCongTy } from "../src/modules/ho-so-cong-ty/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { LuocDoTaoCoHoi } from "../src/modules/co-hoi/luoc-do";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { LuocDoTaoBaoGia } from "../src/modules/bao-gia/luoc-do";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng nghiệp vụ Báo giá (Phase 4) trên cơ sở dữ liệu THẬT.
 * Luật: BUSINESS_RULES.md mục 5 (BG-01 → BG-10). Mỗi lần chạy một tenant thử riêng.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const NGAY_MAI = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-bao-gia"));
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
  console.log("=== Thử Báo giá (Phase 4) ===\n");
  const tenant = await seedNenMong(chu, `thu-bg-${DAU}`, "Doanh nghiệp thử báo giá");
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
  const nv1 = await nguoi("nhan-vien-1", "sales", tp);
  const nv2 = await nguoi("nhan-vien-2", "sales", tp);
  console.log("");

  // Dữ liệu nền: khách, cơ hội, sản phẩm có nguồn giá.
  const khach = await voi(T, nv1, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: "Công ty TNHH Thử Báo Giá", dienThoai: "0909 555 111" })));
  const coHoi = await voi(T, nv1, (nc) =>
    taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: khach.id, tieuDe: "20 PC văn phòng", giaTri: "240000000", hanhDongKeTiep: "Gửi báo giá", ngayHanhDong: NGAY_MAI })),
  );
  const ncc = await voi(T, gd, (nc) =>
    taoNhaCungCap(nc, { ten: "Nhà cung cấp Thử BG", maSoThue: null, nguoiLienHe: null, dienThoai: null, email: null, diaChi: null, website: null, dieuKhoanThanhToan: null, soNgayGiao: 3, ghiChu: null }),
  );
  const sp = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: "PC-VP-I5", ten: "PC văn phòng i5", giaBan: "12000000", giaVon: "10500000", donViTinh: "bo" })),
  );
  await voi(T, gd, (nc) => datGiaNguon(nc, sp.id, { nhaCungCapId: ncc.id, giaMua: "10000000", tinhTrang: "con-hang", soNgayGiao: 3, thamChieu: null, ghiChu: null, lyDo: null }));

  // ------------------------------------------------------------------
  console.log("— Lập báo giá —");
  const goiY = await voi(T, nv1, (nc) => goiYSanPham(nc, "PC-VP"));
  dat("Gợi ý sản phẩm trả giá bán và giá vốn theo nguồn nên mua", goiY[0]?.giaBan === "12000000" && goiY[0]?.giaVon === "10000000", JSON.stringify(goiY[0]));

  const bg = await voi(T, nv1, (nc) =>
    taoBaoGia(nc, LuocDoTaoBaoGia.parse({
      khachHangId: khach.id,
      coHoiId: coHoi.id,
      dong: [
        { sanPhamId: sp.id, ten: "PC văn phòng i5", soLuong: "20", donViTinh: "bo", donGia: "12.000.000", vat: 10, giaVon: "10.000.000", nhaCungCapId: ncc.id },
        { ten: "Dịch vụ cài đặt", soLuong: "20", donGia: "200.000", vat: 10, giaVon: "0" },
      ],
    })),
  );
  dat("BG-01: số báo giá QT-<năm>-0001", bg.so === `QT-${namVN()}-0001`, bg.so);
  const ct1 = await voi(T, nv1, (nc) => chiTietBaoGia(nc, bg.id));
  const pb1 = ct1.baoGia.phienBanHienHanh!;
  dat("Tổng tiền tính đúng (244tr + VAT)", pb1.tamTinh === "244000000" && pb1.tongCong === "268400000", `${pb1.tamTinh} / ${pb1.tongCong}`);
  dat("Biên lợi nhuận tính từ giá vốn chụp lúc lập", pb1.bienLoiNhuan === 18.03, String(pb1.bienLoiNhuan));
  dat("Dòng hàng chụp SKU của sản phẩm", pb1.dong[0].sku === "PC-VP-I5");
  dat("Phiên bản đầu là V1, trạng thái Nháp", pb1.phienBan === 1 && pb1.trangThai === "DRAFT");

  let chanSoLuong = false;
  try {
    await chu.quotationItem.create({ data: { tenantId: T, versionId: pb1.id, lineNo: 99, name: "Sai số lượng", quantity: "0", unitPrice: "1000" } });
  } catch {
    chanSoLuong = true;
  }
  dat("CSDL chặn dòng hàng số lượng 0", chanSoLuong);

  // ------------------------------------------------------------------
  console.log("\n— Duyệt theo ngưỡng biên lợi nhuận —");
  await nemLoi("BG-04: ngưỡng chưa đặt → không gửi thẳng được, phải duyệt", "nghiep-vu", () =>
    voi(T, nv1, (nc) => guiKhach(nc, bg.id, { kenh: "email", ghiChu: null })),
    "phai-duyet",
  );
  await voi(T, nv1, (nc) => xinDuyet(nc, bg.id, "Khách lớn, xin duyệt"));
  const ctXin = await voi(T, nv1, (nc) => chiTietBaoGia(nc, bg.id));
  dat("BG-03: xin duyệt chuyển sang Chờ duyệt, ghi lại ngưỡng lúc xin", ctXin.baoGia.phienBanHienHanh!.trangThai === "PENDING_APPROVAL" && ctXin.baoGia.phienBanHienHanh!.duyet[0].lyDo === "threshold_not_set");
  await nemLoi("Nhân viên không có quyền duyệt", "quyen", () => voi(T, nv1, (nc) => quyetDuyet(nc, bg.id, { quyetDinh: "cho-duyet", ghiChu: null })));
  await nemLoi("BG-04: chờ duyệt thì chưa gửi được", "nghiep-vu", () => voi(T, nv1, (nc) => guiKhach(nc, bg.id, { kenh: "email", ghiChu: null })), "phai-duyet");

  await voi(T, tp, (nc) => quyetDuyet(nc, bg.id, { quyetDinh: "cho-duyet", ghiChu: "Đồng ý giảm để giữ khách" }));
  const ctDuyet = await voi(T, nv1, (nc) => chiTietBaoGia(nc, bg.id));
  dat("Trưởng phòng duyệt → trạng thái Đã duyệt, ghi người quyết", ctDuyet.baoGia.phienBanHienHanh!.trangThai === "APPROVED" && ctDuyet.baoGia.phienBanHienHanh!.duyet[0].nguoiQuyetId === tp);

  await voi(T, nv1, (nc) => suaPhienBan(nc, bg.id, { ghiChu: "Thêm ghi chú sau khi duyệt" }));
  const ctSauSua = await voi(T, nv1, (nc) => chiTietBaoGia(nc, bg.id));
  dat("Sửa sau khi duyệt thì quay lại Nháp (duyệt cho con số cũ)", ctSauSua.baoGia.phienBanHienHanh!.trangThai === "DRAFT");

  await voi(T, nv1, (nc) => xinDuyet(nc, bg.id, null));
  await voi(T, tp, (nc) => quyetDuyet(nc, bg.id, { quyetDinh: "tu-choi", ghiChu: "Giảm quá sâu" }));
  const ctTuChoi = await voi(T, nv1, (nc) => chiTietBaoGia(nc, bg.id));
  dat("Từ chối duyệt → về Nháp để sửa lại", ctTuChoi.baoGia.phienBanHienHanh!.trangThai === "DRAFT");

  // ------------------------------------------------------------------
  console.log("\n— Gửi khách, phiên bản, chốt —");
  await voi(T, nv1, (nc) => xinDuyet(nc, bg.id, null));
  await voi(T, tp, (nc) => quyetDuyet(nc, bg.id, { quyetDinh: "cho-duyet", ghiChu: null }));
  await voi(T, nv1, (nc) => guiKhach(nc, bg.id, { kenh: "email", ghiChu: "Gửi qua email cho chị Mai" }));
  const ctGui = await voi(T, nv1, (nc) => chiTietBaoGia(nc, bg.id));
  dat("BG-04: gửi khách ghi thời điểm gửi", ctGui.baoGia.phienBanHienHanh!.trangThai === "SENT" && Boolean(ctGui.baoGia.phienBanHienHanh!.guiLuc));
  const coHoiSauGui = await chu.opportunity.findUniqueOrThrow({ where: { id: coHoi.id } });
  dat("Gửi báo giá đẩy cơ hội sang giai đoạn Báo giá", coHoiSauGui.stage === "QUOTATION");

  await nemLoi("BG-02: bản đã gửi không sửa trực tiếp", "nghiep-vu", () => voi(T, nv1, (nc) => suaPhienBan(nc, bg.id, { ghiChu: "Sửa lén" })), "da-gui");
  const v2 = await voi(T, nv1, (nc) => taoPhienBanMoi(nc, bg.id));
  dat("BG-02: tạo phiên bản V2, chép nguyên dòng hàng", v2.phienBan === 2);
  const ctV2 = await voi(T, nv1, (nc) => chiTietBaoGia(nc, bg.id));
  dat("V2 là bản hiện hành, ở trạng thái Nháp", ctV2.baoGia.phienBanHienHanh!.phienBan === 2 && ctV2.baoGia.phienBanHienHanh!.trangThai === "DRAFT" && ctV2.baoGia.phienBanHienHanh!.dong.length === 2);
  const banCu = ctV2.cacPhienBan.find((v) => v.phienBan === 1)!;
  dat("BG-02: bản V1 giữ nguyên, đánh dấu đã bị thay", banCu.trangThai === "SUPERSEDED");
  const xemV1 = await voi(T, nv1, (nc) => xemPhienBan(nc, bg.id, banCu.id));
  dat("Vẫn mở lại được bản V1 với số tiền cũ", xemV1.phienBan.tongCong === "268400000");

  // Ngưỡng đã đặt: biên 18% ≥ 15% → gửi thẳng, không cần duyệt.
  await voi(T, gd, (nc) => capNhatCauHinh(nc, { giaTri: { "bao_gia.nguong_bien_loi_nhuan": 15 } }));
  await voi(T, nv1, (nc) => guiKhach(nc, bg.id, { kenh: "zalo", ghiChu: null }));
  const ctGui2 = await voi(T, nv1, (nc) => chiTietBaoGia(nc, bg.id));
  dat("BG-03: biên đạt ngưỡng thì gửi thẳng, không phải duyệt", ctGui2.baoGia.phienBanHienHanh!.trangThai === "SENT");

  await voi(T, nv1, (nc) => chotBaoGia(nc, bg.id, { ketQua: "NEGOTIATING", ghiChu: "Khách xin giảm thêm 2%" }));
  const ctTl = await voi(T, nv1, (nc) => chiTietBaoGia(nc, bg.id));
  dat("Đang thương lượng vẫn là bản đang chạy, chưa chốt", ctTl.baoGia.phienBanHienHanh!.trangThai === "NEGOTIATING" && !ctTl.baoGia.phienBanHienHanh!.chotLuc);
  await voi(T, nv1, (nc) => chotBaoGia(nc, bg.id, { ketQua: "ACCEPTED", ghiChu: "Khách đồng ý" }));
  const ctNhan = await voi(T, nv1, (nc) => chiTietBaoGia(nc, bg.id));
  dat("BG-06: khách chấp nhận → ghi thời điểm chốt", ctNhan.baoGia.phienBanHienHanh!.trangThai === "ACCEPTED" && Boolean(ctNhan.baoGia.phienBanHienHanh!.chotLuc));
  dat("Sự kiện QUOTATION_ACCEPTED được ghi", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "QUOTATION_ACCEPTED", objectId: bg.id } })) === 1);

  // ------------------------------------------------------------------
  console.log("\n— Tự duyệt, phạm vi, danh sách —");
  const bgTp = await voi(T, tp, (nc) =>
    taoBaoGia(nc, LuocDoTaoBaoGia.parse({
      khachHangId: khach.id,
      dong: [{ ten: "Máy in", soLuong: "1", donGia: "5.000.000", vat: 10, giaVon: "4.900.000" }],
    })),
  );
  await voi(T, tp, (nc) => xinDuyet(nc, bgTp.id, null));
  await nemLoi("BG-05: người lập không tự duyệt báo giá của mình", "nghiep-vu", () =>
    voi(T, tp, (nc) => quyetDuyet(nc, bgTp.id, { quyetDinh: "cho-duyet", ghiChu: null })),
    "tu-duyet",
  );
  await voi(T, gd, (nc) => quyetDuyet(nc, bgTp.id, { quyetDinh: "cho-duyet", ghiChu: "Giám đốc duyệt" }));
  const ctTp = await voi(T, tp, (nc) => chiTietBaoGia(nc, bgTp.id));
  dat("Giám đốc (phạm vi toàn công ty) duyệt được", ctTp.baoGia.phienBanHienHanh!.trangThai === "APPROVED");

  await nemLoi("Phạm vi: NV2 không xem được báo giá của NV1", "khong-thay", () => voi(T, nv2, (nc) => chiTietBaoGia(nc, bg.id)));
  const dsTp = await voi(T, tp, (nc) => danhSachBaoGia(nc, { q: "", trangThai: "tat-ca", nguoiPhuTrach: "", khachHang: "", choDuyet: "", trang: 1, coTrang: 20 }));
  dat("Trưởng phòng thấy báo giá của cả nhóm", dsTp.tong === 2);
  const hangDoi = await voi(T, gd, (nc) => danhSachBaoGia(nc, { q: "", trangThai: "", nguoiPhuTrach: "", khachHang: "", choDuyet: "1", trang: 1, coTrang: 20 }));
  dat("Lọc 'chờ duyệt' cho hàng đợi người duyệt", hangDoi.tong === 0, `còn ${hangDoi.tong}`);
  dat("Tóm tắt danh sách có giá trị đã nhận", dsTp.tomTat.soDaNhan === 1 && dsTp.tomTat.giaTriDaNhan === 268_400_000, JSON.stringify(dsTp.tomTat));

  // ------------------------------------------------------------------
  console.log("\n— Hồ sơ công ty (bản in) —");
  const hoSo0 = await voiTenant(T, (tx) => docHoSoCongTy(tx, T));
  dat("Chưa khai thì hồ sơ công ty để TRỐNG, không bịa", hoSo0["cong_ty.dia_chi"] === "" && hoSo0.tenHienThi === tenant.name);
  await voi(T, gd, (nc) => capNhatHoSoCongTy(nc, { giaTri: { "cong_ty.dia_chi": "123 Đường Thử, TP.HCM", "cong_ty.nguoi_ky": "Trần Văn Mẫu" } }));
  const hoSo1 = await voiTenant(T, (tx) => docHoSoCongTy(tx, T));
  dat("Khai rồi thì bản in dùng đúng giá trị đã khai", hoSo1["cong_ty.dia_chi"] === "123 Đường Thử, TP.HCM");
  await nemLoi("Nhân viên không sửa được hồ sơ công ty", "quyen", () => voi(T, nv1, (nc) => capNhatHoSoCongTy(nc, { giaTri: { "cong_ty.dia_chi": "Sửa trộm" } })));

  await chu.$disconnect();
  await prisma.$disconnect();
  ketLuan("Thử Báo giá");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
