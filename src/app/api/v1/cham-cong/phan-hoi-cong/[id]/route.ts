import { docThan, xuLyApi } from "@/lib/api";
import { giaiQuyetPhanHoi } from "@/modules/cham-cong/bang-cong";
import { LuocDoGiaiQuyetPhanHoi } from "@/modules/cham-cong/luoc-do";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => giaiQuyetPhanHoi(nc, id, await docThan(req, LuocDoGiaiQuyetPhanHoi)), { quyen: "cham_cong.update" });
