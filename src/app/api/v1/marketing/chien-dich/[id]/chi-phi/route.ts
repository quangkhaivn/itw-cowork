import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoChiPhi } from "@/modules/marketing/luoc-do";
import { ghiChiPhi } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => ghiChiPhi(nc, id, await docThan(req, LuocDoChiPhi)), { quyen: "marketing.update" });
