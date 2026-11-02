import { docThan, xuLyApi } from "@/lib/api";
import { xinGiaHan, LuocDoXinGiaHan } from "@/modules/cong-viec/giao-viec";

export const dynamic = "force-dynamic";

/** DG-05: xin gia hạn — người giao duyệt. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => xinGiaHan(nc, id, await docThan(req, LuocDoXinGiaHan)));
