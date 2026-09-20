import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaKho } from "@/modules/kho/luoc-do";
import { batBuocThayKho, suaKho } from "@/modules/kho/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => batBuocThayKho(nc, id), { quyen: "inventory.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaKho(nc, id, await docThan(req, LuocDoSuaKho)));
