import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoChotGiaHan } from "@/modules/bao-tri/luoc-do";
import { chotGiaHan } from "@/modules/bao-tri/service";

export const dynamic = "force-dynamic";

/** Chốt một dòng gia hạn thành cơ hội — đi qua đúng service tạo cơ hội (GH-03). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => chotGiaHan(nc, id, await docThan(req, LuocDoChotGiaHan)));
