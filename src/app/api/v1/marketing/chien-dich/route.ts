import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocChienDich, LuocDoTaoChienDich } from "@/modules/marketing/luoc-do";
import { danhSachChienDich, taoChienDich } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachChienDich(nc, docTruyVan(req, LuocDoLocChienDich)), { quyen: "marketing.view" });

export const POST = xuLyApi(async (nc, req) => taoChienDich(nc, await docThan(req, LuocDoTaoChienDich)), { quyen: "marketing.create" });
