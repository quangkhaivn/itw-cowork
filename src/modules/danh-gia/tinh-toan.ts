import { z } from "zod";
import { cacNgayTrongKhoang, congNgay, laNgayHopLe, mocVN, thuTrongTuan } from "@/modules/cham-cong/tinh-toan";

/**
 * Phần THUẦN của 0.20.0 (BUSINESS_RULES.md mục 31): điểm việc, hệ số đúng hạn, lịch việc định kỳ,
 * hạn báo cáo, ranh giới kỳ đánh giá theo giờ Việt Nam, % đạt KPI, điểm tổng + xếp loại, chấm phiếu
 * thực tập theo mẫu (thang 10 và thang chữ). Không đụng CSDL — kiểm thử đơn vị ở thu/don-vi/danh-gia.test.ts.
 */

const GIO_MS = 3_600_000;

/** Làm tròn 2 chữ số thập phân (điểm, hệ số, %). */
export function lamTron2(x: number): number {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Công việc: độ khó, nhận việc, chuỗi duyệt
// ---------------------------------------------------------------------------

export const DO_KHO = [1, 2, 3, 4, 5] as const;
export const NHAN_DO_KHO: Record<number, string> = { 1: "Rất dễ", 2: "Dễ", 3: "Trung bình", 4: "Khó", 5: "Rất khó" };

export const TRANG_THAI_NHAN = ["cho-nhan", "da-nhan", "tu-choi"] as const;
export const NHAN_TRANG_THAI_NHAN: Record<string, string> = { "cho-nhan": "Chờ nhận", "da-nhan": "Đã nhận", "tu-choi": "Bị từ chối" };

export const NHAN_CHAT_LUONG: Record<number, string> = { 1: "Kém", 2: "Chưa đạt", 3: "Đạt", 4: "Tốt", 5: "Xuất sắc" };

/** Tối đa 5 cấp duyệt (CHECK `task_approvers_cap_check`). */
export const TOI_DA_CAP_DUYET = 5;
/** Tối đa người nhận trong một lần giao nhiều người. */
export const TOI_DA_NGUOI_MOT_LAN_GIAO = 50;

export const LOAI_CAP_DUYET = ["nguoi-giao", "quan-ly-truc-tiep", "nguoi-cu-the"] as const;
export const NHAN_LOAI_CAP_DUYET: Record<string, string> = {
  "nguoi-giao": "Người giao",
  "quan-ly-truc-tiep": "Quản lý trực tiếp của người làm",
  "nguoi-cu-the": "Một người cụ thể",
};
export const LuocDoCapDuyet = z
  .object({ loai: z.enum(LOAI_CAP_DUYET), nguoiId: z.uuid().nullable().optional() })
  .refine((c) => c.loai !== "nguoi-cu-the" || !!c.nguoiId, { message: "Chọn người duyệt cho cấp này.", path: ["nguoiId"] });
export const LuocDoChuoiDuyet = z.array(LuocDoCapDuyet).max(TOI_DA_CAP_DUYET, `Tối đa ${TOI_DA_CAP_DUYET} cấp duyệt.`);
export type CapDuyet = z.infer<typeof LuocDoCapDuyet>;

/**
 * Dựng chuỗi người duyệt thật từ chuỗi khai trong mẫu (DG-22). Bỏ cấp không xác định được (không có
 * quản lý trực tiếp…), bỏ cấp trùng người đã có, bỏ cấp rơi vào chính người làm — không ai duyệt việc
 * của mình. Chuỗi rỗng mà việc cần duyệt → dùng người giao (nếu khác người làm), không thì null (lỗi).
 */
export function dungChuoiDuyet(
  chuoi: CapDuyet[],
  ctx: { nguoiLamId: string; nguoiGiaoId: string; quanLyTrucTiepId: string | null },
): string[] {
  const kq: string[] = [];
  for (const c of chuoi) {
    const id = c.loai === "nguoi-giao" ? ctx.nguoiGiaoId : c.loai === "quan-ly-truc-tiep" ? ctx.quanLyTrucTiepId : (c.nguoiId ?? null);
    if (!id || id === ctx.nguoiLamId || kq.includes(id)) continue;
    kq.push(id);
  }
  if (kq.length === 0 && ctx.nguoiGiaoId !== ctx.nguoiLamId) kq.push(ctx.nguoiGiaoId);
  return kq.slice(0, TOI_DA_CAP_DUYET);
}

// ---------------------------------------------------------------------------
// Đúng hạn và điểm việc (DG-30 → DG-31)
// ---------------------------------------------------------------------------

export interface CauHinhDungHan {
  heSoDungHan: number;
  heSoTreNhe: number;
  heSoTreNang: number;
  heSoKhongHan: number;
  treNheToiDaGio: number;
}

export const CAU_HINH_DUNG_HAN_MAC_DINH: CauHinhDungHan = { heSoDungHan: 1, heSoTreNhe: 0.8, heSoTreNang: 0.5, heSoKhongHan: 1, treNheToiDaGio: 24 };

export type LoaiDungHan = "khong-han" | "dung-han" | "tre-nhe" | "tre-nang";
export const NHAN_LOAI_DUNG_HAN: Record<LoaiDungHan, string> = {
  "khong-han": "Không có hạn",
  "dung-han": "Đúng hạn",
  "tre-nhe": "Trễ nhẹ",
  "tre-nang": "Trễ nặng",
};

/**
 * Hạn cuối cùng của việc = hạn ban đầu, đè bởi lần gia hạn ĐÃ DUYỆT muộn nhất (DG-05). Đề nghị đang
 * chờ hoặc bị từ chối không đổi hạn.
 */
export function hanCuoiCung(
  hanBanDau: Date | null,
  giaHan: { trangThai: string; hanMoi: Date; quyetDinhLuc: Date | null }[],
): Date | null {
  const daDuyet = giaHan
    .filter((g) => g.trangThai === "da-duyet" && g.quyetDinhLuc)
    .sort((a, b) => a.quyetDinhLuc!.getTime() - b.quyetDinhLuc!.getTime());
  return daDuyet.length ? daDuyet[daDuyet.length - 1].hanMoi : hanBanDau;
}

/** Hệ số đúng hạn: so lúc người làm hoàn thành (lần gửi duyệt cuối) với hạn cuối cùng. */
export function heSoDungHan(han: Date | null, xongLuc: Date, ch: CauHinhDungHan = CAU_HINH_DUNG_HAN_MAC_DINH): { heSo: number; loai: LoaiDungHan; treGio: number } {
  if (!han) return { heSo: ch.heSoKhongHan, loai: "khong-han", treGio: 0 };
  const tre = xongLuc.getTime() - han.getTime();
  if (tre <= 0) return { heSo: ch.heSoDungHan, loai: "dung-han", treGio: 0 };
  const treGio = lamTron2(tre / GIO_MS);
  if (tre <= ch.treNheToiDaGio * GIO_MS) return { heSo: ch.heSoTreNhe, loai: "tre-nhe", treGio };
  return { heSo: ch.heSoTreNang, loai: "tre-nang", treGio };
}

/** Điểm việc = độ khó × chất lượng × hệ số đúng hạn (DG-30). */
export function diemViec(doKho: number, chatLuong: number, heSo: number): number {
  if (!Number.isInteger(doKho) || doKho < 1 || doKho > 5) throw new RangeError("Độ khó phải từ 1 đến 5.");
  if (!Number.isInteger(chatLuong) || chatLuong < 1 || chatLuong > 5) throw new RangeError("Chất lượng phải từ 1 đến 5.");
  return lamTron2(doKho * chatLuong * heSo);
}

// ---------------------------------------------------------------------------
// Việc định kỳ (DG-07)
// ---------------------------------------------------------------------------

export const TAN_SUAT = ["ngay", "tuan", "thang"] as const;
export type TanSuat = (typeof TAN_SUAT)[number];
export const NHAN_TAN_SUAT: Record<TanSuat, string> = { ngay: "Hằng ngày", tuan: "Hằng tuần", thang: "Hằng tháng" };
export const NHAN_THU: Record<number, string> = { 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 7: "CN" };

export interface LichLap {
  tanSuat: TanSuat;
  /** 1 = thứ Hai … 7 = Chủ nhật. */
  thu: number[];
  ngayThang: number | null;
  tuNgay: string;
  denNgay: string | null;
}

function soNgayCuaThang(ngay: string): number {
  const [n, t] = ngay.split("-").map(Number);
  return new Date(Date.UTC(n, t, 0)).getUTCDate();
}

/** Ngày `ngay` (yyyy-mm-dd, lịch VN) có phải một lần lặp không. Tháng ngắn hơn ngày khai → ngày cuối tháng. */
export function laNgayLap(l: LichLap, ngay: string): boolean {
  if (!laNgayHopLe(ngay) || ngay < l.tuNgay || (l.denNgay && ngay > l.denNgay)) return false;
  if (l.tanSuat === "ngay") return true;
  if (l.tanSuat === "tuan") return l.thu.includes(thuTrongTuan(ngay) + 1);
  const d = Number(ngay.slice(8, 10));
  const dich = Math.min(l.ngayThang ?? 1, soNgayCuaThang(ngay));
  return d === dich;
}

/** Mọi ngày lặp trong [tu, den] (trần 400 ngày như `cacNgayTrongKhoang`). */
export function cacNgayLap(l: LichLap, tu: string, den: string): string[] {
  return cacNgayTrongKhoang(tu, den).filter((n) => laNgayLap(l, n));
}

/** Hạn của việc sinh cho ngày lặp: phút trong ngày VN. */
export function hanViecLap(ngay: string, phut: number): Date {
  return mocVN(ngay, phut);
}

// ---------------------------------------------------------------------------
// Báo cáo ngày / tuần (DG-40 → DG-43)
// ---------------------------------------------------------------------------

export const LOAI_BAO_CAO = ["ngay", "tuan"] as const;
export type LoaiBaoCao = (typeof LOAI_BAO_CAO)[number];
export const NHAN_LOAI_BAO_CAO: Record<LoaiBaoCao, string> = { ngay: "Báo cáo ngày", tuan: "Báo cáo tuần" };

/** Thứ Hai của tuần chứa `ngay`. */
export function dauTuan(ngay: string): string {
  return congNgay(ngay, -thuTrongTuan(ngay));
}

export interface CauHinhBaoCao {
  hanTuanThu: number;
  hanTuanGio: number;
  hanNgayGio: number;
  nhacTruocGio: number;
}
export const CAU_HINH_BAO_CAO_MAC_DINH: CauHinhBaoCao = { hanTuanThu: 5, hanTuanGio: 17, hanNgayGio: 20, nhacTruocGio: 2 };

/** Kỳ báo cáo chứa ngày `ngay`: tuần (thứ Hai → Chủ nhật) hoặc chính ngày đó. */
export function kyBaoCao(loai: LoaiBaoCao, ngay: string): { tu: string; den: string } {
  if (loai === "ngay") return { tu: ngay, den: ngay };
  const tu = dauTuan(ngay);
  return { tu, den: congNgay(tu, 6) };
}

/** Hạn nộp: tuần → thứ `hanTuanThu` lúc `hanTuanGio`:00 giờ VN của tuần đó; ngày → `hanNgayGio`:00 cùng ngày. */
export function hanBaoCao(loai: LoaiBaoCao, tuNgay: string, ch: CauHinhBaoCao = CAU_HINH_BAO_CAO_MAC_DINH): Date {
  if (loai === "ngay") return mocVN(tuNgay, ch.hanNgayGio * 60);
  return mocVN(congNgay(dauTuan(tuNgay), ch.hanTuanThu - 1), ch.hanTuanGio * 60);
}

/** Đã tới lúc nhắc (còn ≤ `nhacTruocGio` tới hạn, chưa quá hạn). */
export function denLucNhac(han: Date, bayGio: Date, nhacTruocGio: number): boolean {
  return bayGio.getTime() < han.getTime() && han.getTime() - bayGio.getTime() <= nhacTruocGio * GIO_MS;
}

/** Tình trạng một kỳ báo cáo: nộp đúng hạn / nộp trễ / chưa nộp (còn hạn) / thiếu (quá hạn chưa nộp). */
export function tinhTrangBaoCao(han: Date, nopLuc: Date | null, bayGio: Date): "dung-han" | "tre" | "chua-nop" | "thieu" {
  if (nopLuc) return nopLuc.getTime() <= han.getTime() ? "dung-han" : "tre";
  return bayGio.getTime() <= han.getTime() ? "chua-nop" : "thieu";
}

// ---------------------------------------------------------------------------
// Kỳ đánh giá (DG-60) — ranh giới theo giờ Việt Nam
// ---------------------------------------------------------------------------

export const LOAI_KY = ["thang", "quy"] as const;
export type LoaiKy = (typeof LOAI_KY)[number];

export interface KyDanhGia {
  tu: string;
  den: string;
  /** 00:00 giờ VN ngày đầu kỳ (UTC). */
  batDau: Date;
  /** 00:00 giờ VN ngày SAU ngày cuối kỳ (UTC) — mốc mở. */
  ketThuc: Date;
  nhan: string;
}

export function kyDanhGia(loai: LoaiKy, nam: number, so: number): KyDanhGia {
  if (!Number.isInteger(nam) || nam < 2000 || nam > 2100) throw new RangeError("Năm không hợp lệ.");
  const thangDau = loai === "thang" ? so : (so - 1) * 3 + 1;
  if (loai === "thang" ? so < 1 || so > 12 : so < 1 || so > 4) throw new RangeError("Số kỳ không hợp lệ.");
  const thangCuoi = loai === "thang" ? thangDau : thangDau + 2;
  const tu = `${nam}-${String(thangDau).padStart(2, "0")}-01`;
  const den = `${nam}-${String(thangCuoi).padStart(2, "0")}-${String(new Date(Date.UTC(nam, thangCuoi, 0)).getUTCDate()).padStart(2, "0")}`;
  return {
    tu,
    den,
    batDau: mocVN(tu, 0),
    ketThuc: mocVN(congNgay(den, 1), 0),
    nhan: loai === "thang" ? `Tháng ${so}/${nam}` : `Quý ${so}/${nam}`,
  };
}

/** Các tháng (năm, tháng) thuộc một kỳ — để ghép bảng công tháng của 0.19.0. */
export function cacThangCuaKy(loai: LoaiKy, nam: number, so: number): { nam: number; thang: number }[] {
  if (loai === "thang") return [{ nam, thang: so }];
  return [0, 1, 2].map((i) => ({ nam, thang: (so - 1) * 3 + 1 + i }));
}

// ---------------------------------------------------------------------------
// KPI (DG-50 → DG-55)
// ---------------------------------------------------------------------------

export const CHI_SO = {
  "doanh-thu-da-thu": { ten: "Doanh số đã thu tiền (đơn mình phụ trách)", donVi: "đ", chieu: "cao-tot" },
  "lead-xu-ly": { ten: "Số lead đã xử lý", donVi: "lead", chieu: "cao-tot" },
  "ty-le-chuyen-doi": { ten: "Tỷ lệ chuyển đổi lead", donVi: "%", chieu: "cao-tot" },
  "cong-no-qua-han": { ten: "Công nợ quá hạn của khách mình phụ trách", donVi: "đ", chieu: "thap-tot" },
  "phieu-ho-tro-xong": { ten: "Số phiếu hỗ trợ xử lý xong", donVi: "phiếu", chieu: "cao-tot" },
  "ty-le-dung-sla": { ten: "Tỷ lệ phiếu xong trong hạn SLA", donVi: "%", chieu: "cao-tot" },
  "phieu-mo-lai": { ten: "Số phiếu hỗ trợ bị mở lại", donVi: "phiếu", chieu: "thap-tot" },
  "lead-marketing": { ten: "Số lead từ chiến dịch mình phụ trách", donVi: "lead", chieu: "cao-tot" },
  "tong-diem-viec": { ten: "Tổng điểm công việc được duyệt", donVi: "điểm", chieu: "cao-tot" },
  "ty-le-tra-lai": { ten: "Tỷ lệ việc bị trả lại", donVi: "%", chieu: "thap-tot" },
  "ty-le-dung-han": { ten: "Tỷ lệ việc xong đúng hạn", donVi: "%", chieu: "cao-tot" },
} as const;
export type MaChiSo = keyof typeof CHI_SO;
export const MA_CHI_SO = Object.keys(CHI_SO) as MaChiSo[];

export const CHIEU_KPI = ["cao-tot", "thap-tot"] as const;
export type ChieuKpi = (typeof CHIEU_KPI)[number];

/** a / b × 100, hoặc null khi mẫu bằng 0 (không có dữ liệu để xét). */
export function tyLe(tu: number, mau: number): number | null {
  if (mau <= 0) return null;
  return lamTron2((tu / mau) * 100);
}

/**
 * % đạt của một chỉ tiêu tự tính, đã chặn trần (DG-53).
 *  - Cao là tốt: thực tế / mục tiêu.
 *  - Thấp là tốt (công nợ quá hạn, phiếu mở lại, tỷ lệ trả lại): ≤ mục tiêu → 100; vượt → mục tiêu / thực tế
 *    (mục tiêu 0 mà có phát sinh → 0).
 * Không có mục tiêu hoặc không có số liệu → null (chỉ tiêu không tính được, quản lý chấm tay).
 */
export function phanTramDat(thucTe: number | null, mucTieu: number | null, chieu: ChieuKpi, tranPhanTram = 120): number | null {
  if (thucTe === null || mucTieu === null || !Number.isFinite(thucTe) || !Number.isFinite(mucTieu) || mucTieu < 0) return null;
  let p: number;
  if (chieu === "cao-tot") {
    if (mucTieu === 0) return null;
    p = (thucTe / mucTieu) * 100;
  } else if (thucTe <= mucTieu) {
    p = 100;
  } else {
    p = mucTieu === 0 ? 0 : (mucTieu / thucTe) * 100;
  }
  return lamTron2(Math.max(0, Math.min(p, tranPhanTram)));
}

export interface ChiTieuCham {
  trongSo: number;
  /** Điểm (% đạt) đã quyết: chỉ tiêu tự tính lấy % đạt (quản lý có thể đè), chỉ tiêu tay lấy điểm quản lý. */
  diem: number | null;
}

/** Điểm tổng (thang 100, có thể vượt tới trần) = Σ trọng số × điểm / Σ trọng số. Chỉ tiêu chưa có điểm → báo thiếu. */
export function tongDiemKpi(ds: ChiTieuCham[]): { tong: number | null; thieu: number } {
  const thieu = ds.filter((c) => c.diem === null).length;
  const tongTrongSo = ds.reduce((s, c) => s + c.trongSo, 0);
  if (ds.length === 0 || tongTrongSo <= 0 || thieu > 0) return { tong: null, thieu };
  return { tong: lamTron2(ds.reduce((s, c) => s + c.trongSo * (c.diem ?? 0), 0) / tongTrongSo), thieu };
}

export interface BangXepLoai {
  nguongA: number;
  nguongB: number;
  nguongC: number;
  heSoA: number;
  heSoB: number;
  heSoC: number;
  heSoD: number;
}
export const BANG_XEP_LOAI_MAC_DINH: BangXepLoai = { nguongA: 90, nguongB: 75, nguongC: 60, heSoA: 1.2, heSoB: 1, heSoC: 0.8, heSoD: 0 };

export type XepLoai = "A" | "B" | "C" | "D";
export function xepLoai(tong: number, b: BangXepLoai = BANG_XEP_LOAI_MAC_DINH): { loai: XepLoai; heSoThuong: number } {
  if (tong >= b.nguongA) return { loai: "A", heSoThuong: b.heSoA };
  if (tong >= b.nguongB) return { loai: "B", heSoThuong: b.heSoB };
  if (tong >= b.nguongC) return { loai: "C", heSoThuong: b.heSoC };
  return { loai: "D", heSoThuong: b.heSoD };
}

/** Bảng xếp loại hợp lệ khi ngưỡng giảm dần A > B > C (Cấu hình đặt sai thì không chốt được). */
export function bangXepLoaiHopLe(b: BangXepLoai): boolean {
  return b.nguongA > b.nguongB && b.nguongB > b.nguongC;
}

/** Chọn bộ KPI cho một người: khớp chức danh (không phân biệt hoa thường) → khớp mã vai trò → bộ mặc định. */
export function chonBoKpi<T extends { chucDanh: string | null; maVaiTro: string | null }>(
  bo: T[],
  nguoi: { chucDanh: string | null; maVaiTro: string[] },
): T | null {
  const cd = (nguoi.chucDanh ?? "").trim().toLowerCase();
  if (cd) {
    const k = bo.find((b) => b.chucDanh && b.chucDanh.trim().toLowerCase() === cd);
    if (k) return k;
  }
  const v = bo.find((b) => b.maVaiTro && nguoi.maVaiTro.includes(b.maVaiTro));
  if (v) return v;
  return bo.find((b) => !b.chucDanh && !b.maVaiTro) ?? null;
}

// ---------------------------------------------------------------------------
// Phiếu đánh giá thực tập theo mẫu (DG-72 → DG-75)
// ---------------------------------------------------------------------------

export const NGUON_THONG_TIN = [
  "ho-ten", "mssv", "truong", "khoa", "giang-vien", "nguoi-huong-dan", "tu-ngay", "den-ngay", "phong-ban", "chuc-danh", "tu-nhap",
] as const;
export const NHAN_NGUON_THONG_TIN: Record<string, string> = {
  "ho-ten": "Họ tên sinh viên",
  mssv: "Mã số sinh viên",
  truong: "Trường",
  khoa: "Khoa",
  "giang-vien": "Giảng viên hướng dẫn",
  "nguoi-huong-dan": "Người hướng dẫn tại công ty",
  "tu-ngay": "Thực tập từ ngày",
  "den-ngay": "Thực tập đến ngày",
  "phong-ban": "Phòng ban",
  "chuc-danh": "Vị trí thực tập",
  "tu-nhap": "Nhập tay",
};
export const NGUON_TU_DONG = ["chuyen-can", "ty-le-viec-dat", "chat-luong-viec"] as const;
export type NguonTuDong = (typeof NGUON_TU_DONG)[number];
export const NHAN_NGUON_TU_DONG: Record<NguonTuDong, string> = {
  "chuyen-can": "Tỷ lệ chuyên cần (chấm công)",
  "ty-le-viec-dat": "Tỷ lệ việc được duyệt / đánh giá Đạt",
  "chat-luong-viec": "Chất lượng việc trung bình (1–5)",
};

const ma = z.string().trim().regex(/^[a-z0-9-]{1,30}$/, "Mã chỉ gồm chữ thường không dấu, số, gạch ngang (≤ 30).");
export const LuocDoMauPhieu = z.object({
  quocHieu: z.boolean().default(true),
  tenDonVi: z.string().trim().max(255).default(""),
  tieuDe: z.string().trim().min(3).max(255),
  tieuDePhu: z.string().trim().max(500).default(""),
  thongTin: z
    .array(z.object({ ma, nhan: z.string().trim().min(1).max(120), nguon: z.enum(NGUON_THONG_TIN) }))
    .max(30)
    .default([]),
  phan: z
    .array(
      z.object({
        ten: z.string().trim().min(1).max(255),
        tieuChi: z
          .array(
            z.object({
              ma,
              ten: z.string().trim().min(2).max(500),
              trongSo: z.number().positive().max(100),
              thang: z.enum(["10", "chu"]),
              nguon: z.enum(NGUON_TU_DONG).nullable().default(null),
              moTa: z.string().trim().max(500).default(""),
            }),
          )
          .min(1)
          .max(40),
      }),
    )
    .min(1)
    .max(10),
  /** Thang chữ: điểm quy đổi khi chấm bằng chữ, và ngưỡng (thang 10) để quy điểm tổng ra chữ. Giảm dần. */
  thangChu: z
    .array(z.object({ chu: z.string().trim().min(1).max(3), diem: z.number().min(0).max(10), tu: z.number().min(0).max(10) }))
    .min(2)
    .max(12)
    .default([
      { chu: "A", diem: 9.5, tu: 8.5 },
      { chu: "B", diem: 7.5, tu: 7 },
      { chu: "C", diem: 6, tu: 5.5 },
      { chu: "D", diem: 4.5, tu: 4 },
      { chu: "F", diem: 2, tu: 0 },
    ]),
  oNhanXet: z.array(z.object({ ma, nhan: z.string().trim().min(1).max(255) })).max(10).default([]),
  oKy: z.array(z.object({ ma, nhan: z.string().trim().min(1).max(255), ghiChu: z.string().trim().max(255).default("") })).max(6).default([]),
  ghiChu: z.string().trim().max(2000).default(""),
  /** Hiện điểm tổng bằng chữ cạnh điểm số. */
  hienChu: z.boolean().default(true),
});
export type MauPhieu = z.infer<typeof LuocDoMauPhieu>;

/** Kiểm thêm phần Zod không nói được: mã duy nhất, thang chữ giảm dần. Trả danh sách lỗi (rỗng = hợp lệ). */
export function kiemTraMauPhieu(m: MauPhieu): string[] {
  const loi: string[] = [];
  const maTc = m.phan.flatMap((p) => p.tieuChi.map((t) => t.ma));
  if (new Set(maTc).size !== maTc.length) loi.push("Mã tiêu chí bị trùng.");
  const maTt = m.thongTin.map((t) => t.ma);
  if (new Set(maTt).size !== maTt.length) loi.push("Mã ô thông tin bị trùng.");
  const maNx = m.oNhanXet.map((t) => t.ma);
  if (new Set(maNx).size !== maNx.length) loi.push("Mã ô nhận xét bị trùng.");
  const chu = m.thangChu.map((c) => c.chu);
  if (new Set(chu).size !== chu.length) loi.push("Thang chữ có chữ bị trùng.");
  for (let i = 1; i < m.thangChu.length; i++) {
    if (!(m.thangChu[i].tu < m.thangChu[i - 1].tu)) loi.push("Thang chữ phải xếp từ cao xuống thấp (ngưỡng giảm dần).");
  }
  return [...new Set(loi)];
}

/** Đổi điểm thang 10 ra chữ theo ngưỡng của mẫu. */
export function diemRaChu(diem: number, thang: MauPhieu["thangChu"]): string {
  for (const c of thang) if (diem >= c.tu) return c.chu;
  return thang[thang.length - 1].chu;
}

/** Giá trị tự động (đã có) → điểm thang 10. Chuyên cần / tỷ lệ: % ÷ 10; chất lượng 1–5: × 2. */
export function giaTriTuDongRaDiem(nguon: NguonTuDong, giaTri: number | null): number | null {
  if (giaTri === null || !Number.isFinite(giaTri)) return null;
  const d = nguon === "chat-luong-viec" ? giaTri * 2 : giaTri / 10;
  return lamTron2(Math.max(0, Math.min(10, d)));
}

export interface KetQuaPhieu {
  tong: number | null;
  chu: string | null;
  thieu: string[];
  chiTiet: { ma: string; ten: string; trongSo: number; nhap: string | number | null; diem10: number | null; tuDong: boolean }[];
}

/**
 * Chấm phiếu thực tập: mỗi tiêu chí lấy điểm người hướng dẫn nhập (thang 10: số 0–10; thang chữ: một chữ
 * trong thang của mẫu); để trống mà tiêu chí có nguồn tự động → lấy giá trị tự động. Điểm tổng = trung
 * bình có trọng số trên thang 10, làm tròn 2 chữ số; quy ra chữ theo ngưỡng của mẫu. Còn tiêu chí chưa có
 * điểm → tổng null và liệt kê tiêu chí thiếu.
 */
export function tinhPhieuThucTap(mau: MauPhieu, diemNhap: Record<string, string | number | null | undefined>, tuDong: Partial<Record<NguonTuDong, number | null>>): KetQuaPhieu {
  const chiTiet: KetQuaPhieu["chiTiet"] = [];
  const thieu: string[] = [];
  for (const p of mau.phan) {
    for (const t of p.tieuChi) {
      const nhap = diemNhap[t.ma];
      let diem10: number | null = null;
      let laTuDong = false;
      if (nhap !== null && nhap !== undefined && nhap !== "") {
        if (t.thang === "10") {
          const so = typeof nhap === "number" ? nhap : Number(String(nhap).replace(",", "."));
          if (!Number.isFinite(so) || so < 0 || so > 10) throw new RangeError(`Điểm tiêu chí “${t.ten}” phải từ 0 đến 10.`);
          diem10 = lamTron2(so);
        } else {
          const c = mau.thangChu.find((x) => x.chu === String(nhap).trim());
          if (!c) throw new RangeError(`Tiêu chí “${t.ten}” chấm bằng chữ: chọn một trong ${mau.thangChu.map((x) => x.chu).join(", ")}.`);
          diem10 = c.diem;
        }
      } else if (t.nguon) {
        const tdDiem = giaTriTuDongRaDiem(t.nguon, tuDong[t.nguon] ?? null);
        if (tdDiem !== null) {
          diem10 = t.thang === "chu" ? (mau.thangChu.find((x) => x.chu === diemRaChu(tdDiem, mau.thangChu))?.diem ?? tdDiem) : tdDiem;
          laTuDong = true;
        }
      }
      if (diem10 === null) thieu.push(t.ten);
      chiTiet.push({ ma: t.ma, ten: t.ten, trongSo: t.trongSo, nhap: nhap ?? null, diem10, tuDong: laTuDong });
    }
  }
  if (thieu.length) return { tong: null, chu: null, thieu, chiTiet };
  const tongTs = chiTiet.reduce((s, c) => s + c.trongSo, 0);
  const tong = lamTron2(chiTiet.reduce((s, c) => s + c.trongSo * (c.diem10 ?? 0), 0) / tongTs);
  return { tong, chu: diemRaChu(tong, mau.thangChu), thieu, chiTiet };
}

/** Mẫu phiếu chung dựng sẵn (DG-72). Chủ doanh nghiệp gửi mẫu của trường thì Nhân sự cấu hình lại, không sửa mã. */
export const MAU_PHIEU_MAC_DINH: MauPhieu = LuocDoMauPhieu.parse({
  quocHieu: true,
  tenDonVi: "",
  tieuDe: "PHIẾU NHẬN XÉT VÀ ĐÁNH GIÁ KẾT QUẢ THỰC TẬP",
  tieuDePhu: "(Dùng cho đơn vị tiếp nhận sinh viên thực tập)",
  thongTin: [
    { ma: "ho-ten", nhan: "Họ và tên sinh viên", nguon: "ho-ten" },
    { ma: "mssv", nhan: "Mã số sinh viên", nguon: "mssv" },
    { ma: "truong", nhan: "Trường", nguon: "truong" },
    { ma: "khoa", nhan: "Khoa", nguon: "khoa" },
    { ma: "giang-vien", nhan: "Giảng viên hướng dẫn", nguon: "giang-vien" },
    { ma: "nguoi-huong-dan", nhan: "Người hướng dẫn tại đơn vị", nguon: "nguoi-huong-dan" },
    { ma: "tu-ngay", nhan: "Thời gian thực tập từ", nguon: "tu-ngay" },
    { ma: "den-ngay", nhan: "đến", nguon: "den-ngay" },
    { ma: "de-tai", nhan: "Đề tài / nội dung thực tập", nguon: "tu-nhap" },
  ],
  phan: [
    {
      ten: "I. Ý thức, thái độ",
      tieuChi: [
        { ma: "ky-luat", ten: "Ý thức kỷ luật, chấp hành nội quy, chuyên cần", trongSo: 20, thang: "10", nguon: "chuyen-can" },
        { ma: "thai-do", ten: "Thái độ học hỏi, tinh thần trách nhiệm", trongSo: 15, thang: "10" },
      ],
    },
    {
      ten: "II. Kiến thức và kỹ năng",
      tieuChi: [
        { ma: "chuyen-mon", ten: "Kiến thức chuyên môn vận dụng vào công việc", trongSo: 20, thang: "10" },
        { ma: "ky-nang-mem", ten: "Kỹ năng mềm: giao tiếp, làm việc nhóm", trongSo: 15, thang: "10" },
      ],
    },
    {
      ten: "III. Kết quả công việc",
      tieuChi: [
        { ma: "ket-qua", ten: "Mức độ hoàn thành công việc được giao", trongSo: 30, thang: "10", nguon: "ty-le-viec-dat" },
      ],
    },
  ],
  oNhanXet: [
    { ma: "uu-diem", nhan: "Ưu điểm" },
    { ma: "han-che", nhan: "Hạn chế, cần cố gắng" },
    { ma: "de-nghi", nhan: "Đề nghị của đơn vị" },
  ],
  oKy: [
    { ma: "huong-dan", nhan: "NGƯỜI HƯỚNG DẪN", ghiChu: "(Ký, ghi rõ họ tên)" },
    { ma: "dai-dien", nhan: "ĐẠI DIỆN ĐƠN VỊ", ghiChu: "(Ký tên, đóng dấu)" },
  ],
  ghiChu: "Điểm chấm theo thang 10, làm tròn 2 chữ số. Điểm tổng là trung bình có trọng số của các tiêu chí.",
  hienChu: true,
});
