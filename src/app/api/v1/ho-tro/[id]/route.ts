import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaPhieu } from "@/modules/ho-tro/luoc-do";
import { chiTietPhieu, suaPhieu } from "@/modules/ho-tro/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietPhieu(nc, id), { quyen: "service_desk.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaPhieu(nc, id, await docThan(req, LuocDoSuaPhieu)));
