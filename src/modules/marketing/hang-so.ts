/**
 * Hằng số Marketing dùng chung cho máy chủ và trình duyệt: trạng thái, kênh, danh mục
 * trường form, khóa UTM. Tệp thuần — không import gì từ cơ sở dữ liệu (QĐ-23).
 * Luật: BUSINESS_RULES.md mục 22 (MK).
 */

// ---------------------------------------------------------------------------
// Chiến dịch
// ---------------------------------------------------------------------------

export const TRANG_THAI_CHIEN_DICH = ["ke-hoach", "cho-duyet", "dang-chay", "tam-dung", "ket-thuc", "huy"] as const;
export type TrangThaiChienDich = (typeof TRANG_THAI_CHIEN_DICH)[number];
export const NHAN_TRANG_THAI_CHIEN_DICH: Record<string, string> = {
  "ke-hoach": "Lên kế hoạch",
  "cho-duyet": "Chờ duyệt ngân sách",
  "dang-chay": "Đang chạy",
  "tam-dung": "Tạm dừng",
  "ket-thuc": "Đã kết thúc",
  huy: "Đã hủy",
};
export const LOP_TRANG_THAI_CHIEN_DICH: Record<string, string> = {
  "ke-hoach": "",
  "cho-duyet": "canh-bao",
  "dang-chay": "tot",
  "tam-dung": "canh-bao",
  "ket-thuc": "chinh",
  huy: "loi",
};

/** Trạng thái được coi là "đã được phép tiêu tiền" — CSDL chặn nếu ngân sách chưa duyệt (MK-03). */
export const TRANG_THAI_DA_CHAY: TrangThaiChienDich[] = ["dang-chay", "tam-dung", "ket-thuc"];

export const KENH_MARKETING = ["facebook", "google", "zalo", "tiktok", "website", "email", "su-kien", "offline", "khac"] as const;
export type KenhMarketing = (typeof KENH_MARKETING)[number];
export const NHAN_KENH: Record<string, string> = {
  facebook: "Facebook",
  google: "Google",
  zalo: "Zalo",
  tiktok: "TikTok",
  website: "Website / SEO",
  email: "Email",
  "su-kien": "Sự kiện / hội thảo",
  offline: "Ấn phẩm / ngoại tuyến",
  khac: "Khác",
};

export const LOAI_CHI_PHI = ["quang-cao", "noi-dung", "in-an", "su-kien", "qua-tang", "khac"] as const;
export const NHAN_LOAI_CHI_PHI: Record<string, string> = {
  "quang-cao": "Quảng cáo",
  "noi-dung": "Sản xuất nội dung",
  "in-an": "In ấn",
  "su-kien": "Sự kiện",
  "qua-tang": "Quà tặng",
  khac: "Khác",
};

// ---------------------------------------------------------------------------
// Nhận lead
// ---------------------------------------------------------------------------

export const KENH_NHAN = ["form", "landing", "webhook", "nhap-tay"] as const;
export type KenhNhan = (typeof KENH_NHAN)[number];
export const NHAN_KENH_NHAN: Record<string, string> = {
  form: "Form đăng ký",
  landing: "Landing page",
  webhook: "Webhook",
  "nhap-tay": "Nhập tay",
};
export const NHAN_KET_QUA_NHAN: Record<string, string> = {
  "tao-moi": "Tạo lead mới",
  "ghi-them": "Ghi thêm vào lead cũ",
  "tu-choi": "Từ chối",
  spam: "Bẫy chống spam",
};

export const KHOA_UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type KhoaUtm = (typeof KHOA_UTM)[number];

/**
 * Danh mục trường được phép trên form công khai (MK-11). Form ngoài KHÔNG ghi được
 * người phụ trách, giai đoạn, giá trị… — chỉ những thông tin người đăng ký tự khai.
 * `toiDa` là trần độ dài kỹ thuật để chống nhồi dữ liệu, không phải ngưỡng nghiệp vụ.
 */
export const TRUONG_FORM = {
  hoTen: { nhan: "Họ tên", kieu: "text", toiDa: 255 },
  dienThoai: { nhan: "Số điện thoại", kieu: "tel", toiDa: 30 },
  email: { nhan: "Email", kieu: "email", toiDa: 255 },
  congTy: { nhan: "Công ty", kieu: "text", toiDa: 255 },
  chucDanh: { nhan: "Chức danh", kieu: "text", toiDa: 255 },
  maSoThue: { nhan: "Mã số thuế", kieu: "text", toiDa: 30 },
  nhuCau: { nhan: "Nhu cầu", kieu: "textarea", toiDa: 3000 },
  ghiChu: { nhan: "Ghi chú", kieu: "textarea", toiDa: 3000 },
} as const;
export type KhoaTruongForm = keyof typeof TRUONG_FORM;
export const DS_KHOA_TRUONG_FORM = Object.keys(TRUONG_FORM) as KhoaTruongForm[];

/** Ô bẫy chống bot: ẩn với người thật; có giá trị = bot điền (MK-11). */
export const TEN_O_BAY = "website_url";

// ---------------------------------------------------------------------------
// Phân khúc
// ---------------------------------------------------------------------------

export const DOI_TUONG_PHAN_KHUC = ["lead", "lien-he"] as const;
export type DoiTuongPhanKhuc = (typeof DOI_TUONG_PHAN_KHUC)[number];
export const NHAN_DOI_TUONG_PHAN_KHUC: Record<string, string> = {
  lead: "Lead",
  "lien-he": "Liên hệ của khách hàng",
};

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

export const TRANG_THAI_LANDING = ["nhap", "xuat-ban", "an"] as const;
export const NHAN_TRANG_THAI_LANDING: Record<string, string> = { nhap: "Nháp", "xuat-ban": "Đang xuất bản", an: "Đã ẩn" };
export const LOP_TRANG_THAI_LANDING: Record<string, string> = { nhap: "", "xuat-ban": "tot", an: "canh-bao" };
