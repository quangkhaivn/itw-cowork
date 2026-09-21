import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHuyPhieuChi } from "@/modules/cong-no-tra/luoc-do";
import { huyPhieuChi } from "@/modules/cong-no-tra/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => huyPhieuChi(nc, id, (await docThan(req, LuocDoHuyPhieuChi)).lyDo));
