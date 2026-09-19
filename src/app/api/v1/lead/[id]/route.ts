import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaLead } from "@/modules/lead/luoc-do";
import { chiTietLead, suaLead } from "@/modules/lead/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietLead(nc, id), { quyen: "crm.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaLead(nc, id, await docThan(req, LuocDoSuaLead)));
