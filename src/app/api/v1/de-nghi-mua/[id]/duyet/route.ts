import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoQuyetDuyetDeNghi } from "@/modules/mua-hang/luoc-do";
import { quyetDuyetDeNghi } from "@/modules/mua-hang/service";

export const dynamic = "force-dynamic";

/** MH-02: người đề nghị KHÔNG tự duyệt, trừ khi có quyền duyệt phạm vi toàn công ty. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => quyetDuyetDeNghi(nc, id, await docThan(req, LuocDoQuyetDuyetDeNghi)));
