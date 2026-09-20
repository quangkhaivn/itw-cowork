/**
 * Phần THUẦN của tài chính: trạng thái hóa đơn, công nợ còn lại, tuổi nợ. Có kiểm thử đơn vị.
 *
 * Nguyên tắc: **công nợ không lưu thành cột**. Còn nợ = tổng hóa đơn − tổng đã thu, tính
 * ngay lúc đọc. Không có hai nơi giữ cùng một con số thì không bao giờ lệch nhau.
 */

export const TRANG_THAI_HOA_DON = ["DRAFT", "ISSUED", "CANCELLED"] as const;
export type TrangThaiHoaDon = (typeof TRANG_THAI_HOA_DON)[number];

export const NHAN_TRANG_THAI_HOA_DON: Record<string, string> = {
  DRAFT: "Nháp",
  ISSUED: "Đã phát hành",
  CANCELLED: "Đã hủy",
};

export const PHUONG_THUC_THU = ["tien-mat", "chuyen-khoan", "the", "bu-tru"] as const;
export const NHAN_PHUONG_THUC_THU: Record<string, string> = {
  "tien-mat": "Tiền mặt",
  "chuyen-khoan": "Chuyển khoản",
  the: "Quẹt thẻ",
  "bu-tru": "Bù trừ công nợ",
};

/** Tình trạng thu tiền của một hóa đơn — TÍNH từ số đã thu, người dùng không chọn. */
export type TinhTrangThu = "chua-thu" | "thu-mot-phan" | "da-thu-du" | "khong-tinh";

export const NHAN_TINH_TRANG_THU: Record<TinhTrangThu, { nhan: string; lop: string }> = {
  "chua-thu": { nhan: "Chưa thu", lop: "canh-bao" },
  "thu-mot-phan": { nhan: "Thu một phần", lop: "chinh" },
  "da-thu-du": { nhan: "Đã thu đủ", lop: "tot" },
  "khong-tinh": { nhan: "Không tính công nợ", lop: "" },
};

function so(x: number | string | null | undefined): number {
  if (x === null || x === undefined || x === "") return 0;
  const n = typeof x === "number" ? x : Number(String(x));
  return Number.isFinite(n) ? n : 0;
}

/** Làm tròn về đồng để so sánh tiền — tránh sai số 0,0001 làm hóa đơn không bao giờ "đủ". */
export function dong(x: number | string | null | undefined): number {
  return Math.round(so(x));
}

export interface CongNoHoaDon {
  tong: number;
  daThu: number;
  conNo: number;
  tinhTrang: TinhTrangThu;
}

/** Công nợ của một hóa đơn. Hóa đơn nháp hoặc đã hủy thì không tính vào công nợ. */
export function congNo(trangThai: string, tong: number | string, daThu: number | string): CongNoHoaDon {
  const t = dong(tong);
  const thu = dong(daThu);
  if (trangThai !== "ISSUED") return { tong: t, daThu: thu, conNo: 0, tinhTrang: "khong-tinh" };
  const con = Math.max(0, t - thu);
  return {
    tong: t,
    daThu: thu,
    conNo: con,
    tinhTrang: con === 0 ? "da-thu-du" : thu > 0 ? "thu-mot-phan" : "chua-thu",
  };
}

/** Số ngày quá hạn (âm = chưa tới hạn). Không có hạn thì trả 0. */
export function soNgayQuaHan(hanThanhToan: string | null, homNay: string): number {
  if (!hanThanhToan) return 0;
  const a = Date.parse(`${homNay}T00:00:00Z`);
  const b = Date.parse(`${hanThanhToan}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / 86_400_000);
}

export type NhomTuoiNo = "trong-han" | "1-30" | "31-60" | "61-90" | "tren-90";

export const NHAN_NHOM_TUOI_NO: Record<NhomTuoiNo, { nhan: string; lop: string }> = {
  "trong-han": { nhan: "Trong hạn", lop: "tot" },
  "1-30": { nhan: "Quá hạn 1–30 ngày", lop: "canh-bao" },
  "31-60": { nhan: "Quá hạn 31–60 ngày", lop: "canh-bao" },
  "61-90": { nhan: "Quá hạn 61–90 ngày", lop: "loi" },
  "tren-90": { nhan: "Quá hạn trên 90 ngày", lop: "loi" },
};

/** Tuổi nợ theo cách kế toán hay dùng: trong hạn, 1–30, 31–60, 61–90, trên 90 ngày. */
export function nhomTuoiNo(soNgay: number): NhomTuoiNo {
  if (soNgay <= 0) return "trong-han";
  if (soNgay <= 30) return "1-30";
  if (soNgay <= 60) return "31-60";
  if (soNgay <= 90) return "61-90";
  return "tren-90";
}

/** Cộng công nợ theo nhóm tuổi nợ cho bảng công nợ và Bảng điều hành. */
export function tongHopTuoiNo(
  dsHoaDon: { conNo: number; soNgayQuaHan: number }[],
): { theoNhom: Record<NhomTuoiNo, number>; tongConNo: number; tongQuaHan: number; soHoaDonQuaHan: number } {
  const theoNhom: Record<NhomTuoiNo, number> = { "trong-han": 0, "1-30": 0, "31-60": 0, "61-90": 0, "tren-90": 0 };
  let tongConNo = 0;
  let tongQuaHan = 0;
  let soHoaDonQuaHan = 0;
  for (const h of dsHoaDon) {
    if (h.conNo <= 0) continue;
    const nhom = nhomTuoiNo(h.soNgayQuaHan);
    theoNhom[nhom] += h.conNo;
    tongConNo += h.conNo;
    if (nhom !== "trong-han") {
      tongQuaHan += h.conNo;
      soHoaDonQuaHan += 1;
    }
  }
  return { theoNhom, tongConNo, tongQuaHan, soHoaDonQuaHan };
}

/** Hạn thanh toán gợi ý = ngày phát hành + số ngày công nợ. Chưa đặt ngưỡng thì trả null. */
export function hanThanhToanGoiY(ngayPhatHanh: string, soNgayCongNo: number | null): string | null {
  if (soNgayCongNo === null || soNgayCongNo < 0) return null;
  const d = new Date(`${ngayPhatHanh}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + soNgayCongNo);
  return d.toISOString().slice(0, 10);
}

/** Biên lợi nhuận gộp của một kỳ: (doanh thu − giá vốn) / doanh thu. Doanh thu 0 → null. */
export function bienLoiNhuanKy(doanhThu: number, giaVon: number): number | null {
  if (doanhThu <= 0) return null;
  return Math.round(((doanhThu - giaVon) / doanhThu) * 10000) / 100;
}
