/**
 * Phần THUẦN của nghỉ phép (0.19.0): quỹ phép năm, thâm niên, cộng dồn theo tháng, chuyển năm sau,
 * số ngày của một đơn. Luật: BUSINESS_RULES.md mục 30 (NS-30 → NS-35). Kiểm thử: thu/don-vi/cham-cong.test.ts.
 *
 * Mọi con số (12 ngày, 5 năm +1 ngày, chuyển tối đa…) đến từ Cấu hình nhóm "Nghỉ phép" — không viết
 * cứng số của luật vào đây; luật đổi thì Giám đốc đổi ở màn hình Cấu hình.
 * Số ngày làm tròn XUỐNG tới 0,5 (nửa ngày là đơn vị nhỏ nhất của đơn nghỉ).
 */

export interface CauHinhPhep {
  /** Số ngày phép năm cơ bản cho người làm đủ 12 tháng. */
  soNgayNam: number;
  /** Cứ đủ bao nhiêu năm làm việc thì cộng thêm; null / 0 = không cộng thâm niên. */
  thamNienSoNam: number | null;
  /** Số ngày cộng thêm mỗi mốc thâm niên. */
  thamNienCongNgay: number;
  /** true = phép được dùng tới đâu tích lũy tới đó theo tháng; false = có cả quỹ năm từ đầu năm. */
  congDonTheoThang: boolean;
  /** Số ngày phép năm trước còn thừa được chuyển sang năm nay (0 = không chuyển). */
  chuyenNamSauToiDa: number;
}

export const lamTronNuaNgay = (x: number) => Math.floor(x * 2 + 1e-9) / 2;

function tachNgay(ngay: string): { nam: number; thang: number; ngay: number } {
  const [n, t, d] = ngay.split("-").map(Number);
  return { nam: n, thang: t, ngay: d };
}

/** Số năm làm việc TRÒN tính đến ngày `moc` (yyyy-mm-dd). Chưa có ngày vào làm → 0. */
export function soNamThamNien(ngayVao: string | null, moc: string): number {
  if (!ngayVao || ngayVao > moc) return 0;
  const a = tachNgay(ngayVao);
  const b = tachNgay(moc);
  let n = b.nam - a.nam;
  if (b.thang < a.thang || (b.thang === a.thang && b.ngay < a.ngay)) n -= 1;
  return Math.max(0, n);
}

/**
 * Quỹ phép của năm `nam` (NS-31):
 *  - cơ bản + thâm niên: ⌊số năm tròn tính tới 01/01 của năm đó / thamNienSoNam⌋ × thamNienCongNgay
 *    (lấy mốc đầu năm để quỹ không đổi giữa năm);
 *  - vào làm trong năm: chia theo số tháng còn lại tính cả tháng vào làm;
 *  - vào làm sau năm đó → 0.
 */
export function quyPhepNam(ngayVao: string | null, nam: number, ch: CauHinhPhep): number {
  const dauNam = `${nam}-01-01`;
  if (ngayVao && ngayVao > `${nam}-12-31`) return 0;
  const thamNien = ch.thamNienSoNam && ch.thamNienSoNam > 0 ? Math.floor(soNamThamNien(ngayVao, dauNam) / ch.thamNienSoNam) * ch.thamNienCongNgay : 0;
  const tron = ch.soNgayNam + thamNien;
  if (ngayVao && ngayVao > dauNam) {
    const vao = tachNgay(ngayVao);
    return lamTronNuaNgay((tron * (12 - vao.thang + 1)) / 12);
  }
  return tron;
}

/**
 * Phần quỹ đã tích lũy tới ngày `denNgay` trong năm (NS-31). Cộng dồn theo tháng: tính cả tháng đang
 * chạy (tháng 1 đã có 1/12 quỹ). Không cộng dồn → cả quỹ năm.
 */
export function phepDaTichLuy(ngayVao: string | null, nam: number, denNgay: string, ch: CauHinhPhep): number {
  const quy = quyPhepNam(ngayVao, nam, ch);
  if (!ch.congDonTheoThang) return quy;
  const den = tachNgay(denNgay);
  if (den.nam < nam) return 0;
  const thangDen = den.nam > nam ? 12 : den.thang;
  const thangDau = ngayVao && ngayVao > `${nam}-01-01` ? tachNgay(ngayVao).thang : 1;
  const soThangCo = 12 - thangDau + 1;
  if (thangDen < thangDau || soThangCo <= 0) return 0;
  return lamTronNuaNgay((quy * (thangDen - thangDau + 1)) / soThangCo);
}

/** Phép năm trước được chuyển sang (NS-32): phần còn thừa, không quá trần Cấu hình. */
export function phepChuyenSang(conLaiNamTruoc: number, ch: CauHinhPhep): number {
  return Math.max(0, Math.min(lamTronNuaNgay(conLaiNamTruoc), ch.chuyenNamSauToiDa));
}

export interface SoDuPhep {
  quyNam: number;
  daTichLuy: number;
  chuyenSang: number;
  dieuChinh: number;
  daDung: number;
  dangCho: number;
  /** Được nghỉ thêm ngay bây giờ (đã tích lũy + chuyển sang + điều chỉnh − đã dùng). */
  duocDung: number;
  /** Còn lại nếu tính đủ cả quỹ năm. */
  conLaiCaNam: number;
}

export function soDuPhep(d: Omit<SoDuPhep, "duocDung" | "conLaiCaNam">): SoDuPhep {
  const r = (x: number) => Math.round(x * 10) / 10;
  return {
    ...d,
    duocDung: r(d.daTichLuy + d.chuyenSang + d.dieuChinh - d.daDung),
    conLaiCaNam: r(d.quyNam + d.chuyenSang + d.dieuChinh - d.daDung),
  };
}

/**
 * Số ngày công của một đơn nghỉ (NS-33): cộng giá trị công dự kiến của từng ngày trong khoảng (ngày
 * nghỉ tuần, ngày lễ = 0 nên không bị trừ phép). Nửa ngày: 0,5 nếu ngày đó PHẢI LÀM đúng nửa xin nghỉ —
 * ngày làm cả ca, hoặc lịch làm nửa ca trùng nửa xin (thứ Bảy chỉ làm sáng mà xin nghỉ chiều = 0, không trừ
 * oan 0,5 phép — QA 0.19.0). `phanDuKien` trống = không biết phần của lịch, chỉ xét giá trị.
 */
export function soNgayCuaDon(
  cacNgay: { ngay: string; giaTriDuKien: number; phanDuKien?: "ca" | "sang" | "chieu" | "nghi" }[],
  phan: "ca-ngay" | "sang" | "chieu",
): number {
  if (phan !== "ca-ngay") {
    const d = cacNgay[0];
    if (!d || d.giaTriDuKien < 0.5) return 0;
    return d.phanDuKien === undefined || d.phanDuKien === "ca" || d.phanDuKien === phan ? 0.5 : 0;
  }
  return Math.round(cacNgay.reduce((s, d) => s + d.giaTriDuKien, 0) * 10) / 10;
}

/** Hai khoảng ngày (gồm hai đầu) có giao nhau không. */
export function khoangNgayGiao(a1: string, a2: string, b1: string, b2: string): boolean {
  return a1 <= b2 && b1 <= a2;
}

/**
 * Hai đơn trong cùng một ngày có chồng nhau không — nửa sáng và nửa chiều của cùng một ngày thì không.
 */
export function donChongNhau(
  a: { tu: string; den: string; phan: "ca-ngay" | "sang" | "chieu" },
  b: { tu: string; den: string; phan: "ca-ngay" | "sang" | "chieu" },
): boolean {
  if (!khoangNgayGiao(a.tu, a.den, b.tu, b.den)) return false;
  if (a.phan !== "ca-ngay" && b.phan !== "ca-ngay" && a.phan !== b.phan) return false;
  return true;
}
