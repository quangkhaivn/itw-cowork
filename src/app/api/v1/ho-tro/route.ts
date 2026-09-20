import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocPhieu, LuocDoTaoPhieu } from "@/modules/ho-tro/luoc-do";
import { danhSachPhieu, taoPhieu } from "@/modules/ho-tro/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachPhieu(nc, docTruyVan(req, LuocDoLocPhieu)), { quyen: "service_desk.view" });

export const POST = xuLyApi(async (nc, req) => taoPhieu(nc, await docThan(req, LuocDoTaoPhieu)));
