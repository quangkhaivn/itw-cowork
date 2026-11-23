import { docThan, xuLyApi } from "@/lib/api";
import { suaKenhLoi } from "@/modules/mang-xa-hoi/kenh-loi";
import { LuocDoSuaKenhLoi } from "@/modules/mang-xa-hoi/luoc-do";

/** Sửa nội dung riêng của MỘT kênh lỗi (bài lỗi một phần) — kênh đã đăng giữ nguyên (QĐ-234). */
export const PUT = xuLyApi<{ id: string; kenhBaiId: string }>(async (nc, req, { id, kenhBaiId }) => suaKenhLoi(nc, id, kenhBaiId, await docThan(req, LuocDoSuaKenhLoi)), { quyen: "mxh.view" });
