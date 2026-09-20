import { docTruyVan, xuLyApi } from "@/lib/api";
import { danhSachBaoHanh, LuocDoLocBaoHanh } from "@/modules/bao-hanh/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachBaoHanh(nc, docTruyVan(req, LuocDoLocBaoHanh)), { quyen: "service_desk.view" });
