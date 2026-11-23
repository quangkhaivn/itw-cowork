import { xuLyApi } from "@/lib/api";
import { guiDuyetKenhLoi } from "@/modules/mang-xa-hoi/kenh-loi";

/** Gửi duyệt lại các kênh lỗi đã sửa của bài đăng lỗi một phần (QĐ-234). */
export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => guiDuyetKenhLoi(nc, id), { quyen: "mxh.create" });
