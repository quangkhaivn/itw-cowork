import type { TrangThaiBai, TrangThaiKenhBai } from "./hang-so";

/**
 * Lịch nội dung (0.25.0, QĐ-230) — phần THUẦN, dùng chung máy chủ + trình duyệt. Giờ lưu UTC; hiển thị và chia ngày theo
 * GIỜ VIỆT NAM (+07:00, không có giờ mùa hè). Tuần bắt đầu thứ Hai.
 */

const LECH_VN_MS = 7 * 3_600_000;
const NGAY_MS = 86_400_000;

/** "YYYY-MM-DD" theo giờ Việt Nam. */
export function ngayVN(d: Date): string {
  return new Date(d.getTime() + LECH_VN_MS).toISOString().slice(0, 10);
}

/** "HH:mm" theo giờ Việt Nam. */
export function gioVN(d: Date): string {
  return new Date(d.getTime() + LECH_VN_MS).toISOString().slice(11, 16);
}

/** 00:00 giờ Việt Nam của ngày "YYYY-MM-DD" → mốc UTC. Sai dạng → null. */
export function dauNgayVN(ngay: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ngay)) return null;
  const d = new Date(`${ngay}T00:00:00+07:00`);
  return Number.isNaN(d.getTime()) || ngayVN(d) !== ngay ? null : d;
}

function congNgay(ngay: string, n: number): string {
  const d = new Date(`${ngay}T00:00:00Z`);
  return new Date(d.getTime() + n * NGAY_MS).toISOString().slice(0, 10);
}

/** Thứ trong tuần theo giờ VN: 0 = thứ Hai … 6 = Chủ nhật. */
export function thuTrongTuan(ngay: string): number {
  return (new Date(`${ngay}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export interface KhungLich {
  kieu: "thang" | "tuan";
  /** Mốc UTC bắt đầu / kết thúc (nửa mở [tu, den)). */
  tu: Date;
  den: Date;
  /** Các ngày "YYYY-MM-DD" hiện trên lưới (tháng: đủ tuần thứ Hai → Chủ nhật). */
  ngay: string[];
  /** Tháng đang xem "YYYY-MM" (với kiểu tuần: tháng của thứ Hai). */
  thang: string;
  truoc: string;
  sau: string;
  nhan: string;
}

/** Khung tháng "YYYY-MM": từ thứ Hai của tuần chứa ngày 1 tới hết Chủ nhật của tuần chứa ngày cuối. */
export function khungThang(thang: string): KhungLich | null {
  const m = /^(\d{4})-(\d{2})$/.exec(thang);
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return null;
  const dau = `${thang}-01`;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const cuoi = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const batDau = congNgay(dau, -thuTrongTuan(dau));
  const ketThuc = congNgay(cuoi, 6 - thuTrongTuan(cuoi));
  const ngay: string[] = [];
  for (let d = batDau; d <= ketThuc; d = congNgay(d, 1)) ngay.push(d);
  const thangTruoc = new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
  const thangSau = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
  return { kieu: "thang", tu: dauNgayVN(batDau)!, den: dauNgayVN(congNgay(ketThuc, 1))!, ngay, thang, truoc: thangTruoc, sau: thangSau, nhan: `Tháng ${mo}/${y}` };
}

/** Khung tuần chứa ngày "YYYY-MM-DD" (thứ Hai → Chủ nhật). */
export function khungTuan(ngayBatKy: string): KhungLich | null {
  if (!dauNgayVN(ngayBatKy)) return null;
  const batDau = congNgay(ngayBatKy, -thuTrongTuan(ngayBatKy));
  const ngay = Array.from({ length: 7 }, (_, i) => congNgay(batDau, i));
  const [y, mo, d] = batDau.split("-").map(Number);
  const [y2, mo2, d2] = ngay[6].split("-").map(Number);
  return {
    kieu: "tuan", tu: dauNgayVN(batDau)!, den: dauNgayVN(congNgay(batDau, 7))!, ngay, thang: batDau.slice(0, 7),
    truoc: congNgay(batDau, -7), sau: congNgay(batDau, 7),
    nhan: `Tuần ${d}/${mo}${y !== y2 ? `/${y}` : ""} – ${d2}/${mo2}/${y2}`,
  };
}

/** Ngày bài nằm trên lịch: giờ hẹn (đã xếp lịch / đã đăng) hoặc ngày dự kiến (chưa hẹn giờ). */
export function mocLichCuaBai(b: { scheduledAt: Date | null; plannedAt: Date | null }): Date | null {
  return b.scheduledAt ?? b.plannedAt ?? null;
}

/**
 * Kéo bài sang ngày khác: giữ giờ trong ngày (giờ VN) của mốc cũ; chưa có mốc thì 09:00. `gio` "HH:mm" (tùy chọn) đặt giờ mới.
 */
export function ghepNgayGio(ngayMoi: string, mocCu: Date | null, gio?: string | null): Date | null {
  const hhmm = gio && /^\d{2}:\d{2}$/.test(gio) ? gio : mocCu ? gioVN(mocCu) : "09:00";
  const [h, mi] = hhmm.split(":").map(Number);
  if (h > 23 || mi > 59) return null;
  if (!dauNgayVN(ngayMoi)) return null;
  const d = new Date(`${ngayMoi}T${hhmm}:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Bài đổi lịch được không (QĐ-231). Bài đã vào lượt đăng / đã đăng / lỗi: không — sửa kênh lỗi hoặc tạo bài mới. */
export function doiLichDuoc(trangThai: TrangThaiBai): { duoc: boolean; lyDo: string | null } {
  if (["DRAFT", "PENDING_APPROVAL", "APPROVED", "SCHEDULED", "CANCELED"].includes(trangThai)) return { duoc: true, lyDo: null };
  if (trangThai === "PUBLISHED") return { duoc: false, lyDo: "Bài đã đăng — không đổi lịch được." };
  if (trangThai === "PUBLISHING") return { duoc: false, lyDo: "Bài đang được đăng — không đổi lịch được." };
  return { duoc: false, lyDo: "Bài đã đăng lỗi (một phần hoặc toàn bộ) — sửa / đăng lại từng kênh lỗi ở trang bài, không đổi lịch." };
}

/** Trạng thái hiện trên lịch: như bài, nhưng có kênh "Không rõ – cần kiểm tay" thì nổi lên NEEDS_CHECK. */
export type TrangThaiLich = TrangThaiBai | "NEEDS_CHECK";
export function trangThaiLich(trangThai: TrangThaiBai, kenh: readonly TrangThaiKenhBai[]): TrangThaiLich {
  if (kenh.includes("NEEDS_CHECK") && trangThai !== "PUBLISHING") return "NEEDS_CHECK";
  return trangThai;
}

export const NHAN_TRANG_THAI_LICH: Record<TrangThaiLich, { nhan: string; lop: string }> = {
  DRAFT: { nhan: "Nháp", lop: "" },
  PENDING_APPROVAL: { nhan: "Chờ duyệt", lop: "canh-bao" },
  APPROVED: { nhan: "Đã duyệt", lop: "thong-tin" },
  SCHEDULED: { nhan: "Đã hẹn giờ", lop: "thong-tin" },
  PUBLISHING: { nhan: "Đang đăng", lop: "canh-bao" },
  PUBLISHED: { nhan: "Đã đăng", lop: "tot" },
  PARTIALLY_FAILED: { nhan: "Lỗi một phần", lop: "loi" },
  FAILED: { nhan: "Lỗi", lop: "loi" },
  CANCELED: { nhan: "Đã hủy", lop: "" },
  NEEDS_CHECK: { nhan: "Cần kiểm tay", lop: "canh-bao" },
};

/**
 * Đếm video YouTube theo NGÀY QUOTA (giờ Thái Bình Dương) — dùng để chặn xếp lịch vượt `mxh.youtube_upload_toi_da_ngay`.
 * `ngayQuota` truyền vào (oauth-thuan) để hàm thuần, dễ thử.
 */
export function vuotHanMucNgay(daCo: number, them: number, toiDa: number): boolean {
  return daCo + them > toiDa;
}
