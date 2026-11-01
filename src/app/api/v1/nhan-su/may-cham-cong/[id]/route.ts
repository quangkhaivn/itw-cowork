import { docThan, xuLyApi } from "@/lib/api";
import { suaMay } from "@/modules/cham-cong/may-cham-cong";
import { LuocDoSuaMayChamCong } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaMay(nc, id, await docThan(req, LuocDoSuaMayChamCong)), { quyen: "nhan_su.update" });
