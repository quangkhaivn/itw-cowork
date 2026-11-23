import { xuLyApi } from "@/lib/api";
import { dangLaiKenh } from "@/modules/mang-xa-hoi/kenh-loi";

/** Đăng lại RIÊNG một kênh lỗi — đối soát trước khi gửi, không đăng trùng (QĐ-234). */
export const POST = xuLyApi<{ id: string; kenhBaiId: string }>((nc, _req, { id, kenhBaiId }) => dangLaiKenh(nc, id, kenhBaiId), { quyen: "mxh.update" });
