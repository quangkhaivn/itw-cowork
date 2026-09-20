import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoBoQuaGiaHan } from "@/modules/bao-tri/luoc-do";
import { boQuaGiaHan } from "@/modules/bao-tri/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => boQuaGiaHan(nc, id, (await docThan(req, LuocDoBoQuaGiaHan)).lyDo));
