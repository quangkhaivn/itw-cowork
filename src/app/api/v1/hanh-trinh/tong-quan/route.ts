import { docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoPheu } from "@/modules/hanh-trinh/luoc-do";
import { tongQuanHanhTrinh } from "@/modules/hanh-trinh/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => tongQuanHanhTrinh(nc, docTruyVan(req, LuocDoPheu)), { quyen: "customer.view" });
