import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocMau, LuocDoMau } from "@/modules/email/luoc-do";
import { danhSachMau, taoMau } from "@/modules/email/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachMau(nc, docTruyVan(req, LuocDoLocMau)), { quyen: "marketing.view" });
export const POST = xuLyApi(async (nc, req) => taoMau(nc, await docThan(req, LuocDoMau)), { quyen: "marketing.create" });
