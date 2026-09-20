/**
 * Phần THUẦN của kho: chiều tác động của từng loại giao dịch lên số dư. Có kiểm thử đơn vị.
 *
 * Mọi thay đổi tồn kho đều đi qua `tacDong()`, nên không có chỗ nào trong hệ thống tự
 * cộng trừ tồn kho theo cách riêng.
 */

export const LOAI_GIAO_DICH = ["nhap", "xuat", "giu-cho", "nha-giu-cho", "dieu-chinh"] as const;
export type LoaiGiaoDich = (typeof LOAI_GIAO_DICH)[number];

export const NHAN_LOAI_GIAO_DICH: Record<string, string> = {
  nhap: "Nhập kho",
  xuat: "Xuất kho",
  "giu-cho": "Giữ chỗ",
  "nha-giu-cho": "Nhả giữ chỗ",
  "dieu-chinh": "Điều chỉnh",
};

export interface SoDu {
  onHand: number;
  reserved: number;
}

/** Hàng còn bán được = tồn kho − đang giữ chỗ cho đơn khác. */
export function conBanDuoc(sd: SoDu): number {
  return Math.max(0, sd.onHand - sd.reserved);
}

/**
 * Tác động của một giao dịch lên số dư.
 *
 * - `nhap`: tăng tồn.
 * - `xuat`: giảm tồn; nếu hàng đang được giữ chỗ cho chính đơn này thì nhả giữ chỗ tương ứng.
 * - `giu-cho` / `nha-giu-cho`: chỉ đổi phần giữ chỗ, tồn kho không đổi.
 * - `dieu-chinh`: chênh lệch kiểm kê, có thể âm hoặc dương (truyền `chieu`).
 */
export function tacDong(
  loai: LoaiGiaoDich,
  soLuong: number,
  tuyChon: { nhaGiuCho?: number; chieu?: 1 | -1 } = {},
): { onHandDelta: number; reservedDelta: number } {
  const sl = Math.abs(soLuong);
  switch (loai) {
    case "nhap":
      return { onHandDelta: sl, reservedDelta: 0 };
    case "xuat": {
      // Nhả đúng phần đang giữ chỗ cho chính chứng từ này, không nhiều hơn số xuất.
      const nha = Math.min(sl, Math.max(0, tuyChon.nhaGiuCho ?? 0));
      return { onHandDelta: -sl, reservedDelta: nha === 0 ? 0 : -nha };
    }
    case "giu-cho":
      return { onHandDelta: 0, reservedDelta: sl };
    case "nha-giu-cho":
      return { onHandDelta: 0, reservedDelta: -sl };
    case "dieu-chinh":
      return { onHandDelta: (tuyChon.chieu ?? 1) * sl, reservedDelta: 0 };
  }
}

/** Số dư sau khi áp một tác động. Trả cả cờ hợp lệ để service chặn trước khi ghi. */
export function soDuSau(truoc: SoDu, tacDongVao: { onHandDelta: number; reservedDelta: number }): { sau: SoDu; hopLe: boolean; lyDo: string | null } {
  const sau = {
    onHand: Math.round((truoc.onHand + tacDongVao.onHandDelta) * 1000) / 1000,
    reserved: Math.round((truoc.reserved + tacDongVao.reservedDelta) * 1000) / 1000,
  };
  if (sau.onHand < 0) return { sau, hopLe: false, lyDo: "Tồn kho không đủ." };
  if (sau.reserved < 0) return { sau, hopLe: false, lyDo: "Số giữ chỗ không đủ để nhả." };
  if (sau.reserved > sau.onHand) return { sau, hopLe: false, lyDo: "Không giữ chỗ nhiều hơn hàng đang có trong kho." };
  return { sau, hopLe: true, lyDo: null };
}

/** Mức cảnh báo tồn: hết hàng, sắp hết (dưới mức tối thiểu), đủ. */
export function mucTon(conBan: number, toiThieu: number | null): "het" | "sap-het" | "du" {
  if (conBan <= 0) return "het";
  if (toiThieu !== null && toiThieu > 0 && conBan < toiThieu) return "sap-het";
  return "du";
}
