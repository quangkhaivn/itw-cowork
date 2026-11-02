import { docThan, xuLyApi } from "@/lib/api";
import { capNhatTienDo, LuocDoTienDo } from "@/modules/cong-viec/giao-viec";

export const dynamic = "force-dynamic";

/** DG-13: ghi một dòng tiến độ (chỉ ghi thêm). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => capNhatTienDo(nc, id, await docThan(req, LuocDoTienDo)));
