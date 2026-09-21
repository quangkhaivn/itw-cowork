import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHuyHoaDonMua } from "@/modules/cong-no-tra/luoc-do";
import { huyHoaDonMua } from "@/modules/cong-no-tra/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => huyHoaDonMua(nc, id, (await docThan(req, LuocDoHuyHoaDonMua)).lyDo));
