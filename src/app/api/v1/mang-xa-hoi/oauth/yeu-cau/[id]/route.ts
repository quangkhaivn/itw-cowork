import { xuLyApi } from "@/lib/api";
import { trangThaiYeuCauOAuth } from "@/modules/mang-xa-hoi/oauth";

/** Trạng thái một lần kết nối + kênh chờ chọn (chỉ người bắt đầu). Màn hình chọn kênh hỏi lại mỗi 2 giây. */
export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => trangThaiYeuCauOAuth(nc, id), { quyen: "mxh.update" });
