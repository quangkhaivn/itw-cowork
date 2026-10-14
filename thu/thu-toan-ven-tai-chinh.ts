import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { taoSanPham } from "../src/modules/san-pham/service";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { nhapKho, taoKho } from "../src/modules/kho/service";
import { LuocDoNhapKho, LuocDoTaoKho } from "../src/modules/kho/luoc-do";
import { chiTietDonHang, taoDonHang, taoPhieuXuat, xacNhanDon } from "../src/modules/don-hang/service";
import { LuocDoTaoDon, LuocDoTaoPhieuXuat } from "../src/modules/don-hang/luoc-do";
import { taoDuAn } from "../src/modules/du-an/service";
import { LuocDoTaoDuAn } from "../src/modules/du-an/luoc-do";
import { chiTietHoaDon, huyHoaDon, huyPhieuThu, phatHanhHoaDon, taoHoaDon, thuTien } from "../src/modules/tai-chinh/service";
import { LuocDoPhatHanh, LuocDoTaoHoaDon, LuocDoThuTien } from "../src/modules/tai-chinh/luoc-do";
import { LuocDoTaoNhaCungCap, taoNhaCungCap } from "../src/modules/nha-cung-cap/service";
import {
  chiTietDeNghi,
  chiTietDonMua,
  guiDonMua,
  huyDonMua,
  nhanHang,
  quyetDuyetDeNghi,
  suaDonMua,
  taoDeNghi,
  taoDonMua,
  xinDuyetDeNghi,
} from "../src/modules/mua-hang/service";
import { LuocDoNhanHang, LuocDoQuyetDuyetDeNghi, LuocDoSuaDonMua, LuocDoTaoDeNghi, LuocDoTaoDonMua } from "../src/modules/mua-hang/luoc-do";
import { chiTien, chiTietHoaDonMua, ghiNhanHoaDonMua, huyHoaDonMua, huyPhieuChi, taoHoaDonMua } from "../src/modules/cong-no-tra/service";
import { LuocDoChiTien, LuocDoGhiNhanHoaDonMua, LuocDoTaoHoaDonMua } from "../src/modules/cong-no-tra/luoc-do";
import { chotGiamTruBan, chotGiamTruMua, taoTraHangBan, taoTraHangMua, xacNhanTraHangBan, xacNhanTraHangMua } from "../src/modules/tra-hang/service";
import { LuocDoChotGiamTru, LuocDoTaoTraHangBan, LuocDoTaoTraHangMua, LuocDoXacNhanTraHang } from "../src/modules/tra-hang/luoc-do";
import { homNayVN } from "../src/modules/crm/chung";
import { congNgay } from "../src/modules/nhac-viec/tinh-toan";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng TOÀN VẸN tài chính và mua hàng (0.16.1) trên CSDL THẬT.
 * Luật: BUSINESS_RULES.md mục 26 (TV-TC-01 → TV-TC-10). Quyết định QĐ-82 → QĐ-85.
 *
 * Phần "đồng thời" chạy HAI giao dịch `voiTenant` độc lập (hai kết nối riêng) bằng
 * `Promise.allSettled` — đúng như hai người (hoặc một cú bấm đúp) gửi cùng lúc. Trước bản
 * sửa, cả hai cùng đọc trạng thái cũ và cùng qua kiểm tra.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const homNay = homNayVN();

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-toan-ven-tai-chinh"));
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

/** Chạy hai việc trong hai giao dịch độc lập, cùng lúc. */
async function dongThoi<A, B>(a: () => Promise<A>, b: () => Promise<B>) {
  const [ra, rb] = await Promise.allSettled([a(), b()]);
  return [ra, rb] as const;
}

function moTa(r: PromiseSettledResult<unknown>): string {
  if (r.status === "fulfilled") return "đạt";
  const e = r.reason;
  return e instanceof LoiNghiepVu ? `LoiNghiepVu(${e.ma})` : e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

function laLoiNghiepVu(r: PromiseSettledResult<unknown>, ma?: string): boolean {
  return r.status === "rejected" && r.reason instanceof LoiNghiepVu && (!ma || r.reason.ma === ma);
}

async function main() {
  console.log("=== Thử toàn vẹn tài chính và mua hàng (0.16.1) ===\n");
  const tenant = await seedNenMong(chu, `thu-tvtc-${DAU}`, "Doanh nghiệp thử toàn vẹn tài chính");
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

  const gd = await nguoi("giam-doc", "ceo");
  const ketoan = await nguoi("ke-toan", "finance");
  const ketoan2 = await nguoi("ke-toan-2", "finance");
  const tpkd = await nguoi("truong-phong-kd", "sales-manager");
  const cskh = await nguoi("cham-soc-khach", "customer-service");
  const thukho = await nguoi("thu-kho", "warehouse");
  const muahang = await nguoi("mua-hang", "purchasing");
  console.log("");

  // ------------------------------------------------------------------
  // Nền chung
  // ------------------------------------------------------------------
  const khach = await voi(T, tpkd, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Công ty Toàn Vẹn ${DAU}`, dienThoai: "0909 123 001" })));
  const khach2 = await voi(T, tpkd, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Công ty Khác ${DAU}`, dienThoai: "0909 123 002" })));
  const kho = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "kho-tv", ten: "Kho thử toàn vẹn", macDinh: true })));
  const sp = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `TV-PK-${DAU}`, ten: "Bàn phím", giaBan: "1000000", giaVon: "600000", donViTinh: "cai" })),
  );
  await voi(T, thukho, (nc) => nhapKho(nc, LuocDoNhapKho.parse({ khoId: kho.id, lyDo: "Nhập đầu kỳ bài thử", dong: [{ sanPhamId: sp.id, soLuong: "200", giaVon: "600000" }] })));

  /** Đơn bán đã xác nhận, số lượng sl × 1.000.000 + VAT 10%. */
  const donDaXacNhan = async (khachId: string, sl: number) => {
    const don = await voi(T, tpkd, (nc) =>
      taoDonHang(nc, LuocDoTaoDon.parse({ khachHangId: khachId, dong: [{ sanPhamId: sp.id, ten: "Bàn phím", soLuong: String(sl), donGia: "1000000", vat: 10, giaVon: "600000" }] })),
    );
    await voi(T, tpkd, (nc) => xacNhanDon(nc, don.id, { khoId: kho.id, ghiChu: null }));
    return don;
  };
  /** Hóa đơn đã phát hành cho một đơn mới. */
  const hoaDonDaPhatHanh = async (sl: number) => {
    const don = await donDaXacNhan(khach.id, sl);
    const hd = await voi(T, ketoan, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id })));
    await voi(T, ketoan, (nc) => phatHanhHoaDon(nc, hd.id, LuocDoPhatHanh.parse({ hanThanhToan: congNgay(homNay, 30) })));
    return { don, hd, tong: sl * 1_100_000 };
  };
  const tongPhanBoHieuLuc = async (invoiceId: string) => {
    const ds = await chu.paymentAllocation.findMany({ where: { invoiceId, payment: { status: "hoat-dong" } }, select: { amount: true } });
    return ds.reduce((s, a) => s + Number(a.amount), 0);
  };
  const thu = (hoaDonId: string, soTien: number, nguoiThu = ketoan) =>
    voi(T, nguoiThu, (nc) =>
      thuTien(nc, LuocDoThuTien.parse({ khachHangId: khach.id, phuongThuc: "chuyen-khoan", soTien: String(soTien), phanBo: [{ hoaDonId, soTien: String(soTien) }] })),
    );

  // ------------------------------------------------------------------
  console.log("— TV-TC-01: hai phiếu thu cùng lúc cho một hóa đơn —");
  {
    const { hd, tong } = await hoaDonDaPhatHanh(2);
    const [a, b] = await dongThoi(() => thu(hd.id, tong, ketoan), () => thu(hd.id, tong, ketoan2));
    const soDat = [a, b].filter((r) => r.status === "fulfilled").length;
    dat("Thu đủ tiền cùng lúc hai lần: đúng MỘT phiếu được ghi", soDat === 1, `${moTa(a)} / ${moTa(b)}`);
    dat("Phiếu còn lại bị chặn vì thu vượt công nợ", laLoiNghiepVu(a, "thu-vuot-cong-no") || laLoiNghiepVu(b, "thu-vuot-cong-no"), `${moTa(a)} / ${moTa(b)}`);
    const daThu = await tongPhanBoHieuLuc(hd.id);
    dat("Tổng đã thu = đúng tổng hóa đơn (không thu vượt)", daThu === tong, `${daThu} / ${tong}`);
    const ct = await voi(T, ketoan, (nc) => chiTietHoaDon(nc, hd.id));
    dat("Công nợ tính lúc đọc về 0, không âm", ct.hoaDon.conNo === 0 && ct.hoaDon.tinhTrangThu === "da-thu-du", JSON.stringify({ conNo: ct.hoaDon.conNo }));
  }
  {
    // Bấm đúp: hai yêu cầu thu một phần, cộng lại vượt nợ.
    const { hd, tong } = await hoaDonDaPhatHanh(2);
    const phan = Math.round(tong * 0.6);
    const [a, b] = await dongThoi(() => thu(hd.id, phan), () => thu(hd.id, phan));
    dat("Bấm đúp thu 60% hai lần: chỉ một lần ghi", [a, b].filter((r) => r.status === "fulfilled").length === 1, `${moTa(a)} / ${moTa(b)}`);
    dat("Đã thu = 60%, không phải 120%", (await tongPhanBoHieuLuc(hd.id)) === phan);
  }
  {
    const { hd, tong } = await hoaDonDaPhatHanh(1);
    await nemLoi("Một hóa đơn lặp hai lần trong cùng phiếu thu bị chặn (không lách qua kiểm từng dòng)", "dinh-dang", () =>
      voi(T, ketoan, (nc) =>
        thuTien(nc, LuocDoThuTien.parse({
          khachHangId: khach.id, phuongThuc: "tien-mat", soTien: String(tong),
          phanBo: [{ hoaDonId: hd.id, soTien: String(tong / 2) }, { hoaDonId: hd.id, soTien: String(tong / 2) }],
        })),
      ),
    );
  }

  // ------------------------------------------------------------------
  console.log("\n— TV-TC-02: hủy hóa đơn chạy đua với thu tiền; hủy phiếu thu hai lần —");
  {
    const { hd, tong } = await hoaDonDaPhatHanh(3);
    const [a, b] = await dongThoi(
      () => voi(T, ketoan, (nc) => huyHoaDon(nc, hd.id, "Lập nhầm")),
      () => thu(hd.id, tong, ketoan2),
    );
    dat("Hủy hóa đơn và thu tiền cùng lúc: đúng một việc thành công", [a, b].filter((r) => r.status === "fulfilled").length === 1, `${moTa(a)} / ${moTa(b)}`);
    const sau = await chu.invoice.findUniqueOrThrow({ where: { id: hd.id }, select: { status: true } });
    const daThu = await tongPhanBoHieuLuc(hd.id);
    dat(
      "Không có tiền thu treo trên hóa đơn đã hủy",
      (sau.status === "CANCELLED" && daThu === 0) || (sau.status === "ISSUED" && daThu === tong),
      JSON.stringify({ trangThai: sau.status, daThu }),
    );
  }
  {
    const { hd, tong } = await hoaDonDaPhatHanh(1);
    const pt = await thu(hd.id, tong);
    const [a, b] = await dongThoi(
      () => voi(T, ketoan, (nc) => huyPhieuThu(nc, pt.id, "Séc bị trả")),
      () => voi(T, ketoan2, (nc) => huyPhieuThu(nc, pt.id, "Ghi nhầm")),
    );
    dat("Hủy một phiếu thu hai lần cùng lúc: một lần ghi, lần kia báo đã hủy", [a, b].filter((r) => r.status === "fulfilled").length === 1 && (laLoiNghiepVu(a, "da-huy") || laLoiNghiepVu(b, "da-huy")), `${moTa(a)} / ${moTa(b)}`);
    const suKien = await chu.businessEvent.count({ where: { tenantId: T, eventType: "PAYMENT_CANCELLED", objectId: pt.id } });
    dat("Chỉ một sự kiện PAYMENT_CANCELLED", suKien === 1, String(suKien));
    dat("Hủy xong công nợ quay lại đủ", (await voi(T, ketoan, (nc) => chiTietHoaDon(nc, hd.id))).hoaDon.conNo === tong);
  }

  // ------------------------------------------------------------------
  console.log("\n— TV-TC-03: không hủy hóa đơn đã có giảm trừ trả hàng (chiều bán) —");
  {
    const don = await donDaXacNhan(khach.id, 5);
    const ctDon = await voi(T, tpkd, (nc) => chiTietDonHang(nc, don.id));
    const dongDon = ctDon.don.dong[0];
    await voi(T, thukho, (nc) => taoPhieuXuat(nc, don.id, LuocDoTaoPhieuXuat.parse({ khoId: kho.id, dong: [{ dongDonId: dongDon.id, soLuong: "5" }] })));
    const hd = await voi(T, ketoan, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id })));
    await voi(T, ketoan, (nc) => phatHanhHoaDon(nc, hd.id, LuocDoPhatHanh.parse({ hanThanhToan: congNgay(homNay, 30) })));
    const p = await voi(T, cskh, (nc) =>
      taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
        khachHangId: khach.id, donHangId: don.id, khoId: kho.id, lyDo: "Khách trả 1 cái dư",
        dong: [{ dongDonId: dongDon.id, sanPhamId: sp.id, ten: "Bàn phím", soLuong: "1", donGia: "1000000", vat: 10 }],
      })),
    );
    await voi(T, thukho, (nc) => xacNhanTraHangBan(nc, p.id, LuocDoXacNhanTraHang.parse({})));
    await voi(T, ketoan, (nc) => chotGiamTruBan(nc, p.id, LuocDoChotGiamTru.parse({ phanBo: [{ hoaDonId: hd.id, soTien: "1100000" }] })));

    const ct = await voi(T, ketoan, (nc) => chiTietHoaDon(nc, hd.id));
    dat("Màn hình không mở nút hủy khi đã có giảm trừ", ct.quyen.huy === false && ct.hoaDon.daGiamTru === 1_100_000, JSON.stringify(ct.quyen));
    await nemLoi("Hủy hóa đơn đã có giảm trừ trả hàng bị chặn, nêu rõ phiếu trả", "nghiep-vu", () => voi(T, ketoan, (nc) => huyHoaDon(nc, hd.id, "Thử hủy")), "da-co-giam-tru");
    try {
      await voi(T, ketoan, (nc) => huyHoaDon(nc, hd.id, "Thử hủy"));
    } catch (e) {
      dat("Thông báo nêu số phiếu trả hàng", e instanceof LoiNghiepVu && e.message.includes(p.so), e instanceof Error ? e.message : "");
    }
    const sau = await chu.invoice.findUniqueOrThrow({ where: { id: hd.id }, select: { status: true } });
    dat("Hóa đơn vẫn còn hiệu lực", sau.status === "ISSUED");
  }

  // ------------------------------------------------------------------
  console.log("\n— TV-TC-04: hai lần lập hóa đơn từ một đơn cùng lúc —");
  {
    const don = await donDaXacNhan(khach.id, 1);
    const [a, b] = await dongThoi(
      () => voi(T, ketoan, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id }))),
      () => voi(T, ketoan2, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id }))),
    );
    const ok = a.status === "fulfilled" && b.status === "fulfilled";
    dat("Cả hai yêu cầu trả về bình thường (không lỗi 500)", ok, `${moTa(a)} / ${moTa(b)}`);
    if (ok) {
      dat("Cùng một hóa đơn, đúng một lần là daCoTruoc", a.value.id === b.value.id && [a.value.daCoTruoc, b.value.daCoTruoc].filter(Boolean).length === 1, JSON.stringify([a.value, b.value]));
    }
    const soHd = await chu.invoice.count({ where: { salesOrderId: don.id, status: { not: "CANCELLED" } } });
    dat("CSDL chỉ có một hóa đơn còn hiệu lực cho đơn", soHd === 1, String(soHd));

    const hdGoc = await chu.invoice.findFirstOrThrow({ where: { salesOrderId: don.id }, select: { id: true, ownerId: true, customerId: true } });
    let biChan = false;
    try {
      await chu.invoice.create({
        data: { tenantId: T, number: `HD-TRUNG-${DAU}`, customerId: hdGoc.customerId, salesOrderId: don.id, ownerId: hdGoc.ownerId },
      });
    } catch {
      biChan = true;
    }
    dat("Chỉ mục riêng phần chặn hóa đơn thứ hai còn hiệu lực ngay ở CSDL", biChan);
    await voi(T, ketoan, (nc) => huyHoaDon(nc, hdGoc.id, "Lập lại"));
    const moi = await voi(T, ketoan, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id })));
    dat("Hủy rồi lập lại vẫn được (hóa đơn đã hủy không tính)", moi.daCoTruoc === false && moi.id !== hdGoc.id);
  }

  // ------------------------------------------------------------------
  console.log("\n— TV-TC-05: dự án và đơn trên hóa đơn phải cùng khách —");
  {
    const don = await donDaXacNhan(khach.id, 1);
    const donKhac = await donDaXacNhan(khach.id, 1);
    const duAnKhach2 = await voi(T, gd, (nc) => taoDuAn(nc, LuocDoTaoDuAn.parse({ khachHangId: khach2.id, ten: "Dự án của khách khác" })));
    const duAnDonKhac = await voi(T, gd, (nc) => taoDuAn(nc, LuocDoTaoDuAn.parse({ khachHangId: khach.id, donHangId: donKhac.id, ten: "Dự án theo đơn khác" })));
    const duAnDung = await voi(T, gd, (nc) => taoDuAn(nc, LuocDoTaoDuAn.parse({ khachHangId: khach.id, donHangId: don.id, ten: "Dự án đúng đơn" })));

    await nemLoi("Hóa đơn từ đơn gắn dự án của khách khác bị chặn", "dinh-dang", () =>
      voi(T, ketoan, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id, duAnId: duAnKhach2.id }))),
    );
    await nemLoi("Hóa đơn lập tay gắn dự án của khách khác bị chặn", "dinh-dang", () =>
      voi(T, ketoan, (nc) =>
        taoHoaDon(nc, LuocDoTaoHoaDon.parse({ khachHangId: khach.id, duAnId: duAnKhach2.id, dong: [{ ten: "Công lắp đặt", soLuong: "1", donGia: "500000" }] })),
      ),
    );
    await nemLoi("Dự án gắn một đơn khác thì không gắn vào hóa đơn của đơn này", "dinh-dang", () =>
      voi(T, ketoan, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id, duAnId: duAnDonKhac.id }))),
    );
    await nemLoi("Chọn khách khác với khách của đơn bị chặn (không lặng lẽ đổi khách)", "dinh-dang", () =>
      voi(T, ketoan, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id, khachHangId: khach2.id }))),
    );
    const dung = await voi(T, ketoan, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id, duAnId: duAnDung.id })));
    const ct = await voi(T, ketoan, (nc) => chiTietHoaDon(nc, dung.id));
    dat("Dự án đúng khách, đúng đơn thì gắn được", ct.hoaDon.duAn?.id === duAnDung.id);
  }

  // ------------------------------------------------------------------
  // Chiều mua
  // ------------------------------------------------------------------
  const ncc = await voi(T, muahang, (nc) => taoNhaCungCap(nc, LuocDoTaoNhaCungCap.parse({ ten: `Nguồn Hàng ${DAU}`, dienThoai: "0909 123 101" })));
  const ncc2 = await voi(T, muahang, (nc) => taoNhaCungCap(nc, LuocDoTaoNhaCungCap.parse({ ten: `Nguồn Khác ${DAU}`, dienThoai: "0909 123 102" })));

  const donMuaDaGui = async (sl: number, nhaCungCapId = ncc.id) => {
    const dm = await voi(T, muahang, (nc) =>
      taoDonMua(nc, LuocDoTaoDonMua.parse({ nhaCungCapId, khoId: kho.id, dong: [{ sanPhamId: sp.id, ten: "Bàn phím", soLuong: String(sl), donGia: "600000", vat: 10 }] })),
    );
    await voi(T, muahang, (nc) => guiDonMua(nc, dm.id));
    return dm;
  };
  const hoaDonMuaDaGhiNhan = async (sl: number) => {
    const dm = await donMuaDaGui(sl);
    const hd = await voi(T, ketoan, (nc) => taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({ donMuaId: dm.id })));
    await voi(T, ketoan, (nc) => ghiNhanHoaDonMua(nc, hd.id, LuocDoGhiNhanHoaDonMua.parse({ ngayHoaDon: homNay, hanThanhToan: congNgay(homNay, 30) })));
    return { dm, hd, tong: sl * 660_000 };
  };
  const chi = (hoaDonId: string, soTien: number, nguoiChi = ketoan) =>
    voi(T, nguoiChi, (nc) =>
      chiTien(nc, LuocDoChiTien.parse({ nhaCungCapId: ncc.id, phuongThuc: "chuyen-khoan", soTien: String(soTien), phanBo: [{ hoaDonId, soTien: String(soTien) }] })),
    );
  const tongChiHieuLuc = async (billId: string) => {
    const ds = await chu.supplierPaymentAllocation.findMany({ where: { billId, payment: { status: "hoat-dong" } }, select: { amount: true } });
    return ds.reduce((s, a) => s + Number(a.amount), 0);
  };

  console.log("\n— TV-TC-01 (chiều mua): hai phiếu chi cùng lúc cho một hóa đơn —");
  {
    const { hd, tong } = await hoaDonMuaDaGhiNhan(3);
    const [a, b] = await dongThoi(() => chi(hd.id, tong, ketoan), () => chi(hd.id, tong, ketoan2));
    dat("Chi đủ tiền cùng lúc hai lần: đúng MỘT phiếu chi", [a, b].filter((r) => r.status === "fulfilled").length === 1, `${moTa(a)} / ${moTa(b)}`);
    dat("Phiếu còn lại bị chặn vì chi vượt", laLoiNghiepVu(a, "chi-vuot-cong-no") || laLoiNghiepVu(b, "chi-vuot-cong-no"));
    dat("Tổng đã chi = đúng tổng hóa đơn", (await tongChiHieuLuc(hd.id)) === tong);
  }
  {
    const { hd, tong } = await hoaDonMuaDaGhiNhan(1);
    await nemLoi("Một hóa đơn lặp hai lần trong cùng phiếu chi bị chặn", "dinh-dang", () =>
      voi(T, ketoan, (nc) =>
        chiTien(nc, LuocDoChiTien.parse({
          nhaCungCapId: ncc.id, phuongThuc: "tien-mat", soTien: String(tong),
          phanBo: [{ hoaDonId: hd.id, soTien: String(tong / 2) }, { hoaDonId: hd.id, soTien: String(tong / 2) }],
        })),
      ),
    );
  }

  console.log("\n— TV-TC-02 / TV-TC-07 (chiều mua): hủy hóa đơn chạy đua với chi tiền; sự kiện hủy —");
  {
    const { hd, tong } = await hoaDonMuaDaGhiNhan(2);
    const [a, b] = await dongThoi(() => voi(T, ketoan, (nc) => huyHoaDonMua(nc, hd.id, "Nhập nhầm")), () => chi(hd.id, tong, ketoan2));
    dat("Hủy hóa đơn NCC và chi tiền cùng lúc: đúng một việc thành công", [a, b].filter((r) => r.status === "fulfilled").length === 1, `${moTa(a)} / ${moTa(b)}`);
    const sau = await chu.supplierBill.findUniqueOrThrow({ where: { id: hd.id }, select: { status: true } });
    const daChi = await tongChiHieuLuc(hd.id);
    dat("Không có tiền chi treo trên hóa đơn NCC đã hủy", (sau.status === "CANCELLED" && daChi === 0) || (sau.status === "RECORDED" && daChi === tong), JSON.stringify({ trangThai: sau.status, daChi }));
  }
  {
    const { hd, tong } = await hoaDonMuaDaGhiNhan(1);
    const pc = await chi(hd.id, tong);
    await voi(T, ketoan, (nc) => huyPhieuChi(nc, pc.id, "Chuyển nhầm tài khoản"));
    dat("Hủy phiếu chi ghi sự kiện SUPPLIER_PAYMENT_CANCELLED", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "SUPPLIER_PAYMENT_CANCELLED", objectId: pc.id } })) === 1);
    await voi(T, ketoan, (nc) => huyHoaDonMua(nc, hd.id, "Nhà cung cấp xuất lại hóa đơn"));
    const sk = await chu.businessEvent.findFirst({ where: { tenantId: T, eventType: "SUPPLIER_BILL_CANCELLED", objectId: hd.id }, select: { payload: true } });
    dat("Hủy hóa đơn NCC ghi sự kiện SUPPLIER_BILL_CANCELLED kèm lý do", !!sk && (sk.payload as { lyDo?: string }).lyDo === "Nhà cung cấp xuất lại hóa đơn", JSON.stringify(sk));
    dat("Hủy hóa đơn NCC vẫn ghi nhật ký kiểm toán", (await chu.auditLog.count({ where: { tenantId: T, objectType: "supplier_bill", objectId: hd.id, action: "sua" } })) >= 2);
  }

  console.log("\n— TV-TC-03 (chiều mua): không hủy hóa đơn NCC đã có giảm trừ trả hàng —");
  {
    const dm = await donMuaDaGui(5);
    const ctDm = await voi(T, muahang, (nc) => chiTietDonMua(nc, dm.id));
    await voi(T, thukho, (nc) => nhanHang(nc, dm.id, LuocDoNhanHang.parse({ dong: [{ dongDonId: ctDm.donMua.dong[0].id, soLuong: "5", giaVon: "600000" }] })));
    const hd = await voi(T, ketoan, (nc) => taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({ donMuaId: dm.id })));
    await voi(T, ketoan, (nc) => ghiNhanHoaDonMua(nc, hd.id, LuocDoGhiNhanHoaDonMua.parse({ ngayHoaDon: homNay, hanThanhToan: congNgay(homNay, 30) })));
    const pm = await voi(T, muahang, (nc) =>
      taoTraHangMua(nc, LuocDoTaoTraHangMua.parse({
        nhaCungCapId: ncc.id, donMuaId: dm.id, khoId: kho.id, lyDo: "1 cái lỗi phím",
        dong: [{ dongDonId: ctDm.donMua.dong[0].id, sanPhamId: sp.id, ten: "Bàn phím", soLuong: "1", donGia: "600000", vat: 10 }],
      })),
    );
    await voi(T, thukho, (nc) => xacNhanTraHangMua(nc, pm.id, LuocDoXacNhanTraHang.parse({})));
    await voi(T, ketoan, (nc) => chotGiamTruMua(nc, pm.id, LuocDoChotGiamTru.parse({ phanBo: [{ hoaDonId: hd.id, soTien: "660000" }] })));
    const ct = await voi(T, ketoan, (nc) => chiTietHoaDonMua(nc, hd.id));
    dat("Màn hình không mở nút hủy hóa đơn NCC khi đã có giảm trừ", ct.quyen.huy === false, JSON.stringify(ct.quyen));
    await nemLoi("Hủy hóa đơn NCC đã có giảm trừ bị chặn", "nghiep-vu", () => voi(T, ketoan, (nc) => huyHoaDonMua(nc, hd.id, "Thử hủy")), "da-co-giam-tru");

    console.log("\n— TV-TC-10: không hủy đơn mua còn hóa đơn NCC —");
    const dm2 = await donMuaDaGui(1);
    const hd2 = await voi(T, ketoan, (nc) => taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({ donMuaId: dm2.id })));
    await nemLoi("Hủy đơn mua đang có hóa đơn NCC còn hiệu lực bị chặn", "nghiep-vu", () => voi(T, muahang, (nc) => huyDonMua(nc, dm2.id, "Đổi nhà cung cấp")), "da-co-hoa-don-ncc");
    await voi(T, ketoan, (nc) => huyHoaDonMua(nc, hd2.id, "Đơn mua sẽ hủy"));
    const huy = await voi(T, muahang, (nc) => huyDonMua(nc, dm2.id, "Đổi nhà cung cấp"));
    dat("Hủy hóa đơn NCC trước thì hủy được đơn mua", huy.trangThai === "CANCELLED");
  }

  console.log("\n— TV-TC-04 (chiều mua): hai lần ghi hóa đơn từ một đơn mua cùng lúc —");
  {
    const dm = await donMuaDaGui(1);
    const [a, b] = await dongThoi(
      () => voi(T, ketoan, (nc) => taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({ donMuaId: dm.id }))),
      () => voi(T, ketoan2, (nc) => taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({ donMuaId: dm.id }))),
    );
    const ok = a.status === "fulfilled" && b.status === "fulfilled";
    dat("Cả hai yêu cầu trả về bình thường", ok, `${moTa(a)} / ${moTa(b)}`);
    if (ok) dat("Cùng một hóa đơn NCC, đúng một lần daCoTruoc", a.value.id === b.value.id && [a.value.daCoTruoc, b.value.daCoTruoc].filter(Boolean).length === 1);
    const soHd = await chu.supplierBill.count({ where: { purchaseOrderId: dm.id, status: { not: "CANCELLED" } } });
    dat("CSDL chỉ có một hóa đơn NCC còn hiệu lực cho đơn mua", soHd === 1, String(soHd));
    const goc = await chu.supplierBill.findFirstOrThrow({ where: { purchaseOrderId: dm.id }, select: { supplierId: true, ownerId: true } });
    let biChan = false;
    try {
      await chu.supplierBill.create({ data: { tenantId: T, number: `HM-TRUNG-${DAU}`, supplierId: goc.supplierId, purchaseOrderId: dm.id, ownerId: goc.ownerId } });
    } catch {
      biChan = true;
    }
    dat("Chỉ mục riêng phần chặn hóa đơn NCC thứ hai ngay ở CSDL", biChan);
    await nemLoi("Chọn nhà cung cấp khác với nhà cung cấp của đơn mua bị chặn", "dinh-dang", () =>
      voi(T, ketoan, (nc) => taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({ donMuaId: dm.id, nhaCungCapId: ncc2.id }))),
    );
  }

  // ------------------------------------------------------------------
  console.log("\n— TV-TC-08 / TV-TC-09: đề nghị mua ↔ đơn mua —");
  const deNghiDaDuyet = async () => {
    const dn = await voi(T, muahang, (nc) => taoDeNghi(nc, LuocDoTaoDeNghi.parse({ lyDo: "Bổ sung tồn", dong: [{ sanPhamId: sp.id, ten: "Bàn phím", soLuong: "4", giaDuKien: "600000" }] })));
    await voi(T, muahang, (nc) => xinDuyetDeNghi(nc, dn.id));
    await voi(T, ketoan, (nc) => quyetDuyetDeNghi(nc, dn.id, LuocDoQuyetDuyetDeNghi.parse({ quyetDinh: "cho-duyet" })));
    const ct = await voi(T, muahang, (nc) => chiTietDeNghi(nc, dn.id));
    return { id: dn.id, so: dn.so, dongId: ct.deNghi.dong[0].id };
  };
  const donTuDeNghi = (dn: { id: string; dongId: string }, dongId = dn.dongId) => (nc: NguCanh) =>
    taoDonMua(nc, LuocDoTaoDonMua.parse({
      nhaCungCapId: ncc.id, khoId: kho.id, deNghiId: dn.id,
      dong: [{ sanPhamId: sp.id, ten: "Bàn phím", soLuong: "4", donGia: "600000", vat: 10, deNghiDongId: dongId }],
    }));
  {
    const dn = await deNghiDaDuyet();
    const dnKhac = await deNghiDaDuyet();

    await nemLoi("Dòng đơn mua trỏ tới dòng của đề nghị KHÁC bị chặn", "dinh-dang", () => voi(T, muahang, donTuDeNghi(dn, dnKhac.dongId)));
    await nemLoi("Dòng đơn mua trỏ tới dòng đề nghị khi đơn không lập từ đề nghị nào bị chặn", "dinh-dang", () =>
      voi(T, muahang, (nc) =>
        taoDonMua(nc, LuocDoTaoDonMua.parse({ nhaCungCapId: ncc.id, khoId: kho.id, dong: [{ sanPhamId: sp.id, ten: "Bàn phím", soLuong: "1", donGia: "600000", deNghiDongId: dn.dongId }] })),
      ),
    );
    dat("Lỗi kiểm dòng không đổi trạng thái đề nghị", (await chu.purchaseRequest.findUniqueOrThrow({ where: { id: dn.id } })).status === "APPROVED");

    const [a, b] = await dongThoi(() => voi(T, muahang, donTuDeNghi(dn)), () => voi(T, gd, donTuDeNghi(dn)));
    dat("Hai người cùng lập đơn mua từ một đề nghị: đúng một đơn", [a, b].filter((r) => r.status === "fulfilled").length === 1 && (laLoiNghiepVu(a, "de-nghi-chua-duyet") || laLoiNghiepVu(b, "de-nghi-chua-duyet")), `${moTa(a)} / ${moTa(b)}`);
    dat("CSDL chỉ có một đơn mua từ đề nghị", (await chu.purchaseOrder.count({ where: { requestId: dn.id } })) === 1);
    const dm = (a.status === "fulfilled" ? a.value : (b as PromiseFulfilledResult<{ id: string; so: string }>).value);
    dat("Đề nghị chuyển sang Đã đặt hàng", (await chu.purchaseRequest.findUniqueOrThrow({ where: { id: dn.id } })).status === "ORDERED");

    await nemLoi("Sửa đơn mua trỏ dòng sang đề nghị khác bị chặn", "dinh-dang", () =>
      voi(T, muahang, (nc) =>
        suaDonMua(nc, dm.id, LuocDoSuaDonMua.parse({ dong: [{ sanPhamId: sp.id, ten: "Bàn phím", soLuong: "4", donGia: "600000", deNghiDongId: dnKhac.dongId }] })),
      ),
    );

    const huy = await voi(T, muahang, (nc) => huyDonMua(nc, dm.id, "Nhà cung cấp hết hàng"));
    dat("Hủy đơn mua trả đề nghị gốc về Đã duyệt", huy.deNghiMoLai === dn.so && (await chu.purchaseRequest.findUniqueOrThrow({ where: { id: dn.id } })).status === "APPROVED", JSON.stringify(huy));
    const ctDn = await voi(T, muahang, (nc) => chiTietDeNghi(nc, dn.id));
    dat("Đề nghị mở lại nút lập đơn mua", ctDn.quyen.taoDonMua === true);
    dat("Việc trả đề nghị về Đã duyệt có nhật ký kiểm toán", (await chu.auditLog.count({ where: { tenantId: T, objectType: "purchase_request", objectId: dn.id } })) >= 4);
    const dm2 = await voi(T, muahang, donTuDeNghi(dn));
    dat("Đặt lại được đơn mua mới từ đề nghị cũ", !!dm2.id && (await chu.purchaseRequest.findUniqueOrThrow({ where: { id: dn.id } })).status === "ORDERED");

    // Nhận hàng hai lần cùng lúc cho toàn bộ số lượng.
    await voi(T, muahang, (nc) => guiDonMua(nc, dm2.id));
    const ct2 = await voi(T, muahang, (nc) => chiTietDonMua(nc, dm2.id));
    const nhan = (u: string) => voi(T, u, (nc) => nhanHang(nc, dm2.id, LuocDoNhanHang.parse({ dong: [{ dongDonId: ct2.donMua.dong[0].id, soLuong: "4", giaVon: "600000" }] })));
    const [n1, n2] = await dongThoi(() => nhan(thukho), () => nhan(gd));
    dat("Nhận đủ hàng hai lần cùng lúc: đúng một phiếu nhận", [n1, n2].filter((r) => r.status === "fulfilled").length === 1, `${moTa(n1)} / ${moTa(n2)}`);
    dat("Lần kia bị chặn bằng lỗi nghiệp vụ, không phải lỗi CHECK của CSDL", laLoiNghiepVu(n1) || laLoiNghiepVu(n2), `${moTa(n1)} / ${moTa(n2)}`);
    dat("Số phiếu nhận của đơn = 1", (await chu.goodsReceipt.count({ where: { purchaseOrderId: dm2.id } })) === 1);

    // Duyệt hai lần cùng lúc.
    const dn3 = await voi(T, muahang, (nc) => taoDeNghi(nc, LuocDoTaoDeNghi.parse({ dong: [{ ten: "Chuột", soLuong: "1" }] })));
    await voi(T, muahang, (nc) => xinDuyetDeNghi(nc, dn3.id));
    const [d1, d2] = await dongThoi(
      () => voi(T, ketoan, (nc) => quyetDuyetDeNghi(nc, dn3.id, LuocDoQuyetDuyetDeNghi.parse({ quyetDinh: "cho-duyet" }))),
      () => voi(T, gd, (nc) => quyetDuyetDeNghi(nc, dn3.id, LuocDoQuyetDuyetDeNghi.parse({ quyetDinh: "tu-choi", ghiChu: "Không cần" }))),
    );
    dat("Duyệt và từ chối cùng lúc: đúng một quyết định được ghi", [d1, d2].filter((r) => r.status === "fulfilled").length === 1, `${moTa(d1)} / ${moTa(d2)}`);
    const soSk = await chu.businessEvent.count({ where: { tenantId: T, objectId: dn3.id, eventType: { in: ["PURCHASE_REQUEST_APPROVED", "PURCHASE_REQUEST_REJECTED"] } } });
    dat("Chỉ một sự kiện quyết định", soSk === 1, String(soSk));
  }

  await chu.$disconnect();
  ketLuan("Thử toàn vẹn tài chính và mua hàng");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
