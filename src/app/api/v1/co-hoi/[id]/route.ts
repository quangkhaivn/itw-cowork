import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaCoHoi } from "@/modules/co-hoi/luoc-do";
import { chiTietCoHoi, suaCoHoi } from "@/modules/co-hoi/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietCoHoi(nc, id), { quyen: "sales.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaCoHoi(nc, id, await docThan(req, LuocDoSuaCoHoi)));
