import { z } from "zod";

/**
 * Danh mục cấu hình hệ thống — mọi ngưỡng nghiệp vụ nằm ở đây, KHÔNG hard-code
 * trong mã (mục 12 master prompt: "Threshold phải configurable trong Settings").
 *
 * Giá trị lưu ở bảng `tenant_settings` (khóa–giá trị JSON, theo tenant).
 * Chưa ai đặt thì dùng `macDinh`.
 *
 * `macDinh: null` nghĩa là CHƯA CẤU HÌNH, và phân hệ dùng nó phải xử lý an toàn:
 * ví dụ ngưỡng biên lợi nhuận chưa đặt → mọi báo giá đều phải qua duyệt. Không tự
 * chọn một con số "nghe hợp lý" thay Giám đốc.
 */

export interface MucCauHinh {
  khoa: string;
  nhom: string;
  nhan: string;
  moTa: string;
  donVi: string;
  toiThieu: number;
  toiDa: number;
  soNguyen: boolean;
  /** null = chưa cấu hình, xem ghi chú đầu tệp. */
  macDinh: number | null;
  /** Phase bắt đầu đọc giá trị này — để giao diện nói thật là đang dùng hay chưa. */
  dungTuPhase: number;
}

export const PHASE_HIEN_TAI = 8;

export const DANH_MUC_CAU_HINH: MucCauHinh[] = [
  {
    khoa: "bao_mat.so_lan_sai_toi_da",
    nhom: "Bảo mật đăng nhập",
    nhan: "Số lần sai mật khẩu trước khi khóa tạm",
    moTa: "Sai liên tiếp quá số lần này thì tài khoản bị khóa tạm.",
    donVi: "lần",
    toiThieu: 3,
    toiDa: 20,
    soNguyen: true,
    macDinh: 5,
    dungTuPhase: 1,
  },
  {
    khoa: "bao_mat.so_phut_khoa",
    nhom: "Bảo mật đăng nhập",
    nhan: "Thời gian khóa tạm",
    moTa: "Hết thời gian này tài khoản tự mở, hoặc quản trị viên mở tay ở màn hình Người dùng.",
    donVi: "phút",
    toiThieu: 1,
    toiDa: 1440,
    soNguyen: true,
    macDinh: 15,
    dungTuPhase: 1,
  },
  {
    khoa: "bao_gia.nguong_bien_loi_nhuan",
    nhom: "Báo giá",
    nhan: "Ngưỡng biên lợi nhuận gộp tối thiểu",
    moTa:
      "Báo giá có biên lợi nhuận gộp dưới ngưỡng này phải được Trưởng phòng Kinh doanh hoặc Giám đốc duyệt trước khi gửi. Để trống = mọi báo giá đều phải duyệt.",
    donVi: "%",
    toiThieu: 0,
    toiDa: 100,
    soNguyen: false,
    macDinh: null,
    dungTuPhase: 4,
  },
  {
    khoa: "bao_gia.so_ngay_hieu_luc",
    nhom: "Báo giá",
    nhan: "Số ngày hiệu lực mặc định",
    moTa: "Điền sẵn vào báo giá mới. Để trống = người lập tự nhập mỗi lần.",
    donVi: "ngày",
    toiThieu: 1,
    toiDa: 365,
    soNguyen: true,
    macDinh: null,
    dungTuPhase: 4,
  },
  {
    khoa: "theo_doi.bao_gia_khong_phan_hoi_ngay",
    nhom: "Nhắc việc tự động",
    nhan: "Báo giá đã gửi mà chưa phản hồi sau",
    moTa: "Quá số ngày này, trợ lý nhắc việc đưa báo giá vào danh sách cần theo dõi của người phụ trách.",
    donVi: "ngày",
    toiThieu: 1,
    toiDa: 90,
    soNguyen: true,
    macDinh: null,
    dungTuPhase: 8,
  },
  {
    khoa: "theo_doi.co_hoi_khong_hoat_dong_ngay",
    nhom: "Nhắc việc tự động",
    nhan: "Cơ hội không có hoạt động sau",
    moTa: "Cơ hội đang mở mà không có cuộc gọi, cuộc gặp, ghi chú nào trong số ngày này thì bị cảnh báo.",
    donVi: "ngày",
    toiThieu: 1,
    toiDa: 90,
    soNguyen: true,
    macDinh: null,
    dungTuPhase: 8,
  },
  {
    khoa: "theo_doi.khach_chua_mua_lai_thang",
    nhom: "Nhắc việc tự động",
    nhan: "Khách hàng chưa mua lại sau",
    moTa: "Khách đã từng mua mà quá số tháng này chưa mua lại thì vào danh sách chăm sóc.",
    donVi: "tháng",
    toiThieu: 1,
    toiDa: 36,
    soNguyen: true,
    macDinh: null,
    dungTuPhase: 8,
  },
  {
    khoa: "dich_vu.gio_phan_hoi_khan",
    nhom: "Bàn dịch vụ (SLA)",
    nhan: "Giờ phải phản hồi — phiếu Khẩn",
    moTa: "Kể từ lúc mở phiếu, trong bao nhiêu giờ phải có người phản hồi khách. Chưa đặt thì hệ thống không đặt hạn.",
    donVi: "giờ",
    toiThieu: 1,
    toiDa: 168,
    soNguyen: true,
    macDinh: null,
    dungTuPhase: 6,
  },
  {
    khoa: "dich_vu.gio_phan_hoi_thuong",
    nhom: "Bàn dịch vụ (SLA)",
    nhan: "Giờ phải phản hồi — phiếu thường",
    moTa: "Áp cho phiếu Cao, Trung bình, Thấp. Chưa đặt thì hệ thống không đặt hạn.",
    donVi: "giờ",
    toiThieu: 1,
    toiDa: 336,
    soNguyen: true,
    macDinh: null,
    dungTuPhase: 6,
  },
  {
    khoa: "dich_vu.gio_xu_ly_khan",
    nhom: "Bàn dịch vụ (SLA)",
    nhan: "Giờ phải xử lý xong — phiếu Khẩn",
    moTa: "Kể từ lúc mở phiếu, trong bao nhiêu giờ phải xử lý xong cho khách.",
    donVi: "giờ",
    toiThieu: 1,
    toiDa: 336,
    soNguyen: true,
    macDinh: null,
    dungTuPhase: 6,
  },
  {
    khoa: "dich_vu.gio_xu_ly_thuong",
    nhom: "Bàn dịch vụ (SLA)",
    nhan: "Giờ phải xử lý xong — phiếu thường",
    moTa: "Áp cho phiếu Cao, Trung bình, Thấp.",
    donVi: "giờ",
    toiThieu: 1,
    toiDa: 720,
    soNguyen: true,
    macDinh: null,
    dungTuPhase: 6,
  },
  {
    khoa: "tai_chinh.so_ngay_cong_no_mac_dinh",
    nhom: "Tài chính",
    nhan: "Số ngày công nợ mặc định khi phát hành hóa đơn",
    moTa: "Hạn thanh toán gợi ý = ngày phát hành + số ngày này. Chưa đặt thì người phát hành tự chọn hạn.",
    donVi: "ngày",
    toiThieu: 0,
    toiDa: 180,
    soNguyen: true,
    macDinh: null,
    dungTuPhase: 7,
  },
  {
    khoa: "tai_chinh.canh_bao_qua_han_ngay",
    nhom: "Tài chính",
    nhan: "Cảnh báo công nợ quá hạn sau",
    moTa: "Hóa đơn quá hạn quá số ngày này thì vào nhóm cần đòi gấp trên Bảng điều hành.",
    donVi: "ngày",
    toiThieu: 1,
    toiDa: 180,
    soNguyen: true,
    macDinh: null,
    dungTuPhase: 7,
  },
  {
    khoa: "tu_dong.gio_quet_hang_ngay",
    nhom: "Nhắc việc tự động",
    nhan: "Giờ chạy bản quét nhắc việc mỗi ngày",
    moTa: "Giờ (0–23, giờ Việt Nam) mà máy quét toàn bộ quy tắc và lập danh sách Việc hôm nay. CHƯA ĐẶT thì máy không tự quét — vẫn bấm Chạy quét ngay được ở màn hình Tự động hóa.",
    donVi: "giờ",
    toiThieu: 0,
    toiDa: 23,
    soNguyen: true,
    macDinh: null,
    dungTuPhase: 8,
  },
  {
    khoa: "theo_doi.bao_hanh_sap_het_ngay",
    nhom: "Nhắc việc tự động",
    nhan: "Cảnh báo bảo hành / bản quyền sắp hết trước",
    moTa: "Bảo hành, bản quyền Microsoft, hợp đồng bảo trì sắp hết hạn trong số ngày này thì hiện ở danh sách Bảo hành (Phase 6) và tạo cơ hội gia hạn (Phase 8).",
    donVi: "ngày",
    toiThieu: 1,
    toiDa: 365,
    soNguyen: true,
    macDinh: null,
    dungTuPhase: 6,
  },
  // 0.16.0 — Email marketing. Tốc độ gửi là chuyện an toàn của hộp thư gửi (nhà cung cấp
  // khóa tài khoản gửi quá nhanh), nên chưa đặt thì dùng một mức **chậm** ghi rõ là mặc định.
  {
    khoa: "email.so_thu_moi_phut",
    nhom: "Email marketing",
    nhan: "Tốc độ gửi chiến dịch email",
    moTa:
      "Số thư tối đa máy gửi đi mỗi phút cho một doanh nghiệp. Mặc định 10 thư/phút (600 thư/giờ) — mức chậm, an toàn với Gmail/Microsoft 365. Dịch vụ gửi chuyên dụng (SendGrid, Mailgun, Amazon SES) cho phép cao hơn; đặt theo hạn mức trong hợp đồng của nhà cung cấp.",
    donVi: "thư/phút",
    toiThieu: 1,
    toiDa: 600,
    soNguyen: true,
    macDinh: 10,
    dungTuPhase: 8,
  },
  {
    khoa: "email.so_thu_toi_da_moi_ngay",
    nhom: "Email marketing",
    nhan: "Số thư chiến dịch tối đa mỗi ngày",
    moTa:
      "Đủ số này trong ngày (giờ Việt Nam) thì máy ngừng gửi, hôm sau gửi tiếp. Để trống = không chặn theo ngày. Gmail thường giới hạn khoảng 500 thư/ngày, Google Workspace khoảng 2.000 — kiểm hạn mức thật của tài khoản trước khi đặt.",
    donVi: "thư/ngày",
    toiThieu: 1,
    toiDa: 1_000_000,
    soNguyen: true,
    macDinh: null,
    dungTuPhase: 8,
  },
];

export function timMuc(khoa: string): MucCauHinh | undefined {
  return DANH_MUC_CAU_HINH.find((m) => m.khoa === khoa);
}

/** Lược đồ kiểm giá trị của một mục. `null` luôn hợp lệ = xóa về chưa cấu hình / mặc định. */
export function luocDoGiaTri(muc: MucCauHinh) {
  let so = z.number().min(muc.toiThieu, `Tối thiểu ${muc.toiThieu}`).max(muc.toiDa, `Tối đa ${muc.toiDa}`);
  if (muc.soNguyen) so = so.int("Phải là số nguyên");
  return so.nullable();
}
