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

/** 0.25.0 (QĐ-233): nội dung riêng của một kênh. Trường bỏ trống = dùng nội dung chung. `anhIds` null = mọi ảnh / video. */
export const LuocDoBienTheKenh = z.object({
  kenhId: z.uuid(),
  tieuDe: chuoi(300).optional().nullable(),
  noiDung: z.string().trim().max(100_000).optional().nullable(),
  hashtags: z.array(z.string().trim().max(101)).max(30, "Tối đa 30 hashtag.").optional(),
  anhIds: z.array(z.uuid()).max(20).optional().nullable(),
});

export const LuocDoBai = z.object({
  tieuDe: chuoi(300).optional().nullable(),
  noiDung: z.string().trim().min(1, "Nhập nội dung bài.").max(100_000),
  kenhIds: z.array(z.uuid()).max(20).default([]),
  khoaLapLai: chuoi(100).optional().nullable(),
  /** 0.24.0: tùy chọn đăng theo nền tảng (Reels, liên kết, quyền riêng tư YouTube). Không gửi = giữ như cũ. */
  tuyChon: LuocDoTuyChonDang.optional(),
  /** 0.25.0: chiến dịch nội dung (null = bỏ khỏi chiến dịch; không gửi = giữ như cũ). */
  chienDichId: z.uuid().optional().nullable(),
  /** 0.25.0: ngày giờ dự kiến trên lịch nội dung (chưa xếp lịch đăng). Không gửi = giữ như cũ. */
  henDuKien: z.iso.datetime({ offset: true }).optional().nullable(),
  /** 0.25.0: nội dung riêng theo kênh. Không gửi = giữ như cũ; kênh không có trong mảng = dùng nội dung chung. */
  bienThe: z.array(LuocDoBienTheKenh).max(20).optional(),
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

// ---------------------------------------------------------------------------
// 0.25.0 — lịch nội dung, chiến dịch, sửa kênh lỗi, hồ sơ thương hiệu, AI viết bài (QĐ-230 →)
// ---------------------------------------------------------------------------

const NGAY = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày dạng YYYY-MM-DD.");

export const LuocDoLocLich = z.object({
  kieu: z.enum(["thang", "tuan"]).default("thang"),
  thang: z.string().regex(/^\d{4}-\d{2}$/, "Tháng dạng YYYY-MM.").optional(),
  ngay: NGAY.optional(),
  kenhId: z.uuid().optional(),
  chienDichId: z.uuid().optional(),
  nguoiSoanId: z.uuid().optional(),
});

/** Đổi lịch: `luc` (ISO có múi giờ), hoặc `ngay` (giờ VN) + `gio` "HH:mm" tùy chọn (không gửi giờ = giữ giờ cũ). */
export const LuocDoDoiLich = z.object({
  luc: z.iso.datetime({ offset: true }).optional(),
  ngay: NGAY.optional(),
  gio: z.string().regex(/^\d{2}:\d{2}$/, "Giờ dạng HH:mm.").optional().nullable(),
}).refine((d) => Boolean(d.luc || d.ngay), { message: "Chọn ngày giờ mới." });

/** Sửa nội dung riêng của MỘT kênh lỗi (QĐ-234). */
export const LuocDoSuaKenhLoi = z.object({
  tieuDe: chuoi(300).optional().nullable(),
  noiDung: z.string().trim().max(100_000).optional().nullable(),
  hashtags: z.array(z.string().trim().max(101)).max(30, "Tối đa 30 hashtag.").optional(),
  anhIds: z.array(z.uuid()).max(20).optional().nullable(),
});

export const LuocDoChienDich = z.object({
  ten: chuoi(200).min(2, "Nhập tên chiến dịch."),
  tuNgay: NGAY.optional().nullable(),
  denNgay: NGAY.optional().nullable(),
  mucTieu: chuoi(2000).optional().nullable(),
  chienDichMarketingId: z.uuid().optional().nullable(),
  trangThai: z.enum(["hoat-dong", "luu-tru"]).optional(),
}).refine((d) => !d.tuNgay || !d.denNgay || d.denNgay >= d.tuNgay, { message: "Ngày kết thúc phải từ ngày bắt đầu trở đi.", path: ["denNgay"] });

export const LuocDoThuongHieu = z.object({
  giongVan: z.string().max(2000, "Tối đa 2.000 ký tự.").optional().nullable(),
  tuCam: z.array(z.string().max(100)).max(200, "Tối đa 200 từ cấm.").default([]),
  hashtagBatBuoc: z.array(z.string().max(101)).max(30, "Tối đa 30 hashtag.").default([]),
  cauBatBuoc: z.array(z.string().max(300)).max(20, "Tối đa 20 câu bắt buộc.").default([]),
  cta: z.array(z.string().max(300)).max(10, "Tối đa 10 câu kêu gọi hành động.").default([]),
  baiMau: z.array(z.string().max(3000, "Mỗi bài mẫu tối đa 3.000 ký tự.")).max(5, "Tối đa 5 bài mẫu.").default([]),
});

export const LuocDoVietBaiAi = z.object({
  sanPhamIds: z.array(z.uuid()).min(1, "Chọn ít nhất một sản phẩm.").max(10, "Tối đa 10 sản phẩm một lần."),
  kenhIds: z.array(z.uuid()).min(1, "Chọn ít nhất một kênh.").max(20),
  yeuCau: chuoi(1000).optional().nullable(),
  chienDichId: z.uuid().optional().nullable(),
  khoaLapLai: chuoi(100).optional().nullable(),
});
