import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, type KieuSo } from "@/lib/so-chung-tu";
import { homNayVN, kiemTraMaDuLieuGoc, ngayVeDate } from "@/modules/crm/chung";
import { batBuocThayKho, ghiSoKho } from "@/modules/kho/service";
import {
  donMuaDaDong,
  donMuaSuaDuoc,
  deNghiSuaDuoc,
  nhanDuocHang,
  tienDoNhan,
  tinhDonMua,
} from "./tinh-toan";
import type {
  BoLocDeNghi,
  BoLocDonMua,
  DuLieuNhanHang,
  DuLieuQuyetDuyetDeNghi,
  DuLieuSuaDeNghi,
  DuLieuSuaDonMua,
  DuLieuTaoDeNghi,
  DuLieuTaoDonMua,
} from "./luoc-do";

/**
 * Mua hàng — phần để lại từ Phase 5. Luật: BUSINESS_RULES.md mục 16 (MH).
 *
 * Ba chứng từ nối nhau: **đề nghị mua** (ai cần gì, vì sao) → **đơn mua** (đặt nhà cung
 * cấp nào, giá bao nhiêu) → **nhận hàng** (hàng thật vào kho).
 *
 * Điểm quan trọng nhất: nhận hàng ghi vào kho bằng **đúng hàm `ghiSoKho()`** mà bán hàng
 * dùng để xuất. Không có đường ghi tồn riêng cho mua hàng, nên số dư và sổ cái kho không
 * bao giờ lệch nhau, và `doiSoatKho()` của Phase 5 vẫn đúng sau khi có mua hàng.
 */

const KIEU_SO_DE_NGHI: KieuSo = { loai: "purchase_request", tienTo: "DN", doDai: 4, theoNam: true };
const KIEU_SO_DON_MUA: KieuSo = { loai: "purchase_order", tienTo: "DM", doDai: 4, theoNam: true };
const KIEU_SO_NHAN_HANG: KieuSo = { loai: "goods_receipt", tienTo: "NK", doDai: 4, theoNam: true };

// ---------------------------------------------------------------------------
// Đề nghị mua
// ---------------------------------------------------------------------------

const CHON_DN = {
  id: true, number: true, status: true, needByDate: true, reason: true, note: true,
  approvedAt: true, decisionNote: true, cancelReason: true, requesterId: true,
  createdAt: true, updatedAt: true,
  requester: { select: { id: true, fullName: true } },
  salesOrder: { select: { id: true, number: true } },
  items: {
    orderBy: { lineNo: "asc" },
    select: {
      id: true, lineNo: true, productId: true, sku: true, name: true, quantity: true,
      unit: true, estimatedPrice: true, note: true,
      supplier: { select: { id: true, code: true, name: true } },
    },
  },
} satisfies Prisma.PurchaseRequestSelect;

type BanGhiDN = Prisma.PurchaseRequestGetPayload<{ select: typeof CHON_DN }>;

function deNghiRa(d: BanGhiDN) {
  const tongDuKien = d.items.reduce((s, x) => s + Number(x.quantity) * Number(x.estimatedPrice), 0);
  return {
    id: d.id,
    so: d.number,
    trangThai: d.status,
    ngayCan: d.needByDate,
    lyDo: d.reason,
    ghiChu: d.note,
    duyetLuc: d.approvedAt,
    ghiChuQuyetDinh: d.decisionNote,
    lyDoHuy: d.cancelReason,
    nguoiDeNghi: { id: d.requester.id, hoTen: d.requester.fullName },
    donBan: d.salesOrder ? { id: d.salesOrder.id, so: d.salesOrder.number } : null,
    tongDuKien: Math.round(tongDuKien),
    dong: d.items.map((x) => ({
      id: x.id,
      thuTu: x.lineNo,
      sanPhamId: x.productId,
      sku: x.sku,
      ten: x.name,
      soLuong: x.quantity.toString(),
      donViTinh: x.unit,
      giaDuKien: x.estimatedPrice.toString(),
      nhaCungCap: x.supplier ? { id: x.supplier.id, ma: x.supplier.code, ten: x.supplier.name } : null,
      ghiChu: x.note,
    })),
    taoLuc: d.createdAt,
  };
}

/** Phạm vi xem đề nghị mua: theo người đề nghị (quyền `purchasing.view`). */
export async function dieuKienXemDeNghi(nc: NguCanh): Promise<Prisma.PurchaseRequestWhereInput> {
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "purchasing.view");
  if (pv === "tat-ca") return {};
  return { requesterId: { in: pv } };
}

async function docDeNghi(nc: NguCanh, id: string): Promise<BanGhiDN> {
  const d = await nc.tx.purchaseRequest.findFirst({
    where: { AND: [{ id }, await dieuKienXemDeNghi(nc)] },
    select: CHON_DN,
  });
  if (!d) throw new LoiKhongTimThay("Đề nghị mua");
  return d;
}

export async function danhSachDeNghi(nc: NguCanh, boLoc: BoLocDeNghi) {
  batBuocQuyen(nc.hoSo, "purchasing.view");
  const dieuKien: Prisma.PurchaseRequestWhereInput[] = [await dieuKienXemDeNghi(nc)];
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { number: { contains: boLoc.q, mode: "insensitive" } },
        { reason: { contains: boLoc.q, mode: "insensitive" } },
        { items: { some: { name: { contains: boLoc.q, mode: "insensitive" } } } },
      ],
    });
  }
  if (boLoc.choDuyet === "1") dieuKien.push({ status: "PENDING_APPROVAL" });
  else if (boLoc.trangThai === "") dieuKien.push({ status: { notIn: ["REJECTED", "CANCELLED", "ORDERED"] } });
  else if (boLoc.trangThai !== "tat-ca") dieuKien.push({ status: boLoc.trangThai });

  const where: Prisma.PurchaseRequestWhereInput = { AND: dieuKien };
  const [tong, ds] = await Promise.all([
    nc.tx.purchaseRequest.count({ where }),
    nc.tx.purchaseRequest.findMany({
      where,
      orderBy: { number: "desc" },
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
      select: CHON_DN,
    }),
  ]);
  return { tong, trang: boLoc.trang, coTrang: boLoc.coTrang, dong: ds.map(deNghiRa) };
}

export async function chiTietDeNghi(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "purchasing.view", { objectType: "purchase_request", objectId: id });
  const d = await docDeNghi(nc, id);
  const donMua = await nc.tx.purchaseOrder.findMany({
    where: { requestId: id },
    select: { id: true, number: true, status: true, total: true, supplier: { select: { name: true } } },
    orderBy: { number: "asc" },
  });
  const duocSua = coQuyen(nc.hoSo, "purchasing.update") && deNghiSuaDuoc(d.status);
  return {
    deNghi: deNghiRa(d),
    donMua: donMua.map((o) => ({ id: o.id, so: o.number, trangThai: o.status, tongCong: o.total.toString(), nhaCungCap: o.supplier.name })),
    quyen: {
      sua: duocSua,
      xinDuyet: duocSua && d.items.length > 0,
      // Người đề nghị KHÔNG tự duyệt, trừ khi có quyền duyệt phạm vi toàn công ty (MH-02).
      duyet:
        coQuyen(nc.hoSo, "purchasing.approve") &&
        d.status === "PENDING_APPROVAL" &&
        (d.requesterId !== nc.hoSo.userId || (await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "purchasing.approve")) === "tat-ca"),
      taoDonMua: coQuyen(nc.hoSo, "purchasing.create") && d.status === "APPROVED",
      huy: coQuyen(nc.hoSo, "purchasing.update") && !["ORDERED", "CANCELLED"].includes(d.status),
    },
  };
}

async function ghiDongDeNghi(nc: NguCanh, deNghiId: string, dong: DuLieuTaoDeNghi["dong"]) {
  await nc.tx.purchaseRequestItem.deleteMany({ where: { requestId: deNghiId } });
  const sanPhamIds = dong.map((d) => d.sanPhamId).filter((x): x is string => Boolean(x));
  const sp = new Map(
    (await nc.tx.product.findMany({ where: { id: { in: sanPhamIds } }, select: { id: true, sku: true, unit: true } })).map((p) => [p.id, p]),
  );
  for (const [i, d] of dong.entries()) {
    if (d.sanPhamId && !sp.has(d.sanPhamId)) throw new LoiDinhDang("dong", `Không tìm thấy sản phẩm ở dòng ${i + 1}.`);
    await nc.tx.purchaseRequestItem.create({
      data: {
        tenantId: nc.tenantId,
        requestId: deNghiId,
        lineNo: i + 1,
        productId: d.sanPhamId || null,
        sku: d.sanPhamId ? (sp.get(d.sanPhamId)?.sku ?? null) : null,
        name: d.ten,
        quantity: d.soLuong,
        unit: d.donViTinh || (d.sanPhamId ? (sp.get(d.sanPhamId)?.unit ?? null) : null),
        estimatedPrice: d.giaDuKien || "0",
        supplierId: d.nhaCungCapId || null,
        note: d.ghiChu || null,
      },
    });
  }
}

export async function taoDeNghi(nc: NguCanh, d: DuLieuTaoDeNghi) {
  batBuocQuyen(nc.hoSo, "purchasing.create", { objectType: "purchase_request" });
  if (d.donBanId) {
    const don = await nc.tx.salesOrder.findFirst({ where: { id: d.donBanId }, select: { id: true, status: true } });
    if (!don) throw new LoiDinhDang("donBanId", "Không tìm thấy đơn bán.");
    if (don.status === "CANCELLED") throw new LoiNghiepVu("Đơn bán đã hủy thì không đề nghị mua cho nó.", 409, "don-da-huy");
  }

  const so = await capSoChungTu(nc.tx, KIEU_SO_DE_NGHI);
  const dn = await nc.tx.purchaseRequest.create({
    data: {
      tenantId: nc.tenantId,
      number: so,
      salesOrderId: d.donBanId || null,
      requesterId: nc.hoSo.userId,
      needByDate: d.ngayCan ? ngayVeDate(d.ngayCan) : null,
      reason: d.lyDo || null,
      note: d.ghiChu || null,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: { id: true },
  });
  await ghiDongDeNghi(nc, dn.id, d.dong);

  await nc.kiemToan({ action: "tao", objectType: "purchase_request", objectId: dn.id, after: { so, soDong: d.dong.length } });
  await nc.suKien({ eventType: SU_KIEN.PURCHASE_REQUESTED, objectType: "purchase_request", objectId: dn.id, payload: { so, soDong: d.dong.length } });
  return { id: dn.id, so };
}

export async function suaDeNghi(nc: NguCanh, id: string, d: DuLieuSuaDeNghi) {
  batBuocQuyen(nc.hoSo, "purchasing.update", { objectType: "purchase_request", objectId: id });
  const dn = await docDeNghi(nc, id);
  if (!deNghiSuaDuoc(dn.status)) throw new LoiNghiepVu("Chỉ sửa được đề nghị đang ở trạng thái Nháp.", 409, "sai-trang-thai");

  await nc.tx.purchaseRequest.update({
    where: { id },
    data: {
      ...(d.ngayCan !== undefined ? { needByDate: d.ngayCan ? ngayVeDate(d.ngayCan) : null } : {}),
      ...(d.lyDo !== undefined ? { reason: d.lyDo || null } : {}),
      ...(d.ghiChu !== undefined ? { note: d.ghiChu || null } : {}),
      updatedBy: nc.hoSo.userId,
    },
  });
  if (d.dong) {
    if (d.dong.length === 0) throw new LoiDinhDang("dong", "Đề nghị mua phải có ít nhất một dòng.");
    await ghiDongDeNghi(nc, id, d.dong);
  }
  await nc.kiemToan({ action: "sua", objectType: "purchase_request", objectId: id, after: { soDong: d.dong?.length ?? dn.items.length } });
  return { id };
}

export async function xinDuyetDeNghi(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "purchasing.update", { objectType: "purchase_request", objectId: id });
  const dn = await docDeNghi(nc, id);
  if (dn.status !== "DRAFT") throw new LoiNghiepVu("Chỉ xin duyệt được đề nghị đang ở trạng thái Nháp.", 409, "sai-trang-thai");
  if (dn.items.length === 0) throw new LoiNghiepVu("Đề nghị chưa có dòng hàng nào.", 409, "chua-co-hang");

  await nc.tx.purchaseRequest.update({ where: { id }, data: { status: "PENDING_APPROVAL", updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "purchase_request", objectId: id, before: { trangThai: "DRAFT" }, after: { trangThai: "PENDING_APPROVAL" } });
  return { id, trangThai: "PENDING_APPROVAL" };
}

/** MH-02: duyệt hoặc từ chối. Người đề nghị KHÔNG tự duyệt trừ khi có quyền duyệt toàn công ty. */
export async function quyetDuyetDeNghi(nc: NguCanh, id: string, d: DuLieuQuyetDuyetDeNghi) {
  batBuocQuyen(nc.hoSo, "purchasing.approve", { objectType: "purchase_request", objectId: id });
  const dn = await docDeNghi(nc, id);
  if (dn.status !== "PENDING_APPROVAL") throw new LoiNghiepVu("Đề nghị này không ở trạng thái chờ duyệt.", 409, "sai-trang-thai");

  if (dn.requesterId === nc.hoSo.userId) {
    const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "purchasing.approve");
    if (pv !== "tat-ca") {
      throw new LoiNghiepVu("Người đề nghị không tự duyệt đề nghị của mình.", 403, "tu-duyet");
    }
  }
  if (d.quyetDinh === "tu-choi" && !d.ghiChu) {
    throw new LoiDinhDang("ghiChu", "Từ chối đề nghị mua phải ghi lý do.");
  }

  const moi = d.quyetDinh === "cho-duyet" ? "APPROVED" : "REJECTED";
  await nc.tx.purchaseRequest.update({
    where: { id },
    data: {
      status: moi,
      approvedBy: nc.hoSo.userId,
      approvedAt: new Date(),
      decisionNote: d.ghiChu || null,
      updatedBy: nc.hoSo.userId,
    },
  });
  await nc.kiemToan({
    action: "sua",
    objectType: "purchase_request",
    objectId: id,
    before: { trangThai: "PENDING_APPROVAL" },
    after: { trangThai: moi, ghiChu: d.ghiChu },
  });
  await nc.suKien({
    eventType: moi === "APPROVED" ? SU_KIEN.PURCHASE_REQUEST_APPROVED : SU_KIEN.PURCHASE_REQUEST_REJECTED,
    objectType: "purchase_request",
    objectId: id,
    payload: { so: dn.number, ghiChu: d.ghiChu },
  });
  return { id, trangThai: moi };
}

export async function huyDeNghi(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "purchasing.update", { objectType: "purchase_request", objectId: id });
  const dn = await docDeNghi(nc, id);
  if (dn.status === "CANCELLED") throw new LoiNghiepVu("Đề nghị này đã hủy rồi.", 409, "da-huy");
  if (dn.status === "ORDERED") throw new LoiNghiepVu("Đề nghị đã chuyển thành đơn mua — hủy đơn mua trước.", 409, "da-dat-hang");

  await nc.tx.purchaseRequest.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: lyDo, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "sua", objectType: "purchase_request", objectId: id, before: { trangThai: dn.status }, after: { trangThai: "CANCELLED", lyDo } });
  return { id, trangThai: "CANCELLED" };
}

// ---------------------------------------------------------------------------
// Đơn mua
// ---------------------------------------------------------------------------

const CHON_DM = {
  id: true, number: true, status: true, orderDate: true, expectedDate: true,
  paymentTerms: true, notes: true, subtotal: true, discountTotal: true, vatTotal: true,
  total: true, sentAt: true, confirmedAt: true, completedAt: true, cancelReason: true,
  ownerId: true, createdAt: true, updatedAt: true,
  supplier: { select: { id: true, code: true, name: true, phone: true, email: true } },
  warehouse: { select: { id: true, code: true, name: true } },
  owner: { select: { id: true, fullName: true } },
  request: { select: { id: true, number: true } },
  items: {
    orderBy: { lineNo: "asc" },
    select: {
      id: true, lineNo: true, productId: true, sku: true, name: true, quantity: true,
      unit: true, unitPrice: true, discountPct: true, vatRate: true, lineTotal: true, receivedQty: true,
      product: { select: { id: true, requiresSerial: true, quanLyTon: true } },
    },
  },
} satisfies Prisma.PurchaseOrderSelect;

type BanGhiDM = Prisma.PurchaseOrderGetPayload<{ select: typeof CHON_DM }>;

function donMuaRa(o: BanGhiDM) {
  const tienDo = tienDoNhan(o.items.map((x) => ({ soLuong: x.quantity.toString(), daNhan: x.receivedQty.toString() })));
  return {
    id: o.id,
    so: o.number,
    trangThai: o.status,
    ngayDat: o.orderDate,
    ngayHenGiao: o.expectedDate,
    dieuKhoanThanhToan: o.paymentTerms,
    ghiChu: o.notes,
    tamTinh: o.subtotal.toString(),
    tongChietKhau: o.discountTotal.toString(),
    tongVat: o.vatTotal.toString(),
    tongCong: o.total.toString(),
    guiLuc: o.sentAt,
    xacNhanLuc: o.confirmedAt,
    nhanXongLuc: o.completedAt,
    lyDoHuy: o.cancelReason,
    nhaCungCap: { id: o.supplier.id, ma: o.supplier.code, ten: o.supplier.name, dienThoai: o.supplier.phone, email: o.supplier.email },
    kho: { id: o.warehouse.id, ma: o.warehouse.code, ten: o.warehouse.name },
    nguoiPhuTrach: { id: o.owner.id, hoTen: o.owner.fullName },
    deNghi: o.request ? { id: o.request.id, so: o.request.number } : null,
    tienDo,
    dong: o.items.map((x) => ({
      id: x.id,
      thuTu: x.lineNo,
      sanPhamId: x.productId,
      sku: x.sku,
      ten: x.name,
      soLuong: x.quantity.toString(),
      donViTinh: x.unit,
      donGia: x.unitPrice.toString(),
      chietKhau: x.discountPct.toString(),
      vat: x.vatRate.toString(),
      thanhTien: x.lineTotal.toString(),
      daNhan: x.receivedQty.toString(),
      conPhaiNhan: Math.max(0, Number(x.quantity) - Number(x.receivedQty)),
      theoSerial: x.product?.requiresSerial ?? false,
      quanLyTon: x.product?.quanLyTon ?? false,
    })),
    taoLuc: o.createdAt,
  };
}

export async function dieuKienXemDonMua(nc: NguCanh): Promise<Prisma.PurchaseOrderWhereInput> {
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "purchasing.view");
  if (pv === "tat-ca") return {};
  return { ownerId: { in: pv } };
}

async function docDonMua(nc: NguCanh, id: string): Promise<BanGhiDM> {
  const o = await nc.tx.purchaseOrder.findFirst({
    where: { AND: [{ id }, await dieuKienXemDonMua(nc)] },
    select: CHON_DM,
  });
  if (!o) throw new LoiKhongTimThay("Đơn mua");
  return o;
}

export async function danhSachDonMua(nc: NguCanh, boLoc: BoLocDonMua) {
  batBuocQuyen(nc.hoSo, "purchasing.view");
  const dieuKien: Prisma.PurchaseOrderWhereInput[] = [await dieuKienXemDonMua(nc)];
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { number: { contains: boLoc.q, mode: "insensitive" } },
        { supplier: { name: { contains: boLoc.q, mode: "insensitive" } } },
        { items: { some: { name: { contains: boLoc.q, mode: "insensitive" } } } },
      ],
    });
  }
  if (boLoc.nhaCungCap) dieuKien.push({ supplierId: boLoc.nhaCungCap });
  if (boLoc.trangThai === "") dieuKien.push({ status: { notIn: ["RECEIVED", "CANCELLED"] } });
  else if (boLoc.trangThai !== "tat-ca") dieuKien.push({ status: boLoc.trangThai });

  const where: Prisma.PurchaseOrderWhereInput = { AND: dieuKien };
  const [tong, ds] = await Promise.all([
    nc.tx.purchaseOrder.count({ where }),
    nc.tx.purchaseOrder.findMany({
      where,
      orderBy: { number: "desc" },
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
      select: CHON_DM,
    }),
  ]);
  return { tong, trang: boLoc.trang, coTrang: boLoc.coTrang, dong: ds.map(donMuaRa) };
}

export async function chiTietDonMua(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "purchasing.view", { objectType: "purchase_order", objectId: id });
  const o = await docDonMua(nc, id);
  const phieuNhan = await nc.tx.goodsReceipt.findMany({
    where: { purchaseOrderId: id },
    orderBy: { number: "asc" },
    select: {
      id: true, number: true, receivedAt: true, supplierDocNo: true, note: true,
      items: { select: { quantity: true, orderItem: { select: { name: true } } } },
    },
  });
  const duocSua = coQuyen(nc.hoSo, "purchasing.update") && donMuaSuaDuoc(o.status);
  return {
    donMua: donMuaRa(o),
    phieuNhan: phieuNhan.map((p) => ({
      id: p.id,
      so: p.number,
      ngayNhan: p.receivedAt,
      soChungTuNcc: p.supplierDocNo,
      ghiChu: p.note,
      dong: p.items.map((x) => ({ ten: x.orderItem.name, soLuong: x.quantity.toString() })),
    })),
    quyen: {
      sua: duocSua,
      gui: duocSua && o.items.length > 0,
      xacNhan: coQuyen(nc.hoSo, "purchasing.update") && o.status === "SENT",
      nhanHang: coQuyen(nc.hoSo, "inventory.update") && nhanDuocHang(o.status),
      huy: coQuyen(nc.hoSo, "purchasing.update") && !donMuaDaDong(o.status),
    },
  };
}

async function ghiDongDonMua(nc: NguCanh, donMuaId: string, dong: DuLieuTaoDonMua["dong"]) {
  await nc.tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: donMuaId } });
  const sanPhamIds = dong.map((d) => d.sanPhamId).filter((x): x is string => Boolean(x));
  const sp = new Map(
    (await nc.tx.product.findMany({ where: { id: { in: sanPhamIds } }, select: { id: true, sku: true, unit: true } })).map((p) => [p.id, p]),
  );
  const tinh = tinhDonMua(dong.map((d) => ({ soLuong: d.soLuong, donGia: d.donGia, chietKhau: d.chietKhau, vat: d.vat })));

  for (const [i, d] of dong.entries()) {
    if (d.sanPhamId && !sp.has(d.sanPhamId)) throw new LoiDinhDang("dong", `Không tìm thấy sản phẩm ở dòng ${i + 1}.`);
    await nc.tx.purchaseOrderItem.create({
      data: {
        tenantId: nc.tenantId,
        purchaseOrderId: donMuaId,
        lineNo: i + 1,
        requestItemId: d.deNghiDongId || null,
        productId: d.sanPhamId || null,
        sku: d.sanPhamId ? (sp.get(d.sanPhamId)?.sku ?? null) : null,
        name: d.ten,
        quantity: d.soLuong,
        unit: d.donViTinh || (d.sanPhamId ? (sp.get(d.sanPhamId)?.unit ?? null) : null),
        unitPrice: d.donGia,
        discountPct: String(d.chietKhau ?? 0),
        vatRate: String(d.vat ?? 10),
        lineTotal: String(tinh.dong[i].thanhTien),
      },
    });
  }
  await nc.tx.purchaseOrder.update({
    where: { id: donMuaId },
    data: {
      subtotal: String(tinh.tamTinh),
      discountTotal: String(tinh.tongChietKhau),
      vatTotal: String(tinh.tongVat),
      total: String(tinh.tongCong),
    },
  });
  return tinh;
}

export async function taoDonMua(nc: NguCanh, d: DuLieuTaoDonMua) {
  batBuocQuyen(nc.hoSo, "purchasing.create", { objectType: "purchase_order" });
  const ncc = await nc.tx.supplier.findFirst({ where: { id: d.nhaCungCapId }, select: { id: true, status: true, paymentTerms: true, name: true } });
  if (!ncc) throw new LoiDinhDang("nhaCungCapId", "Không tìm thấy nhà cung cấp.");
  if (ncc.status !== "hoat-dong") throw new LoiNghiepVu(`Nhà cung cấp ${ncc.name} đã ngừng hợp tác.`, 409, "ncc-ngung");

  const kho = await batBuocThayKho(nc, d.khoId);
  if (kho.trangThai !== "hoat-dong") throw new LoiNghiepVu("Kho này đã ngừng hoạt động.", 409, "kho-ngung");
  await kiemTraMaDuLieuGoc(nc, "dieu_khoan_thanh_toan", d.dieuKhoanThanhToan, "dieuKhoanThanhToan");

  let deNghi: { id: string; number: string } | null = null;
  if (d.deNghiId) {
    const dn = await docDeNghi(nc, d.deNghiId);
    if (dn.status !== "APPROVED") throw new LoiNghiepVu("Chỉ đặt hàng từ đề nghị đã được duyệt (MH-03).", 409, "de-nghi-chua-duyet");
    deNghi = { id: dn.id, number: dn.number };
  }

  const so = await capSoChungTu(nc.tx, KIEU_SO_DON_MUA);
  const o = await nc.tx.purchaseOrder.create({
    data: {
      tenantId: nc.tenantId,
      number: so,
      supplierId: ncc.id,
      requestId: deNghi?.id ?? null,
      ownerId: nc.hoSo.userId,
      warehouseId: kho.id,
      orderDate: ngayVeDate(homNayVN()),
      expectedDate: d.ngayHenGiao ? ngayVeDate(d.ngayHenGiao) : null,
      paymentTerms: d.dieuKhoanThanhToan || ncc.paymentTerms || null,
      notes: d.ghiChu || null,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: { id: true },
  });
  const tinh = await ghiDongDonMua(nc, o.id, d.dong);

  if (deNghi) {
    await nc.tx.purchaseRequest.update({ where: { id: deNghi.id }, data: { status: "ORDERED", updatedBy: nc.hoSo.userId } });
  }

  await nc.kiemToan({
    action: "tao",
    objectType: "purchase_order",
    objectId: o.id,
    after: { so, nhaCungCap: ncc.name, tongCong: tinh.tongCong, tuDeNghi: deNghi?.number ?? null },
  });
  await nc.suKien({
    eventType: SU_KIEN.PURCHASE_ORDER_CREATED,
    objectType: "purchase_order",
    objectId: o.id,
    payload: { so, nhaCungCapId: ncc.id, tongCong: tinh.tongCong },
  });
  return { id: o.id, so };
}

export async function suaDonMua(nc: NguCanh, id: string, d: DuLieuSuaDonMua) {
  batBuocQuyen(nc.hoSo, "purchasing.update", { objectType: "purchase_order", objectId: id });
  const o = await docDonMua(nc, id);
  if (!donMuaSuaDuoc(o.status)) {
    throw new LoiNghiepVu("Đơn đã gửi nhà cung cấp thì không sửa dòng hàng nữa (MH-04).", 409, "sai-trang-thai");
  }
  if (d.khoId) {
    const kho = await batBuocThayKho(nc, d.khoId);
    if (kho.trangThai !== "hoat-dong") throw new LoiNghiepVu("Kho này đã ngừng hoạt động.", 409, "kho-ngung");
  }
  await kiemTraMaDuLieuGoc(nc, "dieu_khoan_thanh_toan", d.dieuKhoanThanhToan, "dieuKhoanThanhToan");

  await nc.tx.purchaseOrder.update({
    where: { id },
    data: {
      ...(d.khoId ? { warehouseId: d.khoId } : {}),
      ...(d.ngayHenGiao !== undefined ? { expectedDate: d.ngayHenGiao ? ngayVeDate(d.ngayHenGiao) : null } : {}),
      ...(d.dieuKhoanThanhToan !== undefined ? { paymentTerms: d.dieuKhoanThanhToan || null } : {}),
      ...(d.ghiChu !== undefined ? { notes: d.ghiChu || null } : {}),
      updatedBy: nc.hoSo.userId,
    },
  });
  if (d.dong) {
    if (d.dong.length === 0) throw new LoiDinhDang("dong", "Đơn mua phải có ít nhất một dòng.");
    await ghiDongDonMua(nc, id, d.dong);
  }
  await nc.kiemToan({ action: "sua", objectType: "purchase_order", objectId: id, after: { soDong: d.dong?.length ?? o.items.length } });
  return { id };
}

export async function guiDonMua(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "purchasing.update", { objectType: "purchase_order", objectId: id });
  const o = await docDonMua(nc, id);
  if (o.status !== "DRAFT") throw new LoiNghiepVu("Chỉ gửi được đơn đang ở trạng thái Nháp.", 409, "sai-trang-thai");
  if (o.items.length === 0) throw new LoiNghiepVu("Đơn mua chưa có dòng hàng nào.", 409, "chua-co-hang");

  await nc.tx.purchaseOrder.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "purchase_order", objectId: id, before: { trangThai: "DRAFT" }, after: { trangThai: "SENT" } });
  await nc.suKien({ eventType: SU_KIEN.PURCHASE_ORDER_SENT, objectType: "purchase_order", objectId: id, payload: { so: o.number } });
  return { id, trangThai: "SENT" };
}

export async function xacNhanDonMua(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "purchasing.update", { objectType: "purchase_order", objectId: id });
  const o = await docDonMua(nc, id);
  if (o.status !== "SENT") throw new LoiNghiepVu("Chỉ xác nhận được đơn đã gửi nhà cung cấp.", 409, "sai-trang-thai");

  await nc.tx.purchaseOrder.update({ where: { id }, data: { status: "CONFIRMED", confirmedAt: new Date(), updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "purchase_order", objectId: id, before: { trangThai: "SENT" }, after: { trangThai: "CONFIRMED" } });
  return { id, trangThai: "CONFIRMED" };
}

export async function huyDonMua(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "purchasing.update", { objectType: "purchase_order", objectId: id });
  const o = await docDonMua(nc, id);
  if (donMuaDaDong(o.status)) throw new LoiNghiepVu("Đơn đã đóng thì không hủy được.", 409, "sai-trang-thai");

  const daNhan = o.items.reduce((s, x) => s + Number(x.receivedQty), 0);
  if (daNhan > 0) {
    throw new LoiNghiepVu(
      "Đơn đã nhận một phần hàng — hàng vào kho rồi thì không hủy đơn được. Điều chỉnh tồn kho có lý do nếu cần trả hàng.",
      409,
      "da-nhan-hang",
      { daNhan },
    );
  }

  await nc.tx.purchaseOrder.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: lyDo, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "sua", objectType: "purchase_order", objectId: id, before: { trangThai: o.status }, after: { trangThai: "CANCELLED", lyDo } });
  await nc.suKien({ eventType: SU_KIEN.PURCHASE_ORDER_CANCELLED, objectType: "purchase_order", objectId: id, payload: { so: o.number, lyDo } });
  return { id, trangThai: "CANCELLED" };
}

// ---------------------------------------------------------------------------
// Nhận hàng
// ---------------------------------------------------------------------------

/**
 * MH-05, MH-06: nhận hàng vào kho.
 *
 * Hàng vào kho bằng **đúng `ghiSoKho()`** mà bán hàng dùng để xuất — số dư và sổ cái
 * cập nhật trong cùng một giao dịch, nên `doiSoatKho()` vẫn đúng sau khi có mua hàng.
 * Sản phẩm quản lý theo sê-ri phải khai đủ sê-ri, và sê-ri kiểm TRƯỚC khi đụng tồn để
 * lỗi sê-ri không bị che bởi lỗi kho.
 */
export async function nhanHang(nc: NguCanh, id: string, d: DuLieuNhanHang) {
  batBuocQuyen(nc.hoSo, "inventory.update", { objectType: "goods_receipt", objectId: id });
  const o = await docDonMua(nc, id);
  if (!nhanDuocHang(o.status)) {
    throw new LoiNghiepVu("Chỉ nhận hàng cho đơn đã gửi nhà cung cấp và chưa nhận đủ.", 409, "sai-trang-thai");
  }
  const kho = await batBuocThayKho(nc, o.warehouse.id);
  if (kho.trangThai !== "hoat-dong") throw new LoiNghiepVu("Kho nhận hàng đã ngừng hoạt động.", 409, "kho-ngung");

  const ngayNhan = d.ngayNhan || homNayVN();
  if (ngayNhan > homNayVN()) throw new LoiDinhDang("ngayNhan", "Không nhận hàng cho ngày ở tương lai.");

  const theoDong = new Map(o.items.map((x) => [x.id, x]));

  // Kiểm toàn bộ TRƯỚC khi ghi bất cứ thứ gì: một dòng sai thì cả phiếu không được ghi.
  for (const dong of d.dong) {
    const goc = theoDong.get(dong.dongDonId);
    if (!goc) throw new LoiNghiepVu("Dòng hàng không thuộc đơn mua này.", 400, "dong-khong-thuoc-don");
    const sl = Number(dong.soLuong);
    const con = Math.max(0, Number(goc.quantity) - Number(goc.receivedQty));
    if (sl > con + 0.0005) {
      throw new LoiNghiepVu(`${goc.name}: chỉ còn ${con} chưa nhận, không nhận được ${sl}.`, 409, "nhan-qua-so-luong", {
        dongDonId: goc.id,
        conLai: con,
      });
    }
    if (goc.product?.requiresSerial && dong.serial.length !== sl) {
      throw new LoiNghiepVu(
        `${goc.name} quản lý theo số sê-ri: cần đúng ${sl} sê-ri, đang có ${dong.serial.length}.`,
        400,
        "thieu-serial",
        { dongDonId: goc.id, canCo: sl, dangCo: dong.serial.length },
      );
    }
    const rieng = new Set(dong.serial.map((s) => s.trim().toUpperCase()));
    if (rieng.size !== dong.serial.length) {
      throw new LoiNghiepVu(`${goc.name}: có số sê-ri trùng nhau trong cùng phiếu nhận.`, 400, "serial-trung-trong-phieu");
    }
  }

  const so = await capSoChungTu(nc.tx, KIEU_SO_NHAN_HANG);
  const phieu = await nc.tx.goodsReceipt.create({
    data: {
      tenantId: nc.tenantId,
      number: so,
      purchaseOrderId: id,
      warehouseId: o.warehouse.id,
      receivedAt: ngayVeDate(ngayNhan),
      supplierDocNo: d.soChungTuNcc || null,
      note: d.ghiChu || null,
      createdBy: nc.hoSo.userId,
    },
    select: { id: true, number: true },
  });

  for (const dong of d.dong) {
    const goc = theoDong.get(dong.dongDonId)!;
    const sl = Number(dong.soLuong);
    const giaVon = dong.giaVon || goc.unitPrice.toString();

    if (goc.productId && goc.product?.quanLyTon) {
      await ghiSoKho(nc, {
        khoId: o.warehouse.id,
        sanPhamId: goc.productId,
        loai: "nhap",
        soLuong: sl,
        giaVon,
        loaiChungTu: "don-mua",
        chungTuId: id,
        soChungTu: phieu.number,
        lyDo: `Nhận hàng đơn mua ${o.number}`,
      });

      for (const serial of dong.serial) {
        try {
          await nc.tx.serialNumber.create({
            data: {
              tenantId: nc.tenantId,
              productId: goc.productId,
              serial: serial.trim(),
              warehouseId: o.warehouse.id,
              status: "trong-kho",
              createdBy: nc.hoSo.userId,
            },
          });
        } catch (e) {
          if (laLoiTrung(e)) throw new LoiNghiepVu(`Số sê-ri ${serial} của ${goc.name} đã có trong hệ thống.`, 409, "trung-serial", { serial });
          throw e;
        }
      }
    }

    await nc.tx.goodsReceiptItem.create({
      data: { tenantId: nc.tenantId, receiptId: phieu.id, orderItemId: goc.id, quantity: dong.soLuong, unitCost: giaVon },
    });
    await nc.tx.purchaseOrderItem.update({
      where: { id: goc.id },
      data: { receivedQty: { increment: dong.soLuong } },
    });
  }

  // MH-07: trạng thái đơn tính lại từ dữ liệu thật của các dòng, không tin cờ đang lưu.
  const sauKhiNhan = await nc.tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId: id },
    select: { quantity: true, receivedQty: true },
  });
  const tienDo = tienDoNhan(sauKhiNhan.map((x) => ({ soLuong: x.quantity.toString(), daNhan: x.receivedQty.toString() })));
  await nc.tx.purchaseOrder.update({
    where: { id },
    data: {
      status: tienDo.trangThaiMoi,
      ...(tienDo.xongHet ? { completedAt: new Date() } : {}),
      updatedBy: nc.hoSo.userId,
    },
  });

  await nc.kiemToan({
    action: "tao",
    objectType: "goods_receipt",
    objectId: phieu.id,
    after: { so: phieu.number, donMua: o.number, soDong: d.dong.length, trangThaiDon: tienDo.trangThaiMoi },
  });
  await nc.suKien({
    eventType: SU_KIEN.STOCK_RECEIVED,
    objectType: "goods_receipt",
    objectId: phieu.id,
    payload: { so: phieu.number, donMuaId: id, soDong: d.dong.length },
  });
  return { id: phieu.id, so: phieu.number, trangThaiDon: tienDo.trangThaiMoi, tienDo };
}

// ---------------------------------------------------------------------------
// Gợi ý: đơn bán thiếu hàng
// ---------------------------------------------------------------------------

/**
 * Với một đơn bán đã xác nhận, liệt kê những dòng mà kho **không đủ hàng để giao** —
 * để lập đề nghị mua mà không phải tự dò từng mặt hàng.
 */
export async function goiYMuaChoDonBan(nc: NguCanh, donBanId: string) {
  batBuocQuyen(nc.hoSo, "purchasing.view");
  const don = await nc.tx.salesOrder.findFirst({
    where: { id: donBanId },
    select: {
      id: true, number: true, status: true,
      items: {
        select: {
          id: true, productId: true, name: true, quantity: true, deliveredQty: true, unit: true,
          product: { select: { id: true, sku: true, quanLyTon: true, costPrice: true, defaultSupplierId: true } },
        },
      },
    },
  });
  if (!don) throw new LoiKhongTimThay("Đơn bán");

  const sanPhamIds = don.items.map((x) => x.productId).filter((x): x is string => Boolean(x));
  const ton = await nc.tx.inventoryBalance.groupBy({
    by: ["productId"],
    where: { productId: { in: sanPhamIds } },
    _sum: { onHand: true, reserved: true },
  });
  const conBan = new Map(ton.map((t) => [t.productId, Number(t._sum.onHand ?? 0) - Number(t._sum.reserved ?? 0)]));

  const thieu = don.items
    .filter((x) => x.product?.quanLyTon)
    .map((x) => {
      const canGiao = Number(x.quantity) - Number(x.deliveredQty);
      const co = Math.max(0, conBan.get(x.productId ?? "") ?? 0);
      return {
        dongDonId: x.id,
        sanPhamId: x.productId,
        sku: x.product?.sku ?? null,
        ten: x.name,
        donViTinh: x.unit,
        canGiao,
        conBanDuoc: co,
        canMua: Math.max(0, canGiao - co),
        giaVonThamChieu: x.product?.costPrice?.toString() ?? "0",
        nhaCungCapGoiYId: x.product?.defaultSupplierId ?? null,
      };
    })
    .filter((x) => x.canMua > 0);

  return { donBan: { id: don.id, so: don.number, trangThai: don.status }, thieu };
}

export { tienDoNhan, tinhDonMua };
