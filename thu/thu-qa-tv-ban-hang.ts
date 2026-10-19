import { voiTenant } from "../src/lib/db";
import { khoaChungTu } from "../src/lib/khoa-chung-tu";
import { anhXaLoi, taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { taoKhachHang } from "../src/modules/khach-hang/service";
import { LuocDoTaoKhachHang } from "../src/modules/khach-hang/luoc-do";
import { taoSanPham } from "../src/modules/san-pham/service";
import { LuocDoTaoSanPham } from "../src/modules/san-pham/luoc-do";
import { nhapKho, taoKho } from "../src/modules/kho/service";
import { LuocDoNhapKho, LuocDoTaoKho } from "../src/modules/kho/luoc-do";
import { chiTietDonHang, huyDon, taoDonHang, taoDonTuBaoGia, taoPhieuXuat, xacNhanDon } from "../src/modules/don-hang/service";
import { LuocDoTaoDon, LuocDoTaoPhieuXuat } from "../src/modules/don-hang/luoc-do";
import { chotBaoGia, guiKhach, quyetDuyet, taoBaoGia, taoPhienBanMoi, xinDuyet } from "../src/modules/bao-gia/service";
import { LuocDoTaoBaoGia } from "../src/modules/bao-gia/luoc-do";
import { taoCoHoi } from "../src/modules/co-hoi/service";
import { LuocDoTaoCoHoi } from "../src/modules/co-hoi/luoc-do";
import { huyHoaDon, phatHanhHoaDon, taoHoaDon } from "../src/modules/tai-chinh/service";
import { LuocDoPhatHanh, LuocDoTaoHoaDon } from "../src/modules/tai-chinh/luoc-do";
import { huyBaoHanh, suaBaoHanh } from "../src/modules/bao-hanh/service";
import {
  chotGiamTruBan, taoTraHangBan, taoTraHangMua, xacNhanTraHangBan, xacNhanTraHangMua,
} from "../src/modules/tra-hang/service";
import { LuocDoChotGiamTru, LuocDoTaoTraHangBan, LuocDoTaoTraHangMua, LuocDoXacNhanTraHang } from "../src/modules/tra-hang/luoc-do";
import { huyChuyenKho, nhanChuyenKho, taoChuyenKho, xuatChuyenKho } from "../src/modules/chuyen-kho/service";
import { LuocDoNhanChuyenKho, LuocDoTaoChuyenKho, LuocDoXuatChuyenKho } from "../src/modules/chuyen-kho/luoc-do";
import { chuyenDoiLead, taoLead } from "../src/modules/lead/service";
import { LuocDoChuyenDoiLead, LuocDoTaoLead } from "../src/modules/lead/luoc-do";
import { doiTrangThaiPhieu, taoPhieu } from "../src/modules/ho-tro/service";
import { LuocDoTaoPhieu } from "../src/modules/ho-tro/luoc-do";
import { homNayVN } from "../src/modules/crm/chung";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * KIỂM THỬ ĐỐI KHÁNG ĐỘC LẬP (QA) — gói 0.16.1 "Toàn vẹn bán hàng–kho" (BUSINESS_RULES.md mục 25).
 *
 * Khác `thu-toan-ven-ban-hang.ts` (bài của người làm gói): ở đây đua 5 yêu cầu cùng lúc, đua chéo
 * giữa các chứng từ khác nhau (xuất ↔ hủy, nhận trả ↔ xuất cùng sê-ri, trả NCC ↔ xuất, chốt
 * giảm trừ ↔ hủy hóa đơn…), dò khóa chéo (deadlock) do thứ tự khóa dòng số dư, đối soát sổ cái
 * sau MỖI kịch bản, và thử cách ly doanh nghiệp (RLS) trên mọi hàm có `khoaChungTu`.
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
      return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-qa-tv-ban-hang"));
    },
    { timeoutMs: 30_000 },
  );
}

/** Chạy n việc CÙNG LÚC trên n giao dịch riêng. */
async function cungLuc<T>(viec: (() => Promise<T>)[]) {
  const kq = await Promise.allSettled(viec.map((f) => f()));
  const ok = kq.filter((x): x is PromiseFulfilledResult<Awaited<T>> => x.status === "fulfilled").map((x) => x.value);
  const loi = kq.filter((x): x is PromiseRejectedResult => x.status === "rejected").map((x) => x.reason as unknown);
  return { soThanhCong: ok.length, ok, loi };
}
const lap = <T>(n: number, f: () => Promise<T>) => Array.from({ length: n }, () => f);
const maLoi = (e: unknown) => (e instanceof LoiNghiepVu ? (e.ma ?? e.name) : e instanceof Error ? `${e.name}: ${e.message.slice(0, 160)}` : String(e));
/** Lỗi nghiệp vụ "sạch" (không phải lỗi CSDL thô / khóa chéo / 500). */
const loiSach = (ds: unknown[], ma?: string[]) => ds.every((e) => e instanceof LoiNghiepVu && (!ma || ma.includes(e.ma ?? "")));

async function nemLoi(ten: string, khoi: () => Promise<unknown>, kiem: (e: unknown) => boolean) {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    dat(ten, kiem(e), maLoi(e));
  }
}

async function main() {
  console.log("=== QA độc lập: toàn vẹn chuỗi bán hàng – kho (0.16.1) ===\n");
  const tenant = await seedNenMong(chu, `thu-qa-tvbh-${DAU}`, "Doanh nghiệp QA toàn vẹn bán hàng");
  const tenant2 = await seedNenMong(chu, `thu-qa-tvbh2-${DAU}`, "Doanh nghiệp QA thứ hai");
  const T = tenant.id;
  const T2 = tenant2.id;
  const nguoi = async (tid: string, ten: string, vai: string) => {
    const roleId = (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: tid, code: vai } } })).id;
    return (
      await chu.user.create({
        data: {
          tenantId: tid, email: `${ten}.${DAU}@qa.test`, passwordHash: "x", fullName: ten,
          userRoles: { create: { tenantId: tid, roleId } }, staffProfile: { create: { tenantId: tid } },
        },
      })
    ).id;
  };
  const gd = await nguoi(T, "qa-giam-doc", "ceo");
  const tp = await nguoi(T, "qa-truong-phong", "sales-manager");
  const gd2 = await nguoi(T2, "qa-giam-doc-2", "ceo");

  const khach = await voi(T, gd, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Công ty Alpha Thử ${DAU}`, dienThoai: "0912 345 671", diaChi: "1 Đường QA" })));
  const khach2 = await voi(T, gd, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `Siêu thị Bravo Kiểm ${DAU}`, dienThoai: "0988 765 432" })));
  await chu.customer.update({ where: { id: khach.id }, data: { ownerId: tp } });
  const khoA = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "qa-a", ten: "Kho QA A", macDinh: true })));
  const khoB = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "qa-b", ten: "Kho QA B" })));
  const khoC = await voi(T, gd, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "qa-c", ten: "Kho QA C" })));
  const sp = (sku: string, ten: string, them: Record<string, unknown> = {}) =>
    voi(T, gd, (nc) => taoSanPham(nc, LuocDoTaoSanPham.parse({ sku: `${sku}-${DAU}`, ten, giaBan: "100000", giaVon: "60000", donViTinh: "cai", ...them })));
  const spP = await sp("QA-P", "Chuột QA");
  const spQ = await sp("QA-Q", "Bàn phím QA");
  const spBh = await sp("QA-BH", "Bộ lưu điện QA (bảo hành, không sê-ri)", { baoHanhThang: 12 });
  const spMay = await sp("QA-MAY", "Laptop QA", { batBuocSerial: true, baoHanhThang: 12, giaBan: "20000000", giaVon: "15000000" });
  const S = (n: number) => `QA-${DAU}-${n}`;
  await voi(T, gd, (nc) =>
    nhapKho(nc, LuocDoNhapKho.parse({
      khoId: khoA.id, lyDo: "Nhập đầu kỳ QA",
      dong: [
        { sanPhamId: spP.id, soLuong: "1000" },
        { sanPhamId: spQ.id, soLuong: "1000" },
        { sanPhamId: spBh.id, soLuong: "50" },
        { sanPhamId: spMay.id, soLuong: "20", serial: Array.from({ length: 20 }, (_, i) => S(i + 1)) },
      ],
    })),
  );
  for (const k of [khoB, khoC]) {
    await voi(T, gd, (nc) => nhapKho(nc, LuocDoNhapKho.parse({ khoId: k.id, lyDo: "Nhập đầu kỳ QA", dong: [{ sanPhamId: spP.id, soLuong: "500" }, { sanPhamId: spQ.id, soLuong: "500" }] })));
  }
  await voi(T, gd, (nc) => nhapKho(nc, LuocDoNhapKho.parse({ khoId: khoB.id, lyDo: "Nhập máy kho B", dong: [{ sanPhamId: spMay.id, soLuong: "2", serial: [S(21), S(22)] }] })));
  const ncc = await chu.supplier.create({ data: { tenantId: T, code: `QA-NCC-${DAU}`.slice(0, 30), name: "NCC QA", nameNormalized: "ncc qa" } });

  // ---------------------------------------------------------------- tiện ích
  type Dong = { sp: { id: string; ten?: string }; sl: string; gia?: string };
  const donMoi = (dong: Dong[], khachId = khach.id) =>
    voi(T, gd, (nc) => taoDonHang(nc, LuocDoTaoDon.parse({
      khachHangId: khachId,
      dong: dong.map((x) => ({ sanPhamId: x.sp.id, ten: x.sp.ten ?? "Hàng QA", soLuong: x.sl, donGia: x.gia ?? "100000", giaVon: "0" })),
    })));
  const dongCua = async (donId: string) => (await voi(T, gd, (nc) => chiTietDonHang(nc, donId))).don.dong;
  const xacNhan = (donId: string, khoId = khoA.id) => voi(T, gd, (nc) => xacNhanDon(nc, donId, { khoId, ghiChu: null }));
  const xuat = (donId: string, khoId: string, dong: { dongDonId: string; soLuong: string; serial?: string[] }[]) =>
    voi(T, gd, (nc) => taoPhieuXuat(nc, donId, LuocDoTaoPhieuXuat.parse({ khoId, dong })));
  const giuChoCuaDon = async (donId: string) => {
    const g = await chu.inventoryTransaction.groupBy({ by: ["warehouseId"], where: { tenantId: T, refType: "don-hang", refId: donId }, _sum: { reservedDelta: true } });
    return Object.fromEntries(g.map((x) => [x.warehouseId, Math.round(Number(x._sum.reservedDelta ?? 0) * 1000) / 1000]));
  };
  const trangThaiDon = async (id: string) => (await chu.salesOrder.findUniqueOrThrow({ where: { id }, select: { status: true } })).status;

  /** Đối soát toàn bộ doanh nghiệp thử sau mỗi kịch bản. Trả danh sách vi phạm (rỗng = khớp). */
  async function doiSoat(): Promise<string[]> {
    const viPham: string[] = [];
    const q = <R,>(sql: string) => chu.$queryRawUnsafe<R[]>(sql, T);
    const lechSo = await q<{ w: string; p: string }>(
      `SELECT b.warehouse_id::text w, b.product_id::text p FROM inventory_balances b
        LEFT JOIN (SELECT warehouse_id, product_id, sum(on_hand_delta) oh, sum(reserved_delta) rs FROM inventory_transactions
                    WHERE tenant_id = $1::uuid GROUP BY 1, 2) t USING (warehouse_id, product_id)
        WHERE b.tenant_id = $1::uuid AND (b.on_hand <> COALESCE(t.oh, 0) OR b.reserved <> COALESCE(t.rs, 0))`,
    );
    if (lechSo.length) viPham.push(`số dư lệch sổ cái: ${lechSo.length}`);
    const am = await q<{ n: number }>(`SELECT count(*)::int n FROM inventory_balances WHERE tenant_id = $1::uuid AND (reserved < 0 OR on_hand < 0 OR reserved > on_hand)`);
    if (am[0].n) viPham.push(`số dư âm / giữ chỗ vượt tồn: ${am[0].n}`);
    const giuAm = await q<{ n: number }>(
      `SELECT count(*)::int n FROM (SELECT ref_id, warehouse_id, product_id, sum(reserved_delta) s FROM inventory_transactions
         WHERE tenant_id = $1::uuid AND ref_type = 'don-hang' GROUP BY 1, 2, 3 HAVING sum(reserved_delta) < 0) x`,
    );
    if (giuAm[0].n) viPham.push(`giữ chỗ của đơn âm: ${giuAm[0].n}`);
    const ket = await q<{ so: string }>(
      `SELECT o.number so FROM sales_orders o JOIN inventory_transactions t ON t.ref_type = 'don-hang' AND t.ref_id = o.id
        WHERE o.tenant_id = $1::uuid AND o.status IN ('DELIVERED', 'CANCELLED')
        GROUP BY o.id, o.number, t.warehouse_id, t.product_id HAVING sum(t.reserved_delta) <> 0`,
    );
    if (ket.length) viPham.push(`đơn đã đóng còn giữ chỗ: ${ket.map((x) => x.so).join(",")}`);
    const giao = await q<{ n: number }>(
      `SELECT count(*)::int n FROM sales_order_items i
        WHERE i.tenant_id = $1::uuid AND (i.delivered_qty > i.quantity OR i.delivered_qty <> COALESCE((SELECT sum(d.quantity) FROM delivery_items d WHERE d.order_item_id = i.id), 0))`,
    );
    if (giao[0].n) viPham.push(`số đã giao lệch phiếu xuất: ${giao[0].n}`);
    const sr = await q<{ n: number }>(
      `SELECT count(*)::int n FROM serial_numbers WHERE tenant_id = $1::uuid
        AND ((status = 'trong-kho' AND warehouse_id IS NULL) OR (status <> 'trong-kho' AND warehouse_id IS NOT NULL))`,
    );
    if (sr[0].n) viPham.push(`sê-ri sai kho theo trạng thái: ${sr[0].n}`);
    const bhKho = await q<{ s: string }>(
      `SELECT s.serial s FROM warranties w JOIN serial_numbers s ON s.id = w.serial_number_id
        WHERE w.tenant_id = $1::uuid AND w.status = 'hieu-luc' AND s.status <> 'da-ban'`,
    );
    if (bhKho.length) viPham.push(`bảo hành hiệu lực trên máy không ở tay khách: ${bhKho.map((x) => x.s).join(",")}`);
    const tonSerial = await q<{ n: number }>(
      `SELECT count(*)::int n FROM inventory_balances b JOIN products p ON p.id = b.product_id AND p.requires_serial
        WHERE b.tenant_id = $1::uuid AND b.on_hand <> (SELECT count(*) FROM serial_numbers s WHERE s.product_id = b.product_id AND s.warehouse_id = b.warehouse_id AND s.status = 'trong-kho')`,
    );
    if (tonSerial[0].n) viPham.push(`tồn máy ≠ số sê-ri trong kho: ${tonSerial[0].n}`);
    const bgHaiDon = await q<{ n: number }>(
      `SELECT count(*)::int n FROM (SELECT quotation_id FROM sales_orders WHERE tenant_id = $1::uuid AND quotation_id IS NOT NULL AND status <> 'CANCELLED' GROUP BY 1 HAVING count(*) > 1) x`,
    );
    if (bgHaiDon[0].n) viPham.push(`báo giá có hơn một đơn: ${bgHaiDon[0].n}`);
    return viPham;
  }
  const kiemSo = async (ten: string) => {
    const v = await doiSoat();
    dat(`Đối soát sau "${ten}"`, v.length === 0, v.join(" | "));
  };

  // ==================================================================
  console.log("— 1. Xác nhận đơn: 5 yêu cầu cùng lúc —");
  const d1 = await donMoi([{ sp: spP, sl: "10" }, { sp: spQ, sl: "4" }]);
  const xn5 = await cungLuc(lap(5, () => xacNhan(d1.id)));
  dat("Đúng 1/5 thành công, 4 bị chặn sạch (sai-trang-thai)", xn5.soThanhCong === 1 && loiSach(xn5.loi, ["sai-trang-thai"]), `${xn5.soThanhCong}; ${xn5.loi.map(maLoi).join(",")}`);
  dat("Giữ chỗ đúng một lần", JSON.stringify(await giuChoCuaDon(d1.id)) === JSON.stringify({ [khoA.id]: 14 }), JSON.stringify(await giuChoCuaDon(d1.id)));
  await kiemSo("xác nhận ×5");

  console.log("\n— 2. Xuất hàng: 5 phiếu cùng lúc, mỗi phiếu đủ cả đơn —");
  const [l1p, l1q] = await dongCua(d1.id);
  const x5 = await cungLuc(lap(5, () => xuat(d1.id, khoA.id, [{ dongDonId: l1p.id, soLuong: "10" }, { dongDonId: l1q.id, soLuong: "4" }])));
  dat("Đúng 1/5 phiếu xuất thành công", x5.soThanhCong === 1 && loiSach(x5.loi, ["sai-trang-thai", "xuat-qua-so-luong"]), `${x5.soThanhCong}; ${x5.loi.map(maLoi).join(",")}`);
  dat("Đơn DELIVERED, một phiếu xuất", (await trangThaiDon(d1.id)) === "DELIVERED" && (await chu.delivery.count({ where: { orderId: d1.id } })) === 1);
  await kiemSo("xuất ×5");

  console.log("\n— 3. Xuất từng phần: 5 phiếu × 2 cái cùng lúc cho dòng 10 cái —");
  const d2 = await donMoi([{ sp: spP, sl: "10" }]);
  await xacNhan(d2.id);
  const [l2] = await dongCua(d2.id);
  const xp5 = await cungLuc(lap(5, () => xuat(d2.id, khoA.id, [{ dongDonId: l2.id, soLuong: "2" }])));
  const l2Sau = (await dongCua(d2.id))[0];
  dat("Cả 5 phiếu đều qua (xếp hàng, không ghi đè)", xp5.soThanhCong === 5, xp5.loi.map(maLoi).join(","));
  dat("Đã giao = 10, đơn DELIVERED, không còn giữ chỗ", l2Sau.daGiao === "10" && (await trangThaiDon(d2.id)) === "DELIVERED" && Object.values(await giuChoCuaDon(d2.id)).every((v) => v === 0), `${l2Sau.daGiao}; ${JSON.stringify(await giuChoCuaDon(d2.id))}`);
  await kiemSo("xuất từng phần ×5");

  console.log("\n— 4. Xuất từng phần ĐUA hủy đơn —");
  for (let vong = 0; vong < 3; vong++) {
    const d = await donMoi([{ sp: spP, sl: "10" }]);
    await xacNhan(d.id);
    const [l] = await dongCua(d.id);
    const kq = await cungLuc<unknown>([
      () => xuat(d.id, khoB.id, [{ dongDonId: l.id, soLuong: "3" }]),
      () => voi(T, gd, (nc) => huyDon(nc, d.id, "Khách hủy")),
    ]);
    const st = await trangThaiDon(d.id);
    dat(`Vòng ${vong + 1}: đơn kết thúc CANCELLED, lỗi (nếu có) là lỗi nghiệp vụ`, st === "CANCELLED" && loiSach(kq.loi, ["sai-trang-thai"]), `${st}; ${kq.loi.map(maLoi).join(",")}`);
    const g = await giuChoCuaDon(d.id);
    dat(`Vòng ${vong + 1}: hủy xong không còn giữ chỗ ở kho nào`, Object.values(g).every((v) => v === 0), JSON.stringify(g));
  }
  await kiemSo("xuất đua hủy");

  console.log("\n— 5. Khóa chéo dòng số dư (thứ tự dòng hàng ngược nhau) —");
  let tho = 0;
  const loiTho: string[] = [];
  for (let vong = 0; vong < 8; vong++) {
    const a = await donMoi([{ sp: spP, sl: "1" }, { sp: spQ, sl: "1" }]);
    const b = await donMoi([{ sp: spQ, sl: "1" }, { sp: spP, sl: "1" }]);
    const kq = await cungLuc<unknown>([() => xacNhan(a.id), () => xacNhan(b.id)]);
    for (const e of kq.loi) if (!(e instanceof LoiNghiepVu)) { tho++; loiTho.push(maLoi(e)); }
    const c = await donMoi([{ sp: spP, sl: "1" }, { sp: spQ, sl: "1" }]);
    await xacNhan(c.id);
    const [cp, cq] = await dongCua(c.id);
    const e = await donMoi([{ sp: spQ, sl: "1" }, { sp: spP, sl: "1" }]);
    const kq2 = await cungLuc<unknown>([
      () => xuat(c.id, khoA.id, [{ dongDonId: cq.id, soLuong: "1" }, { dongDonId: cp.id, soLuong: "1" }]),
      () => xacNhan(e.id),
    ]);
    for (const x of kq2.loi) if (!(x instanceof LoiNghiepVu)) { tho++; loiTho.push(maLoi(x)); }
  }
  dat("Hai đơn có dòng hàng ngược thứ tự chạy cùng lúc: không khóa chéo / lỗi CSDL thô", tho === 0, `${tho} lỗi thô: ${[...new Set(loiTho)].join(" | ")}`);
  await kiemSo("dò khóa chéo");

  console.log("\n— 5b. Lỗi khóa chéo / tuần tự hóa của CSDL → 409 sạch, không 500 —");
  const loiDeadlock = await (async () => {
    const r1 = await chu.salesOrder.findFirstOrThrow({ where: { tenantId: T }, select: { id: true } });
    const r2 = await chu.salesOrder.findFirstOrThrow({ where: { tenantId: T, id: { not: r1.id } }, select: { id: true } });
    const kq = await cungLuc<unknown>([
      () => voi(T, gd, async (nc) => { await khoaChungTu(nc.tx, "sales_orders", r1.id); await new Promise((r) => setTimeout(r, 300)); await khoaChungTu(nc.tx, "sales_orders", r2.id); }),
      () => voi(T, gd, async (nc) => { await khoaChungTu(nc.tx, "sales_orders", r2.id); await new Promise((r) => setTimeout(r, 300)); await khoaChungTu(nc.tx, "sales_orders", r1.id); }),
    ]);
    return kq.loi[0];
  })();
  dat("Dựng được một lỗi khóa chéo thật từ PostgreSQL", loiDeadlock !== undefined);
  const phanHoi = anhXaLoi(loiDeadlock);
  const than = (await phanHoi.json()) as { thongBao?: string; ma?: string };
  dat("anhXaLoi(lỗi khóa chéo) → 409 kèm câu tiếng Việt, không 500", phanHoi.status === 409 && /thử lại/i.test(than.thongBao ?? ""), `${phanHoi.status} ${JSON.stringify(than)}`);

  // ==================================================================
  console.log("\n— 6. Giữ chỗ: giao từng phần từ 3 kho —");
  const d6 = await donMoi([{ sp: spP, sl: "10" }]);
  await xacNhan(d6.id, khoA.id);
  const [l6] = await dongCua(d6.id);
  await xuat(d6.id, khoB.id, [{ dongDonId: l6.id, soLuong: "3" }]);
  dat("Giao 3 từ B → A còn giữ 7", (await giuChoCuaDon(d6.id))[khoA.id] === 7, JSON.stringify(await giuChoCuaDon(d6.id)));
  await xuat(d6.id, khoC.id, [{ dongDonId: l6.id, soLuong: "3" }]);
  dat("Giao 3 từ C → A còn giữ 4", (await giuChoCuaDon(d6.id))[khoA.id] === 4, JSON.stringify(await giuChoCuaDon(d6.id)));
  await xuat(d6.id, khoA.id, [{ dongDonId: l6.id, soLuong: "4" }]);
  dat("Giao 4 từ A → đơn DELIVERED, giữ chỗ 0 ở mọi kho", (await trangThaiDon(d6.id)) === "DELIVERED" && Object.values(await giuChoCuaDon(d6.id)).every((v) => v === 0), JSON.stringify(await giuChoCuaDon(d6.id)));
  const d6b = await donMoi([{ sp: spP, sl: "6" }, { sp: spP, sl: "4" }]);
  await xacNhan(d6b.id, khoA.id);
  const [l6a, l6b] = await dongCua(d6b.id);
  await xuat(d6b.id, khoB.id, [{ dongDonId: l6a.id, soLuong: "2" }, { dongDonId: l6b.id, soLuong: "1" }]);
  dat("Hai dòng cùng mặt hàng giao từ B → A nhả đúng 3 (còn 7)", (await giuChoCuaDon(d6b.id))[khoA.id] === 7, JSON.stringify(await giuChoCuaDon(d6b.id)));
  await voi(T, gd, (nc) => huyDon(nc, d6b.id, "Khách đổi ý giữa chừng"));
  dat("Hủy đơn giao dở → nhả hết phần còn giữ", Object.values(await giuChoCuaDon(d6b.id)).every((v) => v === 0), JSON.stringify(await giuChoCuaDon(d6b.id)));
  await kiemSo("giao từ 3 kho");

  // ==================================================================
  console.log("\n— 7. Báo giá → đơn → cơ hội —");
  const HOM_NAY = homNayVN();
  const coHoiMoi = (tieuDe: string) =>
    voi(T, gd, (nc) => taoCoHoi(nc, LuocDoTaoCoHoi.parse({ khachHangId: khach.id, tieuDe, giaTri: "1000000", hanhDongKeTiep: "Gửi báo giá", ngayHanhDong: HOM_NAY })));
  const baoGiaMoi = (coHoiId?: string) =>
    voi(T, tp, (nc) => taoBaoGia(nc, LuocDoTaoBaoGia.parse({
      khachHangId: khach.id, coHoiId,
      dong: [{ sanPhamId: spP.id, ten: "Chuột QA", soLuong: "5", donGia: "100.000", vat: 10, giaVon: "60.000" }],
    })));
  const guiDi = async (id: string) => {
    await voi(T, tp, (nc) => xinDuyet(nc, id, null));
    await voi(T, gd, (nc) => quyetDuyet(nc, id, { quyetDinh: "cho-duyet", ghiChu: null }));
    await voi(T, tp, (nc) => guiKhach(nc, id, { kenh: "email", ghiChu: null }));
  };
  const chot = (id: string) => voi(T, tp, (nc) => chotBaoGia(nc, id, { ketQua: "ACCEPTED", ghiChu: null }));

  const ch7 = await coHoiMoi("QA đợt 1");
  const bg7 = await baoGiaMoi(ch7.id);
  await guiDi(bg7.id);
  const c5 = await cungLuc<unknown>(lap(5, () => chot(bg7.id)));
  dat("Chốt báo giá ×5: đúng 1 thành công", c5.soThanhCong === 1 && loiSach(c5.loi), `${c5.soThanhCong}; ${c5.loi.map(maLoi).join(",")}`);
  dat("Đúng một OPPORTUNITY_WON", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "OPPORTUNITY_WON", objectId: ch7.id } })) === 1);
  const t5 = await cungLuc(lap(5, () => voi(T, gd, (nc) => taoDonTuBaoGia(nc, bg7.id))));
  dat("Tạo đơn từ báo giá ×5: cả 5 trả về CÙNG một đơn", t5.soThanhCong === 5 && new Set(t5.ok.map((x) => x.id)).size === 1, t5.loi.map(maLoi).join(","));
  dat("Đúng một ORDER_CREATED cho báo giá", (await chu.salesOrder.count({ where: { quotationId: bg7.id } })) === 1);

  // Hủy đơn đua ra phiên bản mới — không bao giờ có phiên bản mới mà đơn vẫn sống.
  const donBg7 = t5.ok[0].id;
  const h7 = await cungLuc<unknown>([
    () => voi(T, gd, (nc) => huyDon(nc, donBg7, "Khách đổi cấu hình")),
    () => voi(T, tp, (nc) => taoPhienBanMoi(nc, bg7.id)),
  ]);
  const pbSau = await chu.quotationVersion.count({ where: { quotationId: bg7.id } });
  dat("Hủy đơn đua tạo phiên bản: hủy luôn thành công; phiên bản mới chỉ có khi đơn đã hủy", (await trangThaiDon(donBg7)) === "CANCELLED" && loiSach(h7.loi, ["bao-gia-da-co-don"]), `${pbSau} pb; ${h7.loi.map(maLoi).join(",")}`);

  // Báo giá đã chấp nhận: tạo đơn ĐUA ra phiên bản mới → không được cả hai.
  const ch7b = await coHoiMoi("QA đợt 2");
  const bg7b = await baoGiaMoi(ch7b.id);
  await guiDi(bg7b.id);
  await chot(bg7b.id);
  const r7 = await cungLuc<unknown>([
    () => voi(T, gd, (nc) => taoDonTuBaoGia(nc, bg7b.id)),
    () => voi(T, tp, (nc) => taoPhienBanMoi(nc, bg7b.id)),
  ]);
  const coDon = (await chu.salesOrder.count({ where: { quotationId: bg7b.id, status: { not: "CANCELLED" } } })) === 1;
  const coPb2 = (await chu.quotationVersion.count({ where: { quotationId: bg7b.id } })) === 2;
  dat("Tạo đơn đua phiên bản mới: đúng một bên thắng (không vừa có đơn vừa có bản nháp mới)", r7.soThanhCong === 1 && coDon !== coPb2 && loiSach(r7.loi), `đơn=${coDon} pb2=${coPb2}; ${r7.loi.map(maLoi).join(",")}`);

  // Cơ hội đã Thua → tạo đơn từ báo giá không lật thành Thắng.
  const ch7c = await coHoiMoi("QA đợt 3");
  const bg7c = await baoGiaMoi(ch7c.id);
  await guiDi(bg7c.id);
  await chot(bg7c.id);
  await chu.opportunity.update({ where: { id: ch7c.id }, data: { stage: "LOST", lostReason: "gia-cao", closedAt: new Date(), probability: 0 } });
  await voi(T, gd, (nc) => taoDonTuBaoGia(nc, bg7c.id));
  dat("Cơ hội Thua giữ nguyên khi tạo đơn từ báo giá", (await chu.opportunity.findUniqueOrThrow({ where: { id: ch7c.id }, select: { stage: true } })).stage === "LOST");
  await kiemSo("báo giá → đơn");

  // ==================================================================
  console.log("\n— 8. Chuyển kho ×5 —");
  const ck = await voi(T, gd, (nc) => taoChuyenKho(nc, LuocDoTaoChuyenKho.parse({ khoNguonId: khoA.id, khoDichId: khoC.id, lyDo: "QA điều hàng", dong: [{ sanPhamId: spQ.id, soLuong: "7" }, { sanPhamId: spMay.id, soLuong: "1", serial: [S(10)] }] })));
  const ckX = await cungLuc<unknown>([...lap(4, () => voi(T, gd, (nc) => xuatChuyenKho(nc, ck.id, LuocDoXuatChuyenKho.parse({})))), () => voi(T, gd, (nc) => huyChuyenKho(nc, ck.id, "QA hủy"))]);
  const ckSt = (await chu.stockTransfer.findUniqueOrThrow({ where: { id: ck.id }, select: { status: true } })).status;
  dat("Xuất ×4 đua hủy: đúng một việc thành công", ckX.soThanhCong === 1 && loiSach(ckX.loi), `${ckSt}; ${ckX.loi.map(maLoi).join(",")}`);
  if (ckSt !== "CANCELLED") {
    const ckN = await cungLuc<unknown>(lap(5, () => voi(T, gd, (nc) => nhanChuyenKho(nc, ck.id, LuocDoNhanChuyenKho.parse({})))));
    dat("Nhận ×5: đúng 1 thành công", ckN.soThanhCong === 1 && loiSach(ckN.loi, ["sai-trang-thai"]), ckN.loi.map(maLoi).join(","));
  }
  await kiemSo("chuyển kho");

  console.log("\n— 9. Chuyển đổi lead ×5 —");
  const ld = await voi(T, gd, (nc) => taoLead(nc, LuocDoTaoLead.parse({ hoTen: "Lê QA", congTy: `Cửa hàng QA ${DAU}`, dienThoai: "0977 555 001" })));
  const kTruoc = await chu.customer.count({ where: { tenantId: T } });
  const cd5 = await cungLuc<unknown>(lap(5, () => voi(T, gd, (nc) => chuyenDoiLead(nc, ld.id, LuocDoChuyenDoiLead.parse({ khachMoi: { ten: `Cửa hàng QA ${DAU}` } })))));
  dat("Đúng 1/5 chuyển đổi, sinh đúng 1 khách", cd5.soThanhCong === 1 && loiSach(cd5.loi) && (await chu.customer.count({ where: { tenantId: T } })) === kTruoc + 1, cd5.loi.map(maLoi).join(","));

  // ==================================================================
  console.log("\n— 10. Sê-ri: nhận trả ĐUA xuất cho khách khác —");
  const giaoMay = async (khachId: string, serial: string, khoId = khoA.id) => {
    const d = await donMoi([{ sp: spMay, sl: "1", gia: "20000000" }], khachId);
    await xacNhan(d.id, khoId);
    const [l] = await dongCua(d.id);
    await xuat(d.id, khoId, [{ dongDonId: l.id, soLuong: "1", serial: [serial] }]);
    return { don: d, dong: l };
  };
  const traMay = (khachId: string, donId: string, dongId: string, serial: string, them: Record<string, unknown> = {}, khoId = khoA.id) =>
    voi(T, gd, (nc) => taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
      khachHangId: khachId, donHangId: donId, khoId, lyDo: "QA khách trả",
      dong: [{ dongDonId: dongId, sanPhamId: spMay.id, ten: "Laptop QA", soLuong: "1", donGia: "20000000", serial: [serial], ...them }],
    })));
  const xnTra = (id: string) => voi(T, gd, (nc) => xacNhanTraHangBan(nc, id, LuocDoXacNhanTraHang.parse({})));

  const g1 = await giaoMay(khach.id, S(1));
  const tr10 = await traMay(khach.id, g1.don.id, g1.dong.id, S(1));
  const d10 = await donMoi([{ sp: spMay, sl: "1", gia: "19000000" }], khach2.id);
  await xacNhan(d10.id);
  const [l10] = await dongCua(d10.id);
  const r10 = await cungLuc<unknown>([() => xnTra(tr10.id), () => xuat(d10.id, khoA.id, [{ dongDonId: l10.id, soLuong: "1", serial: [S(1)] }])]);
  const sn1 = await chu.serialNumber.findFirstOrThrow({ where: { tenantId: T, serial: S(1) }, select: { id: true, status: true, salesOrderItemId: true } });
  const bhSn1 = await chu.warranty.findMany({ where: { tenantId: T, serial: S(1) }, select: { customerId: true, status: true, serialNumberId: true } });
  dat("Nhận trả luôn thành công; xuất chỉ thành công nếu máy đã về kho", (await chu.salesReturn.findUniqueOrThrow({ where: { id: tr10.id }, select: { status: true } })).status === "CONFIRMED" && loiSach(r10.loi, ["serial-da-dung"]), r10.loi.map(maLoi).join(","));
  const banLai = sn1.status === "da-ban";
  dat("Trạng thái sê-ri khớp kết quả (bán lại → bảo hành mới của khách 2; không → trong kho)",
    banLai
      ? sn1.salesOrderItemId === l10.id && bhSn1.some((w) => w.customerId === khach2.id && w.status === "hieu-luc" && w.serialNumberId === sn1.id) && bhSn1.some((w) => w.customerId === khach.id && w.status === "huy" && w.serialNumberId === null)
      : sn1.status === "trong-kho",
    JSON.stringify({ sn1, bhSn1 }));
  if ((await trangThaiDon(d10.id)) !== "DELIVERED") await voi(T, gd, (nc) => huyDon(nc, d10.id, "QA dọn đơn thua"));
  await kiemSo("nhận trả đua xuất");

  console.log("\n— 11. Sê-ri: trả NCC ĐUA xuất cho khách (TV-BH-05) —");
  for (const [vong, so, cho] of [[1, S(3), 0], [2, S(4), 60], [3, S(5), 150]] as const) {
    const tm = await voi(T, gd, (nc) => taoTraHangMua(nc, LuocDoTaoTraHangMua.parse({
      nhaCungCapId: ncc.id, khoId: khoA.id, lyDo: "QA trả NCC máy lỗi",
      dong: [{ sanPhamId: spMay.id, ten: "Laptop QA", soLuong: "1", donGia: "15000000", serial: [so] }],
    })));
    const d = await donMoi([{ sp: spMay, sl: "1", gia: "20000000" }], khach2.id);
    await xacNhan(d.id);
    const [l] = await dongCua(d.id);
    // Bên trả NCC khởi động trễ một nhịp để bên xuất kịp giữ khóa số dư trước (đường gây lỗi ghi đè).
    const kq = await cungLuc<unknown>([
      () => new Promise((r) => setTimeout(r, cho)).then(() => voi(T, gd, (nc) => xacNhanTraHangMua(nc, tm.id, LuocDoXacNhanTraHang.parse({})))),
      () => xuat(d.id, khoA.id, [{ dongDonId: l.id, soLuong: "1", serial: [so] }]),
    ]);
    const sn = await chu.serialNumber.findFirstOrThrow({ where: { tenantId: T, serial: so }, select: { status: true } });
    if ((await trangThaiDon(d.id)) !== "DELIVERED") await voi(T, gd, (nc) => huyDon(nc, d.id, "QA dọn đơn thua"));
    dat(`Vòng ${vong}: đúng một chứng từ lấy được máy ${so} (đang ${sn.status})`, kq.soThanhCong === 1 && loiSach(kq.loi), `${kq.soThanhCong}; ${kq.loi.map(maLoi).join(",")}`);
  }
  await kiemSo("trả NCC đua xuất");

  console.log("\n— 12. Bảo hành: trả hàng, bán lại, đổi máy, hết hạn —");
  // Trả vào kho B (khác kho bán) với hàng lỗi không nhập lại → sê-ri 'tra-lai', bảo hành kết thúc.
  const g12 = await giaoMay(khach.id, S(6));
  const tr12 = await traMay(khach.id, g12.don.id, g12.dong.id, S(6), { tinhTrang: "loi", nhapLaiKho: false });
  await xnTra(tr12.id);
  const w12 = await chu.warranty.findFirstOrThrow({ where: { tenantId: T, serial: S(6) }, select: { status: true, serialNumberId: true } });
  dat("Trả hàng lỗi không nhập lại: bảo hành 'huy', nhả sê-ri", w12.status === "huy" && w12.serialNumberId === null, JSON.stringify(w12));
  // Trả về kho B rồi bán lại từ kho B.
  const g12b = await giaoMay(khach.id, S(7));
  const tr12b = await traMay(khach.id, g12b.don.id, g12b.dong.id, S(7), {}, khoB.id);
  await xnTra(tr12b.id);
  const g12c = await giaoMay(khach2.id, S(7), khoB.id);
  dat("Máy trả về kho B bán lại từ kho B cho khách 2", (await trangThaiDon(g12c.don.id)) === "DELIVERED");
  // Bảo hành đã quá hạn (theo ngày) mà khách trả máy: không gắn nhãn "hủy" sai, chỉ nhả sê-ri.
  const g12d = await giaoMay(khach.id, S(8));
  const sn8 = await chu.serialNumber.findFirstOrThrow({ where: { tenantId: T, serial: S(8) }, select: { id: true } });
  await chu.warranty.updateMany({ where: { serialNumberId: sn8.id }, data: { startDate: new Date("2023-01-01"), endDate: new Date("2024-01-01") } });
  const tr12d = await traMay(khach.id, g12d.don.id, g12d.dong.id, S(8));
  await xnTra(tr12d.id);
  const w12d = await chu.warranty.findFirstOrThrow({ where: { tenantId: T, serial: S(8) }, select: { status: true, serialNumberId: true } });
  dat("Bảo hành hết hạn theo ngày: nhả sê-ri, KHÔNG đổi thành 'huy' (TV-BH-06 'đã hết hạn thì giữ')", w12d.serialNumberId === null && w12d.status !== "huy", JSON.stringify(w12d));
  // Đổi máy: bảo hành theo máy mới, máy cũ về kho không mang bảo hành; phiếu đổi không tính là đã trả.
  const g12e = await giaoMay(khach.id, S(9));
  const doi = await voi(T, gd, (nc) => taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({
    khachHangId: khach.id, donHangId: g12e.don.id, khoId: khoA.id, loai: "doi-may", lyDo: "QA đổi máy lỗi",
    dong: [{ dongDonId: g12e.dong.id, sanPhamId: spMay.id, ten: "Laptop QA", soLuong: "1", donGia: "0", serial: [S(9)], thayTheSanPhamId: spMay.id, thayTheSerial: [S(2)], tinhTrang: "loi", nhapLaiKho: true, ghiChu: "Máy lỗi nhẹ, sửa bán lại" }],
  })));
  await xnTra(doi.id);
  const sn2 = await chu.serialNumber.findFirstOrThrow({ where: { tenantId: T, serial: S(2) }, select: { id: true, status: true } });
  const wDoi = await chu.warranty.findFirst({ where: { tenantId: T, serialNumberId: sn2.id }, select: { customerId: true, status: true } });
  dat("Đổi máy: bảo hành đi theo máy mới của khách", sn2.status === "da-ban" && wDoi?.customerId === khach.id && wDoi.status === "hieu-luc", JSON.stringify(wDoi));
  const trMoi = await traMay(khach.id, g12e.don.id, g12e.dong.id, S(2));
  await xnTra(trMoi.id);
  dat("Sau đổi máy vẫn trả được máy thay thế; bảo hành kết thúc", (await chu.warranty.findFirst({ where: { tenantId: T, serialNumberId: sn2.id } })) === null);
  // Hủy bảo hành ×5 cùng lúc.
  const g12f = await giaoMay(khach.id, S(21), khoB.id);
  const w12f = await chu.warranty.findFirstOrThrow({ where: { tenantId: T, serial: S(21) }, select: { id: true } });
  const huy4 = lap(4, () => voi(T, gd, (nc) => huyBaoHanh(nc, w12f.id, "QA hủy")));
  const hb5 = await Promise.allSettled([...huy4.map((f) => f()), voi(T, gd, (nc) => suaBaoHanh(nc, w12f.id, { soThang: 24, lyDo: "QA gia hạn" }))]);
  const loiHb = hb5.filter((x): x is PromiseRejectedResult => x.status === "rejected").map((x) => x.reason as unknown);
  dat("Hủy bảo hành ×4 đua sửa: đúng một lần hủy, một sự kiện WARRANTY_CANCELLED", (await chu.businessEvent.count({ where: { tenantId: T, eventType: "WARRANTY_CANCELLED", objectId: w12f.id } })) === 1 && loiSach(loiHb, ["da-huy"]), loiHb.map(maLoi).join(","));
  const w12fSau = await chu.warranty.findUniqueOrThrow({ where: { id: w12f.id }, select: { status: true, months: true, cancelledAt: true } });
  const suaLuc = (await chu.auditLog.findFirst({ where: { tenantId: T, objectType: "warranty", objectId: w12f.id, action: "sua", after: { path: ["lyDo"], equals: "QA gia hạn" } }, select: { createdAt: true } }))?.createdAt;
  dat("Bảo hành đã hủy không bị sửa thời hạn sau đó (sửa chỉ lọt nếu xảy ra TRƯỚC khi hủy)",
    w12fSau.status === "huy" && (hb5[4].status === "rejected" ? w12fSau.months === 12 : w12fSau.months === 24 && !!suaLuc && !!w12fSau.cancelledAt && suaLuc <= w12fSau.cancelledAt),
    JSON.stringify({ ...w12fSau, sua: hb5[4].status, suaLuc }));
  void g12f;
  // Hàng không sê-ri có bảo hành: trả đủ số đã giao → bảo hành của dòng đó? (quan sát, câu hỏi mở)
  const d12 = await donMoi([{ sp: spBh, sl: "2" }]);
  await xacNhan(d12.id);
  const [l12] = await dongCua(d12.id);
  await xuat(d12.id, khoA.id, [{ dongDonId: l12.id, soLuong: "2" }]);
  const tr12g = await voi(T, gd, (nc) => taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({ khachHangId: khach.id, donHangId: d12.id, khoId: khoA.id, lyDo: "QA trả đủ", dong: [{ dongDonId: l12.id, ten: "Bộ lưu điện", soLuong: "2", donGia: "100000" }] })));
  await xnTra(tr12g.id);
  const w12g = await chu.warranty.findFirstOrThrow({ where: { tenantId: T, salesOrderItemId: l12.id }, select: { status: true } });
  console.log(`  · Quan sát: hàng không sê-ri trả đủ → bảo hành dòng đơn vẫn '${w12g.status}' (chưa có luật — câu hỏi cho chủ sản phẩm)`);
  await kiemSo("bảo hành");

  console.log("\n— 13. Phiếu trả: 5 phiếu × 3 cái cùng lúc trên dòng đã giao 10 —");
  const d13 = await donMoi([{ sp: spP, sl: "10" }]);
  await xacNhan(d13.id);
  const [l13] = await dongCua(d13.id);
  await xuat(d13.id, khoA.id, [{ dongDonId: l13.id, soLuong: "10" }]);
  const tr5 = await cungLuc<{ id: string }>(lap(5, () => voi(T, gd, (nc) => taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({ khachHangId: khach.id, donHangId: d13.id, khoId: khoA.id, lyDo: "QA trả", dong: [{ dongDonId: l13.id, ten: "Chuột", soLuong: "3", donGia: "100000" }] })))));
  dat("Đúng 3/5 phiếu lập được (9 ≤ 10), 2 bị chặn tra-qua-so-luong", tr5.soThanhCong === 3 && loiSach(tr5.loi, ["tra-qua-so-luong"]), `${tr5.soThanhCong}; ${tr5.loi.map(maLoi).join(",")}`);
  const xnt5 = await cungLuc<unknown>(lap(5, () => xnTra(tr5.ok[0].id)));
  dat("Xác nhận cùng một phiếu trả ×5: đúng 1", xnt5.soThanhCong === 1 && loiSach(xnt5.loi, ["sai-trang-thai"]), xnt5.loi.map(maLoi).join(","));

  console.log("\n— 14. Chốt giảm trừ ×5 và đua hủy hóa đơn —");
  const hd = await voi(T, gd, (nc) => taoHoaDon(nc, LuocDoTaoHoaDon.parse({ donHangId: d13.id })));
  await voi(T, gd, (nc) => phatHanhHoaDon(nc, hd.id, LuocDoPhatHanh.parse({ hanThanhToan: HOM_NAY })));
  const giaTri = Number((await chu.salesReturn.findUniqueOrThrow({ where: { id: tr5.ok[0].id }, select: { total: true } })).total);
  const cg5 = await cungLuc<unknown>(lap(5, () => voi(T, gd, (nc) => chotGiamTruBan(nc, tr5.ok[0].id, LuocDoChotGiamTru.parse({ phanBo: [{ hoaDonId: hd.id, soTien: String(giaTri) }] })))));
  dat("Chốt giảm trừ ×5: đúng 1, một phân bổ", cg5.soThanhCong === 1 && loiSach(cg5.loi) && (await chu.salesReturnAllocation.count({ where: { returnId: tr5.ok[0].id } })) === 1, cg5.loi.map(maLoi).join(","));
  // Đua hủy hóa đơn (bên hủy khóa hóa đơn như gói tài chính 0.16.1): chốt không được ghi vào hóa đơn đã hủy trước nó.
  await xnTra(tr5.ok[1].id);
  const r14 = await cungLuc<unknown>([
    () => voi(T, gd, async (nc) => { await khoaChungTu(nc.tx, "invoices", hd.id); return huyHoaDon(nc, hd.id, "QA hủy"); }),
    () => voi(T, gd, (nc) => chotGiamTruBan(nc, tr5.ok[1].id, LuocDoChotGiamTru.parse({ phanBo: [{ hoaDonId: hd.id, soTien: String(giaTri) }] }))),
  ]);
  const hdSau = await chu.invoice.findUniqueOrThrow({ where: { id: hd.id }, select: { status: true, cancelledAt: true } });
  const pbo = await chu.salesReturnAllocation.findFirst({ where: { returnId: tr5.ok[1].id }, select: { createdAt: true } });
  dat("Không có giảm trừ ghi vào hóa đơn SAU khi hóa đơn đã hủy", !pbo || !hdSau.cancelledAt || pbo.createdAt <= hdSau.cancelledAt, `${hdSau.status}; ${r14.loi.map(maLoi).join(",")}`);
  dat("Lỗi của bên thua (nếu có) là lỗi nghiệp vụ", loiSach(r14.loi), r14.loi.map(maLoi).join(","));

  console.log("\n— 15. Phiếu hỗ trợ: đổi trạng thái ×5 —");
  const ph = await voi(T, gd, (nc) => taoPhieu(nc, LuocDoTaoPhieu.parse({ khachHangId: khach2.id, loai: "su-co", tieuDe: "QA máy không lên" })));
  const ht5 = await cungLuc<unknown>(lap(5, () => voi(T, gd, (nc) => doiTrangThaiPhieu(nc, ph.id, { trangThai: "HOAN_THANH", cachXuLy: "Thay nguồn", ghiChu: null }))));
  dat("Hoàn thành ×5: đúng 1", ht5.soThanhCong === 1 && loiSach(ht5.loi, ["sai-trang-thai"]), ht5.loi.map(maLoi).join(","));
  const ml5 = await cungLuc<unknown>(lap(5, () => voi(T, gd, (nc) => doiTrangThaiPhieu(nc, ph.id, { trangThai: "DANG_XU_LY", cachXuLy: null, ghiChu: "Lỗi lại" }))));
  dat("Mở lại ×5: đúng 1, một diễn biến mo-lai, một SERVICE_TICKET_REOPENED",
    ml5.soThanhCong === 1 && (await chu.supportTicketEvent.count({ where: { ticketId: ph.id, type: "mo-lai" } })) === 1 && (await chu.businessEvent.count({ where: { tenantId: T, eventType: "SERVICE_TICKET_REOPENED", objectId: ph.id } })) === 1);

  // ==================================================================
  console.log("\n— 16. Cách ly doanh nghiệp: id của doanh nghiệp khác → không tìm thấy, không ghi gì —");
  const khongThay = (e: unknown) => e instanceof LoiKhongTimThay || e instanceof LoiDinhDang;
  const dNgoai = await donMoi([{ sp: spP, sl: "1" }]);
  const bgNgoai = await baoGiaMoi();
  await nemLoi("Xác nhận đơn của DN khác", () => voi(T2, gd2, (nc) => xacNhanDon(nc, dNgoai.id, { khoId: khoA.id, ghiChu: null })), khongThay);
  await nemLoi("Hủy đơn của DN khác", () => voi(T2, gd2, (nc) => huyDon(nc, dNgoai.id, "QA")), khongThay);
  await nemLoi("Tạo đơn từ báo giá của DN khác", () => voi(T2, gd2, (nc) => taoDonTuBaoGia(nc, bgNgoai.id)), khongThay);
  await nemLoi("Ra phiên bản báo giá của DN khác", () => voi(T2, gd2, (nc) => taoPhienBanMoi(nc, bgNgoai.id)), khongThay);
  await nemLoi("Nhận chuyển kho của DN khác", () => voi(T2, gd2, (nc) => nhanChuyenKho(nc, ck.id, LuocDoNhanChuyenKho.parse({}))), khongThay);
  await nemLoi("Chuyển đổi lead của DN khác", () => voi(T2, gd2, (nc) => chuyenDoiLead(nc, ld.id, LuocDoChuyenDoiLead.parse({ khachMoi: { ten: "X QA" } }))), khongThay);
  await nemLoi("Xác nhận phiếu trả của DN khác", () => voi(T2, gd2, (nc) => xacNhanTraHangBan(nc, tr5.ok[2].id, LuocDoXacNhanTraHang.parse({}))), khongThay);
  const bhNgoai = await chu.warranty.findFirstOrThrow({ where: { tenantId: T, status: "hieu-luc" }, select: { id: true } });
  await nemLoi("Hủy bảo hành của DN khác", () => voi(T2, gd2, (nc) => huyBaoHanh(nc, bhNgoai.id, "QA")), khongThay);
  await nemLoi("Đổi trạng thái phiếu hỗ trợ của DN khác", () => voi(T2, gd2, (nc) => doiTrangThaiPhieu(nc, ph.id, { trangThai: "HOAN_THANH", cachXuLy: "x", ghiChu: null })), khongThay);
  const khachT2 = await voi(T2, gd2, (nc) => taoKhachHang(nc, LuocDoTaoKhachHang.parse({ ten: `QA DN2 ${DAU}`, dienThoai: "0909 200 001" })));
  const khoT2 = await voi(T2, gd2, (nc) => taoKho(nc, LuocDoTaoKho.parse({ ma: "qa2", ten: "Kho DN2", macDinh: true })));
  await nemLoi("Lập phiếu trả ở DN2 trỏ vào đơn / dòng đơn của DN1", () => voi(T2, gd2, (nc) => taoTraHangBan(nc, LuocDoTaoTraHangBan.parse({ khachHangId: khachT2.id, donHangId: d13.id, khoId: khoT2.id, lyDo: "QA", dong: [{ dongDonId: l13.id, ten: "Chuột", soLuong: "1", donGia: "1" }] }))), khongThay);
  await nemLoi("Phiếu hỗ trợ ở DN2 gắn sê-ri của DN1", () => voi(T2, gd2, (nc) => taoPhieu(nc, LuocDoTaoPhieu.parse({ khachHangId: khachT2.id, loai: "su-co", tieuDe: "QA máy lỗi", serialId: sn1.id }))), khongThay);
  dat("Đơn của DN1 vẫn Nháp sau các lần thử chéo", (await trangThaiDon(dNgoai.id)) === "DRAFT");

  await kiemSo("cuối bài");
  await chu.$disconnect();
  ketLuan("QA độc lập — toàn vẹn bán hàng–kho");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
