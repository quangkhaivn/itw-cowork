/**
 * Định dạng hiển thị theo chuẩn Việt Nam (mục 32 master prompt).
 *
 *   Tiền tệ:  1.234.567 ₫
 *   Ngày:     dd/MM/yyyy
 *   Múi giờ:  Asia/Ho_Chi_Minh
 *
 * Cơ sở dữ liệu lưu thời gian dạng timestamptz (UTC). Chỉ đổi sang giờ Việt Nam
 * ở lớp hiển thị — tại đây. Không tự cộng 7 tiếng ở chỗ khác.
 */

export const MUI_GIO = "Asia/Ho_Chi_Minh";

const DINH_DANG_SO = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });
const DINH_DANG_NGAY = new Intl.DateTimeFormat("en-GB", {
  timeZone: MUI_GIO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const DINH_DANG_GIO = new Intl.DateTimeFormat("en-GB", {
  timeZone: MUI_GIO,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type GiaTriSo = number | bigint | string | { toString(): string } | null | undefined;

function veSo(x: GiaTriSo): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = typeof x === "number" ? x : Number(x.toString());
  return Number.isFinite(n) ? n : null;
}

/** 1234567 → "1.234.567". Nhận cả Decimal của Prisma. */
export function dinhDangSo(x: GiaTriSo): string {
  const n = veSo(x);
  return n === null ? "—" : DINH_DANG_SO.format(n);
}

/** 1234567 → "1.234.567 ₫". Tiền Việt không có phần lẻ nên làm tròn. */
export function dinhDangTien(x: GiaTriSo): string {
  const n = veSo(x);
  return n === null ? "—" : `${DINH_DANG_SO.format(Math.round(n))} ₫`;
}

/** 12.5 → "12,5%". */
export function dinhDangPhanTram(x: GiaTriSo): string {
  const n = veSo(x);
  return n === null ? "—" : `${DINH_DANG_SO.format(n)}%`;
}

function veNgay(x: Date | string | null | undefined): Date | null {
  if (!x) return null;
  const d = x instanceof Date ? x : new Date(x);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** → "dd/MM/yyyy" theo giờ Việt Nam. */
export function dinhDangNgay(x: Date | string | null | undefined): string {
  const d = veNgay(x);
  return d ? DINH_DANG_NGAY.format(d) : "—";
}

/** → "dd/MM/yyyy HH:mm" theo giờ Việt Nam. */
export function dinhDangNgayGio(x: Date | string | null | undefined): string {
  const d = veNgay(x);
  return d ? `${DINH_DANG_NGAY.format(d)} ${DINH_DANG_GIO.format(d)}` : "—";
}

/**
 * Chuỗi "yyyy-mm-dd" (từ ô chọn ngày) → mốc đầu ngày hoặc cuối ngày theo giờ Việt Nam.
 * Việt Nam không có giờ mùa hè nên độ lệch +07:00 cố định.
 */
export function dauNgayVN(ngay: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)) return null;
  const d = new Date(`${ngay}T00:00:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function cuoiNgayVN(ngay: string): Date | null {
  const d = dauNgayVN(ngay);
  return d ? new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1) : null;
}

/** Mốc 00:00 hôm nay theo giờ Việt Nam. */
export function dauHomNayVN(bayGio: Date = new Date()): Date {
  const [ngay, thang, nam] = DINH_DANG_NGAY.format(bayGio).split("/");
  return new Date(`${nam}-${thang}-${ngay}T00:00:00+07:00`);
}

/**
 * Chuỗi người dùng gõ → dạng hiển thị trong ô nhập tiền: "12000000" → "12.000.000".
 *
 * Để ở đây (không để trong tệp "use client") vì trang máy chủ cũng cần dựng sẵn giá trị
 * ban đầu cho form — gọi hàm của Client Component từ máy chủ thì Next.js ném lỗi.
 */
export function dinhDangNhapTien(s: string): string {
  const so = s.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return so.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
