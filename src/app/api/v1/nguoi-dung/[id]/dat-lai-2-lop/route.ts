import { docThan, xuLyApi } from "@/lib/api";
import { datLai2Lop, LuocDoDatLai2Lop } from "@/modules/xac-thuc-2-lop/service";

export const dynamic = "force-dynamic";

/** Quản trị đặt lại 2 lớp cho người mất điện thoại (XT-08). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => datLai2Lop(nc, id, (await docThan(req, LuocDoDatLai2Lop)).lyDo), {
  quyen: "user.update",
});
