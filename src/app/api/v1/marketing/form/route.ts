import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoForm } from "@/modules/marketing/luoc-do";
import { danhSachForm, taoForm } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachForm(nc), { quyen: "marketing.view" });

export const POST = xuLyApi(async (nc, req) => taoForm(nc, await docThan(req, LuocDoForm)), { quyen: "marketing.create" });
