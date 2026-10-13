/**
 * Phần THUẦN của khách hàng nâng cao — có kiểm thử đơn vị (thu/don-vi/khach-nang-cao.test.ts).
 */

/** "dd/mm/yyyy" hoặc "yyyy-mm-dd" → "yyyy-mm-dd". Sai thì ném lỗi dòng. */
export function docNgayCsv(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  let y: number, m: number, d: number;
  const a = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  const b = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (a) [d, m, y] = [Number(a[1]), Number(a[2]), Number(a[3])];
  else if (b) [y, m, d] = [Number(b[1]), Number(b[2]), Number(b[3])];
  else throw new Error(`Ngày sinh "${s}" không đúng dạng dd/mm/yyyy.`);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 1900 || dt > new Date()) {
    throw new Error(`Ngày sinh "${s}" không hợp lệ.`);
  }
  return dt.toISOString().slice(0, 10);
}
