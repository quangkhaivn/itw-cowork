import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocCoHoi, LuocDoTaoCoHoi } from "@/modules/co-hoi/luoc-do";
import { danhSachCoHoi, taoCoHoi } from "@/modules/co-hoi/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachCoHoi(nc, docTruyVan(req, LuocDoLocCoHoi)), { quyen: "sales.view" });

export const POST = xuLyApi(async (nc, req) => taoCoHoi(nc, await docThan(req, LuocDoTaoCoHoi)));
