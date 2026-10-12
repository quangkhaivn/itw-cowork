/**
 * Danh mục quy tắc nhắc việc — mục 21–22 prompt 20/09.
 *
 * Quy tắc là **mã, không phải dữ liệu**: mỗi quy tắc biết mình quét gì và cần ngưỡng
 * nào. Bảng `automation_rules` chỉ giữ công tắc bật/tắt theo doanh nghiệp, nên không
 * phải dựng một ngôn ngữ cấu hình rồi tự viết trình thông dịch cho nó.
 *
 * Nguyên tắc xuyên suốt (giống mục 5 và mục 12 master prompt): **chưa đặt ngưỡng thì
 * không quét**. Quy tắc bị bỏ qua được ghi rõ lý do trong lần chạy, không tự chọn một
 * con số "nghe hợp lý" thay Giám đốc.
 */

export const MUC_DO = ["thong-tin", "canh-bao", "khan"] as const;
export type MucDo = (typeof MUC_DO)[number];

export const NHAN_MUC_DO: Record<string, { nhan: string; lop: string }> = {
  khan: { nhan: "Gấp", lop: "loi" },
  "canh-bao": { nhan: "Cần để ý", lop: "canh-bao" },
  "thong-tin": { nhan: "Chăm sóc", lop: "" },
};

/** Thứ tự hiển thị: việc gấp lên trước. */
export const THU_TU_MUC_DO: Record<string, number> = { khan: 0, "canh-bao": 1, "thong-tin": 2 };

export interface DinhNghiaQuyTac {
  ma: string;
  nhan: string;
  /** Giải thích cho Giám đốc, viết bằng lời người dùng hiểu. */
  moTa: string;
  /** Phân hệ để nhóm trên màn hình cấu hình. */
  nhom: string;
  mucDo: MucDo;
  /** Khóa cấu hình bắt buộc. Chưa đặt → quy tắc không chạy. `null` = không cần ngưỡng. */
  khoaNguong: string | null;
  /** Câu giải thích khi quy tắc bị bỏ qua vì thiếu ngưỡng. */
  thieuNguong: string;
}

export const QUY_TAC: DinhNghiaQuyTac[] = [
  {
    ma: "bao-gia-cho-phan-hoi",
    nhan: "Báo giá đã gửi chưa thấy phản hồi",
    moTa: "Báo giá đang chờ khách mà quá số ngày đã đặt thì nhắc người phụ trách gọi lại.",
    nhom: "Bán hàng",
    mucDo: "canh-bao",
    khoaNguong: "theo_doi.bao_gia_khong_phan_hoi_ngay",
    thieuNguong: "Chưa đặt số ngày chờ phản hồi ở Quản trị → Cấu hình.",
  },
  {
    ma: "co-hoi-khong-hoat-dong",
    nhan: "Cơ hội lâu không có hoạt động",
    moTa: "Cơ hội đang mở mà không có cuộc gọi, cuộc gặp hay ghi chú nào trong số ngày đã đặt.",
    nhom: "Bán hàng",
    mucDo: "canh-bao",
    khoaNguong: "theo_doi.co_hoi_khong_hoat_dong_ngay",
    thieuNguong: "Chưa đặt số ngày im lặng ở Quản trị → Cấu hình.",
  },
  {
    ma: "viec-qua-han",
    nhan: "Việc đã quá hạn",
    moTa: "Việc trong danh sách Công việc còn mở mà đã qua hạn.",
    nhom: "Công việc",
    mucDo: "khan",
    khoaNguong: null,
    thieuNguong: "",
  },
  {
    ma: "cong-no-qua-han",
    nhan: "Hóa đơn quá hạn cần đòi",
    moTa: "Hóa đơn đã phát hành, còn nợ, và quá hạn thanh toán quá số ngày cảnh báo.",
    nhom: "Tài chính",
    mucDo: "khan",
    khoaNguong: "tai_chinh.canh_bao_qua_han_ngay",
    thieuNguong: "Chưa đặt ngưỡng cảnh báo công nợ quá hạn ở Quản trị → Cấu hình.",
  },
  {
    ma: "phieu-ho-tro-tre-han",
    nhan: "Phiếu hỗ trợ trễ cam kết",
    moTa: "Phiếu còn mở mà đã quá hạn phản hồi hoặc hạn xử lý đã hứa với khách.",
    nhom: "Dịch vụ",
    mucDo: "khan",
    khoaNguong: null,
    thieuNguong: "",
  },
  {
    ma: "bao-hanh-sap-het",
    nhan: "Bảo hành sắp hết — mời gia hạn",
    moTa: "Máy sắp hết bảo hành trong số ngày đã đặt. Quy tắc này cũng lập sẵn một dòng gia hạn để người bán chốt.",
    nhom: "Dịch vụ",
    mucDo: "thong-tin",
    khoaNguong: "theo_doi.bao_hanh_sap_het_ngay",
    thieuNguong: "Chưa đặt số ngày cảnh báo bảo hành sắp hết ở Quản trị → Cấu hình.",
  },
  {
    ma: "bao-tri-den-ky",
    nhan: "Hợp đồng bảo trì tới kỳ",
    moTa: "Hợp đồng bảo trì định kỳ đã tới hoặc quá ngày bảo trì kỳ kế tiếp.",
    nhom: "Dịch vụ",
    mucDo: "canh-bao",
    khoaNguong: null,
    thieuNguong: "",
  },
  {
    ma: "khach-lau-chua-mua-lai",
    nhan: "Khách lâu chưa mua lại",
    moTa: "Khách đã từng mua mà quá số tháng đã đặt chưa có đơn mới.",
    nhom: "Chăm sóc khách hàng",
    mucDo: "thong-tin",
    khoaNguong: "theo_doi.khach_chua_mua_lai_thang",
    thieuNguong: "Chưa đặt số tháng chưa mua lại ở Quản trị → Cấu hình.",
  },
  // --- 0.16.0: Khách hàng nâng cao (BUSINESS_RULES.md mục 21) ---
  {
    ma: "khach-dung-lau",
    nhan: "Khách đứng lâu một trạng thái hành trình",
    moTa:
      "Khách đứng ở một trạng thái hành trình quá số ngày đặt riêng cho trạng thái đó (trang Hành trình khách hàng). Mỗi lần khách vào một trạng thái chỉ nhắc một lần. Trạng thái chưa đặt số ngày thì không nhắc.",
    nhom: "Chăm sóc khách hàng",
    mucDo: "canh-bao",
    khoaNguong: null,
    thieuNguong: "",
  },
  {
    ma: "sinh-nhat-lien-he",
    nhan: "Sinh nhật người liên hệ",
    moTa:
      "Người liên hệ đang hoạt động của khách có sinh nhật hôm nay — hoặc sắp tới, nếu đã đặt số ngày nhắc trước ở Quản trị → Cấu hình. Nhắc người phụ trách khách.",
    nhom: "Chăm sóc khách hàng",
    mucDo: "thong-tin",
    khoaNguong: null,
    thieuNguong: "",
  },
];

export function timQuyTac(ma: string): DinhNghiaQuyTac | undefined {
  return QUY_TAC.find((q) => q.ma === ma);
}

export const NHAN_QUY_TAC: Record<string, string> = Object.fromEntries(QUY_TAC.map((q) => [q.ma, q.nhan]));

export const MA_TAC_VU_QUET = "quet-nhac-viec";
