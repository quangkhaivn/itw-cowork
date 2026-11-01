import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { danhSachGiaiTrinh, taoGiaiTrinh } from "@/modules/cham-cong/don-tu";
import { LuocDoGiaiTrinh, LuocDoLocDon } from "@/modules/cham-cong/luoc-do";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachGiaiTrinh(nc, docTruyVan(req, LuocDoLocDon)), { quyen: "cham_cong.view" });
export const POST = xuLyApi(async (nc, req) => taoGiaiTrinh(nc, await docThan(req, LuocDoGiaiTrinh)), { quyen: "cham_cong.create" });
