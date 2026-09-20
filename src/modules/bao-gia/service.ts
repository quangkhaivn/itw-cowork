import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, KIEU_SO } from "@/lib/so-chung-tu";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { homNayVN, kiemTraMaDuLieuGoc, kiemTraNguoiPhuTrach, locTheoPhamVi, ngayVeDate, tienVeChuoi, trongPhamVi } from "@/modules/crm/chung";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import { batBuocThayCoHoi } from "@/modules/co-hoi/service";
import { canDuyet, chuaGui, daChot, hetHieuLuc, tinhBaoGia, type DongBaoGia } from "./tinh-toan";
import type { BoLocBaoGia, DuLieuDongBaoGia, DuLieuSuaPhienBan, DuLieuTaoBaoGia } from "./luoc-do";

/**
 * Phân hệ Báo giá — mục 10–14 prompt 20/09. Luật: BUSINESS_RULES.md mục 5.
 *
 * Kiến trúc: `quotations` là đầu phiếu (số QT-2026-0001, khách hàng, người phụ trách);
 * mỗi `quotation_versions` là một bản gửi khách. Sửa bản đã gửi = **tạo phiên bản mới**,
 * bản cũ chuyển `SUPERSEDED` và ở nguyên đó — không bao giờ mất lịch sử (mục 11 prompt).
 *
 * Quyền `quotation.*`; phạm vi theo `quotations.owner_id`, cộng đường "chủ tài khoản khách"
 * như cơ hội (QĐ-13): ai thấy khách thì thấy báo giá của khách đó.
 */

const CHON_DONG = {
  id: true, lineNo: true, productId: true, sku: true, name: true, description: true,
  quantity: true, unit: true, unitPrice: true, discountPct: true, vatRate: true,
  unitCost: true, supplierId: true, lineTotal: true, lineCost: true,
} satisfies Prisma.QuotationItemSelect;

const CHON_PHIEN_BAN = {
  id: true, versionNo: true, status: true, paymentTerms: true, deliveryTerms: true,
  warrantyTerms: true, validUntil: true, notes: true, subtotal: true, discountTotal: true,
  vatTotal: true, total: true, costTotal: true, grossProfit: true, grossMargin: true,
  sentAt: true, decidedAt: true, decisionNote: true, createdAt: true, updatedAt: true,
  items: { select: CHON_DONG, orderBy: { lineNo: "asc" } },
  approvals: {
    select: {
      id: true, requiredReason: true, marginAtRequest: true, thresholdAtRequest: true,
      requestedBy: true, requestedAt: true, decidedBy: true, decision: true, decidedAt: true, comment: true,
    },
    orderBy: { requestedAt: "desc" },
  },
} satisfies Prisma.QuotationVersionSelect;

const CHON_BAO_GIA = {
  id: true, number: true, status: true, createdAt: true, updatedAt: true, ownerId: true,
  customer: { select: { id: true, code: true, name: true, taxCode: true, address: true, phone: true, email: true, ownerId: true } },
  contact: { select: { id: true, fullName: true, title: true, phone: true, email: true } },
  opportunity: { select: { id: true, code: true, title: true, stage: true } },
  owner: { select: { id: true, fullName: true, email: true, phone: true } },
  currentVersion: { select: CHON_PHIEN_BAN },
} satisfies Prisma.QuotationSelect;

type BanGhi = Prisma.QuotationGetPayload<{ select: typeof CHON_BAO_GIA }>;
type BanGhiPhienBan = Prisma.QuotationVersionGetPayload<{ select: typeof CHON_PHIEN_BAN }>;

function dongRa(d: Prisma.QuotationItemGetPayload<{ select: typeof CHON_DONG }>) {
  return {
    id: d.id,
    thuTu: d.lineNo,
    sanPhamId: d.productId,
    sku: d.sku,
    ten: d.name,
    moTa: d.description,
    soLuong: d.quantity.toString(),
    donViTinh: d.unit,
    donGia: d.unitPrice.toString(),
    chietKhau: d.discountPct.toString(),
    vat: d.vatRate.toString(),
    giaVon: d.unitCost.toString(),
    nhaCungCapId: d.supplierId,
    thanhTien: d.lineTotal.toString(),
    giaVonDong: d.lineCost.toString(),
  };
}

function phienBanRa(v: BanGhiPhienBan, homNay: string) {
  const qua = hetHieuLuc(v.validUntil, homNay);
  return {
    id: v.id,
    phienBan: v.versionNo,
    trangThai: v.status,
    /** Trạng thái hiển thị: bản đã gửi mà quá hạn hiệu lực thì coi là hết hiệu lực. */
    trangThaiHienThi: qua && ["SENT", "VIEWED", "NEGOTIATING"].includes(v.status) ? "EXPIRED" : v.status,
    dieuKhoanThanhToan: v.paymentTerms,
    dieuKhoanGiaoHang: v.deliveryTerms,
    dieuKhoanBaoHanh: v.warrantyTerms,
    hieuLucDen: v.validUntil,
    ghiChu: v.notes,
    tamTinh: v.subtotal.toString(),
    tongChietKhau: v.discountTotal.toString(),
    tongVat: v.vatTotal.toString(),
    tongCong: v.total.toString(),
    tongGiaVon: v.costTotal.toString(),
    loiNhuanGop: v.grossProfit.toString(),
    bienLoiNhuan: v.grossMargin === null ? null : Number(v.grossMargin),
    guiLuc: v.sentAt,
    chotLuc: v.decidedAt,
    ghiChuChot: v.decisionNote,
    taoLuc: v.createdAt,
    dong: v.items.map(dongRa),
    duyet: v.approvals.map((a) => ({
      id: a.id,
      lyDo: a.requiredReason,
      bienLucXin: a.marginAtRequest === null ? null : Number(a.marginAtRequest),
      nguongLucXin: a.thresholdAtRequest === null ? null : Number(a.thresholdAtRequest),
      nguoiXinId: a.requestedBy,
      xinLuc: a.requestedAt,
      nguoiQuyetId: a.decidedBy,
      quyetDinh: a.decision,
      quyetLuc: a.decidedAt,
      ghiChu: a.comment,
    })),
  };
}

function chuyenDoi(q: BanGhi, homNay: string) {
  return {
    id: q.id,
    so: q.number,
    trangThai: q.status,
    taoLuc: q.createdAt,
    suaLuc: q.updatedAt,
    khachHang: { id: q.customer.id, ma: q.customer.code, ten: q.customer.name, maSoThue: q.customer.taxCode, diaChi: q.customer.address, dienThoai: q.customer.phone, email: q.customer.email },
    lienHe: q.contact ? { id: q.contact.id, hoTen: q.contact.fullName, chucDanh: q.contact.title, dienThoai: q.contact.phone, email: q.contact.email } : null,
    coHoi: q.opportunity ? { id: q.opportunity.id, ma: q.opportunity.code, tieuDe: q.opportunity.title, giaiDoan: q.opportunity.stage } : null,
    nguoiPhuTrach: { id: q.owner.id, hoTen: q.owner.fullName, email: q.owner.email, dienThoai: q.owner.phone },
    phienBanHienHanh: q.currentVersion ? phienBanRa(q.currentVersion, homNay) : null,
  };
}
export type BaoGiaChiTiet = ReturnType<typeof chuyenDoi>;

// ---------------------------------------------------------------------------
// Quyền xem / sửa
// ---------------------------------------------------------------------------

/** Điều kiện Prisma: những báo giá người này được xem (QĐ-13, như cơ hội). */
export async function dieuKienXemBaoGia(nc: NguCanh): Promise<Prisma.QuotationWhereInput> {
  const [theoBaoGia, pvKhach] = await Promise.all([
    locTheoPhamVi(nc, "quotation.view"),
    idNguoiTrongPhamVi(nc.tx, nc.hoSo, "customer.view"),
  ]);
  if (!theoBaoGia.ownerId || pvKhach === "tat-ca") return {};
  return { OR: [theoBaoGia, { customer: { ownerId: { in: pvKhach } } }] };
}

async function docBaoGia(nc: NguCanh, id: string): Promise<BanGhi> {
  const q = await nc.tx.quotation.findFirst({ where: { AND: [{ id }, await dieuKienXemBaoGia(nc)] }, select: CHON_BAO_GIA });
  if (!q) throw new LoiKhongTimThay("Báo giá");
  return q;
}

async function docBaoGiaDuocSua(nc: NguCanh, id: string): Promise<BanGhi> {
  batBuocQuyen(nc.hoSo, "quotation.update", { objectType: "quotation", objectId: id });
  const q = await docBaoGia(nc, id);
  if (!(await trongPhamVi(nc, "quotation.update", q.ownerId))) {
    throw new LoiNghiepVu("Bạn chỉ xem được báo giá này, không sửa được (ngoài phạm vi phụ trách).", 403, "ngoai-pham-vi");
  }
  return q;
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export async function danhSachBaoGia(nc: NguCanh, boLoc: BoLocBaoGia) {
  batBuocQuyen(nc.hoSo, "quotation.view");
  const homNay = homNayVN();
  const dieuKien: Prisma.QuotationWhereInput[] = [await dieuKienXemBaoGia(nc)];
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { number: { contains: boLoc.q, mode: "insensitive" } },
        { customer: { name: { contains: boLoc.q, mode: "insensitive" } } },
      ],
    });
  }
  if (boLoc.choDuyet === "1") dieuKien.push({ status: "PENDING_APPROVAL" });
  else if (boLoc.trangThai === "" ) dieuKien.push({ status: { notIn: ["ACCEPTED", "REJECTED", "EXPIRED"] } });
  else if (boLoc.trangThai !== "tat-ca") dieuKien.push({ status: boLoc.trangThai });
  if (boLoc.nguoiPhuTrach) dieuKien.push({ ownerId: boLoc.nguoiPhuTrach });
  if (boLoc.khachHang) dieuKien.push({ customerId: boLoc.khachHang });

  const where: Prisma.QuotationWhereInput = { AND: dieuKien };
  const [tong, dong, tatCa] = await Promise.all([
    nc.tx.quotation.count({ where }),
    nc.tx.quotation.findMany({ where, select: CHON_BAO_GIA, orderBy: [{ updatedAt: "desc" }], skip: (boLoc.trang - 1) * boLoc.coTrang, take: boLoc.coTrang }),
    nc.tx.quotation.findMany({ where, select: { status: true, currentVersion: { select: { total: true, grossMargin: true } } } }),
  ]);

  const dangChay = tatCa.filter((q) => ["SENT", "VIEWED", "NEGOTIATING", "APPROVED", "PENDING_APPROVAL", "DRAFT"].includes(q.status));
  const tongGiaTri = dangChay.reduce((s, q) => s + Number(q.currentVersion?.total?.toString() ?? 0), 0);
  const daNhan = tatCa.filter((q) => q.status === "ACCEPTED");
  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    dong: dong.map((q) => chuyenDoi(q, homNay)),
    tomTat: {
      soDangChay: dangChay.length,
      giaTriDangChay: Math.round(tongGiaTri),
      soDaNhan: daNhan.length,
      giaTriDaNhan: Math.round(daNhan.reduce((s, q) => s + Number(q.currentVersion?.total?.toString() ?? 0), 0)),
      soChoDuyet: tatCa.filter((q) => q.status === "PENDING_APPROVAL").length,
    },
  };
}

export async function chiTietBaoGia(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "quotation.view", { objectType: "quotation", objectId: id });
  const homNay = homNayVN();
  const q = await docBaoGia(nc, id);
  const cacPhienBan = await nc.tx.quotationVersion.findMany({
    where: { quotationId: id },
    select: { id: true, versionNo: true, status: true, total: true, grossMargin: true, createdAt: true, sentAt: true },
    orderBy: { versionNo: "desc" },
  });
  const nguoiLienQuan = await nc.tx.user.findMany({
    where: { id: { in: [...new Set((q.currentVersion?.approvals ?? []).flatMap((a) => [a.requestedBy, a.decidedBy]).filter((x): x is string => Boolean(x)))] } },
    select: { id: true, fullName: true },
  });
  const nguong = await docCauHinh(nc.tx, "bao_gia.nguong_bien_loi_nhuan");
  // Đơn đã sinh từ báo giá này (Phase 5) — để không ai bấm tạo đơn lần thứ hai.
  const donHang = await nc.tx.salesOrder.findFirst({
    where: { quotationId: id, status: { not: "CANCELLED" } },
    select: { id: true, number: true, status: true },
    orderBy: { createdAt: "desc" },
  });
  const duocSua = coQuyen(nc.hoSo, "quotation.update") && (await trongPhamVi(nc, "quotation.update", q.ownerId));
  const pb = q.currentVersion ? phienBanRa(q.currentVersion, homNay) : null;
  const tuDuyet = coQuyen(nc.hoSo, "quotation.approve") && q.ownerId === nc.hoSo.userId && nc.hoSo.phamVi.get("quotation.approve") !== "all";

  return {
    baoGia: chuyenDoi(q, homNay),
    donHang: donHang ? { id: donHang.id, so: donHang.number, trangThai: donHang.status } : null,
    cacPhienBan: cacPhienBan.map((v) => ({
      id: v.id,
      phienBan: v.versionNo,
      trangThai: v.status,
      tongCong: v.total.toString(),
      bienLoiNhuan: v.grossMargin === null ? null : Number(v.grossMargin),
      taoLuc: v.createdAt,
      guiLuc: v.sentAt,
    })),
    tenNguoi: Object.fromEntries(nguoiLienQuan.map((u) => [u.id, u.fullName])),
    nguongBienLoiNhuan: nguong,
    quyen: {
      sua: duocSua && pb !== null && chuaGui(pb.trangThai),
      taoBanMoi: duocSua && pb !== null && !chuaGui(pb.trangThai),
      xinDuyet: duocSua && pb?.trangThai === "DRAFT",
      duyet: coQuyen(nc.hoSo, "quotation.approve") && !tuDuyet,
      tuDuyetBiChan: tuDuyet,
      gui: duocSua && (pb?.trangThai === "APPROVED" || (pb?.trangThai === "DRAFT" && !canDuyet(pb.bienLoiNhuan, nguong).can)),
      chot: duocSua && pb !== null && ["SENT", "VIEWED", "NEGOTIATING"].includes(pb.trangThai),
      taoDon: coQuyen(nc.hoSo, "order.create") && pb?.trangThai === "ACCEPTED" && donHang === null,
    },
  };
}

/** Một phiên bản cụ thể (xem lại bản cũ, và bản in). */
export async function xemPhienBan(nc: NguCanh, baoGiaId: string, phienBanId: string) {
  batBuocQuyen(nc.hoSo, "quotation.view", { objectType: "quotation", objectId: baoGiaId });
  const homNay = homNayVN();
  const q = await docBaoGia(nc, baoGiaId);
  const v = await nc.tx.quotationVersion.findFirst({ where: { id: phienBanId, quotationId: baoGiaId }, select: CHON_PHIEN_BAN });
  if (!v) throw new LoiKhongTimThay("Phiên bản báo giá");
  return { baoGia: chuyenDoi(q, homNay), phienBan: phienBanRa(v, homNay) };
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

/** Số hiển thị của một phiên bản: QT-2026-0001-V2. */
export function soPhienBan(so: string, phienBan: number): string {
  return `${so}-V${phienBan}`;
}

async function kiemTraDieuKhoan(nc: NguCanh, d: { dieuKhoanThanhToan?: string | null; dieuKhoanGiaoHang?: string | null }, truoc?: { dieuKhoanThanhToan: string | null; dieuKhoanGiaoHang: string | null }) {
  await kiemTraMaDuLieuGoc(nc, "dieu_khoan_thanh_toan", d.dieuKhoanThanhToan, "dieuKhoanThanhToan", truoc?.dieuKhoanThanhToan);
  await kiemTraMaDuLieuGoc(nc, "dieu_khoan_giao_hang", d.dieuKhoanGiaoHang, "dieuKhoanGiaoHang", truoc?.dieuKhoanGiaoHang);
}

/** Dòng hàng → dữ liệu ghi, kèm số tiền đã tính. */
function dungDongGhi(ds: DuLieuDongBaoGia[], tenantId: string, versionId: string) {
  const tinh = tinhBaoGia(ds as unknown as DongBaoGia[]);
  return {
    tinh,
    data: ds.map((d, i) => ({
      tenantId,
      versionId,
      lineNo: i + 1,
      productId: d.sanPhamId ?? null,
      sku: null as string | null,
      name: d.ten,
      description: d.moTa ?? null,
      quantity: d.soLuong,
      unit: d.donViTinh ?? null,
      unitPrice: d.donGia,
      discountPct: d.chietKhau ?? 0,
      vatRate: d.vat ?? 10,
      unitCost: d.giaVon ?? "0",
      supplierId: d.nhaCungCapId ?? null,
      lineTotal: String(tinh.dong[i].thanhTien),
      lineCost: String(tinh.dong[i].giaVonDong),
    })),
  };
}

/** Chụp SKU của sản phẩm vào dòng hàng (chứng từ giữ nguyên dù danh mục đổi sau này). */
async function chupSku(nc: NguCanh, dong: { productId: string | null; sku: string | null }[]) {
  const ids = [...new Set(dong.map((d) => d.productId).filter((x): x is string => Boolean(x)))];
  if (!ids.length) return;
  const sp = await nc.tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true } });
  const bang = new Map(sp.map((p) => [p.id, p.sku]));
  for (const d of dong) if (d.productId) d.sku = bang.get(d.productId) ?? null;
}

async function ghiTongVaoPhienBan(nc: NguCanh, versionId: string, tinh: ReturnType<typeof tinhBaoGia>) {
  await nc.tx.quotationVersion.update({
    where: { id: versionId },
    data: {
      subtotal: String(tinh.tamTinh),
      discountTotal: String(tinh.tongChietKhau),
      vatTotal: String(tinh.tongVat),
      total: String(tinh.tongCong),
      costTotal: String(tinh.tongGiaVon),
      grossProfit: String(tinh.loiNhuanGop),
      grossMargin: tinh.bienLoiNhuan === null ? null : String(tinh.bienLoiNhuan),
      updatedBy: nc.hoSo.userId,
    },
  });
}

export async function taoBaoGia(nc: NguCanh, d: DuLieuTaoBaoGia) {
  batBuocQuyen(nc.hoSo, "quotation.create", { objectType: "quotation" });
  const khach = await batBuocThayKhach(nc, d.khachHangId);
  if (d.coHoiId) {
    const ch = await batBuocThayCoHoi(nc, d.coHoiId);
    if (ch.khachHang.id !== d.khachHangId) throw new LoiDinhDang("coHoiId", "Cơ hội không thuộc khách hàng này.");
  }
  if (d.lienHeId) {
    const lh = await nc.tx.contact.findFirst({ where: { id: d.lienHeId, customerId: d.khachHangId }, select: { id: true } });
    if (!lh) throw new LoiDinhDang("lienHeId", "Liên hệ không thuộc khách hàng này.");
  }
  const ownerId = d.nguoiPhuTrachId ?? nc.hoSo.userId;
  await kiemTraNguoiPhuTrach(nc, "quotation.create", ownerId);
  await kiemTraDieuKhoan(nc, d);

  const soNgay = await docCauHinh(nc.tx, "bao_gia.so_ngay_hieu_luc");
  const hieuLuc = d.hieuLucDen ?? (soNgay ? new Date(Date.now() + soNgay * 86_400_000).toISOString().slice(0, 10) : null);

  const so = await capSoChungTu(nc.tx, KIEU_SO.baoGia);
  const q = await nc.tx.quotation.create({
    data: {
      tenantId: nc.tenantId,
      number: so,
      customerId: d.khachHangId,
      contactId: d.lienHeId ?? null,
      opportunityId: d.coHoiId ?? null,
      ownerId,
      status: "DRAFT",
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: { id: true },
  });
  const v = await nc.tx.quotationVersion.create({
    data: {
      tenantId: nc.tenantId,
      quotationId: q.id,
      versionNo: 1,
      status: "DRAFT",
      paymentTerms: d.dieuKhoanThanhToan ?? null,
      deliveryTerms: d.dieuKhoanGiaoHang ?? null,
      warrantyTerms: d.dieuKhoanBaoHanh ?? null,
      validUntil: hieuLuc ? ngayVeDate(hieuLuc) : null,
      notes: d.ghiChu ?? null,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: { id: true },
  });
  await nc.tx.quotation.update({ where: { id: q.id }, data: { currentVersionId: v.id } });

  if (d.dong.length) {
    const { tinh, data } = dungDongGhi(d.dong, nc.tenantId, v.id);
    await chupSku(nc, data);
    await nc.tx.quotationItem.createMany({ data });
    await ghiTongVaoPhienBan(nc, v.id, tinh);
  }

  await nc.kiemToan({ action: "tao", objectType: "quotation", objectId: q.id, after: { so, khachHangId: d.khachHangId, soDong: d.dong.length } });
  await nc.suKien({ eventType: SU_KIEN.QUOTATION_CREATED, objectType: "quotation", objectId: q.id, payload: { so, khachHangId: d.khachHangId, khach: khach.ten } });
  return { id: q.id, so, phienBanId: v.id };
}

export async function suaPhienBan(nc: NguCanh, id: string, d: DuLieuSuaPhienBan) {
  const q = await docBaoGiaDuocSua(nc, id);
  const v = q.currentVersion;
  if (!v) throw new LoiNghiepVu("Báo giá chưa có phiên bản nào.", 409);
  if (!chuaGui(v.status)) {
    throw new LoiNghiepVu("Phiên bản này đã gửi khách — tạo phiên bản mới để sửa (BG-02).", 409, "da-gui");
  }
  if (d.lienHeId) {
    const lh = await nc.tx.contact.findFirst({ where: { id: d.lienHeId, customerId: q.customer.id }, select: { id: true } });
    if (!lh) throw new LoiDinhDang("lienHeId", "Liên hệ không thuộc khách hàng này.");
  }
  if (d.coHoiId) {
    const ch = await batBuocThayCoHoi(nc, d.coHoiId);
    if (ch.khachHang.id !== q.customer.id) throw new LoiDinhDang("coHoiId", "Cơ hội không thuộc khách hàng này.");
  }
  if (d.nguoiPhuTrachId && d.nguoiPhuTrachId !== q.ownerId) await kiemTraNguoiPhuTrach(nc, "quotation.update", d.nguoiPhuTrachId);
  await kiemTraDieuKhoan(nc, d, { dieuKhoanThanhToan: v.paymentTerms, dieuKhoanGiaoHang: v.deliveryTerms });

  await nc.tx.quotation.update({
    where: { id },
    data: {
      ...(d.lienHeId !== undefined && { contactId: d.lienHeId }),
      ...(d.coHoiId !== undefined && { opportunityId: d.coHoiId }),
      ...(d.nguoiPhuTrachId && { ownerId: d.nguoiPhuTrachId }),
      updatedBy: nc.hoSo.userId,
    },
  });
  await nc.tx.quotationVersion.update({
    where: { id: v.id },
    data: {
      ...(d.dieuKhoanThanhToan !== undefined && { paymentTerms: d.dieuKhoanThanhToan }),
      ...(d.dieuKhoanGiaoHang !== undefined && { deliveryTerms: d.dieuKhoanGiaoHang }),
      ...(d.dieuKhoanBaoHanh !== undefined && { warrantyTerms: d.dieuKhoanBaoHanh }),
      ...(d.hieuLucDen !== undefined && { validUntil: d.hieuLucDen ? ngayVeDate(d.hieuLucDen) : null }),
      ...(d.ghiChu !== undefined && { notes: d.ghiChu }),
      // Sửa nội dung thì bản đã duyệt quay lại nháp: duyệt cho con số cũ, không phải con số mới.
      ...(v.status === "APPROVED" && { status: "DRAFT" }),
      updatedBy: nc.hoSo.userId,
    },
  });
  if (v.status === "APPROVED") await nc.tx.quotation.update({ where: { id }, data: { status: "DRAFT" } });

  if (d.dong) {
    const { tinh, data } = dungDongGhi(d.dong, nc.tenantId, v.id);
    await chupSku(nc, data);
    await nc.tx.quotationItem.deleteMany({ where: { versionId: v.id } });
    if (data.length) await nc.tx.quotationItem.createMany({ data });
    await ghiTongVaoPhienBan(nc, v.id, tinh);
  }

  await nc.kiemToan({ action: "sua", objectType: "quotation", objectId: id, after: { phienBan: v.versionNo, soDong: d.dong?.length } });
  return chiTietBaoGia(nc, id);
}

/** BG-02: sửa bản đã gửi = chép sang phiên bản mới; bản cũ thành SUPERSEDED. */
export async function taoPhienBanMoi(nc: NguCanh, id: string) {
  const q = await docBaoGiaDuocSua(nc, id);
  const v = q.currentVersion;
  if (!v) throw new LoiNghiepVu("Báo giá chưa có phiên bản nào.", 409);
  if (chuaGui(v.status)) throw new LoiNghiepVu("Phiên bản hiện tại chưa gửi — sửa thẳng, không cần bản mới.", 409, "chua-gui");

  const moi = await nc.tx.quotationVersion.create({
    data: {
      tenantId: nc.tenantId,
      quotationId: id,
      versionNo: v.versionNo + 1,
      status: "DRAFT",
      paymentTerms: v.paymentTerms,
      deliveryTerms: v.deliveryTerms,
      warrantyTerms: v.warrantyTerms,
      validUntil: v.validUntil,
      notes: v.notes,
      subtotal: v.subtotal,
      discountTotal: v.discountTotal,
      vatTotal: v.vatTotal,
      total: v.total,
      costTotal: v.costTotal,
      grossProfit: v.grossProfit,
      grossMargin: v.grossMargin,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: { id: true, versionNo: true },
  });
  if (v.items.length) {
    await nc.tx.quotationItem.createMany({
      data: v.items.map((d) => ({
        tenantId: nc.tenantId,
        versionId: moi.id,
        lineNo: d.lineNo,
        productId: d.productId,
        sku: d.sku,
        name: d.name,
        description: d.description,
        quantity: d.quantity,
        unit: d.unit,
        unitPrice: d.unitPrice,
        discountPct: d.discountPct,
        vatRate: d.vatRate,
        unitCost: d.unitCost,
        supplierId: d.supplierId,
        lineTotal: d.lineTotal,
        lineCost: d.lineCost,
      })),
    });
  }
  // Bản cũ chỉ "bị thay" khi nó chưa chốt; bản khách đã từ chối/chấp nhận thì giữ nguyên trạng thái.
  if (!daChot(v.status)) await nc.tx.quotationVersion.update({ where: { id: v.id }, data: { status: "SUPERSEDED" } });
  await nc.tx.quotation.update({ where: { id }, data: { currentVersionId: moi.id, status: "DRAFT", updatedBy: nc.hoSo.userId } });

  await nc.kiemToan({ action: "tao", objectType: "quotation", objectId: id, after: { phienBanMoi: moi.versionNo, tuPhienBan: v.versionNo } });
  await nc.suKien({ eventType: SU_KIEN.QUOTATION_VERSION_CREATED, objectType: "quotation", objectId: id, payload: { phienBan: moi.versionNo } });
  return { phienBanId: moi.id, phienBan: moi.versionNo };
}

/** BG-03: xin duyệt khi biên lợi nhuận dưới ngưỡng (hoặc ngưỡng chưa đặt). */
export async function xinDuyet(nc: NguCanh, id: string, ghiChu: string | null) {
  const q = await docBaoGiaDuocSua(nc, id);
  const v = q.currentVersion;
  if (!v || v.status !== "DRAFT") throw new LoiNghiepVu("Chỉ xin duyệt được bản nháp.", 409, "khong-phai-nhap");
  if (v.items.length === 0) throw new LoiNghiepVu("Báo giá chưa có dòng hàng nào.", 409, "chua-co-hang");

  const nguong = await docCauHinh(nc.tx, "bao_gia.nguong_bien_loi_nhuan");
  const bien = v.grossMargin === null ? null : Number(v.grossMargin);
  const kq = canDuyet(bien, nguong);
  if (!kq.can) {
    throw new LoiNghiepVu(`Biên lợi nhuận ${bien}% đạt ngưỡng ${nguong}% — gửi thẳng cho khách, không cần duyệt.`, 409, "khong-can-duyet");
  }

  await nc.tx.quotationApproval.create({
    data: {
      tenantId: nc.tenantId,
      versionId: v.id,
      requiredReason: kq.lyDo ?? "manual",
      marginAtRequest: bien === null ? null : String(bien),
      thresholdAtRequest: nguong === null ? null : String(nguong),
      requestedBy: nc.hoSo.userId,
      comment: ghiChu,
    },
  });
  await nc.tx.quotationVersion.update({ where: { id: v.id }, data: { status: "PENDING_APPROVAL", updatedBy: nc.hoSo.userId } });
  await nc.tx.quotation.update({ where: { id }, data: { status: "PENDING_APPROVAL", updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "quotation", objectId: id, before: { trangThai: "DRAFT" }, after: { trangThai: "PENDING_APPROVAL", bien, nguong } });
  await nc.suKien({ eventType: SU_KIEN.QUOTATION_APPROVAL_REQUESTED, objectType: "quotation", objectId: id, payload: { phienBan: v.versionNo, bien, nguong, lyDo: kq.lyDo } });
  return chiTietBaoGia(nc, id);
}

/** BG-05: duyệt hoặc từ chối. Người lập KHÔNG tự duyệt trừ khi có quyền duyệt phạm vi toàn công ty. */
export async function quyetDuyet(nc: NguCanh, id: string, d: { quyetDinh: "cho-duyet" | "tu-choi"; ghiChu: string | null }) {
  batBuocQuyen(nc.hoSo, "quotation.approve", { objectType: "quotation", objectId: id });
  const q = await docBaoGia(nc, id);
  const v = q.currentVersion;
  if (!v || v.status !== "PENDING_APPROVAL") throw new LoiNghiepVu("Báo giá này không ở trạng thái chờ duyệt.", 409, "khong-cho-duyet");
  if (q.ownerId === nc.hoSo.userId && nc.hoSo.phamVi.get("quotation.approve") !== "all") {
    throw new LoiNghiepVu("Người lập không tự duyệt báo giá của mình. Nhờ Trưởng phòng Kinh doanh hoặc Giám đốc duyệt.", 403, "tu-duyet");
  }

  const cho = d.quyetDinh === "cho-duyet";
  const xin = v.approvals.find((a) => !a.decision);
  if (xin) {
    await nc.tx.quotationApproval.update({
      where: { id: xin.id },
      data: { decision: d.quyetDinh, decidedBy: nc.hoSo.userId, decidedAt: new Date(), comment: d.ghiChu ?? xin.comment },
    });
  }
  const trangThaiMoi = cho ? "APPROVED" : "DRAFT";
  await nc.tx.quotationVersion.update({ where: { id: v.id }, data: { status: trangThaiMoi, updatedBy: nc.hoSo.userId } });
  await nc.tx.quotation.update({ where: { id }, data: { status: trangThaiMoi, updatedBy: nc.hoSo.userId } });

  await nc.kiemToan({ action: "sua", objectType: "quotation", objectId: id, before: { trangThai: "PENDING_APPROVAL" }, after: { trangThai: trangThaiMoi, quyetDinh: d.quyetDinh } });
  await nc.suKien({
    eventType: cho ? SU_KIEN.QUOTATION_APPROVED : SU_KIEN.QUOTATION_REJECTED_INTERNAL,
    objectType: "quotation",
    objectId: id,
    payload: { phienBan: v.versionNo, ghiChu: d.ghiChu },
  });
  return chiTietBaoGia(nc, id);
}

/** BG-04: gửi khách. Dưới ngưỡng mà chưa duyệt thì bị chặn ở đây. */
export async function guiKhach(nc: NguCanh, id: string, d: { kenh: string; ghiChu: string | null }) {
  const q = await docBaoGiaDuocSua(nc, id);
  const v = q.currentVersion;
  if (!v) throw new LoiNghiepVu("Báo giá chưa có phiên bản nào.", 409);
  if (v.items.length === 0) throw new LoiNghiepVu("Báo giá chưa có dòng hàng nào.", 409, "chua-co-hang");
  if (!chuaGui(v.status)) throw new LoiNghiepVu("Phiên bản này đã gửi rồi.", 409, "da-gui");

  const nguong = await docCauHinh(nc.tx, "bao_gia.nguong_bien_loi_nhuan");
  const bien = v.grossMargin === null ? null : Number(v.grossMargin);
  if (v.status !== "APPROVED" && canDuyet(bien, nguong).can) {
    throw new LoiNghiepVu(
      nguong === null
        ? "Chưa đặt ngưỡng biên lợi nhuận nên mọi báo giá phải được duyệt trước khi gửi. Bấm “Xin duyệt”."
        : `Biên lợi nhuận ${bien ?? "chưa tính được"}% dưới ngưỡng ${nguong}% — phải được duyệt trước khi gửi.`,
      409,
      "phai-duyet",
    );
  }

  await nc.tx.quotationVersion.update({ where: { id: v.id }, data: { status: "SENT", sentAt: new Date(), updatedBy: nc.hoSo.userId } });
  await nc.tx.quotation.update({ where: { id }, data: { status: "SENT", updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "quotation", objectId: id, before: { trangThai: v.status }, after: { trangThai: "SENT", kenh: d.kenh } });
  await nc.suKien({ eventType: SU_KIEN.QUOTATION_SENT, objectType: "quotation", objectId: id, payload: { phienBan: v.versionNo, kenh: d.kenh, tongCong: v.total.toString() } });

  // Cơ hội gắn kèm: đẩy sang giai đoạn Báo giá nếu đang ở giai đoạn trước đó.
  if (q.opportunity && q.opportunity.stage === "OPPORTUNITY") {
    await nc.tx.opportunity.update({ where: { id: q.opportunity.id }, data: { stage: "QUOTATION", updatedBy: nc.hoSo.userId } });
    await nc.suKien({ eventType: SU_KIEN.OPPORTUNITY_STAGE_CHANGED, objectType: "opportunity", objectId: q.opportunity.id, payload: { tu: "OPPORTUNITY", den: "QUOTATION", boiBaoGia: q.number } });
  }
  return chiTietBaoGia(nc, id);
}

/** BG-06: khách trả lời — chấp nhận, từ chối, hoặc đang thương lượng. */
export async function chotBaoGia(nc: NguCanh, id: string, d: { ketQua: "ACCEPTED" | "REJECTED" | "NEGOTIATING"; ghiChu: string | null }) {
  const q = await docBaoGiaDuocSua(nc, id);
  const v = q.currentVersion;
  if (!v || !["SENT", "VIEWED", "NEGOTIATING"].includes(v.status)) {
    throw new LoiNghiepVu("Chỉ chốt được báo giá đã gửi khách.", 409, "chua-gui");
  }
  const chot = d.ketQua !== "NEGOTIATING";
  await nc.tx.quotationVersion.update({
    where: { id: v.id },
    data: { status: d.ketQua, ...(chot && { decidedAt: new Date() }), decisionNote: d.ghiChu ?? null, updatedBy: nc.hoSo.userId },
  });
  await nc.tx.quotation.update({ where: { id }, data: { status: d.ketQua, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "quotation", objectId: id, before: { trangThai: v.status }, after: { trangThai: d.ketQua, ghiChu: d.ghiChu } });
  await nc.suKien({
    eventType: d.ketQua === "ACCEPTED" ? SU_KIEN.QUOTATION_ACCEPTED : d.ketQua === "REJECTED" ? SU_KIEN.QUOTATION_REJECTED : SU_KIEN.QUOTATION_FOLLOWED_UP,
    objectType: "quotation",
    objectId: id,
    payload: { phienBan: v.versionNo, tongCong: v.total.toString() },
  });
  return chiTietBaoGia(nc, id);
}

/** Danh sách sản phẩm để thêm vào báo giá: giá bán, VAT, và giá vốn theo nguồn nên mua. */
export async function goiYSanPham(nc: NguCanh, q: string) {
  // Dùng chung cho lập báo giá, lập đơn hàng và nhập kho — ai làm được một trong ba việc đó thì tra được hàng.
  if (!coQuyen(nc.hoSo, "quotation.create") && !coQuyen(nc.hoSo, "order.create") && !coQuyen(nc.hoSo, "inventory.create")) {
    batBuocQuyen(nc.hoSo, "quotation.create");
  }
  if (!coQuyen(nc.hoSo, "product.view")) return [];
  const cau = q.trim();
  const ds = await nc.tx.product.findMany({
    where: {
      status: "hoat-dong",
      ...(cau.length >= 2 && {
        OR: [
          { sku: { contains: cau, mode: "insensitive" } },
          { name: { contains: cau, mode: "insensitive" } },
          { model: { contains: cau, mode: "insensitive" } },
        ],
      }),
    },
    select: {
      id: true, sku: true, name: true, unit: true, sellingPrice: true, costPrice: true, vatRate: true, warrantyMonths: true,
      supplierPrices: { where: { status: "hoat-dong" }, select: { supplierId: true, purchasePrice: true, availability: true, leadTimeDays: true, status: true } },
    },
    orderBy: { name: "asc" },
    take: 20,
  });
  const { chonNguonTot } = await import("@/modules/san-pham/chuan-hoa");
  return ds.map((p) => {
    const nguon = chonNguonTot(p.supplierPrices);
    return {
      id: p.id,
      sku: p.sku,
      ten: p.name,
      donViTinh: p.unit,
      giaBan: tienVeChuoi(p.sellingPrice) ?? "0",
      giaVon: nguon ? nguon.purchasePrice.toString() : (tienVeChuoi(p.costPrice) ?? "0"),
      nhaCungCapId: nguon?.supplierId ?? null,
      vat: p.vatRate.toString(),
      baoHanhThang: p.warrantyMonths,
    };
  });
}
