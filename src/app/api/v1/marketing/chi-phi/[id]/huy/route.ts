import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHuyChiPhi } from "@/modules/marketing/luoc-do";
import { huyChiPhi } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => huyChiPhi(nc, id, (await docThan(req, LuocDoHuyChiPhi)).lyDo), { quyen: "marketing.update" });
