import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { danhSachTangCa, taoDonTangCa } from "@/modules/cham-cong/don-tu";
import { LuocDoLocDon, LuocDoTangCa } from "@/modules/cham-cong/luoc-do";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachTangCa(nc, docTruyVan(req, LuocDoLocDon)), { quyen: "cham_cong.view" });
export const POST = xuLyApi(async (nc, req) => taoDonTangCa(nc, await docThan(req, LuocDoTangCa)), { quyen: "cham_cong.create" });
