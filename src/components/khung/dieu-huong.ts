/**
 * Thanh điều hướng bên trái — một nguồn duy nhất cho menu, tìm kiếm màn hình và breadcrumb.
 *
 * Chỉ liệt kê màn hình ĐÃ CHẠY THẬT. Phân hệ chưa xây (Sản phẩm, Báo giá, Kho…) chưa có
 * mặt ở đây — không để nút dẫn tới trang trống (mục 31 prompt 20/09: không dead button).
 * Mỗi phase thêm mục của mình vào đúng nhóm theo sidebar mục 23 prompt 20/09.
 */

export type BieuTuong =
  | "bang-dieu-khien"
  | "nguoi-dung"
  | "vai-tro"
  | "phong-ban"
  | "du-lieu-goc"
  | "cau-hinh"
  | "nhat-ky"
  | "khach-hang"
  | "lead"
  | "pipeline"
  | "co-hoi"
  | "cong-viec"
  | "san-pham"
  | "nhom"
  | "thuong-hieu"
  | "nha-cung-cap"
  | "nhap-csv"
  | "bao-gia"
  | "ho-so-cong-ty"
  | "don-hang"
  | "ton-kho"
  | "nhap-kho"
  | "the-kho"
  | "serial"
  | "du-an"
  | "bao-hanh"
  | "ho-tro"
  | "hoa-don"
  | "cong-no"
  | "phieu-thu"
  | "viec-hom-nay"
  | "tu-dong-hoa"
  | "bao-tri"
  | "gia-han"
  | "tro-ly"
  | "de-nghi-mua"
  | "don-mua"
  | "hoa-don-mua"
  | "cong-no-tra"
  | "phieu-chi"
  | "khach-tra"
  | "tra-ncc"
  | "chuyen-kho"
  | "hanh-trinh"
  | "nhom-khach"
  | "cham-diem"
  // 0.16.0 — Marketing
  | "chien-dich"
  | "nhan-lead"
  | "form-dang-ky"
  | "webhook"
  | "phan-khuc"
  | "landing"
  // 0.16.0 — Email marketing + xác thực 2 lớp
  | "email"
  | "mau-email"
  | "ket-noi-email"
  | "bao-mat"
  // 0.18.0
  | "so-dong-y";

export interface MucDieuHuong {
  nhan: string;
  href: string;
  /**
   * Quyền cần có để thấy mục này. `null` = ai đăng nhập cũng thấy.
   * Mảng = thấy nếu có **bất kỳ** quyền nào trong danh sách (ví dụ Lịch gia hạn:
   * người lo dịch vụ hoặc người bán đều cần nhìn).
   */
  quyen: string | string[] | null;
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
      {
        nhan: "Việc hôm nay",
        href: "/viec-hom-nay",
        quyen: null,
        bieuTuong: "viec-hom-nay",
        tuKhoa: "nhac viec today action can lam hom nay",
      },
    ],
  },
  {
    nhan: "CRM",
    muc: [
      { nhan: "Khách hàng", href: "/crm/khach-hang", quyen: "customer.view", bieuTuong: "khach-hang", tuKhoa: "customer 360 lien he contact ma so thue" },
      { nhan: "Lead", href: "/crm/lead", quyen: "crm.view", bieuTuong: "lead", tuKhoa: "khach tiem nang lead chuyen doi" },
      { nhan: "Hành trình khách hàng", href: "/crm/hanh-trinh", quyen: "customer.view", bieuTuong: "hanh-trinh", tuKhoa: "journey trang thai buoc pheu ty le chuyen doi funnel" },
      { nhan: "Nhóm khách hàng", href: "/crm/nhom-khach", quyen: "customer.view", bieuTuong: "nhom-khach", tuKhoa: "group nhom khach phan loai tag" },
      { nhan: "Chấm điểm khách", href: "/crm/cham-diem", quyen: "customer.view", bieuTuong: "cham-diem", tuKhoa: "lead scoring diem nong am lanh hot" },
    ],
  },
  {
    // 0.16.0 — chỉ những màn hình đã chạy thật (mục 6 ARCHITECTURE).
    nhan: "Marketing",
    muc: [
      { nhan: "Chiến dịch marketing", href: "/marketing/chien-dich", quyen: "marketing.view", bieuTuong: "chien-dich", tuKhoa: "campaign chien dich ngan sach chi phi cpl roas utm" },
      { nhan: "Nhận lead", href: "/marketing/nhan-lead", quyen: "marketing.view", bieuTuong: "nhan-lead", tuKhoa: "chia lead vong tron nhat ky nhan lead nhap tay" },
      { nhan: "Form đăng ký", href: "/marketing/form", quyen: "marketing.view", bieuTuong: "form-dang-ky", tuKhoa: "form dang ky cong khai nhung iframe website" },
      { nhan: "Webhook", href: "/marketing/webhook", quyen: "marketing.view", bieuTuong: "webhook", tuKhoa: "webhook facebook lead ads zalo zapier khoa bi mat" },
      { nhan: "Phân khúc", href: "/marketing/phan-khuc", quyen: "marketing.view", bieuTuong: "phan-khuc", tuKhoa: "segment phan khuc tep khach dong y nhan tin" },
      { nhan: "Landing page", href: "/marketing/landing", quyen: "marketing.view", bieuTuong: "landing", tuKhoa: "landing page trang dich ab test" },
      { nhan: "Đợt gửi email", href: "/marketing/email/chien-dich", quyen: "marketing.view", bieuTuong: "email", tuKhoa: "email marketing chien dich email dot gui thu newsletter" },
      { nhan: "Mẫu email", href: "/marketing/email/mau", quyen: "marketing.view", bieuTuong: "mau-email", tuKhoa: "mau thu email template noi dung" },
      { nhan: "Sổ đồng ý email", href: "/marketing/email/dong-y", quyen: "marketing.view", bieuTuong: "so-dong-y", tuKhoa: "dong y nhan thu quang cao consent rut tu choi nd 91 nhap csv" },
    ],
  },
  {
    nhan: "Bán hàng",
    muc: [
      { nhan: "Pipeline", href: "/ban-hang/pipeline", quyen: "sales.view", bieuTuong: "pipeline", tuKhoa: "kanban pipeline giai doan" },
      { nhan: "Cơ hội", href: "/ban-hang/co-hoi", quyen: "sales.view", bieuTuong: "co-hoi", tuKhoa: "opportunity co hoi ban hang" },
      { nhan: "Báo giá", href: "/ban-hang/bao-gia", quyen: "quotation.view", bieuTuong: "bao-gia", tuKhoa: "quotation bao gia phien ban duyet gui khach" },
      { nhan: "Đơn hàng", href: "/ban-hang/don-hang", quyen: "order.view", bieuTuong: "don-hang", tuKhoa: "sales order don hang xac nhan giao hang" },
    ],
  },
  {
    nhan: "Sản phẩm",
    muc: [
      { nhan: "Sản phẩm", href: "/san-pham", quyen: "product.view", bieuTuong: "san-pham", tuKhoa: "product sku bang gia hang hoa" },
      { nhan: "Nhóm sản phẩm", href: "/san-pham/nhom", quyen: "product.view", bieuTuong: "nhom", tuKhoa: "category nhom hang" },
      { nhan: "Thương hiệu", href: "/san-pham/thuong-hieu", quyen: "product.view", bieuTuong: "thuong-hieu", tuKhoa: "brand hang san xuat" },
      { nhan: "Nhà cung cấp", href: "/san-pham/nha-cung-cap", quyen: "supplier.view", bieuTuong: "nha-cung-cap", tuKhoa: "supplier nguon hang ncc" },
      { nhan: "Nhập CSV", href: "/san-pham/nhap-csv", quyen: "product.update", bieuTuong: "nhap-csv", tuKhoa: "import excel bang gia nhap lieu" },
    ],
  },
  {
    nhan: "Kho",
    muc: [
      { nhan: "Tồn kho", href: "/kho", quyen: "inventory.view", bieuTuong: "ton-kho", tuKhoa: "inventory ton kho con bao nhieu giu cho" },
      { nhan: "Nhập kho", href: "/kho/nhap", quyen: "inventory.create", bieuTuong: "nhap-kho", tuKhoa: "nhap hang vao kho receipt" },
      { nhan: "Thẻ kho", href: "/kho/the-kho", quyen: "inventory.view", bieuTuong: "the-kho", tuKhoa: "so cai kho lich su nhap xuat" },
      { nhan: "Số sê-ri", href: "/kho/serial", quyen: "inventory.view", bieuTuong: "serial", tuKhoa: "serial imei so may bao hanh" },
      { nhan: "Chuyển kho nội bộ", href: "/kho/chuyen-kho", quyen: "inventory.view", bieuTuong: "chuyen-kho", tuKhoa: "transfer chuyen kho noi bo dieu hang giua kho" },
      { nhan: "Danh sách kho", href: "/kho/danh-sach", quyen: "inventory.view", bieuTuong: "nha-cung-cap", tuKhoa: "warehouse kho chi nhanh" },
    ],
  },
  {
    nhan: "Mua hàng",
    muc: [
      { nhan: "Đề nghị mua", href: "/mua-hang/de-nghi", quyen: "purchasing.view", bieuTuong: "de-nghi-mua", tuKhoa: "purchase request de nghi mua duyet chi" },
      { nhan: "Đơn mua", href: "/mua-hang/don-mua", quyen: "purchasing.view", bieuTuong: "don-mua", tuKhoa: "purchase order don mua nhan hang nha cung cap" },
    ],
  },
  {
    nhan: "Trả hàng",
    muc: [
      { nhan: "Khách trả hàng", href: "/tra-hang/khach-tra", quyen: ["order.view", "service_desk.view", "finance.view"], bieuTuong: "khach-tra", tuKhoa: "return tra hang doi may khach hoan hang giam tru" },
      { nhan: "Trả nhà cung cấp", href: "/tra-hang/tra-ncc", quyen: ["purchasing.view", "finance.view"], bieuTuong: "tra-ncc", tuKhoa: "purchase return tra hang ncc giam tru cong no phai tra" },
    ],
  },
  {
    nhan: "Dịch vụ",
    muc: [
      { nhan: "Phiếu hỗ trợ", href: "/dich-vu/ho-tro", quyen: "service_desk.view", bieuTuong: "ho-tro", tuKhoa: "ticket ho tro su co bao tri sla" },
      { nhan: "Bảo hành", href: "/dich-vu/bao-hanh", quyen: "service_desk.view", bieuTuong: "bao-hanh", tuKhoa: "warranty bao hanh het han serial" },
      { nhan: "Hợp đồng bảo trì", href: "/dich-vu/bao-tri", quyen: "service_desk.view", bieuTuong: "bao-tri", tuKhoa: "maintenance bao tri dinh ky chu ky hop dong" },
      { nhan: "Lịch gia hạn", href: "/dich-vu/gia-han", quyen: ["service_desk.view", "sales.view"], bieuTuong: "gia-han", tuKhoa: "renewal gia han sap het han ban lai" },
    ],
  },
  {
    nhan: "Dự án",
    muc: [{ nhan: "Dự án triển khai", href: "/du-an", quyen: "project.view", bieuTuong: "du-an", tuKhoa: "project du an lap dat nghiem thu hang muc" }],
  },
  {
    nhan: "Tài chính",
    muc: [
      { nhan: "Hóa đơn", href: "/tai-chinh/hoa-don", quyen: "finance.view", bieuTuong: "hoa-don", tuKhoa: "invoice hoa don phat hanh vat" },
      { nhan: "Công nợ", href: "/tai-chinh/cong-no", quyen: "finance.view", bieuTuong: "cong-no", tuKhoa: "cong no phai thu tuoi no qua han receivable" },
      { nhan: "Phiếu thu", href: "/tai-chinh/phieu-thu", quyen: "finance.view", bieuTuong: "phieu-thu", tuKhoa: "payment thu tien chuyen khoan tien mat" },
      { nhan: "Hóa đơn nhà cung cấp", href: "/tai-chinh/hoa-don-mua", quyen: "finance.view", bieuTuong: "hoa-don-mua", tuKhoa: "supplier bill hoa don mua phai tra" },
      { nhan: "Công nợ phải trả", href: "/tai-chinh/cong-no-tra", quyen: "finance.view", bieuTuong: "cong-no-tra", tuKhoa: "payable cong no phai tra no nha cung cap" },
      { nhan: "Phiếu chi", href: "/tai-chinh/phieu-chi", quyen: "finance.view", bieuTuong: "phieu-chi", tuKhoa: "chi tien tra nha cung cap payment out" },
    ],
  },
  {
    nhan: "Công việc",
    muc: [{ nhan: "Công việc", href: "/cong-viec", quyen: "task.view", bieuTuong: "cong-viec", tuKhoa: "task viec can lam qua han activity" }],
  },
  {
    nhan: "Trợ lý",
    muc: [{ nhan: "Trợ lý ITA", href: "/tro-ly", quyen: "ai.view", bieuTuong: "tro-ly", tuKhoa: "ai chatbot tro ly hoi dap ita" }],
  },
  {
    nhan: "Quản trị",
    muc: [
      { nhan: "Người dùng", href: "/quan-tri/nguoi-dung", quyen: "user.view", bieuTuong: "nguoi-dung", tuKhoa: "nhan vien tai khoan users" },
      { nhan: "Vai trò & quyền", href: "/quan-tri/vai-tro", quyen: "role.view", bieuTuong: "vai-tro", tuKhoa: "phan quyen roles permissions" },
      { nhan: "Phòng ban", href: "/quan-tri/phong-ban", quyen: "department.view", bieuTuong: "phong-ban", tuKhoa: "departments to chuc" },
      { nhan: "Dữ liệu gốc", href: "/quan-tri/du-lieu-goc", quyen: "master_data.view", bieuTuong: "du-lieu-goc", tuKhoa: "master data danh muc nguon lead don vi tinh" },
      { nhan: "Cấu hình hệ thống", href: "/quan-tri/cau-hinh", quyen: "setting.view", bieuTuong: "cau-hinh", tuKhoa: "settings nguong bien loi nhuan" },
      { nhan: "Hồ sơ công ty", href: "/quan-tri/ho-so-cong-ty", quyen: "setting.view", bieuTuong: "ho-so-cong-ty", tuKhoa: "company profile dia chi ma so thue tai khoan nguoi ky ban in" },
      { nhan: "Kết nối email", href: "/quan-tri/ket-noi-email", quyen: "integration.view", bieuTuong: "ket-noi-email", tuKhoa: "smtp gmail microsoft 365 sendgrid hop thu gui email" },
      { nhan: "Xác thực 2 lớp", href: "/quan-tri/xac-thuc-2-lop", quyen: "user.view", bieuTuong: "bao-mat", tuKhoa: "2fa totp bao mat authenticator ma xac thuc" },
      { nhan: "Tự động hóa", href: "/quan-tri/tu-dong-hoa", quyen: "setting.view", bieuTuong: "tu-dong-hoa", tuKhoa: "automation quy tac nhac viec lich chay nen job" },
      { nhan: "Nhật ký kiểm toán", href: "/quan-tri/nhat-ky-kiem-toan", quyen: "audit_log.view", bieuTuong: "nhat-ky", tuKhoa: "audit log lich su" },
    ],
  },
];
