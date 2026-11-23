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

export async function daDungThang(tx: ClientTenant, thang: string): Promise<DaDung & { soLuot: number }> {
  const r = await tx.$queryRaw<{ token: bigint | null; vnd: bigint | null; so: bigint }[]>`
    SELECT SUM(CASE
                 WHEN status = 'dang-goi' THEN tokens_reserved
                 WHEN tokens_in IS NULL AND tokens_out IS NULL THEN (CASE WHEN status = 'xong' THEN tokens_reserved ELSE 0 END)
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

/** Giữ chỗ một lượt; vượt ngân sách → 409 `vuot-ngan-sach` / `ai-tat` kèm lời giải thích tiếng Việt. Trả mã lượt. */
export async function giuChoNganSach(nc: NguCanh, d: { tinhNang: string; duTruToken: number; duTruVnd: number; soMuc: number }, bayGio: Date = new Date()): Promise<string> {
  await nc.tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ai-ngan-sach:${nc.tenantId}`}, 0))`;
  const thang = thangVN(bayGio);
  const { han } = await docNganSach(nc.tx);
  const daDung = await daDungThang(nc.tx, thang);
  const kq = kiemNganSach(daDung, { token: d.duTruToken, vnd: d.duTruVnd }, han);
  if (!kq.duoc) throw new LoiNghiepVu(kq.lyDo, 409, kq.ma, { daDung, han });
  const id = crypto.randomUUID();
  await nc.tx.aiUsageLog.create({
    data: { id, tenantId: nc.tenantId, userId: nc.hoSo.userId, feature: d.tinhNang, month: thang, status: "dang-goi", tokensReserved: d.duTruToken, costVnd: BigInt(d.duTruVnd), itemCount: d.soMuc, createdAt: bayGio },
  });
  return id;
}

/** Ghi kết quả một lượt (một lần). Không có số token thật → giữ nguyên phần giữ chỗ khi "xong", 0 khi "loi". */
export async function ghiKetQuaLuotAI(tx: ClientTenant, id: string, d: { trangThai: "xong" | "loi"; tokenVao: number | null; tokenRa: number | null; chiPhiVnd: number | null; nhaCungCap: string | null; model: string | null; maLoi?: string | null }, bayGio: Date = new Date()) {
  const cu = await tx.aiUsageLog.findFirst({ where: { id }, select: { costVnd: true } });
  const chiPhi = d.chiPhiVnd ?? (d.trangThai === "xong" ? Number(cu?.costVnd ?? 0) : 0);
  await tx.aiUsageLog.update({
    where: { id },
    data: { status: d.trangThai, tokensIn: d.tokenVao, tokensOut: d.tokenRa, costVnd: BigInt(Math.max(0, chiPhi)), provider: d.nhaCungCap?.slice(0, 30) ?? null, model: d.model?.slice(0, 100) ?? null, errorCode: d.maLoi?.slice(0, 100) ?? null, finishedAt: bayGio },
  });
}
