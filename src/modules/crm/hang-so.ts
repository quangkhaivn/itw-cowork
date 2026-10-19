/**
 * Hằng số CRM dùng chung cho máy chủ và trình duyệt: giai đoạn, nhãn, luật chuyển giai đoạn.
 * Tệp thuần — không import gì từ cơ sở dữ liệu, để component phía trình duyệt dùng được.
 */

// ---------------------------------------------------------------------------
// Pipeline 8 cột theo mục 7 prompt: 3 giai đoạn lead + 5 giai đoạn cơ hội
// ---------------------------------------------------------------------------

export const GIAI_DOAN_LEAD = ["NEW_LEAD", "CONTACTED", "QUALIFIED", "DISQUALIFIED", "CONVERTED"] as const;
export type GiaiDoanLead = (typeof GIAI_DOAN_LEAD)[number];
/** Lead còn trên pipeline (chưa loại, chưa chuyển đổi). */
export const LEAD_DANG_MO: GiaiDoanLead[] = ["NEW_LEAD", "CONTACTED", "QUALIFIED"];

export const GIAI_DOAN_CO_HOI = ["OPPORTUNITY", "QUOTATION", "NEGOTIATION", "WON", "LOST"] as const;
export type GiaiDoanCoHoi = (typeof GIAI_DOAN_CO_HOI)[number];
export const CO_HOI_DANG_MO: GiaiDoanCoHoi[] = ["OPPORTUNITY", "QUOTATION", "NEGOTIATION"];
export const CO_HOI_DA_DONG: GiaiDoanCoHoi[] = ["WON", "LOST"];

export const NHAN_GIAI_DOAN: Record<string, string> = {
  NEW_LEAD: "Lead mới",
  CONTACTED: "Đã liên hệ",
  QUALIFIED: "Đủ điều kiện",
  DISQUALIFIED: "Đã loại",
  CONVERTED: "Đã chuyển đổi",
  OPPORTUNITY: "Cơ hội",
  QUOTATION: "Báo giá",
  NEGOTIATION: "Thương lượng",
  WON: "Thắng",
  LOST: "Thua",
};

/** Lớp huy hiệu cho từng giai đoạn — chỉ dùng màu trạng thái cho trạng thái. */
export const LOP_GIAI_DOAN: Record<string, string> = {
  NEW_LEAD: "chinh",
  CONTACTED: "chinh",
  QUALIFIED: "chinh",
  DISQUALIFIED: "",
  CONVERTED: "tot",
  OPPORTUNITY: "chinh",
  QUOTATION: "chinh",
  NEGOTIATION: "canh-bao",
  WON: "tot",
  LOST: "loi",
};

/** Xác suất gợi ý khi chuyển giai đoạn — người dùng sửa được; WON/LOST là cố định (CH-05). */
export const XAC_SUAT_GOI_Y: Record<GiaiDoanCoHoi, number> = {
  OPPORTUNITY: 20,
  QUOTATION: 40,
  NEGOTIATION: 60,
  WON: 100,
  LOST: 0,
};

export function laCoHoiDangMo(stage: string): boolean {
  return (CO_HOI_DANG_MO as string[]).includes(stage);
}

// ---------------------------------------------------------------------------
// Khách hàng
// ---------------------------------------------------------------------------

export const TRANG_THAI_KHACH = ["tiem-nang", "dang-giao-dich", "ngung-giao-dich"] as const;
export type TrangThaiKhach = (typeof TRANG_THAI_KHACH)[number];
export const NHAN_TRANG_THAI_KHACH: Record<string, string> = {
  "tiem-nang": "Tiềm năng",
  "dang-giao-dich": "Đang giao dịch",
  "ngung-giao-dich": "Ngừng giao dịch",
};

// ---------------------------------------------------------------------------
// Tương tác
// ---------------------------------------------------------------------------

export const LOAI_TUONG_TAC = ["call", "email", "zalo", "meeting", "visit", "note"] as const;
export type LoaiTuongTac = (typeof LOAI_TUONG_TAC)[number];
export const NHAN_TUONG_TAC: Record<string, string> = {
  call: "Cuộc gọi",
  email: "Email",
  zalo: "Zalo",
  meeting: "Cuộc họp",
  visit: "Gặp tại chỗ",
  note: "Ghi chú",
};

// ---------------------------------------------------------------------------
// Công việc
// ---------------------------------------------------------------------------

export const TRANG_THAI_VIEC = ["mo", "dang-lam", "xong", "huy"] as const;
export type TrangThaiViec = (typeof TRANG_THAI_VIEC)[number];
export const NHAN_TRANG_THAI_VIEC: Record<string, string> = {
  mo: "Chưa làm",
  "dang-lam": "Đang làm",
  xong: "Xong",
  huy: "Đã hủy",
};
/** 0.17.0 — đánh giá kết quả công việc (CV-04). */
export const DANH_GIA_KET_QUA = ["dat", "mot-phan", "khong-dat", "can-theo-doi"] as const;
export type DanhGiaKetQua = (typeof DANH_GIA_KET_QUA)[number];
export const NHAN_DANH_GIA_KET_QUA: Record<string, string> = {
  dat: "Đạt",
  "mot-phan": "Đạt một phần",
  "khong-dat": "Không đạt",
  "can-theo-doi": "Cần làm tiếp",
};
export const UU_TIEN = ["thap", "trung-binh", "cao", "khan"] as const;
export type UuTien = (typeof UU_TIEN)[number];
export const NHAN_UU_TIEN: Record<string, string> = {
  thap: "Thấp",
  "trung-binh": "Trung bình",
  cao: "Cao",
  khan: "Khẩn",
};

// ---------------------------------------------------------------------------
// Tính toán thuần
// ---------------------------------------------------------------------------

/**
 * Giá trị pipeline và pipeline có trọng số (CH-09) của các cơ hội ĐANG MỞ.
 * Nhận giá trị dạng chuỗi/Decimal để không mất độ chính xác qua số thực.
 * Tính trên đơn vị đồng, làm tròn đến đồng — đủ cho hiển thị quản trị.
 */
export function tinhPipeline(ds: { stage: string; estimatedValue: { toString(): string } | number | string; probability: number }[]) {
  let tong = 0;
  let coTrongSo = 0;
  let soLuong = 0;
  for (const c of ds) {
    if (!laCoHoiDangMo(c.stage)) continue;
    const gt = Number(c.estimatedValue.toString());
    if (!Number.isFinite(gt)) continue;
    soLuong++;
    tong += gt;
    coTrongSo += (gt * Math.min(100, Math.max(0, c.probability))) / 100;
  }
  return { soLuong, tong: Math.round(tong), coTrongSo: Math.round(coTrongSo) };
}

/** Tỷ lệ thắng = thắng / (thắng + thua), %. Chưa có cơ hội đóng nào → null (không phải 0%). */
export function tyLeThang(soThang: number, soThua: number): number | null {
  const tong = soThang + soThua;
  return tong === 0 ? null : Math.round((soThang / tong) * 1000) / 10;
}
