import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoHuyHopDongBaoTri } from "@/modules/bao-tri/luoc-do";
import { huyHopDongBaoTri } from "@/modules/bao-tri/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => huyHopDongBaoTri(nc, id, (await docThan(req, LuocDoHuyHopDongBaoTri)).lyDo));
