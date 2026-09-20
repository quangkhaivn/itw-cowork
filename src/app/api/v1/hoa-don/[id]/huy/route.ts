import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHuyHoaDon } from "@/modules/tai-chinh/luoc-do";
import { huyHoaDon } from "@/modules/tai-chinh/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => huyHoaDon(nc, id, (await docThan(req, LuocDoHuyHoaDon)).lyDo));
