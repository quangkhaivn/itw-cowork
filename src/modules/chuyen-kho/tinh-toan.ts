/**
 * Phần THUẦN của chuyển kho nội bộ: vòng đời phiếu và chênh lệch nhận.
 * Không chạm cơ sở dữ liệu, có kiểm thử đơn vị.
 */

export const TRANG_THAI_CHUYEN_KHO = ["DRAFT", "IN_TRANSIT", "RECEIVED", "CANCELLED"] as const;
export type TrangThaiChuyenKho = (typeof TRANG_THAI_CHUYEN_KHO)[number];

export const NHAN_TRANG_THAI_CHUYEN_KHO: Record<string, string> = {
  DRAFT: "Nháp",
  IN_TRANSIT: "Đang trên đường",
  RECEIVED: "Đã nhận",
  CANCELLED: "Đã hủy",
};

export const LOP_TRANG_THAI_CHUYEN_KHO: Record<string, string> = {
  DRAFT: "",
  IN_TRANSIT: "canh-bao",
  RECEIVED: "tot",
  CANCELLED: "loi",
};

/** Phiếu còn sửa được không. Xuất kho rồi là hàng đã đi, khóa lại (CK-03). */
export function chuyenKhoSuaDuoc(trangThai: string): boolean {
  return trangThai === "DRAFT";
}

/** Chỉ xuất được phiếu còn nháp. */
export function xuatDuoc(trangThai: string): boolean {
  return trangThai === "DRAFT";
}

/** Chỉ nhận được hàng đang trên đường. */
export function nhanDuoc(trangThai: string): boolean {
  return trangThai === "IN_TRANSIT";
}

/** Chỉ hủy được phiếu còn nháp; hàng đã rời kho thì phải chuyển ngược lại (CK-06). */
export function huyDuoc(trangThai: string): boolean {
  return trangThai === "DRAFT";
}

export function chuyenKhoDaDong(trangThai: string): boolean {
  return trangThai === "RECEIVED" || trangThai === "CANCELLED";
}

function so(x: string | number | null | undefined): number {
  if (x === null || x === undefined) return 0;
  const n = typeof x === "number" ? x : Number(String(x));
  return Number.isFinite(n) ? n : 0;
}

function lam(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export interface DongChuyenKho {
  soLuong: string | number;
  daNhan: string | number;
}

/**
 * Tổng kết một phiếu: xuất bao nhiêu, nhận bao nhiêu, **thiếu bao nhiêu**.
 *
 * Phần thiếu là hàng đã rời kho nguồn mà không tới kho đích — mất, vỡ, hay giao
 * nhầm. Nó không tự biến mất khỏi sổ: sổ kho đã ghi một bút toán xuất và một bút
 * toán nhập nhỏ hơn, nên số dư vẫn khớp sổ cái. Cái cần đòi là **lý do** (CK-04).
 */
export function tongKetChuyen(dsDong: DongChuyenKho[]): {
  tongXuat: number;
  tongNhan: number;
  thieu: number;
  coThieu: boolean;
  phanTram: number;
} {
  const tongXuat = lam(dsDong.reduce((s, d) => s + so(d.soLuong), 0));
  const tongNhan = lam(dsDong.reduce((s, d) => s + Math.min(so(d.daNhan), so(d.soLuong)), 0));
  const thieu = lam(Math.max(0, tongXuat - tongNhan));
  return {
    tongXuat,
    tongNhan,
    thieu,
    coThieu: thieu > 0,
    phanTram: tongXuat > 0 ? Math.round((tongNhan / tongXuat) * 10000) / 100 : 0,
  };
}

/** Số nhận tối đa của một dòng — không bao giờ quá số đã xuất. */
export function soNhanToiDa(soLuongXuat: string | number): number {
  const n = so(soLuongXuat);
  return n > 0 ? lam(n) : 0;
}

export interface KiemDongNhan {
  hopLe: boolean;
  lyDo: string | null;
}

/**
 * Kiểm một dòng nhận: không quá số đã xuất, và **thiếu thì phải có lý do**.
 * Nhận đúng 0 cũng phải có lý do — không ai chuyển kho để rồi nhận về con số không.
 */
export function kiemDongNhan(
  soLuongXuat: string | number,
  soLuongNhan: string | number,
  ghiChu: string | null | undefined,
): KiemDongNhan {
  const xuat = so(soLuongXuat);
  const nhan = so(soLuongNhan);
  if (nhan < 0) return { hopLe: false, lyDo: "Số nhận không được âm." };
  if (nhan > xuat + 0.0005) {
    return { hopLe: false, lyDo: `Chỉ xuất đi ${xuat}, không nhận được ${nhan}.` };
  }
  if (nhan < xuat - 0.0005 && (ghiChu ?? "").trim().length < 2) {
    return {
      hopLe: false,
      lyDo: `Nhận ${nhan} trong khi xuất ${xuat} — thiếu ${lam(xuat - nhan)}. Ghi rõ vì sao thiếu.`,
    };
  }
  return { hopLe: true, lyDo: null };
}
