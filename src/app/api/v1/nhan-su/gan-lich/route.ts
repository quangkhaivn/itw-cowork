import { docThan, xuLyApi } from "@/lib/api";
import { ganLich } from "@/modules/nhan-su/service";
import { LuocDoGanLich } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const POST = xuLyApi(async (nc, req) => ganLich(nc, await docThan(req, LuocDoGanLich)), { quyen: "nhan_su.update" });
