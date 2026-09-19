import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaLienHe } from "@/modules/khach-hang/luoc-do";
import { suaLienHe } from "@/modules/khach-hang/service";

export const dynamic = "force-dynamic";

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaLienHe(nc, id, await docThan(req, LuocDoSuaLienHe)));
