import { z } from "zod";
import { LOAI_TRANG_THAI, MA_MOC } from "./moc";

/** Lược đồ dữ liệu vào của Hành trình khách hàng. */

const mau = z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "Màu phải dạng #RRGGBB.");

export const LuocDoTrangThaiHanhTrinh = z.object({
  ten: z.string().trim().min(1, "Nhập tên trạng thái.").max(100),
  mau,
  loai: z.enum(LOAI_TRANG_THAI).optional().default("mo"),
  /** Số ngày "đứng lâu" — để trống = không nhắc. */
  soNgayDungLau: z.union([z.number().int().min(1, "Từ 1 đến 365 ngày.").max(365, "Từ 1 đến 365 ngày."), z.null()]).optional().default(null),
  mocTuDong: z
    .union([z.string().refine((m) => MA_MOC.includes(m), "Mốc tự chuyển không có trong danh mục."), z.literal(""), z.null()])
    .transform((m) => (m ? m : null))
    .optional()
    .default(null),
});
export type DuLieuTrangThaiHanhTrinh = z.infer<typeof LuocDoTrangThaiHanhTrinh>;

export const LuocDoSuaTrangThaiHanhTrinh = LuocDoTrangThaiHanhTrinh.partial().extend({
  trangThai: z.enum(["hoat-dong", "ngung-hoat-dong"]).optional(),
});
export type DuLieuSuaTrangThaiHanhTrinh = z.infer<typeof LuocDoSuaTrangThaiHanhTrinh>;

export const LuocDoXepThuTu = z.object({ ids: z.array(z.uuid()).min(1).max(100) });

export const LuocDoDoiHanhTrinh = z.object({
  trangThaiId: z.uuid("Chọn trạng thái hành trình."),
  ghiChu: z
    .string()
    .trim()
    .max(1000)
    .transform((s) => (s ? s : null))
    .nullable()
    .optional(),
});
export type DuLieuDoiHanhTrinh = z.infer<typeof LuocDoDoiHanhTrinh>;

export const LuocDoPheu = z.object({
  tu: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  den: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nguoiPhuTrach: z.union([z.uuid(), z.literal("")]).optional().default(""),
});
