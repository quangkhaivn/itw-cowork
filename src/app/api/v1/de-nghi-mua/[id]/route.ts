import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaDeNghi } from "@/modules/mua-hang/luoc-do";
import { chiTietDeNghi, suaDeNghi } from "@/modules/mua-hang/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietDeNghi(nc, id), { quyen: "purchasing.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaDeNghi(nc, id, await docThan(req, LuocDoSuaDeNghi)));
