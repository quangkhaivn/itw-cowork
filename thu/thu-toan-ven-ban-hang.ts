import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { taoSanPham } from "../src/modules/san-pham/service";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { doiSoatKho, ghiSoKho, nhapKho, taoKho } from "../src/modules/kho/service";
import { LuocDoNhapKho, LuocDoTaoKho } from "../src/modules/kho/luoc-do";
import { chiTietDonHang, huyDon, taoDonHang, taoDonTuBaoGia, taoPhieuXuat, xacNhanDon } from "../src/modules/don-hang/service";
import { LuocDoTaoDon, LuocDoTaoPhieuXuat } from "../src/modules/don-hang/luoc-do";
import { chiTietBaoGia, chotBaoGia, guiKhach, quyetDuyet, taoBaoGia, taoPhienBanMoi, xinDuyet } from "../src/modules/bao-gia/service";
import { LuocDoTaoBaoGia } from "../src/modules/bao-gia/luoc-do";
import { taoCoHoi } from "../src/modules/co-hoi/service";
import { LuocDoTaoCoHoi } from "../src/modules/co-hoi/luoc-do";
import { huyHoaDon, phatHanhHoaDon, taoHoaDon, thuTien } from "../src/modules/tai-chinh/service";
import { LuocDoPhatHanh, LuocDoTaoHoaDon, LuocDoThuTien } from "../src/modules/tai-chinh/luoc-do";
import { taoDuAn } from "../src/modules/du-an/service";
import { LuocDoTaoDuAn } from "../src/modules/du-an/luoc-do";
import { huyBaoHanh } from "../src/modules/bao-hanh/service";
import { chotGiamTruBan, taoTraHangBan, xacNhanTraHangBan } from "../src/modules/tra-hang/service";
import { LuocDoChotGiamTru, LuocDoTaoTraHangBan, LuocDoXacNhanTraHang } from "../src/modules/tra-hang/luoc-do";
import { nhanChuyenKho, taoChuyenKho, xuatChuyenKho } from "../src/modules/chuyen-kho/service";
import { LuocDoNhanChuyenKho, LuocDoTaoChuyenKho, LuocDoXuatChuyenKho } from "../src/modules/chuyen-kho/luoc-do";
import { chuyenDoiLead, taoLead } from "../src/modules/lead/service";
import { LuocDoChuyenDoiLead, LuocDoTaoLead } from "../src/modules/lead/luoc-do";
import { doiTrangThaiPhieu, suaPhieu, taoPhieu } from "../src/modules/ho-tro/service";
import { LuocDoSuaPhieu, LuocDoTaoPhieu } from "../src/modules/ho-tro/luoc-do";
import { homNayVN } from "../src/modules/crm/chung";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Toàn vẹn chuỗi bán hàng – kho (0.16.1). Luật: BUSINESS_RULES.md mục 25 (TV-BH-01 → TV-BH-12).
 *
 * Mỗi lỗi tranh chấp được thử bằng HAI giao dịch `voiTenant` chạy song song (Promise.allSettled,
 * hai kết nối riêng): đúng một yêu cầu thành công, dữ liệu sau đó nhất quán. Các lỗi còn lại có
 * bài thử hồi quy.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(
    tenantId,
    async (tx) => {
      const hoSo = await layHoSoQuyen(tx, userId);
      if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
      return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-toan-ven-ban-hang"));
    },
    { timeoutMs: 20_000 },
  );
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

/** Chạy hai việc CÙNG LÚC trên hai giao dịch riêng; trả số thành công và các lỗi. */
async function haiCungLuc<T>(a: () => Promise<T>, b: () => Promise<T>) {
  const kq = await Promise.allSettled([a(), b()]);
  const ok = kq.filter((x): x is PromiseFulfilledResult<Awaited<T>> => x.status === "fulfilled").map((x) => x.value);
  const loi = kq.filter((x): x is PromiseRejectedResult => x.status === "rejected").map((x) => x.reason as unknown);
  return { soThanhCong: ok.length, ok, loi };
}
const maLoi = (e: unknown) => (e instanceof LoiNghiepVu ? e.ma : e instanceof Error ? e.message : String(e));

async function main() {
  console.log("=== Thử toàn vẹn chuỗi bán hàng – kho (0.16.1) ===\n");
  const tenant = await seedNenMong(chu, `thu-tvbh-${DAU}`, "Doanh nghiệp thử toàn vẹn bán hàng");
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
  const tp = await nguoi("truong-phong", "sales-manager");

  // Nền: hai khách, hai kho, ba sản phẩm.
  const khach = await voi(T, gd, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Công ty Toàn Vẹn ${DAU}`, dienThoai: "0909 000 111", diaChi: "1 Đường Thử" })));
  const khach2 = await voi(T, gd, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Công ty Khác Khách ${DAU}`, dienThoai: "0909 000 222" })));
  // Trưởng phòng Kinh doanh phụ trách khách 1 (lập báo giá); Giám đốc duyệt.
  await chu.customer.update({ where: { id: khach.id }, data: { ownerId: tp } });
  const khoA = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "tv-a", ten: "Kho A", macDinh: true })));
  const khoB = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "tv-b", ten: "Kho B" })));
  const spMay = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `TV-MAY-${DAU}`, ten: "Laptop bảo hành 12 tháng", giaBan: "20000000", giaVon: "15000000", donViTinh: "cai", batBuocSerial: true, baoHanhThang: 12 })),
  );
  const spMayKhongBh = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `TV-MAY0-${DAU}`, ten: "Máy in không bảo hành", giaBan: "5000000", giaVon: "4000000", donViTinh: "cai", batBuocSerial: true, baoHanhThang: 0 })),
  );
  const spPk = await voi(T, gd, (nc) =>
    taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `TV-PK-${DAU}`, ten: "Bàn phím", giaBan: "300000", giaVon: "200000", donViTinh: "cai" })),
  );
  const S = (n: number) => `TV-${DAU}-${n}`;
  await voi(T, gd, (nc) =>
    nhapKho(nc, LuocDoNhapKho.parse({
      khoId: khoA.id, lyDo: "Nhập đầu kỳ bài thử",
      dong: [
        { sanPhamId: spMay.id, soLuong: "4", serial: [S(1), S(2), S(3), S(4)] },
        { sanPhamId: spMayKhongBh.id, soLuong: "2", serial: [S(11), S(12)] },
        { sanPhamId: spPk.id, soLuong: "100" },
      ],
    })),
  );
  await voi(T, gd, (nc) => nhapKho(nc, LuocDoNhapKho.parse({ khoId: khoB.id, lyDo: "Nhập đầu kỳ kho B", dong: [{ sanPhamId: spPk.id, soLuong: "40" }] })));

  const giuChoCuaDon = async (donId: string) => {
    const g = await chu.inventoryTransaction.groupBy({ by: ["warehouseId"], where: { tenantId: T, refType: "don-hang", refId: donId }, _sum: { reservedDelta: true } });
    return Object.fromEntries(g.map((x) => [x.warehouseId, Number(x._sum.reservedDelta ?? 0)]));
  };
  const soDu = async (khoId: string, spId: string) => {
    const b = await chu.inventoryBalance.findFirst({ where: { tenantId: T, warehouseId: khoId, productId: spId }, select: { onHand: true, reserved: true } });
    return { ton: Number(b?.onHand ?? 0), giu: Number(b?.reserved ?? 0) };
  };
  const donMoi = (dong: { sp: { id: string; ten: string }; sl: string; gia: string }[], khachId = khach.id) =>
    voi(T, gd, (nc) =>
      taoDonHang(nc, LuocDoTaoDon.parse({
        khachHangId: khachId,
        dong: dong.map((x) => ({ sanPhamId: x.sp.id, ten: x.sp.ten, soLuong: x.sl, donGia: x.gia, giaVon: "0" })),
      })),
    );
  const dongCua = async (donId: string) => (await voi(T, gd, (nc) => chiTietDonHang(nc, donId))).don.dong;

  // ------------------------------------------------------------------
  console.log("— TV-BH-01: xác nhận đơn hai lần cùng lúc —");
  const d1 = await donMoi([{ sp: spPk, sl: "10", gia: "300000" }]);
  const xn = await haiCungLuc(
    () => voi(T, gd, (nc) => xacNhanDon(nc, d1.id, { khoId: khoA.id, ghiChu: null })),
    () => voi(T, gd, (nc) => xacNhanDon(nc, d1.id, { khoId: khoA.id, ghiChu: null })),
  );
  dat("Đúng một yêu cầu xác nhận thành công", xn.soThanhCong === 1, `${xn.soThanhCong} thành công; ${xn.loi.map(maLoi).join(", ")}`);
  dat("Yêu cầu còn lại bị chặn vì đơn đã xác nhận", xn.loi.length === 1 && maLoi(xn.loi[0]) === "sai-trang-thai", xn.loi.map(maLoi).join(","));
  dat("Chỉ giữ chỗ MỘT lần (10, không phải 20)", (await giuChoCuaDon(d1.id))[khoA.id] === 10 && (await soDu(khoA.id, spPk.id)).giu === 10, JSON.stringify(await giuChoCuaDon(d1.id)));

  // ------------------------------------------------------------------
  console.log("\n— TV-BH-01, TV-BH-03: hai phiếu xuất cùng lúc cho một đơn —");
  const [dongD1] = await dongCua(d1.id);
  const xuat2 = await haiCungLuc(
    () => voi(T, gd, (nc) => taoPhieuXuat(nc, d1.id, LuocDoTaoPhieuXuat.parse({ khoId: khoA.id, dong: [{ dongDonId: dongD1.id, soLuong: "7" }] }))),
    () => voi(T, gd, (nc) => taoPhieuXuat(nc, d1.id, LuocDoTaoPhieuXuat.parse({ khoId: khoA.id, dong: [{ dongDonId: dongD1.id, soLuong: "7" }] }))),
  );
  dat("Đúng một phiếu xuất thành công", xuat2.soThanhCong === 1, `${xuat2.soThanhCong}; ${xuat2.loi.map(maLoi).join(",")}`);
  dat("Phiếu còn lại bị chặn vì vượt phần còn phải giao", xuat2.loi.length === 1 && maLoi(xuat2.loi[0]) === "xuat-qua-so-luong", xuat2.loi.map(maLoi).join(","));
  const sauXuat = (await dongCua(d1.id))[0];
  dat("Số đã giao = 7 (không bị ghi đè, không vượt)", sauXuat.daGiao === "7", sauXuat.daGiao);
  dat("Chỉ có một phiếu xuất trong CSDL", (await chu.delivery.count({ where: { tenantId: T, orderId: d1.id } })) === 1);

  dat("TV-BH-03: lược đồ chặn một dòng đơn xuất hiện hai lần trong phiếu",
    LuocDoTaoPhieuXuat.safeParse({ khoId: khoA.id, dong: [{ dongDonId: dongD1.id, soLuong: "1" }, { dongDonId: dongD1.id, soLuong: "1" }] }).success === false);
  await nemLoi("TV-BH-03: service cũng chặn dòng trùng (gọi thẳng, không qua lược đồ)", "nghiep-vu", () =>
    voi(T, gd, (nc) => taoPhieuXuat(nc, d1.id, { khoId: khoA.id, nguoiNhan: null, ghiChu: null, dong: [{ dongDonId: dongD1.id, soLuong: "1", serial: [] }, { dongDonId: dongD1.id, soLuong: "1", serial: [] }] })),
    "dong-trung",
  );
  dat("Số đã giao vẫn 7 sau lần bị chặn", (await dongCua(d1.id))[0].daGiao === "7");

  // ------------------------------------------------------------------
  console.log("\n— TV-BH-02: hai đơn khác nhau cùng xuất một sê-ri —");
  const d2 = await donMoi([{ sp: spMayKhongBh, sl: "1", gia: "5000000" }]);
  const d3 = await donMoi([{ sp: spMayKhongBh, sl: "1", gia: "5000000" }], khach2.id);
  await voi(T, gd, (nc) => xacNhanDon(nc, d2.id, { khoId: khoA.id, ghiChu: null }));
  await voi(T, gd, (nc) => xacNhanDon(nc, d3.id, { khoId: khoA.id, ghiChu: null }));
  const [dongD2] = await dongCua(d2.id);
  const [dongD3] = await dongCua(d3.id);
  const serialTrung = await haiCungLuc(
    () => voi(T, gd, (nc) => taoPhieuXuat(nc, d2.id, LuocDoTaoPhieuXuat.parse({ khoId: khoA.id, dong: [{ dongDonId: dongD2.id, soLuong: "1", serial: [S(11)] }] }))),
    () => voi(T, gd, (nc) => taoPhieuXuat(nc, d3.id, LuocDoTaoPhieuXuat.parse({ khoId: khoA.id, dong: [{ dongDonId: dongD3.id, soLuong: "1", serial: [S(11)] }] }))),
  );
  dat("Đúng một đơn xuất được sê-ri đó", serialTrung.soThanhCong === 1, `${serialTrung.soThanhCong}; ${serialTrung.loi.map(maLoi).join(",")}`);
  dat("Đơn còn lại nhận lỗi nghiệp vụ rõ ràng về sê-ri", serialTrung.loi.length === 1 && maLoi(serialTrung.loi[0]) === "serial-da-dung", serialTrung.loi.map(maLoi).join(","));
  const sn11 = await chu.serialNumber.findFirstOrThrow({ where: { tenantId: T, serial: S(11) }, select: { status: true, salesOrderItemId: true } });
  dat("Sê-ri thuộc đúng một dòng đơn", sn11.status === "da-ban" && [dongD2.id, dongD3.id].includes(sn11.salesOrderItemId ?? ""));
  const daGiaoHaiDon = Number((await dongCua(d2.id))[0].daGiao) + Number((await dongCua(d3.id))[0].daGiao);
  dat("Tổng đã giao hai đơn = 1 (không bán một máy hai lần)", daGiaoHaiDon === 1, String(daGiaoHaiDon));
  dat("Tồn máy in còn 1 (trừ đúng một lần)", (await soDu(khoA.id, spMayKhongBh.id)).ton === 1);

  // ------------------------------------------------------------------
  console.log("\n— TV-BH-04: giữ chỗ không bị kẹt khi giao từ kho khác —");
  const truocA = await soDu(khoA.id, spPk.id);
  const d4 = await donMoi([{ sp: spPk, sl: "5", gia: "300000" }]);
  await voi(T, gd, (nc) => xacNhanDon(nc, d4.id, { khoId: khoA.id, ghiChu: null }));
  dat("Nền: giữ 5 ở kho A", (await giuChoCuaDon(d4.id))[khoA.id] === 5 && (await soDu(khoA.id, spPk.id)).giu === truocA.giu + 5);
  const [dongD4] = await dongCua(d4.id);
  await voi(T, gd, (nc) => taoPhieuXuat(nc, d4.id, LuocDoTaoPhieuXuat.parse({ khoId: khoB.id, dong: [{ dongDonId: dongD4.id, soLuong: "3" }] })));
  dat("Giao 3 từ kho B → kho A còn giữ 2 (nhả đúng 3)", (await giuChoCuaDon(d4.id))[khoA.id] === 2, JSON.stringify(await giuChoCuaDon(d4.id)));
  dat("Kho B không bị giữ chỗ âm", ((await giuChoCuaDon(d4.id))[khoB.id] ?? 0) === 0 && (await soDu(khoB.id, spPk.id)).giu === 0);
  await voi(T, gd, (nc) => taoPhieuXuat(nc, d4.id, LuocDoTaoPhieuXuat.parse({ khoId: khoB.id, dong: [{ dongDonId: dongD4.id, soLuong: "2" }] })));
  const g4 = await giuChoCuaDon(d4.id);
  dat("Giao đủ → không còn giữ chỗ nào cho đơn, ở mọi kho", Object.values(g4).every((v) => v === 0), JSON.stringify(g4));
  dat("Giữ chỗ kho A trở về mức trước đơn", (await soDu(khoA.id, spPk.id)).giu === truocA.giu, JSON.stringify(await soDu(khoA.id, spPk.id)));

  // Giữ chỗ "sót" (dữ liệu cũ trước bản sửa) cũng được nhả khi đơn giao đủ.
  const d5 = await donMoi([{ sp: spPk, sl: "4", gia: "300000" }]);
  await voi(T, gd, (nc) => xacNhanDon(nc, d5.id, { khoId: khoA.id, ghiChu: null }));
  await voi(T, gd, (nc) => ghiSoKho(nc, { khoId: khoB.id, sanPhamId: spPk.id, loai: "giu-cho", soLuong: 2, loaiChungTu: "don-hang", chungTuId: d5.id, soChungTu: d5.so, lyDo: "Giả lập giữ chỗ sót" }));
  const [dongD5] = await dongCua(d5.id);
  await voi(T, gd, (nc) => taoPhieuXuat(nc, d5.id, LuocDoTaoPhieuXuat.parse({ khoId: khoA.id, dong: [{ dongDonId: dongD5.id, soLuong: "4" }] })));
  const g5 = await giuChoCuaDon(d5.id);
  dat("Đơn giao đủ nhả cả phần giữ chỗ sót ở kho khác", Object.values(g5).every((v) => v === 0) && (await soDu(khoB.id, spPk.id)).giu === 0, JSON.stringify(g5));
  const ds1 = await voi(T, gd, (nc) => doiSoatKho(nc));
  dat("Đối soát kho: sổ cái khớp số dư", ds1.lech.length === 0, JSON.stringify(ds1.lech));
  const lechGiu = await chu.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM inventory_balances b
     WHERE b.tenant_id = $1::uuid AND b.reserved <> COALESCE((SELECT sum(t.reserved_delta) FROM inventory_transactions t
       WHERE t.warehouse_id = b.warehouse_id AND t.product_id = b.product_id), 0)`, T,
  );
  dat("Đối soát giữ chỗ: tổng sổ cái = số giữ chỗ đang lưu", lechGiu[0].n === 0, JSON.stringify(lechGiu));

  // ------------------------------------------------------------------
  console.log("\n— TV-BH-07: hủy đơn còn hóa đơn —");
  const d6 = await donMoi([{ sp: spPk, sl: "2", gia: "300000" }]);
  await voi(T, gd, (nc) => xacNhanDon(nc, d6.id, { khoId: khoA.id, ghiChu: null }));
  const hd6 = await voi(T, gd, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: d6.id })));
  const duAn6 = await voi(T, gd, (nc) => taoDuAn(nc, LuocDoTaoDuAn.parse({ khachHangId: khach.id, donHangId: d6.id, ten: "Lắp đặt bàn phím", nguoiPhuTrachId: gd })));
  try {
    await voi(T, gd, (nc) => huyDon(nc, d6.id, "Khách đổi ý"));
    dat("Hủy đơn còn hóa đơn bị chặn", false, "không ném lỗi");
  } catch (e) {
    dat("Hủy đơn còn hóa đơn bị chặn", e instanceof LoiNghiepVu && e.ma === "con-hoa-don", maLoi(e));
    dat("Thông báo nêu số hóa đơn và bảo hủy hóa đơn trước", e instanceof Error && e.message.includes(hd6.so) && e.message.includes("Hủy hóa đơn trước"), e instanceof Error ? e.message : "");
  }
  dat("Đơn vẫn giữ nguyên trạng thái và giữ chỗ", (await giuChoCuaDon(d6.id))[khoA.id] === 2);
  await voi(T, gd, (nc) => huyHoaDon(nc, hd6.id, "Lập nhầm"));
  const huy6 = await voi(T, gd, (nc) => huyDon(nc, d6.id, "Khách đổi ý"));
  dat("Hủy hóa đơn rồi thì hủy đơn được", huy6.trangThai === "CANCELLED");
  dat("Hủy đơn trả về cảnh báo dự án còn mở (không tự đóng)", huy6.canhBao.duAnDangMo.length === 1 && huy6.canhBao.duAnDangMo[0].id === duAn6.id, JSON.stringify(huy6.canhBao));
  dat("Dự án vẫn ở trạng thái cũ", (await chu.project.findUniqueOrThrow({ where: { id: duAn6.id }, select: { status: true } })).status !== "CANCELLED");

  // ------------------------------------------------------------------
  console.log("\n— TV-BH-08, TV-BH-09: báo giá → đơn → cơ hội —");
  const HOM_NAY = homNayVN();
  const coHoi = await voi(T, gd, (nc) =>
    taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: khach.id, tieuDe: "Trang bị bàn phím", giaTri: "3000000", hanhDongKeTiep: "Gửi báo giá", ngayHanhDong: HOM_NAY })),
  );
  const baoGiaMoi = (coHoiId?: string) =>
    voi(T, tp, (nc) =>
      taoBaoGia(nc, LuocDoTaoBaoGia.parse({
        khachHangId: khach.id, coHoiId,
        dong: [{ sanPhamId: spPk.id, ten: "Bàn phím", soLuong: "10", donGia: "300.000", vat: 10, giaVon: "200.000" }],
      })),
    );
  const guiDi = async (id: string) => {
    await voi(T, tp, (nc) => xinDuyet(nc, id, null));
    await voi(T, gd, (nc) => quyetDuyet(nc, id, { quyetDinh: "cho-duyet", ghiChu: null }));
    await voi(T, tp, (nc) => guiKhach(nc, id, { kenh: "email", ghiChu: null }));
  };
  const bg1 = await baoGiaMoi(coHoi.id);
  await guiDi(bg1.id);
  const chot2 = await haiCungLuc(
    () => voi(T, tp, (nc) => chotBaoGia(nc, bg1.id, { ketQua: "ACCEPTED", ghiChu: "Đồng ý" })),
    () => voi(T, tp, (nc) => chotBaoGia(nc, bg1.id, { ketQua: "ACCEPTED", ghiChu: "Đồng ý" })),
  );
  dat("TV-BH-01: chốt báo giá hai lần cùng lúc — đúng một lần thành công", chot2.soThanhCong === 1, `${chot2.soThanhCong}; ${chot2.loi.map(maLoi).join(",")}`);
  dat("Chỉ một sự kiện QUOTATION_ACCEPTED", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "QUOTATION_ACCEPTED", objectId: bg1.id } })) === 1);
  const ch1 = await chu.opportunity.findUniqueOrThrow({ where: { id: coHoi.id }, select: { stage: true, probability: true, closedAt: true } });
  dat("TV-BH-09: khách chấp nhận báo giá → cơ hội sang Thắng", ch1.stage === "WON" && ch1.probability === 100 && ch1.closedAt !== null, JSON.stringify(ch1));
  dat("Đúng một sự kiện OPPORTUNITY_WON", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "OPPORTUNITY_WON", objectId: coHoi.id } })) === 1);
  dat("Có dòng kiểm toán đổi giai đoạn cho cơ hội", (await chu.auditLog.count({ where: { tenantId: T, objectType: "opportunity", objectId: coHoi.id, action: "doi-giai-doan" } })) === 1);

  const taoDon2 = await haiCungLuc(
    () => voi(T, gd, (nc) => taoDonTuBaoGia(nc, bg1.id)),
    () => voi(T, gd, (nc) => taoDonTuBaoGia(nc, bg1.id)),
  );
  dat("TV-BH-01: tạo đơn từ báo giá hai lần cùng lúc — cả hai trả về, chỉ MỘT đơn", taoDon2.soThanhCong === 2 && taoDon2.ok[0].id === taoDon2.ok[1].id, JSON.stringify(taoDon2.ok));
  dat("Trong CSDL chỉ có một đơn cho báo giá", (await chu.salesOrder.count({ where: { tenantId: T, quotationId: bg1.id } })) === 1);
  const donBg1 = taoDon2.ok[0];

  await nemLoi("TV-BH-08: báo giá đã có đơn thì không tạo phiên bản mới", "nghiep-vu", () => voi(T, tp, (nc) => taoPhienBanMoi(nc, bg1.id)), "bao-gia-da-co-don");
  dat("Màn hình báo giá ẩn nút tạo phiên bản mới", (await voi(T, tp, (nc) => chiTietBaoGia(nc, bg1.id))).quyen.taoBanMoi === false);
  let chanCsdl = false;
  try {
    await chu.salesOrder.create({
      data: { tenantId: T, number: `DH-TRUNG-${DAU}`, customerId: khach.id, ownerId: gd, quotationId: bg1.id, status: "DRAFT" },
    });
  } catch (e) {
    chanCsdl = typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002";
  }
  dat("TV-BH-08: CSDL chặn đơn chưa hủy thứ hai cho cùng báo giá (chỉ mục riêng phần)", chanCsdl);

  await voi(T, gd, (nc) => huyDon(nc, donBg1.id, "Khách đổi cấu hình"));
  const pbMoi = await voi(T, tp, (nc) => taoPhienBanMoi(nc, bg1.id));
  dat("Hủy đơn rồi thì báo giá ra phiên bản mới được", pbMoi.phienBan === 2);
  const ch1b = await chu.opportunity.findUniqueOrThrow({ where: { id: coHoi.id }, select: { stage: true } });
  dat("Cơ hội đã Thắng thì giữ nguyên (không tự lật)", ch1b.stage === "WON");

  // Đường tạo đơn: cơ hội bị kéo lùi về Báo giá sau khi chốt → tạo đơn đưa lại về Thắng.
  const coHoi2 = await voi(T, gd, (nc) =>
    taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: khach.id, tieuDe: "Trang bị đợt 2", giaTri: "3000000", hanhDongKeTiep: "Gửi báo giá", ngayHanhDong: HOM_NAY })),
  );
  const bg2 = await baoGiaMoi(coHoi2.id);
  await guiDi(bg2.id);
  await voi(T, tp, (nc) => chotBaoGia(nc, bg2.id, { ketQua: "ACCEPTED", ghiChu: null }));
  await chu.opportunity.update({ where: { id: coHoi2.id }, data: { stage: "NEGOTIATION", closedAt: null, probability: 60, nextAction: "Chốt", nextActionDate: new Date() } });
  await voi(T, gd, (nc) => taoDonTuBaoGia(nc, bg2.id));
  dat("TV-BH-09: tạo đơn từ báo giá → cơ hội sang Thắng", (await chu.opportunity.findUniqueOrThrow({ where: { id: coHoi2.id }, select: { stage: true } })).stage === "WON");

  const coHoi3 = await voi(T, gd, (nc) =>
    taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: khach.id, tieuDe: "Trang bị đợt 3", giaTri: "3000000", hanhDongKeTiep: "Gửi báo giá", ngayHanhDong: HOM_NAY })),
  );
  const bg3 = await baoGiaMoi(coHoi3.id);
  await guiDi(bg3.id);
  await chu.opportunity.update({ where: { id: coHoi3.id }, data: { stage: "LOST", lostReason: "gia-cao", closedAt: new Date(), probability: 0 } });
  await voi(T, tp, (nc) => chotBaoGia(nc, bg3.id, { ketQua: "ACCEPTED", ghiChu: null }));
  dat("Cơ hội đã Thua thì không tự lật sang Thắng", (await chu.opportunity.findUniqueOrThrow({ where: { id: coHoi3.id }, select: { stage: true } })).stage === "LOST");

  // ------------------------------------------------------------------
  console.log("\n— TV-BH-01: chuyển kho — nhận hàng hai lần cùng lúc —");
  const ck = await voi(T, gd, (nc) =>
    taoChuyenKho(nc, LuocDoTaoChuyenKho.parse({ khoNguonId: khoA.id, khoDichId: khoB.id, lyDo: "Điều hàng thử", dong: [{ sanPhamId: spPk.id, soLuong: "5" }] })),
  );
  await voi(T, gd, (nc) => xuatChuyenKho(nc, ck.id, LuocDoXuatChuyenKho.parse({})));
  const tonBTruoc = (await soDu(khoB.id, spPk.id)).ton;
  const nhan2 = await haiCungLuc(
    () => voi(T, gd, (nc) => nhanChuyenKho(nc, ck.id, LuocDoNhanChuyenKho.parse({}))),
    () => voi(T, gd, (nc) => nhanChuyenKho(nc, ck.id, LuocDoNhanChuyenKho.parse({}))),
  );
  dat("Đúng một lần nhận thành công", nhan2.soThanhCong === 1, `${nhan2.soThanhCong}; ${nhan2.loi.map(maLoi).join(",")}`);
  dat("Kho B tăng đúng 5 (không nhập hai lần)", (await soDu(khoB.id, spPk.id)).ton === tonBTruoc + 5, `${tonBTruoc} → ${(await soDu(khoB.id, spPk.id)).ton}`);

  // ------------------------------------------------------------------
  console.log("\n— TV-BH-01: chuyển đổi lead hai lần cùng lúc —");
  const ld = await voi(T, gd, (nc) => taoLead(nc, LuocDoTaoLead.parse({ hoTen: "Lê Chuyển Đổi", congTy: `Cửa hàng Lead ${DAU}`, dienThoai: "0977 123 456" })));
  const khachTruoc = await chu.customer.count({ where: { tenantId: T } });
  const cd2 = await haiCungLuc(
    () => voi(T, gd, (nc) => chuyenDoiLead(nc, ld.id, LuocDoChuyenDoiLead.parse({ khachMoi: { ten: `Cửa hàng Lead ${DAU}` } }))),
    () => voi(T, gd, (nc) => chuyenDoiLead(nc, ld.id, LuocDoChuyenDoiLead.parse({ khachMoi: { ten: `Cửa hàng Lead ${DAU}` } }))),
  );
  dat("Đúng một lần chuyển đổi thành công", cd2.soThanhCong === 1, `${cd2.soThanhCong}; ${cd2.loi.map(maLoi).join(",")}`);
  dat("Lần còn lại bị chặn vì lead đã chuyển đổi", cd2.loi.length === 1 && maLoi(cd2.loi[0]) === "khong-dang-mo", cd2.loi.map(maLoi).join(","));
  dat("Chỉ sinh MỘT khách hàng", (await chu.customer.count({ where: { tenantId: T } })) === khachTruoc + 1);

  // ------------------------------------------------------------------
  console.log("\n— TV-BH-06: máy khách trả về bán lại được, bảo hành cũ kết thúc —");
  const d7 = await donMoi([{ sp: spMay, sl: "1", gia: "20000000" }]);
  await voi(T, gd, (nc) => xacNhanDon(nc, d7.id, { khoId: khoA.id, ghiChu: null }));
  const [dongD7] = await dongCua(d7.id);
  await voi(T, gd, (nc) => taoPhieuXuat(nc, d7.id, LuocDoTaoPhieuXuat.parse({ khoId: khoA.id, dong: [{ dongDonId: dongD7.id, soLuong: "1", serial: [S(2)] }] })));
  const sn2 = await chu.serialNumber.findFirstOrThrow({ where: { tenantId: T, serial: S(2) }, select: { id: true } });
  const bhCu = await chu.warranty.findFirstOrThrow({ where: { tenantId: T, serialNumberId: sn2.id }, select: { id: true, customerId: true, status: true } });
  dat("Nền: bảo hành của khách 1 đang hiệu lực", bhCu.customerId === khach.id && bhCu.status === "hieu-luc");

  const tr1 = await voi(T, gd, (nc) =>
    taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
      khachHangId: khach.id, donHangId: d7.id, khoId: khoA.id, lyDo: "Khách trả máy còn mới",
      dong: [{ dongDonId: dongD7.id, sanPhamId: spMay.id, ten: "Laptop", soLuong: "1", donGia: "20000000", serial: [S(2)] }],
    })),
  );
  const tonMayTruoc = (await soDu(khoA.id, spMay.id)).ton;
  const xnTra = await haiCungLuc(
    () => voi(T, gd, (nc) => xacNhanTraHangBan(nc, tr1.id, LuocDoXacNhanTraHang.parse({}))),
    () => voi(T, gd, (nc) => xacNhanTraHangBan(nc, tr1.id, LuocDoXacNhanTraHang.parse({}))),
  );
  dat("TV-BH-01: xác nhận phiếu trả hai lần cùng lúc — đúng một lần", xnTra.soThanhCong === 1, `${xnTra.soThanhCong}; ${xnTra.loi.map(maLoi).join(",")}`);
  dat("Tồn máy tăng đúng 1", (await soDu(khoA.id, spMay.id)).ton === tonMayTruoc + 1);
  const bhSau = await chu.warranty.findUniqueOrThrow({ where: { id: bhCu.id }, select: { status: true, serialNumberId: true, serial: true, cancelledAt: true, note: true } });
  dat("Bảo hành cũ chuyển 'huy', có thời điểm hủy", bhSau.status === "huy" && bhSau.cancelledAt !== null, JSON.stringify(bhSau));
  dat("Bảo hành cũ nhả sê-ri nhưng giữ số sê-ri dạng chữ", bhSau.serialNumberId === null && bhSau.serial === S(2));
  dat("Ghi chú bảo hành nêu số phiếu trả", (bhSau.note ?? "").includes(tr1.so));
  dat("Có sự kiện WARRANTY_CANCELLED cho bảo hành cũ", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "WARRANTY_CANCELLED", objectId: bhCu.id } })) === 1);

  const d8 = await donMoi([{ sp: spMay, sl: "1", gia: "19000000" }], khach2.id);
  await voi(T, gd, (nc) => xacNhanDon(nc, d8.id, { khoId: khoA.id, ghiChu: null }));
  const [dongD8] = await dongCua(d8.id);
  const xuat8 = await voi(T, gd, (nc) => taoPhieuXuat(nc, d8.id, LuocDoTaoPhieuXuat.parse({ khoId: khoA.id, dong: [{ dongDonId: dongD8.id, soLuong: "1", serial: [S(2)] }] })));
  dat("TV-BH-06: máy khách trả về bán lại cho khách khác được", xuat8.trangThaiDon === "DELIVERED");
  const bhMoi = await chu.warranty.findFirstOrThrow({ where: { tenantId: T, serialNumberId: sn2.id }, select: { customerId: true, status: true } });
  dat("Bảo hành mới đứng tên khách mới", bhMoi.customerId === khach2.id && bhMoi.status === "hieu-luc");

  let chanBhCsdl = false;
  try {
    await chu.$executeRawUnsafe(`UPDATE warranties SET status = 'huy', cancelled_at = now() WHERE serial_number_id = $1::uuid`, sn2.id);
  } catch {
    chanBhCsdl = true;
  }
  dat("CSDL chặn bảo hành 'huy' mà vẫn giữ sê-ri", chanBhCsdl);

  // Hủy bảo hành bằng tay cũng nhả sê-ri.
  const d9 = await donMoi([{ sp: spMay, sl: "1", gia: "20000000" }]);
  await voi(T, gd, (nc) => xacNhanDon(nc, d9.id, { khoId: khoA.id, ghiChu: null }));
  const [dongD9] = await dongCua(d9.id);
  await voi(T, gd, (nc) => taoPhieuXuat(nc, d9.id, LuocDoTaoPhieuXuat.parse({ khoId: khoA.id, dong: [{ dongDonId: dongD9.id, soLuong: "1", serial: [S(3)] }] })));
  const bh9 = await chu.warranty.findFirstOrThrow({ where: { tenantId: T, serial: S(3) }, select: { id: true } });
  await voi(T, gd, (nc) => huyBaoHanh(nc, bh9.id, "Giao nhầm, lập lại"));
  const bh9Sau = await chu.warranty.findUniqueOrThrow({ where: { id: bh9.id }, select: { status: true, serialNumberId: true, serial: true } });
  dat("Hủy bảo hành bằng tay nhả sê-ri, giữ số sê-ri dạng chữ", bh9Sau.status === "huy" && bh9Sau.serialNumberId === null && bh9Sau.serial === S(3), JSON.stringify(bh9Sau));

  // ------------------------------------------------------------------
  console.log("\n— TV-BH-10: phiếu trả hàng không được lấy hàng của khách / đơn khác —");
  const traDon = (khachId: string, donId: string, dong: Record<string, unknown>[]) =>
    voi(T, gd, (nc) => taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({ khachHangId: khachId, donHangId: donId, khoId: khoA.id, lyDo: "Thử toàn vẹn", dong })));
  await nemLoi("Đơn của khách khác bị chặn", "dinh-dang", () =>
    traDon(khach2.id, d1.id, [{ dongDonId: dongD1.id, ten: "Bàn phím", soLuong: "1", donGia: "300000" }]),
  );
  await nemLoi("Dòng của đơn khác (cùng khách) bị chặn", "dinh-dang", () =>
    traDon(khach.id, d7.id, [{ dongDonId: dongD1.id, ten: "Bàn phím", soLuong: "1", donGia: "300000" }]),
  );
  await nemLoi("Mặt hàng trả không khớp mặt hàng của dòng đơn bị chặn", "dinh-dang", () =>
    traDon(khach.id, d1.id, [{ dongDonId: dongD1.id, sanPhamId: spMay.id, ten: "Laptop", soLuong: "1", donGia: "300000" }]),
  );
  await nemLoi("Dòng trả lặp y hệt bị chặn", "dinh-dang", () =>
    traDon(khach.id, d1.id, [
      { dongDonId: dongD1.id, ten: "Bàn phím", soLuong: "1", donGia: "300000" },
      { dongDonId: dongD1.id, ten: "Bàn phím", soLuong: "1", donGia: "300000" },
    ]),
  );
  await nemLoi("Nhiều dòng cùng một dòng đơn: cộng lại vượt đã giao thì bị chặn", "nghiep-vu", () =>
    traDon(khach.id, d1.id, [
      { dongDonId: dongD1.id, ten: "Bàn phím", soLuong: "4", donGia: "300000" },
      { dongDonId: dongD1.id, ten: "Bàn phím", soLuong: "4", donGia: "300000", tinhTrang: "loi" },
    ]),
    "tra-qua-so-luong",
  );
  await nemLoi("Dòng trả không gắn dòng đơn bị chặn", "dinh-dang", () =>
    traDon(khach.id, d1.id, [{ sanPhamId: spPk.id, ten: "Bàn phím", soLuong: "1", donGia: "300000" }]),
  );

  // Sê-ri S(3) đã bán cho khách 1 (đơn d9) mà khai trên phiếu trả theo đơn của khách 2.
  const tr2 = await traDon(khach2.id, d8.id, [{ dongDonId: dongD8.id, sanPhamId: spMay.id, ten: "Laptop", soLuong: "1", donGia: "19000000", serial: [S(3)] }]);
  await nemLoi("Sê-ri bán cho khách khác không nhận trả được", "nghiep-vu", () =>
    voi(T, gd, (nc) => xacNhanTraHangBan(nc, tr2.id, LuocDoXacNhanTraHang.parse({}))),
    "serial-khach-khac",
  );

  const traSongSong = await haiCungLuc(
    () => traDon(khach.id, d1.id, [{ dongDonId: dongD1.id, ten: "Bàn phím", soLuong: "5", donGia: "300000" }]),
    () => traDon(khach.id, d1.id, [{ dongDonId: dongD1.id, ten: "Bàn phím", soLuong: "5", donGia: "300000" }]),
  );
  dat("TV-BH-01: hai phiếu trả cùng lúc vượt đã giao — đúng một phiếu lập được", traSongSong.soThanhCong === 1, `${traSongSong.soThanhCong}; ${traSongSong.loi.map(maLoi).join(",")}`);
  dat("Phiếu còn lại bị chặn vì trả quá số lượng", traSongSong.loi.length === 1 && maLoi(traSongSong.loi[0]) === "tra-qua-so-luong", traSongSong.loi.map(maLoi).join(","));

  // ------------------------------------------------------------------
  console.log("\n— TV-BH-01: chốt giảm trừ trả hàng đua với thu tiền trên cùng hóa đơn —");
  const d10 = await donMoi([{ sp: spPk, sl: "10", gia: "300000" }]);
  await voi(T, gd, (nc) => xacNhanDon(nc, d10.id, { khoId: khoA.id, ghiChu: null }));
  const [dongD10] = await dongCua(d10.id);
  await voi(T, gd, (nc) => taoPhieuXuat(nc, d10.id, LuocDoTaoPhieuXuat.parse({ khoId: khoA.id, dong: [{ dongDonId: dongD10.id, soLuong: "10" }] })));
  const hd10 = await voi(T, gd, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: d10.id })));
  await voi(T, gd, (nc) => phatHanhHoaDon(nc, hd10.id, LuocDoPhatHanh.parse({ hanThanhToan: HOM_NAY })));
  const tr10 = await traDon(khach.id, d10.id, [{ dongDonId: dongD10.id, ten: "Bàn phím", soLuong: "2", donGia: "300000" }]);
  await voi(T, gd, (nc) => xacNhanTraHangBan(nc, tr10.id, LuocDoXacNhanTraHang.parse({})));
  const tongHd10 = Number((await chu.invoice.findUniqueOrThrow({ where: { id: hd10.id }, select: { total: true } })).total);
  const giaTriTra = Number((await chu.salesReturn.findUniqueOrThrow({ where: { id: tr10.id }, select: { total: true } })).total);
  const duaTien = await haiCungLuc<unknown>(
    () => voi(T, gd, (nc) => thuTien(nc, LuocDoThuTien.parse({ khachHangId: khach.id, phuongThuc: "chuyen-khoan", soTien: String(tongHd10), phanBo: [{ hoaDonId: hd10.id, soTien: String(tongHd10) }] }))),
    () => voi(T, gd, (nc) => chotGiamTruBan(nc, tr10.id, LuocDoChotGiamTru.parse({ phanBo: [{ hoaDonId: hd10.id, soTien: String(giaTriTra) }] }))),
  );
  dat("Thu đủ tiền và chốt giảm trừ cùng lúc trên một hóa đơn — đúng một việc thành công", duaTien.soThanhCong === 1, `${duaTien.soThanhCong}; ${duaTien.loi.map(maLoi).join(",")}`);
  const daThu10 = await chu.paymentAllocation.aggregate({ where: { invoiceId: hd10.id, payment: { status: "hoat-dong" } }, _sum: { amount: true } });
  const daGiam10 = await chu.salesReturnAllocation.aggregate({ where: { invoiceId: hd10.id, salesReturn: { status: "SETTLED" } }, _sum: { amount: true } });
  const tongXoaNo = Number(daThu10._sum.amount ?? 0) + Number(daGiam10._sum.amount ?? 0);
  dat("Tiền thu + giảm trừ không vượt giá trị hóa đơn", tongXoaNo <= tongHd10, `${tongXoaNo} / ${tongHd10}`);

  // ------------------------------------------------------------------
  console.log("\n— TV-BH-11: phiếu hỗ trợ chỉ gắn thứ của chính khách —");
  const phieuCua = (d: Record<string, unknown>) =>
    voi(T, gd, (nc) => taoPhieu(nc, LuocDoTaoPhieu.parse({ loai: "su-co", tieuDe: "Máy không lên nguồn", ...d })));
  await nemLoi("Gắn đơn của khách khác bị chặn", "dinh-dang", () => phieuCua({ khachHangId: khach2.id, donHangId: d1.id }));
  await nemLoi("Gắn sê-ri máy bán cho khách khác bị chặn", "dinh-dang", () => phieuCua({ khachHangId: khach.id, serialId: sn2.id }));
  await nemLoi("Gắn dự án của khách khác bị chặn", "dinh-dang", () => phieuCua({ khachHangId: khach2.id, duAnId: duAn6.id }));
  const phieu = await phieuCua({ khachHangId: khach2.id, serialId: sn2.id, donHangId: d8.id });
  dat("Gắn máy và đơn của chính khách thì được", Boolean(phieu.id));
  await nemLoi("Sửa phiếu gắn dự án của khách khác bị chặn", "dinh-dang", () =>
    voi(T, gd, (nc) => suaPhieu(nc, phieu.id, LuocDoSuaPhieu.parse({ duAnId: duAn6.id }))),
  );

  // ------------------------------------------------------------------
  console.log("\n— TV-BH-12: mở lại phiếu đã xử lý xong —");
  await voi(T, gd, (nc) => doiTrangThaiPhieu(nc, phieu.id, { trangThai: "HOAN_THANH", cachXuLy: "Thay nguồn", ghiChu: null }));
  const p1 = await chu.supportTicket.findUniqueOrThrow({ where: { id: phieu.id }, select: { resolvedAt: true, firstResolvedAt: true } });
  dat("Xử lý xong: ghi mốc xong và mốc xong lần đầu", p1.resolvedAt !== null && p1.firstResolvedAt !== null);
  await voi(T, gd, (nc) => doiTrangThaiPhieu(nc, phieu.id, { trangThai: "DANG_XU_LY", cachXuLy: null, ghiChu: "Khách báo lỗi lại" }));
  const p2 = await chu.supportTicket.findUniqueOrThrow({ where: { id: phieu.id }, select: { status: true, resolvedAt: true, firstResolvedAt: true } });
  dat("Mở lại: xóa resolved_at để nhắc SLA chạy lại", p2.status === "DANG_XU_LY" && p2.resolvedAt === null, JSON.stringify(p2));
  dat("Mở lại: giữ mốc xong lần đầu", p2.firstResolvedAt?.getTime() === p1.firstResolvedAt?.getTime());
  dat("Diễn biến ghi loại 'mo-lai'", (await chu.supportTicketEvent.count({ where: { tenantId: T, ticketId: phieu.id, type: "mo-lai" } })) === 1);
  dat("Có sự kiện SERVICE_TICKET_REOPENED", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "SERVICE_TICKET_REOPENED", objectId: phieu.id } })) === 1);
  await voi(T, gd, (nc) => doiTrangThaiPhieu(nc, phieu.id, { trangThai: "HOAN_THANH", cachXuLy: "Thay bo mạch", ghiChu: null }));
  const p3 = await chu.supportTicket.findUniqueOrThrow({ where: { id: phieu.id }, select: { resolvedAt: true, firstResolvedAt: true } });
  dat("Xong lần hai: mốc xong mới, mốc lần đầu không đổi",
    p3.resolvedAt !== null && p3.resolvedAt.getTime() >= (p1.resolvedAt?.getTime() ?? 0) && p3.firstResolvedAt?.getTime() === p1.firstResolvedAt?.getTime());

  const ds2 = await voi(T, gd, (nc) => doiSoatKho(nc));
  dat("Đối soát kho cuối bài: không lệch", ds2.lech.length === 0, JSON.stringify(ds2.lech));

  await chu.$disconnect();
  ketLuan("Toàn vẹn chuỗi bán hàng – kho");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
