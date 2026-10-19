import { docThan, xuLyApi } from "@/lib/api";
import { chiTietViec, LuocDoSuaViec, suaViec } from "@/modules/cong-viec/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>(async (nc, _req, { id }) => chiTietViec(nc, id), { quyen: "task.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaViec(nc, id, await docThan(req, LuocDoSuaViec)));
