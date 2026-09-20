import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoXinDuyet } from "@/modules/bao-gia/luoc-do";
import { xinDuyet } from "@/modules/bao-gia/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => xinDuyet(nc, id, (await docThan(req, LuocDoXinDuyet)).ghiChu ?? null));
