import { docThan } from "@/lib/api";
import { xuLyApiNhieuBuoc } from "@/lib/api-nhieu-buoc";
import { LuocDoHoi } from "@/modules/tro-ly/luoc-do";
import { hoiDap } from "@/modules/tro-ly/service";

export const dynamic = "force-dynamic";

/**
 * Một lượt hỏi đáp. Công cụ chạy với quyền của CHÍNH người hỏi (AI-01).
 * Nhiều bước (QĐ-89): gọi mô hình nằm NGOÀI giao dịch CSDL; mỗi bước đọc/ghi là một giao dịch ngắn.
 */
export const POST = xuLyApiNhieuBuoc(async (nb, req) => {
  const d = await docThan(req, LuocDoHoi);
  return hoiDap(nb, { hoiThoaiId: d.hoiThoaiId || undefined, cauHoi: d.cauHoi });
});
