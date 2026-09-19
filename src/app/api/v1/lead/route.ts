import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocLead, LuocDoTaoLead } from "@/modules/lead/luoc-do";
import { danhSachLead, taoLead } from "@/modules/lead/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachLead(nc, docTruyVan(req, LuocDoLocLead)), { quyen: "crm.view" });

export const POST = xuLyApi(async (nc, req) => taoLead(nc, await docThan(req, LuocDoTaoLead)));
