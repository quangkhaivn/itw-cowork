import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHuyPhieuThu } from "@/modules/tai-chinh/luoc-do";
import { huyPhieuThu } from "@/modules/tai-chinh/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => huyPhieuThu(nc, id, (await docThan(req, LuocDoHuyPhieuThu)).lyDo));
