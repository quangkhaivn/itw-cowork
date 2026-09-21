import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHuyTraHang } from "@/modules/tra-hang/luoc-do";
import { huyTraHangMua } from "@/modules/tra-hang/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const d = await docThan(req, LuocDoHuyTraHang);
  return huyTraHangMua(nc, id, d.lyDo);
});
