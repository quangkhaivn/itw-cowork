import { z } from "zod";

/** Lược đồ dữ liệu vào của phân hệ Mạng xã hội (0.23.0). */

const chuoi = (toiDa: number) => z.string().trim().max(toiDa, `Tối đa ${toiDa} ký tự.`);

export const LuocDoThongTinWordPress = z.object({
  diaChi: chuoi(500).min(4, "Nhập địa chỉ site."),
  tenDangNhap: chuoi(200).min(1, "Nhập tên đăng nhập WordPress."),
  // Mật khẩu ứng dụng WordPress: 24 ký tự, có thể có dấu cách nhóm 4 — giữ nguyên dấu cách, WordPress tự bỏ.
  matKhauUngDung: z.string().min(8, "Mật khẩu ứng dụng quá ngắn.").max(200),
});

export const LuocDoKetNoiWordPress = LuocDoThongTinWordPress.extend({
  ten: chuoi(200).optional(),
});

export const LuocDoDoiMatKhauKenh = z.object({
  tenDangNhap: chuoi(200).min(1).optional(),
  matKhauUngDung: z.string().min(8, "Mật khẩu ứng dụng quá ngắn.").max(200),
});

export const LuocDoSuaKenh = z.object({ ten: chuoi(200).min(1) });

export const LuocDoTuyChonDang = z.object({
  facebookReels: z.boolean().optional(),
  lienKet: z.string().trim().max(2000).regex(/^(https?:\/\/\S+)?$/, "Liên kết phải bắt đầu bằng https://").optional().nullable(),
  youtubeRiengTu: z.enum(["private", "unlisted", "public"]).optional(),
});

export const LuocDoBai = z.object({
  tieuDe: chuoi(300).optional().nullable(),
  noiDung: z.string().trim().min(1, "Nhập nội dung bài.").max(100_000),
  kenhIds: z.array(z.uuid()).max(20).default([]),
  khoaLapLai: chuoi(100).optional().nullable(),
  /** 0.24.0: tùy chọn đăng theo nền tảng (Reels, liên kết, quyền riêng tư YouTube). Không gửi = giữ như cũ. */
  tuyChon: LuocDoTuyChonDang.optional(),
});

export const LuocDoGuiDuyet = z.object({
  cheDo: z.enum(["ngay", "hen-gio", "khong"]).default("khong"),
  henLuc: z.iso.datetime({ offset: true }).optional().nullable(),
});

export const LuocDoHenGio = z.object({
  henLuc: z.iso.datetime({ offset: true }),
});

export const LuocDoGhiChu = z.object({ ghiChu: chuoi(1000).optional().nullable() });
export const LuocDoTraLai = z.object({ lyDo: chuoi(1000).min(3, "Ghi lý do trả lại để người soạn biết sửa gì.") });

export const LuocDoLocBai = z.object({
  trangThai: z.string().max(30).optional(),
  trang: z.coerce.number().int().min(1).max(1000).default(1),
});

export const LuocDoThongTinApp = z.object({
  appId: chuoi(100).optional().nullable(),
  graphVersion: chuoi(20).optional().nullable(),
  /** 0.24.0: Meta — mã cấu hình Facebook Login for Business (config_id), không bắt buộc. */
  configId: chuoi(30).optional().nullable(),
  clientId: chuoi(300).optional().nullable(),
  /** Bí mật mới — trống = giữ bí mật đã lưu. */
  biMat: z.string().max(500).optional().nullable(),
  /** 0.24.0: Google API key cho Google Picker — trống = giữ khóa đã lưu. */
  khoaPicker: z.string().trim().max(200).optional().nullable(),
});

/** 0.24.0 — bắt đầu kết nối OAuth (kết nối mới, hoặc kết nối lại một kênh cần cấp lại quyền). */
export const LuocDoBatDauOAuth = z.object({ kenhId: z.uuid().optional().nullable() });

export const LuocDoChonKenhOAuth = z.object({ ungVienIds: z.array(z.uuid()).min(1, "Chọn ít nhất một kênh.").max(50) });

/** Tải tệp đã chọn bằng Google Picker. Access token chỉ dùng trong yêu cầu này — không lưu, không ghi nhật ký. */
export const LuocDoTaiDrive = z.object({
  accessToken: z.string().min(10).max(4096).regex(/^[A-Za-z0-9._~+/=-]+$/, "Token không hợp lệ."),
  tepIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{10,200}$/, "Mã tệp Drive không hợp lệ.")).min(1).max(10),
});

export const LuocDoTrangCongKhai = z.object({
  tieuDe: chuoi(200).min(1, "Nhập tiêu đề."),
  noiDung: z.string().max(100_000),
});
