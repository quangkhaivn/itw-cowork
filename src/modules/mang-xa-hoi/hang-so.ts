/**
 * Danh mục dùng chung (máy chủ + trình duyệt) của phân hệ Mạng xã hội (0.23.0, BUSINESS_RULES mục 34).
 * Thuần — không import gì của máy chủ.
 */

export const NEN_TANG = ["WORDPRESS", "FACEBOOK_PAGE", "INSTAGRAM", "YOUTUBE", "ZALO_OA"] as const;
export type NenTang = (typeof NEN_TANG)[number];

export const TEN_NEN_TANG: Record<string, string> = {
  WORDPRESS: "WordPress",
  FACEBOOK_PAGE: "Facebook Page",
  INSTAGRAM: "Instagram",
  YOUTUBE: "YouTube",
  ZALO_OA: "Zalo OA",
};

/** ADR-04 — trạng thái connector toàn hệ thống. */
export const KHA_DUNG = ["AVAILABLE", "PENDING_APPROVAL", "DISABLED"] as const;
export type KhaDung = (typeof KHA_DUNG)[number];
export const NHAN_KHA_DUNG: Record<KhaDung, string> = {
  AVAILABLE: "Dùng được",
  PENDING_APPROVAL: "Chờ nền tảng duyệt — sắp có",
  DISABLED: "Chưa hỗ trợ",
};

export const TRANG_THAI_KENH = ["ACTIVE", "NEEDS_REAUTH", "ERROR", "DISCONNECTED"] as const;
export type TrangThaiKenh = (typeof TRANG_THAI_KENH)[number];
export const NHAN_TRANG_THAI_KENH: Record<TrangThaiKenh, { nhan: string; lop: string }> = {
  ACTIVE: { nhan: "Đang nối", lop: "tot" },
  NEEDS_REAUTH: { nhan: "Cần cấp lại quyền (nhập lại mật khẩu ứng dụng / Kết nối lại)", lop: "loi" },
  ERROR: { nhan: "Lỗi", lop: "loi" },
  DISCONNECTED: { nhan: "Đã ngắt", lop: "" },
};

export const TRANG_THAI_BAI = [
  "DRAFT", "PENDING_APPROVAL", "APPROVED", "SCHEDULED", "PUBLISHING", "PUBLISHED", "PARTIALLY_FAILED", "FAILED", "CANCELED",
] as const;
export type TrangThaiBai = (typeof TRANG_THAI_BAI)[number];
export const NHAN_TRANG_THAI_BAI: Record<TrangThaiBai, { nhan: string; lop: string }> = {
  DRAFT: { nhan: "Nháp", lop: "" },
  PENDING_APPROVAL: { nhan: "Chờ duyệt", lop: "canh-bao" },
  APPROVED: { nhan: "Đã duyệt", lop: "thong-tin" },
  SCHEDULED: { nhan: "Đã hẹn giờ", lop: "thong-tin" },
  PUBLISHING: { nhan: "Đang đăng", lop: "canh-bao" },
  PUBLISHED: { nhan: "Đã đăng", lop: "tot" },
  PARTIALLY_FAILED: { nhan: "Lỗi một phần", lop: "loi" },
  FAILED: { nhan: "Lỗi", lop: "loi" },
  CANCELED: { nhan: "Đã hủy", lop: "" },
};

export const TRANG_THAI_KENH_BAI = ["PENDING", "QUEUED", "PUBLISHING", "VERIFYING", "PUBLISHED", "FAILED", "SKIPPED", "CANCELED", "NEEDS_CHECK"] as const;
export type TrangThaiKenhBai = (typeof TRANG_THAI_KENH_BAI)[number];
export const NHAN_TRANG_THAI_KENH_BAI: Record<TrangThaiKenhBai, { nhan: string; lop: string }> = {
  PENDING: { nhan: "Chưa xếp lịch", lop: "" },
  QUEUED: { nhan: "Chờ đăng", lop: "thong-tin" },
  PUBLISHING: { nhan: "Đang đăng", lop: "canh-bao" },
  VERIFYING: { nhan: "Đang xác minh", lop: "canh-bao" },
  PUBLISHED: { nhan: "Đã đăng (đã xác minh)", lop: "tot" },
  FAILED: { nhan: "Lỗi", lop: "loi" },
  SKIPPED: { nhan: "Bỏ qua", lop: "" },
  CANCELED: { nhan: "Đã hủy", lop: "" },
  // QA 0.23.0 (QĐ-207): kênh bị ngắt khi đang xác minh, đối soát công khai không ra — bài CÓ THỂ đã lên.
  NEEDS_CHECK: { nhan: "Không rõ – cần kiểm tay", lop: "canh-bao" },
};

/** QA 0.23.0 (QĐ-206): nhãn bài "Đã duyệt" mà giờ hẹn đã trễ quá ngưỡng lúc duyệt. */
export const NHAN_DA_DUYET_CAN_HEN_LAI = { nhan: "Đã duyệt – cần hẹn lại giờ", lop: "canh-bao" };

/** Phân loại lỗi (mục 7.1 tài liệu gốc). */
export const LOAI_LOI = ["RETRYABLE", "PERMANENT", "NEEDS_REAUTH", "UNKNOWN"] as const;
export type LoaiLoi = (typeof LOAI_LOI)[number];

/** Hướng dẫn hiện cạnh lỗi — người dùng biết phải làm gì, không chỉ thấy mã lỗi. */
export const HUONG_DAN_LOI: Record<LoaiLoi, string> = {
  RETRYABLE: "Máy chủ của nền tảng tạm lỗi hoặc mất mạng. Hệ thống đã tự thử lại nhiều lần; kiểm tra site còn chạy rồi bấm “Đăng lại”.",
  PERMANENT: "Nền tảng từ chối nội dung (sai định dạng, ảnh không hợp lệ, vi phạm chính sách). Sửa bài theo thông báo của nền tảng rồi đăng lại — thử lại nguyên bài sẽ bị từ chối tiếp.",
  NEEDS_REAUTH: "Tên đăng nhập / mật khẩu ứng dụng không còn hợp lệ (bị thu hồi, đổi quyền). Vào Mạng xã hội → Kênh, nhập lại mật khẩu ứng dụng rồi bấm “Đăng lại”.",
  UNKNOWN: "Đã gửi bài nhưng không nhận được trả lời. Hệ thống đang đối soát (đọc lại trên nền tảng) — không đăng lại mù để tránh trùng bài.",
};

/** 0.24.0 — hướng dẫn NEEDS_REAUTH cho kênh OAuth (Facebook, Instagram, YouTube). */
export const HUONG_DAN_LOI_OAUTH =
  "Quyền Cowork được cấp trên nền tảng đã hết hạn hoặc bị thu hồi (đổi mật khẩu Facebook, gỡ quyền ứng dụng, mất vai trò quản trị Page…). Vào Mạng xã hội → Kênh, bấm “Kết nối lại” ở kênh đó, rồi quay lại bài bấm “Đăng lại”.";

/** Thông tin app nền tảng (màn hình Quản trị → Kết nối nền tảng). */
export const NHA_CUNG_CAP_APP = ["META", "GOOGLE", "ZALO"] as const;
export type NhaCungCapApp = (typeof NHA_CUNG_CAP_APP)[number];
export const NHA_CUNG_CAP_CHUA_HO_TRO = ["X", "TIKTOK", "LINKEDIN"] as const;
export const TEN_NHA_CUNG_CAP: Record<string, string> = {
  META: "Meta (Facebook / Instagram)",
  GOOGLE: "Google (YouTube + Google Drive)",
  ZALO: "Zalo OA",
  X: "X (Twitter)",
  TIKTOK: "TikTok",
  LINKEDIN: "LinkedIn",
};
/** Phiên bản Graph API điền sẵn — Giám đốc / Quản trị sửa được khi Meta ra bản mới. */
export const GRAPH_VERSION_MAC_DINH = "v24.0";
