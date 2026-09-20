import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { kiemTraMaDuLieuGoc, tienVeChuoi } from "@/modules/crm/chung";
import { bienLoiNhuan, chonNguonTot, chuanHoaSku, chuanHoaTenSanPham } from "./chuan-hoa";
import type { BoLocSanPham, DuLieuDatGiaNguon, DuLieuSuaSanPham, DuLieuTaoSanPham } from "./luoc-do";

/**
 * Phân hệ Sản phẩm và bảng giá. Luật: BUSINESS_RULES.md mục 5.
 *
 * Quyền `product.*`. **Không có phạm vi theo người phụ trách**: danh mục sản phẩm là
 * tài sản dùng chung, ai được xem thì xem hết (QĐ-18).
 *
 * Mọi thay đổi giá — giá vốn, giá bán, giá của từng nhà cung cấp — đều ghi một dòng
 * `price_history` chỉ-ghi-thêm. Không bao giờ đè mất giá cũ (mục 9 prompt).
 */

const CHON = {
  id: true, sku: true, name: true, model: true, description: true, specifications: true,
  unit: true, costPrice: true, sellingPrice: true, vatRate: true, warrantyMonths: true,
  requiresSerial: true, status: true, createdAt: true, updatedAt: true,
  category: { select: { id: true, code: true, name: true } },
  brand: { select: { id: true, name: true } },
  defaultSupplier: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ProductSelect;

type BanGhi = Prisma.ProductGetPayload<{ select: typeof CHON }>;

function chuyenDoi(p: BanGhi) {
  const giaVon = tienVeChuoi(p.costPrice);
  const giaBan = tienVeChuoi(p.sellingPrice);
  return {
    id: p.id,
    sku: p.sku,
    ten: p.name,
    model: p.model,
    moTa: p.description,
    thongSo: (p.specifications ?? null) as Record<string, string> | null,
    donViTinh: p.unit,
    giaVon,
    giaBan,
    vat: p.vatRate.toString(),
    baoHanhThang: p.warrantyMonths,
    batBuocSerial: p.requiresSerial,
    trangThai: p.status,
    taoLuc: p.createdAt,
    suaLuc: p.updatedAt,
    nhom: p.category,
    thuongHieu: p.brand,
    nhaCungCapMacDinh: p.defaultSupplier,
    bienLoiNhuan: bienLoiNhuan(giaBan, giaVon),
  };
}
export type SanPhamChiTiet = ReturnType<typeof chuyenDoi>;

function anhChup(p: SanPhamChiTiet) {
  return {
    sku: p.sku, ten: p.ten, model: p.model, donViTinh: p.donViTinh, giaVon: p.giaVon, giaBan: p.giaBan,
    vat: p.vat, baoHanhThang: p.baoHanhThang, batBuocSerial: p.batBuocSerial, trangThai: p.trangThai,
    nhomId: p.nhom?.id ?? null, thuongHieuId: p.thuongHieu?.id ?? null, nhaCungCapMacDinhId: p.nhaCungCapMacDinh?.id ?? null,
  };
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export async function danhSachSanPham(nc: NguCanh, boLoc: BoLocSanPham) {
  batBuocQuyen(nc.hoSo, "product.view");
  const dieuKien: Prisma.ProductWhereInput[] = [];
  if (boLoc.q) {
    const q = boLoc.q;
    dieuKien.push({
      OR: [
        { skuNormalized: { contains: chuanHoaTenSanPham(q).toUpperCase() } },
        { sku: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { nameNormalized: { contains: chuanHoaTenSanPham(q) } },
        { model: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (boLoc.nhom) dieuKien.push({ categoryId: boLoc.nhom });
  if (boLoc.thuongHieu) dieuKien.push({ brandId: boLoc.thuongHieu });
  if (boLoc.nhaCungCap) dieuKien.push({ supplierPrices: { some: { supplierId: boLoc.nhaCungCap, status: "hoat-dong" } } });
  if (boLoc.trangThai) dieuKien.push({ status: boLoc.trangThai });
  if (boLoc.thieuGia) dieuKien.push({ sellingPrice: null });

  const xep: Record<BoLocSanPham["sapXep"], Prisma.ProductOrderByWithRelationInput[]> = {
    "moi-nhat": [{ updatedAt: "desc" }],
    ten: [{ name: "asc" }],
    sku: [{ skuNormalized: "asc" }],
    "gia-tang": [{ sellingPrice: { sort: "asc", nulls: "last" } }],
    "gia-giam": [{ sellingPrice: { sort: "desc", nulls: "last" } }],
  };

  const where: Prisma.ProductWhereInput = { AND: dieuKien };
  const [tong, dong] = await Promise.all([
    nc.tx.product.count({ where }),
    nc.tx.product.findMany({
      where,
      select: { ...CHON, _count: { select: { supplierPrices: { where: { status: "hoat-dong" } } } } },
      orderBy: xep[boLoc.sapXep],
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
    }),
  ]);
  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    dong: dong.map((p) => ({ ...chuyenDoi(p), soNguon: p._count.supplierPrices })),
  };
}

/** Sản phẩm + bảng giá các nguồn + lịch sử giá. */
export async function chiTietSanPham(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "product.view", { objectType: "product", objectId: id });
  const p = await nc.tx.product.findFirst({ where: { id }, select: CHON });
  if (!p) throw new LoiKhongTimThay("Sản phẩm");

  const [giaNguon, lichSu] = await Promise.all([
    nc.tx.supplierProductPrice.findMany({
      where: { productId: id },
      select: {
        id: true, purchasePrice: true, availability: true, leadTimeDays: true, reference: true,
        note: true, status: true, updatedAt: true,
        supplier: { select: { id: true, code: true, name: true, status: true } },
      },
      orderBy: { purchasePrice: "asc" },
    }),
    nc.tx.priceHistory.findMany({
      where: { productId: id },
      select: { id: true, priceType: true, oldPrice: true, newPrice: true, reason: true, source: true, changedAt: true, changedBy: true, supplier: { select: { id: true, name: true } } },
      orderBy: { changedAt: "desc" },
      take: 50,
    }),
  ]);

  const nguoiDoi = await nc.tx.user.findMany({
    where: { id: { in: [...new Set(lichSu.map((h) => h.changedBy).filter((x): x is string => Boolean(x)))] } },
    select: { id: true, fullName: true },
  });
  const tenNguoi = new Map(nguoiDoi.map((u) => [u.id, u.fullName]));

  const ds = giaNguon.map((g) => ({
    id: g.id,
    supplierId: g.supplier.id,
    giaMua: g.purchasePrice.toString(),
    purchasePrice: g.purchasePrice,
    availability: g.availability,
    tinhTrang: g.availability,
    leadTimeDays: g.leadTimeDays,
    soNgayGiao: g.leadTimeDays,
    thamChieu: g.reference,
    ghiChu: g.note,
    status: g.status,
    trangThai: g.status,
    capNhatLuc: g.updatedAt,
    nhaCungCap: { id: g.supplier.id, ma: g.supplier.code, ten: g.supplier.name, trangThai: g.supplier.status },
  }));
  const nenMua = chonNguonTot(ds);

  return {
    sanPham: chuyenDoi(p),
    giaNguon: ds.map((g) => ({ ...g, laNenMua: g.id === nenMua?.id })),
    nenMua: nenMua ? { id: nenMua.id, nhaCungCap: nenMua.nhaCungCap, giaMua: nenMua.giaMua, tinhTrang: nenMua.tinhTrang } : null,
    lichSuGia: lichSu.map((h) => ({
      id: h.id,
      loai: h.priceType,
      giaCu: tienVeChuoi(h.oldPrice),
      giaMoi: tienVeChuoi(h.newPrice),
      lyDo: h.reason,
      nguon: h.source,
      luc: h.changedAt,
      nguoi: h.changedBy ? (tenNguoi.get(h.changedBy) ?? "—") : "hệ thống",
      nhaCungCap: h.supplier,
    })),
    quyen: {
      sua: coQuyen(nc.hoSo, "product.update"),
      datGia: coQuyen(nc.hoSo, "product.update"),
      xemNhaCungCap: coQuyen(nc.hoSo, "supplier.view"),
    },
  };
}

/** Dùng cho Phase 4: lấy giá vốn tham chiếu và nguồn nên mua của một loạt sản phẩm. */
export async function giaChoBaoGia(nc: NguCanh, ids: string[]) {
  batBuocQuyen(nc.hoSo, "product.view");
  const ds = await nc.tx.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, sku: true, name: true, unit: true, costPrice: true, sellingPrice: true, vatRate: true, warrantyMonths: true,
      supplierPrices: { where: { status: "hoat-dong" }, select: { supplierId: true, purchasePrice: true, availability: true, leadTimeDays: true, status: true } },
    },
  });
  return ds.map((p) => {
    const nguon = chonNguonTot(p.supplierPrices);
    return {
      id: p.id,
      sku: p.sku,
      ten: p.name,
      donViTinh: p.unit,
      giaVon: tienVeChuoi(p.costPrice),
      giaBan: tienVeChuoi(p.sellingPrice),
      vat: p.vatRate.toString(),
      baoHanhThang: p.warrantyMonths,
      nguonTot: nguon ? { nhaCungCapId: nguon.supplierId, giaMua: nguon.purchasePrice.toString(), tinhTrang: nguon.availability } : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

/** Ghi một dòng lịch sử giá. Chỉ gọi khi giá thật sự đổi (CHECK của CSDL cũng chặn ghi trùng giá). */
async function ghiLichSuGia(
  nc: NguCanh,
  t: { productId: string; loai: "cost" | "selling" | "supplier"; supplierId?: string | null; giaCu: string | null; giaMoi: string | null; lyDo?: string | null; nguon?: "thu-cong" | "nhap-csv" | "he-thong" },
) {
  if ((t.giaCu ?? null) === (t.giaMoi ?? null)) return;
  await nc.tx.priceHistory.create({
    data: {
      tenantId: nc.tenantId,
      productId: t.productId,
      priceType: t.loai,
      supplierId: t.supplierId ?? null,
      oldPrice: t.giaCu,
      newPrice: t.giaMoi,
      reason: t.lyDo ?? null,
      source: t.nguon ?? "thu-cong",
      changedBy: nc.hoSo.userId,
    },
  });
  await nc.suKien({
    eventType: t.loai === "supplier" ? SU_KIEN.SUPPLIER_PRICE_CHANGED : SU_KIEN.PRODUCT_PRICE_CHANGED,
    objectType: "product",
    objectId: t.productId,
    payload: { loai: t.loai, giaCu: t.giaCu, giaMoi: t.giaMoi, nhaCungCapId: t.supplierId ?? null, nguon: t.nguon ?? "thu-cong" },
  });
}

async function kiemTraThamChieu(nc: NguCanh, d: { nhomId?: string | null; thuongHieuId?: string | null; nhaCungCapMacDinhId?: string | null; donViTinh?: string | null }, truoc?: SanPhamChiTiet) {
  if (d.nhomId) {
    const n = await nc.tx.productCategory.findFirst({ where: { id: d.nhomId }, select: { id: true } });
    if (!n) throw new LoiDinhDang("nhomId", "Nhóm sản phẩm không tồn tại.");
  }
  if (d.thuongHieuId) {
    const b = await nc.tx.brand.findFirst({ where: { id: d.thuongHieuId }, select: { id: true } });
    if (!b) throw new LoiDinhDang("thuongHieuId", "Thương hiệu không tồn tại.");
  }
  if (d.nhaCungCapMacDinhId) {
    const s = await nc.tx.supplier.findFirst({ where: { id: d.nhaCungCapMacDinhId }, select: { id: true } });
    if (!s) throw new LoiDinhDang("nhaCungCapMacDinhId", "Nhà cung cấp không tồn tại.");
  }
  await kiemTraMaDuLieuGoc(nc, "don_vi_tinh", d.donViTinh, "donViTinh", truoc?.donViTinh);
}

export async function taoSanPham(nc: NguCanh, d: DuLieuTaoSanPham, tuy: { nguon?: "thu-cong" | "nhap-csv" } = {}) {
  batBuocQuyen(nc.hoSo, "product.create", { objectType: "product" });
  const sku = chuanHoaSku(d.sku);
  await kiemTraThamChieu(nc, d);

  // Mặc định theo nhóm: bảo hành, VAT, yêu cầu số sê-ri.
  const nhom = d.nhomId
    ? await nc.tx.productCategory.findFirst({ where: { id: d.nhomId }, select: { requiresSerial: true, defaultWarrantyMonths: true, defaultVatRate: true } })
    : null;

  try {
    const p = await nc.tx.product.create({
      data: {
        tenantId: nc.tenantId,
        sku: d.sku.trim().replace(/\s+/g, " "),
        skuNormalized: sku,
        name: d.ten,
        nameNormalized: chuanHoaTenSanPham(d.ten),
        categoryId: d.nhomId ?? null,
        brandId: d.thuongHieuId ?? null,
        model: d.model ?? null,
        description: d.moTa ?? null,
        specifications: (d.thongSo ?? undefined) as never,
        unit: d.donViTinh ?? null,
        costPrice: d.giaVon ?? null,
        sellingPrice: d.giaBan ?? null,
        vatRate: d.vat ?? (nhom?.defaultVatRate ? Number(nhom.defaultVatRate) : 10),
        warrantyMonths: d.baoHanhThang ?? nhom?.defaultWarrantyMonths ?? null,
        requiresSerial: d.batBuocSerial ?? nhom?.requiresSerial ?? false,
        defaultSupplierId: d.nhaCungCapMacDinhId ?? null,
        createdBy: nc.hoSo.userId,
        updatedBy: nc.hoSo.userId,
      },
      select: CHON,
    });
    const kq = chuyenDoi(p);
    await nc.kiemToan({ action: "tao", objectType: "product", objectId: p.id, after: anhChup(kq) });
    await nc.suKien({ eventType: SU_KIEN.PRODUCT_CREATED, objectType: "product", objectId: p.id, payload: { sku: kq.sku, nguon: tuy.nguon ?? "thu-cong" } });
    // Giá lúc tạo cũng vào lịch sử, để về sau biết giá khởi điểm là bao nhiêu.
    if (kq.giaVon) await ghiLichSuGia(nc, { productId: p.id, loai: "cost", giaCu: null, giaMoi: kq.giaVon, lyDo: "Giá khi tạo sản phẩm", nguon: tuy.nguon });
    if (kq.giaBan) await ghiLichSuGia(nc, { productId: p.id, loai: "selling", giaCu: null, giaMoi: kq.giaBan, lyDo: "Giá khi tạo sản phẩm", nguon: tuy.nguon });
    return kq;
  } catch (loi) {
    if (laLoiTrung(loi)) throw new LoiNghiepVu(`SKU "${d.sku}" đã có sản phẩm khác dùng.`, 409, "trung-sku");
    throw loi;
  }
}

export async function suaSanPham(nc: NguCanh, id: string, d: DuLieuSuaSanPham, tuy: { nguon?: "thu-cong" | "nhap-csv" } = {}) {
  batBuocQuyen(nc.hoSo, "product.update", { objectType: "product", objectId: id });
  const goc = await nc.tx.product.findFirst({ where: { id }, select: CHON });
  if (!goc) throw new LoiKhongTimThay("Sản phẩm");
  const truoc = chuyenDoi(goc);
  await kiemTraThamChieu(nc, d, truoc);
  const sku = d.sku !== undefined ? chuanHoaSku(d.sku) : null;

  try {
    const sau = chuyenDoi(
      await nc.tx.product.update({
        where: { id },
        data: {
          ...(sku && { sku: d.sku!.trim().replace(/\s+/g, " "), skuNormalized: sku }),
          ...(d.ten !== undefined && { name: d.ten, nameNormalized: chuanHoaTenSanPham(d.ten) }),
          ...(d.nhomId !== undefined && { categoryId: d.nhomId }),
          ...(d.thuongHieuId !== undefined && { brandId: d.thuongHieuId }),
          ...(d.model !== undefined && { model: d.model }),
          ...(d.moTa !== undefined && { description: d.moTa }),
          ...(d.thongSo !== undefined && { specifications: (d.thongSo ?? undefined) as never }),
          ...(d.donViTinh !== undefined && { unit: d.donViTinh }),
          ...(d.giaVon !== undefined && { costPrice: d.giaVon }),
          ...(d.giaBan !== undefined && { sellingPrice: d.giaBan }),
          ...(d.vat !== undefined && { vatRate: d.vat }),
          ...(d.baoHanhThang !== undefined && { warrantyMonths: d.baoHanhThang }),
          ...(d.batBuocSerial !== undefined && { requiresSerial: d.batBuocSerial }),
          ...(d.nhaCungCapMacDinhId !== undefined && { defaultSupplierId: d.nhaCungCapMacDinhId }),
          ...(d.trangThai !== undefined && { status: d.trangThai }),
          updatedBy: nc.hoSo.userId,
        },
        select: CHON,
      }),
    );
    await nc.kiemToan({ action: "sua", objectType: "product", objectId: id, before: anhChup(truoc), after: anhChup(sau) });
    await nc.suKien({ eventType: SU_KIEN.PRODUCT_UPDATED, objectType: "product", objectId: id });
    // SP-08: đổi giá vốn / giá bán luôn để lại dấu vết.
    await ghiLichSuGia(nc, { productId: id, loai: "cost", giaCu: truoc.giaVon, giaMoi: sau.giaVon, lyDo: d.lyDoDoiGia ?? null, nguon: tuy.nguon });
    await ghiLichSuGia(nc, { productId: id, loai: "selling", giaCu: truoc.giaBan, giaMoi: sau.giaBan, lyDo: d.lyDoDoiGia ?? null, nguon: tuy.nguon });
    return sau;
  } catch (loi) {
    if (laLoiTrung(loi)) throw new LoiNghiepVu(`SKU "${d.sku}" đã có sản phẩm khác dùng.`, 409, "trung-sku");
    throw loi;
  }
}

/**
 * Đặt / cập nhật giá của một nhà cung cấp cho một sản phẩm (SP-05).
 * Một cặp (sản phẩm, nhà cung cấp) chỉ một dòng giá hiện hành; giá cũ vào lịch sử.
 */
export async function datGiaNguon(nc: NguCanh, sanPhamId: string, d: DuLieuDatGiaNguon, tuy: { nguon?: "thu-cong" | "nhap-csv" } = {}) {
  batBuocQuyen(nc.hoSo, "product.update", { objectType: "product", objectId: sanPhamId });
  const sp = await nc.tx.product.findFirst({ where: { id: sanPhamId }, select: { id: true, sku: true } });
  if (!sp) throw new LoiKhongTimThay("Sản phẩm");
  const ncc = await nc.tx.supplier.findFirst({ where: { id: d.nhaCungCapId }, select: { id: true, name: true, status: true } });
  if (!ncc) throw new LoiDinhDang("nhaCungCapId", "Nhà cung cấp không tồn tại.");
  if (ncc.status !== "hoat-dong") throw new LoiDinhDang("nhaCungCapId", "Nhà cung cấp đã ngừng hoạt động.");

  const cu = await nc.tx.supplierProductPrice.findFirst({
    where: { productId: sanPhamId, supplierId: d.nhaCungCapId },
    select: { id: true, purchasePrice: true, availability: true, leadTimeDays: true, status: true },
  });
  const giaCu = cu ? cu.purchasePrice.toString() : null;

  const dong = cu
    ? await nc.tx.supplierProductPrice.update({
        where: { id: cu.id },
        data: {
          purchasePrice: d.giaMua,
          availability: d.tinhTrang,
          leadTimeDays: d.soNgayGiao ?? null,
          reference: d.thamChieu ?? null,
          note: d.ghiChu ?? null,
          status: "hoat-dong",
          updatedBy: nc.hoSo.userId,
        },
        select: { id: true, purchasePrice: true, availability: true },
      })
    : await nc.tx.supplierProductPrice.create({
        data: {
          tenantId: nc.tenantId,
          productId: sanPhamId,
          supplierId: d.nhaCungCapId,
          purchasePrice: d.giaMua,
          availability: d.tinhTrang,
          leadTimeDays: d.soNgayGiao ?? null,
          reference: d.thamChieu ?? null,
          note: d.ghiChu ?? null,
          createdBy: nc.hoSo.userId,
          updatedBy: nc.hoSo.userId,
        },
        select: { id: true, purchasePrice: true, availability: true },
      });

  await nc.kiemToan({
    action: cu ? "sua" : "tao",
    objectType: "supplier_price",
    objectId: dong.id,
    before: cu ? { giaMua: giaCu, tinhTrang: cu.availability, soNgayGiao: cu.leadTimeDays } : undefined,
    after: { sanPhamId, nhaCungCapId: d.nhaCungCapId, giaMua: dong.purchasePrice.toString(), tinhTrang: dong.availability },
  });
  await ghiLichSuGia(nc, {
    productId: sanPhamId,
    loai: "supplier",
    supplierId: d.nhaCungCapId,
    giaCu,
    giaMoi: dong.purchasePrice.toString(),
    lyDo: d.lyDo ?? null,
    nguon: tuy.nguon,
  });
  return { id: dong.id, giaMua: dong.purchasePrice.toString(), tinhTrang: dong.availability };
}

/** Gỡ một nguồn khỏi bảng giá (không xóa lịch sử). */
export async function goGiaNguon(nc: NguCanh, giaId: string) {
  batBuocQuyen(nc.hoSo, "product.update", { objectType: "supplier_price", objectId: giaId });
  const g = await nc.tx.supplierProductPrice.findFirst({ where: { id: giaId }, select: { id: true, productId: true, supplierId: true, purchasePrice: true, status: true } });
  if (!g) throw new LoiKhongTimThay("Dòng giá");
  if (g.status !== "hoat-dong") return { ok: true };
  await nc.tx.supplierProductPrice.update({ where: { id: giaId }, data: { status: "ngung-hoat-dong", updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "supplier_price", objectId: giaId, before: { trangThai: "hoat-dong" }, after: { trangThai: "ngung-hoat-dong" } });
  await ghiLichSuGia(nc, {
    productId: g.productId,
    loai: "supplier",
    supplierId: g.supplierId,
    giaCu: g.purchasePrice.toString(),
    giaMoi: null,
    lyDo: "Gỡ nguồn khỏi bảng giá",
  });
  return { ok: true };
}
