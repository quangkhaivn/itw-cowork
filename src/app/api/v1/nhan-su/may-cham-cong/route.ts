import { docThan, xuLyApi } from "@/lib/api";
import { danhSachMay, taoMay } from "@/modules/cham-cong/may-cham-cong";
import { LuocDoMayChamCong } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachMay(nc));
export const POST = xuLyApi(async (nc, req) => taoMay(nc, await docThan(req, LuocDoMayChamCong)), { quyen: "nhan_su.create" });
