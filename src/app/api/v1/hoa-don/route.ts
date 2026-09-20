import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocHoaDon, LuocDoTaoHoaDon } from "@/modules/tai-chinh/luoc-do";
import { danhSachHoaDon, taoHoaDon } from "@/modules/tai-chinh/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachHoaDon(nc, docTruyVan(req, LuocDoLocHoaDon)), { quyen: "finance.view" });

/** Lập hóa đơn từ đơn hàng đã xác nhận, hoặc lập tay cho khách (TC-01). */
export const POST = xuLyApi(async (nc, req) => taoHoaDon(nc, await docThan(req, LuocDoTaoHoaDon)));
