import { goiAnToan, LoiGoiMang, type PhanHoiAnToan, type YeuCauAnToan } from "../mang/goi-an-toan";
import type { LoiNenTang } from "../oauth-thuan";
import { cauLoiGon } from "../tinh-toan";
import type { BuocGoi, LoiPhanLoai } from "./kieu";

/**
 * Gọi API nền tảng dùng chung cho Facebook / Instagram / YouTube (0.24.0): qua lớp chống SSRF (`goiAnToan`), phân loại
 * lỗi theo bộ phân loại của nền tảng, ghi một bước nhật ký với TRÍCH ĐOẠN AN TOÀN (danh sách trường biết trước — không
 * bao giờ có access_token, tiêu đề Authorization, URL phiên tải lên).
 */

const TRUONG_AN_TOAN = [
  "id", "post_id", "status", "status_code", "permalink", "permalink_url", "success", "video_id", "upload_session_id",
  "start_offset", "end_offset", "media_type", "is_published", "uploadStatus", "privacyStatus", "kind",
];

export function docJson(ph: PhanHoiAnToan): unknown {
  try {
    return JSON.parse(ph.than.toString("utf8"));
  } catch {
    return undefined;
  }
}

export function trichDoanAnToan(j: unknown): Record<string, unknown> | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const kq: Record<string, unknown> = {};
  for (const k of TRUONG_AN_TOAN) {
    const v = o[k];
    if (v === undefined) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") kq[k] = typeof v === "string" ? cauLoiGon(v, 300) : v;
    else if (k === "status" && v && typeof v === "object") {
      const s = v as Record<string, unknown>;
      kq.status = { video_status: s.video_status, uploadStatus: s.uploadStatus, privacyStatus: s.privacyStatus };
    }
  }
  const e = o.error as { message?: unknown; code?: unknown; error_subcode?: unknown } | string | undefined;
  if (typeof e === "string") kq.error = cauLoiGon(e, 100);
  else if (e && typeof e === "object") kq.error = { message: cauLoiGon(e.message ?? "", 200), code: e.code ?? null, error_subcode: e.error_subcode ?? null };
  return Object.keys(kq).length ? kq : null;
}

const KQ: Record<LoiPhanLoai["loai"], BuocGoi["ketQua"]> = { RETRYABLE: "retryable", PERMANENT: "permanent", NEEDS_REAUTH: "needs_reauth", UNKNOWN: "unknown" };

export function loiTuMangChung(e: unknown, laGhi: boolean, ten: string): LoiPhanLoai {
  if (e instanceof LoiGoiMang) {
    if (e.loai === "chan-dia-chi" || e.loai === "giao-thuc") return { loai: "PERMANENT", ma: e.loai, thongBao: `${ten}: ${e.message}`, httpStatus: null };
    if (e.daGui && laGhi) return { loai: "UNKNOWN", ma: e.loai, thongBao: `${ten}: ${e.message}`, httpStatus: null };
    return { loai: "RETRYABLE", ma: e.loai, thongBao: `${ten}: ${e.message}`, httpStatus: null };
  }
  return { loai: laGhi ? "UNKNOWN" : "RETRYABLE", ma: "loi-khac", thongBao: `${ten}: ${cauLoiGon(e, 200)}`, httpStatus: null };
}

const THAM_SO_BI_MAT = ["access_token", "appsecret_proof", "client_secret", "code", "fb_exchange_token", "refresh_token", "upload_id", "token"];

/**
 * Che bí mật trong lỗi do nền tảng / proxy trả về (theo luật QA 0.23.0 — áp cho mọi connector): máy chủ (proxy, cổng
 * gỡ lỗi) có thể NHẠI LẠI tiêu đề Authorization, token trong URL, URI phiên tải lên. Thông báo lỗi được lưu vào kênh-bài,
 * nhật ký gọi, thông báo và hiện cho người chỉ có `mxh.view` → che mọi dạng (nguyên văn, mã hóa URL) trước khi lưu / trả.
 */
export function boCheYeuCau(yc: Pick<YeuCauAnToan, "url" | "tieuDe" | "than">): (s: string) => string {
  const ds = new Set<string>();
  const auth = yc.tieuDe?.Authorization ?? "";
  const m = /^(?:Bearer|OAuth|Basic)\s+(.+)$/.exec(auth);
  if (m) {
    ds.add(m[1]);
    if (auth.startsWith("Basic ")) {
      const ro = Buffer.from(m[1], "base64").toString("utf8");
      ds.add(ro);
      ds.add(ro.split(":").slice(1).join(":"));
    }
  }
  const them = (q: URLSearchParams) => {
    for (const k of THAM_SO_BI_MAT) {
      const v = q.get(k);
      if (v) ds.add(v);
    }
  };
  try {
    const u = new URL(yc.url);
    them(u.searchParams);
    if (u.searchParams.get("upload_id")) ds.add(yc.url);
  } catch {
    /* URL sai — goiAnToan tự báo */
  }
  if (typeof yc.than === "string" && !yc.than.trimStart().startsWith("{")) them(new URLSearchParams(yc.than));
  const danhSach = [...ds].filter((x) => x.length >= 6).flatMap((x) => [x, encodeURIComponent(x)]).sort((a, b) => b.length - a.length);
  if (!danhSach.length) return (s) => s;
  return (s) => danhSach.reduce((kq, b) => kq.split(b).join("***"), s);
}

export type KetQuaGoi = { ok: true; ph: PhanHoiAnToan; j: unknown } | ({ ok: false; ph: PhanHoiAnToan | null; j: unknown } & LoiPhanLoai);

export async function goiNenTang(
  nhatKy: BuocGoi[],
  kieu: BuocGoi["kieu"],
  laGhi: boolean,
  yc: YeuCauAnToan,
  phanLoai: (status: number, j: unknown) => LoiNenTang,
  ten: string,
  /** Mã HTTP coi là "thành công" ngoài 2xx (YouTube 308 Resume Incomplete). */
  them: number[] = [],
): Promise<KetQuaGoi> {
  const batDau = new Date();
  const che = boCheYeuCau(yc);
  const trich = (j: unknown) => {
    const t = trichDoanAnToan(j);
    return t ? (JSON.parse(che(JSON.stringify(t))) as Record<string, unknown>) : null;
  };
  try {
    const ph = await goiAnToan(yc);
    const j = docJson(ph);
    if ((ph.status >= 200 && ph.status < 300) || them.includes(ph.status)) {
      nhatKy.push({ kieu, ketQua: "success", loaiLoi: null, httpStatus: ph.status, thongBao: null, trichDoan: trich(j), batDau, ketThuc: new Date() });
      return { ok: true, ph, j };
    }
    const pl = phanLoai(ph.status, j);
    const loi: LoiPhanLoai = { loai: pl.loai, ma: che(pl.ma).slice(0, 100), thongBao: che(pl.thongBao), httpStatus: ph.status, ...(pl.hoanMs !== undefined ? { hoanMs: pl.hoanMs } : {}) };
    nhatKy.push({ kieu, ketQua: KQ[loi.loai], loaiLoi: loi.loai, httpStatus: ph.status, thongBao: loi.thongBao, trichDoan: trich(j), batDau, ketThuc: new Date() });
    return { ok: false, ph, j, ...loi };
  } catch (e) {
    const goc = loiTuMangChung(e, laGhi, ten);
    const loi = { ...goc, thongBao: che(goc.thongBao) };
    nhatKy.push({ kieu, ketQua: KQ[loi.loai], loaiLoi: loi.loai, httpStatus: null, thongBao: loi.thongBao, trichDoan: null, batDau, ketThuc: new Date() });
    return { ok: false, ph: null, j: undefined, ...loi };
  }
}

/** Sửa bước cuối của nhật ký (ví dụ phản hồi 2xx nhưng thiếu mã → UNKNOWN). */
export function doiBuocCuoi(nhatKy: BuocGoi[], doi: Partial<BuocGoi>) {
  if (nhatKy.length) nhatKy[nhatKy.length - 1] = { ...nhatKy[nhatKy.length - 1], ...doi };
}

export const nguMacDinh = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
