/**
 * Giao thức ZKTeco ADMS / "PUSH SDK" (iclock) — phần THUẦN: đọc yêu cầu của máy, dựng câu trả lời.
 * Không chạm CSDL, không chạm mạng. Kiểm thử: thu/don-vi/cham-cong.test.ts (mẫu lấy theo mô tả giao
 * thức phổ biến của ZKTeco PUSH 2.x / 3.x).
 *
 * ⚠ PHẢI KIỂM LẠI VỚI ĐÚNG MẪU MÁY THẬT (Giám đốc sẽ gửi mẫu máy). Các hãng / đời firmware khác nhau ở
 * chi tiết: tên tham số, có hay không đuôi `.aspx`, khoảng trắng giữa các cột, dòng OPERLOG. Mọi khác
 * biệt phải sửa TẠI ĐÂY (bộ đọc thay được qua `BoDocAdms`), không rải trong route.
 *
 * Luồng chuẩn của máy:
 *  1. `GET /iclock/cdata?SN=<sê-ri>&options=all&pushver=…` — bắt tay; máy đọc các dòng cấu hình trả về.
 *  2. `POST /iclock/cdata?SN=<sê-ri>&table=ATTLOG&Stamp=…` — thân là các dòng chấm công, mỗi dòng
 *     `PIN<TAB>yyyy-mm-dd hh:mm:ss<TAB>trạng thái<TAB>kiểu xác thực<TAB>mã công việc<TAB>…`.
 *     Trả `OK: <số dòng đã nhận>`. Bảng khác (OPERLOG, ATTPHOTO, BIODATA…) chỉ cần trả OK.
 *  3. `GET /iclock/getrequest?SN=…` — máy hỏi lệnh (định kỳ, cũng là "nhịp sống"); không có lệnh → `OK`.
 *  4. `POST /iclock/devicecmd?SN=…` — máy báo kết quả lệnh → `OK`.
 *  Giờ trên máy là GIỜ ĐỊA PHƯƠNG (Việt Nam), không kèm múi giờ.
 */

import { LECH_GIO_VN_PHUT } from "./tinh-toan";

export type DiemCuoiAdms = "cdata" | "getrequest" | "devicecmd" | "khac";

export interface YeuCauAdms {
  diemCuoi: DiemCuoiAdms;
  phuongThuc: string;
  sn: string | null;
  bang: string | null;
  stamp: string | null;
  /** Chuỗi INFO máy gửi kèm getrequest (phiên bản, số người, số bản ghi…). */
  info: string | null;
  /** `options=all` — yêu cầu bắt tay. */
  batTay: boolean;
}

/** Số sê-ri hợp lệ: chữ, số, gạch; 4–64 ký tự (khớp CHECK `attendance_devices_so_seri_check`). */
export function laSoSeriHopLe(sn: string | null | undefined): sn is string {
  return typeof sn === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(sn);
}

/** Đoạn đường dẫn sau `/iclock/` → điểm cuối. Chấp nhận đuôi `.aspx` của firmware cũ, không phân biệt hoa thường. */
export function diemCuoiTuDuongDan(doan: string): DiemCuoiAdms {
  const s = doan.toLowerCase().replace(/\.aspx$/, "").replace(/\/+$/, "");
  return s === "cdata" || s === "getrequest" || s === "devicecmd" ? s : "khac";
}

/** Tham số truy vấn không phân biệt hoa thường (máy gửi `SN`, có đời gửi `sn`). */
function layThamSo(ts: URLSearchParams, ten: string): string | null {
  const thap = ten.toLowerCase();
  for (const [k, v] of ts) if (k.toLowerCase() === thap) return v;
  return null;
}

export function phanTichYeuCau(phuongThuc: string, doan: string, ts: URLSearchParams): YeuCauAdms {
  const diemCuoi = diemCuoiTuDuongDan(doan);
  const sn = layThamSo(ts, "SN")?.trim() ?? null;
  const bang = layThamSo(ts, "table")?.trim().toUpperCase() ?? null;
  const options = layThamSo(ts, "options");
  return {
    diemCuoi,
    phuongThuc: phuongThuc.toUpperCase(),
    sn: sn && sn.length > 0 ? sn : null,
    bang: bang && bang.length > 0 ? bang : null,
    stamp: layThamSo(ts, "Stamp")?.trim().slice(0, 30) || null,
    info: layThamSo(ts, "INFO")?.slice(0, 500) ?? null,
    batTay: diemCuoi === "cdata" && phuongThuc.toUpperCase() === "GET" && (options === null || options.toLowerCase() === "all"),
  };
}

/** Thông tin máy tự báo trong `INFO=` (phẩy ngăn cách): phiên bản firmware, số người, số vân tay, số bản ghi, IP. */
export function phanTichInfo(info: string | null): Record<string, string> | null {
  if (!info) return null;
  const p = info.split(",").map((s) => s.trim());
  const ten = ["phienBan", "soNguoi", "soVanTay", "soBanGhi", "ip"];
  const kq: Record<string, string> = {};
  p.slice(0, ten.length).forEach((v, i) => {
    if (v) kq[ten[i]] = v.slice(0, 60);
  });
  return Object.keys(kq).length ? kq : null;
}

// ---------------------------------------------------------------------------
// Dòng ATTLOG
// ---------------------------------------------------------------------------

export interface DongAttlog {
  soDong: number;
  pin: string;
  /** Giờ trên máy, nguyên văn "yyyy-mm-dd hh:mm:ss" (giờ Việt Nam). */
  gioMay: string;
  /** Đổi sang UTC. */
  luc: Date;
  trangThai: number | null;
  xacThuc: number | null;
  maCongViec: string | null;
  dongGoc: string;
}

export interface LoiDongAdms {
  soDong: number;
  noiDung: string;
  lyDo: string;
}

const LA_GIO_MAY = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * "yyyy-mm-dd hh:mm:ss" giờ địa phương của máy → mốc UTC. Kiểm ngày có thật (không nhận 30/02),
 * năm 2000–2099 (máy mất pin đồng hồ hay về 2000-01-01 — vẫn nhận, nhưng dịch vụ gắn cờ giờ lệch).
 */
export function gioMayVeUtc(s: string, lechPhut = LECH_GIO_VN_PHUT): Date | null {
  const m = LA_GIO_MAY.exec(s.trim());
  if (!m) return null;
  const [nam, thang, ngay, gio, phut, giay] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "00"].map(Number);
  if (nam < 2000 || nam > 2099 || thang < 1 || thang > 12 || ngay < 1 || gio > 23 || phut > 59 || giay > 59) return null;
  const utc = Date.UTC(nam, thang - 1, ngay, gio, phut, giay);
  const kiem = new Date(Date.UTC(nam, thang - 1, ngay));
  if (kiem.getUTCMonth() !== thang - 1 || kiem.getUTCDate() !== ngay) return null;
  return new Date(utc - lechPhut * 60_000);
}

const LA_PIN = /^[0-9A-Za-z]{1,20}$/;

function soHoacNull(s: string | undefined): number | null {
  if (s === undefined || s.trim() === "") return null;
  return /^\d{1,3}$/.test(s.trim()) ? Number(s.trim()) : null;
}

/**
 * Đọc thân ATTLOG. Mỗi dòng không rỗng là một lần chấm; cột cách nhau bằng TAB (đời máy cũ có khi dùng
 * khoảng trắng — chấp nhận khi khớp được "PIN  yyyy-mm-dd hh:mm:ss …"). Dòng hỏng KHÔNG làm hỏng cả lô:
 * được ghi vào `loi` kèm lý do, các dòng tốt vẫn nhận.
 */
export function phanTichAttlog(than: string, lechPhut = LECH_GIO_VN_PHUT): { dong: DongAttlog[]; loi: LoiDongAdms[] } {
  const dong: DongAttlog[] = [];
  const loi: LoiDongAdms[] = [];
  const cacDong = than.replace(/^﻿/, "").split(/\r?\n/);
  cacDong.forEach((goc, i) => {
    const s = goc.replace(/\0/g, "").trimEnd();
    if (s.trim() === "") return;
    const soDong = i + 1;
    let cot = s.split("\t");
    if (cot.length < 2) {
      const m = /^\s*(\S+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)\s*(.*)$/.exec(s);
      if (m) cot = [m[1], m[2].replace(/\s+/, " "), ...m[3].split(/\s+/).filter(Boolean)];
    }
    const pin = (cot[0] ?? "").trim();
    const gio = (cot[1] ?? "").trim();
    const noiDung = s.slice(0, 200);
    if (!LA_PIN.test(pin)) {
      loi.push({ soDong, noiDung, lyDo: "Mã chấm công (PIN) trống hoặc có ký tự lạ." });
      return;
    }
    const luc = gioMayVeUtc(gio, lechPhut);
    if (!luc) {
      loi.push({ soDong, noiDung, lyDo: "Thời gian không đọc được (cần yyyy-mm-dd hh:mm:ss)." });
      return;
    }
    const maCv = (cot[4] ?? "").trim();
    dong.push({
      soDong,
      pin,
      gioMay: gio.replace("T", " ").length === 16 ? `${gio.replace("T", " ")}:00` : gio.replace("T", " "),
      luc,
      trangThai: soHoacNull(cot[2]),
      xacThuc: soHoacNull(cot[3]),
      maCongViec: maCv && maCv !== "0" ? maCv.slice(0, 20) : null,
      dongGoc: s.slice(0, 500),
    });
  });
  return { dong, loi };
}

/** Số dòng không rỗng của một thân (để trả `OK: n` cho OPERLOG / bảng khác). */
export function demDongKhongRong(than: string): number {
  return than.split(/\r?\n/).filter((d) => d.replace(/\0/g, "").trim() !== "").length;
}

// ---------------------------------------------------------------------------
// Câu trả lời
// ---------------------------------------------------------------------------

export interface TuyChonBatTay {
  attlogStamp: string | null;
  operlogStamp: string | null;
  /** Giây máy chờ trước khi thử lại khi lỗi mạng. */
  errorDelay?: number;
  /** Giây giữa hai lần hỏi lệnh (getrequest) — cũng là nhịp sống. */
  delay?: number;
  /** Phút giữa hai lần gửi dữ liệu dồn (khi không gửi tức thì). */
  transInterval?: number;
}

/**
 * Câu trả lời bắt tay. Các dòng theo mô tả phổ biến của PUSH SDK:
 *  - `ATTLOGStamp` / `OPERLOGStamp`: mốc đã nhận tới đâu; `None` = máy gửi lại từ đầu (lần đầu);
 *  - `TransFlag`: chỉ xin dữ liệu chấm công + nhật ký thao tác; `Realtime=1`: chấm xong gửi ngay;
 *  - `Encrypt=None`; `TimeZone=7` để máy hiển thị đúng giờ Việt Nam.
 */
export function phanHoiBatTay(sn: string, t: TuyChonBatTay): string {
  return [
    `GET OPTION FROM: ${sn}`,
    `ATTLOGStamp=${t.attlogStamp ?? "None"}`,
    `OPERLOGStamp=${t.operlogStamp ?? "None"}`,
    "ATTPHOTOStamp=None",
    `ErrorDelay=${t.errorDelay ?? 30}`,
    `Delay=${t.delay ?? 10}`,
    "TransTimes=00:00;14:05",
    `TransInterval=${t.transInterval ?? 1}`,
    "TransFlag=TransData AttLog OpLog",
    "TimeZone=7",
    "Realtime=1",
    "Encrypt=None",
  ].join("\n") + "\n";
}

export function phanHoiOk(soDong?: number): string {
  return soDong === undefined ? "OK" : `OK: ${soDong}`;
}

/**
 * Bộ đọc thay được (QĐ-102): bài thử và — khi có mẫu máy thật khác chuẩn — một bản đọc riêng cắm vào
 * đây mà không phải sửa route hay dịch vụ.
 */
export interface BoDocAdms {
  phanTichYeuCau: typeof phanTichYeuCau;
  phanTichAttlog: typeof phanTichAttlog;
  phanHoiBatTay: typeof phanHoiBatTay;
  phanHoiOk: typeof phanHoiOk;
}

export const BO_DOC_ZKTECO: BoDocAdms = { phanTichYeuCau, phanTichAttlog, phanHoiBatTay, phanHoiOk };
