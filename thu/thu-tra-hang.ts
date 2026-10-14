import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { namVN } from "../src/lib/so-chung-tu";
import { taoSanPham } from "../src/modules/san-pham/service";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { LuocDoTaoNhaCungCap, taoNhaCungCap } from "../src/modules/nha-cung-cap/service";
import { dieuChinhTon, doiSoatKho, nhapKho, taoKho, tonKho } from "../src/modules/kho/service";
import { LuocDoDieuChinh, LuocDoNhapKho, LuocDoTaoKho } from "../src/modules/kho/luoc-do";
import { chiTietDonHang, taoDonHang, taoPhieuXuat, xacNhanDon } from "../src/modules/don-hang/service";
import { LuocDoTaoDon, LuocDoTaoPhieuXuat, LuocDoXacNhanDon } from "../src/modules/don-hang/luoc-do";
import { chiTietHoaDon, phatHanhHoaDon, taoHoaDon } from "../src/modules/tai-chinh/service";
import { LuocDoPhatHanh, LuocDoTaoHoaDon } from "../src/modules/tai-chinh/luoc-do";
import { chiTietDonMua, guiDonMua, nhanHang, taoDonMua, xacNhanDonMua } from "../src/modules/mua-hang/service";
import { LuocDoNhanHang, LuocDoTaoDonMua } from "../src/modules/mua-hang/luoc-do";
import { chiTietHoaDonMua, ghiNhanHoaDonMua, taoHoaDonMua } from "../src/modules/cong-no-tra/service";
import { LuocDoGhiNhanHoaDonMua, LuocDoTaoHoaDonMua } from "../src/modules/cong-no-tra/luoc-do";
import {
  chiTietTraHangBan,
  chiTietTraHangMua,
  chotGiamTruBan,
  chotGiamTruMua,
  danhSachTraHangBan,
  danhSachTraHangMua,
  goiYTraTheoDon,
  goiYTraTheoDonMua,
  huyTraHangBan,
  taoTraHangBan,
  taoTraHangMua,
  xacNhanTraHangBan,
  xacNhanTraHangMua,
} from "../src/modules/tra-hang/service";
import {
  LuocDoChotGiamTru,
  LuocDoHuyTraHang,
  LuocDoTaoTraHangBan,
  LuocDoTaoTraHangMua,
  LuocDoXacNhanTraHang,
} from "../src/modules/tra-hang/luoc-do";
import { homNayVN } from "../src/modules/crm/chung";
import { congNgay } from "../src/modules/nhac-viec/tinh-toan";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng trả hàng và đổi máy trên CSDL THẬT.
 * Luật: BUSINESS_RULES.md mục 18 (TH-01 → TH-10).
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
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-tra-hang"));
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

async function tonCua(tenantId: string, userId: string, sanPhamId: string): Promise<number> {
  const kq = await voi(tenantId, userId, (nc) =>
    tonKho(nc, { q: "", kho: "", canhBao: "", trang: 1, coTrang: 100 }),
  );
  return kq.dong.find((d) => d.sanPham.id === sanPhamId)?.tonKho ?? 0;
}

async function main() {
  console.log("=== Thử Trả hàng và đổi máy ===\n");
  const tenant = await seedNenMong(chu, `thu-th-${DAU}`, "Doanh nghiệp thử trả hàng");
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
  const tpkd = await nguoi("truong-phong-kd", "sales-manager");
  const cskh = await nguoi("cham-soc-khach", "customer-service");
  const thukho = await nguoi("thu-kho", "warehouse");
  const muahang = await nguoi("mua-hang", "purchasing");
  const thuctap = await nguoi("thuc-tap-marketing", "marketing-intern");
  console.log("");

  // ------------------------------------------------------------------
  // Nền: khách, kho, hai sản phẩm, tồn kho, một đơn đã giao và một hóa đơn đã phát hành.
  // ------------------------------------------------------------------
  const khach = await voi(T, tpkd, (nc) =>
    taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Công ty Mua Sắm ${DAU}`, dienThoai: "0909 111 222" })),
  );
  const khach2 = await voi(T, tpkd, (nc) =>
    taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Công ty Khác ${DAU}`, dienThoai: "0909 111 333" })),
  );
  const kho = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "kho-th", ten: "Kho thử trả hàng", macDinh: true })));

  const spMay = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({
      sku: `TH-MAY-${DAU}`, ten: "Laptop văn phòng", giaBan: "20000000", giaVon: "16000000",
      donViTinh: "cai", batBuocSerial: true, baoHanhThang: 12,
    })),
  );
  const spPhuKien = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({
      sku: `TH-PK-${DAU}`, ten: "Chuột không dây", giaBan: "2000000", giaVon: "1200000", donViTinh: "cai",
    })),
  );

  const SR = { a: `SRA-${DAU}`, b: `SRB-${DAU}`, c: `SRC-${DAU}` };
  await voi(T, thukho, (nc) =>
    nhapKho(nc, LuocDoNhapKho.parse({
      khoId: kho.id,
      lyDo: "Nhập đầu kỳ cho bài thử",
      dong: [
        { sanPhamId: spMay.id, soLuong: "3", giaVon: "16000000", serial: [SR.a, SR.b, SR.c] },
        { sanPhamId: spPhuKien.id, soLuong: "20", giaVon: "1200000" },
      ],
    })),
  );
  dat("Nền: tồn đầu kỳ 3 máy + 20 phụ kiện", (await tonCua(T, gd, spMay.id)) === 3 && (await tonCua(T, gd, spPhuKien.id)) === 20);

  const don = await voi(T, tpkd, (nc) =>
    taoDonHang(nc, LuocDoTaoDon.parse({
      khachHangId: khach.id,
      dong: [
        { sanPhamId: spMay.id, ten: "Laptop văn phòng", soLuong: "1", donGia: "20000000", vat: 10, giaVon: "16000000" },
        { sanPhamId: spPhuKien.id, ten: "Chuột không dây", soLuong: "5", donGia: "2000000", vat: 10, giaVon: "1200000" },
      ],
    })),
  );
  await voi(T, tpkd, (nc) => xacNhanDon(nc, don.id, { khoId: LuocDoXacNhanDon.parse({ khoId: kho.id }).khoId, ghiChu: null }));
  const ctDon = await voi(T, tpkd, (nc) => chiTietDonHang(nc, don.id));
  const dongMay = ctDon.don.dong.find((d) => d.sanPhamId === spMay.id)!;
  const dongPk = ctDon.don.dong.find((d) => d.sanPhamId === spPhuKien.id)!;

  await voi(T, thukho, (nc) =>
    taoPhieuXuat(nc, don.id, LuocDoTaoPhieuXuat.parse({
      khoId: kho.id,
      dong: [
        { dongDonId: dongMay.id, soLuong: "1", serial: [SR.a] },
        { dongDonId: dongPk.id, soLuong: "5" },
      ],
    })),
  );
  dat("Nền: giao xong còn 2 máy + 15 phụ kiện", (await tonCua(T, gd, spMay.id)) === 2 && (await tonCua(T, gd, spPhuKien.id)) === 15);

  const hoaDon = await voi(T, ketoan, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: don.id })));
  await voi(T, ketoan, (nc) =>
    phatHanhHoaDon(nc, hoaDon.id, LuocDoPhatHanh.parse({ ngayPhatHanh: congNgay(homNay, -10), hanThanhToan: congNgay(homNay, 20) })),
  );
  const hdBanDau = await voi(T, ketoan, (nc) => chiTietHoaDon(nc, hoaDon.id));
  dat("Nền: hóa đơn 33.000.000 ₫ đã phát hành, chưa thu", hdBanDau.hoaDon.tongCong === "33000000" && hdBanDau.hoaDon.conNo === 33_000_000);

  // ------------------------------------------------------------------
  console.log("\n— TH-01, TH-02: lập phiếu khách trả hàng —");

  await nemLoi("Thủ kho không lập được phiếu trả hàng bán", "quyen", () =>
    voi(T, thukho, (nc) =>
      taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
        khachHangId: khach.id, khoId: kho.id, lyDo: "Khách đổi ý",
        dong: [{ ten: "Chuột không dây", soLuong: "1", donGia: "2000000" }],
      })),
    ),
  );

  dat(
    "TH-02: lược đồ bắt buộc lý do trả hàng",
    LuocDoTaoTraHangBan.safeParse({
      khachHangId: khach.id, khoId: kho.id, lyDo: "",
      dong: [{ ten: "Chuột không dây", soLuong: "1", donGia: "2000000" }],
    }).success === false,
  );

  await nemLoi("Đơn của khách khác bị chặn", "dinh-dang", () =>
    voi(T, cskh, (nc) =>
      taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
        khachHangId: khach2.id, donHangId: don.id, khoId: kho.id, lyDo: "Trả nhầm đơn",
        dong: [{ dongDonId: dongPk.id, ten: "Chuột không dây", soLuong: "1", donGia: "2000000" }],
      })),
    ),
  );

  await nemLoi("TH-03: trả quá số đã giao bị chặn", "nghiep-vu", () =>
    voi(T, cskh, (nc) =>
      taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
        khachHangId: khach.id, donHangId: don.id, khoId: kho.id, lyDo: "Trả vượt",
        dong: [{ dongDonId: dongPk.id, sanPhamId: spPhuKien.id, ten: "Chuột không dây", soLuong: "6", donGia: "2000000" }],
      })),
    ),
    "tra-qua-so-luong",
  );

  await nemLoi("TH-06: hàng lỗi mà vẫn nhập lại kho thì phải ghi rõ vì sao", "dinh-dang", () =>
    voi(T, cskh, (nc) =>
      taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
        khachHangId: khach.id, donHangId: don.id, khoId: kho.id, lyDo: "Hàng lỗi",
        dong: [{
          dongDonId: dongPk.id, sanPhamId: spPhuKien.id, ten: "Chuột không dây", soLuong: "1",
          donGia: "2000000", tinhTrang: "loi", nhapLaiKho: true,
        }],
      })),
    ),
  );

  await nemLoi("Trả hàng thường không được khai hàng thay thế", "dinh-dang", () =>
    voi(T, cskh, (nc) =>
      taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
        khachHangId: khach.id, khoId: kho.id, lyDo: "Nhầm loại phiếu",
        dong: [{ sanPhamId: spPhuKien.id, ten: "Chuột không dây", soLuong: "1", donGia: "2000000", thayTheSanPhamId: spPhuKien.id }],
      })),
    ),
  );

  // Phiếu thật: 2 cái còn tốt (nhập lại) + 1 cái lỗi (không nhập lại).
  const p1 = await voi(T, cskh, (nc) =>
    taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
      khachHangId: khach.id, donHangId: don.id, khoId: kho.id,
      lyDo: "Khách mua dư, trả lại 3 chuột; 1 cái đã hỏng nút",
      dong: [
        { dongDonId: dongPk.id, sanPhamId: spPhuKien.id, ten: "Chuột không dây", soLuong: "2", donGia: "2000000", vat: 10 },
        { dongDonId: dongPk.id, sanPhamId: spPhuKien.id, ten: "Chuột không dây", soLuong: "1", donGia: "2000000", vat: 10, tinhTrang: "loi" },
      ],
    })),
  );
  dat("TH-01: phiếu có mã TH-<năm>-0001", p1.so === `TH-${namVN()}-0001`, p1.so);

  const ct1 = await voi(T, cskh, (nc) => chiTietTraHangBan(nc, p1.id));
  dat("Giá trị phiếu = 3 × 2.000.000 + VAT = 6.600.000 ₫", ct1.phieu.tongCong === "6600000", ct1.phieu.tongCong);
  dat("TH-06: hàng còn tốt mặc định nhập lại kho", ct1.phieu.dong[0].nhapLaiKho === true);
  dat("TH-06: hàng lỗi mặc định KHÔNG nhập lại kho", ct1.phieu.dong[1].nhapLaiKho === false);
  dat("Phiếu nháp chưa đụng tồn kho", (await tonCua(T, gd, spPhuKien.id)) === 15);
  dat("Phiếu nháp: mở xác nhận, chưa mở chốt tiền", ct1.quyen.xacNhan === false && ct1.quyen.chotTien === false, JSON.stringify(ct1.quyen));

  const ctKho1 = await voi(T, thukho, (nc) => chiTietTraHangBan(nc, p1.id));
  dat("Thủ kho xem được phiếu và có nút xác nhận", ctKho1.quyen.xacNhan === true && ctKho1.quyen.chotTien === false);

  // ------------------------------------------------------------------
  console.log("\n— TH-04: xác nhận, hàng đi qua kho —");

  await nemLoi("Kế toán không xác nhận nhập kho được", "quyen", () =>
    voi(T, ketoan, (nc) => xacNhanTraHangBan(nc, p1.id, LuocDoXacNhanTraHang.parse({}))),
  );

  const xn1 = await voi(T, thukho, (nc) => xacNhanTraHangBan(nc, p1.id, LuocDoXacNhanTraHang.parse({ ghiChu: "Đã kiểm hàng" })));
  dat("TH-04: xác nhận xong chuyển CONFIRMED", xn1.trangThai === "CONFIRMED", xn1.trangThai);
  dat("Chỉ hàng còn tốt được cộng lại tồn: 15 + 2 = 17", (await tonCua(T, gd, spPhuKien.id)) === 17, String(await tonCua(T, gd, spPhuKien.id)));

  await nemLoi("Xác nhận lần hai bị chặn", "nghiep-vu", () =>
    voi(T, thukho, (nc) => xacNhanTraHangBan(nc, p1.id, LuocDoXacNhanTraHang.parse({}))),
    "sai-trang-thai",
  );

  await nemLoi("TH-09: hàng đã qua kho thì không hủy phiếu được", "nghiep-vu", () =>
    voi(T, cskh, (nc) => huyTraHangBan(nc, p1.id, "Đổi ý")),
    "sai-trang-thai",
  );

  const doiSoat1 = await voi(T, gd, (nc) => doiSoatKho(nc));
  dat("Đối soát kho sau khi nhận hàng trả: không lệch", doiSoat1.lech.length === 0, JSON.stringify(doiSoat1.lech));

  // ------------------------------------------------------------------
  console.log("\n— TH-07: chốt tiền bằng giảm trừ công nợ —");

  await nemLoi("Thủ kho không chốt tiền được", "quyen", () =>
    voi(T, thukho, (nc) => chotGiamTruBan(nc, p1.id, LuocDoChotGiamTru.parse({ phanBo: [{ hoaDonId: hoaDon.id, soTien: "6600000" }] }))),
  );

  await nemLoi("Giảm trừ vượt giá trị phiếu bị chặn", "nghiep-vu", () =>
    voi(T, ketoan, (nc) => chotGiamTruBan(nc, p1.id, LuocDoChotGiamTru.parse({ phanBo: [{ hoaDonId: hoaDon.id, soTien: "10000000" }] }))),
    "giam-tru-khong-hop-le",
  );

  const hoaDonKhac = await voi(T, ketoan, (nc) =>
    taoHoaDon(nc, LuocDoTaoHoaDon.parse({
      khachHangId: khach2.id,
      dong: [{ ten: "Dịch vụ lẻ", soLuong: "1", donGia: "1000000", vat: 10 }],
    })),
  );
  await voi(T, ketoan, (nc) => phatHanhHoaDon(nc, hoaDonKhac.id, LuocDoPhatHanh.parse({ hanThanhToan: congNgay(homNay, 15) })));
  await nemLoi("Giảm trừ vào hóa đơn của khách khác bị chặn", "dinh-dang", () =>
    voi(T, ketoan, (nc) => chotGiamTruBan(nc, p1.id, LuocDoChotGiamTru.parse({ phanBo: [{ hoaDonId: hoaDonKhac.id, soTien: "1000000" }] }))),
  );

  const chot1 = await voi(T, ketoan, (nc) =>
    chotGiamTruBan(nc, p1.id, LuocDoChotGiamTru.parse({ phanBo: [{ hoaDonId: hoaDon.id, soTien: "6600000" }] })),
  );
  dat("TH-07: chốt xong chuyển SETTLED", chot1.trangThai === "SETTLED" && chot1.tongGiamTru === 6_600_000, JSON.stringify(chot1));

  const hdSau = await voi(T, ketoan, (nc) => chiTietHoaDon(nc, hoaDon.id));
  dat("Công nợ hóa đơn giảm đúng: 33.000.000 − 6.600.000 = 26.400.000", hdSau.hoaDon.conNo === 26_400_000, String(hdSau.hoaDon.conNo));
  dat("Tiền thu KHÔNG đổi — nợ giảm bằng hàng, không phải bằng tiền", hdSau.hoaDon.daThu === 0 && hdSau.hoaDon.daGiamTru === 6_600_000, JSON.stringify({ thu: hdSau.hoaDon.daThu, giam: hdSau.hoaDon.daGiamTru }));
  dat("Hóa đơn hiện rõ phiếu trả hàng đã giảm trừ", hdSau.hoaDon.traHang.length === 1 && hdSau.hoaDon.traHang[0].so === p1.so);
  dat("Hóa đơn chuyển sang 'thu một phần' vì đã bù một phần", hdSau.hoaDon.tinhTrangThu === "thu-mot-phan", hdSau.hoaDon.tinhTrangThu);

  await nemLoi("Chốt tiền lần hai bị chặn", "nghiep-vu", () =>
    voi(T, ketoan, (nc) => chotGiamTruBan(nc, p1.id, LuocDoChotGiamTru.parse({ phanBo: [{ hoaDonId: hoaDon.id, soTien: "100000" }] }))),
    "sai-trang-thai",
  );

  // ------------------------------------------------------------------
  console.log("\n— TH-08, TH-10: đổi máy —");

  await nemLoi("Phiếu đổi máy phải khai hàng thay thế", "dinh-dang", () =>
    voi(T, cskh, (nc) =>
      taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
        khachHangId: khach.id, donHangId: don.id, khoId: kho.id, loai: "doi-may", lyDo: "Máy lỗi màn hình",
        dong: [{ dongDonId: dongMay.id, sanPhamId: spMay.id, ten: "Laptop văn phòng", soLuong: "1", donGia: "20000000" }],
      })),
    ),
  );

  const p2 = await voi(T, cskh, (nc) =>
    taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
      khachHangId: khach.id, donHangId: don.id, khoId: kho.id, loai: "doi-may",
      lyDo: "Máy lỗi màn hình trong thời gian bảo hành, đổi máy mới",
      dong: [{
        dongDonId: dongMay.id, sanPhamId: spMay.id, ten: "Laptop văn phòng", soLuong: "1",
        donGia: "20000000", tinhTrang: "loi", serial: [SR.a],
        thayTheSanPhamId: spMay.id, thayTheSerial: [SR.b],
      }],
    })),
  );
  const ct2 = await voi(T, cskh, (nc) => chiTietTraHangBan(nc, p2.id));
  dat("TH-08: phiếu đổi máy có giá trị 0 — không phát sinh tiền", ct2.phieu.tongCong === "0", ct2.phieu.tongCong);
  dat("Phiếu đổi máy ghi rõ hàng thay thế", ct2.phieu.dong[0].hangThayThe?.id === spMay.id);

  const bhTruoc = await chu.warranty.findFirstOrThrow({
    where: { tenantId: T, serial: SR.a },
    select: { id: true, endDate: true, startDate: true },
  });

  const xn2 = await voi(T, thukho, (nc) => xacNhanTraHangBan(nc, p2.id, LuocDoXacNhanTraHang.parse({})));
  dat("Xác nhận đổi máy xong chuyển CONFIRMED", xn2.trangThai === "CONFIRMED");
  dat("Máy mới xuất kho: còn 1 máy trong kho", (await tonCua(T, gd, spMay.id)) === 1, String(await tonCua(T, gd, spMay.id)));

  const snCu = await chu.serialNumber.findFirstOrThrow({ where: { tenantId: T, serial: SR.a }, select: { status: true, warehouseId: true } });
  const snMoi = await chu.serialNumber.findFirstOrThrow({ where: { tenantId: T, serial: SR.b }, select: { status: true, warehouseId: true } });
  dat("TH-05: máy lỗi chuyển trạng thái 'tra-lai' và không nằm ở kho nào", snCu.status === "tra-lai" && snCu.warehouseId === null, JSON.stringify(snCu));
  dat("TH-05: máy thay thế chuyển 'da-ban' và rời kho", snMoi.status === "da-ban" && snMoi.warehouseId === null, JSON.stringify(snMoi));

  const bhSau = await chu.warranty.findFirstOrThrow({ where: { id: bhTruoc.id }, select: { serial: true, startDate: true, endDate: true, note: true } });
  dat("TH-10: bảo hành chuyển sang sê-ri máy mới", bhSau.serial === SR.b, String(bhSau.serial));
  dat(
    "TH-10: đổi máy KHÔNG làm mới đồng hồ bảo hành — mốc hết hạn giữ nguyên",
    bhSau.endDate.getTime() === bhTruoc.endDate.getTime() && bhSau.startDate.getTime() === bhTruoc.startDate.getTime(),
    `${bhTruoc.endDate.toISOString()} → ${bhSau.endDate.toISOString()}`,
  );
  dat("Bảo hành ghi lại việc đổi máy để truy ngược", (bhSau.note ?? "").includes(p2.so));

  await nemLoi("TH-08: phiếu đổi máy không có gì để chốt tiền", "nghiep-vu", () =>
    voi(T, ketoan, (nc) => chotGiamTruBan(nc, p2.id, LuocDoChotGiamTru.parse({ phanBo: [{ hoaDonId: hoaDon.id, soTien: "1000" }] }))),
    "sai-trang-thai",
  );

  const doiSoat2 = await voi(T, gd, (nc) => doiSoatKho(nc));
  dat("Đối soát kho sau đổi máy: không lệch", doiSoat2.lech.length === 0, JSON.stringify(doiSoat2.lech));

  // ------------------------------------------------------------------
  console.log("\n— TH-05: sê-ri phải là máy đã bán ra —");

  // 0.16.1 (TV-BH-10): trả hàng luôn theo đơn — phiếu "trả lẻ" ngoài đơn bị chặn từ lúc lập.
  await nemLoi("TV-BH-10: phiếu trả không theo đơn bị chặn", "dinh-dang", () =>
    voi(T, cskh, (nc) =>
      taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
        khachHangId: khach.id, khoId: kho.id,
        lyDo: "Thử trả lẻ ngoài đơn",
        dong: [{ sanPhamId: spMay.id, ten: "Laptop văn phòng", soLuong: "1", donGia: "20000000", serial: [SR.c] }],
      })),
    ),
  );

  // Đổi máy không tính là "đã trả" (khách vẫn giữ một máy) nên dòng máy còn trả được 1.
  const p3 = await voi(T, cskh, (nc) =>
    taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
      khachHangId: khach.id, donHangId: don.id, khoId: kho.id,
      lyDo: "Thử sê-ri chưa bán cho ai",
      dong: [{ dongDonId: dongMay.id, sanPhamId: spMay.id, ten: "Laptop văn phòng", soLuong: "1", donGia: "20000000", serial: [SR.c] }],
    })),
  );
  await nemLoi("Sê-ri còn trong kho (chưa bán cho ai) không nhận trả được", "nghiep-vu", () =>
    voi(T, thukho, (nc) => xacNhanTraHangBan(nc, p3.id, LuocDoXacNhanTraHang.parse({}))),
    "serial-chua-ban",
  );
  await voi(T, cskh, (nc) => huyTraHangBan(nc, p3.id, "Khai nhầm sê-ri"));

  const p4 = await voi(T, cskh, (nc) =>
    taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
      khachHangId: khach.id, donHangId: don.id, khoId: kho.id,
      lyDo: "Thử thiếu sê-ri",
      dong: [{ dongDonId: dongMay.id, sanPhamId: spMay.id, ten: "Laptop văn phòng", soLuong: "1", donGia: "20000000" }],
    })),
  );
  await nemLoi("Hàng theo sê-ri mà không khai sê-ri thì không xác nhận được", "nghiep-vu", () =>
    voi(T, thukho, (nc) => xacNhanTraHangBan(nc, p4.id, LuocDoXacNhanTraHang.parse({}))),
    "thieu-serial",
  );

  // ------------------------------------------------------------------
  console.log("\n— TH-09: hủy phiếu nháp —");

  dat("Lược đồ bắt buộc lý do hủy", LuocDoHuyTraHang.safeParse({ lyDo: "" }).success === false);
  const huy = await voi(T, cskh, (nc) => huyTraHangBan(nc, p4.id, "Khách đổi ý, không trả nữa"));
  dat("TH-09: hủy được phiếu còn nháp", huy.trangThai === "CANCELLED");

  const goiY = await voi(T, cskh, (nc) => goiYTraTheoDon(nc, don.id));
  const goiYPk = goiY.dong.find((x) => x.sanPhamId === spPhuKien.id)!;
  dat(
    "TH-03: gợi ý đúng phần còn trả được (giao 5, đã trả 3, còn 2)",
    goiYPk.daGiao === 5 && goiYPk.daTra === 3 && goiYPk.conTraDuoc === 2,
    JSON.stringify(goiYPk),
  );
  const goiYMay = goiY.dong.find((x) => x.sanPhamId === spMay.id)!;
  dat(
    "Phiếu đã hủy và phiếu đổi máy không bị tính vào phần đã trả (TV-BH-10)",
    goiYMay.daTra === 0 && goiYMay.conTraDuoc === 1,
    JSON.stringify(goiYMay),
  );

  // ------------------------------------------------------------------
  console.log("\n— Danh sách và phạm vi —");

  const ds = await voi(T, ketoan, (nc) => danhSachTraHangBan(nc, { q: "", trangThai: "", loai: "", khachHang: "", trang: 1, coTrang: 20 }));
  dat("Mặc định chỉ hiện phiếu đang mở (nháp + đã nhận hàng)", ds.dong.every((x) => x.trangThai === "DRAFT" || x.trangThai === "CONFIRMED"), ds.dong.map((x) => x.trangThai).join(","));
  const dsTatCa = await voi(T, ketoan, (nc) => danhSachTraHangBan(nc, { q: "", trangThai: "tat-ca", loai: "", khachHang: "", trang: 1, coTrang: 20 }));
  dat("Lọc 'tất cả' thấy cả phiếu đã chốt và đã hủy", dsTatCa.tong === 4, String(dsTatCa.tong));
  const dsDoiMay = await voi(T, ketoan, (nc) => danhSachTraHangBan(nc, { q: "", trangThai: "tat-ca", loai: "doi-may", khachHang: "", trang: 1, coTrang: 20 }));
  dat("Lọc theo loại phiếu chạy đúng", dsDoiMay.tong === 1 && dsDoiMay.dong[0].so === p2.so);

  await nemLoi("Người không có quyền nào trong ba quyền thì không xem được", "quyen", () =>
    voi(T, thuctap, (nc) => danhSachTraHangBan(nc, { q: "", trangThai: "", loai: "", khachHang: "", trang: 1, coTrang: 20 })),
  );

  await nemLoi("Phiếu không thuộc phạm vi thì trả 404, không phải 403", "khong-thay", () =>
    voi(T, gd, (nc) => chiTietTraHangBan(nc, "00000000-0000-4000-8000-000000000000")),
  );

  // ------------------------------------------------------------------
  console.log("\n— Chiều mua: trả hàng cho nhà cung cấp —");

  const ncc = await voi(T, muahang, (nc) =>
    taoNhaCungCap(nc, LuocDoTaoNhaCungCap.parse({ ten: `Công ty Nguồn Hàng ${DAU}`, dienThoai: "0909 777 888" })),
  );
  const ncc2 = await voi(T, muahang, (nc) =>
    taoNhaCungCap(nc, LuocDoTaoNhaCungCap.parse({ ten: `Công ty Nguồn Khác ${DAU}`, dienThoai: "0909 777 999" })),
  );
  const dm = await voi(T, muahang, (nc) =>
    taoDonMua(nc, LuocDoTaoDonMua.parse({
      nhaCungCapId: ncc.id,
      khoId: kho.id,
      dong: [{ sanPhamId: spPhuKien.id, ten: "Chuột không dây", soLuong: "10", donGia: "1200000", vat: 10 }],
    })),
  );
  await voi(T, muahang, (nc) => guiDonMua(nc, dm.id));
  await voi(T, muahang, (nc) => xacNhanDonMua(nc, dm.id));
  const ctDm = await voi(T, muahang, (nc) => chiTietDonMua(nc, dm.id));
  const dongDm = ctDm.donMua.dong[0];
  await voi(T, thukho, (nc) =>
    nhanHang(nc, dm.id, LuocDoNhanHang.parse({ dong: [{ dongDonId: dongDm.id, soLuong: "10", giaVon: "1200000" }] })),
  );
  dat("Nền chiều mua: nhận 10 chuột, tồn lên 27", (await tonCua(T, gd, spPhuKien.id)) === 27, String(await tonCua(T, gd, spPhuKien.id)));

  const hdMua = await voi(T, ketoan, (nc) => taoHoaDonMua(nc, LuocDoTaoHoaDonMua.parse({ donMuaId: dm.id })));
  await voi(T, ketoan, (nc) =>
    ghiNhanHoaDonMua(nc, hdMua.id, LuocDoGhiNhanHoaDonMua.parse({ ngayHoaDon: congNgay(homNay, -3), hanThanhToan: congNgay(homNay, 12) })),
  );
  const hdMuaTruoc = await voi(T, ketoan, (nc) => chiTietHoaDonMua(nc, hdMua.id));
  dat("Nền chiều mua: nợ phải trả 13.200.000 ₫", hdMuaTruoc.hoaDon.conNo === 13_200_000, String(hdMuaTruoc.hoaDon.conNo));

  await nemLoi("Đơn mua của nhà cung cấp khác bị chặn", "dinh-dang", () =>
    voi(T, muahang, (nc) =>
      taoTraHangMua(nc, LuocDoTaoTraHangMua.parse({
        nhaCungCapId: ncc2.id, donMuaId: dm.id, khoId: kho.id, lyDo: "Sai nhà cung cấp",
        dong: [{ dongDonId: dongDm.id, sanPhamId: spPhuKien.id, ten: "Chuột không dây", soLuong: "1", donGia: "1200000" }],
      })),
    ),
  );

  await nemLoi("TH-03: trả quá phần đã nhận bị chặn", "nghiep-vu", () =>
    voi(T, muahang, (nc) =>
      taoTraHangMua(nc, LuocDoTaoTraHangMua.parse({
        nhaCungCapId: ncc.id, donMuaId: dm.id, khoId: kho.id, lyDo: "Trả vượt",
        dong: [{ dongDonId: dongDm.id, sanPhamId: spPhuKien.id, ten: "Chuột không dây", soLuong: "11", donGia: "1200000" }],
      })),
    ),
    "tra-qua-so-luong",
  );

  const pm1 = await voi(T, muahang, (nc) =>
    taoTraHangMua(nc, LuocDoTaoTraHangMua.parse({
      nhaCungCapId: ncc.id, donMuaId: dm.id, khoId: kho.id,
      lyDo: "2 cái chết nút cuộn ngay khi mở hộp",
      dong: [{ dongDonId: dongDm.id, sanPhamId: spPhuKien.id, ten: "Chuột không dây", soLuong: "2", donGia: "1200000", vat: 10 }],
    })),
  );
  dat("Phiếu trả nhà cung cấp có mã TM-<năm>-0001", pm1.so === `TM-${namVN()}-0001`, pm1.so);

  const ctm1 = await voi(T, muahang, (nc) => chiTietTraHangMua(nc, pm1.id));
  dat("Giá trị phiếu trả mua = 2 × 1.200.000 + VAT = 2.640.000 ₫", ctm1.phieu.tongCong === "2640000", ctm1.phieu.tongCong);
  dat("Đối chiếu: phiếu biết đơn mua đã nhận 10", ctm1.phieu.dong[0].daNhanTrenDon === "10");

  await nemLoi("Kế toán không xác nhận xuất kho trả hàng được", "quyen", () =>
    voi(T, ketoan, (nc) => xacNhanTraHangMua(nc, pm1.id, LuocDoXacNhanTraHang.parse({}))),
  );

  const xnm = await voi(T, thukho, (nc) => xacNhanTraHangMua(nc, pm1.id, LuocDoXacNhanTraHang.parse({ ghiChu: "Đã đóng thùng gửi đi" })));
  dat("Xác nhận trả mua xong chuyển CONFIRMED", xnm.trangThai === "CONFIRMED");
  dat("Hàng ra khỏi kho: 27 − 2 = 25", (await tonCua(T, gd, spPhuKien.id)) === 25, String(await tonCua(T, gd, spPhuKien.id)));

  const chotM = await voi(T, ketoan, (nc) =>
    chotGiamTruMua(nc, pm1.id, LuocDoChotGiamTru.parse({ phanBo: [{ hoaDonId: hdMua.id, soTien: "2640000" }] })),
  );
  dat("Chốt giảm trừ chiều mua xong chuyển SETTLED", chotM.trangThai === "SETTLED" && chotM.tongGiamTru === 2_640_000);

  const hdMuaSau = await voi(T, ketoan, (nc) => chiTietHoaDonMua(nc, hdMua.id));
  dat("Nợ phải trả giảm đúng: 13.200.000 − 2.640.000 = 10.560.000", hdMuaSau.hoaDon.conNo === 10_560_000, String(hdMuaSau.hoaDon.conNo));
  dat("Tiền đã chi KHÔNG đổi", hdMuaSau.hoaDon.daTra === 0 && hdMuaSau.hoaDon.daGiamTru === 2_640_000, JSON.stringify({ tra: hdMuaSau.hoaDon.daTra, giam: hdMuaSau.hoaDon.daGiamTru }));
  dat("Hóa đơn nhà cung cấp hiện rõ phiếu trả hàng", hdMuaSau.hoaDon.traHang.length === 1 && hdMuaSau.hoaDon.traHang[0].so === pm1.so);

  const goiYM = await voi(T, muahang, (nc) => goiYTraTheoDonMua(nc, dm.id));
  dat("Gợi ý chiều mua: nhận 10, đã trả 2, còn 8", goiYM.dong[0].daNhan === 10 && goiYM.dong[0].daTra === 2 && goiYM.dong[0].conTraDuoc === 8, JSON.stringify(goiYM.dong[0]));

  const dsM = await voi(T, muahang, (nc) => danhSachTraHangMua(nc, { q: "", trangThai: "tat-ca", nhaCungCap: "", trang: 1, coTrang: 20 }));
  dat("Danh sách trả hàng mua chạy được", dsM.tong === 1 && dsM.dong[0].so === pm1.so);

  await nemLoi("Người không có purchasing.view lẫn finance.view thì không xem được", "quyen", () =>
    voi(T, thuctap, (nc) => danhSachTraHangMua(nc, { q: "", trangThai: "", nhaCungCap: "", trang: 1, coTrang: 20 })),
  );

  // Xuất quá tồn phải bị chặn ở chính hàm ghi sổ kho.
  const pm2 = await voi(T, muahang, (nc) =>
    taoTraHangMua(nc, LuocDoTaoTraHangMua.parse({
      nhaCungCapId: ncc.id, donMuaId: dm.id, khoId: kho.id,
      lyDo: "Thử xuất quá tồn",
      dong: [{ dongDonId: dongDm.id, sanPhamId: spPhuKien.id, ten: "Chuột không dây", soLuong: "8", donGia: "1200000" }],
    })),
  );
  await voi(T, gd, (nc) =>
    dieuChinhTon(nc, LuocDoDieuChinh.parse({ khoId: kho.id, sanPhamId: spPhuKien.id, chieu: "giam", soLuong: "20", lyDo: "Dọn tồn cho bài thử" })),
  );
  await nemLoi("Xuất trả quá tồn bị chặn ở hàm ghi sổ kho dùng chung", "nghiep-vu", () =>
    voi(T, thukho, (nc) => xacNhanTraHangMua(nc, pm2.id, LuocDoXacNhanTraHang.parse({}))),
    "ton-khong-du",
  );

  const doiSoatCuoi = await voi(T, gd, (nc) => doiSoatKho(nc));
  dat("Đối soát kho cuối bài: không lệch", doiSoatCuoi.lech.length === 0, JSON.stringify(doiSoatCuoi.lech));

  await ketLuan("Thử Trả hàng và đổi máy");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => chu.$disconnect());
