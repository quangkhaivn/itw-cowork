import { docThan, xuLyApi } from "@/lib/api";
import { taoHopDong } from "@/modules/nhan-su/service";
import { LuocDoHopDong } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const POST = xuLyApi(async (nc, req) => taoHopDong(nc, await docThan(req, LuocDoHopDong)), { quyen: "nhan_su.create" });
