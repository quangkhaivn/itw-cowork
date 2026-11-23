import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { LoiNghiepVu } from "@/lib/loi";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { kiemNganSach, phanTramDaDung, thangVN, type DaDung, type GiaAI, type HanNganSach } from "./ngan-sach-thuan";

/**
 * Ngân sách AI theo tháng (0.25.0, QĐ-236) — đếm theo doanh nghiệp, từng lượt gọi một dòng `ai_usage_logs`.
 *
 * Giữ chỗ TRƯỚC khi gọi mô hình: khóa tư vấn theo doanh nghiệp (`pg_advisory_xact_lock`) → cộng đã dùng của tháng (lượt
 * đang gọi tính theo phần giữ chỗ) → còn đủ cho phần ước tính tối đa của lượt mới thì ghi dòng "dang-goi". Hai người bấm
 * cùng lúc không cùng lọt qua khi chỉ còn chỗ cho một. Gọi xong ghi số token thật + chi phí (một lần — trigger).
 * Lượt hỏng giữa chừng (máy chủ tắt) vẫn tính phần giữ chỗ — thừa còn hơn thiếu; Quản trị nâng ngân sách nếu cần.
 */

export const TINH_NANG_VIET_BAI = "mxh-viet-bai";

export async function docNganSach(tx: ClientTenant): Promise<{ han: HanNganSach; gia: GiaAI }> {
  const token = await docCauHinh(tx, "mxh.ai_ngan_sach_token_thang");
  const vnd = await docCauHinh(tx, "mxh.ai_ngan_sach_vnd_thang");
  const vao = await docCauHinh(tx, "mxh.ai_gia_vnd_trieu_token_vao");
  const ra = await docCauHinh(tx, "mxh.ai_gia_vnd_trieu_token_ra");
  return { han: { tokenThang: token, vndThang: vnd }, gia: { vndTrieuTokenVao: vao ?? 80_000, vndTrieuTokenRa: ra ?? 400_000 } };
}

/**
 * QA 0.25.0 (QĐ-247): lỗi mà KHÔNG biết mô hình đã chạy hay chưa (hết giờ chờ, đứt mạng, phản hồi hỏng, lỗi lạ) — nhà cung
 * cấp có thể đã chạy và tính tiền → vẫn tính PHẦN GIỮ CHỖ (thừa còn hơn thiếu, QĐ-236). Nhà cung cấp trả mã lỗi HTTP rõ
 * (`nha-cung-cap-<mã>`: từ chối trước khi chạy — quá tải, sai khóa, hết hạn mức) → hoàn phần giữ chỗ. Có số token thật thì
 * luôn tính theo số thật.
 */
export const LOI_CHUA_RO_DA_TON = ["het-thoi-gian", "loi-mang", "phan-hoi-hong", "loi-goi"] as const;
export function loiChuaRoDaTon(ma: string | null | undefined): boolean {
  return (LOI_CHUA_RO_DA_TON as readonly string[]).includes(ma ?? "");
}

export async function daDungThang(tx: ClientTenant, thang: string): Promise<DaDung & { soLuot: number }> {
  const r = await tx.$queryRaw<{ token: bigint | null; vnd: bigint | null; so: bigint }[]>`
    SELECT SUM(CASE
                 WHEN status = 'dang-goi' THEN tokens_reserved
                 WHEN tokens_in IS NULL AND tokens_out IS NULL
                   THEN (CASE WHEN status = 'xong' OR error_code IN ('het-thoi-gian', 'loi-mang', 'phan-hoi-hong', 'loi-goi') THEN tokens_reserved ELSE 0 END)
                 ELSE COALESCE(tokens_in, 0) + COALESCE(tokens_out, 0)
               END)::bigint AS token,
           SUM(cost_vnd)::bigint AS vnd,
           COUNT(*)::bigint AS so
    FROM ai_usage_logs WHERE month = ${thang}`;
  return { token: Number(r[0]?.token ?? 0), vnd: Number(r[0]?.vnd ?? 0), soLuot: Number(r[0]?.so ?? 0) };
}

export async function trangThaiNganSach(tx: ClientTenant, bayGio: Date = new Date()) {
  const thang = thangVN(bayGio);
  const { han, gia } = await docNganSach(tx);
  const daDung = await daDungThang(tx, thang);
  return { thang, daDung, han, gia, phanTram: phanTramDaDung(daDung, han), conDung: han.tokenThang !== 0 && han.vndThang !== 0 && (han.tokenThang === null || daDung.token < han.tokenThang) && (han.vndThang === null || daDung.vnd < han.vndThang) };
}

/** Khóa tư vấn ngân sách AI của doanh nghiệp (giữ tới hết giao dịch; gọi lại trong cùng giao dịch không sao). */
export async function khoaNganSach(nc: NguCanh): Promise<void> {
  await nc.tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ai-ngan-sach:${nc.tenantId}`}, 0))`;
}

/**
 * QA 0.25.0 (QĐ-245): có lượt cùng khóa lặp lại ĐANG GỌI mô hình → 409 `ai-dang-viet` (bấm đúp không gọi AI lần hai).
 * Gọi SAU `khoaNganSach` trong cùng giao dịch.
 */
export async function chanLuotTrungKhoa(nc: NguCanh, tinhNang: string, khoa: string | null): Promise<void> {
  if (!khoa) return;
  const dang = await nc.tx.aiUsageLog.findFirst({ where: { feature: tinhNang, idempotencyKey: khoa, status: "dang-goi" }, select: { id: true } });
  if (dang) throw new LoiNghiepVu("AI đang viết bài cho yêu cầu này (bấm hai lần) — chờ vài giây rồi mở danh sách bài nháp.", 409, "ai-dang-viet");
}

/** Giữ chỗ một lượt; vượt ngân sách → 409 `vuot-ngan-sach` / `ai-tat` kèm lời giải thích tiếng Việt. Trả mã lượt. */
export async function giuChoNganSach(nc: NguCanh, d: { tinhNang: string; duTruToken: number; duTruVnd: number; soMuc: number; khoaLapLai?: string | null }, bayGio: Date = new Date()): Promise<string> {
  await khoaNganSach(nc);
  await chanLuotTrungKhoa(nc, d.tinhNang, d.khoaLapLai ?? null);
  const thang = thangVN(bayGio);
  const { han } = await docNganSach(nc.tx);
  const daDung = await daDungThang(nc.tx, thang);
  const kq = kiemNganSach(daDung, { token: d.duTruToken, vnd: d.duTruVnd }, han);
  if (!kq.duoc) throw new LoiNghiepVu(kq.lyDo, 409, kq.ma, { daDung, han });
  const id = crypto.randomUUID();
  await nc.tx.aiUsageLog.create({
    data: { id, tenantId: nc.tenantId, userId: nc.hoSo.userId, feature: d.tinhNang, month: thang, status: "dang-goi", tokensReserved: d.duTruToken, costVnd: BigInt(d.duTruVnd), itemCount: d.soMuc, idempotencyKey: d.khoaLapLai ?? null },
  });
  return id;
}

/**
 * Ghi kết quả một lượt (một lần). Không có số token thật → giữ nguyên phần giữ chỗ khi "xong" hoặc khi lỗi chưa rõ đã tốn
 * (QĐ-247), 0 khi nhà cung cấp từ chối rõ.
 */
export async function ghiKetQuaLuotAI(tx: ClientTenant, id: string, d: { trangThai: "xong" | "loi"; tokenVao: number | null; tokenRa: number | null; chiPhiVnd: number | null; nhaCungCap: string | null; model: string | null; maLoi?: string | null }, bayGio: Date = new Date()) {
  const cu = await tx.aiUsageLog.findFirst({ where: { id }, select: { costVnd: true } });
  const chiPhi = d.chiPhiVnd ?? (d.trangThai === "xong" || loiChuaRoDaTon(d.maLoi) ? Number(cu?.costVnd ?? 0) : 0);
  await tx.aiUsageLog.update({
    where: { id },
    data: { status: d.trangThai, tokensIn: d.tokenVao, tokensOut: d.tokenRa, costVnd: BigInt(Math.max(0, chiPhi)), provider: d.nhaCungCap?.slice(0, 30) ?? null, model: d.model?.slice(0, 100) ?? null, errorCode: d.maLoi?.slice(0, 100) ?? null, finishedAt: bayGio },
  });
}
