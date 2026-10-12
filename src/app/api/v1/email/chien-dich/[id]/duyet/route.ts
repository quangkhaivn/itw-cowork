import { xuLyApi } from "@/lib/api";
import { duyetChienDich } from "@/modules/email/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => duyetChienDich(nc, id), { quyen: "marketing.approve" });
