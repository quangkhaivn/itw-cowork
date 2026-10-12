import { xuLyApi } from "@/lib/api";
import { doiKhoaWebhook } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => doiKhoaWebhook(nc, id), { quyen: "marketing.update" });
