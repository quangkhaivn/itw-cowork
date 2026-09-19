import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaViec, suaViec } from "@/modules/cong-viec/service";

export const dynamic = "force-dynamic";

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaViec(nc, id, await docThan(req, LuocDoSuaViec)));
