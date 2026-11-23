import { docThan, xuLyApi } from "@/lib/api";
import { doiLich } from "@/modules/mang-xa-hoi/lich";
import { LuocDoDoiLich } from "@/modules/mang-xa-hoi/luoc-do";

/** Đổi lịch (kéo-thả trên lịch nội dung). Máy chủ kiểm trạng thái, quyền, giờ tương lai, hạn mức theo kênh (QĐ-231). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => doiLich(nc, id, await docThan(req, LuocDoDoiLich)), { quyen: "mxh.view" });
