import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoLyDo } from "@/modules/email/luoc-do";
import { traVeNhapChienDich } from "@/modules/email/service";

export const dynamic = "force-dynamic";

/** Người duyệt trả chiến dịch về Nháp, kèm lý do. */
export const POST = xuLyApi<{ id: string }>(
  async (nc, req, { id }) => traVeNhapChienDich(nc, id, (await docThan(req, LuocDoLyDo)).lyDo),
  { quyen: "marketing.approve" },
);
