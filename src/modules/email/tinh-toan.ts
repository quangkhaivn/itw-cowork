import { z } from "zod";

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
export function dungThu(tieuDeMau: string, khoi: Khoi[], bien: GiaTriBien, chan: ChanThu, theoDoi?: TheoDoi): ThuDaDung {
  const tieuDe = thayBien(tieuDeMau, bien).replace(/[\r\n]+/g, " ").trim();
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

export type LyDoLoai = "khong-co-email" | "email-khong-hop-le" | "trung-email" | "da-tu-choi" | "email-hong";

export const NHAN_LY_DO_LOAI: Record<LyDoLoai, string> = {
  "khong-co-email": "Không có email",
  "email-khong-hop-le": "Email sai định dạng",
  "trung-email": "Trùng email với người nhận khác trong chiến dịch",
  "da-tu-choi": "Đã từ chối nhận tin",
  "email-hong": "Email hỏng (máy chủ nhận từng từ chối hẳn)",
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
    else if (u.tuChoiLuc || danhSachChan.get(email) === "huy-nhan-tin") biLoai.push({ ...u, email, lyDo: "da-tu-choi" });
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
