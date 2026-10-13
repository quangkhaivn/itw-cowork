import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoDongYNhanTin } from "@/modules/marketing/luoc-do";
import { doiDongYNhanTin } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

/** Ghi nhận đồng ý / từ chối nhận tin marketing (MK-13). Quyền kiểm trong service. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => doiDongYNhanTin(nc, "lead", id, await docThan(req, LuocDoDongYNhanTin)));
