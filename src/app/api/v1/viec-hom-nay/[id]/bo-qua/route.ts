import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoBoQuaViec } from "@/modules/nhac-viec/luoc-do";
import { boQuaViec } from "@/modules/nhac-viec/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => boQuaViec(nc, id, (await docThan(req, LuocDoBoQuaViec)).lyDo));
