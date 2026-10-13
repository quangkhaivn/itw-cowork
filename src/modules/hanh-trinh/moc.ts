/**
 * Danh mục MỐC TỰ CHUYỂN BƯỚC của hành trình khách hàng — BUSINESS_RULES.md mục 21 (KHN-03).
 *
 * Giống quy tắc nhắc việc (QĐ-30): mốc là **mã**, không phải dữ liệu. Mỗi mốc biết sự kiện
 * nghiệp vụ nào kích hoạt nó; Giám đốc chỉ chọn trạng thái nào nhận mốc nào (cột
 * `customer_journey_stages.auto_milestone`). Danh sách mã phải khớp CHECK ở migration.
 *
 * Tệp thuần — dùng được ở cả máy chủ lẫn trình duyệt.
 */

export const MOC_TU_DONG = [
  { ma: "tao-khach", nhan: "Khách mới được tạo", moTa: "Khách vừa được tạo (nhập tay, nhập CSV hoặc chuyển đổi từ lead)." },
  { ma: "co-hoi-mo", nhan: "Có cơ hội đang mở", moTa: "Một cơ hội bán hàng được mở cho khách." },
  { ma: "bao-gia-da-gui", nhan: "Đã gửi báo giá", moTa: "Một báo giá của khách được ghi nhận đã gửi." },
  { ma: "co-hoi-thang", nhan: "Thắng cơ hội", moTa: "Một cơ hội của khách chuyển sang Thắng." },
  { ma: "don-xac-nhan", nhan: "Đơn hàng được xác nhận", moTa: "Một đơn hàng bán của khách được xác nhận." },
] as const;

export type MaMoc = (typeof MOC_TU_DONG)[number]["ma"];
export const MA_MOC: readonly string[] = MOC_TU_DONG.map((m) => m.ma);
export const NHAN_MOC: Record<string, string> = Object.fromEntries(MOC_TU_DONG.map((m) => [m.ma, m.nhan]));

/**
 * Mốc đủ mạnh để kéo khách ra khỏi trạng thái "thất bại": khách đã bỏ mà nay nhận báo giá,
 * thắng cơ hội hay có đơn xác nhận thì rõ ràng đã quay lại. Mở cơ hội thì chưa đủ.
 */
export const MOC_KEO_LAI: readonly string[] = ["bao-gia-da-gui", "co-hoi-thang", "don-xac-nhan"];

export const LOAI_TRANG_THAI = ["mo", "thanh-cong", "that-bai"] as const;
export type LoaiTrangThai = (typeof LOAI_TRANG_THAI)[number];
export const NHAN_LOAI_TRANG_THAI: Record<string, string> = {
  mo: "Đang theo",
  "thanh-cong": "Thành công",
  "that-bai": "Thất bại (ngoài phễu)",
};

/**
 * Danh mục trạng thái khởi tạo cho doanh nghiệp mới (seed) — trùng với migration
 * `khach_hang_nang_cao` cho doanh nghiệp đã có. Chỉ là TÊN bước; số ngày "đứng lâu" để trống
 * cho Giám đốc tự đặt. Seed chỉ tạo khi doanh nghiệp chưa có trạng thái nào (QĐ-10).
 */
export const TRANG_THAI_KHOI_TAO: { ma: string; ten: string; mau: string; loai: LoaiTrangThai; moc: MaMoc | null }[] = [
  { ma: "khach-moi", ten: "Khách mới", mau: "#64748B", loai: "mo", moc: "tao-khach" },
  { ma: "dang-tu-van", ten: "Đang tư vấn", mau: "#2563EB", loai: "mo", moc: "co-hoi-mo" },
  { ma: "da-bao-gia", ten: "Đã báo giá", mau: "#D97706", loai: "mo", moc: "bao-gia-da-gui" },
  { ma: "da-chot-don", ten: "Đã chốt đơn", mau: "#16A34A", loai: "thanh-cong", moc: "don-xac-nhan" },
  { ma: "ngung-quan-tam", ten: "Ngừng quan tâm", mau: "#DC2626", loai: "that-bai", moc: null },
];
