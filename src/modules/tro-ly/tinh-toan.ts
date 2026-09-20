/**
 * Phần THUẦN của trợ lý: cắt gọn kết quả công cụ, dựng lời nhắc hệ thống, kiểm trần
 * vòng lặp, đặt tên hội thoại. Không chạm cơ sở dữ liệu, không gọi mạng, có kiểm thử đơn vị.
 */

/** Trần số vòng mô hình ↔ công cụ trong một lượt. Vượt thì dừng và nói rõ (AI-05). */
export const TOI_DA_VONG = 6;

/** Kết quả công cụ dài quá thì cắt — gửi cả nghìn dòng chỉ tốn token, không làm câu trả lời đúng hơn. */
export const TOI_DA_KY_TU_KET_QUA = 6000;

export function catGon(s: string, toiDa: number = TOI_DA_KY_TU_KET_QUA): string {
  if (s.length <= toiDa) return s;
  return `${s.slice(0, toiDa)}\n…(đã cắt bớt ${s.length - toiDa} ký tự; hỏi hẹp hơn nếu cần đủ)`;
}

/** Kết quả công cụ luôn đi tới mô hình dưới dạng JSON một dòng, đã cắt gọn. */
export function ketQuaSangVanBan(kq: unknown): string {
  try {
    return catGon(JSON.stringify(kq ?? null));
  } catch {
    return "(không chuyển được kết quả sang JSON)";
  }
}

export type KetCucGoi = "ok" | "thieu-quyen" | "tham-so-sai" | "loi";

/** Câu báo cho mô hình khi công cụ không chạy được. Mô hình phải nói lại với người dùng. */
export function cauBaoLoiCongCu(ketCuc: KetCucGoi, chiTiet: string): string {
  switch (ketCuc) {
    case "thieu-quyen":
      return `KHÔNG CÓ QUYỀN: người đang hỏi không được phép dùng công cụ này. Hãy nói thẳng với họ là bạn không tra được vì thiếu quyền, và đừng đoán số liệu. (${chiTiet})`;
    case "tham-so-sai":
      return `THAM SỐ SAI: ${chiTiet}. Hãy gọi lại với tham số đúng, hoặc hỏi lại người dùng cho rõ.`;
    default:
      return `LỖI: ${chiTiet}. Hãy nói với người dùng là chưa tra được, và đừng đoán số liệu.`;
  }
}

/**
 * Lời nhắc hệ thống. Ba điều bắt buộc, viết thẳng vào đây vì đó là luật của hệ thống
 * chứ không phải sở thích: chỉ dùng số từ công cụ, không tự ý ghi, và nói "không biết"
 * khi không tra được.
 */
export function loiNhacHeThong(nguoi: { hoTen: string; vaiTro: string[] }, homNay: string): string {
  return [
    "Bạn là ITA, trợ lý trong phần mềm quản trị của Công ty Cổ phần Thế Giới Tin Học.",
    `Hôm nay là ${homNay}. Bạn đang nói chuyện với ${nguoi.hoTen}${nguoi.vaiTro.length ? ` (${nguoi.vaiTro.join(", ")})` : ""}.`,
    "",
    "LUẬT BẮT BUỘC:",
    "1. Mọi con số, tên khách, mã chứng từ trong câu trả lời phải lấy từ kết quả công cụ trong chính cuộc trò chuyện này. TUYỆT ĐỐI không nhớ ra, không suy ra, không làm tròn cho đẹp.",
    "2. Không tra được thì nói thẳng là không tra được và nêu lý do. Thà nói 'không tìm thấy' còn hơn đưa một con số sai.",
    "3. Bạn KHÔNG tự thay đổi dữ liệu. Muốn tạo hay sửa bất cứ thứ gì, hãy mô tả việc cần làm để người dùng tự bấm — hệ thống sẽ hỏi họ trước khi chạy.",
    "4. Công cụ chạy với đúng quyền của người đang hỏi. Kết quả rỗng có thể là do họ không được xem phần đó, chứ chưa chắc là không có dữ liệu — hãy nói rõ khả năng này.",
    "5. Trả lời bằng tiếng Việt, ngắn gọn, đi thẳng vào việc. Có số liệu thì nêu kèm đơn vị và mốc thời gian.",
  ].join("\n");
}

/** Tên hội thoại lấy từ câu hỏi đầu tiên — cắt gọn, bỏ xuống dòng. */
export function datTenHoiThoai(cauHoi: string, toiDa = 80): string {
  const s = cauHoi.replace(/\s+/g, " ").trim();
  if (!s) return "Hội thoại mới";
  return s.length <= toiDa ? s : `${s.slice(0, toiDa - 1)}…`;
}

/** Gộp các khối văn bản của mô hình thành câu trả lời cuối. */
export function gopVanBan(khoi: { loai: string; noiDung?: string }[]): string {
  return khoi
    .filter((k) => k.loai === "van-ban" && k.noiDung)
    .map((k) => k.noiDung!.trim())
    .filter(Boolean)
    .join("\n\n");
}

export interface TomTatLuot {
  soVong: number;
  soGoiCongCu: number;
  soGoiHong: number;
  vuotTran: boolean;
}

export function tomTatLuot(
  soVong: number,
  goi: { ketCuc: KetCucGoi }[],
): TomTatLuot {
  return {
    soVong,
    soGoiCongCu: goi.length,
    soGoiHong: goi.filter((g) => g.ketCuc !== "ok").length,
    vuotTran: soVong >= TOI_DA_VONG,
  };
}

/**
 * Câu thay thế khi mô hình dùng hết trần vòng lặp mà chưa chốt được câu trả lời.
 * Nói thật là đã dừng giữa chừng, không ghép tạm một câu nghe như đã xong.
 */
export const CAU_VUOT_TRAN =
  "Tôi đã tra nhiều bước mà vẫn chưa gom đủ dữ liệu để trả lời chắc chắn, nên dừng ở đây thay vì đoán. " +
  "Bạn thử hỏi hẹp lại (một khách, một khoảng thời gian, một loại chứng từ) giúp tôi nhé.";
