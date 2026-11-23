/**
 * Ký tự vô hình (QA 0.25.0, QĐ-241) — thuần. Ký tự điều khiển (trừ \n \t), vô hình (zero-width, gạch mềm, khoảng trắng
 * Hangul / Mông Cổ), đảo chiều (bidi, cả U+061C), BOM, U+FFF9–FFFB và THẺ Unicode U+E0000–E007F — dùng để giấu chữ / lệnh
 * mà người duyệt không thấy ("ASCII smuggling"). Dùng cho cả dữ liệu ĐƯA VÀO lời nhắc AI lẫn chữ AI trả về.
 */
const VO_HINH_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufeff\uffa0\ufff9-\ufffb\u{e0000}-\u{e007f}]/gu;

/** Bỏ ký tự vô hình; U+2028 / U+2029 (ngắt dòng Unicode) → `ngatDong`. */
export function boKyTuVoHinh(s: string, ngatDong = "\n"): string {
  return s.replace(/[\u2028\u2029]/g, ngatDong).replace(VO_HINH_RE, "");
}
