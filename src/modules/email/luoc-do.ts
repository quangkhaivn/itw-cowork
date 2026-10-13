import { z } from "zod";
import { LuocDoDanhSachKhoi, LuocDoTieuDeThu, laEmailHopLe } from "./tinh-toan";

/** Lược đồ email marketing. Luật: BUSINESS_RULES.md mục 23 (EM). */

const email = (nhan: string) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .refine((s) => laEmailHopLe(s), { message: `${nhan} không phải địa chỉ email hợp lệ.` });

/** Tên người gửi đi vào tiêu đề thư — không cho xuống dòng (chống chèn tiêu đề). */
const motDong = (toiDa: number, nhan: string) =>
  z
    .string()
    .trim()
    .min(1, `Nhập ${nhan}.`)
    .max(toiDa)
    .refine((s) => !/[\r\n<>"]/.test(s), { message: `${nhan} không được chứa xuống dòng hoặc ký tự < > ".` });

export const LuocDoKetNoiEmail = z.object({
  host: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Nhập máy chủ SMTP.")
    .max(255)
    .regex(/^[a-z0-9.-]+$/, "Tên máy chủ chỉ gồm chữ, số, dấu chấm, gạch ngang."),
  port: z.coerce.number().int().min(1).max(65535),
  baoMat: z.enum(["tls", "starttls", "none"]),
  tenDangNhap: z.string().trim().max(255).default(""),
  /**
   * Mật khẩu: bỏ trống (hoặc không gửi) = **giữ nguyên** mật khẩu đang lưu; muốn xóa thì gửi
   * `xoaMatKhau: true`. API không bao giờ trả mật khẩu về, nên form không thể điền sẵn nó.
   */
  matKhau: z.string().max(500).optional(),
  xoaMatKhau: z.boolean().default(false),
  tenNguoiGui: motDong(255, "tên người gửi"),
  emailNguoiGui: email("Địa chỉ người gửi"),
  traLoi: z.union([email("Địa chỉ trả lời"), z.literal("")]).default(""),
  theoDoi: z.boolean().default(false),
});
export type DuLieuKetNoiEmail = z.infer<typeof LuocDoKetNoiEmail>;

export const LuocDoMau = z.object({
  ten: z.string().trim().min(2, "Đặt tên mẫu (tối thiểu 2 ký tự).").max(255),
  tieuDe: LuocDoTieuDeThu,
  khoi: LuocDoDanhSachKhoi,
});
export type DuLieuMau = z.infer<typeof LuocDoMau>;

export const LuocDoXemTruoc = z.object({
  tieuDe: LuocDoTieuDeThu,
  khoi: LuocDoDanhSachKhoi,
});

export const LuocDoLocMau = z.object({
  q: z.string().trim().max(100).default(""),
  luuTru: z.enum(["", "co"]).default(""),
});

export const LuocDoTaoChienDich = z.object({
  ten: z.string().trim().min(2, "Đặt tên chiến dịch.").max(255),
  mauId: z.uuid("Chọn mẫu email."),
  nguon: z.string().trim().min(1).max(50).default("loc-don-gian"),
  thamSo: z.unknown(),
});
export type DuLieuTaoChienDich = z.infer<typeof LuocDoTaoChienDich>;

export const LuocDoSuaChienDich = z.object({
  ten: z.string().trim().min(2).max(255).optional(),
  tieuDe: LuocDoTieuDeThu.optional(),
  khoi: LuocDoDanhSachKhoi.optional(),
  nguon: z.string().trim().min(1).max(50).optional(),
  thamSo: z.unknown().optional(),
});
export type DuLieuSuaChienDich = z.infer<typeof LuocDoSuaChienDich>;

export const LuocDoXemTruocNguoiNhan = z.object({
  nguon: z.string().trim().min(1).max(50).default("loc-don-gian"),
  thamSo: z.unknown(),
});

export const LuocDoLyDo = z.object({
  lyDo: z.string().trim().min(2, "Ghi lý do (tối thiểu 2 ký tự).").max(2000),
});
export const LuocDoLyDoTuyChon = z.object({
  lyDo: z.string().trim().max(2000).default(""),
});

export const LuocDoLocChienDich = z.object({
  q: z.string().trim().max(100).default(""),
  trangThai: z.string().trim().max(30).default(""),
  trang: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const LuocDoLocNguoiNhan = z.object({
  trangThai: z.enum(["", "QUEUED", "SENDING", "SENT", "FAILED", "SKIPPED"]).default(""),
  trang: z.coerce.number().int().min(1).max(10_000).default(1),
});
