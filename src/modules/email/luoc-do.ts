import { z } from "zod";
import { LA_VUNG_AWS, laNhanQuangCaoHopLe, LuocDoDanhSachKhoi, LuocDoTieuDeThu, laEmailHopLe, vungCuaTopic } from "./tinh-toan";

/** Tên miền: nhãn chữ thường / số / gạch ngang, ít nhất hai phần, đuôi chữ ≥ 2. */
export function laTenMien(s: string): boolean {
  return s.length <= 253 && /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(s);
}

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

const tenMien = (nhan: string) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .max(253)
    .refine((s) => s === "" || laTenMien(s), { message: `${nhan} không phải tên miền hợp lệ (vd tin.itwonline.com).` });

export const LuocDoKetNoiEmail = z.object({
  /** 0.18.0 — kênh gửi. `ses`: máy chủ / cổng / mã hóa do máy tự đặt theo vùng (EG-01). */
  kenh: z.enum(["smtp", "ses"]).default("smtp"),
  host: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .refine((s) => s === "" || /^[a-z0-9.-]{3,}$/.test(s), { message: "Tên máy chủ chỉ gồm chữ, số, dấu chấm, gạch ngang." })
    .default(""),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  baoMat: z.enum(["tls", "starttls", "none"]).default("starttls"),
  sesVung: z.string().trim().toLowerCase().max(30).refine((s) => s === "" || LA_VUNG_AWS.test(s), { message: "Vùng AWS không hợp lệ (vd ap-southeast-1)." }).default(""),
  sesConfigurationSet: z.string().trim().max(64).refine((s) => s === "" || /^[A-Za-z0-9_-]{1,64}$/.test(s), { message: "Tên configuration set chỉ gồm chữ, số, - và _." }).default(""),
  tenMienGui: tenMien("Tên miền gửi").default(""),
  tenMienMailFrom: tenMien("Tên miền MAIL FROM").default(""),
  dkim: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9]{16,64}$/, "Mã DKIM chỉ gồm chữ thường và số (16–64 ký tự).")).max(3, "SES Easy DKIM có đúng 3 mã.").default([]),
  dmarcRua: z.union([z.string().trim().toLowerCase().max(254).refine((s) => laEmailHopLe(s), { message: "Hộp thư nhận báo cáo DMARC không hợp lệ." }), z.literal("")]).default(""),
  sesTopicArn: z.string().trim().max(300).refine((s) => s === "" || vungCuaTopic(s) !== null, { message: "ARN chủ đề SNS không hợp lệ (arn:aws:sns:<vùng>:<12 số>:<tên>)." }).default(""),
  /** EG-06: nhãn quảng cáo đầu tiêu đề. Không để trống được — trống = mặc định [QC]. */
  nhanQuangCao: z.string().trim().max(20).refine((s) => s === "" || laNhanQuangCaoHopLe(s), { message: "Nhãn quảng cáo 2–20 ký tự, không xuống dòng." }).default(""),
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
