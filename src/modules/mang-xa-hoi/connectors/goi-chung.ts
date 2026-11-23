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
  try {
    const ph = await goiAnToan(yc);
    const j = docJson(ph);
    if ((ph.status >= 200 && ph.status < 300) || them.includes(ph.status)) {
      nhatKy.push({ kieu, ketQua: "success", loaiLoi: null, httpStatus: ph.status, thongBao: null, trichDoan: trichDoanAnToan(j), batDau, ketThuc: new Date() });
      return { ok: true, ph, j };
    }
    const pl = phanLoai(ph.status, j);
    const loi: LoiPhanLoai = { loai: pl.loai, ma: pl.ma, thongBao: pl.thongBao, httpStatus: ph.status, ...(pl.hoanMs !== undefined ? { hoanMs: pl.hoanMs } : {}) };
    nhatKy.push({ kieu, ketQua: KQ[loi.loai], loaiLoi: loi.loai, httpStatus: ph.status, thongBao: loi.thongBao, trichDoan: trichDoanAnToan(j), batDau, ketThuc: new Date() });
    return { ok: false, ph, j, ...loi };
  } catch (e) {
    const loi = loiTuMangChung(e, laGhi, ten);
    nhatKy.push({ kieu, ketQua: KQ[loi.loai], loaiLoi: loi.loai, httpStatus: null, thongBao: loi.thongBao, trichDoan: null, batDau, ketThuc: new Date() });
    return { ok: false, ph: null, j: undefined, ...loi };
  }
}

/** Sửa bước cuối của nhật ký (ví dụ phản hồi 2xx nhưng thiếu mã → UNKNOWN). */
export function doiBuocCuoi(nhatKy: BuocGoi[], doi: Partial<BuocGoi>) {
  if (nhatKy.length) nhatKy[nhatKy.length - 1] = { ...nhatKy[nhatKy.length - 1], ...doi };
}

export const nguMacDinh = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
