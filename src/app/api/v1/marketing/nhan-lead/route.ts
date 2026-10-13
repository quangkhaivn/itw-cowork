import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoDanhSachNhanLead } from "@/modules/marketing/luoc-do";
import { cauHinhNhanLead, datDanhSachNhanLead } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => cauHinhNhanLead(nc), { quyen: "marketing.view" });

export const PUT = xuLyApi(async (nc, req) => datDanhSachNhanLead(nc, (await docThan(req, LuocDoDanhSachNhanLead)).nguoiIds), { quyen: "marketing.update" });
