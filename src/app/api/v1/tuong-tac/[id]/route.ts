import { xuLyApi } from "@/lib/api";
import { anTuongTac } from "@/modules/tuong-tac/service";

export const dynamic = "force-dynamic";

/** Ẩn tương tác ghi nhầm (chỉ người ghi). Không xóa cứng — vẫn còn trong Nhật ký kiểm toán. */
export const DELETE = xuLyApi<{ id: string }>((nc, _req, { id }) => anTuongTac(nc, id));
