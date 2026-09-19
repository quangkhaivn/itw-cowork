import { z } from "zod";

/** Lược đồ dữ liệu vào của phân hệ Người dùng. Dùng chung cho API và kiểm thử. */

const chuoiTuyChon = (toiDa: number) =>
  z
    .string()
    .trim()
    .max(toiDa)
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .optional();

const uuidTuyChon = z
  .union([z.uuid(), z.literal(""), z.null()])
  .transform((s) => (s ? s : null))
  .optional();

export const LuocDoTaoNguoiDung = z.object({
  email: z.string().trim().toLowerCase().email("Email không hợp lệ.").max(255),
  hoTen: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự.").max(255),
  dienThoai: chuoiTuyChon(30),
  maNhanVien: chuoiTuyChon(50),
  chucDanh: chuoiTuyChon(255),
  phongBanId: uuidTuyChon,
  quanLyId: uuidTuyChon,
  vaiTroIds: z.array(z.uuid()).max(20).default([]),
  matKhauKhoiTao: z.string().min(1, "Nhập mật khẩu khởi tạo.").max(200),
  batDoiMatKhau: z.boolean().default(true),
});
export type DuLieuTaoNguoiDung = z.infer<typeof LuocDoTaoNguoiDung>;

export const LuocDoSuaNguoiDung = z.object({
  hoTen: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự.").max(255).optional(),
  dienThoai: chuoiTuyChon(30),
  maNhanVien: chuoiTuyChon(50),
  chucDanh: chuoiTuyChon(255),
  phongBanId: uuidTuyChon,
  quanLyId: uuidTuyChon,
  vaiTroIds: z.array(z.uuid()).max(20).optional(),
  trangThai: z.enum(["hoat-dong", "ngung-hoat-dong"]).optional(),
  moKhoaDangNhap: z.boolean().optional(),
});
export type DuLieuSuaNguoiDung = z.infer<typeof LuocDoSuaNguoiDung>;

export const LuocDoDatLaiMatKhau = z.object({
  matKhauMoi: z.string().min(1).max(200),
  batDoiMatKhau: z.boolean().default(true),
});

export const LuocDoDoiMatKhauCuaToi = z
  .object({
    matKhauHienTai: z.string().min(1, "Nhập mật khẩu hiện tại.").max(200),
    matKhauMoi: z.string().min(1).max(200),
    nhapLai: z.string().min(1).max(200),
  })
  .refine((d) => d.matKhauMoi === d.nhapLai, { message: "Hai lần nhập mật khẩu mới không khớp.", path: ["nhapLai"] })
  .refine((d) => d.matKhauMoi !== d.matKhauHienTai, {
    message: "Mật khẩu mới phải khác mật khẩu hiện tại.",
    path: ["matKhauMoi"],
  });

export const LuocDoLocNguoiDung = z.object({
  q: z.string().trim().max(100).optional().default(""),
  vaiTro: z.string().trim().max(50).optional().default(""),
  phongBan: z.string().trim().max(50).optional().default(""),
  trangThai: z.enum(["", "hoat-dong", "ngung-hoat-dong"]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocNguoiDung = z.infer<typeof LuocDoLocNguoiDung>;
