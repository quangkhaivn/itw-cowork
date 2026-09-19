import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoChuyenDoiLead } from "@/modules/lead/luoc-do";
import { chuyenDoiLead } from "@/modules/lead/service";

export const dynamic = "force-dynamic";

/** Chuyển đổi lead → khách hàng + liên hệ + (tùy chọn) cơ hội, trong một giao dịch (LD-05). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => chuyenDoiLead(nc, id, await docThan(req, LuocDoChuyenDoiLead)));
