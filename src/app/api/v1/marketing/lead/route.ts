import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoNhapTayLead } from "@/modules/marketing/luoc-do";
import { nhapTayLead } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

/** Nhập tay một lead ở Marketing — đi qua đúng `nhanLead()` như form và webhook. */
export const POST = xuLyApi(async (nc, req) => nhapTayLead(nc, await docThan(req, LuocDoNhapTayLead)), { quyen: "marketing.create" });
