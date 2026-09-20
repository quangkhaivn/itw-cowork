import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { chuoiTuyChon } from "@/modules/crm/chung";
import { chuanHoaMaDanhMuc } from "@/modules/san-pham/chuan-hoa";

/**
 * Nhóm sản phẩm và Thương hiệu — hai danh mục nhỏ dùng chung quyền `product.*`.
 * Không xóa cứng: đổi trạng thái sang `ngung-hoat-dong` (SP-06).
 */

const TRANG_THAI = ["hoat-dong", "ngung-hoat-dong"] as const;

// ---------------------------------------------------------------------------
// Nhóm sản phẩm
// ---------------------------------------------------------------------------

export const LuocDoTaoNhom = z.object({
  ma: z.string().trim().min(1, "Nhập mã nhóm.").max(50),
  ten: z.string().trim().min(2, "Tên nhóm tối thiểu 2 ký tự.").max(255),
  chaId: z.union([z.uuid(), z.literal(""), z.null()]).transform((s) => (s ? s : null)).optional(),
  batBuocSerial: z.boolean().optional().default(false),
  baoHanhMacDinh: z.union([z.coerce.number().int().min(0).max(600), z.literal("" as const), z.null()]).transform((v) => (v === "" || v === null ? null : v)).optional(),
  vatMacDinh: z.union([z.coerce.number().min(0).max(100), z.literal("" as const), z.null()]).transform((v) => (v === "" || v === null ? null : v)).optional(),
  thuTu: z.coerce.number().int().min(0).max(9999).optional().default(0),
});
export type DuLieuTaoNhom = z.infer<typeof LuocDoTaoNhom>;

export const LuocDoSuaNhom = LuocDoTaoNhom.omit({ ma: true }).partial().extend({
  trangThai: z.enum(TRANG_THAI).optional(),
});

export interface NutNhom {
  id: string;
  ma: string;
  ten: string;
  chaId: string | null;
  batBuocSerial: boolean;
  baoHanhMacDinh: number | null;
  vatMacDinh: string | null;
  trangThai: string;
  soSanPham: number;
  cap: number;
}

/** Danh sách phẳng đã xếp theo cây (cha trước, con sau) kèm cấp để thụt lề. */
export async function cayNhomSanPham(nc: NguCanh): Promise<NutNhom[]> {
  batBuocQuyen(nc.hoSo, "product.view");
  const ds = await nc.tx.productCategory.findMany({
    select: {
      id: true, code: true, name: true, parentId: true, requiresSerial: true,
      defaultWarrantyMonths: true, defaultVatRate: true, sortOrder: true, status: true,
      _count: { select: { products: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const theoCha = new Map<string | null, typeof ds>();
  for (const n of ds) {
    const k = n.parentId && ds.some((x) => x.id === n.parentId) ? n.parentId : null;
    theoCha.set(k, [...(theoCha.get(k) ?? []), n]);
  }
  const ketQua: NutNhom[] = [];
  const daDuyet = new Set<string>();
  const duyet = (chaId: string | null, cap: number) => {
    for (const n of theoCha.get(chaId) ?? []) {
      if (daDuyet.has(n.id)) continue;
      daDuyet.add(n.id);
      ketQua.push({
        id: n.id,
        ma: n.code,
        ten: n.name,
        chaId: n.parentId,
        batBuocSerial: n.requiresSerial,
        baoHanhMacDinh: n.defaultWarrantyMonths,
        vatMacDinh: n.defaultVatRate?.toString() ?? null,
        trangThai: n.status,
        soSanPham: n._count.products,
        cap,
      });
      duyet(n.id, cap + 1);
    }
  };
  duyet(null, 0);
  return ketQua;
}

async function kiemTraChaNhom(nc: NguCanh, id: string | null, chaId: string | null | undefined) {
  if (!chaId) return;
  if (id && chaId === id) throw new LoiNghiepVu("Nhóm không thể là cha của chính nó.");
  const cha = await nc.tx.productCategory.findFirst({ where: { id: chaId }, select: { id: true } });
  if (!cha) throw new LoiNghiepVu("Nhóm cha không tồn tại.");
  if (!id) return;
  let hienTai: string | null = chaId;
  for (let i = 0; hienTai && i < 50; i++) {
    if (hienTai === id) throw new LoiNghiepVu("Không thể đặt nhóm con làm cha — cây sẽ bị vòng.");
    const n: { parentId: string | null } | null = await nc.tx.productCategory.findFirst({ where: { id: hienTai }, select: { parentId: true } });
    hienTai = n?.parentId ?? null;
  }
}

export async function taoNhom(nc: NguCanh, d: DuLieuTaoNhom) {
  batBuocQuyen(nc.hoSo, "product.create", { objectType: "product_category" });
  await kiemTraChaNhom(nc, null, d.chaId);
  try {
    const n = await nc.tx.productCategory.create({
      data: {
        tenantId: nc.tenantId,
        code: chuanHoaMaDanhMuc(d.ma),
        name: d.ten,
        parentId: d.chaId ?? null,
        requiresSerial: d.batBuocSerial,
        defaultWarrantyMonths: d.baoHanhMacDinh ?? null,
        defaultVatRate: d.vatMacDinh ?? null,
        sortOrder: d.thuTu,
        createdBy: nc.hoSo.userId,
        updatedBy: nc.hoSo.userId,
      },
      select: { id: true, code: true, name: true },
    });
    await nc.kiemToan({ action: "tao", objectType: "product_category", objectId: n.id, after: n });
    await nc.suKien({ eventType: SU_KIEN.PRODUCT_CATEGORY_CHANGED, objectType: "product_category", objectId: n.id, payload: { ma: n.code } });
    return n;
  } catch (loi) {
    if (laLoiTrung(loi)) throw new LoiNghiepVu(`Mã nhóm "${d.ma}" đã tồn tại.`, 409, "trung");
    throw loi;
  }
}

export async function suaNhom(nc: NguCanh, id: string, d: z.infer<typeof LuocDoSuaNhom>) {
  batBuocQuyen(nc.hoSo, "product.update", { objectType: "product_category", objectId: id });
  const truoc = await nc.tx.productCategory.findFirst({
    where: { id },
    select: { id: true, code: true, name: true, parentId: true, requiresSerial: true, defaultWarrantyMonths: true, defaultVatRate: true, sortOrder: true, status: true },
  });
  if (!truoc) throw new LoiKhongTimThay("Nhóm sản phẩm");
  if (d.chaId !== undefined) await kiemTraChaNhom(nc, id, d.chaId);
  if (d.trangThai === "ngung-hoat-dong" && truoc.status !== "ngung-hoat-dong") {
    const [soCon, soSp] = await Promise.all([
      nc.tx.productCategory.count({ where: { parentId: id, status: "hoat-dong" } }),
      nc.tx.product.count({ where: { categoryId: id, status: "hoat-dong" } }),
    ]);
    if (soCon || soSp) {
      throw new LoiNghiepVu(`Chưa ngừng được: còn ${soCon} nhóm con và ${soSp} sản phẩm đang kinh doanh trong nhóm này.`, 409);
    }
  }
  const sau = await nc.tx.productCategory.update({
    where: { id },
    data: {
      ...(d.ten !== undefined && { name: d.ten }),
      ...(d.chaId !== undefined && { parentId: d.chaId }),
      ...(d.batBuocSerial !== undefined && { requiresSerial: d.batBuocSerial }),
      ...(d.baoHanhMacDinh !== undefined && { defaultWarrantyMonths: d.baoHanhMacDinh }),
      ...(d.vatMacDinh !== undefined && { defaultVatRate: d.vatMacDinh }),
      ...(d.thuTu !== undefined && { sortOrder: d.thuTu }),
      ...(d.trangThai !== undefined && { status: d.trangThai }),
      updatedBy: nc.hoSo.userId,
    },
    select: { id: true, code: true, name: true, parentId: true, requiresSerial: true, defaultWarrantyMonths: true, defaultVatRate: true, sortOrder: true, status: true },
  });
  await nc.kiemToan({
    action: "sua",
    objectType: "product_category",
    objectId: id,
    before: { ...truoc, defaultVatRate: truoc.defaultVatRate?.toString() ?? null },
    after: { ...sau, defaultVatRate: sau.defaultVatRate?.toString() ?? null },
  });
  await nc.suKien({ eventType: SU_KIEN.PRODUCT_CATEGORY_CHANGED, objectType: "product_category", objectId: id });
  return sau;
}

// ---------------------------------------------------------------------------
// Thương hiệu
// ---------------------------------------------------------------------------

export const LuocDoTaoThuongHieu = z.object({
  ma: z.string().trim().min(1, "Nhập mã thương hiệu.").max(50),
  ten: z.string().trim().min(1, "Nhập tên thương hiệu.").max(255),
  website: chuoiTuyChon(255),
  ghiChu: chuoiTuyChon(2000),
});
export const LuocDoSuaThuongHieu = LuocDoTaoThuongHieu.omit({ ma: true }).partial().extend({
  trangThai: z.enum(TRANG_THAI).optional(),
});

export async function danhSachThuongHieu(nc: NguCanh, chiHoatDong = false) {
  batBuocQuyen(nc.hoSo, "product.view");
  const ds = await nc.tx.brand.findMany({
    where: chiHoatDong ? { status: "hoat-dong" } : {},
    select: { id: true, code: true, name: true, website: true, note: true, status: true, _count: { select: { products: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  return ds.map((b) => ({ id: b.id, ma: b.code, ten: b.name, website: b.website, ghiChu: b.note, trangThai: b.status, soSanPham: b._count.products }));
}

export async function taoThuongHieu(nc: NguCanh, d: z.infer<typeof LuocDoTaoThuongHieu>) {
  batBuocQuyen(nc.hoSo, "product.create", { objectType: "brand" });
  try {
    const b = await nc.tx.brand.create({
      data: {
        tenantId: nc.tenantId,
        code: chuanHoaMaDanhMuc(d.ma),
        name: d.ten,
        website: d.website ?? null,
        note: d.ghiChu ?? null,
        createdBy: nc.hoSo.userId,
        updatedBy: nc.hoSo.userId,
      },
      select: { id: true, code: true, name: true },
    });
    await nc.kiemToan({ action: "tao", objectType: "brand", objectId: b.id, after: b });
    return b;
  } catch (loi) {
    if (laLoiTrung(loi)) throw new LoiNghiepVu(`Mã thương hiệu "${d.ma}" đã tồn tại.`, 409, "trung");
    throw loi;
  }
}

export async function suaThuongHieu(nc: NguCanh, id: string, d: z.infer<typeof LuocDoSuaThuongHieu>) {
  batBuocQuyen(nc.hoSo, "product.update", { objectType: "brand", objectId: id });
  const truoc = await nc.tx.brand.findFirst({ where: { id }, select: { id: true, code: true, name: true, website: true, note: true, status: true } });
  if (!truoc) throw new LoiKhongTimThay("Thương hiệu");
  if (d.trangThai === "ngung-hoat-dong" && truoc.status !== "ngung-hoat-dong") {
    const soSp = await nc.tx.product.count({ where: { brandId: id, status: "hoat-dong" } });
    if (soSp) throw new LoiNghiepVu(`Chưa ngừng được: còn ${soSp} sản phẩm đang kinh doanh mang thương hiệu này.`, 409);
  }
  const sau = await nc.tx.brand.update({
    where: { id },
    data: {
      ...(d.ten !== undefined && { name: d.ten }),
      ...(d.website !== undefined && { website: d.website }),
      ...(d.ghiChu !== undefined && { note: d.ghiChu }),
      ...(d.trangThai !== undefined && { status: d.trangThai }),
      updatedBy: nc.hoSo.userId,
    },
    select: { id: true, code: true, name: true, website: true, note: true, status: true },
  });
  await nc.kiemToan({ action: "sua", objectType: "brand", objectId: id, before: truoc, after: sau });
  return sau;
}

/** Lựa chọn cho form sản phẩm: nhóm và thương hiệu đang dùng. */
export async function luaChonDanhMuc(nc: NguCanh) {
  const [nhom, thuongHieu] = await Promise.all([
    nc.tx.productCategory.findMany({
      where: { status: "hoat-dong" },
      select: { id: true, code: true, name: true, parentId: true, requiresSerial: true, defaultWarrantyMonths: true, defaultVatRate: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    nc.tx.brand.findMany({ where: { status: "hoat-dong" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    nhom: nhom.map((n) => ({
      id: n.id,
      ma: n.code,
      ten: n.name,
      chaId: n.parentId,
      batBuocSerial: n.requiresSerial,
      baoHanhMacDinh: n.defaultWarrantyMonths,
      vatMacDinh: n.defaultVatRate?.toString() ?? null,
    })),
    thuongHieu: thuongHieu.map((b) => ({ id: b.id, ten: b.name })),
    duocSua: coQuyen(nc.hoSo, "product.update"),
  };
}
