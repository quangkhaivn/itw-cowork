import { z } from "zod";
import { chuoiTuyChon, soTien } from "@/modules/crm/chung";

/** Lược đồ phân hệ Kho. Luật: BUSINESS_RULES.md mục 7 (KHO-01 → KHO-08). */

/** Số lượng hàng: dương, tối đa 3 số lẻ (mét dây, giờ công). Nhận cách viết Việt Nam. */
export const soLuongKho = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const s = typeof v === "number" ? String(v) : v.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(s) || Number(s) <= 0) {
    ctx.addIssue({ code: "custom", message: "Số lượng phải lớn hơn 0 (tối đa 3 số lẻ)." });
    return z.NEVER;
  }
  return s;
});

export const LuocDoTaoKho = z.object({
  ma: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{0,29}$/, "Mã kho chỉ gồm chữ không dấu, số và gạch ngang."),
  ten: z.string().trim().min(2, "Nhập tên kho.").max(255),
  diaChi: chuoiTuyChon(1000),
  ghiChu: chuoiTuyChon(2000),
  macDinh: z.coerce.boolean().optional().default(false),
});

export const LuocDoSuaKho = z.object({
  ten: z.string().trim().min(2).max(255).optional(),
  diaChi: chuoiTuyChon(1000),
  ghiChu: chuoiTuyChon(2000),
  macDinh: z.coerce.boolean().optional(),
  trangThai: z.enum(["hoat-dong", "ngung-hoat-dong"]).optional(),
});

const dongHang = z.object({
  sanPhamId: z.uuid("Chọn sản phẩm."),
  soLuong: soLuongKho,
  /** Giá nhập của lần này; bỏ trống thì lấy giá vốn tham chiếu của sản phẩm. */
  giaVon: soTien.optional(),
  /** Số sê-ri của hàng quản lý theo máy; số lượng sê-ri phải khớp số lượng nhập (KHO-05). */
  serial: z.array(z.string().trim().min(1).max(100)).max(1000).optional().default([]),
  ghiChu: chuoiTuyChon(500),
});

export const LuocDoNhapKho = z.object({
  khoId: z.uuid("Chọn kho."),
  lyDo: z.string().trim().min(2, "Ghi rõ nguồn hàng nhập (mua của ai, theo chứng từ nào).").max(100),
  ghiChu: chuoiTuyChon(2000),
  dong: z.array(dongHang).min(1, "Thêm ít nhất một dòng hàng.").max(200),
});

export const LuocDoDieuChinh = z.object({
  khoId: z.uuid("Chọn kho."),
  sanPhamId: z.uuid("Chọn sản phẩm."),
  /** Chiều điều chỉnh: tăng khi kiểm kê thừa, giảm khi thiếu/hỏng. */
  chieu: z.enum(["tang", "giam"]),
  soLuong: soLuongKho,
  lyDo: z.string().trim().min(2, "Điều chỉnh tồn kho phải có lý do.").max(100),
  ghiChu: chuoiTuyChon(2000),
});

export const LuocDoLocTonKho = z.object({
  q: z.string().trim().max(100).optional().default(""),
  kho: z.union([z.uuid(), z.literal("")]).optional().default(""),
  /** "1" = chỉ hàng hết hoặc dưới mức tối thiểu. */
  canhBao: z.enum(["", "1"]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});

export const LuocDoLocTheKho = z.object({
  sanPham: z.union([z.uuid(), z.literal("")]).optional().default(""),
  kho: z.union([z.uuid(), z.literal("")]).optional().default(""),
  loai: z.string().trim().max(20).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(50),
});

export const LuocDoLocSerial = z.object({
  q: z.string().trim().max(100).optional().default(""),
  sanPham: z.union([z.uuid(), z.literal("")]).optional().default(""),
  kho: z.union([z.uuid(), z.literal("")]).optional().default(""),
  trangThai: z.enum(["", "trong-kho", "da-ban", "tra-lai"]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(50),
});

export const LuocDoMucTonToiThieu = z.object({
  sanPhamId: z.uuid(),
  mucToiThieu: z.union([z.string(), z.number(), z.null()]).optional(),
});

export type DuLieuNhapKho = z.infer<typeof LuocDoNhapKho>;
export type DuLieuDieuChinh = z.infer<typeof LuocDoDieuChinh>;
export type BoLocTonKho = z.infer<typeof LuocDoLocTonKho>;
export type BoLocTheKho = z.infer<typeof LuocDoLocTheKho>;
export type BoLocSerial = z.infer<typeof LuocDoLocSerial>;
