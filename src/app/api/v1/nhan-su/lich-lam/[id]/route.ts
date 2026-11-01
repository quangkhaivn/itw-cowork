import { docThan, xuLyApi } from "@/lib/api";
import { suaLich } from "@/modules/nhan-su/service";
import { LuocDoLich } from "@/modules/nhan-su/luoc-do";

export const dynamic = "force-dynamic";

export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaLich(nc, id, await docThan(req, LuocDoLich)), { quyen: "nhan_su.update" });
