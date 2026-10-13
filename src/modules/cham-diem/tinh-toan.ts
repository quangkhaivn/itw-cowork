/**
 * Chấm điểm khách tiềm năng — phần THUẦN (BUSINESS_RULES.md mục 21, KHN-08).
 *
 * Điểm 0–100 cộng từ các tín hiệu CÓ THẬT trong Cowork: nguồn khách, tương tác gần đây,
 * gặp mặt, im lặng lâu, cơ hội đang mở, báo giá đã gửi, đã từng mua, đủ thông tin liên hệ.
 * Không dùng giá vốn, không gọi AI. Trọng số đọc từ Cấu hình (`diem_khach.*`); hạng
 * Nóng/Ấm chỉ có khi Giám đốc đã đặt cả hai ngưỡng.
 */

export interface CauHinhDiem {
  soNgayTuongTac: number;
  diemMoiTuongTac: number;
  tuongTacToiDa: number;
  diemMoiLanGap: number;
  gapToiDa: number;
  soNgayImLang: number;
  diemTruImLang: number;
  diemCoHoiMo: number;
  diemBaoGia: number;
  soNgayBaoGia: number;
  diemDaMua: number;
  diemDuLienHe: number;
  nguongNong: number | null;
  nguongAm: number | null;
  /** Mã nguồn (dữ liệu gốc `nguon_lead`) → điểm. Nguồn không có trong bảng = 0 điểm. */
  diemNguon: Record<string, number>;
}

export interface DuKienDiem {
  bayGio: Date;
  taoLuc: Date;
  /** customers.status */
  trangThai: string;
  /** Loại trạng thái hành trình hiện tại (mo / thanh-cong / that-bai) hoặc null. */
  loaiHanhTrinh: string | null;
  tenHanhTrinh: string | null;
  nguon: string | null;
  tenNguon: string | null;
  soTuongTac: number;
  soGap: number;
  tuongTacGanNhat: Date | null;
  soCoHoiMo: number;
  soBaoGiaGanDay: number;
  daMua: boolean;
  duLienHe: boolean;
}

export interface PhanDiem {
  nhan: string;
  diem: number;
}

export type HangDiem = "nong" | "am" | "lanh";
export const NHAN_HANG: Record<HangDiem, string> = { nong: "Nóng", am: "Ấm", lanh: "Lạnh" };

export interface KetQuaDiem {
  diem: number | null;
  phan: PhanDiem[];
}

const NGAY = 86_400_000;

/** Khách không chấm điểm: đã gộp, ngừng giao dịch. */
export function khongChamDiem(trangThai: string): boolean {
  return trangThai === "da-gop" || trangThai === "ngung-giao-dich";
}

export function chamDiem(f: DuKienDiem, c: CauHinhDiem): KetQuaDiem {
  if (khongChamDiem(f.trangThai)) {
    return { diem: null, phan: [{ nhan: f.trangThai === "da-gop" ? "Khách đã gộp — không chấm điểm" : "Khách ngừng giao dịch — không chấm điểm", diem: 0 }] };
  }
  if (f.loaiHanhTrinh === "that-bai") {
    return { diem: 0, phan: [{ nhan: `Đang ở trạng thái thất bại "${f.tenHanhTrinh ?? ""}" — điểm 0`, diem: 0 }] };
  }
  const phan: PhanDiem[] = [];
  const them = (nhan: string, diem: number) => {
    if (diem) phan.push({ nhan, diem });
  };

  if (f.nguon) {
    const d = c.diemNguon[f.nguon] ?? 0;
    phan.push({ nhan: d ? `Nguồn: ${f.tenNguon ?? f.nguon}` : `Nguồn: ${f.tenNguon ?? f.nguon} (chưa đặt điểm cho nguồn này)`, diem: d });
  }
  them(`Tương tác ${c.soNgayTuongTac} ngày qua: ${f.soTuongTac} lần`, Math.min(c.tuongTacToiDa, f.soTuongTac * c.diemMoiTuongTac));
  them(`Gặp mặt / đến tận nơi ${c.soNgayTuongTac} ngày qua: ${f.soGap} lần`, Math.min(c.gapToiDa, f.soGap * c.diemMoiLanGap));

  const moc = f.tuongTacGanNhat ?? f.taoLuc;
  const imLang = Math.floor((f.bayGio.getTime() - moc.getTime()) / NGAY);
  if (imLang >= c.soNgayImLang && c.diemTruImLang > 0) {
    them(f.tuongTacGanNhat ? `Không tương tác ${imLang} ngày (≥ ${c.soNgayImLang})` : `Chưa từng tương tác, đã ${imLang} ngày`, -c.diemTruImLang);
  }
  if (f.soCoHoiMo > 0) them(`Có ${f.soCoHoiMo} cơ hội đang mở`, c.diemCoHoiMo);
  if (f.soBaoGiaGanDay > 0) them(`Báo giá đã gửi trong ${c.soNgayBaoGia} ngày qua`, c.diemBaoGia);
  if (f.daMua) them("Đã từng có đơn hàng xác nhận", c.diemDaMua);
  if (f.duLienHe) them("Có điện thoại hoặc email liên lạc được", c.diemDuLienHe);

  const tong = phan.reduce((s, p) => s + p.diem, 0);
  return { diem: Math.max(0, Math.min(100, Math.round(tong))), phan };
}

/**
 * Hạng theo ngưỡng. Thiếu một trong hai ngưỡng, hoặc ngưỡng Ấm không nhỏ hơn ngưỡng Nóng →
 * `null` (không xếp hạng) — không tự chọn ngưỡng thay Giám đốc.
 */
export function hangDiem(diem: number | null, nguongNong: number | null, nguongAm: number | null): HangDiem | null {
  if (diem === null || nguongNong === null || nguongAm === null || nguongAm >= nguongNong) return null;
  if (diem >= nguongNong) return "nong";
  if (diem >= nguongAm) return "am";
  return "lanh";
}

/** Bảng điểm nguồn lưu trong `tenant_settings` — kiểm lại khi đọc, sai thì bỏ mục sai. */
export function chuanHoaDiemNguon(x: unknown): Record<string, number> {
  const kq: Record<string, number> = {};
  if (!x || typeof x !== "object" || Array.isArray(x)) return kq;
  for (const [k, v] of Object.entries(x as Record<string, unknown>).slice(0, 200)) {
    if (!/^[a-z0-9_-]{1,50}$/i.test(k) || k === "__proto__") continue;
    if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100) kq[k] = v;
  }
  return kq;
}
