/**
 * Thanh điều hướng bên trái — một nguồn duy nhất cho menu, tìm kiếm màn hình và breadcrumb.
 *
 * Chỉ liệt kê màn hình ĐÃ CHẠY THẬT. Phân hệ chưa xây (CRM, Báo giá, Kho…) chưa có
 * mặt ở đây — không để nút dẫn tới trang trống (mục 41 master prompt: không dead button).
 * Mỗi phase thêm mục của mình vào đúng nhóm theo sidebar mục 5 master prompt.
 */

export type BieuTuong =
  | "bang-dieu-khien"
  | "nguoi-dung"
  | "vai-tro"
  | "phong-ban"
  | "du-lieu-goc"
  | "cau-hinh"
  | "nhat-ky";

export interface MucDieuHuong {
  nhan: string;
  href: string;
  /** Quyền cần có để thấy mục này. `null` = ai đăng nhập cũng thấy. */
  quyen: string | null;
  bieuTuong: BieuTuong;
  /** Từ khóa phụ cho ô tìm kiếm (không dấu cũng được). */
  tuKhoa?: string;
}

export interface NhomDieuHuong {
  nhan: string;
  muc: MucDieuHuong[];
}

export const DIEU_HUONG: NhomDieuHuong[] = [
  {
    nhan: "Tổng quan",
    muc: [
      {
        nhan: "Bảng điều hành",
        href: "/bang-dieu-khien",
        quyen: null,
        bieuTuong: "bang-dieu-khien",
        tuKhoa: "dashboard trang chu",
      },
    ],
  },
  {
    nhan: "Quản trị",
    muc: [
      { nhan: "Người dùng", href: "/quan-tri/nguoi-dung", quyen: "user.view", bieuTuong: "nguoi-dung", tuKhoa: "nhan vien tai khoan users" },
      { nhan: "Vai trò & quyền", href: "/quan-tri/vai-tro", quyen: "role.view", bieuTuong: "vai-tro", tuKhoa: "phan quyen roles permissions" },
      { nhan: "Phòng ban", href: "/quan-tri/phong-ban", quyen: "department.view", bieuTuong: "phong-ban", tuKhoa: "departments to chuc" },
      { nhan: "Dữ liệu gốc", href: "/quan-tri/du-lieu-goc", quyen: "master_data.view", bieuTuong: "du-lieu-goc", tuKhoa: "master data danh muc nguon lead don vi tinh" },
      { nhan: "Cấu hình hệ thống", href: "/quan-tri/cau-hinh", quyen: "setting.view", bieuTuong: "cau-hinh", tuKhoa: "settings nguong bien loi nhuan" },
      { nhan: "Nhật ký kiểm toán", href: "/quan-tri/nhat-ky-kiem-toan", quyen: "audit_log.view", bieuTuong: "nhat-ky", tuKhoa: "audit log lich su" },
    ],
  },
];
