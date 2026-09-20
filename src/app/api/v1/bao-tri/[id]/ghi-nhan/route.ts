import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoGhiNhanBaoTri } from "@/modules/bao-tri/luoc-do";
import { ghiNhanBaoTri } from "@/modules/bao-tri/service";

export const dynamic = "force-dynamic";

/** Đã bảo trì xong một kỳ → đẩy mốc kỳ kế tiếp (BT-03). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => ghiNhanBaoTri(nc, id, await docThan(req, LuocDoGhiNhanBaoTri)));
