import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHoi } from "@/modules/tro-ly/luoc-do";
import { hoiDap } from "@/modules/tro-ly/service";

export const dynamic = "force-dynamic";

/** Một lượt hỏi đáp. Công cụ chạy với quyền của CHÍNH người hỏi (AI-01). */
export const POST = xuLyApi(async (nc, req) => {
  const d = await docThan(req, LuocDoHoi);
  return hoiDap(nc, { hoiThoaiId: d.hoiThoaiId || undefined, cauHoi: d.cauHoi });
});
