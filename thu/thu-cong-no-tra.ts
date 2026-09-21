import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { namVN } from "../src/lib/so-chung-tu";
import { taoSanPham } from "../src/modules/san-pham/service";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { LuocDoTaoNhaCungCap, taoNhaCungCap } from "../src/modules/nha-cung-cap/service";
import { taoKho } from "../src/modules/kho/service";
import { LuocDoTaoKho } from "../src/modules/kho/luoc-do";
import { guiDonMua, taoDonMua } from "../src/modules/mua-hang/service";
import { LuocDoTaoDonMua } from "../src/modules/mua-hang/luoc-do";
import {
  chiTien,
  chiTietHoaDonMua,
  congNoTheoNhaCungCap,
  danhSachHoaDonMua,
  danhSachPhieuChi,
  ghiNhanHoaDonMua,
  hoaDonConNoCua,
  huyHoaDonMua,
  huyPhieuChi,
  taoHoaDonMua,
} from "../src/modules/cong-no-tra/service";
import {
  LuocDoChiTien,
  LuocDoGhiNhanHoaDonMua,
  LuocDoTaoHoaDonMua,
} from "../src/modules/cong-no-tra/luoc-do";
import { homNayVN } from "../src/modules/crm/chung";
import { congNgay } from "../src/modules/nhac-viec/tinh-toan";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng công nợ phải trả (hóa đơn nhà cung cấp, phiếu chi) trên CSDL THẬT.
 * Luật: BUSINESS_RULES.md mục 17 (CT).
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
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-cong-no-tra"));
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
  console.log("=== Thử Công nợ phải trả (hóa đơn nhà cung cấp, phiếu chi) ===\n");
  const tenant = await seedNenMong(chu, `thu-cnt-${DAU}`, "Doanh nghiệp thử công nợ phải trả");
  const T = tenant.id;
  const homNay = homNayVN();

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

  const gd = await nguoi("giam-doc", "ceo");
  const ketoan = await nguoi("ke-toan", "finance");
  const muaHang = await nguoi("nhan-vien-mua-hang", "purchasing");
  console.log("");

  // Nền: nhà cung cấp, kho, sản phẩm, một đơn mua đã gửi.
  const ncc = await voi(T, muaHang, (nc) =>
    taoNhaCungCap(nc, LuocDoTaoNhaCungCap.parse({ ten: `Công ty Nguồn Hàng ${DAU}`, dienThoai: "0909 888 777" })),
  );
  const ncc2 = await voi(T, muaHang, (nc) =>
    taoNhaCungCap(nc, LuocDoTaoNhaCungCap.parse({ ten: `Doanh nghiệp Phụ Kiện ${DAU}`, dienThoai: "0909 888 666" })),
  );
  const kho = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "kho-cnt", ten: "Kho thử công nợ trả", macDinh: true })));
  const sp = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `CNT-${DAU}`, ten: "Màn hình 24 inch", giaBan: "4000000", giaVon: "3000000", donViTinh: "cai" })),
  );
  const dm = await voi(T, muaHang, (nc) =>
    taoDonMua(nc, LuocDoTaoDonMua.parse({
      nhaCungCapId: ncc.id,
      khoId: kho.id,
      dong: [{ sanPhamId: sp.id, ten: "Màn hình 24 inch", soLuong: "10", donGia: "3.000.000", vat: 10 }],
    })),
  );

  // ------------------------------------------------------------------
  console.log("— CT-01, CT-02: lập hóa đơn nhà cung cấp —");

  await nemLoi("Đơn mua còn nháp thì chưa ghi hóa đơn", "nghiep-vu", () =>
    voi(T, ketoan, (nc) => taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({ donMuaId: dm.id }))),
    "don-con-nhap",
  );

  await voi(T, muaHang, (nc) => guiDonMua(nc, dm.id));

  await nemLoi("Nhân viên mua hàng không lập được hóa đơn nhà cung cấp", "quyen", () =>
    voi(T, muaHang, (nc) => taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({ donMuaId: dm.id }))),
  );

  const hd = await voi(T, ketoan, (nc) =>
    taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({ donMuaId: dm.id, soHoaDonNcc: `AA/25E-${DAU}` })),
  );
  dat("CT-01: hóa đơn có mã HM-<năm>-0001", hd.so === `HM-${namVN()}-0001`, hd.so);

  const ct1 = await voi(T, ketoan, (nc) => chiTietHoaDonMua(nc, hd.id));
  dat("Hóa đơn chép đúng dòng và số tiền của đơn mua (30tr + VAT)", ct1.hoaDon.dong.length === 1 && ct1.hoaDon.tongCong === "33000000", ct1.hoaDon.tongCong);
  dat("Hóa đơn giữ liên kết tới đơn mua", ct1.hoaDon.donMua?.id === dm.id);
  dat("Giữ số hóa đơn của nhà cung cấp để đối chiếu", ct1.hoaDon.soHoaDonNcc === `AA/25E-${DAU}`);
  dat("CT-03: hóa đơn nháp CHƯA tính vào công nợ", ct1.hoaDon.conNo === 0 && ct1.hoaDon.tinhTrangTra === "khong-tinh");
  dat("Đối chiếu ba chiều: biết đơn đặt 10, đã nhận 0", ct1.hoaDon.dong[0].datTrenDon === "10" && ct1.hoaDon.dong[0].daNhan === "0");
  dat("Chỉ ra chỗ lệch giữa hóa đơn và số đã nhận", ct1.hoaDon.dong[0].lechVoiNhan === 10, String(ct1.hoaDon.dong[0].lechVoiNhan));

  const lai = await voi(T, ketoan, (nc) => taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({ donMuaId: dm.id })));
  dat("CT-02: một đơn mua chỉ có một hóa đơn còn hiệu lực", lai.id === hd.id && lai.daCoTruoc === true, JSON.stringify(lai));

  // ------------------------------------------------------------------
  console.log("\n— CT-03, CT-04: ghi nhận hóa đơn —");

  dat(
    "CT-04: lược đồ bắt buộc hạn thanh toán (đọc từ hóa đơn nhà cung cấp, không tự đoán)",
    LuocDoGhiNhanHoaDonMua.safeParse({ ngayHoaDon: homNay, hanThanhToan: "" }).success === false,
  );

  await nemLoi("Hạn trước ngày hóa đơn bị chặn", "dinh-dang", () =>
    voi(T, ketoan, (nc) =>
      ghiNhanHoaDonMua(nc, hd.id, LuocDoGhiNhanHoaDonMua.parse({ ngayHoaDon: congNgay(homNay, -5), hanThanhToan: congNgay(homNay, -10) })),
    ),
  );
  await nemLoi("Ngày hóa đơn ở tương lai bị chặn", "dinh-dang", () =>
    voi(T, ketoan, (nc) =>
      ghiNhanHoaDonMua(nc, hd.id, LuocDoGhiNhanHoaDonMua.parse({ ngayHoaDon: congNgay(homNay, 1), hanThanhToan: congNgay(homNay, 30) })),
    ),
  );

  const ghiNhan = await voi(T, ketoan, (nc) =>
    ghiNhanHoaDonMua(nc, hd.id, LuocDoGhiNhanHoaDonMua.parse({ ngayHoaDon: congNgay(homNay, -20), hanThanhToan: congNgay(homNay, -5) })),
  );
  dat("CT-03: ghi nhận xong thì chuyển RECORDED", ghiNhan.trangThai === "RECORDED", ghiNhan.trangThai);

  const ct2 = await voi(T, ketoan, (nc) => chiTietHoaDonMua(nc, hd.id));
  dat("Ghi nhận rồi thì nợ phải trả bằng đúng tổng hóa đơn", ct2.hoaDon.conNo === 33_000_000 && ct2.hoaDon.tinhTrangTra === "chua-thu");
  dat("CT-07: hóa đơn quá hạn 5 ngày, vào nhóm tuổi nợ 1–30", ct2.hoaDon.soNgayQuaHan === 5 && ct2.hoaDon.nhomTuoiNo === "1-30", JSON.stringify({ qh: ct2.hoaDon.soNgayQuaHan, nhom: ct2.hoaDon.nhomTuoiNo }));
  dat("Đã ghi nhận thì khóa sửa, mở chi tiền", ct2.quyen.sua === false && ct2.quyen.chiTien === true);
  await nemLoi("Ghi nhận lần hai bị chặn", "nghiep-vu", () =>
    voi(T, ketoan, (nc) => ghiNhanHoaDonMua(nc, hd.id, LuocDoGhiNhanHoaDonMua.parse({ hanThanhToan: congNgay(homNay, 10) }))),
    "sai-trang-thai",
  );

  // ------------------------------------------------------------------
  console.log("\n— CT-05: chi tiền —");

  await nemLoi("Chi quá phần còn nợ bị chặn", "nghiep-vu", () =>
    voi(T, ketoan, (nc) =>
      chiTien(nc, LuocDoChiTien.parse({
        nhaCungCapId: ncc.id,
        phuongThuc: "chuyen-khoan",
        soTien: "40.000.000",
        phanBo: [{ hoaDonId: hd.id, soTien: "40.000.000" }],
      })),
    ),
    "chi-vuot-cong-no",
  );
  await nemLoi("Tổng phân bổ lệch số tiền chi bị chặn", "nghiep-vu", () =>
    voi(T, ketoan, (nc) =>
      chiTien(nc, LuocDoChiTien.parse({
        nhaCungCapId: ncc.id,
        phuongThuc: "tien-mat",
        soTien: "1.000.000",
        phanBo: [{ hoaDonId: hd.id, soTien: "600.000" }],
      })),
    ),
    "phan-bo-khong-khop",
  );
  await nemLoi("Chi cho hóa đơn của nhà cung cấp khác bị chặn", "dinh-dang", () =>
    voi(T, ketoan, (nc) =>
      chiTien(nc, LuocDoChiTien.parse({
        nhaCungCapId: ncc2.id,
        phuongThuc: "tien-mat",
        soTien: "1.000.000",
        phanBo: [{ hoaDonId: hd.id, soTien: "1.000.000" }],
      })),
    ),
  );

  const chi1 = await voi(T, ketoan, (nc) =>
    chiTien(nc, LuocDoChiTien.parse({
      nhaCungCapId: ncc.id,
      phuongThuc: "chuyen-khoan",
      soTien: "13.000.000",
      ngayChi: congNgay(homNay, -2),
      thamChieu: `UNC ${DAU}`,
      phanBo: [{ hoaDonId: hd.id, soTien: "13.000.000" }],
    })),
  );
  dat("CT-05: phiếu chi có mã PC-<năm>-0001", chi1.so === `PC-${namVN()}-0001`, chi1.so);

  const ct3 = await voi(T, ketoan, (nc) => chiTietHoaDonMua(nc, hd.id));
  dat("CT-06: nợ trừ đúng phần đã chi", ct3.hoaDon.daTra === 13_000_000 && ct3.hoaDon.conNo === 20_000_000 && ct3.hoaDon.tinhTrangTra === "thu-mot-phan", JSON.stringify([ct3.hoaDon.daTra, ct3.hoaDon.conNo]));
  dat("Hóa đơn thấy phiếu chi đã trừ vào nó", ct3.hoaDon.phieuChi.length === 1 && ct3.hoaDon.phieuChi[0].so === chi1.so);

  await nemLoi("CT-08: hóa đơn đã chi tiền thì không hủy được", "nghiep-vu", () =>
    voi(T, ketoan, (nc) => huyHoaDonMua(nc, hd.id, "Thử hủy")),
    "da-co-tien-chi",
  );

  // ------------------------------------------------------------------
  console.log("\n— CT-06, CT-07: bảng công nợ phải trả —");

  const cn1 = await voi(T, ketoan, (nc) => congNoTheoNhaCungCap(nc));
  dat("Tổng còn phải trả đúng", cn1.tomTat.tongConNo === 20_000_000, String(cn1.tomTat.tongConNo));
  dat("Toàn bộ đang quá hạn", cn1.tomTat.tongQuaHan === 20_000_000 && cn1.tomTat.soHoaDonQuaHan === 1);
  dat("CT-07: rơi đúng nhóm tuổi nợ 1–30", cn1.tomTat.theoNhom["1-30"] === 20_000_000, JSON.stringify(cn1.tomTat.theoNhom));
  dat("Gom theo nhà cung cấp, có số ngày quá hạn lâu nhất", cn1.nhaCungCap.length === 1 && cn1.nhaCungCap[0].quaHanLauNhat === 5, JSON.stringify(cn1.nhaCungCap[0]));

  const conNo = await voi(T, ketoan, (nc) => hoaDonConNoCua(nc, ncc.id));
  dat("Hóa đơn còn nợ của nhà cung cấp trả đúng phần còn lại", conNo.length === 1 && conNo[0].conNo === 20_000_000);

  // ------------------------------------------------------------------
  console.log("\n— CT-09: hủy phiếu chi thì nợ quay lại —");

  await nemLoi("Kế toán không có quyền duyệt thì không hủy được phiếu chi", "quyen", () =>
    voi(T, muaHang, (nc) => huyPhieuChi(nc, chi1.id, "thử")),
  );
  await voi(T, ketoan, (nc) => huyPhieuChi(nc, chi1.id, "Chuyển khoản nhầm số tài khoản"));
  const ct4 = await voi(T, ketoan, (nc) => chiTietHoaDonMua(nc, hd.id));
  dat("CT-09: hủy phiếu chi thì nợ quay lại như trước", ct4.hoaDon.daTra === 0 && ct4.hoaDon.conNo === 33_000_000);
  await nemLoi("Hủy phiếu chi lần hai bị chặn", "nghiep-vu", () => voi(T, ketoan, (nc) => huyPhieuChi(nc, chi1.id, "lần nữa")), "da-huy");

  const dsPc = await voi(T, ketoan, (nc) => danhSachPhieuChi(nc, { q: "", nhaCungCap: "", tuNgay: "", denNgay: "", trang: 1, coTrang: 20 }));
  dat("Phiếu chi đã hủy vẫn nằm trong danh sách kèm lý do", dsPc.dong.length === 1 && dsPc.dong[0].trangThai === "huy" && dsPc.dong[0].lyDoHuy === "Chuyển khoản nhầm số tài khoản");
  dat("Tổng tiền đã chi KHÔNG tính phiếu đã hủy", dsPc.tongTienChi === 0, String(dsPc.tongTienChi));

  // ------------------------------------------------------------------
  console.log("\n— Trả đủ và hủy hóa đơn chưa chi —");

  const chi2 = await voi(T, ketoan, (nc) =>
    chiTien(nc, LuocDoChiTien.parse({
      nhaCungCapId: ncc.id,
      phuongThuc: "chuyen-khoan",
      soTien: "33.000.000",
      phanBo: [{ hoaDonId: hd.id, soTien: "33.000.000" }],
    })),
  );
  const ct5 = await voi(T, ketoan, (nc) => chiTietHoaDonMua(nc, hd.id));
  dat("Trả đủ thì hết nợ", ct5.hoaDon.conNo === 0 && ct5.hoaDon.tinhTrangTra === "da-thu-du", JSON.stringify([ct5.hoaDon.conNo, ct5.hoaDon.tinhTrangTra]));
  dat("Sự kiện trả đủ được ghi", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "SUPPLIER_BILL_PAID" } })) === 1);
  dat("Có phiếu chi thứ hai", Boolean(chi2.id));

  const cn2 = await voi(T, ketoan, (nc) => congNoTheoNhaCungCap(nc));
  dat("Trả đủ rồi thì bảng công nợ về 0", cn2.tomTat.tongConNo === 0 && cn2.nhaCungCap.length === 0);

  const hdLe = await voi(T, ketoan, (nc) =>
    taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({
      nhaCungCapId: ncc2.id,
      ghiChu: "Phí vận chuyển",
      dong: [{ ten: "Phí vận chuyển tháng 9", soLuong: "1", donGia: "2.000.000", vat: 8 }],
    })),
  );
  const ctLe = await voi(T, ketoan, (nc) => chiTietHoaDonMua(nc, hdLe.id));
  dat("CT-01: lập tay được hóa đơn khoản lẻ, VAT 8%", ctLe.hoaDon.tongCong === "2160000", ctLe.hoaDon.tongCong);
  dat("Hóa đơn lập tay không gắn đơn mua nào", ctLe.hoaDon.donMua === null);

  await voi(T, ketoan, (nc) => huyHoaDonMua(nc, hdLe.id, "Nhà cung cấp gửi nhầm"));
  const ctLeHuy = await voi(T, ketoan, (nc) => chiTietHoaDonMua(nc, hdLe.id));
  dat("Hủy hóa đơn chưa chi thì giữ lại lý do", ctLeHuy.hoaDon.trangThai === "CANCELLED" && ctLeHuy.hoaDon.lyDoHuy === "Nhà cung cấp gửi nhầm");
  await nemLoi("Chi tiền cho hóa đơn đã hủy bị chặn", "nghiep-vu", () =>
    voi(T, ketoan, (nc) =>
      chiTien(nc, LuocDoChiTien.parse({
        nhaCungCapId: ncc2.id,
        phuongThuc: "tien-mat",
        soTien: "100.000",
        phanBo: [{ hoaDonId: hdLe.id, soTien: "100.000" }],
      })),
    ),
    "hoa-don-chua-ghi-nhan",
  );

  // ------------------------------------------------------------------
  console.log("\n— Danh sách và bộ lọc —");

  const dsCon = await voi(T, ketoan, (nc) => danhSachHoaDonMua(nc, { q: "", trangThai: "", nhaCungCap: "", trang: 1, coTrang: 20 }));
  dat("Danh sách mặc định chỉ hiện hóa đơn CÒN NỢ", dsCon.dong.length === 0, String(dsCon.dong.length));
  const dsTatCa = await voi(T, ketoan, (nc) => danhSachHoaDonMua(nc, { q: "", trangThai: "tat-ca", nhaCungCap: "", trang: 1, coTrang: 20 }));
  dat("Lọc tất cả thì thấy cả hóa đơn đã trả đủ và đã hủy", dsTatCa.tong === 2, String(dsTatCa.tong));
  const dsHuy = await voi(T, ketoan, (nc) => danhSachHoaDonMua(nc, { q: "", trangThai: "CANCELLED", nhaCungCap: "", trang: 1, coTrang: 20 }));
  dat("Lọc theo trạng thái hoạt động đúng", dsHuy.tong === 1 && dsHuy.dong[0].id === hdLe.id);

  // ------------------------------------------------------------------
  console.log("\n— Cách ly giữa các doanh nghiệp —");

  const tenant2 = await seedNenMong(chu, `thu-cnt2-${DAU}`, "Doanh nghiệp thử công nợ trả 2");
  const so1 = await chu.supplierBill.count({ where: { tenantId: T } });
  const so2 = await chu.supplierBill.count({ where: { tenantId: tenant2.id } });
  dat("Hóa đơn nhà cung cấp nằm đúng doanh nghiệp của nó", so1 > 0 && so2 === 0, `${so1} / ${so2}`);

  await ketLuan("Thử Công nợ phải trả");
}

main().catch((e) => {
  console.error("Bài thử gặp lỗi ngoài dự kiến:", e);
  process.exit(1);
});
