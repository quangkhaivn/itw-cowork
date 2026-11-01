import { docThan, xuLyApi } from "@/lib/api";
import { dieuChinhPhep } from "@/modules/nhan-su/service";
import { LuocDoDieuChinhPhep } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const POST = xuLyApi(async (nc, req) => dieuChinhPhep(nc, await docThan(req, LuocDoDieuChinhPhep)), { quyen: "nhan_su.update" });
