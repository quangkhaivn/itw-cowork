/**
 * Phần tính thuần của "Vận hành bền vững" (0.16.1) — không đụng CSDL, kiểm bằng thu/don-vi.
 *
 *  - Nhịp worker: trễ quá `PHUT_WORKER_TRE` phút là coi như worker đứng (QĐ-87).
 *  - Sao lưu: lần THÀNH CÔNG cuối cũ hơn `GIO_SAO_LUU_TRE` giờ là báo đỏ (QĐ-88). Cron chạy
 *    02:15 mỗi đêm; 26 giờ chừa 2 giờ cho một đêm chạy chậm mà không báo động giả.
 *  - Quét nhắc việc theo lịch hỏng thì thử lại có giãn cách, tối đa `SO_LAN_THU_TOI_DA` lần một
 *    ngày; hỏng liên tiếp từ `NGUONG_BAO_HONG` lần thì báo người quản trị (QĐ-86).
 */

export const PHUT_WORKER_TRE = 5;
export const GIO_SAO_LUU_TRE = 26;

/** Số lần hỏng tối đa của bản quét theo lịch trong MỘT ngày; quá thì thôi, chờ người xem. */
export const SO_LAN_THU_TOI_DA = 5;
/** Giãn cách sau lần hỏng đầu (phút); mỗi lần hỏng thêm thì gấp đôi, trần `PHUT_CHO_TOI_DA`. */
export const PHUT_CHO_THU_LAI = 15;
export const PHUT_CHO_TOI_DA = 120;
/** Hỏng liên tiếp từ chừng này lần (kể cả chạy tay) thì báo người có quyền sửa cấu hình. */
export const NGUONG_BAO_HONG = 2;

export type TrangThaiNhip = "ok" | "tre" | "chua-co";

export function danhGiaNhipWorker(lanCuoi: Date | null, bayGio: Date = new Date(), phutTre = PHUT_WORKER_TRE): TrangThaiNhip {
  if (!lanCuoi) return "chua-co";
  return bayGio.getTime() - lanCuoi.getTime() > phutTre * 60_000 ? "tre" : "ok";
}

export type TrangThaiSaoLuu = "ok" | "tre" | "hong" | "chua-co";

/**
 * Sao lưu: chưa từng thành công → "chua-co"; lần thành công cuối quá 26 giờ → "tre";
 * còn trong hạn nhưng lần chạy GẦN NHẤT hỏng → "hong" (vẫn còn bản tốt, nhưng đêm nay đã hỏng).
 */
export function danhGiaSaoLuu(
  d: { lanCuoi: Date; ok: boolean; lanThanhCongCuoi: Date | null } | null,
  bayGio: Date = new Date(),
  gioTre = GIO_SAO_LUU_TRE,
): TrangThaiSaoLuu {
  if (!d || !d.lanThanhCongCuoi) return "chua-co";
  if (bayGio.getTime() - d.lanThanhCongCuoi.getTime() > gioTre * 3_600_000) return "tre";
  if (!d.ok) return "hong";
  return "ok";
}

/** Số phút phải chờ sau `soLanHong` lần hỏng (≥ 1) trước khi thử lại. */
export function phutChoThuLai(soLanHong: number): number {
  if (soLanHong <= 0) return 0;
  return Math.min(PHUT_CHO_THU_LAI * 2 ** (soLanHong - 1), PHUT_CHO_TOI_DA);
}

export interface QuyetDinhThuLai {
  chay: boolean;
  /** Câu cho nhật ký worker — rỗng khi được chạy. */
  lyDo: string;
  /** Đã hết số lần thử trong ngày. */
  hetLuot: boolean;
}

/**
 * Worker có nên chạy lại bản quét theo lịch của hôm nay không, khi hôm nay đã hỏng `soLanHong` lần,
 * lần cuối kết thúc lúc `lanHongCuoi`. Không có lần hỏng nào → chạy.
 */
export function quyetDinhThuLai(soLanHong: number, lanHongCuoi: Date | null, bayGio: Date = new Date()): QuyetDinhThuLai {
  if (soLanHong <= 0 || !lanHongCuoi) return { chay: true, lyDo: "", hetLuot: false };
  if (soLanHong >= SO_LAN_THU_TOI_DA) {
    return { chay: false, lyDo: `đã hỏng ${soLanHong} lần hôm nay — ngừng thử lại, chờ người quản trị xem`, hetLuot: true };
  }
  const cho = phutChoThuLai(soLanHong);
  const conPhut = Math.ceil((lanHongCuoi.getTime() + cho * 60_000 - bayGio.getTime()) / 60_000);
  if (conPhut > 0) return { chay: false, lyDo: `hỏng ${soLanHong} lần, chờ thêm ${conPhut} phút mới thử lại`, hetLuot: false };
  return { chay: true, lyDo: "", hetLuot: false };
}

/** Đếm số lần hỏng liên tiếp tính từ lần chạy mới nhất (danh sách xếp mới → cũ). */
export function demHongLienTiep(trangThai: string[]): number {
  let n = 0;
  for (const t of trangThai) {
    if (t !== "hong") break;
    n += 1;
  }
  return n;
}

/** Cắt câu lỗi cho gọn và bỏ phần dễ lộ chuỗi kết nối. */
export function cauLoiGon(loi: unknown, toiDa = 500): string {
  const s = loi instanceof Error ? loi.message : String(loi);
  return s.replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://…").trim().slice(0, toiDa) || "Lỗi không rõ.";
}
