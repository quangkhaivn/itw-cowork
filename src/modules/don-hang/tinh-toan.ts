/**
 * Phần THUẦN của đơn hàng: trạng thái, chuyển trạng thái, tiến độ giao. Có kiểm thử đơn vị.
 *
 * Tiền của đơn dùng lại đúng hàm `tinhBaoGia()` của Phase 4 — một cách tính duy nhất cho
 * báo giá và đơn hàng, nên số tiền chuyển từ báo giá sang đơn không bao giờ lệch.
 */

export const TRANG_THAI_DON = ["DRAFT", "CONFIRMED", "PARTIALLY_DELIVERED", "DELIVERED", "CANCELLED"] as const;
export type TrangThaiDon = (typeof TRANG_THAI_DON)[number];

export const NHAN_TRANG_THAI_DON: Record<string, string> = {
  DRAFT: "Nháp",
  CONFIRMED: "Đã xác nhận",
  PARTIALLY_DELIVERED: "Giao một phần",
  DELIVERED: "Đã giao đủ",
  CANCELLED: "Đã hủy",
};

export const LOP_TRANG_THAI_DON: Record<string, string> = {
  DRAFT: "",
  CONFIRMED: "chinh",
  PARTIALLY_DELIVERED: "canh-bao",
  DELIVERED: "tot",
  CANCELLED: "loi",
};

/** Đơn còn sửa được dòng hàng (chỉ khi chưa xác nhận). */
export function duocSuaDong(trangThai: string): boolean {
  return trangThai === "DRAFT";
}

/** Đơn đang chạy: đã xác nhận nhưng chưa giao xong và chưa hủy. */
export function dangChay(trangThai: string): boolean {
  return trangThai === "CONFIRMED" || trangThai === "PARTIALLY_DELIVERED";
}

export function daDong(trangThai: string): boolean {
  return trangThai === "DELIVERED" || trangThai === "CANCELLED";
}

/** Giữ chỗ kho khi xác nhận, nhả khi hủy — chỉ hai trạng thái này chạm tồn kho giữ chỗ. */
export function giuChoKho(trangThai: string): boolean {
  return dangChay(trangThai);
}

function so(x: number | string | null | undefined): number {
  if (x === null || x === undefined || x === "") return 0;
  const n = typeof x === "number" ? x : Number(String(x));
  return Number.isFinite(n) ? n : 0;
}

export interface DongTienDo {
  soLuong: number | string;
  daGiao: number | string;
}

/**
 * Tiến độ giao của cả đơn.
 *
 * `trangThaiMoi` là trạng thái đơn PHẢI có sau khi giao — tính từ dữ liệu, không do
 * người dùng chọn, nên không bao giờ có đơn "đã giao đủ" mà còn hàng chưa xuất.
 */
export function tienDoGiao(dsDong: DongTienDo[]): {
  tongDat: number;
  tongDaGiao: number;
  conLai: number;
  phanTram: number;
  xongHet: boolean;
  chuaGiaoGi: boolean;
  trangThaiMoi: "CONFIRMED" | "PARTIALLY_DELIVERED" | "DELIVERED";
} {
  const tongDat = dsDong.reduce((s, d) => s + so(d.soLuong), 0);
  const tongDaGiao = dsDong.reduce((s, d) => s + Math.min(so(d.daGiao), so(d.soLuong)), 0);
  const conLai = Math.max(0, tongDat - tongDaGiao);
  const xongHet = tongDat > 0 && conLai === 0;
  const chuaGiaoGi = tongDaGiao === 0;
  return {
    tongDat,
    tongDaGiao,
    conLai,
    phanTram: tongDat > 0 ? Math.round((tongDaGiao / tongDat) * 10000) / 100 : 0,
    xongHet,
    chuaGiaoGi,
    trangThaiMoi: xongHet ? "DELIVERED" : chuaGiaoGi ? "CONFIRMED" : "PARTIALLY_DELIVERED",
  };
}

/** Số còn phải giao của một dòng. Không bao giờ âm. */
export function conPhaiGiao(soLuong: number | string, daGiao: number | string): number {
  return Math.max(0, so(soLuong) - so(daGiao));
}
