import { xuLyApi } from "@/lib/api";
import { guiDuyetChienDich } from "@/modules/email/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => guiDuyetChienDich(nc, id), { quyen: "marketing.update" });
