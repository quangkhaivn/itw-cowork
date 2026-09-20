/**
 * Phần THUẦN của bảo hành: tính ngày hết hạn và tình trạng còn hạn. Có kiểm thử đơn vị.
 *
 * Quy ước ngày: mọi phép tính làm trên chuỗi "yyyy-mm-dd" theo giờ Việt Nam, không dùng
 * giờ máy chủ — bảo hành tính theo NGÀY, không theo giờ.
 */

export const TRANG_THAI_BAO_HANH = ["hieu-luc", "het-han", "huy"] as const;
export type TrangThaiBaoHanh = (typeof TRANG_THAI_BAO_HANH)[number];

export const NHAN_TRANG_THAI_BAO_HANH: Record<string, string> = {
  "hieu-luc": "Còn bảo hành",
  "het-han": "Hết bảo hành",
  huy: "Đã hủy",
};

/**
 * Ngày hết hạn = ngày bắt đầu + số tháng, **lùi một ngày** (bảo hành 12 tháng từ 20/09/2026
 * hết vào 19/09/2027). Ngày 31 cộng sang tháng chỉ có 30 ngày thì lấy ngày cuối tháng đó.
 * 0 tháng = không có bảo hành: hết hạn ngay ngày giao.
 */
export function ngayHetHan(batDau: string, soThang: number): string {
  const [nam, thang, ngay] = batDau.split("-").map(Number);
  if (!nam || !thang || !ngay) return batDau;
  if (soThang <= 0) return batDau;

  const tongThang = thang - 1 + soThang;
  const namMoi = nam + Math.floor(tongThang / 12);
  const thangMoi = (tongThang % 12) + 1;
  const ngayCuoiThang = new Date(Date.UTC(namMoi, thangMoi, 0)).getUTCDate();
  const d = new Date(Date.UTC(namMoi, thangMoi - 1, Math.min(ngay, ngayCuoiThang)));
  // Lùi một ngày: hết hạn là ngày cuối cùng còn được bảo hành.
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Số ngày còn lại tới khi hết bảo hành (âm = đã hết từ bấy nhiêu ngày trước). */
export function soNgayConLai(hetHan: string, homNay: string): number {
  const a = Date.parse(`${hetHan}T00:00:00Z`);
  const b = Date.parse(`${homNay}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((a - b) / 86_400_000);
}

export type MucBaoHanh = "con-han" | "sap-het" | "het-han" | "huy";

/**
 * Tình trạng bảo hành để hiển thị và lọc.
 * `nguongSapHetNgay` chưa đặt (null) thì không có mức "sắp hết" — không tự chọn con số.
 */
export function mucBaoHanh(
  trangThai: string,
  hetHan: string,
  homNay: string,
  nguongSapHetNgay: number | null,
): MucBaoHanh {
  if (trangThai === "huy") return "huy";
  const con = soNgayConLai(hetHan, homNay);
  if (con < 0) return "het-han";
  if (nguongSapHetNgay !== null && nguongSapHetNgay > 0 && con <= nguongSapHetNgay) return "sap-het";
  return "con-han";
}

export const NHAN_MUC_BAO_HANH: Record<MucBaoHanh, { nhan: string; lop: string }> = {
  "con-han": { nhan: "Còn bảo hành", lop: "tot" },
  "sap-het": { nhan: "Sắp hết bảo hành", lop: "canh-bao" },
  "het-han": { nhan: "Hết bảo hành", lop: "loi" },
  huy: { nhan: "Đã hủy", lop: "" },
};
