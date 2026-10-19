import { docThan, xuLyApi } from "@/lib/api";
import { goMucKiemTra, LuocDoTichMuc, tichMucKiemTra } from "@/modules/cong-viec/service";

export const dynamic = "force-dynamic";

export const PATCH = xuLyApi<{ mucId: string }>(async (nc, req, { mucId }) => tichMucKiemTra(nc, mucId, await docThan(req, LuocDoTichMuc)));

/** Gỡ mục là xóa mềm (`removed_at`), giữ lại vết trong nhật ký kiểm toán. */
export const DELETE = xuLyApi<{ mucId: string }>(async (nc, _req, { mucId }) => goMucKiemTra(nc, mucId));
