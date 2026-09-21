import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHuyTraHang } from "@/modules/tra-hang/luoc-do";
import { huyTraHangBan } from "@/modules/tra-hang/service";

export const dynamic = "force-dynamic";

/** Chỉ hủy được phiếu còn nháp (TH-09). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const d = await docThan(req, LuocDoHuyTraHang);
  return huyTraHangBan(nc, id, d.lyDo);
});
