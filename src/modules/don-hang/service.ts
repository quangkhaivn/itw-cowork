import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, KIEU_SO } from "@/lib/so-chung-tu";
import { kiemTraMaDuLieuGoc, kiemTraNguoiPhuTrach, locTheoPhamVi, ngayVeDate, trongPhamVi } from "@/modules/crm/chung";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import { dieuKienXemBaoGia } from "@/modules/bao-gia/service";
import { tinhBaoGia, type DongBaoGia } from "@/modules/bao-gia/tinh-toan";
import { ghiSoKho, batBuocThayKho } from "@/modules/kho/service";
import { conPhaiGiao, duocSuaDong, tienDoGiao } from "./tinh-toan";
import type { BoLocDon, DuLieuSuaDon, DuLieuTaoDon, DuLieuTaoPhieuXuat } from "./luoc-do";

/**
 * Phân hệ Đơn hàng — mục 15 prompt 20/09. Luật: BUSINESS_RULES.md mục 6.
 *
 * Đơn sinh ra từ một phiên bản báo giá KHÁCH ĐÃ CHẤP NHẬN bằng một thao tác: dòng hàng
 * được **chép** sang (không tham chiếu), vì đơn là chứng từ riêng. Tiền tính bằng đúng
 * hàm `tinhBaoGia()` của Phase 4 nên số của đơn khớp số của báo giá đến từng đồng.
 *
 * Đụng kho ở đúng ba chỗ: xác nhận (giữ chỗ), hủy (nhả giữ chỗ), xuất hàng (trừ tồn và
 * nhả phần giữ chỗ tương ứng) — tất cả đi qua `ghiSoKho()` của phân hệ Kho.
 */

const CHON_DONG = {
  id: true, lineNo: true, productId: true, quotationItemId: true, sku: true, name: true, description: true,
  quantity: true, deliveredQty: true, unit: true, unitPrice: true, discountPct: true, vatRate: true,
  unitCost: true, lineTotal: true, lineCost: true,
  product: { select: { id: true, sku: true, requiresSerial: true, quanLyTon: true } },
} satisfies Prisma.SalesOrderItemSelect;

const CHON_DON = {
  id: true, number: true, status: true, orderDate: true, expectedDate: true, deliveryAddress: true,
  paymentTerms: true, deliveryTerms: true, notes: true, subtotal: true, discountTotal: true, vatTotal: true,
  total: true, costTotal: true, grossProfit: true, grossMargin: true, confirmedAt: true, confirmedBy: true,
  completedAt: true, cancelledAt: true, cancelReason: true, createdAt: true, updatedAt: true, ownerId: true,
  customer: { select: { id: true, code: true, name: true, taxCode: true, address: true, phone: true, ownerId: true } },
  contact: { select: { id: true, fullName: true, title: true, phone: true, email: true } },
  quotation: { select: { id: true, number: true } },
  opportunity: { select: { id: true, code: true, title: true } },
  owner: { select: { id: true, fullName: true, email: true } },
  items: { select: CHON_DONG, orderBy: { lineNo: "asc" } },
} satisfies Prisma.SalesOrderSelect;

type BanGhi = Prisma.SalesOrderGetPayload<{ select: typeof CHON_DON }>;

function dongRa(d: Prisma.SalesOrderItemGetPayload<{ select: typeof CHON_DONG }>) {
  return {
    id: d.id,
    thuTu: d.lineNo,
    sanPhamId: d.productId,
    dongBaoGiaId: d.quotationItemId,
    sku: d.sku,
    ten: d.name,
    moTa: d.description,
    soLuong: d.quantity.toString(),
    daGiao: d.deliveredQty.toString(),
    conPhaiGiao: conPhaiGiao(d.quantity.toString(), d.deliveredQty.toString()),
    donViTinh: d.unit,
    donGia: d.unitPrice.toString(),
    chietKhau: d.discountPct.toString(),
    vat: d.vatRate.toString(),
    giaVon: d.unitCost.toString(),
    thanhTien: d.lineTotal.toString(),
    giaVonDong: d.lineCost.toString(),
    theoSerial: d.product?.requiresSerial ?? false,
    quanLyTon: d.product?.quanLyTon ?? false,
  };
}
export type DongDonHang = ReturnType<typeof dongRa>;

function chuyenDoi(d: BanGhi) {
  const dong = d.items.map(dongRa);
  return {
    id: d.id,
    so: d.number,
    trangThai: d.status,
    ngayDat: d.orderDate,
    ngayGiaoDuKien: d.expectedDate,
    diaChiGiao: d.deliveryAddress,
    dieuKhoanThanhToan: d.paymentTerms,
    dieuKhoanGiaoHang: d.deliveryTerms,
    ghiChu: d.notes,
    tamTinh: d.subtotal.toString(),
    tongChietKhau: d.discountTotal.toString(),
    tongVat: d.vatTotal.toString(),
    tongCong: d.total.toString(),
    tongGiaVon: d.costTotal.toString(),
    loiNhuanGop: d.grossProfit.toString(),
    bienLoiNhuan: d.grossMargin === null ? null : Number(d.grossMargin),
    xacNhanLuc: d.confirmedAt,
    hoanThanhLuc: d.completedAt,
    huyLuc: d.cancelledAt,
    lyDoHuy: d.cancelReason,
    taoLuc: d.createdAt,
    suaLuc: d.updatedAt,
    khachHang: { id: d.customer.id, ma: d.customer.code, ten: d.customer.name, maSoThue: d.customer.taxCode, diaChi: d.customer.address, dienThoai: d.customer.phone },
    lienHe: d.contact ? { id: d.contact.id, hoTen: d.contact.fullName, chucDanh: d.contact.title, dienThoai: d.contact.phone, email: d.contact.email } : null,
    baoGia: d.quotation ? { id: d.quotation.id, so: d.quotation.number } : null,
    coHoi: d.opportunity ? { id: d.opportunity.id, ma: d.opportunity.code, tieuDe: d.opportunity.title } : null,
    nguoiPhuTrach: { id: d.owner.id, hoTen: d.owner.fullName, email: d.owner.email },
    dong,
    tienDo: tienDoGiao(dong.map((x) => ({ soLuong: x.soLuong, daGiao: x.daGiao }))),
  };
}
export type DonHangChiTiet = ReturnType<typeof chuyenDoi>;

// ---------------------------------------------------------------------------
// Quyền xem
// ---------------------------------------------------------------------------

/** Đơn người này được xem: đơn của mình (theo phạm vi), cộng đơn của khách mình phụ trách (QĐ-13). */
export async function dieuKienXemDon(nc: NguCanh): Promise<Prisma.SalesOrderWhereInput> {
  const [theoDon, pvKhach] = await Promise.all([
    locTheoPhamVi(nc, "order.view"),
    idNguoiTrongPhamVi(nc.tx, nc.hoSo, "customer.view"),
  ]);
  if (!theoDon.ownerId || pvKhach === "tat-ca") return {};
  return { OR: [theoDon, { customer: { ownerId: { in: pvKhach } } }] };
}

async function docDon(nc: NguCanh, id: string): Promise<BanGhi> {
  const d = await nc.tx.salesOrder.findFirst({ where: { AND: [{ id }, await dieuKienXemDon(nc)] }, select: CHON_DON });
  if (!d) throw new LoiKhongTimThay("Đơn hàng");
  return d;
}

async function batBuocSuaDuoc(nc: NguCanh, d: BanGhi) {
  batBuocQuyen(nc.hoSo, "order.update", { objectType: "sales_order", objectId: d.id });
  if (!(await trongPhamVi(nc, "order.update", d.ownerId))) throw new LoiKhongTimThay("Đơn hàng");
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export async function danhSachDonHang(nc: NguCanh, boLoc: BoLocDon) {
  batBuocQuyen(nc.hoSo, "order.view");
  const dieuKien: Prisma.SalesOrderWhereInput[] = [await dieuKienXemDon(nc)];
  if (boLoc.q) {
    dieuKien.push({
      OR: [{ number: { contains: boLoc.q, mode: "insensitive" } }, { customer: { name: { contains: boLoc.q, mode: "insensitive" } } }],
    });
  }
  if (boLoc.trangThai === "") dieuKien.push({ status: { notIn: ["DELIVERED", "CANCELLED"] } });
  else if (boLoc.trangThai !== "tat-ca") dieuKien.push({ status: boLoc.trangThai });
  if (boLoc.nguoiPhuTrach) dieuKien.push({ ownerId: boLoc.nguoiPhuTrach });
  if (boLoc.khachHang) dieuKien.push({ customerId: boLoc.khachHang });
  if (boLoc.conPhaiGiao === "1") dieuKien.push({ status: { in: ["CONFIRMED", "PARTIALLY_DELIVERED"] } });

  const where: Prisma.SalesOrderWhereInput = { AND: dieuKien };
  const [tong, ds, tatCa] = await Promise.all([
    nc.tx.salesOrder.count({ where }),
    nc.tx.salesOrder.findMany({ where, select: CHON_DON, orderBy: [{ createdAt: "desc" }], skip: (boLoc.trang - 1) * boLoc.coTrang, take: boLoc.coTrang }),
    nc.tx.salesOrder.findMany({ where, select: { status: true, total: true } }),
  ]);

  const dangChay = tatCa.filter((d) => ["DRAFT", "CONFIRMED", "PARTIALLY_DELIVERED"].includes(d.status));
  const daGiao = tatCa.filter((d) => d.status === "DELIVERED");
  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    dong: ds.map(chuyenDoi),
    tomTat: {
      soDangChay: dangChay.length,
      giaTriDangChay: Math.round(dangChay.reduce((s, d) => s + Number(d.total), 0)),
      soDaGiao: daGiao.length,
      giaTriDaGiao: Math.round(daGiao.reduce((s, d) => s + Number(d.total), 0)),
      soChoGiao: tatCa.filter((d) => ["CONFIRMED", "PARTIALLY_DELIVERED"].includes(d.status)).length,
    },
  };
}

export async function chiTietDonHang(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "order.view", { objectType: "sales_order", objectId: id });
  const d = await docDon(nc, id);
  const don = chuyenDoi(d);

  const [phieuXuat, giuCho] = await Promise.all([
    nc.tx.delivery.findMany({
      where: { orderId: id },
      select: {
        id: true, number: true, deliveredAt: true, receiverName: true, note: true, createdBy: true,
        warehouse: { select: { id: true, code: true, name: true } },
        items: { select: { id: true, quantity: true, orderItemId: true, product: { select: { id: true, sku: true, name: true } } } },
      },
      orderBy: { deliveredAt: "desc" },
    }),
    // Hàng đang giữ chỗ cho đơn này, theo kho — đọc từ sổ cái nên không sợ lệch.
    nc.tx.inventoryTransaction.groupBy({
      by: ["warehouseId", "productId"],
      where: { refType: "don-hang", refId: id },
      _sum: { reservedDelta: true },
    }),
  ]);

  const duocSua = coQuyen(nc.hoSo, "order.update") && (await trongPhamVi(nc, "order.update", d.ownerId));
  const duocDuyet = coQuyen(nc.hoSo, "order.approve");

  return {
    don,
    phieuXuat: phieuXuat.map((p) => ({
      id: p.id,
      so: p.number,
      luc: p.deliveredAt,
      nguoiNhan: p.receiverName,
      ghiChu: p.note,
      kho: { id: p.warehouse.id, ma: p.warehouse.code, ten: p.warehouse.name },
      dong: p.items.map((i) => ({ id: i.id, dongDonId: i.orderItemId, soLuong: i.quantity.toString(), sanPham: i.product ? { id: i.product.id, sku: i.product.sku, ten: i.product.name } : null })),
    })),
    giuCho: giuCho
      .map((g) => ({ khoId: g.warehouseId, sanPhamId: g.productId, soLuong: Number(g._sum.reservedDelta ?? 0) }))
      .filter((g) => g.soLuong > 0),
    quyen: {
      sua: duocSua && duocSuaDong(don.trangThai),
      xacNhan: duocDuyet && don.trangThai === "DRAFT" && don.dong.length > 0,
      huy: duocDuyet && ["DRAFT", "CONFIRMED", "PARTIALLY_DELIVERED"].includes(don.trangThai),
      xuatHang: coQuyen(nc.hoSo, "inventory.update") && ["CONFIRMED", "PARTIALLY_DELIVERED"].includes(don.trangThai) && don.tienDo.conLai > 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Ghi: tạo, sửa
// ---------------------------------------------------------------------------

function tinhTien(dong: { soLuong: string; donGia: string; chietKhau: number | string; vat: number | string; giaVon: string }[]) {
  return tinhBaoGia(dong as unknown as DongBaoGia[]);
}

function dungDongGhi(dong: DuLieuTaoDon["dong"], tenantId: string, orderId: string) {
  const tinh = tinhTien(dong.map((d) => ({ soLuong: d.soLuong, donGia: d.donGia, chietKhau: d.chietKhau, vat: d.vat, giaVon: d.giaVon })));
  return {
    tinh,
    data: dong.map((d, i) => ({
      tenantId,
      orderId,
      lineNo: i + 1,
      productId: d.sanPhamId ?? null,
      name: d.ten,
      description: d.moTa || null,
      quantity: d.soLuong,
      unit: d.donViTinh || null,
      unitPrice: d.donGia,
      discountPct: d.chietKhau,
      vatRate: d.vat,
      unitCost: d.giaVon,
      lineTotal: String(tinh.dong[i].thanhTien),
      lineCost: String(tinh.dong[i].giaVonDong),
    })),
  };
}

function tongVeCot(tinh: ReturnType<typeof tinhTien>) {
  return {
    subtotal: String(tinh.tamTinh),
    discountTotal: String(tinh.tongChietKhau),
    vatTotal: String(tinh.tongVat),
    total: String(tinh.tongCong),
    costTotal: String(tinh.tongGiaVon),
    grossProfit: String(tinh.loiNhuanGop),
    grossMargin: tinh.bienLoiNhuan === null ? null : String(tinh.bienLoiNhuan),
  };
}

/** Chụp SKU của sản phẩm lên dòng đơn (đơn giữ nguyên dù danh mục đổi sau). */
async function chupSku(nc: NguCanh, data: { productId: string | null; sku?: string | null }[]) {
  const ids = [...new Set(data.map((d) => d.productId).filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return;
  const ds = await nc.tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true } });
  const theoId = new Map(ds.map((p) => [p.id, p.sku]));
  for (const d of data) if (d.productId) d.sku = theoId.get(d.productId) ?? null;
}

async function kiemTraDieuKhoan(nc: NguCanh, d: { dieuKhoanThanhToan?: string | null; dieuKhoanGiaoHang?: string | null }, truoc?: { paymentTerms: string | null; deliveryTerms: string | null }) {
  await kiemTraMaDuLieuGoc(nc, "dieu_khoan_thanh_toan", d.dieuKhoanThanhToan, "dieuKhoanThanhToan", truoc?.paymentTerms);
  await kiemTraMaDuLieuGoc(nc, "dieu_khoan_giao_hang", d.dieuKhoanGiaoHang, "dieuKhoanGiaoHang", truoc?.deliveryTerms);
}

export async function taoDonHang(nc: NguCanh, d: DuLieuTaoDon) {
  batBuocQuyen(nc.hoSo, "order.create", { objectType: "sales_order" });
  const khach = await batBuocThayKhach(nc, d.khachHangId);
  const nguoiPhuTrachId = d.nguoiPhuTrachId ?? nc.hoSo.userId;
  await kiemTraNguoiPhuTrach(nc, "order.create", nguoiPhuTrachId);
  await kiemTraDieuKhoan(nc, d);

  const so = await capSoChungTu(nc.tx, KIEU_SO.donHang);
  const don = await nc.tx.salesOrder.create({
    data: {
      tenantId: nc.tenantId,
      number: so,
      customerId: khach.id,
      contactId: d.lienHeId || null,
      ownerId: nguoiPhuTrachId,
      orderDate: d.ngayDat ? ngayVeDate(d.ngayDat) : new Date(),
      expectedDate: d.ngayGiaoDuKien ? ngayVeDate(d.ngayGiaoDuKien) : null,
      deliveryAddress: d.diaChiGiao || khach.diaChi || null,
      paymentTerms: d.dieuKhoanThanhToan || null,
      deliveryTerms: d.dieuKhoanGiaoHang || null,
      notes: d.ghiChu || null,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: { id: true, number: true },
  });

  if (d.dong.length) {
    const { tinh, data } = dungDongGhi(d.dong, nc.tenantId, don.id);
    await chupSku(nc, data);
    await nc.tx.salesOrderItem.createMany({ data });
    await nc.tx.salesOrder.update({ where: { id: don.id }, data: tongVeCot(tinh) });
  }

  await nc.kiemToan({ action: "tao", objectType: "sales_order", objectId: don.id, after: { so, khachHangId: khach.id, soDong: d.dong.length } });
  await nc.suKien({ eventType: SU_KIEN.ORDER_CREATED, objectType: "sales_order", objectId: don.id, payload: { so, khachHangId: khach.id } });
  return { id: don.id, so };
}

/**
 * Tạo đơn từ một báo giá khách đã chấp nhận — một thao tác, không nhập lại (DH-01).
 * Mỗi phiên bản báo giá chỉ sinh một đơn; gọi lại trả về đúng đơn đã có.
 */
export async function taoDonTuBaoGia(nc: NguCanh, baoGiaId: string) {
  batBuocQuyen(nc.hoSo, "order.create", { objectType: "sales_order" });
  const bg = await nc.tx.quotation.findFirst({
    where: { AND: [{ id: baoGiaId }, await dieuKienXemBaoGia(nc)] },
    select: {
      id: true, number: true, customerId: true, contactId: true, opportunityId: true, ownerId: true, status: true,
      currentVersion: {
        select: {
          id: true, status: true, paymentTerms: true, deliveryTerms: true, notes: true,
          items: { select: { id: true, productId: true, sku: true, name: true, description: true, quantity: true, unit: true, unitPrice: true, discountPct: true, vatRate: true, unitCost: true }, orderBy: { lineNo: "asc" } },
        },
      },
    },
  });
  if (!bg || !bg.currentVersion) throw new LoiKhongTimThay("Báo giá");
  if (bg.currentVersion.status !== "ACCEPTED") {
    throw new LoiNghiepVu("Chỉ tạo đơn từ báo giá khách đã chấp nhận.", 409, "bao-gia-chua-chot");
  }

  const daCo = await nc.tx.salesOrder.findFirst({
    where: { quotationVersionId: bg.currentVersion.id, status: { not: "CANCELLED" } },
    select: { id: true, number: true },
  });
  if (daCo) return { id: daCo.id, so: daCo.number, daCoTruoc: true };

  const khach = await batBuocThayKhach(nc, bg.customerId);
  const so = await capSoChungTu(nc.tx, KIEU_SO.donHang);
  const tinh = tinhTien(
    bg.currentVersion.items.map((i) => ({
      soLuong: i.quantity.toString(), donGia: i.unitPrice.toString(), chietKhau: i.discountPct.toString(),
      vat: i.vatRate.toString(), giaVon: i.unitCost.toString(),
    })),
  );

  const don = await nc.tx.salesOrder.create({
    data: {
      tenantId: nc.tenantId,
      number: so,
      customerId: bg.customerId,
      contactId: bg.contactId,
      quotationId: bg.id,
      quotationVersionId: bg.currentVersion.id,
      opportunityId: bg.opportunityId,
      ownerId: bg.ownerId,
      orderDate: new Date(),
      deliveryAddress: khach.diaChi || null,
      paymentTerms: bg.currentVersion.paymentTerms,
      deliveryTerms: bg.currentVersion.deliveryTerms,
      notes: bg.currentVersion.notes,
      ...tongVeCot(tinh),
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
      items: {
        create: bg.currentVersion.items.map((i, k) => ({
          tenantId: nc.tenantId,
          lineNo: k + 1,
          productId: i.productId,
          quotationItemId: i.id,
          sku: i.sku,
          name: i.name,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unitPrice: i.unitPrice,
          discountPct: i.discountPct,
          vatRate: i.vatRate,
          unitCost: i.unitCost,
          lineTotal: String(tinh.dong[k].thanhTien),
          lineCost: String(tinh.dong[k].giaVonDong),
        })),
      },
    },
    select: { id: true, number: true },
  });

  await nc.kiemToan({ action: "tao", objectType: "sales_order", objectId: don.id, after: { so, tuBaoGia: bg.number, soDong: bg.currentVersion.items.length } });
  await nc.suKien({ eventType: SU_KIEN.ORDER_CREATED, objectType: "sales_order", objectId: don.id, payload: { so, baoGiaId: bg.id, baoGia: bg.number } });
  return { id: don.id, so, daCoTruoc: false };
}

export async function suaDonHang(nc: NguCanh, id: string, d: DuLieuSuaDon) {
  const truoc = await docDon(nc, id);
  await batBuocSuaDuoc(nc, truoc);
  if (!duocSuaDong(truoc.status)) {
    throw new LoiNghiepVu("Đơn đã xác nhận thì không sửa được nữa. Hủy đơn rồi lập đơn mới nếu khách đổi yêu cầu.", 409, "da-xac-nhan");
  }
  await kiemTraDieuKhoan(nc, d, { paymentTerms: truoc.paymentTerms, deliveryTerms: truoc.deliveryTerms });
  if (d.nguoiPhuTrachId && d.nguoiPhuTrachId !== truoc.ownerId) await kiemTraNguoiPhuTrach(nc, "order.update", d.nguoiPhuTrachId);

  await nc.tx.salesOrder.update({
    where: { id },
    data: {
      ...(d.lienHeId !== undefined && { contactId: d.lienHeId || null }),
      ...(d.nguoiPhuTrachId && { ownerId: d.nguoiPhuTrachId }),
      ...(d.ngayDat && { orderDate: ngayVeDate(d.ngayDat) }),
      ...(d.ngayGiaoDuKien !== undefined && { expectedDate: d.ngayGiaoDuKien ? ngayVeDate(d.ngayGiaoDuKien) : null }),
      ...(d.diaChiGiao !== undefined && { deliveryAddress: d.diaChiGiao || null }),
      ...(d.dieuKhoanThanhToan !== undefined && { paymentTerms: d.dieuKhoanThanhToan || null }),
      ...(d.dieuKhoanGiaoHang !== undefined && { deliveryTerms: d.dieuKhoanGiaoHang || null }),
      ...(d.ghiChu !== undefined && { notes: d.ghiChu || null }),
      updatedBy: nc.hoSo.userId,
    },
  });

  if (d.dong) {
    const { tinh, data } = dungDongGhi(d.dong, nc.tenantId, id);
    await chupSku(nc, data);
    await nc.tx.salesOrderItem.deleteMany({ where: { orderId: id } });
    if (data.length) await nc.tx.salesOrderItem.createMany({ data });
    await nc.tx.salesOrder.update({ where: { id }, data: tongVeCot(tinh) });
  }

  await nc.kiemToan({ action: "sua", objectType: "sales_order", objectId: id, before: { soDong: truoc.items.length }, after: { soDong: d.dong?.length ?? truoc.items.length } });
  return { id };
}

// ---------------------------------------------------------------------------
// Xác nhận, hủy, xuất hàng
// ---------------------------------------------------------------------------

/** Xác nhận đơn: giữ chỗ hàng trong kho cho từng dòng có quản lý tồn (DH-04). */
export async function xacNhanDon(nc: NguCanh, id: string, d: { khoId: string; ghiChu: string | null }) {
  batBuocQuyen(nc.hoSo, "order.approve", { objectType: "sales_order", objectId: id });
  const don = await docDon(nc, id);
  if (don.status !== "DRAFT") throw new LoiNghiepVu("Chỉ xác nhận đơn đang ở trạng thái Nháp.", 409, "sai-trang-thai");
  if (don.items.length === 0) throw new LoiNghiepVu("Đơn chưa có dòng hàng nào.", 409, "don-rong");
  const kho = await batBuocThayKho(nc, d.khoId);
  if (kho.trangThai !== "hoat-dong") throw new LoiNghiepVu("Kho này đã ngừng hoạt động.", 409, "kho-ngung");

  for (const dong of don.items) {
    if (!dong.productId || !dong.product?.quanLyTon) continue;
    await ghiSoKho(nc, {
      khoId: d.khoId,
      sanPhamId: dong.productId,
      loai: "giu-cho",
      soLuong: Number(dong.quantity),
      loaiChungTu: "don-hang",
      chungTuId: id,
      soChungTu: don.number,
      lyDo: "Giữ hàng cho đơn đã xác nhận",
      ghiChu: d.ghiChu,
    });
  }

  await nc.tx.salesOrder.update({
    where: { id },
    data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "sua", objectType: "sales_order", objectId: id, before: { trangThai: don.status }, after: { trangThai: "CONFIRMED", khoId: d.khoId } });
  await nc.suKien({ eventType: SU_KIEN.ORDER_CONFIRMED, objectType: "sales_order", objectId: id, payload: { so: don.number, khoId: d.khoId } });
  await nc.suKien({ eventType: SU_KIEN.STOCK_RESERVED, objectType: "inventory", objectId: id, payload: { so: don.number, khoId: d.khoId } });
  return { id, trangThai: "CONFIRMED" };
}

/** Hủy đơn: nhả toàn bộ phần còn giữ chỗ (DH-07). Hàng đã xuất thì không tự thu về. */
export async function huyDon(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "order.approve", { objectType: "sales_order", objectId: id });
  const don = await docDon(nc, id);
  if (don.status === "CANCELLED") throw new LoiNghiepVu("Đơn này đã hủy rồi.", 409, "da-huy");
  if (don.status === "DELIVERED") throw new LoiNghiepVu("Đơn đã giao đủ thì không hủy. Dùng nghiệp vụ trả hàng khi có (Phase 6).", 409, "da-giao-du");

  const giuCho = await nc.tx.inventoryTransaction.groupBy({
    by: ["warehouseId", "productId"],
    where: { refType: "don-hang", refId: id },
    _sum: { reservedDelta: true },
  });
  for (const g of giuCho) {
    const con = Number(g._sum.reservedDelta ?? 0);
    if (con <= 0) continue;
    await ghiSoKho(nc, {
      khoId: g.warehouseId,
      sanPhamId: g.productId,
      loai: "nha-giu-cho",
      soLuong: con,
      loaiChungTu: "don-hang",
      chungTuId: id,
      soChungTu: don.number,
      lyDo: "Hủy đơn — nhả hàng giữ chỗ",
      ghiChu: lyDo,
    });
  }

  await nc.tx.salesOrder.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: nc.hoSo.userId, cancelReason: lyDo, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "sua", objectType: "sales_order", objectId: id, before: { trangThai: don.status }, after: { trangThai: "CANCELLED", lyDo } });
  await nc.suKien({ eventType: SU_KIEN.ORDER_CANCELLED, objectType: "sales_order", objectId: id, payload: { so: don.number, lyDo } });
  await nc.suKien({ eventType: SU_KIEN.STOCK_RELEASED, objectType: "inventory", objectId: id, payload: { so: don.number } });
  return { id, trangThai: "CANCELLED" };
}

/**
 * Lập phiếu xuất cho đơn: trừ tồn, nhả phần giữ chỗ tương ứng, cộng số đã giao,
 * và tự đặt lại trạng thái đơn theo tiến độ (DH-05, DH-06).
 */
export async function taoPhieuXuat(nc: NguCanh, id: string, d: DuLieuTaoPhieuXuat) {
  batBuocQuyen(nc.hoSo, "inventory.update", { objectType: "delivery", objectId: id });
  const don = await docDon(nc, id);
  if (!["CONFIRMED", "PARTIALLY_DELIVERED"].includes(don.status)) {
    throw new LoiNghiepVu("Chỉ xuất hàng cho đơn đã xác nhận và chưa giao xong.", 409, "sai-trang-thai");
  }
  const kho = await batBuocThayKho(nc, d.khoId);
  if (kho.trangThai !== "hoat-dong") throw new LoiNghiepVu("Kho này đã ngừng hoạt động.", 409, "kho-ngung");

  const theoDong = new Map(don.items.map((x) => [x.id, x]));
  const giuCho = await nc.tx.inventoryTransaction.groupBy({
    by: ["productId"],
    where: { refType: "don-hang", refId: id, warehouseId: d.khoId },
    _sum: { reservedDelta: true },
  });
  const conGiuCho = new Map(giuCho.map((g) => [g.productId, Number(g._sum.reservedDelta ?? 0)]));

  const so = await capSoChungTu(nc.tx, KIEU_SO.phieuXuat);
  const phieu = await nc.tx.delivery.create({
    data: {
      tenantId: nc.tenantId, number: so, orderId: id, warehouseId: d.khoId,
      receiverName: d.nguoiNhan || null, note: d.ghiChu || null, createdBy: nc.hoSo.userId,
    },
    select: { id: true, number: true },
  });

  for (const dong of d.dong) {
    const goc = theoDong.get(dong.dongDonId);
    if (!goc) throw new LoiNghiepVu("Dòng hàng không thuộc đơn này.", 400, "dong-khong-thuoc-don");
    const sl = Number(dong.soLuong);
    const con = conPhaiGiao(goc.quantity.toString(), goc.deliveredQty.toString());
    if (sl > con + 0.0005) {
      throw new LoiNghiepVu(`${goc.name}: chỉ còn ${con} chưa giao, không xuất được ${sl}.`, 409, "xuat-qua-so-luong", { dongDonId: goc.id, conLai: con });
    }

    // Kiểm sê-ri trước khi đụng tồn kho — lỗi sê-ri phải nói rõ là lỗi sê-ri.
    const serialSeDung: string[] = [];
    if (goc.product?.requiresSerial) {
      if (dong.serial.length !== sl) {
        throw new LoiNghiepVu(`${goc.name} quản lý theo số sê-ri: cần đúng ${sl} sê-ri, đang có ${dong.serial.length}.`, 400, "thieu-serial", { dongDonId: goc.id, canCo: sl });
      }
      for (const serial of dong.serial) {
        const s = await nc.tx.serialNumber.findFirst({
          where: { productId: goc.productId ?? undefined, serial: serial.trim() },
          select: { id: true, status: true, warehouseId: true },
        });
        if (!s) throw new LoiNghiepVu(`Số sê-ri ${serial} chưa có trong kho — nhập kho trước khi xuất.`, 409, "serial-khong-co", { serial });
        if (s.status !== "trong-kho") throw new LoiNghiepVu(`Số sê-ri ${serial} không còn trong kho (đang ở trạng thái ${s.status}).`, 409, "serial-da-dung", { serial });
        if (s.warehouseId !== d.khoId) throw new LoiNghiepVu(`Số sê-ri ${serial} đang nằm ở kho khác.`, 409, "serial-khac-kho", { serial });
        serialSeDung.push(s.id);
      }
    }

    if (goc.productId && goc.product?.quanLyTon) {
      const nhaGiuCho = Math.min(sl, Math.max(0, conGiuCho.get(goc.productId) ?? 0));
      await ghiSoKho(nc, {
        khoId: d.khoId,
        sanPhamId: goc.productId,
        loai: "xuat",
        soLuong: sl,
        nhaGiuCho,
        giaVon: goc.unitCost.toString(),
        loaiChungTu: "don-hang",
        chungTuId: id,
        soChungTu: so,
        lyDo: `Giao hàng cho đơn ${don.number}`,
        ghiChu: d.ghiChu || null,
      });
      conGiuCho.set(goc.productId, Math.max(0, (conGiuCho.get(goc.productId) ?? 0) - nhaGiuCho));
    }

    for (const serialId of serialSeDung) {
      await nc.tx.serialNumber.update({
        where: { id: serialId },
        data: { status: "da-ban", warehouseId: null, salesOrderItemId: goc.id, deliveryId: phieu.id },
      });
    }

    await nc.tx.deliveryItem.create({
      data: { tenantId: nc.tenantId, deliveryId: phieu.id, orderItemId: goc.id, productId: goc.productId, quantity: String(sl) },
    });
    await nc.tx.salesOrderItem.update({
      where: { id: goc.id },
      data: { deliveredQty: String(Number(goc.deliveredQty) + sl) },
    });
  }

  const sauKhiXuat = await nc.tx.salesOrderItem.findMany({ where: { orderId: id }, select: { quantity: true, deliveredQty: true } });
  const tienDo = tienDoGiao(sauKhiXuat.map((x) => ({ soLuong: x.quantity.toString(), daGiao: x.deliveredQty.toString() })));
  await nc.tx.salesOrder.update({
    where: { id },
    data: {
      status: tienDo.trangThaiMoi,
      ...(tienDo.xongHet && { completedAt: new Date() }),
      updatedBy: nc.hoSo.userId,
    },
  });

  await nc.kiemToan({ action: "tao", objectType: "delivery", objectId: phieu.id, after: { so, donHang: don.number, soDong: d.dong.length } });
  await nc.suKien({ eventType: SU_KIEN.DELIVERY_COMPLETED, objectType: "delivery", objectId: phieu.id, payload: { so, donHang: don.number, khoId: d.khoId } });
  if (tienDo.xongHet) {
    await nc.suKien({ eventType: SU_KIEN.ORDER_COMPLETED, objectType: "sales_order", objectId: id, payload: { so: don.number } });
  }
  return { id: phieu.id, so, trangThaiDon: tienDo.trangThaiMoi, tienDo };
}
