import { z } from "zod";
import { docThan, xuLyApi } from "@/lib/api";
import { huyBaoHanh } from "@/modules/bao-hanh/service";

export const dynamic = "force-dynamic";

const LuocDo = z.object({ lyDo: z.string().trim().min(2, "Hủy bảo hành phải ghi lý do.").max(500) });

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => huyBaoHanh(nc, id, (await docThan(req, LuocDo)).lyDo));
