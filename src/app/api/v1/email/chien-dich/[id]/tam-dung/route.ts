import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoLyDoTuyChon } from "@/modules/email/luoc-do";
import { tamDungChienDich } from "@/modules/email/service";

export const dynamic = "force-dynamic";

/** Ai soạn được chiến dịch cũng dừng được nó — dừng nhanh một chiến dịch gửi nhầm quan trọng hơn. */
export const POST = xuLyApi<{ id: string }>(
  async (nc, req, { id }) => tamDungChienDich(nc, id, (await docThan(req, LuocDoLyDoTuyChon)).lyDo),
  { quyen: "marketing.update" },
);
