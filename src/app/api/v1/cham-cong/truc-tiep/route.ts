import { docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocTrucTiep } from "@/modules/cham-cong/luoc-do";
import { bangTrucTiep } from "@/modules/cham-cong/truc-tiep";

export const dynamic = "force-dynamic";

/** GET — bảng chấm công trực tiếp (NS-60). Giao diện hỏi lại mỗi 10 giây; phạm vi theo `cham_cong.view`. */
export const GET = xuLyApi((nc, req) => bangTrucTiep(nc, docTruyVan(req, LuocDoLocTrucTiep)), { quyen: "cham_cong.view" });
