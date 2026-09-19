import { z } from "zod";
import { TRANG_THAI_KHACH } from "@/modules/crm/hang-so";
import { chuoiTuyChon, uuidTuyChon } from "@/modules/crm/chung";

/** Lược đồ dữ liệu vào của phân hệ Khách hàng. Dùng chung cho API, form và kiểm thử. */

const emailTuyChon = z
  .union([z.email("Email không hợp lệ.").max(255), z.literal(""), z.null()])
  .transform((s) => (s ? s.trim() : null))
  .optional();

const maDuLieuGoc = chuoiTuyChon(50);

export const LuocDoLienHe = z.object({
  hoTen: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự.").max(255),
  chucDanh: chuoiTuyChon(255),
  phongBan: chuoiTuyChon(255),
  dienThoai: chuoiTuyChon(30),
  email: emailTuyChon,
  zalo: chuoiTuyChon(50),
  laChinh: z.boolean().optional(),
  ghiChu: chuoiTuyChon(2000),
});
export type DuLieuLienHe = z.infer<typeof LuocDoLienHe>;

export const LuocDoSuaLienHe = LuocDoLienHe.partial().extend({
  trangThai: z.enum(["hoat-dong", "ngung-hoat-dong"]).optional(),
});

const truongKhach = {
  ten: z.string().trim().min(2, "Tên khách hàng tối thiểu 2 ký tự.").max(255),
  maSoThue: chuoiTuyChon(30),
  loaiKhach: maDuLieuGoc,
  phanKhuc: maDuLieuGoc,
  nganh: maDuLieuGoc,
  nguon: maDuLieuGoc,
  diaChi: chuoiTuyChon(1000),
  tinhThanh: chuoiTuyChon(100),
  website: chuoiTuyChon(255),
  dienThoai: chuoiTuyChon(30),
  email: emailTuyChon,
  nguoiPhuTrachId: uuidTuyChon,
  ghiChu: chuoiTuyChon(5000),
};

export const LuocDoTaoKhachHang = z.object({
  ...truongKhach,
  /** Liên hệ chính tạo cùng lúc — tùy chọn. */
  lienHe: LuocDoLienHe.optional().nullable(),
  /** Người dùng đã xem cảnh báo có thể trùng và xác nhận đây là khách mới (KH-03). */
  xacNhanKhongTrung: z.boolean().optional().default(false),
});
export type DuLieuTaoKhachHang = z.infer<typeof LuocDoTaoKhachHang>;

/** Sửa: mọi trường tùy chọn (các trường phụ vốn đã tùy chọn); trường vắng mặt = giữ nguyên. */
export const LuocDoSuaKhachHang = z.object({
  ...truongKhach,
  ten: truongKhach.ten.optional(),
  trangThai: z.enum(TRANG_THAI_KHACH).optional(),
  xacNhanKhongTrung: z.boolean().optional().default(false),
});
export type DuLieuSuaKhachHang = z.infer<typeof LuocDoSuaKhachHang>;

export const LuocDoLocKhachHang = z.object({
  q: z.string().trim().max(100).optional().default(""),
  nguoiPhuTrach: z.union([z.uuid(), z.literal("")]).optional().default(""),
  phanKhuc: z.string().trim().max(50).optional().default(""),
  trangThai: z.enum(["", ...TRANG_THAI_KHACH]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocKhachHang = z.infer<typeof LuocDoLocKhachHang>;

/** Dò trùng trước khi lưu — form gọi khi người dùng rời ô MST / điện thoại / email / tên. */
export const LuocDoDoTrung = z.object({
  ten: z.string().trim().max(255).optional().default(""),
  maSoThue: z.string().trim().max(30).optional().default(""),
  dienThoai: z.string().trim().max(30).optional().default(""),
  email: z.string().trim().max(255).optional().default(""),
  boQuaId: z.union([z.uuid(), z.literal("")]).optional().default(""),
});
