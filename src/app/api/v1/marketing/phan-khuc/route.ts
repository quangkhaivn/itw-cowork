import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoLuuPhanKhuc } from "@/modules/marketing/luoc-do";
import { danhSachPhanKhuc, luuPhanKhuc } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachPhanKhuc(nc), { quyen: "marketing.view" });

export const POST = xuLyApi(async (nc, req) => luuPhanKhuc(nc, null, await docThan(req, LuocDoLuuPhanKhuc)), { quyen: "marketing.create" });
