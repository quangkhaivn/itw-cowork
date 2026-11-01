import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoChamGps } from "@/modules/cham-cong/luoc-do";
import { chamCongGps } from "@/modules/cham-cong/service";

export const dynamic = "force-dynamic";

/** POST — bấm Vào ca / Ra ca trên điện thoại (NS-11 → NS-13). Giờ chấm là giờ máy chủ. */
export const POST = xuLyApi(async (nc, req) => chamCongGps(nc, await docThan(req, LuocDoChamGps)), { quyen: "cham_cong.create" });
