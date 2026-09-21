import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHuyDeNghi } from "@/modules/mua-hang/luoc-do";
import { huyDeNghi } from "@/modules/mua-hang/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => huyDeNghi(nc, id, (await docThan(req, LuocDoHuyDeNghi)).lyDo));
