import { docThan, xuLyApi } from "@/lib/api";
import { chiTietLanding, LuocDoLanding, suaLanding } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietLanding(nc, id), { quyen: "marketing.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaLanding(nc, id, await docThan(req, LuocDoLanding)), { quyen: "marketing.update" });
