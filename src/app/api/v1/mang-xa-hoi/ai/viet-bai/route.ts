import { docThan } from "@/lib/api";
import { xuLyApiNhieuBuoc } from "@/lib/api-nhieu-buoc";
import { vietBaiAi } from "@/modules/mang-xa-hoi/ai/service";
import { LuocDoVietBaiAi } from "@/modules/mang-xa-hoi/luoc-do";

export const dynamic = "force-dynamic";

/**
 * AI viết bài từ sản phẩm → bài NHÁP do AI tạo (QĐ-237 → QĐ-239). Nhiều bước (QĐ-89): gọi mô hình nằm NGOÀI giao dịch.
 * Tiêu đề `Idempotency-Key` chống tạo trùng khi bấm hai lần.
 */
export const POST = xuLyApiNhieuBuoc(async (nb, req) => {
  const d = await docThan(req, LuocDoVietBaiAi);
  const khoa = req.headers.get("idempotency-key")?.trim().slice(0, 100) || d.khoaLapLai || null;
  return vietBaiAi(nb, { ...d, khoaLapLai: khoa });
}, { quyen: "mxh.create" });
