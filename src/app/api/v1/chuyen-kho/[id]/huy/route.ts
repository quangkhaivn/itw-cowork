import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHuyChuyenKho } from "@/modules/chuyen-kho/luoc-do";
import { huyChuyenKho } from "@/modules/chuyen-kho/service";

export const dynamic = "force-dynamic";

/** Chỉ hủy được phiếu còn nháp (CK-06). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const d = await docThan(req, LuocDoHuyChuyenKho);
  return huyChuyenKho(nc, id, d.lyDo);
});
