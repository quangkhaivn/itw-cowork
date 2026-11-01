import { docThan, xuLyApi } from "@/lib/api";
import { quyetDinhTangCa, tangCaThucTe } from "@/modules/cham-cong/don-tu";
import { LuocDoQuyetDinh } from "@/modules/cham-cong/luoc-do";

export const dynamic = "force-dynamic";

/** GET — giờ tăng ca thực tế tính từ lần chấm (NS-41). */
export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => tangCaThucTe(nc, id), { quyen: "cham_cong.view" });
/** POST { hanhDong, gioDuyet? } — duyệt / từ chối / hủy. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => quyetDinhTangCa(nc, id, await docThan(req, LuocDoQuyetDinh)));
