import { chuanHoaDsHashtag, ganHashtag } from "../bien-the";
import { LUAT } from "../luat-nen-tang";
import { NEN_TANG, type NenTang } from "../hang-so";
import { doDaiToiDa } from "./loi-nhac";
import { boKyTuVoHinh } from "./vo-hinh";

/**
 * Đọc đầu ra của AI (0.25.0, QĐ-238) — coi là CHỮ KHÔNG TIN CẬY, thuần:
 *  - chỉ nhận đúng khuôn JSON đã hẹn; khóa lạ bị bỏ; nền tảng không yêu cầu bị bỏ;
 *  - bỏ thẻ HTML, ký tự điều khiển, ký tự vô hình / đảo chiều (Unicode bidi), liên kết URL (đếm để cảnh báo);
 *  - cắt độ dài theo nền tảng; hashtag chuẩn hóa, tối đa 30;
 *  - giá trong bài không khớp giá thật của Cowork → cảnh báo (người duyệt kiểm).
 * Không bao giờ chạy / hiểu đầu ra như lệnh: nó chỉ thành nội dung NHÁP chờ người duyệt.
 */

export interface BienTheAI {
  tieuDe: string | null;
  noiDung: string;
  hashtags: string[];
}

export interface KetQuaAI {
  tieuDe: string | null;
  noiDung: string;
  hashtags: string[];
  bienThe: Partial<Record<NenTang, BienTheAI>>;
  canhBao: string[];
}

export class LoiKetQuaAI extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoiKetQuaAI";
  }
}

// QA 0.25.0 (QĐ-241): "mọi liên kết" gồm cả tên miền trần (bit.ly/…, zalo.me/…, shop.itw.vn) và email — Facebook / Zalo
// tự biến chúng thành liên kết bấm được. Lược trước khi lược URL có giao thức để không còn sót đuôi.
const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.[a-z]{2,}/giu;
const URL_RE = /\b(?:(?:https?|ftp):\/\/|www\.)[^\s<>"']+/gi;
const DUOI_MIEN = "com|net|org|vn|me|ly|io|co|info|biz|xyz|link|site|online|shop|store|app|dev|top|click|asia|tv|cc|gl|gg|to|so|ai|page|website|space|live|pro|blog|news|club|ws|us|uk|eu|ru|cn|jp|kr|tk|ml|ga|cf|gq|bit|be|fm|am|im";
const MIEN_TRAN_RE = new RegExp(`(?<![\\p{L}\\p{N}_@.-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+(?:${DUOI_MIEN})(?![\\p{L}\\p{N}_-])(?:[/?#][^\\s<>"']*)?`, "giu");
/** Cắt chuỗi ≤ `n` đơn vị UTF-16 mà không tách đôi cặp thay thế (emoji). */
function catKhongVoEmoji(s: string, n: number): string {
  if (s.length <= n) return s;
  const c = s.charCodeAt(n - 1);
  return s.slice(0, c >= 0xd800 && c <= 0xdbff ? n - 1 : n);
}

/** Làm sạch một chuỗi của AI. `demUrl` cộng dồn số liên kết đã bỏ. */
export function lamSach(s: unknown, toiDa: number, demUrl: { n: number }): string {
  if (typeof s !== "string") return "";
  let t = boKyTuVoHinh(s.normalize("NFC").replace(/\r\n?/g, "\n"));
  t = t.replace(/<\/?[a-z][^>]*>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const bo = () => {
    demUrl.n++;
    return "";
  };
  t = t.replace(EMAIL_RE, bo).replace(URL_RE, bo).replace(MIEN_TRAN_RE, bo);
  // Markdown đậm / tiêu đề → chữ thường.
  t = t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return t.length > toiDa ? `${catKhongVoEmoji(t, toiDa - 1).replace(/\s+\S*$/, "")}…` : t;
}

/** Lấy khối JSON đầu tiên trong chữ (AI đôi khi bọc trong ```json … ```). */
export function tachJson(chu: string): unknown {
  const s = chu.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const dau = s.indexOf("{");
  const cuoi = s.lastIndexOf("}");
  if (dau < 0 || cuoi <= dau) throw new LoiKetQuaAI("AI không trả về nội dung đúng khuôn (thiếu JSON). Thử lại.");
  try {
    return JSON.parse(s.slice(dau, cuoi + 1));
  } catch {
    throw new LoiKetQuaAI("AI trả về JSON hỏng. Thử lại.");
  }
}

function dsHashtag(x: unknown): string[] {
  return Array.isArray(x) ? chuanHoaDsHashtag(x.filter((h): h is string => typeof h === "string").slice(0, 60)) : [];
}

/** Số dạng "9.990" / "9,99" / "12" → số thực (dấu nhóm nghìn đầy đủ → bỏ; còn lại dấu phẩy / chấm là phần thập phân). */
function docSo(x: string): number {
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(x)) return Number(x.replace(/[.,]/g, ""));
  return Number(x.replace(",", "."));
}

/**
 * Số tiền trong bài → số nguyên VND: "12.500.000 đ", "25000 VND", và (QA 0.25.0, QĐ-241) dạng nói "9,99 triệu", "12,5 tr",
 * "15tr990", "9.990k", "500 nghìn" — AI hay viết giá kiểu này; trước đây không đọc ra nên giá bịa lọt qua không cảnh báo.
 * Dạng "k" chỉ nhận từ 10.000 đ trở lên (tránh "4K", "8K" của màn hình / camera).
 */
export function giaTrongBai(chu: string): number[] {
  const kq: { i: number; n: number }[] = [];
  for (const m of chu.matchAll(/(\d{1,3}(?:[.,\s]\d{3})+|\d{4,})\s*(?:đ|₫|vnđ|vnd|đồng)/giu)) {
    const n = Number(m[1].replace(/[.,\s]/g, ""));
    if (Number.isFinite(n) && n >= 1000) kq.push({ i: m.index ?? 0, n });
  }
  for (const m of chu.matchAll(/(?<![\p{L}\p{N}.,])(\d{1,4}(?:[.,]\d{1,3})?)\s*(triệu|tr)(?:\s*(\d{1,3})(?![\p{L}\p{N}]))?(?![\p{L}])/giu)) {
    const n = Math.round(docSo(m[1]) * 1_000_000 + (m[3] ? Number(m[3].padEnd(3, "0")) * 1000 : 0));
    if (Number.isFinite(n) && n >= 1000) kq.push({ i: m.index ?? 0, n });
  }
  for (const m of chu.matchAll(/(?<![\p{L}\p{N}.,])(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?|\d+)\s*(k|nghìn|ngàn)(?![\p{L}])/gu)) {
    const n = Math.round(docSo(m[1]) * 1000);
    if (Number.isFinite(n) && n >= 10_000) kq.push({ i: m.index ?? 0, n });
  }
  return kq.sort((a, b) => a.i - b.i).map((x) => x.n);
}

const demHashtag = (s: string) => (s.match(/(^|\s)#[^\s#]+/g) ?? []).length;

/**
 * QA 0.25.0 (QĐ-241): ép nội dung AI vừa LUẬT NỀN TẢNG tính trên nội dung SẼ ĐĂNG (đã gắn hashtag riêng của kênh — hàm
 * `ganHashtag`): Instagram ≤ 2.200 ký tự và ≤ 30 hashtag, YouTube ≤ 5.000 BYTE và không có "<" / ">", Facebook / WordPress
 * theo trần của chúng. Trước đây chỉ cắt THÂN bài theo số ký tự rồi gắn hashtag sau → bài AI qua được bước soạn nhưng bị
 * chặn 422 lúc gửi duyệt / đăng (YouTube tiếng Việt 4.500 ký tự ≈ 6–13 nghìn byte).
 */
export function vuaNenTang(nt: NenTang, noiDung: string, hashtags: readonly string[]): { noiDung: string; hashtags: string[] } {
  let than = nt === "YOUTUBE" ? noiDung.replace(/</g, "‹").replace(/>/g, "›") : noiDung;
  let tags = [...hashtags];
  if (nt === "INSTAGRAM") {
    const toiDa = LUAT.INSTAGRAM.hashtagToiDa;
    let i = 0;
    // Hashtag trong thân vượt trần → bỏ phần dư (giữ chữ), rồi chỉ gắn thêm số hashtag riêng còn chỗ.
    than = than.replace(/(^|\s)#([^\s#]+)/g, (m, dau: string, h: string) => (++i > toiDa ? `${dau}${h}` : m));
    const co = new Set((than.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.toLowerCase()));
    tags = tags.filter((h) => !co.has(h.toLowerCase())).slice(0, Math.max(0, toiDa - demHashtag(than)));
  }
  const doDai = (x: string) => (nt === "YOUTUBE" ? new TextEncoder().encode(x).length : x.length);
  const tran = nt === "YOUTUBE" ? LUAT.YOUTUBE.moTaToiDaByte : nt === "INSTAGRAM" ? LUAT.INSTAGRAM.noiDungToiDa : nt === "FACEBOOK_PAGE" ? LUAT.FACEBOOK_PAGE.noiDungToiDa : nt === "WORDPRESS" ? LUAT.WORDPRESS.noiDungToiDa : 5000;
  for (let lan = 0; lan < 60 && doDai(ganHashtag(than, tags)) > tran; lan++) {
    const du = doDai(ganHashtag(than, tags)) - tran;
    const n = than.length - Math.max(1, nt === "YOUTUBE" ? Math.ceil(du / 3) : du) - 1;
    if (n < 20) {
      // Thân quá ngắn mà vẫn vượt (hashtag quá dài) → bỏ bớt hashtag.
      if (tags.length) tags.pop();
      else than = catKhongVoEmoji(than, Math.max(1, than.length - Math.max(1, du)));
      continue;
    }
    than = `${catKhongVoEmoji(than, n).replace(/\s+\S*$/, "")}…`;
  }
  return { noiDung: than, hashtags: tags };
}

/**
 * Đọc + làm sạch kết quả. `nenTang` = các nền tảng đã yêu cầu; `gia` = các mức giá thật (giá bán, giá gồm VAT).
 */
export function docKetQuaAI(chu: string, nenTang: readonly NenTang[], gia: ReadonlySet<number>): KetQuaAI {
  const j = tachJson(chu);
  if (!j || typeof j !== "object" || Array.isArray(j)) throw new LoiKetQuaAI("AI không trả về nội dung đúng khuôn. Thử lại.");
  const o = j as Record<string, unknown>;
  const url = { n: 0 };
  const noiDung = lamSach(o.noiDung, doDaiToiDa("CHUNG"), url);
  if (noiDung.length < 10) throw new LoiKetQuaAI("AI trả về nội dung quá ngắn / trống. Thử lại.");
  const tieuDe = lamSach(o.tieuDe, 100, url).replace(/\n+/g, " ") || null;
  const hashtags = dsHashtag(o.hashtags);
  const bienThe: Partial<Record<NenTang, BienTheAI>> = {};
  const bt = o.bienThe && typeof o.bienThe === "object" && !Array.isArray(o.bienThe) ? (o.bienThe as Record<string, unknown>) : {};
  const tieuDeYt = (x: string | null) => (x ? x.replace(/</g, "‹").replace(/>/g, "›") : x);
  for (const [k, v] of Object.entries(bt)) {
    if (!(NEN_TANG as readonly string[]).includes(k) || !nenTang.includes(k as NenTang) || !v || typeof v !== "object") continue;
    const x = v as Record<string, unknown>;
    const nd = lamSach(x.noiDung, doDaiToiDa(k as NenTang), url);
    if (!nd) continue;
    const vua = vuaNenTang(k as NenTang, nd, dsHashtag(x.hashtags));
    const td = lamSach(x.tieuDe, k === "YOUTUBE" ? 100 : 300, url).replace(/\n+/g, " ") || null;
    bienThe[k as NenTang] = { tieuDe: k === "YOUTUBE" ? tieuDeYt(td ?? tieuDe) : td, noiDung: vua.noiDung, hashtags: vua.hashtags };
  }
  // QA 0.25.0 (QĐ-241): nền tảng ĐÃ YÊU CẦU mà AI không trả biến thể và nội dung chung không vừa luật của nền tảng đó
  // (Instagram 2.200 ký tự, YouTube 5.000 byte / không "<>") → dựng biến thể từ nội dung chung đã ép vừa.
  for (const nt of nenTang) {
    if (bienThe[nt]) continue;
    const vua = vuaNenTang(nt, noiDung, hashtags);
    const canTieuDe = nt === "YOUTUBE" && tieuDe !== tieuDeYt(tieuDe);
    if (vua.noiDung === noiDung && vua.hashtags.join(" ") === hashtags.join(" ") && !canTieuDe) continue;
    bienThe[nt] = { tieuDe: nt === "YOUTUBE" ? tieuDeYt(tieuDe) : null, noiDung: vua.noiDung, hashtags: vua.hashtags };
  }
  const canhBao: string[] = [];
  if (url.n) canhBao.push(`Đã bỏ ${url.n} liên kết do AI viết — thêm liên kết thật bằng tay nếu cần.`);
  const chuGia = [noiDung, ...Object.values(bienThe).map((b) => b!.noiDung)].join("\n");
  const sai = [...new Set(giaTrongBai(chuGia).filter((n) => !gia.has(n)))];
  if (sai.length) canhBao.push(`Bài có số tiền không khớp giá bán trong Cowork: ${sai.map((n) => `${n.toLocaleString("vi-VN")} đ`).join(", ")} — người duyệt kiểm lại trước khi đăng.`);
  return { tieuDe, noiDung, hashtags, bienThe, canhBao };
}
