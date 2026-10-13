import { createHmac, randomBytes } from "node:crypto";

/**
 * TOTP — RFC 6238 (dựa trên HOTP RFC 4226), tự viết bằng `node:crypto`, không thêm thư viện (QĐ-72).
 *
 * Mặc định khớp Google Authenticator / Microsoft Authenticator: HMAC-SHA1, 6 chữ số, bước 30 giây.
 * Hàm tổng quát nhận thuật toán và số chữ số để kiểm đủ vector chuẩn trong phụ lục B của RFC 6238.
 */

export type ThuatToan = "sha1" | "sha256" | "sha512";
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const BUOC_GIAY = 30;

export function base32Ma(bytes: Uint8Array): string {
  let bits = 0;
  let giaTri = 0;
  let ra = "";
  for (const b of bytes) {
    giaTri = (giaTri << 8) | b;
    bits += 8;
    while (bits >= 5) {
      ra += B32[(giaTri >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) ra += B32[(giaTri << (5 - bits)) & 31];
  return ra;
}

export function base32Giai(s: string): Buffer {
  const sach = s.toUpperCase().replace(/[\s=-]/g, "");
  if (!/^[A-Z2-7]*$/.test(sach)) throw new Error("Khóa base32 chứa ký tự không hợp lệ.");
  let bits = 0;
  let giaTri = 0;
  const ra: number[] = [];
  for (const ch of sach) {
    giaTri = ((giaTri << 5) | B32.indexOf(ch)) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      ra.push((giaTri >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(ra);
}

/** HOTP (RFC 4226 mục 5.3): HMAC trên bộ đếm 8 byte big-endian, cắt động, lấy `soChuSo` chữ số cuối. */
export function hotp(khoa: Buffer, boDem: bigint | number, soChuSo = 6, thuatToan: ThuatToan = "sha1"): string {
  const dem = Buffer.alloc(8);
  dem.writeBigUInt64BE(BigInt(boDem));
  const h = createHmac(thuatToan, khoa).update(dem).digest();
  const o = h[h.length - 1] & 0x0f;
  const nhiPhan = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(nhiPhan % 10 ** soChuSo).padStart(soChuSo, "0");
}

export function buocThoiGian(msUnix: number, buocGiay = BUOC_GIAY): number {
  return Math.floor(msUnix / 1000 / buocGiay);
}

export function totp(khoa: Buffer, msUnix: number, soChuSo = 6, thuatToan: ThuatToan = "sha1", buocGiay = BUOC_GIAY): string {
  return hotp(khoa, buocThoiGian(msUnix, buocGiay), soChuSo, thuatToan);
}

/**
 * Kiểm mã 6 số. Cho lệch ±`cuaSo` bước (mặc định ±30 giây) vì đồng hồ điện thoại không chuẩn.
 * Trả về **bước khớp** để người gọi lưu lại và chặn dùng lại mã cũ (`buocDaDung`): mã thuộc
 * bước ≤ bước đã dùng bị từ chối, kể cả khi còn trong cửa sổ.
 */
export function kiemMaTotp(
  khoaBase32: string,
  ma: string,
  { bayGio = Date.now(), cuaSo = 1, buocDaDung = null as number | null } = {},
): number | null {
  const sach = ma.replace(/\s/g, "");
  if (!/^\d{6}$/.test(sach)) return null;
  const khoa = base32Giai(khoaBase32);
  const hienTai = buocThoiGian(bayGio);
  let khop: number | null = null;
  // Duyệt hết cửa sổ (không thoát sớm) để thời gian kiểm không lộ mã khớp ở bước nào.
  for (let d = -cuaSo; d <= cuaSo; d++) {
    const buoc = hienTai + d;
    if (hotp(khoa, buoc) === sach && (buocDaDung === null || buoc > buocDaDung) && khop === null) khop = buoc;
  }
  return khop;
}

/** Khóa bí mật mới: 20 byte ngẫu nhiên (160 bit — độ dài RFC 4226 khuyên dùng), mã base32. */
export function sinhKhoaTotp(): string {
  return base32Ma(randomBytes(20));
}

/** URI `otpauth://` để ứng dụng xác thực nhận khóa (quét QR hoặc dán tay). */
export function uriOtpauth(khoaBase32: string, taiKhoan: string, nhaPhatHanh: string): string {
  const nhan = `${encodeURIComponent(nhaPhatHanh)}:${encodeURIComponent(taiKhoan)}`;
  return `otpauth://totp/${nhan}?secret=${khoaBase32}&issuer=${encodeURIComponent(nhaPhatHanh)}&algorithm=SHA1&digits=6&period=${BUOC_GIAY}`;
}

/** Khóa base32 chia nhóm 4 ký tự cho dễ gõ tay. */
export function nhomKhoa(khoaBase32: string): string {
  return khoaBase32.replace(/(.{4})/g, "$1 ").trim();
}

/** Mã khôi phục: 10 ký tự base32 (50 bit), hiện dạng XXXXX-XXXXX. */
export function sinhMaKhoiPhuc(soLuong = 10): string[] {
  return Array.from({ length: soLuong }, () => {
    const s = base32Ma(randomBytes(7)).slice(0, 10);
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
}

/** Chuẩn hóa mã khôi phục người dùng gõ: bỏ khoảng trắng, gạch, chữ hoa. */
export function chuanHoaMaKhoiPhuc(s: string): string {
  return s.toUpperCase().replace(/[\s-]/g, "");
}
