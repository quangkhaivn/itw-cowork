import { docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocGiaHan } from "@/modules/bao-tri/luoc-do";
import { danhSachGiaHan } from "@/modules/bao-tri/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachGiaHan(nc, docTruyVan(req, LuocDoLocGiaHan)), { quyen: "service_desk.view" });
