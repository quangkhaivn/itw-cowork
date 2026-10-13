import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoDuyetNganSach } from "@/modules/marketing/luoc-do";
import { duyetNganSach } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => duyetNganSach(nc, id, await docThan(req, LuocDoDuyetNganSach)), { quyen: "marketing.approve" });
