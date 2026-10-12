import { xuLyApi } from "@/lib/api";
import { thuHoiWebhook } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => thuHoiWebhook(nc, id), { quyen: "marketing.update" });
