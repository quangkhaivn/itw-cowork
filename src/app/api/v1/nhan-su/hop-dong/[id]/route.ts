import { docThan, xuLyApi } from "@/lib/api";
import { suaHopDong } from "@/modules/nhan-su/service";
import { LuocDoSuaHopDong } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaHopDong(nc, id, await docThan(req, LuocDoSuaHopDong)), { quyen: "nhan_su.update" });
