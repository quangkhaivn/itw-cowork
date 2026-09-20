import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocDon, LuocDoTaoDon } from "@/modules/don-hang/luoc-do";
import { danhSachDonHang, taoDonHang } from "@/modules/don-hang/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachDonHang(nc, docTruyVan(req, LuocDoLocDon)), { quyen: "order.view" });

export const POST = xuLyApi(async (nc, req) => taoDonHang(nc, await docThan(req, LuocDoTaoDon)));
