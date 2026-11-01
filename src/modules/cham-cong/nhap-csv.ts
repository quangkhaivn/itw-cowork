/**
 * Nhập lần chấm từ tệp CSV (đường dự phòng khi máy không đẩy được qua ADMS — NS-16). Phần THUẦN.
 *
 * Phần mềm đi kèm máy chấm công thường xuất Excel; người dùng "Lưu thành → CSV UTF-8" rồi tải lên
 * (không đọc thẳng .xlsx — QĐ trong ARCHITECTURE mục 9). Nhận hai kiểu cột:
 *   - một cột thời gian: `Mã chấm công` + `Thời gian` (vd "2026-11-03 08:01:22" hoặc "03/11/2026 08:01");
 *   - hai cột: `Mã chấm công` + `Ngày` + `Giờ`.
 * Giờ trong tệp là giờ Việt Nam.
 */

import { docBangCsv } from "@/lib/csv";
import { gioMayVeUtc } from "./adms";

export interface DongCsvChamCong {
  soDong: number;
  pin: string;
  luc: Date;
}

export const SO_DONG_CSV_TOI_DA = 20_000;

const COT = [
  { truong: "pin", ten: ["Mã chấm công", "Ma cham cong", "PIN", "AC-No.", "AC No", "Mã máy", "User ID", "Enroll Number"], batBuoc: true },
  { truong: "thoiGian", ten: ["Thời gian", "Ngày giờ", "Datetime", "Date Time", "Check Time", "Time Stamp"] },
  { truong: "ngay", ten: ["Ngày", "Date"] },
  { truong: "gio", ten: ["Giờ", "Time", "Giờ chấm"] },
];

/** "03/11/2026 08:01[:22]" hoặc "2026-11-03 08:01[:22]" → chuẩn "yyyy-mm-dd hh:mm:ss". */
export function chuanHoaThoiGian(ngay: string, gio?: string): string | null {
  const s = (gio !== undefined ? `${ngay.trim()} ${gio.trim()}` : ngay.trim()).replace(/\s+/g, " ");
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")} ${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")} ${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}`;
  return null;
}

export function phanTichCsvChamCong(noiDung: string): {
  dong: DongCsvChamCong[];
  loi: { soDong: number; lyDo: string }[];
  thieuCot: string[];
} {
  const bang = docBangCsv(noiDung, COT);
  const loi: { soDong: number; lyDo: string }[] = [];
  const dong: DongCsvChamCong[] = [];
  const coThoiGian = bang.dong.some((d) => d.duLieu.thoiGian !== undefined);
  const coNgayGio = bang.dong.some((d) => d.duLieu.ngay !== undefined && d.duLieu.gio !== undefined);
  const thieuCot = [...bang.thieuCot];
  if (bang.dong.length > 0 && !coThoiGian && !coNgayGio) thieuCot.push("Thời gian (hoặc Ngày + Giờ)");
  if (thieuCot.length) return { dong, loi, thieuCot };
  if (bang.dong.length > SO_DONG_CSV_TOI_DA) {
    return { dong, loi: [{ soDong: 0, lyDo: `Tệp quá ${SO_DONG_CSV_TOI_DA.toLocaleString("vi-VN")} dòng — chia nhỏ theo tháng.` }], thieuCot };
  }
  for (const { soDong, duLieu } of bang.dong) {
    const pin = (duLieu.pin ?? "").trim();
    if (!/^[0-9A-Za-z]{1,20}$/.test(pin)) {
      loi.push({ soDong, lyDo: "Mã chấm công trống hoặc có ký tự lạ." });
      continue;
    }
    const chuan = duLieu.thoiGian ? chuanHoaThoiGian(duLieu.thoiGian) : chuanHoaThoiGian(duLieu.ngay ?? "", duLieu.gio ?? "");
    const luc = chuan ? gioMayVeUtc(chuan) : null;
    if (!luc) {
      loi.push({ soDong, lyDo: "Thời gian không đọc được (dd/mm/yyyy hh:mm hoặc yyyy-mm-dd hh:mm:ss)." });
      continue;
    }
    dong.push({ soDong, pin, luc });
  }
  return { dong, loi, thieuCot };
}
