/**
 * Phần THUẦN của bàn dịch vụ: trạng thái phiếu, hạn cam kết (SLA), đánh giá trễ hạn.
 * Có kiểm thử đơn vị.
 *
 * SLA (service level agreement — cam kết mức dịch vụ) đọc ngưỡng từ Cấu hình, **không
 * viết cứng**. Ngưỡng chưa đặt thì hệ thống KHÔNG tự bịa hạn: phiếu không có hạn, và
 * màn hình nói rõ là chưa đặt ngưỡng.
 */

export const LOAI_PHIEU = ["bao-hanh", "su-co", "yeu-cau", "bao-tri"] as const;
export type LoaiPhieu = (typeof LOAI_PHIEU)[number];

export const NHAN_LOAI_PHIEU: Record<string, string> = {
  "bao-hanh": "Bảo hành",
  "su-co": "Sự cố",
  "yeu-cau": "Yêu cầu hỗ trợ",
  "bao-tri": "Bảo trì định kỳ",
};

export const UU_TIEN_PHIEU = ["khan", "cao", "trung-binh", "thap"] as const;
export type UuTienPhieu = (typeof UU_TIEN_PHIEU)[number];

export const NHAN_UU_TIEN_PHIEU: Record<string, string> = {
  khan: "Khẩn",
  cao: "Cao",
  "trung-binh": "Trung bình",
  thap: "Thấp",
};

export const LOP_UU_TIEN_PHIEU: Record<string, string> = {
  khan: "loi",
  cao: "canh-bao",
  "trung-binh": "",
  thap: "",
};

export const TRANG_THAI_PHIEU = ["MOI", "DANG_XU_LY", "CHO_KHACH", "HOAN_THANH", "DONG", "HUY"] as const;
export type TrangThaiPhieu = (typeof TRANG_THAI_PHIEU)[number];

export const NHAN_TRANG_THAI_PHIEU: Record<string, string> = {
  MOI: "Mới",
  DANG_XU_LY: "Đang xử lý",
  CHO_KHACH: "Chờ khách phản hồi",
  HOAN_THANH: "Đã xử lý xong",
  DONG: "Đã đóng",
  HUY: "Đã hủy",
};

export const LOP_TRANG_THAI_PHIEU: Record<string, string> = {
  MOI: "canh-bao",
  DANG_XU_LY: "chinh",
  CHO_KHACH: "canh-bao",
  HOAN_THANH: "tot",
  DONG: "",
  HUY: "loi",
};

/** Phiếu còn phải làm gì đó (chưa xong, chưa hủy). */
export function dangMo(trangThai: string): boolean {
  return ["MOI", "DANG_XU_LY", "CHO_KHACH"].includes(trangThai);
}

export function daDongPhieu(trangThai: string): boolean {
  return ["DONG", "HUY"].includes(trangThai);
}

export interface NguongSla {
  gioPhanHoiKhan: number | null;
  gioPhanHoiThuong: number | null;
  gioXuLyKhan: number | null;
  gioXuLyThuong: number | null;
}

/**
 * Hạn phản hồi và hạn xử lý của một phiếu, tính từ lúc mở.
 * Ngưỡng chưa đặt → trả `null`, KHÔNG đoán một con số nào.
 */
export function hanSla(uuTien: string, moLuc: Date, nguong: NguongSla): { hanPhanHoi: Date | null; hanXuLy: Date | null } {
  const khan = uuTien === "khan";
  const gioPhanHoi = khan ? nguong.gioPhanHoiKhan : nguong.gioPhanHoiThuong;
  const gioXuLy = khan ? nguong.gioXuLyKhan : nguong.gioXuLyThuong;
  const cong = (gio: number | null) => (gio === null || gio <= 0 ? null : new Date(moLuc.getTime() + gio * 3_600_000));
  return { hanPhanHoi: cong(gioPhanHoi), hanXuLy: cong(gioXuLy) };
}

export type MucSla = "khong-co-han" | "con-han" | "sap-het" | "tre-han";

/**
 * Tình trạng một mốc hạn: chưa có hạn, còn hạn, sắp hết (còn dưới 20% thời gian), hay đã trễ.
 * `daXong` là thời điểm thực tế đã làm xong mốc đó — có rồi thì so với hạn, chưa có thì so với bây giờ.
 */
export function mucSla(han: Date | null, daXong: Date | null, bayGio: Date = new Date(), moLuc?: Date | null): MucSla {
  if (!han) return "khong-co-han";
  const moc = daXong ?? bayGio;
  if (moc.getTime() > han.getTime()) return "tre-han";
  if (daXong) return "con-han";
  if (moLuc) {
    const tong = han.getTime() - moLuc.getTime();
    const con = han.getTime() - bayGio.getTime();
    if (tong > 0 && con / tong <= 0.2) return "sap-het";
  }
  return "con-han";
}

export const NHAN_MUC_SLA: Record<MucSla, { nhan: string; lop: string }> = {
  "khong-co-han": { nhan: "Chưa đặt hạn", lop: "" },
  "con-han": { nhan: "Trong hạn", lop: "tot" },
  "sap-het": { nhan: "Sắp hết hạn", lop: "canh-bao" },
  "tre-han": { nhan: "Trễ hạn", lop: "loi" },
};

/** Trạng thái kế tiếp hợp lệ — phiếu không nhảy lung tung. */
export function chuyenDuoc(tu: string, den: string): boolean {
  const cho: Record<string, string[]> = {
    MOI: ["DANG_XU_LY", "CHO_KHACH", "HOAN_THANH", "HUY"],
    DANG_XU_LY: ["CHO_KHACH", "HOAN_THANH", "HUY"],
    CHO_KHACH: ["DANG_XU_LY", "HOAN_THANH", "HUY"],
    HOAN_THANH: ["DONG", "DANG_XU_LY"],
    DONG: [],
    HUY: [],
  };
  return (cho[tu] ?? []).includes(den);
}
