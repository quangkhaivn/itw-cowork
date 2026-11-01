import { docThan, xuLyApi } from "@/lib/api";
import { danhSachLich, taoLich } from "@/modules/nhan-su/service";
import { LuocDoLich } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachLich(nc), { quyen: "nhan_su.view" });
export const POST = xuLyApi(async (nc, req) => taoLich(nc, await docThan(req, LuocDoLich)), { quyen: "nhan_su.create" });
