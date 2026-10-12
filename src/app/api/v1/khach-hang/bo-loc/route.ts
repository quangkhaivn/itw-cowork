import { docThan, xuLyApi } from "@/lib/api";
import { danhSachBoLoc, LuocDoLuuBoLoc, luuBoLoc } from "@/modules/khach-hang/bo-loc";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachBoLoc(nc), { quyen: "customer.view" });

export const POST = xuLyApi(async (nc, req) => luuBoLoc(nc, await docThan(req, LuocDoLuuBoLoc)), { quyen: "customer.view" });
