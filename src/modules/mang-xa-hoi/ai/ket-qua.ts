import { chuanHoaDsHashtag } from "../bien-the";
import { NEN_TANG, type NenTang } from "../hang-so";
import { doDaiToiDa } from "./loi-nhac";

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

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
// Ký tự điều khiển (trừ \n \t), vô hình (zero-width), đảo chiều (bidi), BOM.
const VO_HINH_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g;

/** Làm sạch một chuỗi của AI. `demUrl` cộng dồn số liên kết đã bỏ. */
export function lamSach(s: unknown, toiDa: number, demUrl: { n: number }): string {
  if (typeof s !== "string") return "";
  let t = s.normalize("NFC").replace(/\r\n?/g, "\n").replace(VO_HINH_RE, "");
  t = t.replace(/<\/?[a-z][^>]*>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  t = t.replace(URL_RE, () => {
    demUrl.n++;
    return "";
  });
  // Markdown đậm / tiêu đề → chữ thường.
  t = t.replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return t.length > toiDa ? `${t.slice(0, toiDa - 1).replace(/\s+\S*$/, "")}…` : t;
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

/** Số tiền trong bài: "12.500.000 đ", "12,5 triệu"… → số nguyên VND (chỉ dạng nhóm nghìn đầy đủ). */
export function giaTrongBai(chu: string): number[] {
  const kq: number[] = [];
  for (const m of chu.matchAll(/(\d{1,3}(?:[.,\s]\d{3})+|\d{4,})\s*(?:đ|₫|vnđ|vnd|đồng)/giu)) {
    const n = Number(m[1].replace(/[.,\s]/g, ""));
    if (Number.isFinite(n) && n >= 1000) kq.push(n);
  }
  return kq;
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
  const bienThe: Partial<Record<NenTang, BienTheAI>> = {};
  const bt = o.bienThe && typeof o.bienThe === "object" && !Array.isArray(o.bienThe) ? (o.bienThe as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(bt)) {
    if (!(NEN_TANG as readonly string[]).includes(k) || !nenTang.includes(k as NenTang) || !v || typeof v !== "object") continue;
    const x = v as Record<string, unknown>;
    const nd = lamSach(x.noiDung, doDaiToiDa(k as NenTang), url);
    if (!nd) continue;
    bienThe[k as NenTang] = { tieuDe: lamSach(x.tieuDe, k === "YOUTUBE" ? 100 : 300, url).replace(/\n+/g, " ") || null, noiDung: nd, hashtags: dsHashtag(x.hashtags) };
  }
  const canhBao: string[] = [];
  if (url.n) canhBao.push(`Đã bỏ ${url.n} liên kết do AI viết — thêm liên kết thật bằng tay nếu cần.`);
  const chuGia = [noiDung, ...Object.values(bienThe).map((b) => b!.noiDung)].join("\n");
  const sai = [...new Set(giaTrongBai(chuGia).filter((n) => !gia.has(n)))];
  if (sai.length) canhBao.push(`Bài có số tiền không khớp giá bán trong Cowork: ${sai.map((n) => `${n.toLocaleString("vi-VN")} đ`).join(", ")} — người duyệt kiểm lại trước khi đăng.`);
  return { tieuDe, noiDung, hashtags: dsHashtag(o.hashtags), bienThe, canhBao };
}
