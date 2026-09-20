import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoDieuChinh } from "@/modules/kho/luoc-do";
import { dieuChinhTon } from "@/modules/kho/service";

export const dynamic = "force-dynamic";

/** Điều chỉnh tồn sau kiểm kê — luôn phải có lý do (KHO-03). */
export const POST = xuLyApi(async (nc, req) => dieuChinhTon(nc, await docThan(req, LuocDoDieuChinh)));
