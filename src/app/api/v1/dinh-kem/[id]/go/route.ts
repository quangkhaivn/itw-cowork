import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoGoTep } from "@/modules/dinh-kem/luoc-do";
import { goTep } from "@/modules/dinh-kem/service";

export const dynamic = "force-dynamic";

/** Gỡ tệp: xóa mềm, bắt buộc ghi lý do (DK-06). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const d = await docThan(req, LuocDoGoTep);
  return goTep(nc, id, d.lyDo);
});
