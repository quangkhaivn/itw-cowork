import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHuyDon } from "@/modules/don-hang/luoc-do";
import { huyDon } from "@/modules/don-hang/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => huyDon(nc, id, (await docThan(req, LuocDoHuyDon)).lyDo));
