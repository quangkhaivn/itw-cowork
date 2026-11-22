import { xuLyApi } from "@/lib/api";
import { yeuCauKiemTraKenh } from "@/modules/mang-xa-hoi/kenh";

/** Kiểm tra lại kênh đã lưu — xếp việc cho worker (chỉ worker mở được niêm phong, SEC-06). */
export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => yeuCauKiemTraKenh(nc, id), { quyen: "mxh.update" });
