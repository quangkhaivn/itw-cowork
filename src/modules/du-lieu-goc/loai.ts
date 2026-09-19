/**
 * Các loại dữ liệu gốc và giá trị khởi tạo.
 *
 * Nguồn giá trị khởi tạo — ghi rõ để không lẫn dữ kiện với giả định:
 *   - `phan_khuc_khach_hang`: chép từ mục 2 master prompt TGTH Business Cowork (19/09/2026),
 *     danh sách "Khách hàng trọng tâm".
 *   - `nganh_nghe`: suy từ chính danh sách trên (nhà máy → sản xuất, trường học → giáo dục…).
 *   - `nguon_lead`: các kênh ở mục 26 master prompt, cộng "giới thiệu" và "khách cũ quay lại"
 *     ở vòng đời khách hàng mục 3.
 *   - `don_vi_tinh`, `ly_do_thua`: giá trị phổ thông của nghề bán thiết bị CNTT — GIẢ ĐỊNH,
 *     Giám đốc sửa trên màn hình Dữ liệu gốc.
 *   - `dieu_khoan_thanh_toan`, `dieu_khoan_giao_hang`, `doi_thu`: để TRỐNG có chủ đích.
 *     Đây là dữ liệu riêng của TGTH, không được đoán.
 *
 * Seed chỉ thêm giá trị còn thiếu, không bao giờ ghi đè tên đã sửa hay bật lại mục đã tắt.
 */

export interface LoaiDuLieuGoc {
  ma: string;
  ten: string;
  moTa: string;
  dungO: string;
  khoiTao: { ma: string; ten: string }[];
}

export const LOAI_DU_LIEU_GOC: LoaiDuLieuGoc[] = [
  {
    ma: "phan_khuc_khach_hang",
    ten: "Phân khúc khách hàng",
    moTa: "Nhóm khách hàng trọng tâm, dùng để lọc báo cáo và bảng điều hành.",
    dungO: "Khách hàng, Bảng điều hành",
    khoiTao: [
      { ma: "doanh-nghiep", ten: "Doanh nghiệp" },
      { ma: "nha-may", ten: "Nhà máy" },
      { ma: "nha-xuong", ten: "Nhà xưởng" },
      { ma: "truong-hoc", ten: "Trường học" },
      { ma: "chuoi-cua-hang", ten: "Chuỗi cửa hàng" },
      { ma: "van-phong", ten: "Văn phòng" },
      { ma: "smb-sme", ten: "Doanh nghiệp nhỏ và vừa (SMB/SME)" },
      { ma: "dai-ly", ten: "Đại lý" },
      { ma: "khach-du-an", ten: "Khách hàng dự án" },
    ],
  },
  {
    ma: "loai_khach_hang",
    ten: "Loại khách hàng",
    moTa: "Pháp nhân hay cá nhân, mua dùng hay mua bán lại.",
    dungO: "Khách hàng",
    khoiTao: [
      { ma: "doanh-nghiep", ten: "Doanh nghiệp / tổ chức" },
      { ma: "ca-nhan", ten: "Cá nhân" },
      { ma: "dai-ly", ten: "Đại lý (mua bán lại)" },
    ],
  },
  {
    ma: "nganh_nghe",
    ten: "Ngành nghề",
    moTa: "Ngành hoạt động của khách hàng.",
    dungO: "Khách hàng",
    khoiTao: [
      { ma: "san-xuat", ten: "Sản xuất" },
      { ma: "giao-duc", ten: "Giáo dục" },
      { ma: "ban-le", ten: "Bán lẻ" },
      { ma: "van-phong-dich-vu", ten: "Văn phòng – dịch vụ" },
    ],
  },
  {
    ma: "nguon_lead",
    ten: "Nguồn lead",
    moTa: "Khách đến từ đâu. Dùng để đo kênh nào mang lại doanh thu.",
    dungO: "Lead, Cơ hội",
    khoiTao: [
      { ma: "website", ten: "Website" },
      { ma: "zalo", ten: "Zalo" },
      { ma: "facebook", ten: "Facebook" },
      { ma: "email", ten: "Email" },
      { ma: "shopee", ten: "Shopee" },
      { ma: "tiktok-shop", ten: "TikTok Shop" },
      { ma: "hotline", ten: "Gọi điện đến" },
      { ma: "gioi-thieu", ten: "Được giới thiệu" },
      { ma: "khach-cu", ten: "Khách cũ quay lại" },
    ],
  },
  {
    ma: "ly_do_thua",
    ten: "Lý do thua cơ hội",
    moTa: "Bắt buộc chọn khi đóng cơ hội ở trạng thái LOST.",
    dungO: "Cơ hội",
    khoiTao: [
      { ma: "gia-cao", ten: "Giá cao hơn đối thủ" },
      { ma: "chon-doi-thu", ten: "Khách chọn đối thủ" },
      { ma: "khong-ngan-sach", ten: "Khách không còn ngân sách" },
      { ma: "hoan-du-an", ten: "Dự án bị hoãn hoặc hủy" },
      { ma: "khong-lien-lac-duoc", ten: "Không liên lạc được" },
      { ma: "khong-dap-ung", ten: "Không đáp ứng yêu cầu kỹ thuật" },
      { ma: "thoi-gian-giao", ten: "Thời gian giao hàng không đáp ứng" },
    ],
  },
  {
    ma: "don_vi_tinh",
    ten: "Đơn vị tính",
    moTa: "Đơn vị trên báo giá, đơn hàng, phiếu kho.",
    dungO: "Sản phẩm, Báo giá, Kho",
    khoiTao: [
      { ma: "cai", ten: "Cái" },
      { ma: "chiec", ten: "Chiếc" },
      { ma: "bo", ten: "Bộ" },
      { ma: "hop", ten: "Hộp" },
      { ma: "cuon", ten: "Cuộn" },
      { ma: "met", ten: "Mét" },
      { ma: "giay-phep", ten: "Giấy phép" },
      { ma: "goi", ten: "Gói" },
      { ma: "thang", ten: "Tháng" },
      { ma: "nam", ten: "Năm" },
      { ma: "lan", ten: "Lần" },
      { ma: "gio-cong", ten: "Giờ công" },
    ],
  },
  {
    ma: "dieu_khoan_thanh_toan",
    ten: "Điều khoản thanh toán",
    moTa: "Chọn nhanh trên báo giá. Nhập theo điều khoản TGTH đang dùng.",
    dungO: "Báo giá, Đơn hàng",
    khoiTao: [],
  },
  {
    ma: "dieu_khoan_giao_hang",
    ten: "Điều khoản giao hàng",
    moTa: "Chọn nhanh trên báo giá. Nhập theo điều khoản TGTH đang dùng.",
    dungO: "Báo giá, Đơn hàng",
    khoiTao: [],
  },
  {
    ma: "doi_thu",
    ten: "Đối thủ cạnh tranh",
    moTa: "Ghi nhận đối thủ trong từng cơ hội để phân tích thắng/thua.",
    dungO: "Cơ hội",
    khoiTao: [],
  },
];

export function timLoai(ma: string): LoaiDuLieuGoc | undefined {
  return LOAI_DU_LIEU_GOC.find((l) => l.ma === ma);
}
