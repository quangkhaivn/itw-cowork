import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocBaoTri, LuocDoTaoHopDongBaoTri } from "@/modules/bao-tri/luoc-do";
import { danhSachHopDongBaoTri, taoHopDongBaoTri } from "@/modules/bao-tri/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachHopDongBaoTri(nc, docTruyVan(req, LuocDoLocBaoTri)), { quyen: "service_desk.view" });

export const POST = xuLyApi(async (nc, req) => taoHopDongBaoTri(nc, await docThan(req, LuocDoTaoHopDongBaoTri)));
