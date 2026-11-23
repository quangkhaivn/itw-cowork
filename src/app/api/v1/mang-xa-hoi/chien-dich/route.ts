import { docThan, xuLyApi } from "@/lib/api";
import { danhSachChienDich, taoChienDich } from "@/modules/mang-xa-hoi/chien-dich";
import { LuocDoChienDich } from "@/modules/mang-xa-hoi/luoc-do";

export const GET = xuLyApi((nc, req) => danhSachChienDich(nc, req.nextUrl.searchParams.get("luuTru") === "1"), { quyen: "mxh.view" });
export const POST = xuLyApi(async (nc, req) => taoChienDich(nc, await docThan(req, LuocDoChienDich)), { quyen: "mxh.update" });
