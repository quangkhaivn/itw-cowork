import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoLoaiLead } from "@/modules/lead/luoc-do";
import { loaiLead } from "@/modules/lead/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => loaiLead(nc, id, (await docThan(req, LuocDoLoaiLead)).lyDo));
