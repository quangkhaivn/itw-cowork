import { docThan, xuLyApi } from "@/lib/api";
import { quyetDinhGiaiTrinh } from "@/modules/cham-cong/don-tu";
import { LuocDoQuyetDinh } from "@/modules/cham-cong/luoc-do";

export const dynamic = "force-dynamic";

/** POST { hanhDong: duyet | tu-choi | huy } — quyền kiểm trong service (quản lý trực tiếp / phạm vi duyệt). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => quyetDinhGiaiTrinh(nc, id, await docThan(req, LuocDoQuyetDinh)));
