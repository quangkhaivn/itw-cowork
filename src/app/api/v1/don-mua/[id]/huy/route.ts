import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHuyDonMua } from "@/modules/mua-hang/luoc-do";
import { huyDonMua } from "@/modules/mua-hang/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => huyDonMua(nc, id, (await docThan(req, LuocDoHuyDonMua)).lyDo));
