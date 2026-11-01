import { docThan, xuLyApi } from "@/lib/api";
import { danhSachCa, taoCa } from "@/modules/nhan-su/service";
import { LuocDoCa } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachCa(nc), { quyen: "nhan_su.view" });
export const POST = xuLyApi(async (nc, req) => taoCa(nc, await docThan(req, LuocDoCa)), { quyen: "nhan_su.create" });
