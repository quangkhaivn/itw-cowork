/**
 * Phần THUẦN của mua hàng: vòng đời chứng từ, tiến độ nhận hàng, tính tiền đơn mua.
 * Không chạm cơ sở dữ liệu, có kiểm thử đơn vị.
 */

export const TRANG_THAI_DE_NGHI = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "ORDERED",
  "REJECTED",
  "CANCELLED",
] as const;
export type TrangThaiDeNghi = (typeof TRANG_THAI_DE_NGHI)[number];

export const NHAN_TRANG_THAI_DE_NGHI: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING_APPROVAL: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  ORDERED: "Đã đặt hàng",
  REJECTED: "Bị từ chối",
  CANCELLED: "Đã hủy",
};

export const LOP_TRANG_THAI_DE_NGHI: Record<string, string> = {
  DRAFT: "",
  PENDING_APPROVAL: "canh-bao",
  APPROVED: "tot",
  ORDERED: "tot",
  REJECTED: "loi",
  CANCELLED: "loi",
};

export const TRANG_THAI_DON_MUA = [
  "DRAFT",
  "SENT",
  "CONFIRMED",
  "PARTIALLY_RECEIVED",
  "RECEIVED",
  "CANCELLED",
] as const;
export type TrangThaiDonMua = (typeof TRANG_THAI_DON_MUA)[number];

export const NHAN_TRANG_THAI_DON_MUA: Record<string, string> = {
  DRAFT: "Nháp",
  SENT: "Đã gửi nhà cung cấp",
  CONFIRMED: "Nhà cung cấp đã nhận",
  PARTIALLY_RECEIVED: "Nhận một phần",
  RECEIVED: "Đã nhận đủ",
  CANCELLED: "Đã hủy",
};

export const LOP_TRANG_THAI_DON_MUA: Record<string, string> = {
  DRAFT: "",
  SENT: "canh-bao",
  CONFIRMED: "canh-bao",
  PARTIALLY_RECEIVED: "canh-bao",
  RECEIVED: "tot",
  CANCELLED: "loi",
};

/** Đề nghị còn sửa được không. Duyệt rồi thì khóa — nội dung đã duyệt không đổi lén. */
export function deNghiSuaDuoc(trangThai: string): boolean {
  return trangThai === "DRAFT";
}

/** Đơn mua còn sửa dòng hàng được không. Gửi nhà cung cấp rồi thì khóa (MH-04). */
export function donMuaSuaDuoc(trangThai: string): boolean {
  return trangThai === "DRAFT";
}

/** Đơn mua đang ở trạng thái nhận được hàng. */
export function nhanDuocHang(trangThai: string): boolean {
  return ["SENT", "CONFIRMED", "PARTIALLY_RECEIVED"].includes(trangThai);
}

/** Đơn mua đã đóng — không thao tác gì thêm. */
export function donMuaDaDong(trangThai: string): boolean {
  return trangThai === "RECEIVED" || trangThai === "CANCELLED";
}

function so(x: string | number | { toString(): string }): number {
  const n = typeof x === "number" ? x : Number(x.toString());
  return Number.isFinite(n) ? n : 0;
}

export interface DongTienDoNhan {
  soLuong: string | number;
  daNhan: string | number;
}

/**
 * Tiến độ nhận hàng của một đơn mua. Trạng thái mới tính từ **dữ liệu thật của các
 * dòng**, không tin cờ trạng thái đang lưu — cùng cách Phase 5 làm với phiếu xuất.
 */
export function tienDoNhan(dsDong: DongTienDoNhan[]): {
  tongDat: number;
  tongDaNhan: number;
  conLai: number;
  phanTram: number;
  xongHet: boolean;
  chuaNhanGi: boolean;
  trangThaiMoi: "CONFIRMED" | "PARTIALLY_RECEIVED" | "RECEIVED";
} {
  const tongDat = dsDong.reduce((s, d) => s + so(d.soLuong), 0);
  const tongDaNhan = dsDong.reduce((s, d) => s + Math.min(so(d.daNhan), so(d.soLuong)), 0);
  const conLai = Math.max(0, tongDat - tongDaNhan);
  const xongHet = tongDat > 0 && conLai === 0;
  const chuaNhanGi = tongDaNhan === 0;
  return {
    tongDat,
    tongDaNhan,
    conLai,
    phanTram: tongDat > 0 ? Math.round((tongDaNhan / tongDat) * 10000) / 100 : 0,
    xongHet,
    chuaNhanGi,
    trangThaiMoi: xongHet ? "RECEIVED" : chuaNhanGi ? "CONFIRMED" : "PARTIALLY_RECEIVED",
  };
}

export interface DongDonMua {
  soLuong: string | number;
  donGia: string | number;
  chietKhau?: string | number;
  vat?: string | number;
}

/**
 * Tính tiền đơn mua. Cùng công thức với `tinhBaoGia()` của bán hàng, nhưng **không có
 * giá vốn** — với đơn mua thì đơn giá chính là giá vốn, nên không có biên lợi nhuận.
 */
export function tinhDonMua(dong: DongDonMua[]): {
  dong: { thanhTien: number; tienChietKhau: number; tienVat: number }[];
  tamTinh: number;
  tongChietKhau: number;
  tongVat: number;
  tongCong: number;
} {
  const ra = dong.map((d) => {
    const sl = so(d.soLuong);
    const gia = so(d.donGia);
    const ck = Math.min(Math.max(so(d.chietKhau ?? 0), 0), 100);
    const vat = Math.min(Math.max(so(d.vat ?? 0), 0), 100);
    const goc = sl * gia;
    const tienChietKhau = lam(goc * (ck / 100));
    const truocVat = lam(goc - tienChietKhau);
    const tienVat = lam(truocVat * (vat / 100));
    return { thanhTien: lam(truocVat + tienVat), tienChietKhau, tienVat, truocVat };
  });
  const tamTinh = lam(dong.reduce((s, d) => s + so(d.soLuong) * so(d.donGia), 0));
  const tongChietKhau = lam(ra.reduce((s, d) => s + d.tienChietKhau, 0));
  const tongVat = lam(ra.reduce((s, d) => s + d.tienVat, 0));
  return {
    dong: ra.map(({ thanhTien, tienChietKhau, tienVat }) => ({ thanhTien, tienChietKhau, tienVat })),
    tamTinh,
    tongChietKhau,
    tongVat,
    tongCong: lam(tamTinh - tongChietKhau + tongVat),
  };
}

/** Tiền làm tròn tới đồng; `-0` trả về `0`. */
function lam(x: number): number {
  const n = Math.round(x);
  return n === 0 ? 0 : n;
}

/**
 * Số lượng thiếu của một đơn bán: cần mua bao nhiêu để giao đủ.
 * `conBanDuoc` âm hoặc thiếu thì coi như không có hàng.
 */
export function soLuongCanMua(canGiao: number, conBanDuoc: number): number {
  const thieu = canGiao - Math.max(0, conBanDuoc);
  return thieu > 0 ? thieu : 0;
}
