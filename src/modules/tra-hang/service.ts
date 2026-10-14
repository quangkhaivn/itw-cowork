import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coMotTrongCacQuyen, coQuyen, idNguoiTrongPhamVi, LoiThieuQuyen } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, KIEU_SO } from "@/lib/so-chung-tu";
import { homNayVN, ngayVeDate } from "@/modules/crm/chung";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import { batBuocThayKho, ghiSoKho } from "@/modules/kho/service";
import { tinhDonMua } from "@/modules/mua-hang/tinh-toan";
import { congNo, dong } from "@/modules/tai-chinh/tinh-toan";
import { taoThongBao } from "@/modules/thong-bao/service";
import { ketThucBaoHanhKhiTraHang } from "@/modules/bao-hanh/service";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import {
  chotTienDuoc,
  conGiamTruDuoc,
  huyDuoc,
  kiemPhanBoGiamTru,
  soLuongTraToiDa,
  xacNhanDuoc,
} from "./tinh-toan";
import type {
  BoLocTraHangBan,
  BoLocTraHangMua,
  DuLieuChotGiamTru,
  DuLieuTaoTraHangBan,
  DuLieuTaoTraHangMua,
  DuLieuXacNhanTraHang,
} from "./luoc-do";

/**
 * Trả hàng và đổi máy. Luật: BUSINESS_RULES.md mục 18 (TH).
 *
 * Hai chiều đối xứng, cùng một vòng đời **Nháp → Đã qua kho → Đã chốt tiền**:
 * hàng đi trước (quyền kho), tiền chốt sau (quyền tài chính). Tách hai bước vì ở cửa
 * hàng thật đó là hai người khác nhau làm, và vì hàng về kho không đồng nghĩa với
 * việc đã thỏa thuận xong số tiền giảm trừ.
 *
 * Hàng đi qua **đúng** `ghiSoKho()` mà bán hàng và mua hàng dùng, nên đối soát kho
 * vẫn khớp. Tiền đi qua **đúng** `congNo()` của tài chính, nên hai chiều nợ không lệch.
 */

const CHON_DONG_BAN = {
  id: true, lineNo: true, orderItemId: true, productId: true, sku: true, name: true,
  quantity: true, unit: true, unitPrice: true, vatRate: true, lineTotal: true,
  condition: true, restock: true, replacementProductId: true, note: true,
  product: { select: { id: true, sku: true, name: true, requiresSerial: true, quanLyTon: true } },
  replacementProduct: { select: { id: true, sku: true, name: true, requiresSerial: true, quanLyTon: true } },
  orderItem: { select: { id: true, quantity: true, deliveredQty: true } },
  serials: { select: { id: true, serial: true, status: true } },
} satisfies Prisma.SalesReturnItemSelect;

const CHON_BAN = {
  id: true, number: true, status: true, kind: true, returnDate: true, reason: true, notes: true,
  subtotal: true, vatTotal: true, total: true, confirmedAt: true, settledAt: true,
  cancelledAt: true, cancelReason: true, ownerId: true, createdAt: true, updatedAt: true,
  customer: { select: { id: true, code: true, name: true } },
  salesOrder: { select: { id: true, number: true } },
  warehouse: { select: { id: true, code: true, name: true, status: true } },
  owner: { select: { id: true, fullName: true } },
  items: { select: CHON_DONG_BAN, orderBy: { lineNo: "asc" } },
  allocations: {
    select: { amount: true, invoice: { select: { id: true, number: true, total: true } } },
  },
} satisfies Prisma.SalesReturnSelect;

type BanGhiBan = Prisma.SalesReturnGetPayload<{ select: typeof CHON_BAN }>;

function traBanRa(p: BanGhiBan) {
  const daPhanBo = p.allocations.reduce((s, a) => s + Number(a.amount), 0);
  return {
    id: p.id,
    so: p.number,
    trangThai: p.status,
    loai: p.kind,
    ngayTra: p.returnDate,
    lyDo: p.reason,
    ghiChu: p.notes,
    tamTinh: p.subtotal.toString(),
    tongVat: p.vatTotal.toString(),
    tongCong: p.total.toString(),
    daGiamTru: dong(daPhanBo),
    conGiamTruDuoc: conGiamTruDuoc(p.total.toString(), daPhanBo),
    xacNhanLuc: p.confirmedAt,
    chotTienLuc: p.settledAt,
    huyLuc: p.cancelledAt,
    lyDoHuy: p.cancelReason,
    khachHang: { id: p.customer.id, ma: p.customer.code, ten: p.customer.name },
    donHang: p.salesOrder ? { id: p.salesOrder.id, so: p.salesOrder.number } : null,
    kho: { id: p.warehouse.id, ma: p.warehouse.code, ten: p.warehouse.name },
    nguoiPhuTrach: { id: p.owner.id, hoTen: p.owner.fullName },
    dong: p.items.map((d) => ({
      id: d.id,
      thuTu: d.lineNo,
      dongDonId: d.orderItemId,
      sanPhamId: d.productId,
      sku: d.sku,
      ten: d.name,
      soLuong: d.quantity.toString(),
      donViTinh: d.unit,
      donGia: d.unitPrice.toString(),
      vat: d.vatRate.toString(),
      thanhTien: d.lineTotal.toString(),
      tinhTrang: d.condition,
      nhapLaiKho: d.restock,
      theoSerial: d.product?.requiresSerial ?? false,
      quanLyTon: d.product?.quanLyTon ?? false,
      hangThayThe: d.replacementProduct
        ? { id: d.replacementProduct.id, sku: d.replacementProduct.sku, ten: d.replacementProduct.name }
        : null,
      // Đối chiếu: đơn giao bao nhiêu — để người đọc thấy ngay phiếu có hợp lý không.
      daGiaoTrenDon: d.orderItem ? d.orderItem.deliveredQty.toString() : null,
      serial: d.serials.map((s) => ({ id: s.id, serial: s.serial, trangThai: s.status })),
      ghiChu: d.note,
    })),
    giamTru: p.allocations.map((a) => ({
      hoaDonId: a.invoice.id,
      soHoaDon: a.invoice.number,
      soTien: Number(a.amount),
    })),
    taoLuc: p.createdAt,
    suaLuc: p.updatedAt,
  };
}
export type TraHangBanChiTiet = ReturnType<typeof traBanRa>;

const CHON_DONG_MUA = {
  id: true, lineNo: true, orderItemId: true, productId: true, sku: true, name: true,
  quantity: true, unit: true, unitPrice: true, vatRate: true, lineTotal: true, note: true,
  product: { select: { id: true, sku: true, name: true, requiresSerial: true, quanLyTon: true } },
  orderItem: { select: { id: true, quantity: true, receivedQty: true } },
} satisfies Prisma.PurchaseReturnItemSelect;

const CHON_MUA = {
  id: true, number: true, status: true, returnDate: true, reason: true, notes: true,
  subtotal: true, vatTotal: true, total: true, confirmedAt: true, settledAt: true,
  cancelledAt: true, cancelReason: true, ownerId: true, createdAt: true, updatedAt: true,
  supplier: { select: { id: true, code: true, name: true } },
  purchaseOrder: { select: { id: true, number: true } },
  warehouse: { select: { id: true, code: true, name: true, status: true } },
  owner: { select: { id: true, fullName: true } },
  items: { select: CHON_DONG_MUA, orderBy: { lineNo: "asc" } },
  allocations: { select: { amount: true, bill: { select: { id: true, number: true } } } },
} satisfies Prisma.PurchaseReturnSelect;

type BanGhiMua = Prisma.PurchaseReturnGetPayload<{ select: typeof CHON_MUA }>;

function traMuaRa(p: BanGhiMua) {
  const daPhanBo = p.allocations.reduce((s, a) => s + Number(a.amount), 0);
  return {
    id: p.id,
    so: p.number,
    trangThai: p.status,
    ngayTra: p.returnDate,
    lyDo: p.reason,
    ghiChu: p.notes,
    tamTinh: p.subtotal.toString(),
    tongVat: p.vatTotal.toString(),
    tongCong: p.total.toString(),
    daGiamTru: dong(daPhanBo),
    conGiamTruDuoc: conGiamTruDuoc(p.total.toString(), daPhanBo),
    xacNhanLuc: p.confirmedAt,
    chotTienLuc: p.settledAt,
    huyLuc: p.cancelledAt,
    lyDoHuy: p.cancelReason,
    nhaCungCap: { id: p.supplier.id, ma: p.supplier.code, ten: p.supplier.name },
    donMua: p.purchaseOrder ? { id: p.purchaseOrder.id, so: p.purchaseOrder.number } : null,
    kho: { id: p.warehouse.id, ma: p.warehouse.code, ten: p.warehouse.name },
    nguoiPhuTrach: { id: p.owner.id, hoTen: p.owner.fullName },
    dong: p.items.map((d) => ({
      id: d.id,
      thuTu: d.lineNo,
      dongDonId: d.orderItemId,
      sanPhamId: d.productId,
      sku: d.sku,
      ten: d.name,
      soLuong: d.quantity.toString(),
      donViTinh: d.unit,
      donGia: d.unitPrice.toString(),
      vat: d.vatRate.toString(),
      thanhTien: d.lineTotal.toString(),
      theoSerial: d.product?.requiresSerial ?? false,
      quanLyTon: d.product?.quanLyTon ?? false,
      daNhanTrenDon: d.orderItem ? d.orderItem.receivedQty.toString() : null,
      ghiChu: d.note,
    })),
    giamTru: p.allocations.map((a) => ({
      hoaDonId: a.bill.id,
      soHoaDon: a.bill.number,
      soTien: Number(a.amount),
    })),
    taoLuc: p.createdAt,
    suaLuc: p.updatedAt,
  };
}
export type TraHangMuaChiTiet = ReturnType<typeof traMuaRa>;

// ---------------------------------------------------------------------------
// Quyền và phạm vi
// ---------------------------------------------------------------------------

/**
 * Ba vai trò chạm vào phiếu khách trả hàng: kinh doanh (bán cái máy đó), chăm sóc
 * khách hàng (nhận khiếu nại), kế toán (chốt tiền). Nên quyền xem là **một trong ba**
 * `order.view` / `service_desk.view` / `finance.view` — không mở thêm mã quyền mới,
 * cũng không cấp bù quyền rộng hơn việc cần làm (cùng lý lẽ QĐ-31).
 */
const QUYEN_XEM_BAN = ["order.view", "service_desk.view", "finance.view"];
const QUYEN_LAP_BAN = ["order.update", "service_desk.update"];
const QUYEN_XEM_MUA = ["purchasing.view", "finance.view"];

function batBuocMotTrong(nc: NguCanh, maQuyens: string[], doiTuong: string, id?: string) {
  if (!coMotTrongCacQuyen(nc.hoSo, maQuyens)) {
    throw new LoiThieuQuyen(maQuyens.join(" hoặc "), { objectType: doiTuong, objectId: id ?? null });
  }
}

async function phamViTheoQuyen(nc: NguCanh, maQuyens: string[]): Promise<string[] | "tat-ca"> {
  const co = maQuyens.filter((q) => coQuyen(nc.hoSo, q));
  const ds = await Promise.all(co.map((q) => idNguoiTrongPhamVi(nc.tx, nc.hoSo, q)));
  if (ds.some((x) => x === "tat-ca")) return "tat-ca";
  return [...new Set(ds.flat() as string[])];
}

export async function dieuKienXemTraHangBan(nc: NguCanh): Promise<Prisma.SalesReturnWhereInput> {
  const pv = await phamViTheoQuyen(nc, QUYEN_XEM_BAN);
  return pv === "tat-ca" ? {} : { ownerId: { in: pv } };
}

export async function dieuKienXemTraHangMua(nc: NguCanh): Promise<Prisma.PurchaseReturnWhereInput> {
  const pv = await phamViTheoQuyen(nc, QUYEN_XEM_MUA);
  return pv === "tat-ca" ? {} : { ownerId: { in: pv } };
}

async function docTraBan(nc: NguCanh, id: string): Promise<BanGhiBan> {
  const p = await nc.tx.salesReturn.findFirst({
    where: { AND: [{ id }, await dieuKienXemTraHangBan(nc)] },
    select: CHON_BAN,
  });
  if (!p) throw new LoiKhongTimThay("Phiếu trả hàng");
  return p;
}

async function docTraMua(nc: NguCanh, id: string): Promise<BanGhiMua> {
  const p = await nc.tx.purchaseReturn.findFirst({
    where: { AND: [{ id }, await dieuKienXemTraHangMua(nc)] },
    select: CHON_MUA,
  });
  if (!p) throw new LoiKhongTimThay("Phiếu trả hàng nhà cung cấp");
  return p;
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

function locTrangThai(giaTri: string): { status?: string | { in: string[] } } {
  if (giaTri === "tat-ca") return {};
  if (giaTri === "") return { status: { in: ["DRAFT", "CONFIRMED"] } };
  return { status: giaTri };
}

export async function danhSachTraHangBan(nc: NguCanh, boLoc: BoLocTraHangBan) {
  batBuocMotTrong(nc, QUYEN_XEM_BAN, "sales_return");
  const dieuKien: Prisma.SalesReturnWhereInput[] = [await dieuKienXemTraHangBan(nc), locTrangThai(boLoc.trangThai)];
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { number: { contains: boLoc.q, mode: "insensitive" } },
        { customer: { name: { contains: boLoc.q, mode: "insensitive" } } },
        { salesOrder: { number: { contains: boLoc.q, mode: "insensitive" } } },
      ],
    });
  }
  if (boLoc.loai) dieuKien.push({ kind: boLoc.loai });
  if (boLoc.khachHang) dieuKien.push({ customerId: boLoc.khachHang });

  const where: Prisma.SalesReturnWhereInput = { AND: dieuKien };
  const [tong, ds, dangMo] = await Promise.all([
    nc.tx.salesReturn.count({ where }),
    nc.tx.salesReturn.findMany({
      where,
      select: CHON_BAN,
      orderBy: [{ returnDate: "desc" }, { createdAt: "desc" }],
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
    }),
    nc.tx.salesReturn.findMany({
      where: { AND: [await dieuKienXemTraHangBan(nc), { status: { in: ["DRAFT", "CONFIRMED"] } }] },
      select: { status: true, total: true },
    }),
  ]);

  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    dong: ds.map(traBanRa),
    tomTat: {
      dangMo: dangMo.length,
      choXacNhan: dangMo.filter((x) => x.status === "DRAFT").length,
      choChotTien: dangMo.filter((x) => x.status === "CONFIRMED").length,
      giaTriChoChotTien: dong(
        dangMo.filter((x) => x.status === "CONFIRMED").reduce((s, x) => s + Number(x.total), 0),
      ),
    },
  };
}

export async function chiTietTraHangBan(nc: NguCanh, id: string) {
  batBuocMotTrong(nc, QUYEN_XEM_BAN, "sales_return", id);
  const p = traBanRa(await docTraBan(nc, id));
  return {
    phieu: p,
    quyen: {
      sua: coMotTrongCacQuyen(nc.hoSo, QUYEN_LAP_BAN) && p.trangThai === "DRAFT",
      xacNhan: coQuyen(nc.hoSo, "inventory.update") && xacNhanDuoc(p.trangThai),
      chotTien: coQuyen(nc.hoSo, "finance.approve") && chotTienDuoc(p.trangThai, Number(p.tongCong)),
      huy: coMotTrongCacQuyen(nc.hoSo, QUYEN_LAP_BAN) && huyDuoc(p.trangThai),
    },
  };
}

export async function danhSachTraHangMua(nc: NguCanh, boLoc: BoLocTraHangMua) {
  batBuocMotTrong(nc, QUYEN_XEM_MUA, "purchase_return");
  const dieuKien: Prisma.PurchaseReturnWhereInput[] = [await dieuKienXemTraHangMua(nc), locTrangThai(boLoc.trangThai)];
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { number: { contains: boLoc.q, mode: "insensitive" } },
        { supplier: { name: { contains: boLoc.q, mode: "insensitive" } } },
        { purchaseOrder: { number: { contains: boLoc.q, mode: "insensitive" } } },
      ],
    });
  }
  if (boLoc.nhaCungCap) dieuKien.push({ supplierId: boLoc.nhaCungCap });

  const where: Prisma.PurchaseReturnWhereInput = { AND: dieuKien };
  const [tong, ds, dangMo] = await Promise.all([
    nc.tx.purchaseReturn.count({ where }),
    nc.tx.purchaseReturn.findMany({
      where,
      select: CHON_MUA,
      orderBy: [{ returnDate: "desc" }, { createdAt: "desc" }],
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
    }),
    nc.tx.purchaseReturn.findMany({
      where: { AND: [await dieuKienXemTraHangMua(nc), { status: { in: ["DRAFT", "CONFIRMED"] } }] },
      select: { status: true, total: true },
    }),
  ]);

  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    dong: ds.map(traMuaRa),
    tomTat: {
      dangMo: dangMo.length,
      choXacNhan: dangMo.filter((x) => x.status === "DRAFT").length,
      choChotTien: dangMo.filter((x) => x.status === "CONFIRMED").length,
      giaTriChoChotTien: dong(
        dangMo.filter((x) => x.status === "CONFIRMED").reduce((s, x) => s + Number(x.total), 0),
      ),
    },
  };
}

export async function chiTietTraHangMua(nc: NguCanh, id: string) {
  batBuocMotTrong(nc, QUYEN_XEM_MUA, "purchase_return", id);
  const p = traMuaRa(await docTraMua(nc, id));
  return {
    phieu: p,
    quyen: {
      sua: coQuyen(nc.hoSo, "purchasing.update") && p.trangThai === "DRAFT",
      xacNhan: coQuyen(nc.hoSo, "inventory.update") && xacNhanDuoc(p.trangThai),
      chotTien: coQuyen(nc.hoSo, "finance.approve") && chotTienDuoc(p.trangThai, Number(p.tongCong)),
      huy: coQuyen(nc.hoSo, "purchasing.update") && huyDuoc(p.trangThai),
    },
  };
}

/**
 * Gợi ý dòng trả cho một đơn bán: đã giao bao nhiêu, đã trả bao nhiêu bằng các phiếu
 * trước, còn trả được bao nhiêu (TH-03).
 */
export async function goiYTraTheoDon(nc: NguCanh, donHangId: string) {
  batBuocMotTrong(nc, QUYEN_XEM_BAN, "sales_order", donHangId);
  const don = await nc.tx.salesOrder.findFirst({
    where: { id: donHangId },
    select: {
      id: true, number: true, status: true,
      customer: { select: { id: true, code: true, name: true } },
      items: {
        orderBy: { lineNo: "asc" },
        select: {
          id: true, productId: true, sku: true, name: true, quantity: true, deliveredQty: true,
          unit: true, unitPrice: true, vatRate: true,
          product: { select: { id: true, requiresSerial: true, quanLyTon: true } },
        },
      },
    },
  });
  if (!don) throw new LoiKhongTimThay("Đơn hàng");

  const daTra = await nc.tx.salesReturnItem.groupBy({
    by: ["orderItemId"],
    where: { orderItemId: { in: don.items.map((x) => x.id) }, salesReturn: DIEU_KIEN_PHIEU_TINH_LA_TRA },
    _sum: { quantity: true },
  });
  const theoDong = new Map(daTra.map((x) => [x.orderItemId, Number(x._sum.quantity ?? 0)]));

  return {
    donHang: { id: don.id, so: don.number, trangThai: don.status },
    khachHang: don.customer,
    dong: don.items.map((x) => {
      const tra = theoDong.get(x.id) ?? 0;
      return {
        dongDonId: x.id,
        sanPhamId: x.productId,
        sku: x.sku,
        ten: x.name,
        donViTinh: x.unit,
        donGia: x.unitPrice.toString(),
        vat: x.vatRate.toString(),
        daGiao: Number(x.deliveredQty),
        daTra: tra,
        conTraDuoc: soLuongTraToiDa(x.deliveredQty.toString(), tra),
        theoSerial: x.product?.requiresSerial ?? false,
        quanLyTon: x.product?.quanLyTon ?? false,
      };
    }),
  };
}

/** Gợi ý dòng trả cho một đơn mua: đã nhận bao nhiêu, đã trả bao nhiêu, còn trả được bao nhiêu. */
export async function goiYTraTheoDonMua(nc: NguCanh, donMuaId: string) {
  batBuocMotTrong(nc, QUYEN_XEM_MUA, "purchase_order", donMuaId);
  const don = await nc.tx.purchaseOrder.findFirst({
    where: { id: donMuaId },
    select: {
      id: true, number: true, status: true, warehouseId: true,
      supplier: { select: { id: true, code: true, name: true } },
      items: {
        orderBy: { lineNo: "asc" },
        select: {
          id: true, productId: true, sku: true, name: true, quantity: true, receivedQty: true,
          unit: true, unitPrice: true, vatRate: true,
          product: { select: { id: true, requiresSerial: true, quanLyTon: true } },
        },
      },
    },
  });
  if (!don) throw new LoiKhongTimThay("Đơn mua");

  const daTra = await nc.tx.purchaseReturnItem.groupBy({
    by: ["orderItemId"],
    where: { orderItemId: { in: don.items.map((x) => x.id) }, purchaseReturn: { status: { not: "CANCELLED" } } },
    _sum: { quantity: true },
  });
  const theoDong = new Map(daTra.map((x) => [x.orderItemId, Number(x._sum.quantity ?? 0)]));

  return {
    donMua: { id: don.id, so: don.number, trangThai: don.status, khoId: don.warehouseId },
    nhaCungCap: don.supplier,
    dong: don.items.map((x) => {
      const tra = theoDong.get(x.id) ?? 0;
      return {
        dongDonId: x.id,
        sanPhamId: x.productId,
        sku: x.sku,
        ten: x.name,
        donViTinh: x.unit,
        donGia: x.unitPrice.toString(),
        vat: x.vatRate.toString(),
        daNhan: Number(x.receivedQty),
        daTra: tra,
        conTraDuoc: soLuongTraToiDa(x.receivedQty.toString(), tra),
        theoSerial: x.product?.requiresSerial ?? false,
        quanLyTon: x.product?.quanLyTon ?? false,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Ghi: khách trả hàng
// ---------------------------------------------------------------------------

/**
 * Phiếu nào tính là "đã trả" khi đối chiếu với số đã giao (TH-03): phiếu chưa hủy, loại trả
 * hàng. Phiếu đổi máy KHÔNG tính (0.16.1, TV-BH-10): khách trả một máy và nhận lại một máy cho
 * cùng dòng đơn, số hàng khách đang giữ không đổi — tính vào thì máy thay thế không bao giờ trả
 * lại được nữa (mọi dòng trả bắt buộc theo dòng đơn).
 */
const DIEU_KIEN_PHIEU_TINH_LA_TRA = { status: { not: "CANCELLED" }, kind: "tra-hang" } satisfies Prisma.SalesReturnWhereInput;

/**
 * TV-BH-10 (chọn phương án chặt — QĐ-81): mọi dòng trả phải gắn một dòng của ĐÚNG đơn đã ghi
 * trên phiếu, đơn đó của đúng khách; hàng trên dòng trả phải là hàng của dòng đơn. Số trả cộng
 * theo dòng đơn (nhiều dòng trả cùng một dòng đơn — ví dụ tách hàng tốt / hàng lỗi — cộng lại)
 * không vượt phần đã giao trừ phần đã trả (TH-03). Khóa các dòng đơn trước khi kiểm để hai
 * phiếu lập cùng lúc không cùng lọt.
 */
async function kiemDongTraBan(
  nc: NguCanh,
  donHangId: string,
  dong2: { dongDonId: string; sanPhamId: string | null; soLuong: string; ten: string }[],
) {
  const ids = [...new Set(dong2.map((d) => d.dongDonId))];
  await khoaChungTu(nc.tx, "sales_order_items", ids);

  const [dongDon, daTra] = await Promise.all([
    nc.tx.salesOrderItem.findMany({ where: { id: { in: ids } }, select: { id: true, orderId: true, productId: true, name: true, deliveredQty: true } }),
    nc.tx.salesReturnItem.groupBy({
      by: ["orderItemId"],
      where: { orderItemId: { in: ids }, salesReturn: DIEU_KIEN_PHIEU_TINH_LA_TRA },
      _sum: { quantity: true },
    }),
  ]);
  const theoId = new Map(dongDon.map((x) => [x.id, x]));
  const tra = new Map(daTra.map((x) => [x.orderItemId, Number(x._sum.quantity ?? 0)]));

  const tongTheoDong = new Map<string, number>();
  for (const d of dong2) {
    const goc = theoId.get(d.dongDonId);
    if (!goc || goc.orderId !== donHangId) throw new LoiDinhDang("dong", `${d.ten}: dòng hàng không thuộc đơn đã chọn.`);
    if (d.sanPhamId && goc.productId && d.sanPhamId !== goc.productId) {
      throw new LoiDinhDang("dong", `${d.ten}: mặt hàng trả không phải mặt hàng của dòng đơn "${goc.name}".`);
    }
    tongTheoDong.set(d.dongDonId, Math.round(((tongTheoDong.get(d.dongDonId) ?? 0) + Number(d.soLuong)) * 1000) / 1000);
  }

  for (const [dongDonId, tong] of tongTheoDong) {
    const goc = theoId.get(dongDonId)!;
    const daGiao = goc.deliveredQty.toString();
    const con = soLuongTraToiDa(daGiao, tra.get(dongDonId) ?? 0);
    if (tong > con + 0.0005) {
      throw new LoiNghiepVu(
        `${goc.name}: đơn mới giao ${daGiao} và đã trả ${tra.get(dongDonId) ?? 0}, chỉ còn trả được ${con} (phiếu này khai ${tong}).`,
        409,
        "tra-qua-so-luong",
        { dongDonId, conTraDuoc: con },
      );
    }
  }
  return theoId;
}

/** Bỏ trống thì hàng còn tốt nhập lại kho, hàng lỗi thì không (TH-06). */
function nhapLaiKhoCua(x: { tinhTrang: string; nhapLaiKho?: boolean }): boolean {
  return x.nhapLaiKho ?? x.tinhTrang !== "loi";
}

export async function taoTraHangBan(nc: NguCanh, d: DuLieuTaoTraHangBan) {
  batBuocMotTrong(nc, QUYEN_LAP_BAN, "sales_return");
  const khach = await batBuocThayKhach(nc, d.khachHangId);
  const kho = await batBuocThayKho(nc, d.khoId);
  if (kho.trangThai !== "hoat-dong") throw new LoiNghiepVu("Kho này đã ngừng hoạt động.", 409, "kho-ngung");

  if (d.donHangId) {
    const don = await nc.tx.salesOrder.findFirst({ where: { id: d.donHangId }, select: { id: true, customerId: true, number: true } });
    if (!don) throw new LoiKhongTimThay("Đơn hàng");
    if (don.customerId !== khach.id) throw new LoiDinhDang("donHangId", `Đơn ${don.number} thuộc khách khác.`);
  }

  // TH-08: đổi máy là đổi ngang, mọi dòng có giá 0 và phải khai hàng thay thế.
  const doiMay = d.loai === "doi-may";
  for (const x of d.dong) {
    if (doiMay && !x.thayTheSanPhamId) {
      throw new LoiDinhDang("dong", `${x.ten}: phiếu đổi máy phải khai mặt hàng giao thay thế.`);
    }
    if (!doiMay && x.thayTheSanPhamId) {
      throw new LoiDinhDang("dong", `${x.ten}: chỉ phiếu đổi máy mới có hàng thay thế.`);
    }
    if (x.tinhTrang === "loi" && nhapLaiKhoCua(x) && !x.ghiChu) {
      throw new LoiDinhDang("dong", `${x.ten}: hàng lỗi mà vẫn nhập lại kho thì phải ghi rõ vì sao (TH-06).`);
    }
  }

  // TV-BH-10: trả hàng luôn theo đơn đã giao — không có "trả lẻ" ngoài đơn (QĐ-81).
  if (!d.donHangId) {
    throw new LoiDinhDang("donHangId", "Trả hàng phải theo một đơn đã giao cho khách. Mở phiếu từ nút “Khách trả hàng” trên trang đơn hàng.");
  }
  const thieuDong = d.dong.find((x) => !x.dongDonId);
  if (thieuDong) throw new LoiDinhDang("dong", `${thieuDong.ten}: mỗi dòng trả phải chọn từ một dòng của đơn đã giao.`);
  const khoaDong = new Set<string>();
  for (const x of d.dong) {
    const k = [x.dongDonId, x.tinhTrang, nhapLaiKhoCua(x), x.thayTheSanPhamId ?? ""].join("|");
    if (khoaDong.has(k)) throw new LoiDinhDang("dong", `${x.ten}: dòng trả bị lặp — gộp số lượng vào một dòng.`);
    khoaDong.add(k);
  }
  const serialKhai = new Set<string>();
  for (const sr of d.dong.flatMap((x) => [...x.serial, ...x.thayTheSerial])) {
    const k = sr.trim().toUpperCase();
    if (serialKhai.has(k)) throw new LoiDinhDang("dong", `Số sê-ri ${sr} khai hai lần trong cùng phiếu.`);
    serialKhai.add(k);
  }
  const dongDonTheoId = await kiemDongTraBan(
    nc,
    d.donHangId,
    d.dong.map((x) => ({ dongDonId: x.dongDonId!, sanPhamId: x.sanPhamId ?? null, soLuong: x.soLuong, ten: x.ten })),
  );

  const tinh = tinhDonMua(
    d.dong.map((x) => ({ soLuong: x.soLuong, donGia: doiMay ? 0 : x.donGia, vat: doiMay ? 0 : x.vat })),
  );
  const so = await capSoChungTu(nc.tx, KIEU_SO.traHangBan);

  const p = await nc.tx.salesReturn.create({
    data: {
      tenantId: nc.tenantId,
      number: so,
      customerId: khach.id,
      salesOrderId: d.donHangId || null,
      warehouseId: kho.id,
      ownerId: nc.hoSo.userId,
      kind: d.loai,
      returnDate: ngayVeDate(d.ngayTra || homNayVN()),
      reason: d.lyDo,
      notes: d.ghiChu || null,
      subtotal: String(tinh.tamTinh),
      vatTotal: String(tinh.tongVat),
      total: String(tinh.tongCong),
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
      items: {
        create: d.dong.map((x, i) => ({
          tenantId: nc.tenantId,
          lineNo: i + 1,
          orderItemId: x.dongDonId || null,
          // Hàng trả là hàng của dòng đơn (đã kiểm khớp ở trên) — không tin mã gửi lên.
          productId: (x.dongDonId ? dongDonTheoId.get(x.dongDonId)?.productId : null) ?? x.sanPhamId ?? null,
          sku: null,
          name: x.ten,
          quantity: x.soLuong,
          unit: x.donViTinh || null,
          unitPrice: doiMay ? "0" : x.donGia,
          vatRate: doiMay ? "0" : String(x.vat),
          lineTotal: String(tinh.dong[i].thanhTien),
          condition: x.tinhTrang,
          restock: nhapLaiKhoCua(x),
          replacementProductId: x.thayTheSanPhamId || null,
          note: x.ghiChu || null,
        })),
      },
    },
    select: { id: true, number: true },
  });

  // Sê-ri khai lúc lập phiếu được giữ trong ghi chú dòng cho tới lúc xác nhận; việc
  // đụng vào bảng sê-ri chỉ xảy ra khi hàng thật sự về kho (TH-04).
  await luuSerialTamThoi(nc, p.id, d.dong);

  await nc.kiemToan({ action: "tao", objectType: "sales_return", objectId: p.id, after: { so, khachHangId: khach.id, loai: d.loai, tongCong: tinh.tongCong } });
  await nc.suKien({ eventType: SU_KIEN.SALES_RETURN_CREATED, objectType: "sales_return", objectId: p.id, payload: { so, khachHangId: khach.id, loai: d.loai } });
  return { id: p.id, so };
}

/**
 * Sê-ri khai lúc lập phiếu chưa được đổi trạng thái — mới chỉ ghi lại ý định. Lưu vào
 * ghi chú dòng dưới dạng danh sách để bước xác nhận đọc lại và kiểm cho chặt.
 */
const DAU_SERIAL = "[serial]";
const DAU_SERIAL_MOI = "[serial-moi]";

async function luuSerialTamThoi(
  nc: NguCanh,
  phieuId: string,
  dong2: { serial: string[]; thayTheSerial: string[] }[],
) {
  const dsDong = await nc.tx.salesReturnItem.findMany({
    where: { returnId: phieuId },
    select: { id: true, lineNo: true, note: true },
    orderBy: { lineNo: "asc" },
  });
  for (const [i, dongDb] of dsDong.entries()) {
    const x = dong2[i];
    if (!x || (x.serial.length === 0 && x.thayTheSerial.length === 0)) continue;
    const phan = [dongDb.note ?? ""];
    if (x.serial.length > 0) phan.push(`${DAU_SERIAL} ${x.serial.join(", ")}`);
    if (x.thayTheSerial.length > 0) phan.push(`${DAU_SERIAL_MOI} ${x.thayTheSerial.join(", ")}`);
    await nc.tx.salesReturnItem.update({
      where: { id: dongDb.id },
      data: { note: phan.filter(Boolean).join(" · ") },
    });
  }
}

/** Đọc lại danh sách sê-ri đã khai trong ghi chú dòng. */
export function docSerialTuGhiChu(ghiChu: string | null, dau: string): string[] {
  if (!ghiChu) return [];
  const i = ghiChu.indexOf(dau);
  if (i < 0) return [];
  const phanSau = ghiChu.slice(i + dau.length).split(" · ")[0];
  return phanSau
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Xác nhận: hàng thật sự đi qua kho. Nhập lại hàng khách trả (nếu còn dùng được),
 * xuất hàng thay thế nếu là đổi máy, và chuyển trạng thái sê-ri (TH-04, TH-05).
 */
export async function xacNhanTraHangBan(nc: NguCanh, id: string, d: DuLieuXacNhanTraHang) {
  batBuocQuyen(nc.hoSo, "inventory.update", { objectType: "sales_return", objectId: id });
  // TV-BH-01: khóa phiếu rồi mới đọc trạng thái — bấm xác nhận hai lần không nhập kho hai lần.
  await khoaChungTu(nc.tx, "sales_returns", id);
  const p = await docTraBan(nc, id);
  if (!xacNhanDuoc(p.status)) {
    throw new LoiNghiepVu("Chỉ xác nhận được phiếu còn nháp.", 409, "sai-trang-thai");
  }
  if (p.warehouse.status !== "hoat-dong") throw new LoiNghiepVu("Kho của phiếu đã ngừng hoạt động.", 409, "kho-ngung");

  const doiMay = p.kind === "doi-may";

  // Kiểm toàn bộ sê-ri TRƯỚC khi đụng tồn kho — lỗi sê-ri phải nói rõ là lỗi sê-ri.
  const keHoach: {
    dongId: string;
    sanPhamId: string | null;
    soLuong: number;
    nhapLai: boolean;
    quanLyTon: boolean;
    serialCu: { id: string; serial: string }[];
    thayTheSanPhamId: string | null;
    thayTheQuanLyTon: boolean;
    serialMoi: { id: string; serial: string }[];
    orderItemId: string | null;
  }[] = [];

  for (const dongDb of p.items) {
    const sl = Number(dongDb.quantity);
    const khaiCu = docSerialTuGhiChu(dongDb.note, DAU_SERIAL);
    const khaiMoi = docSerialTuGhiChu(dongDb.note, DAU_SERIAL_MOI);

    const serialCu: { id: string; serial: string }[] = [];
    if (dongDb.product?.requiresSerial) {
      if (khaiCu.length !== sl) {
        throw new LoiNghiepVu(
          `${dongDb.name} quản lý theo số sê-ri: cần đúng ${sl} sê-ri khách mang về, đang có ${khaiCu.length}.`,
          400, "thieu-serial", { dongId: dongDb.id, canCo: sl, dangCo: khaiCu.length },
        );
      }
      for (const s of khaiCu) {
        const sn = await nc.tx.serialNumber.findFirst({
          where: { productId: dongDb.productId ?? undefined, serial: s },
          select: { id: true, serial: true, status: true, salesOrderItemId: true, salesOrderItem: { select: { order: { select: { customerId: true } } } } },
        });
        if (!sn) throw new LoiNghiepVu(`Số sê-ri ${s} không có trong hệ thống — không phải máy mình bán ra.`, 409, "serial-khong-co", { serial: s });
        if (sn.status !== "da-ban") {
          throw new LoiNghiepVu(`Số sê-ri ${s} đang ở trạng thái "${sn.status}", không phải máy đã bán cho khách.`, 409, "serial-chua-ban", { serial: s });
        }
        // TV-BH-10: máy phải được bán cho CHÍNH khách này, theo đúng dòng đơn ghi trên phiếu.
        if (sn.salesOrderItem?.order.customerId !== p.customer.id) {
          throw new LoiNghiepVu(`Số sê-ri ${s} không phải máy đã bán cho ${p.customer.name}.`, 409, "serial-khach-khac", { serial: s });
        }
        if (dongDb.orderItemId && sn.salesOrderItemId !== dongDb.orderItemId) {
          throw new LoiNghiepVu(`Số sê-ri ${s} được bán theo dòng đơn khác, không phải dòng "${dongDb.name}" của phiếu này.`, 409, "serial-khac-dong", { serial: s });
        }
        serialCu.push({ id: sn.id, serial: sn.serial });
      }
    }

    const serialMoi: { id: string; serial: string }[] = [];
    if (doiMay && dongDb.replacementProduct?.requiresSerial) {
      if (khaiMoi.length !== sl) {
        throw new LoiNghiepVu(
          `${dongDb.replacementProduct.name} quản lý theo số sê-ri: cần đúng ${sl} sê-ri máy giao thay thế, đang có ${khaiMoi.length}.`,
          400, "thieu-serial-thay-the", { dongId: dongDb.id, canCo: sl, dangCo: khaiMoi.length },
        );
      }
      for (const s of khaiMoi) {
        const sn = await nc.tx.serialNumber.findFirst({
          where: { productId: dongDb.replacementProductId ?? undefined, serial: s },
          select: { id: true, serial: true, status: true, warehouseId: true },
        });
        if (!sn) throw new LoiNghiepVu(`Số sê-ri ${s} chưa có trong kho — nhập kho trước khi giao đổi.`, 409, "serial-khong-co", { serial: s });
        if (sn.status !== "trong-kho") throw new LoiNghiepVu(`Số sê-ri ${s} không còn trong kho.`, 409, "serial-da-dung", { serial: s });
        if (sn.warehouseId !== p.warehouse.id) throw new LoiNghiepVu(`Số sê-ri ${s} đang nằm ở kho khác.`, 409, "serial-khac-kho", { serial: s });
        serialMoi.push({ id: sn.id, serial: sn.serial });
      }
    }

    keHoach.push({
      dongId: dongDb.id,
      sanPhamId: dongDb.productId,
      soLuong: sl,
      nhapLai: dongDb.restock,
      quanLyTon: dongDb.product?.quanLyTon ?? false,
      serialCu,
      thayTheSanPhamId: dongDb.replacementProductId,
      thayTheQuanLyTon: dongDb.replacementProduct?.quanLyTon ?? false,
      serialMoi,
      orderItemId: dongDb.orderItemId,
    });
  }

  // Kiểm xong mới đụng kho.
  for (const k of keHoach) {
    if (k.nhapLai && k.sanPhamId && k.quanLyTon) {
      await ghiSoKho(nc, {
        khoId: p.warehouse.id,
        sanPhamId: k.sanPhamId,
        loai: "nhap",
        soLuong: k.soLuong,
        loaiChungTu: "tra-hang-ban",
        chungTuId: p.id,
        soChungTu: p.number,
        lyDo: `Khách trả hàng theo phiếu ${p.number}`,
        ghiChu: d.ghiChu || null,
      });
    }

    for (const s of k.serialCu) {
      // Có điều kiện: máy vẫn phải đang ở trạng thái đã bán (chưa phiếu nào khác nhận về).
      const kq = await nc.tx.serialNumber.updateMany({
        where: { id: s.id, status: "da-ban" },
        data: k.nhapLai
          ? { status: "trong-kho", warehouseId: p.warehouse.id, salesReturnItemId: k.dongId }
          : { status: "tra-lai", warehouseId: null, salesReturnItemId: k.dongId },
      });
      if (kq.count !== 1) throw new LoiNghiepVu(`Số sê-ri ${s.serial} vừa được nhận về theo chứng từ khác.`, 409, "serial-chua-ban", { serial: s.serial });
    }
    // TV-BH-06: trả hàng thường → bảo hành của lần bán này kết thúc và nhả sê-ri, máy bán lại được.
    // Đổi máy thì bảo hành đi theo máy mới (TH-10) ở bước dưới.
    if (!k.thayTheSanPhamId) await ketThucBaoHanhKhiTraHang(nc, k.serialCu.map((x) => x.id), p.number);

    if (k.thayTheSanPhamId) {
      if (k.thayTheQuanLyTon) {
        await ghiSoKho(nc, {
          khoId: p.warehouse.id,
          sanPhamId: k.thayTheSanPhamId,
          loai: "xuat",
          soLuong: k.soLuong,
          loaiChungTu: "doi-may",
          chungTuId: p.id,
          soChungTu: p.number,
          lyDo: `Giao máy thay thế theo phiếu ${p.number}`,
          ghiChu: d.ghiChu || null,
        });
      }
      for (const [i, s] of k.serialMoi.entries()) {
        const kq = await nc.tx.serialNumber.updateMany({
          where: { id: s.id, status: "trong-kho", warehouseId: p.warehouse.id },
          data: { status: "da-ban", warehouseId: null, salesOrderItemId: k.orderItemId },
        });
        if (kq.count !== 1) throw new LoiNghiepVu(`Số sê-ri ${s.serial} vừa được xuất cho chứng từ khác.`, 409, "serial-da-dung", { serial: s.serial });
        // TH-10: bảo hành đi theo lần mua, không tính lại từ đầu khi đổi máy.
        const cu = k.serialCu[i];
        if (cu) {
          const bh = await nc.tx.warranty.findFirst({ where: { serialNumberId: cu.id }, select: { id: true, note: true } });
          if (bh) {
            await nc.tx.warranty.update({
              where: { id: bh.id },
              data: {
                serialNumberId: s.id,
                serial: s.serial,
                note: [bh.note, `Đổi máy ${cu.serial} → ${s.serial} theo phiếu ${p.number}; mốc hết hạn giữ nguyên.`]
                  .filter(Boolean)
                  .join(" · "),
              },
            });
          }
        }
      }
    }
  }

  await nc.tx.salesReturn.update({
    where: { id },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      confirmedBy: nc.hoSo.userId,
      notes: d.ghiChu ? [p.notes, d.ghiChu].filter(Boolean).join(" · ") : p.notes,
      updatedBy: nc.hoSo.userId,
    },
  });

  await nc.kiemToan({ action: "sua", objectType: "sales_return", objectId: id, before: { trangThai: p.status }, after: { trangThai: "CONFIRMED" } });
  await nc.suKien({ eventType: SU_KIEN.SALES_RETURN_CONFIRMED, objectType: "sales_return", objectId: id, payload: { so: p.number, loai: p.kind, khoId: p.warehouse.id } });
  return { id, trangThai: "CONFIRMED", tongCong: p.total.toString() };
}

/** Chốt tiền: giảm trừ giá trị phiếu vào các hóa đơn còn nợ của khách (TH-07). */
export async function chotGiamTruBan(nc: NguCanh, id: string, d: DuLieuChotGiamTru) {
  batBuocQuyen(nc.hoSo, "finance.approve", { objectType: "sales_return", objectId: id });
  await khoaChungTu(nc.tx, "sales_returns", id);
  const p = await docTraBan(nc, id);
  const tong = dong(p.total.toString());
  if (!chotTienDuoc(p.status, tong)) {
    throw new LoiNghiepVu(
      p.kind === "doi-may"
        ? "Phiếu đổi máy không phát sinh tiền nên không có gì để chốt."
        : "Chỉ chốt tiền cho phiếu đã nhận lại hàng.",
      409, "sai-trang-thai",
    );
  }

  const ids = d.phanBo.map((x) => x.hoaDonId);
  // Khóa hóa đơn (tăng dần theo id, sau phiếu trả) trước khi đọc phần còn nợ — cùng thứ tự khóa
  // với thu tiền bên tài chính, nên chốt giảm trừ và thu tiền cùng lúc không cùng trừ một khoản nợ.
  await khoaChungTu(nc.tx, "invoices", ids);
  const hoaDon = await nc.tx.invoice.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, number: true, customerId: true, ownerId: true, status: true, total: true,
      allocations: { select: { amount: true, payment: { select: { status: true } } } },
      returnAllocations: { select: { amount: true, salesReturn: { select: { status: true } } } },
    },
  });
  if (hoaDon.length !== new Set(ids).size) throw new LoiKhongTimThay("Hóa đơn");

  const kemConNo = d.phanBo.map((pb) => {
    const hd = hoaDon.find((x) => x.id === pb.hoaDonId)!;
    if (hd.customerId !== p.customer.id) throw new LoiDinhDang("phanBo", `Hóa đơn ${hd.number} thuộc khách khác.`);
    if (hd.status !== "ISSUED") throw new LoiNghiepVu(`Hóa đơn ${hd.number} chưa phát hành hoặc đã hủy — chưa giảm trừ được.`, 409, "hoa-don-chua-phat-hanh");
    const daThu = hd.allocations.filter((a) => a.payment.status === "hoat-dong").reduce((s, a) => s + Number(a.amount), 0);
    const daGiamTru = hd.returnAllocations.filter((a) => a.salesReturn.status === "SETTLED").reduce((s, a) => s + Number(a.amount), 0);
    const cn = congNo(hd.status, hd.total.toString(), daThu, { daGiamTru });
    return { soTien: pb.soTien, conNo: cn.conNo, hoaDon: hd, congNoSau: cn };
  });

  const kiem = kiemPhanBoGiamTru(tong, 0, kemConNo);
  if (!kiem.hopLe) throw new LoiNghiepVu(kiem.lyDo!, 409, "giam-tru-khong-hop-le", { tongPhanBo: kiem.tongPhanBo, tongPhieu: tong });

  await nc.tx.salesReturnAllocation.createMany({
    data: d.phanBo.map((pb) => ({
      tenantId: nc.tenantId,
      returnId: id,
      invoiceId: pb.hoaDonId,
      amount: String(dong(pb.soTien)),
    })),
  });
  await nc.tx.salesReturn.update({
    where: { id },
    data: {
      status: "SETTLED",
      settledAt: new Date(),
      settledBy: nc.hoSo.userId,
      notes: d.ghiChu ? [p.notes, d.ghiChu].filter(Boolean).join(" · ") : p.notes,
      updatedBy: nc.hoSo.userId,
    },
  });

  await nc.kiemToan({ action: "sua", objectType: "sales_return", objectId: id, before: { trangThai: p.status }, after: { trangThai: "SETTLED", tongGiamTru: kiem.tongPhanBo } });
  await nc.suKien({ eventType: SU_KIEN.SALES_RETURN_SETTLED, objectType: "sales_return", objectId: id, payload: { so: p.number, tongGiamTru: kiem.tongPhanBo, soHoaDon: d.phanBo.length } });

  // Hóa đơn nào vừa hết nợ nhờ giảm trừ thì báo cho người phụ trách.
  for (const x of kemConNo) {
    const conSau = x.congNoSau.conNo - dong(x.soTien);
    if (conSau > 0) continue;
    await nc.suKien({ eventType: SU_KIEN.INVOICE_PAID, objectType: "invoice", objectId: x.hoaDon.id, payload: { so: x.hoaDon.number, bangGiamTru: true } });
    if (x.hoaDon.ownerId !== nc.hoSo.userId) {
      await taoThongBao(nc.tx, nc.tenantId, {
        nguoiNhanId: x.hoaDon.ownerId,
        loai: "hoa-don-het-no",
        tieuDe: `Hóa đơn ${x.hoaDon.number} đã hết nợ`,
        noiDung: `Phần còn lại được giảm trừ bằng phiếu trả hàng ${p.number}.`,
        duongDan: `/tai-chinh/hoa-don/${x.hoaDon.id}`,
        doiTuong: "invoice",
        doiTuongId: x.hoaDon.id,
        khoaChongTrung: `hoa-don-het-no:${x.hoaDon.id}`,
      });
    }
  }

  return { id, trangThai: "SETTLED", tongGiamTru: kiem.tongPhanBo };
}

/** TH-09: chỉ hủy được phiếu còn nháp. Hàng đã qua kho thì phải xử bằng chứng từ ngược. */
export async function huyTraHangBan(nc: NguCanh, id: string, lyDo: string) {
  batBuocMotTrong(nc, QUYEN_LAP_BAN, "sales_return", id);
  await khoaChungTu(nc.tx, "sales_returns", id);
  const p = await docTraBan(nc, id);
  if (!huyDuoc(p.status)) {
    throw new LoiNghiepVu("Hàng đã đi qua kho rồi — không hủy phiếu được. Lập phiếu ngược hoặc điều chỉnh tồn kèm lý do.", 409, "sai-trang-thai");
  }
  await nc.tx.salesReturn.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: lyDo, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "sua", objectType: "sales_return", objectId: id, before: { trangThai: p.status }, after: { trangThai: "CANCELLED", lyDo } });
  await nc.suKien({ eventType: SU_KIEN.SALES_RETURN_CANCELLED, objectType: "sales_return", objectId: id, payload: { so: p.number, lyDo } });
  return { id, trangThai: "CANCELLED" };
}

// ---------------------------------------------------------------------------
// Ghi: trả hàng cho nhà cung cấp
// ---------------------------------------------------------------------------

async function kiemSoLuongTraMua(nc: NguCanh, dong2: { dongDonId: string | null; soLuong: string; ten: string }[]) {
  const ids = dong2.map((d) => d.dongDonId).filter((x): x is string => Boolean(x));
  if (ids.length === 0) return;

  const [dongDon, daTra] = await Promise.all([
    nc.tx.purchaseOrderItem.findMany({ where: { id: { in: ids } }, select: { id: true, receivedQty: true } }),
    nc.tx.purchaseReturnItem.groupBy({
      by: ["orderItemId"],
      where: { orderItemId: { in: ids }, purchaseReturn: { status: { not: "CANCELLED" } } },
      _sum: { quantity: true },
    }),
  ]);
  const nhan = new Map(dongDon.map((x) => [x.id, x.receivedQty.toString()]));
  const tra = new Map(daTra.map((x) => [x.orderItemId, Number(x._sum.quantity ?? 0)]));

  for (const d of dong2) {
    if (!d.dongDonId) continue;
    const daNhan = nhan.get(d.dongDonId);
    if (daNhan === undefined) throw new LoiDinhDang("dong", "Dòng hàng không thuộc đơn mua này.");
    const con = soLuongTraToiDa(daNhan, tra.get(d.dongDonId) ?? 0);
    if (Number(d.soLuong) > con + 0.0005) {
      throw new LoiNghiepVu(
        `${d.ten}: mới nhận ${daNhan} và đã trả ${tra.get(d.dongDonId) ?? 0}, chỉ còn trả được ${con}.`,
        409, "tra-qua-so-luong", { dongDonId: d.dongDonId, conTraDuoc: con },
      );
    }
  }
}

export async function taoTraHangMua(nc: NguCanh, d: DuLieuTaoTraHangMua) {
  batBuocQuyen(nc.hoSo, "purchasing.update", { objectType: "purchase_return" });
  const ncc = await nc.tx.supplier.findFirst({ where: { id: d.nhaCungCapId }, select: { id: true, name: true, status: true } });
  if (!ncc) throw new LoiKhongTimThay("Nhà cung cấp");
  if (ncc.status !== "hoat-dong") throw new LoiNghiepVu("Nhà cung cấp này đã ngừng hợp tác.", 409, "ncc-ngung");
  const kho = await batBuocThayKho(nc, d.khoId);
  if (kho.trangThai !== "hoat-dong") throw new LoiNghiepVu("Kho này đã ngừng hoạt động.", 409, "kho-ngung");

  if (d.donMuaId) {
    const don = await nc.tx.purchaseOrder.findFirst({ where: { id: d.donMuaId }, select: { id: true, supplierId: true, number: true } });
    if (!don) throw new LoiKhongTimThay("Đơn mua");
    if (don.supplierId !== ncc.id) throw new LoiDinhDang("donMuaId", `Đơn mua ${don.number} thuộc nhà cung cấp khác.`);
  }

  await kiemSoLuongTraMua(nc, d.dong.map((x) => ({ dongDonId: x.dongDonId ?? null, soLuong: x.soLuong, ten: x.ten })));

  const tinh = tinhDonMua(d.dong.map((x) => ({ soLuong: x.soLuong, donGia: x.donGia, vat: x.vat })));
  const so = await capSoChungTu(nc.tx, KIEU_SO.traHangMua);

  const p = await nc.tx.purchaseReturn.create({
    data: {
      tenantId: nc.tenantId,
      number: so,
      supplierId: ncc.id,
      purchaseOrderId: d.donMuaId || null,
      warehouseId: kho.id,
      ownerId: nc.hoSo.userId,
      returnDate: ngayVeDate(d.ngayTra || homNayVN()),
      reason: d.lyDo,
      notes: d.ghiChu || null,
      subtotal: String(tinh.tamTinh),
      vatTotal: String(tinh.tongVat),
      total: String(tinh.tongCong),
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
      items: {
        create: d.dong.map((x, i) => ({
          tenantId: nc.tenantId,
          lineNo: i + 1,
          orderItemId: x.dongDonId || null,
          productId: x.sanPhamId || null,
          name: x.ten,
          quantity: x.soLuong,
          unit: x.donViTinh || null,
          unitPrice: x.donGia,
          vatRate: String(x.vat),
          lineTotal: String(tinh.dong[i].thanhTien),
          note: [x.ghiChu, x.serial.length > 0 ? `${DAU_SERIAL} ${x.serial.join(", ")}` : ""].filter(Boolean).join(" · ") || null,
        })),
      },
    },
    select: { id: true, number: true },
  });

  await nc.kiemToan({ action: "tao", objectType: "purchase_return", objectId: p.id, after: { so, nhaCungCapId: ncc.id, tongCong: tinh.tongCong } });
  await nc.suKien({ eventType: SU_KIEN.PURCHASE_RETURN_CREATED, objectType: "purchase_return", objectId: p.id, payload: { so, nhaCungCapId: ncc.id } });
  return { id: p.id, so };
}

/** Xác nhận: hàng thật sự ra khỏi kho để gửi trả nhà cung cấp. */
export async function xacNhanTraHangMua(nc: NguCanh, id: string, d: DuLieuXacNhanTraHang) {
  batBuocQuyen(nc.hoSo, "inventory.update", { objectType: "purchase_return", objectId: id });
  await khoaChungTu(nc.tx, "purchase_returns", id);
  const p = await docTraMua(nc, id);
  if (!xacNhanDuoc(p.status)) throw new LoiNghiepVu("Chỉ xác nhận được phiếu còn nháp.", 409, "sai-trang-thai");
  if (p.warehouse.status !== "hoat-dong") throw new LoiNghiepVu("Kho của phiếu đã ngừng hoạt động.", 409, "kho-ngung");

  const keHoach: { sanPhamId: string | null; soLuong: number; quanLyTon: boolean; serial: { id: string }[] }[] = [];
  for (const dongDb of p.items) {
    const sl = Number(dongDb.quantity);
    const khai = docSerialTuGhiChu(dongDb.note, DAU_SERIAL);
    const serial: { id: string }[] = [];
    if (dongDb.product?.requiresSerial) {
      if (khai.length !== sl) {
        throw new LoiNghiepVu(
          `${dongDb.name} quản lý theo số sê-ri: cần đúng ${sl} sê-ri trả đi, đang có ${khai.length}.`,
          400, "thieu-serial", { dongId: dongDb.id, canCo: sl, dangCo: khai.length },
        );
      }
      for (const s of khai) {
        const sn = await nc.tx.serialNumber.findFirst({
          where: { productId: dongDb.productId ?? undefined, serial: s },
          select: { id: true, status: true, warehouseId: true },
        });
        if (!sn) throw new LoiNghiepVu(`Số sê-ri ${s} không có trong hệ thống.`, 409, "serial-khong-co", { serial: s });
        if (sn.status !== "trong-kho") throw new LoiNghiepVu(`Số sê-ri ${s} không còn trong kho.`, 409, "serial-da-dung", { serial: s });
        if (sn.warehouseId !== p.warehouse.id) throw new LoiNghiepVu(`Số sê-ri ${s} đang nằm ở kho khác.`, 409, "serial-khac-kho", { serial: s });
        serial.push({ id: sn.id });
      }
    }
    keHoach.push({ sanPhamId: dongDb.productId, soLuong: sl, quanLyTon: dongDb.product?.quanLyTon ?? false, serial });
  }

  for (const k of keHoach) {
    if (k.sanPhamId && k.quanLyTon) {
      await ghiSoKho(nc, {
        khoId: p.warehouse.id,
        sanPhamId: k.sanPhamId,
        loai: "xuat",
        soLuong: k.soLuong,
        loaiChungTu: "tra-hang-mua",
        chungTuId: p.id,
        soChungTu: p.number,
        lyDo: `Trả hàng nhà cung cấp theo phiếu ${p.number}`,
        ghiChu: d.ghiChu || null,
      });
    }
    for (const s of k.serial) {
      await nc.tx.serialNumber.update({
        where: { id: s.id },
        data: { status: "tra-lai", warehouseId: null },
      });
    }
  }

  await nc.tx.purchaseReturn.update({
    where: { id },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      confirmedBy: nc.hoSo.userId,
      notes: d.ghiChu ? [p.notes, d.ghiChu].filter(Boolean).join(" · ") : p.notes,
      updatedBy: nc.hoSo.userId,
    },
  });

  await nc.kiemToan({ action: "sua", objectType: "purchase_return", objectId: id, before: { trangThai: p.status }, after: { trangThai: "CONFIRMED" } });
  await nc.suKien({ eventType: SU_KIEN.PURCHASE_RETURN_CONFIRMED, objectType: "purchase_return", objectId: id, payload: { so: p.number, khoId: p.warehouse.id } });
  return { id, trangThai: "CONFIRMED", tongCong: p.total.toString() };
}

/** Chốt tiền: giảm trừ vào hóa đơn nhà cung cấp còn nợ (TH-07). */
export async function chotGiamTruMua(nc: NguCanh, id: string, d: DuLieuChotGiamTru) {
  batBuocQuyen(nc.hoSo, "finance.approve", { objectType: "purchase_return", objectId: id });
  await khoaChungTu(nc.tx, "purchase_returns", id);
  const p = await docTraMua(nc, id);
  const tong = dong(p.total.toString());
  if (!chotTienDuoc(p.status, tong)) throw new LoiNghiepVu("Chỉ chốt tiền cho phiếu đã trả hàng đi.", 409, "sai-trang-thai");

  const ids = d.phanBo.map((x) => x.hoaDonId);
  await khoaChungTu(nc.tx, "supplier_bills", ids);
  const hoaDon = await nc.tx.supplierBill.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, number: true, supplierId: true, status: true, total: true,
      allocations: { select: { amount: true, payment: { select: { status: true } } } },
      returnAllocations: { select: { amount: true, purchaseReturn: { select: { status: true } } } },
    },
  });
  if (hoaDon.length !== new Set(ids).size) throw new LoiKhongTimThay("Hóa đơn nhà cung cấp");

  const kemConNo = d.phanBo.map((pb) => {
    const hd = hoaDon.find((x) => x.id === pb.hoaDonId)!;
    if (hd.supplierId !== p.supplier.id) throw new LoiDinhDang("phanBo", `Hóa đơn ${hd.number} thuộc nhà cung cấp khác.`);
    if (hd.status !== "RECORDED") throw new LoiNghiepVu(`Hóa đơn ${hd.number} chưa ghi nhận hoặc đã hủy — chưa giảm trừ được.`, 409, "hoa-don-chua-ghi-nhan");
    const daTra = hd.allocations.filter((a) => a.payment.status === "hoat-dong").reduce((s, a) => s + Number(a.amount), 0);
    const daGiamTru = hd.returnAllocations.filter((a) => a.purchaseReturn.status === "SETTLED").reduce((s, a) => s + Number(a.amount), 0);
    const cn = congNo(hd.status, hd.total.toString(), daTra, { trangThaiTinh: "RECORDED", daGiamTru });
    return { soTien: pb.soTien, conNo: cn.conNo };
  });

  const kiem = kiemPhanBoGiamTru(tong, 0, kemConNo);
  if (!kiem.hopLe) throw new LoiNghiepVu(kiem.lyDo!, 409, "giam-tru-khong-hop-le", { tongPhanBo: kiem.tongPhanBo, tongPhieu: tong });

  await nc.tx.purchaseReturnAllocation.createMany({
    data: d.phanBo.map((pb) => ({
      tenantId: nc.tenantId,
      returnId: id,
      billId: pb.hoaDonId,
      amount: String(dong(pb.soTien)),
    })),
  });
  await nc.tx.purchaseReturn.update({
    where: { id },
    data: {
      status: "SETTLED",
      settledAt: new Date(),
      settledBy: nc.hoSo.userId,
      notes: d.ghiChu ? [p.notes, d.ghiChu].filter(Boolean).join(" · ") : p.notes,
      updatedBy: nc.hoSo.userId,
    },
  });

  await nc.kiemToan({ action: "sua", objectType: "purchase_return", objectId: id, before: { trangThai: p.status }, after: { trangThai: "SETTLED", tongGiamTru: kiem.tongPhanBo } });
  await nc.suKien({ eventType: SU_KIEN.PURCHASE_RETURN_SETTLED, objectType: "purchase_return", objectId: id, payload: { so: p.number, tongGiamTru: kiem.tongPhanBo, soHoaDon: d.phanBo.length } });
  return { id, trangThai: "SETTLED", tongGiamTru: kiem.tongPhanBo };
}

export async function huyTraHangMua(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "purchasing.update", { objectType: "purchase_return", objectId: id });
  await khoaChungTu(nc.tx, "purchase_returns", id);
  const p = await docTraMua(nc, id);
  if (!huyDuoc(p.status)) {
    throw new LoiNghiepVu("Hàng đã ra khỏi kho rồi — không hủy phiếu được. Lập phiếu nhập hoặc điều chỉnh tồn kèm lý do.", 409, "sai-trang-thai");
  }
  await nc.tx.purchaseReturn.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: lyDo, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "sua", objectType: "purchase_return", objectId: id, before: { trangThai: p.status }, after: { trangThai: "CANCELLED", lyDo } });
  await nc.suKien({ eventType: SU_KIEN.PURCHASE_RETURN_CANCELLED, objectType: "purchase_return", objectId: id, payload: { so: p.number, lyDo } });
  return { id, trangThai: "CANCELLED" };
}
