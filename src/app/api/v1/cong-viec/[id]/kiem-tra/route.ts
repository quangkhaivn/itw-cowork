import { docTruyVan, xuLyApi } from "@/lib/api";
import { kiemTraViec, LuocDoKiemTraViec } from "@/modules/cong-viec/service";

export const dynamic = "force-dynamic";

/** CV-06: xem trước — bấm "Xong" bây giờ thì máy có cho không, còn thiếu gì. Không ghi gì. */
export const GET = xuLyApi<{ id: string }>(async (nc, req, { id }) => kiemTraViec(nc, id, docTruyVan(req, LuocDoKiemTraViec)), { quyen: "task.view" });
