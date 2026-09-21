/**
 * Phần THUẦN của trả hàng và đổi máy: vòng đời chứng từ, số lượng trả tối đa,
 * và phần giảm trừ còn lại. Không chạm cơ sở dữ liệu, có kiểm thử đơn vị.
 *
 * Tiền của phiếu trả hàng tính bằng **đúng** `tinhDonMua()` của mua hàng — không có
 * công thức tiền thứ hai trong hệ thống (QĐ-39).
 */

/** Hai chiều trả hàng dùng chung một vòng đời, nên chỉ có một bộ trạng thái. */
export const TRANG_THAI_TRA_HANG = ["DRAFT", "CONFIRMED", "SETTLED", "CANCELLED"] as const;
export type TrangThaiTraHang = (typeof TRANG_THAI_TRA_HANG)[number];

export const NHAN_TRANG_THAI_TRA_BAN: Record<string, string> = {
  DRAFT: "Nháp",
  CONFIRMED: "Đã nhận lại hàng",
  SETTLED: "Đã chốt tiền",
  CANCELLED: "Đã hủy",
};

export const NHAN_TRANG_THAI_TRA_MUA: Record<string, string> = {
  DRAFT: "Nháp",
  CONFIRMED: "Đã trả hàng đi",
  SETTLED: "Đã chốt tiền",
  CANCELLED: "Đã hủy",
};

export const LOP_TRANG_THAI_TRA_HANG: Record<string, string> = {
  DRAFT: "",
  CONFIRMED: "canh-bao",
  SETTLED: "tot",
  CANCELLED: "loi",
};

export const LOAI_TRA_HANG = ["tra-hang", "doi-may"] as const;
export type LoaiTraHang = (typeof LOAI_TRA_HANG)[number];

export const NHAN_LOAI_TRA_HANG: Record<string, string> = {
  "tra-hang": "Khách trả hàng",
  "doi-may": "Đổi máy",
};

export const TINH_TRANG_HANG = ["con-tot", "loi"] as const;
export type TinhTrangHang = (typeof TINH_TRANG_HANG)[number];

export const NHAN_TINH_TRANG_HANG: Record<string, { nhan: string; lop: string }> = {
  "con-tot": { nhan: "Còn tốt", lop: "tot" },
  loi: { nhan: "Hàng lỗi", lop: "loi" },
};

/** Phiếu còn sửa được không. Xác nhận rồi là hàng đã đi qua kho, khóa lại (TH-04). */
export function traHangSuaDuoc(trangThai: string): boolean {
  return trangThai === "DRAFT";
}

/** Chỉ xác nhận được phiếu còn nháp. */
export function xacNhanDuoc(trangThai: string): boolean {
  return trangThai === "DRAFT";
}

/**
 * Chỉ chốt tiền khi hàng đã đi qua kho và phiếu có giá trị.
 * Phiếu đổi máy có giá trị 0 nên không đi qua bước này (TH-08).
 */
export function chotTienDuoc(trangThai: string, tong: number): boolean {
  return trangThai === "CONFIRMED" && tong > 0;
}

/** Chỉ hủy được phiếu còn nháp; hàng đã đi qua kho thì phải xử bằng chứng từ ngược (TH-09). */
export function huyDuoc(trangThai: string): boolean {
  return trangThai === "DRAFT";
}

/** Phiếu đã đóng — không thao tác gì thêm. */
export function traHangDaDong(trangThai: string): boolean {
  return trangThai === "SETTLED" || trangThai === "CANCELLED";
}

function so(x: string | number | null | undefined): number {
  if (x === null || x === undefined) return 0;
  const n = typeof x === "number" ? x : Number(String(x));
  return Number.isFinite(n) ? n : 0;
}

/** Làm tròn tới đồng; `-0` trả về `0`. */
function dong(x: number): number {
  const n = Math.round(x);
  return n === 0 ? 0 : n;
}

/**
 * Trả tối đa bao nhiêu: không quá phần đã thật sự giao (hoặc đã thật sự nhận về, ở
 * chiều mua), trừ đi phần đã trả bằng các phiếu trước (TH-03).
 */
export function soLuongTraToiDa(daGiao: string | number, daTra: string | number): number {
  const con = so(daGiao) - so(daTra);
  return con > 0 ? Math.round(con * 1000) / 1000 : 0;
}

/** Phần giá trị của phiếu chưa được giảm trừ vào hóa đơn nào. */
export function conGiamTruDuoc(tong: string | number, daPhanBo: string | number): number {
  const con = dong(so(tong)) - dong(so(daPhanBo));
  return con > 0 ? con : 0;
}

export interface KiemPhanBo {
  hopLe: boolean;
  lyDo: string | null;
  tongPhanBo: number;
}

/**
 * Kiểm phân bổ giảm trừ: tổng không vượt giá trị phiếu, và từng hóa đơn không nhận
 * quá phần còn nợ của nó (TH-07). Cùng khuôn với phiếu thu và phiếu chi.
 */
export function kiemPhanBoGiamTru(
  tongPhieu: string | number,
  daPhanBoTruoc: string | number,
  phanBo: { soTien: string | number; conNo: number }[],
): KiemPhanBo {
  const tongPhanBo = phanBo.reduce((s, p) => s + dong(so(p.soTien)), 0);
  if (tongPhanBo <= 0) return { hopLe: false, lyDo: "Số tiền giảm trừ phải lớn hơn 0.", tongPhanBo };

  const con = conGiamTruDuoc(tongPhieu, daPhanBoTruoc);
  if (tongPhanBo > con) {
    return {
      hopLe: false,
      lyDo: `Giảm trừ ${tongPhanBo.toLocaleString("vi-VN")} ₫ vượt phần còn lại của phiếu (${con.toLocaleString("vi-VN")} ₫).`,
      tongPhanBo,
    };
  }

  for (const p of phanBo) {
    const tien = dong(so(p.soTien));
    if (tien <= 0) return { hopLe: false, lyDo: "Mỗi dòng giảm trừ phải lớn hơn 0.", tongPhanBo };
    if (tien > p.conNo) {
      return {
        hopLe: false,
        lyDo: `Một hóa đơn chỉ còn nợ ${p.conNo.toLocaleString("vi-VN")} ₫, không giảm trừ được ${tien.toLocaleString("vi-VN")} ₫.`,
        tongPhanBo,
      };
    }
  }

  return { hopLe: true, lyDo: null, tongPhanBo };
}
