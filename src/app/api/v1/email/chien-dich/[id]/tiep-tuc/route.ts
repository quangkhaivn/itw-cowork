import { xuLyApi } from "@/lib/api";
import { tiepTucChienDich } from "@/modules/email/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => tiepTucChienDich(nc, id), { quyen: "marketing.approve" });
