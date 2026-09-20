import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaDuAn } from "@/modules/du-an/luoc-do";
import { chiTietDuAn, suaDuAn } from "@/modules/du-an/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietDuAn(nc, id), { quyen: "project.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaDuAn(nc, id, await docThan(req, LuocDoSuaDuAn)));
