import { xuLyApi } from "@/lib/api";
import { goGiaNguon } from "@/modules/san-pham/service";

export const dynamic = "force-dynamic";

/** Gỡ một nguồn khỏi bảng giá (giữ nguyên lịch sử giá). */
export const DELETE = xuLyApi<{ id: string }>((nc, _req, { id }) => goGiaNguon(nc, id));
