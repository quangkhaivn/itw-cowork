import { docThan, xuLyApi } from "@/lib/api";
import { danhSachLoaiNghi, taoLoaiNghi } from "@/modules/nhan-su/service";
import { LuocDoLoaiNghi } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachLoaiNghi(nc, req.nextUrl.searchParams.get("tatCa") !== "1"), { quyen: "cham_cong.view" });
export const POST = xuLyApi(async (nc, req) => taoLoaiNghi(nc, await docThan(req, LuocDoLoaiNghi)), { quyen: "nhan_su.create" });
