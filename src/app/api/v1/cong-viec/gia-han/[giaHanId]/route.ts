import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoQuyetDinhGiaHan, quyetDinhGiaHan } from "@/modules/cong-viec/giao-viec";

export const dynamic = "force-dynamic";

/** DG-05: người giao đồng ý / từ chối gia hạn. */
export const POST = xuLyApi<{ giaHanId: string }>(async (nc, req, { giaHanId }) => quyetDinhGiaHan(nc, giaHanId, await docThan(req, LuocDoQuyetDinhGiaHan)));
