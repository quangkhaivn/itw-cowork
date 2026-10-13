import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaChienDich } from "@/modules/marketing/luoc-do";
import { chiTietChienDich, suaChienDich } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietChienDich(nc, id), { quyen: "marketing.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaChienDich(nc, id, await docThan(req, LuocDoSuaChienDich)), { quyen: "marketing.update" });
