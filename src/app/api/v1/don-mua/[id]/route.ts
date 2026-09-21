import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaDonMua } from "@/modules/mua-hang/luoc-do";
import { chiTietDonMua, suaDonMua } from "@/modules/mua-hang/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietDonMua(nc, id), { quyen: "purchasing.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaDonMua(nc, id, await docThan(req, LuocDoSuaDonMua)));
