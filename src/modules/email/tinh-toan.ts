import { z } from "zod";
import { dinhDangNgayGio } from "@/lib/dinh-dang";

/**
 * Phần thuần của email marketing — không đụng CSDL, không đụng mạng; dùng được cả ở máy chủ
 * lẫn trình duyệt (QĐ-23). Luật: BUSINESS_RULES.md mục 23 (EM).
 *
 *  - Khối an toàn (EM-03): mẫu thư là **dữ liệu có cấu trúc**, không phải HTML. Máy chủ dựng
 *    HTML từ khối, tự thoát mọi ký tự. Không có đường nào để người soạn chèn thẻ hay script.
 *  - Biến cá nhân hóa danh sách trắng (EM-04).
 *  - Lọc người nhận: email hỏng, trùng, đã từ chối (EM-07).
 */

// ---------------------------------------------------------------------------
// Khối nội dung
// ---------------------------------------------------------------------------

/** Biến cá nhân hóa được phép. Ngoài danh sách này → từ chối lúc lưu, không lặng lẽ để nguyên. */
export const BIEN_CA_NHAN = {
  ten: "Họ tên người nhận",
  cong_ty: "Tên công ty của người nhận",
  email: "Email người nhận",
  cong_ty_gui: "Tên công ty mình (Hồ sơ công ty)",
} as const;
export type TenBien = keyof typeof BIEN_CA_NHAN;
export type GiaTriBien = Record<TenBien, string>;

const MAU_BIEN = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/** Các biến không nằm trong danh sách trắng xuất hiện trong chuỗi. */
export function bienKhongHopLe(s: string): string[] {
  const ra = new Set<string>();
  for (const m of s.matchAll(MAU_BIEN)) if (!Object.hasOwn(BIEN_CA_NHAN, m[1])) ra.add(m[1]);
  return [...ra];
}

/** Thay biến bằng giá trị (chưa thoát HTML — thoát ở bước dựng). */
export function thayBien(s: string, gt: GiaTriBien): string {
  // Object.hasOwn, không dùng `in`: "constructor", "__proto__", "toString" nằm trên Object.prototype.
  return s.replace(MAU_BIEN, (toanBo, ten: string) => (Object.hasOwn(BIEN_CA_NHAN, ten) ? (Object.hasOwn(gt, ten) ? String(gt[ten as TenBien] ?? "") : "") : toanBo));
}

/** URL chỉ nhận https và không chứa biến/khoảng trắng. Trả null nếu không hợp lệ. */
export function urlHttps(s: string): string | null {
  const t = s.trim();
  if (!t || /\s|\{\{/.test(t)) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:" || !u.hostname || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const chu = (toiDa: number, nhan: string) =>
  z
    .string()
    .trim()
    .min(1, `${nhan} không được trống.`)
    .max(toiDa, `${nhan} tối đa ${toiDa} ký tự.`)
    .refine((s) => bienKhongHopLe(s).length === 0, {
      message: `Có biến không được hỗ trợ. Chỉ dùng: ${Object.keys(BIEN_CA_NHAN).map((b) => `{{${b}}}`).join(", ")}.`,
    });

const url = (nhan: string) =>
  z.string().trim().max(2000).refine((s) => urlHttps(s) !== null, { message: `${nhan} phải là địa chỉ https:// hợp lệ.` });

export const LuocDoKhoi = z.discriminatedUnion("loai", [
  z.object({ loai: z.literal("tieu-de"), noiDung: chu(200, "Tiêu đề") }),
  z.object({ loai: z.literal("doan-van"), noiDung: chu(5000, "Đoạn văn") }),
  z.object({ loai: z.literal("nut"), nhan: chu(80, "Chữ trên nút"), url: url("Liên kết của nút") }),
  z.object({
    loai: z.literal("anh"),
    url: url("Địa chỉ ảnh"),
    moTa: z.string().trim().max(200).default(""),
    lienKet: z
      .string()
      .trim()
      .max(2000)
      .refine((s) => s === "" || urlHttps(s) !== null, { message: "Liên kết của ảnh phải là https://." })
      .default(""),
  }),
  z.object({ loai: z.literal("danh-sach"), muc: z.array(chu(500, "Mục danh sách")).min(1).max(30) }),
  z.object({ loai: z.literal("ngan-cach") }),
]);
export type Khoi = z.infer<typeof LuocDoKhoi>;

export const LuocDoDanhSachKhoi = z.array(LuocDoKhoi).min(1, "Thư phải có ít nhất một khối nội dung.").max(60, "Tối đa 60 khối.");
export const LuocDoTieuDeThu = chu(200, "Tiêu đề thư").refine((s) => !/[\r\n]/.test(s), { message: "Tiêu đề thư không được xuống dòng." });

export const NHAN_KHOI: Record<Khoi["loai"], string> = {
  "tieu-de": "Tiêu đề",
  "doan-van": "Đoạn văn",
  nut: "Nút liên kết",
  anh: "Ảnh",
  "danh-sach": "Danh sách",
  "ngan-cach": "Đường ngăn cách",
};

/** Liên kết theo thứ tự xuất hiện. Chỉ số trong mảng này là thứ duy nhất liên kết bấm mang theo (EM-11). */
export function danhSachLienKet(khoi: Khoi[]): string[] {
  const ds: string[] = [];
  for (const k of khoi) {
    if (k.loai === "nut") ds.push(urlHttps(k.url)!);
    if (k.loai === "anh" && k.lienKet) ds.push(urlHttps(k.lienKet)!);
  }
  return ds;
}

// ---------------------------------------------------------------------------
// Dựng thư
// ---------------------------------------------------------------------------

export function thoatHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface ChanThu {
  tenCongTy: string;
  diaChi: string;
  /** Liên kết huỷ nhận tin tuyệt đối. Thư thử dùng "#". */
  lienKetHuy: string;
}

export interface TheoDoi {
  /** URL điểm ảnh đếm lượt mở. */
  anhMo: string;
  /** URL chuyển hướng cho liên kết thứ `i` trong `danhSachLienKet()`. */
  lienKetBam: (i: number) => string;
}

export interface ThuDaDung {
  tieuDe: string;
  html: string;
  text: string;
}

/** Chân thư bắt buộc (EM-09): tên + địa chỉ công ty và liên kết huỷ nhận tin. */
export function thieuChanThu(c: { tenCongTy: string; diaChi: string }): string[] {
  const thieu: string[] = [];
  if (!c.tenCongTy.trim()) thieu.push("tên công ty");
  if (!c.diaChi.trim()) thieu.push("địa chỉ");
  return thieu;
}

const MAU = {
  chu: "#1f2937",
  phu: "#6b7280",
  chinh: "#1d4ed8",
  vien: "#e5e7eb",
};

/**
 * Dựng HTML + văn bản thuần từ khối. Mọi chuỗi đi qua `thoatHtml` SAU khi thay biến, nên giá
 * trị biến (tên khách do người ngoài nhập qua form) cũng không chèn được thẻ.
 */
export function dungThu(tieuDeMau: string, khoi: Khoi[], bien: GiaTriBien, chan: ChanThu, theoDoi?: TheoDoi, nhanQuangCao?: string): ThuDaDung {
  // EG-06: nhãn quảng cáo gắn SAU khi thay biến — giá trị biến không đẩy được nhãn khỏi vị trí đầu.
  const thuan = thayBien(tieuDeMau, bien).replace(/[\r\n]+/g, " ").trim();
  const tieuDe = nhanQuangCao === undefined ? thuan : ganNhanQuangCao(thuan, nhanQuangCao);
  const h: string[] = [];
  const t: string[] = [];
  let chiSoLk = 0;
  const lk = (u: string) => {
    const i = chiSoLk++;
    return theoDoi ? theoDoi.lienKetBam(i) : u;
  };

  for (const k of khoi) {
    switch (k.loai) {
      case "tieu-de": {
        const s = thayBien(k.noiDung, bien);
        h.push(`<h2 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:${MAU.chu}">${thoatHtml(s)}</h2>`);
        t.push(s.toUpperCase(), "");
        break;
      }
      case "doan-van": {
        const s = thayBien(k.noiDung, bien);
        h.push(`<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${MAU.chu}">${thoatHtml(s).replace(/\r?\n/g, "<br>")}</p>`);
        t.push(s, "");
        break;
      }
      case "nut": {
        const s = thayBien(k.nhan, bien);
        const u = urlHttps(k.url)!;
        h.push(
          `<p style="margin:0 0 18px"><a href="${thoatHtml(lk(u))}" style="display:inline-block;padding:10px 18px;background:${MAU.chinh};color:#ffffff;text-decoration:none;border-radius:6px;font-size:15px">${thoatHtml(s)}</a></p>`,
        );
        t.push(`${s}: ${u}`, "");
        break;
      }
      case "anh": {
        const anh = `<img src="${thoatHtml(urlHttps(k.url)!)}" alt="${thoatHtml(k.moTa)}" style="max-width:100%;height:auto;border:0;display:block">`;
        const u = k.lienKet ? urlHttps(k.lienKet) : null;
        h.push(`<p style="margin:0 0 14px">${u ? `<a href="${thoatHtml(lk(u))}">${anh}</a>` : anh}</p>`);
        if (k.moTa) t.push(`[${k.moTa}]`, "");
        break;
      }
      case "danh-sach": {
        const muc = k.muc.map((m) => thayBien(m, bien));
        h.push(
          `<ul style="margin:0 0 14px;padding-left:22px;font-size:15px;line-height:1.6;color:${MAU.chu}">${muc.map((m) => `<li>${thoatHtml(m)}</li>`).join("")}</ul>`,
        );
        t.push(...muc.map((m) => `- ${m}`), "");
        break;
      }
      case "ngan-cach":
        h.push(`<hr style="border:0;border-top:1px solid ${MAU.vien};margin:18px 0">`);
        t.push("----------", "");
        break;
    }
  }

  const tenCty = chan.tenCongTy.trim() || "(chưa khai tên công ty)";
  const diaChi = chan.diaChi.trim() || "(chưa khai địa chỉ)";
  const chanHtml =
    `<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid ${MAU.vien};font-size:12px;line-height:1.5;color:${MAU.phu}">` +
    `${thoatHtml(tenCty)}<br>${thoatHtml(diaChi)}<br>` +
    `Bạn nhận thư này vì đã liên hệ hoặc giao dịch với chúng tôi. ` +
    `<a href="${thoatHtml(chan.lienKetHuy)}" style="color:${MAU.phu}">Huỷ nhận tin</a></p>`;
  const anhMo = theoDoi ? `<img src="${thoatHtml(theoDoi.anhMo)}" width="1" height="1" alt="" style="display:block;border:0">` : "";

  const html =
    `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${thoatHtml(tieuDe)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f3f4f6">` +
    `<div style="max-width:600px;margin:0 auto;padding:24px 20px;background:#ffffff;font-family:Arial,Helvetica,sans-serif">` +
    h.join("") +
    chanHtml +
    anhMo +
    `</div></body></html>`;
  const text = [...t, "--", tenCty, diaChi, `Huỷ nhận tin: ${chan.lienKetHuy}`].join("\n");
  return { tieuDe, html, text };
}

/** Giá trị biến mẫu cho xem trước / gửi thử. */
export function bienMau(tenCongTyGui: string, nguoi: { ten?: string; email?: string } = {}): GiaTriBien {
  return {
    ten: nguoi.ten || "Nguyễn Văn A",
    cong_ty: "Công ty Mẫu",
    email: nguoi.email || "nguoi.nhan@vidu.vn",
    cong_ty_gui: tenCongTyGui,
  };
}

// ---------------------------------------------------------------------------
// Người nhận
// ---------------------------------------------------------------------------

const MAU_EMAIL = /^[^@\s"<>(),;:\\[\]]+@[^@\s"<>(),;:\\[\]]+\.[a-z]{2,}$/i;

export function laEmailHopLe(s: string | null | undefined): boolean {
  return !!s && s.length <= 254 && MAU_EMAIL.test(s.trim());
}

export interface UngVien {
  email: string | null;
  ten: string;
  congTy: string | null;
  loai: "lead" | "contact";
  id: string;
  khachHangId?: string | null;
  /** Cờ `marketing_opt_out_at` trên lead/liên hệ. */
  tuChoiLuc?: Date | null;
}

export type LyDoLoai = "khong-co-email" | "email-khong-hop-le" | "trung-email" | "da-tu-choi" | "email-hong" | "chua-dong-y";

export const NHAN_LY_DO_LOAI: Record<LyDoLoai, string> = {
  "khong-co-email": "Không có email",
  "email-khong-hop-le": "Email sai định dạng",
  "trung-email": "Trùng email với người nhận khác trong chiến dịch",
  "da-tu-choi": "Đã từ chối nhận tin",
  "email-hong": "Email hỏng (máy chủ nhận từng từ chối hẳn)",
  // 0.18.0 — EG-09: sổ đồng ý bắt buộc (email.bat_buoc_dong_y).
  "chua-dong-y": "Chưa có đồng ý nhận thư quảng cáo",
};

export interface KetQuaLoc {
  hopLe: (UngVien & { email: string })[];
  biLoai: (UngVien & { lyDo: LyDoLoai })[];
}

/**
 * EM-07: loại người không có email / email sai dạng / đã từ chối / nằm trong danh sách chặn,
 * và gộp trùng theo email chữ thường (giữ người xuất hiện trước).
 * `danhSachChan`: email → lý do chặn ("huy-nhan-tin" | "email-hong").
 */
export function locNguoiNhan(ds: UngVien[], danhSachChan: Map<string, string>): KetQuaLoc {
  const hopLe: KetQuaLoc["hopLe"] = [];
  const biLoai: KetQuaLoc["biLoai"] = [];
  const daGap = new Set<string>();
  for (const u of ds) {
    const email = u.email?.trim().toLowerCase() ?? "";
    if (!email) biLoai.push({ ...u, lyDo: "khong-co-email" });
    else if (!laEmailHopLe(email)) biLoai.push({ ...u, email, lyDo: "email-khong-hop-le" });
    else if (u.tuChoiLuc || danhSachChan.get(email) === "huy-nhan-tin" || danhSachChan.get(email) === "bao-rac") biLoai.push({ ...u, email, lyDo: "da-tu-choi" });
    else if (danhSachChan.get(email) === "email-hong") biLoai.push({ ...u, email, lyDo: "email-hong" });
    else if (daGap.has(email)) biLoai.push({ ...u, email, lyDo: "trung-email" });
    else {
      daGap.add(email);
      hopLe.push({ ...u, email });
    }
  }
  return { hopLe, biLoai };
}

/** Che email cho người không có quyền xem thông tin liên hệ: "nguyen.van.a@abc.vn" → "ng•••@abc.vn". */
export function cheEmail(email: string): string {
  const [ten, mien] = email.split("@");
  if (!mien) return "•••";
  return `${ten.slice(0, 2)}•••@${mien}`;
}

// ---------------------------------------------------------------------------
// Trạng thái
// ---------------------------------------------------------------------------

export const TRANG_THAI_CHIEN_DICH = ["DRAFT", "PENDING_APPROVAL", "SENDING", "PAUSED", "COMPLETED", "CANCELLED"] as const;
export type TrangThaiChienDich = (typeof TRANG_THAI_CHIEN_DICH)[number];

export const NHAN_TRANG_THAI_CHIEN_DICH: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING_APPROVAL: "Chờ duyệt",
  SENDING: "Đang gửi",
  PAUSED: "Tạm dừng",
  COMPLETED: "Đã gửi xong",
  CANCELLED: "Đã huỷ",
};
export const LOP_TRANG_THAI_CHIEN_DICH: Record<string, string> = {
  DRAFT: "",
  PENDING_APPROVAL: "canh-bao",
  SENDING: "chinh",
  PAUSED: "canh-bao",
  COMPLETED: "tot",
  CANCELLED: "",
};

export const NHAN_TRANG_THAI_NGUOI_NHAN: Record<string, string> = {
  QUEUED: "Chờ gửi",
  SENDING: "Đang gửi",
  SENT: "Đã gửi",
  FAILED: "Lỗi",
  SKIPPED: "Bị loại",
};
export const LOP_TRANG_THAI_NGUOI_NHAN: Record<string, string> = {
  QUEUED: "",
  SENDING: "chinh",
  SENT: "tot",
  FAILED: "loi",
  SKIPPED: "",
};

/** Chuyển trạng thái hợp lệ của chiến dịch (EM-05). */
const CHUYEN: Record<TrangThaiChienDich, TrangThaiChienDich[]> = {
  DRAFT: ["PENDING_APPROVAL", "CANCELLED"],
  PENDING_APPROVAL: ["DRAFT", "SENDING", "CANCELLED"],
  SENDING: ["PAUSED", "COMPLETED", "CANCELLED"],
  PAUSED: ["SENDING", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
export function chuyenHopLe(tu: string, den: TrangThaiChienDich): boolean {
  return (CHUYEN[tu as TrangThaiChienDich] ?? []).includes(den);
}

// ---------------------------------------------------------------------------
// Lỗi SMTP
// ---------------------------------------------------------------------------

export type LoaiLoiGui = "ket-noi" | "nguoi-nhan-hong" | "nguoi-nhan" | "khac";

export interface LoiSmtp {
  code?: string;
  responseCode?: number;
  /** Lệnh SMTP bị từ chối, nodemailer ghi: "MAIL FROM", "RCPT TO", "DATA", "AUTH PLAIN"… */
  command?: string;
  response?: string;
  message?: string;
}

/** Mã trạng thái mở rộng RFC 3463 trong câu trả lời ("550 5.1.1 …" → [5, 1, 1]). */
export function maMoRong(loi: LoiSmtp): [number, number, number] | null {
  const m = /\b([245])\.(\d{1,3})\.(\d{1,3})\b/.exec(loi.response ?? loi.message ?? "");
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Câu trả lời cho thấy lỗi nằm ở **phía gửi** (hạn mức, tốc độ, SPF/DKIM, relay, quyền gửi, IP bị chặn). */
const PHIA_GUI =
  /quota|\blimit|\brate\b|too many|throttl|relay|spf|dkim|dmarc|sender|sendas|send as|authent|not authorized to send|reputation|blocklist|blacklist|block ?list|traffic not accepted|ip address|your ip|policy.*sender/i;
/** Câu trả lời nói rõ người nhận không tồn tại (dùng khi máy chủ không gửi mã mở rộng). */
const KHONG_TON_TAI =
  /user unknown|unknown user|no such (user|mailbox|recipient)|does not exist|doesn't exist|recipient not found|address not found|invalid recipient|mailbox unavailable|mailbox not found|unrouteable|no mailbox|not a valid mailbox/i;

/**
 * Phân loại lỗi gửi (EM-13). Nguyên tắc: **chỉ đổ lỗi cho người nhận khi chắc chắn**; còn lại coi
 * là lỗi của hộp thư gửi — dừng cả chiến dịch, trả thư về hàng chờ, chờ người xử lý. Đổ nhầm sang
 * người nhận nghĩa là cả danh sách vào sổ chặn vĩnh viễn chỉ vì Gmail hết hạn mức trong ngày.
 *
 *  - `ket-noi`: không vào được / bị từ chối ở phía gửi — mất kết nối, sai đăng nhập, **mọi 4xx**,
 *    mọi lỗi ở MAIL FROM hoặc DATA (nodemailer gắn `EENVELOPE` cho cả lỗi MAIL FROM nên **không**
 *    dựa vào `code`, chỉ dựa vào `command`), và ở RCPT mà mã 5.4.x / 5.7.x hoặc câu trả lời
 *    nói về hạn mức, SPF, relay, quyền gửi (Gmail 5.4.5, M365 5.7.60 SendAsDenied, 5.7.708…).
 *  - `nguoi-nhan-hong`: ở RCPT, mã 5.1.x / 5.2.1, hoặc 550/551/553 không mã mở rộng mà câu trả lời
 *    nói rõ người nhận không tồn tại → Lỗi + danh sách chặn "email hỏng".
 *  - `nguoi-nhan`: ở RCPT, lỗi vĩnh viễn của riêng người đó (5.2.2 hộp thư đầy, 5.7.x chính sách bên
 *    nhận…) → Lỗi cho người đó, **không** vào danh sách chặn.
 *  - `khac`: lỗi không phải SMTP (không có mã) → Lỗi cho thư đó.
 */
export function phanLoaiLoiGui(loi: LoiSmtp): LoaiLoiGui {
  const ma = loi.code ?? "";
  const rc = loi.responseCode ?? 0;
  if (["EAUTH", "ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ETLS", "ECONNREFUSED", "EPROTOCOL", "ENOAUTH", "EOAUTH2"].includes(ma)) return "ket-noi";
  if (rc >= 400 && rc < 500) return "ket-noi";
  const lenh = (loi.command ?? "").toUpperCase();
  const laRcpt = lenh.startsWith("RCPT");
  if (!laRcpt) return rc >= 500 || ma === "EENVELOPE" || ma === "EMESSAGE" ? "ket-noi" : "khac";

  const cau = `${loi.response ?? ""} ${loi.message ?? ""}`;
  const mr = maMoRong(loi);
  if (mr && mr[0] === 4) return "ket-noi";
  if (mr && mr[1] === 2 && mr[2] === 2) return "nguoi-nhan"; // 5.2.2 hộp thư đầy — chuyện tạm của người nhận
  if (mr && (mr[1] === 1 || (mr[1] === 2 && mr[2] === 1))) return "nguoi-nhan-hong";
  if (mr && mr[1] === 7 && (mr[2] === 60 || mr[2] === 708)) return "ket-noi";
  if (PHIA_GUI.test(cau)) return "ket-noi";
  if (mr && mr[1] === 4) return mr[2] === 1 ? "nguoi-nhan" : "ket-noi";
  if (mr && mr[1] === 7) return "nguoi-nhan";
  if (!mr && [550, 551, 553].includes(rc) && KHONG_TON_TAI.test(cau)) return "nguoi-nhan-hong";
  return "nguoi-nhan";
}

/** Lý do tạm dừng chiến dịch, tiếng Việt, cho người vận hành biết phải làm gì. */
export function lyDoTamDung(loi: LoiSmtp): string {
  const cau = `${loi.response ?? ""} ${loi.message ?? ""}`;
  const chiTiet = cauLoiGui(loi);
  if (loi.code === "EAUTH" || loi.responseCode === 535) return `Hộp thư gửi từ chối đăng nhập — kiểm tài khoản / mật khẩu ứng dụng ở Kết nối email. (${chiTiet})`;
  if (/quota|\blimit|\brate\b|too many|throttl/i.test(cau)) return `Hộp thư gửi đã chạm hạn mức gửi — chờ hạn mức hồi lại (thường 24 giờ) hoặc giảm tốc độ ở Cấu hình, rồi bấm Tiếp tục. (${chiTiet})`;
  if (/relay|spf|dkim|dmarc|sender|sendas|send as|not authorized/i.test(cau)) return `Máy chủ thư từ chối vì quyền / chính sách bên gửi (SPF, DKIM, relay, quyền gửi thay) — kiểm cấu hình tên miền và tài khoản gửi. (${chiTiet})`;
  if ((loi.responseCode ?? 0) >= 400 && (loi.responseCode ?? 0) < 500) return `Máy chủ thư báo lỗi tạm thời — thử Tiếp tục sau ít phút. (${chiTiet})`;
  if (!loi.responseCode) return `Không kết nối được máy chủ SMTP — kiểm máy chủ, cổng, mạng ra ngoài của máy chủ. (${chiTiet})`;
  return `Hộp thư gửi bị máy chủ thư từ chối — kiểm lại kết nối email trước khi tiếp tục. (${chiTiet})`;
}

/** Câu lỗi gọn cho người đọc — không đưa nguyên dấu vết kỹ thuật dài ra giao diện. */
export function cauLoiGui(loi: LoiSmtp): string {
  const ma = [loi.code, loi.responseCode].filter(Boolean).join(" ");
  const noiDung = (loi.response || loi.message || "Lỗi không rõ").replace(/\s+/g, " ").slice(0, 300);
  if (loi.code === "EAUTH") return `Hộp thư gửi từ chối đăng nhập (${ma}). Kiểm tài khoản / mật khẩu ứng dụng.`;
  return ma ? `${ma}: ${noiDung}` : noiDung;
}

// ---------------------------------------------------------------------------
// Hướng dẫn kết nối
// ---------------------------------------------------------------------------

export interface GoiYKetNoi {
  ten: string;
  host: string;
  port: number;
  baoMat: "tls" | "starttls";
  huongDan: string;
}

export const GOI_Y_KET_NOI: GoiYKetNoi[] = [
  {
    ten: "Gmail / Google Workspace",
    host: "smtp.gmail.com",
    port: 465,
    baoMat: "tls",
    huongDan:
      "Bật Xác minh 2 bước cho tài khoản Google, rồi tạo Mật khẩu ứng dụng (Tài khoản Google → Bảo mật → Mật khẩu ứng dụng) và dán mật khẩu 16 ký tự đó vào đây — không dùng mật khẩu đăng nhập Gmail. Tên đăng nhập là địa chỉ Gmail đầy đủ.",
  },
  {
    ten: "Microsoft 365 / Outlook",
    host: "smtp.office365.com",
    port: 587,
    baoMat: "starttls",
    huongDan:
      "Quản trị Microsoft 365 phải bật 'Authenticated SMTP' cho hộp thư gửi (Trung tâm quản trị → Người dùng → Thư → Quản lý ứng dụng email). Nếu tài khoản bật MFA thì cần mật khẩu ứng dụng.",
  },
  {
    ten: "SendGrid",
    host: "smtp.sendgrid.net",
    port: 587,
    baoMat: "starttls",
    huongDan: "Tên đăng nhập là chữ apikey (đúng như vậy), mật khẩu là API key có quyền Mail Send. Xác minh tên miền gửi (SPF/DKIM) trong SendGrid trước.",
  },
  {
    ten: "Mailgun",
    host: "smtp.mailgun.org",
    port: 587,
    baoMat: "starttls",
    huongDan: "Dùng thông tin SMTP credentials của tên miền đã xác minh trong Mailgun (Sending → Domain settings → SMTP credentials).",
  },
  {
    ten: "Amazon SES",
    host: "email-smtp.ap-southeast-1.amazonaws.com",
    port: 587,
    baoMat: "starttls",
    huongDan: "Tạo SMTP credentials trong SES (khác với khóa IAM thường), đổi vùng trong tên máy chủ cho đúng vùng đã dùng, và ra khỏi chế độ sandbox trước khi gửi cho khách.",
  },
];

// ---------------------------------------------------------------------------
// 0.18.0 — Gửi số lượng lớn (BUSINESS_RULES.md mục 29, EG). Hàm thuần, có kiểm thử đơn vị.
// ---------------------------------------------------------------------------

/** Nhãn quảng cáo mặc định đầu tiêu đề thư (NĐ 91/2020/NĐ-CP Điều 18). Đổi ở Kết nối email. */
export const NHAN_QUANG_CAO_MAC_DINH = "[QC]";

/** Nhãn hợp lệ: 2–20 ký tự, không xuống dòng, không ký tự điều khiển. */
export function laNhanQuangCaoHopLe(s: unknown): s is string {
  return typeof s === "string" && s.trim().length >= 2 && s.trim().length <= 20 && !/[\r\n\u0000-\u001f<>]/.test(s);
}

/** Nhãn đang dùng: giá trị đã lưu nếu hợp lệ, không thì mặc định — không bao giờ rỗng (người soạn không bỏ được). */
export function chuanHoaNhanQuangCao(s: unknown): string {
  return laNhanQuangCaoHopLe(s) ? s.trim() : NHAN_QUANG_CAO_MAC_DINH;
}

/**
 * EG-06: tiêu đề luôn **mở đầu** bằng nhãn quảng cáo. Đã mở đầu bằng nhãn (không phân biệt hoa thường,
 * bỏ khoảng trắng thừa) thì giữ nguyên — không gắn hai lần. Nhãn nằm ở giữa tiêu đề không tính:
 * vẫn gắn lên đầu.
 */
export function ganNhanQuangCao(tieuDe: string, nhan: string): string {
  const n = chuanHoaNhanQuangCao(nhan);
  const t = tieuDe.replace(/[\r\n]+/g, " ").trim();
  if (t.toLocaleLowerCase("vi").startsWith(n.toLocaleLowerCase("vi"))) {
    const conLai = t.slice(n.length).trim();
    return conLai ? `${n} ${conLai}` : n;
  }
  return t ? `${n} ${t}` : n;
}

/** Số YYYYMMDD (ô Cấu hình chỉ nhận số — QĐ-73) → ngày. Sai → null. */
export function docNgayYmd(so: number | null | undefined): { nam: number; thang: number; ngay: number } | null {
  if (so === null || so === undefined || !Number.isInteger(so)) return null;
  const nam = Math.floor(so / 10000);
  const thang = Math.floor((so % 10000) / 100);
  const ngay = so % 100;
  if (nam < 2000 || nam > 2100 || thang < 1 || thang > 12 || ngay < 1) return null;
  const d = new Date(Date.UTC(nam, thang - 1, ngay));
  if (d.getUTCMonth() !== thang - 1 || d.getUTCDate() !== ngay) return null;
  return { nam, thang, ngay };
}

const MOT_NGAY_MS = 86_400_000;
/** Lệch giờ Việt Nam cố định (không có giờ mùa hè). */
const LECH_VN_MS = 7 * 3_600_000;

/** Số ngày lịch (giờ Việt Nam) từ ngày bắt đầu khởi động tới hôm nay; trước ngày bắt đầu → 0. */
export function soNgayTuNgay(ngayBatDauYmd: number, bayGio: Date): number | null {
  const d = docNgayYmd(ngayBatDauYmd);
  if (!d) return null;
  const vn = new Date(bayGio.getTime() + LECH_VN_MS);
  const homNay = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate());
  const batDau = Date.UTC(d.nam, d.thang - 1, d.ngay);
  return Math.max(0, Math.round((homNay - batDau) / MOT_NGAY_MS));
}

/** Trần kỹ thuật để lũy thừa không ra Infinity — lớn hơn mọi hạn mức thật. */
export const TRAN_KHOI_DONG_TOI_DA = 10_000_000;

/**
 * EG-10 — đường khởi động (warm-up): ngày thứ d (0 = ngày bắt đầu) gửi tối đa ⌊mứcĐầu × hệSố^d⌋ thư.
 * Chưa đặt ngày bắt đầu / ngày sai → null (không áp đường khởi động). Mức đầu / hệ số sai → null.
 */
export function tranKhoiDong(ngayBatDauYmd: number | null, mucDau: number | null, heSo: number | null, bayGio: Date): number | null {
  if (ngayBatDauYmd === null || mucDau === null || heSo === null) return null;
  if (!(mucDau >= 1) || !(heSo >= 1)) return null;
  const d = soNgayTuNgay(ngayBatDauYmd, bayGio);
  if (d === null) return null;
  const tran = Math.floor(mucDau * Math.pow(heSo, d));
  return Number.isFinite(tran) ? Math.min(tran, TRAN_KHOI_DONG_TOI_DA) : TRAN_KHOI_DONG_TOI_DA;
}

/** Trần ngày hiệu lực = min(trần ngày đã đặt, đường khởi động); cả hai trống → null (không chặn theo ngày). */
export function tranNgayHieuLuc(tranDat: number | null, khoiDong: number | null): number | null {
  const ds = [tranDat, khoiDong].filter((x): x is number => x !== null && Number.isFinite(x));
  return ds.length ? Math.min(...ds) : null;
}

/** Trần ngày mặc định khi kênh là Amazon SES mà `email.so_thu_toi_da_moi_ngay` chưa đặt (quy mô < 100.000 thư/tháng). */
export const TRAN_NGAY_MAC_DINH_SES = 5000;

export const CUA_SO_DIA_CHI_MS = 24 * 3_600_000;

/**
 * EG-07 — tối đa N thư quảng cáo / địa chỉ / 24 giờ (NĐ 91/2020 Điều 13), cửa sổ trượt.
 * `daGui`: email → các mốc đã nhận việc gửi (SENDING / SENT) của MỌI chiến dịch trong 24 giờ qua.
 * Duyệt ứng viên theo thứ tự; người đã đủ N → **hoãn** tới lúc thư cũ nhất cần thiết ra khỏi cửa sổ
 * (không phải lỗi). Đếm cộng dồn trong chính lô (hai thư cùng địa chỉ trong một lô cũng bị chặn).
 */
export function xetGioiHanDiaChi(
  ungVien: { id: string; email: string }[],
  daGui: Map<string, Date[]>,
  toiDa: number,
  bayGio: Date,
): { nhan: string[]; hoan: { id: string; den: Date }[] } {
  const nhan: string[] = [];
  const hoan: { id: string; den: Date }[] = [];
  const mocTu = bayGio.getTime() - CUA_SO_DIA_CHI_MS;
  const dem = new Map<string, number[]>();
  for (const [e, ds] of daGui) dem.set(e, ds.map((d) => d.getTime()).filter((t) => t > mocTu).sort((a, b) => a - b));
  for (const u of ungVien) {
    const ds = dem.get(u.email) ?? [];
    if (toiDa >= 1 && ds.length < toiDa) {
      ds.push(bayGio.getTime());
      ds.sort((a, b) => a - b);
      dem.set(u.email, ds);
      nhan.push(u.id);
    } else {
      // Phải có (số đã gửi − N + 1) thư rời cửa sổ thì mới còn chỗ: lấy mốc của thư thứ đó.
      const can = ds.length - Math.max(toiDa, 0);
      const moc = ds[Math.max(0, can)] ?? bayGio.getTime();
      hoan.push({ id: u.id, den: new Date(Math.max(moc + CUA_SO_DIA_CHI_MS, bayGio.getTime() + 60_000)) });
    }
  }
  return { nhan, hoan };
}

// --- Sổ đồng ý (EG-08) ------------------------------------------------------

export const HANH_DONG_DONG_Y = ["dong-y", "rut", "phan-doi"] as const;
export type HanhDongDongY = (typeof HANH_DONG_DONG_Y)[number];
export const NHAN_HANH_DONG_DONG_Y: Record<HanhDongDongY, string> = { "dong-y": "Đồng ý", rut: "Rút đồng ý", "phan-doi": "Phản đối (báo rác)" };
export const NGUON_DONG_Y = ["form", "landing", "webhook", "nhap-csv", "nhap-tay", "huy-nhan-tin", "bao-rac", "chuyen-doi"] as const;
export type NguonDongY = (typeof NGUON_DONG_Y)[number];
export const NHAN_NGUON_DONG_Y: Record<NguonDongY, string> = {
  form: "Form đăng ký",
  landing: "Landing page",
  webhook: "Webhook (hệ thống ngoài)",
  "nhap-csv": "Nhập CSV",
  "nhap-tay": "Ghi tay",
  "huy-nhan-tin": "Huỷ nhận tin trong thư",
  "bao-rac": "Báo thư rác",
  "chuyen-doi": "Chuyển từ dữ liệu trước 0.18",
};

/**
 * Trạng thái hiện hành = dòng **mới nhất** theo thời điểm xảy ra (bằng nhau thì theo lúc ghi sổ).
 * Không có dòng nào → null (chưa từng đồng ý).
 */
export function trangThaiDongY(ds: { hanhDong: string; luc: Date; ghiLuc?: Date | null }[]): HanhDongDongY | null {
  let tot: (typeof ds)[number] | null = null;
  for (const d of ds) {
    if (!(HANH_DONG_DONG_Y as readonly string[]).includes(d.hanhDong)) continue;
    if (
      !tot ||
      d.luc.getTime() > tot.luc.getTime() ||
      (d.luc.getTime() === tot.luc.getTime() && (d.ghiLuc?.getTime() ?? 0) >= (tot.ghiLuc?.getTime() ?? 0))
    ) {
      tot = d;
    }
  }
  return (tot?.hanhDong as HanhDongDongY | undefined) ?? null;
}

/** Đang được gửi thư quảng cáo theo sổ: chỉ khi dòng mới nhất là "dong-y". */
export function dangDongY(trangThai: HanhDongDongY | null): boolean {
  return trangThai === "dong-y";
}

// --- Báo cáo theo tên miền nhận (EG-11) --------------------------------------

export const NHOM_TEN_MIEN = ["gmail.com", "outlook.com", "yahoo.com", "khac"] as const;
export type NhomTenMien = (typeof NHOM_TEN_MIEN)[number];
export const NHAN_NHOM_TEN_MIEN: Record<NhomTenMien, string> = {
  "gmail.com": "Gmail",
  "outlook.com": "Outlook / Hotmail",
  "yahoo.com": "Yahoo",
  khac: "Tên miền khác",
};
const BI_DANH_TEN_MIEN: Record<string, NhomTenMien> = {
  "gmail.com": "gmail.com",
  "googlemail.com": "gmail.com",
  "outlook.com": "outlook.com",
  "hotmail.com": "outlook.com",
  "live.com": "outlook.com",
  "msn.com": "outlook.com",
  "outlook.com.vn": "outlook.com",
  "hotmail.com.vn": "outlook.com",
  "yahoo.com": "yahoo.com",
  "yahoo.com.vn": "yahoo.com",
  "ymail.com": "yahoo.com",
  "rocketmail.com": "yahoo.com",
};

/** Email (hoặc tên miền) → nhóm báo cáo. Tên miền công ty dùng Google Workspace vẫn tính "khác" (không tra MX). */
export function nhomTenMien(emailHoacMien: string): NhomTenMien {
  const mien = (emailHoacMien.includes("@") ? emailHoacMien.split("@").pop()! : emailHoacMien).trim().toLowerCase();
  return BI_DANH_TEN_MIEN[mien] ?? "khac";
}

export interface DongTenMien {
  nhom: NhomTenMien;
  daGui: number;
  denHop: number;
  hong: number;
  baoRac: number;
  mo: number;
}

/** Gộp số theo từng tên miền nhận → 4 nhóm cố định (luôn đủ 4 dòng, theo thứ tự NHOM_TEN_MIEN). */
export function gopTheoTenMien(dong: { tenMien: string; daGui: number; denHop: number; hong: number; baoRac: number; mo: number }[]): DongTenMien[] {
  const ban = new Map<NhomTenMien, DongTenMien>(NHOM_TEN_MIEN.map((n) => [n, { nhom: n, daGui: 0, denHop: 0, hong: 0, baoRac: 0, mo: 0 }]));
  for (const d of dong) {
    const t = ban.get(nhomTenMien(d.tenMien))!;
    t.daGui += d.daGui;
    t.denHop += d.denHop;
    t.hong += d.hong;
    t.baoRac += d.baoRac;
    t.mo += d.mo;
  }
  return NHOM_TEN_MIEN.map((n) => ban.get(n)!);
}

// --- Tự tạm dừng theo tỷ lệ hỏng / báo rác (EG-05) ---------------------------

export interface SoLieuTyLe {
  /** Số thư đã có kết quả gửi (đã đi hoặc bị trả lại ngay lúc gửi). */
  mau: number;
  /** Trả lại vĩnh viễn (Permanent bounce / 5.1.x lúc gửi). */
  hong: number;
  /** Báo thư rác (Complaint). */
  baoRac: number;
}

export type KetQuaTyLe = { tamDung: false } | { tamDung: true; ma: "ty-le-hong" | "ty-le-bao-rac"; lyDo: string };

/**
 * So tỷ lệ của phần thư gửi SAU mốc (`moc` chụp lúc người duyệt tiếp tục sau lần tự dừng trước) với
 * ngưỡng. Chưa đủ mẫu tối thiểu → không kết luận. Tỷ lệ phải **vượt** ngưỡng (bằng thì chưa dừng).
 */
export function danhGiaTyLe(so: SoLieuTyLe, moc: SoLieuTyLe, nguong: { hongPhanTram: number; baoRacPhanNghin: number; mauToiThieu: number }): KetQuaTyLe {
  const mau = so.mau - moc.mau;
  const hong = so.hong - moc.hong;
  const baoRac = so.baoRac - moc.baoRac;
  if (mau < Math.max(1, nguong.mauToiThieu)) return { tamDung: false };
  const tyLeHong = (hong / mau) * 100;
  const tyLeBaoRac = (baoRac / mau) * 1000;
  const so2 = (x: number) => x.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
  if (tyLeBaoRac > nguong.baoRacPhanNghin) {
    return {
      tamDung: true,
      ma: "ty-le-bao-rac",
      lyDo: `Tỷ lệ báo thư rác ${so2(tyLeBaoRac)}‰ (${baoRac}/${mau} thư) vượt ngưỡng ${so2(nguong.baoRacPhanNghin)}‰. Kiểm danh sách người nhận (đã đồng ý thật chưa?) và nội dung trước khi tiếp tục.`,
    };
  }
  if (tyLeHong > nguong.hongPhanTram) {
    return {
      tamDung: true,
      ma: "ty-le-hong",
      lyDo: `Tỷ lệ thư bị trả lại vĩnh viễn ${so2(tyLeHong)}% (${hong}/${mau} thư) vượt ngưỡng ${so2(nguong.hongPhanTram)}%. Danh sách có nhiều địa chỉ không còn dùng — lọc lại trước khi tiếp tục.`,
    };
  }
  return { tamDung: false };
}

// --- Amazon SES qua SMTP (EG-01) ---------------------------------------------

export const VUNG_SES_MAC_DINH = "ap-southeast-1";
export const LA_VUNG_AWS = /^[a-z]{2}(-[a-z]+)+-\d$/;
/** Giá trị thẻ SES chỉ gồm [A-Za-z0-9_-] (giới hạn của SES); tên thẻ cũng vậy. */
export const LA_GIA_TRI_THE_SES = /^[A-Za-z0-9_-]{1,256}$/;
export const THE_SES = { tenant: "cowork_tenant", nguoiNhan: "cowork_recipient" } as const;

/** Cổng SMTP của SES theo vùng: email-smtp.<vùng>.amazonaws.com:587, STARTTLS. */
export function mayChuSmtpSes(vung: string): { host: string; port: number; baoMat: "starttls" } {
  if (!LA_VUNG_AWS.test(vung)) throw new Error(`Vùng SES không hợp lệ: ${vung}`);
  return { host: `email-smtp.${vung}.amazonaws.com`, port: 587, baoMat: "starttls" };
}

/**
 * Tiêu đề phụ cho SES: configuration set (để SES đẩy sự kiện qua SNS) và thẻ để khớp sự kiện về
 * đúng doanh nghiệp + người nhận. Giá trị sai khuôn bị **bỏ**, không bao giờ chèn ký tự lạ vào tiêu đề.
 */
export function tieuDeSes(configurationSet: string | null | undefined, the: Record<string, string>): Record<string, string> {
  const ra: Record<string, string> = {};
  if (configurationSet && /^[A-Za-z0-9_-]{1,64}$/.test(configurationSet)) ra["X-SES-CONFIGURATION-SET"] = configurationSet;
  const cap = Object.entries(the).filter(([k, v]) => LA_GIA_TRI_THE_SES.test(k) && LA_GIA_TRI_THE_SES.test(v));
  if (cap.length) ra["X-SES-MESSAGE-TAGS"] = cap.map(([k, v]) => `${k}=${v}`).join(", ");
  return ra;
}

/** Mã thư SES từ câu trả lời SMTP sau DATA: "250 Ok 0100018f…-000000" (có thể có <…>). Không khớp → null. */
export function docMaThuSes(phanHoi: string | null | undefined): string | null {
  const m = /^250[ -]Ok\s+<?([A-Za-z0-9._@-]{10,200})>?\s*$/i.exec((phanHoi ?? "").trim());
  return m ? m[1] : null;
}

/**
 * Thời điểm trong tệp CSV sổ đồng ý → Date. Nhận "dd/mm/yyyy", "dd/mm/yyyy hh:mm", "yyyy-mm-dd",
 * "yyyy-mm-dd hh:mm" (giờ Việt Nam) và ISO-8601 có múi giờ. Sai / ngày không có thật → null.
 */
export function docThoiDiem(s: string): Date | null {
  const t = s.trim();
  let nam: number, thang: number, ngay: number, gio = 0, phut = 0;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(t);
  if (m) {
    [ngay, thang, nam] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4]) [gio, phut] = [Number(m[4]), Number(m[5])];
  } else if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/.exec(t))) {
    [nam, thang, ngay] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (m[4]) [gio, phut] = [Number(m[4]), Number(m[5])];
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  } else return null;
  if (gio > 23 || phut > 59) return null;
  const kiem = new Date(Date.UTC(nam, thang - 1, ngay));
  if (kiem.getUTCFullYear() !== nam || kiem.getUTCMonth() !== thang - 1 || kiem.getUTCDate() !== ngay) return null;
  return new Date(Date.UTC(nam, thang - 1, ngay, gio, phut) - LECH_VN_MS);
}

/** Vùng trong TopicArn SNS (arn:aws:sns:<vùng>:<tài khoản>:<tên>). Sai khuôn → null. */
export function vungCuaTopic(arn: string): string | null {
  const m = /^arn:aws(?:-[a-z]+)?:sns:([a-z]{2}(?:-[a-z]+)+-\d):\d{12}:[A-Za-z0-9_-]{1,256}$/.exec(arn);
  return m ? m[1] : null;
}

/** Nội dung thư xác nhận từ chối — không nhãn [QC], không theo dõi, không liên kết huỷ (không phải quảng cáo). */
export function dungThuXacNhanTuChoi(tenCongTy: string, nhanLuc: Date, dungTu: Date) {
  const cty = tenCongTy.trim() || "chúng tôi";
  const tieuDe = `Xác nhận từ chối nhận thư quảng cáo từ ${cty}`.replace(/[\r\n]+/g, " ").slice(0, 200);
  const dong = [
    "Xin chào,",
    `${cty} đã nhận được yêu cầu từ chối nhận thư quảng cáo của bạn lúc ${dinhDangNgayGio(nhanLuc)} (giờ Việt Nam).`,
    `Kể từ ${dinhDangNgayGio(dungTu)}, chúng tôi đã ngừng gửi thư quảng cáo tới địa chỉ email này.`,
    "Đây là thư xác nhận tự động, gửi một lần duy nhất. Bạn không cần làm gì thêm.",
  ];
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${thoatHtml(tieuDe)}</title></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">${dong.map((d) => `<p>${thoatHtml(d)}</p>`).join("")}</body></html>`;
  return { tieuDe, html, text: dong.join("\n\n") };
}

