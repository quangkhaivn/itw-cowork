import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoLyDo } from "@/modules/email/luoc-do";
import { huyChienDich } from "@/modules/email/service";

export const dynamic = "force-dynamic";

/** Huỷ: quyền chi tiết (update hay approve) tùy trạng thái — kiểm trong service. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => huyChienDich(nc, id, (await docThan(req, LuocDoLyDo)).lyDo), {
  quyen: "marketing.update",
});
