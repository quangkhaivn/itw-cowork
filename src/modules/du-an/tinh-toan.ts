/**
 * Phần THUẦN của dự án triển khai: trạng thái, tiến độ theo hạng mục. Có kiểm thử đơn vị.
 */

export const TRANG_THAI_DU_AN = ["PLANNING", "IN_PROGRESS", "ON_HOLD", "ACCEPTED", "CANCELLED"] as const;
export type TrangThaiDuAn = (typeof TRANG_THAI_DU_AN)[number];

export const NHAN_TRANG_THAI_DU_AN: Record<string, string> = {
  PLANNING: "Đang chuẩn bị",
  IN_PROGRESS: "Đang triển khai",
  ON_HOLD: "Tạm dừng",
  ACCEPTED: "Đã nghiệm thu",
  CANCELLED: "Đã hủy",
};

export const LOP_TRANG_THAI_DU_AN: Record<string, string> = {
  PLANNING: "",
  IN_PROGRESS: "chinh",
  ON_HOLD: "canh-bao",
  ACCEPTED: "tot",
  CANCELLED: "loi",
};

export const TRANG_THAI_HANG_MUC = ["chua-lam", "dang-lam", "xong"] as const;
export const NHAN_TRANG_THAI_HANG_MUC: Record<string, string> = {
  "chua-lam": "Chưa làm",
  "dang-lam": "Đang làm",
  xong: "Xong",
};

export function dangChayDuAn(trangThai: string): boolean {
  return ["PLANNING", "IN_PROGRESS", "ON_HOLD"].includes(trangThai);
}

export function daDongDuAn(trangThai: string): boolean {
  return ["ACCEPTED", "CANCELLED"].includes(trangThai);
}

/** Trạng thái kế tiếp hợp lệ của dự án. Nghiệm thu và hủy là điểm dừng. */
export function chuyenDuocDuAn(tu: string, den: string): boolean {
  const cho: Record<string, string[]> = {
    PLANNING: ["IN_PROGRESS", "ON_HOLD", "CANCELLED"],
    IN_PROGRESS: ["ON_HOLD", "ACCEPTED", "CANCELLED"],
    ON_HOLD: ["IN_PROGRESS", "CANCELLED"],
    ACCEPTED: [],
    CANCELLED: [],
  };
  return (cho[tu] ?? []).includes(den);
}

/** Tiến độ theo hạng mục: xong bao nhiêu trên tổng, có còn hạng mục dở không. */
export function tienDoDuAn(hangMuc: { trangThai: string }[]): {
  tong: number;
  xong: number;
  phanTram: number;
  conDangDo: boolean;
} {
  const tong = hangMuc.length;
  const xong = hangMuc.filter((h) => h.trangThai === "xong").length;
  return {
    tong,
    xong,
    phanTram: tong > 0 ? Math.round((xong / tong) * 10000) / 100 : 0,
    conDangDo: tong > 0 && xong < tong,
  };
}

/** Dự án quá hạn dự kiến mà chưa nghiệm thu. */
export function quaHanDuAn(hanDuKien: string | null, trangThai: string, homNay: string): boolean {
  if (!hanDuKien || !dangChayDuAn(trangThai)) return false;
  return hanDuKien < homNay;
}
