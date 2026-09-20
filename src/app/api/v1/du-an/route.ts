import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocDuAn, LuocDoTaoDuAn } from "@/modules/du-an/luoc-do";
import { danhSachDuAn, taoDuAn } from "@/modules/du-an/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachDuAn(nc, docTruyVan(req, LuocDoLocDuAn)), { quyen: "project.view" });

export const POST = xuLyApi(async (nc, req) => taoDuAn(nc, await docThan(req, LuocDoTaoDuAn)));
