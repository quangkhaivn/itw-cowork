import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaHopDongBaoTri } from "@/modules/bao-tri/luoc-do";
import { chiTietHopDongBaoTri, suaHopDongBaoTri } from "@/modules/bao-tri/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietHopDongBaoTri(nc, id), { quyen: "service_desk.view" });

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaHopDongBaoTri(nc, id, await docThan(req, LuocDoSuaHopDongBaoTri)));
