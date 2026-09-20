import { QUY_TAC, THU_TU_MUC_DO, type DinhNghiaQuyTac } from "./quy-tac";

/**
 * Phần THUẦN của nhắc việc và bảo trì định kỳ. Không chạm cơ sở dữ liệu, có kiểm thử đơn vị.
 *
 * Quy ước ngày giống các phân hệ trước: làm trên chuỗi "yyyy-mm-dd" theo giờ Việt Nam.
 */

/** Số ngày từ `tu` đến `den` (dương = `den` sau `tu`). */
export function soNgayGiua(tu: string, den: string): number {
  const a = Date.parse(`${tu}T00:00:00Z`);
  const b = Date.parse(`${den}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** Cộng/trừ ngày, trả lại chuỗi "yyyy-mm-dd". */
export function congNgay(ngay: string, soNgay: number): string {
  const t = Date.parse(`${ngay}T00:00:00Z`);
  if (Number.isNaN(t)) return ngay;
  return new Date(t + soNgay * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Cộng tháng theo lịch. Ngày 31 cộng sang tháng chỉ có 30 ngày thì lấy ngày cuối tháng đó
 * (31/01 + 1 tháng = 28/02). Dùng cho kỳ bảo trì và mốc "khách chưa mua lại".
 */
export function congThang(ngay: string, soThang: number): string {
  const [nam, thang, ngayTrongThang] = ngay.split("-").map(Number);
  if (!nam || !thang || !ngayTrongThang) return ngay;
  const tong = thang - 1 + soThang;
  const namMoi = nam + Math.floor(tong / 12);
  const thangMoi = ((tong % 12) + 12) % 12;
  const cuoiThang = new Date(Date.UTC(namMoi, thangMoi + 1, 0)).getUTCDate();
  const d = new Date(Date.UTC(namMoi, thangMoi, Math.min(ngayTrongThang, cuoiThang)));
  return d.toISOString().slice(0, 10);
}

/**
 * Ngày bảo trì kỳ kế tiếp = lần gần nhất + chu kỳ; chưa bảo trì lần nào thì tính từ ngày
 * bắt đầu hợp đồng. Quá ngày kết thúc hợp đồng thì **không còn kỳ nào** (trả null) —
 * hệ thống không nhắc bảo trì cho hợp đồng đã hết hạn.
 */
export function kyBaoTriKeTiep(
  batDau: string,
  ketThuc: string,
  chuKyThang: number,
  lanGanNhat: string | null,
): string | null {
  if (chuKyThang <= 0) return null;
  const moc = lanGanNhat ? congThang(lanGanNhat, chuKyThang) : batDau;
  return soNgayGiua(moc, ketThuc) >= 0 ? moc : null;
}

export type TinhTrangBaoTri = "cho-ky-sau" | "den-ky" | "tre-ky" | "het-han" | "khong-theo-doi";

/**
 * Tình trạng một hợp đồng bảo trì so với hôm nay.
 * `nguongSomNgay` là số ngày được phép nhắc trước; null = chỉ nhắc khi đã tới ngày.
 */
export function tinhTrangBaoTri(
  trangThai: string,
  ngayKyKeTiep: string | null,
  homNay: string,
  nguongSomNgay: number | null = null,
): TinhTrangBaoTri {
  if (trangThai !== "hieu-luc") return "khong-theo-doi";
  if (!ngayKyKeTiep) return "het-han";
  const con = soNgayGiua(homNay, ngayKyKeTiep);
  if (con < 0) return "tre-ky";
  if (con === 0) return "den-ky";
  if (nguongSomNgay !== null && con <= nguongSomNgay) return "den-ky";
  return "cho-ky-sau";
}

export interface KetQuaNguong {
  chay: boolean;
  nguong: number | null;
  lyDoBoQua: string;
}

/**
 * Quy tắc có đủ điều kiện chạy không. Ba lý do bỏ qua, mỗi lý do một câu cụ thể —
 * để màn hình nói được "vì sao hôm nay không quét" chứ không im lặng.
 */
export function kiemTraDieuKien(
  quyTac: DinhNghiaQuyTac,
  bat: boolean,
  nguong: number | null,
): KetQuaNguong {
  if (!bat) return { chay: false, nguong: null, lyDoBoQua: "Quy tắc đang tắt." };
  if (quyTac.khoaNguong === null) return { chay: true, nguong: null, lyDoBoQua: "" };
  if (nguong === null) return { chay: false, nguong: null, lyDoBoQua: quyTac.thieuNguong };
  if (nguong <= 0) return { chay: false, nguong, lyDoBoQua: "Ngưỡng đang đặt bằng 0 nên không quét." };
  return { chay: true, nguong, lyDoBoQua: "" };
}

/** Mốc "quá hạn kể từ": mọi thứ có ngày cũ hơn mốc này thì lọt vào danh sách. */
export function mocQuaHan(homNay: string, soNgay: number): string {
  return congNgay(homNay, -soNgay);
}

/** Sắp xếp việc hôm nay: gấp trước, trong cùng mức thì theo tên quy tắc rồi tiêu đề. */
export function sapXepViec<T extends { mucDo: string; maQuyTac: string; tieuDe: string }>(ds: T[]): T[] {
  return [...ds].sort(
    (a, b) =>
      (THU_TU_MUC_DO[a.mucDo] ?? 9) - (THU_TU_MUC_DO[b.mucDo] ?? 9) ||
      a.maQuyTac.localeCompare(b.maQuyTac, "vi") ||
      a.tieuDe.localeCompare(b.tieuDe, "vi"),
  );
}

export interface TomTatViec {
  tong: number;
  mo: number;
  xong: number;
  boQua: number;
  khan: number;
  canhBao: number;
  thongTin: number;
}

export function tomTatViec(ds: { mucDo: string; trangThai: string }[]): TomTatViec {
  const t: TomTatViec = { tong: ds.length, mo: 0, xong: 0, boQua: 0, khan: 0, canhBao: 0, thongTin: 0 };
  for (const v of ds) {
    if (v.trangThai === "mo") t.mo += 1;
    else if (v.trangThai === "xong") t.xong += 1;
    else if (v.trangThai === "bo-qua") t.boQua += 1;
    if (v.trangThai !== "mo") continue;
    if (v.mucDo === "khan") t.khan += 1;
    else if (v.mucDo === "canh-bao") t.canhBao += 1;
    else t.thongTin += 1;
  }
  return t;
}

/**
 * Câu tóm tắt cho chuông thông báo hằng ngày. Không có việc nào thì trả chuỗi rỗng —
 * gọi là **không gửi thông báo**, vì một cái chuông báo "bạn có 0 việc" là chuông rác.
 */
export function cauTomTatHangNgay(t: TomTatViec): string {
  if (t.mo === 0) return "";
  const phan: string[] = [];
  if (t.khan > 0) phan.push(`${t.khan} việc gấp`);
  if (t.canhBao > 0) phan.push(`${t.canhBao} việc cần để ý`);
  if (t.thongTin > 0) phan.push(`${t.thongTin} việc chăm sóc`);
  return `Hôm nay bạn có ${phan.join(", ")}.`;
}

/** Giờ chạy hợp lệ (0–23) đã tới chưa, so với giờ hiện tại theo giờ Việt Nam. */
export function daToiGioChay(gioHienTai: number, gioChay: number): boolean {
  return gioHienTai >= gioChay;
}

/** Số quy tắc đang bật và đủ ngưỡng — để màn hình nói thật hệ thống đang canh mấy việc. */
export function demQuyTacSanSang(
  trangThai: { ma: string; bat: boolean; nguong: number | null }[],
): { sanSang: number; tong: number } {
  let sanSang = 0;
  for (const q of QUY_TAC) {
    const t = trangThai.find((x) => x.ma === q.ma);
    if (kiemTraDieuKien(q, t?.bat ?? true, t?.nguong ?? null).chay) sanSang += 1;
  }
  return { sanSang, tong: QUY_TAC.length };
}
