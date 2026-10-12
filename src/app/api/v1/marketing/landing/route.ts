import { docThan, xuLyApi } from "@/lib/api";
import { danhSachLanding, LuocDoLanding, taoLanding } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachLanding(nc), { quyen: "marketing.view" });

export const POST = xuLyApi(async (nc, req) => taoLanding(nc, await docThan(req, LuocDoLanding)), { quyen: "marketing.create" });
