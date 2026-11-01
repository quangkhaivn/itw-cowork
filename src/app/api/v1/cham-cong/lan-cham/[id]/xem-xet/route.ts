import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoXemXet } from "@/modules/cham-cong/luoc-do";
import { xemXetLanCham } from "@/modules/cham-cong/service";

export const dynamic = "force-dynamic";

/** POST — quản lý chấp nhận / không chấp nhận một lần chấm GPS bị gắn cờ (NS-12). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => xemXetLanCham(nc, id, await docThan(req, LuocDoXemXet)));
