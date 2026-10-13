import { z } from "zod";

export const LuocDoNhomKhach = z.object({
  ten: z.string().trim().min(1, "Nhập tên nhóm.").max(100),
  mau: z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "Màu phải dạng #RRGGBB."),
  moTa: z
    .string()
    .trim()
    .max(1000)
    .transform((s) => (s ? s : null))
    .nullable()
    .optional(),
});
export type DuLieuNhomKhach = z.infer<typeof LuocDoNhomKhach>;

export const LuocDoSuaNhomKhach = LuocDoNhomKhach.partial().extend({
  trangThai: z.enum(["hoat-dong", "ngung-hoat-dong"]).optional(),
});

/** Đặt lại toàn bộ nhóm của một khách (trang Customer 360). */
export const LuocDoNhomCuaKhach = z.object({ nhomIds: z.array(z.uuid()).max(50) });
