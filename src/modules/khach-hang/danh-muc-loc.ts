/**
 * Danh mục lọc nhanh, sắp xếp và cột của danh sách khách hàng — tệp THUẦN, dùng chung cho
 * máy chủ và trình duyệt. Mọi giá trị đến từ URL hay từ bộ lọc đã lưu đều phải nằm trong
 * các danh mục này (KHN-07): bộ lọc lưu trong CSDL không được tin.
 */

export const LOC_NHANH = [
  { ma: "cua-toi", nhan: "Của tôi" },
  { ma: "chua-co-hanh-trinh", nhan: "Chưa có trạng thái hành trình" },
  { ma: "dung-lau", nhan: "Đứng lâu một trạng thái" },
  { ma: "sinh-nhat-thang-nay", nhan: "Sinh nhật liên hệ trong tháng" },
  { ma: "co-co-hoi-mo", nhan: "Có cơ hội đang mở" },
  { ma: "chua-tuong-tac", nhan: "Chưa có tương tác" },
  { ma: "nong", nhan: "Khách nóng" },
] as const;
export type MaLocNhanh = (typeof LOC_NHANH)[number]["ma"];
export const MA_LOC_NHANH = LOC_NHANH.map((l) => l.ma) as [MaLocNhanh, ...MaLocNhanh[]];

export const SAP_XEP = [
  { ma: "moi-cap-nhat", nhan: "Mới cập nhật" },
  { ma: "moi-tao", nhan: "Mới tạo" },
  { ma: "ten", nhan: "Tên A → Z" },
  { ma: "diem", nhan: "Điểm cao nhất" },
  { ma: "dung-lau-nhat", nhan: "Đứng trạng thái lâu nhất" },
] as const;
export type MaSapXep = (typeof SAP_XEP)[number]["ma"];
export const MA_SAP_XEP = SAP_XEP.map((s) => s.ma) as [MaSapXep, ...MaSapXep[]];

/** Cột tùy chọn. Cột "Khách hàng" (tên + mã) luôn hiện, không nằm trong danh mục. */
export const COT_KHACH = [
  { ma: "lien-lac", nhan: "Liên lạc" },
  { ma: "phan-khuc", nhan: "Phân khúc" },
  { ma: "phu-trach", nhan: "Phụ trách" },
  { ma: "hanh-trinh", nhan: "Hành trình" },
  { ma: "diem", nhan: "Điểm" },
  { ma: "nhom", nhan: "Nhóm" },
  { ma: "co-hoi", nhan: "Cơ hội mở" },
  { ma: "trang-thai", nhan: "Trạng thái giao dịch" },
  { ma: "tinh-thanh", nhan: "Tỉnh / thành" },
  { ma: "nguon", nhan: "Nguồn" },
  { ma: "tao-luc", nhan: "Ngày tạo" },
] as const;
export type MaCot = (typeof COT_KHACH)[number]["ma"];
export const COT_MAC_DINH: MaCot[] = ["lien-lac", "phu-trach", "hanh-trinh", "diem", "co-hoi", "trang-thai"];

/** Lọc danh sách cột đã lưu theo danh mục thật; rỗng hoặc hỏng → bộ mặc định. */
export function locCot(x: unknown): MaCot[] {
  if (!Array.isArray(x)) return [...COT_MAC_DINH];
  const hopLe = new Set<string>(COT_KHACH.map((c) => c.ma));
  const kq = [...new Set(x.filter((c): c is MaCot => typeof c === "string" && hopLe.has(c)))];
  return kq.length ? kq : [...COT_MAC_DINH];
}

/** Các tham số URL của danh sách khách hàng được phép lưu vào bộ lọc. */
export const THAM_SO_LOC = ["q", "nguoiPhuTrach", "phanKhuc", "trangThai", "hanhTrinh", "nhom", "nhanh", "sapXep"] as const;

/** Giữ lại đúng các khóa đã biết, giá trị là chuỗi ngắn. Kiểm giá trị sau bằng lược đồ lọc. */
export function chuanHoaThamSoLuu(x: unknown): Record<string, string> {
  const kq: Record<string, string> = {};
  if (!x || typeof x !== "object" || Array.isArray(x)) return kq;
  for (const k of THAM_SO_LOC) {
    const v = (x as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim() && v.length <= 100) kq[k] = v.trim();
  }
  return kq;
}

/** Dựng chuỗi truy vấn từ bộ tham số (bỏ ô rỗng). */
export function chuoiTruyVan(t: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(t)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `?${s}` : "";
}
