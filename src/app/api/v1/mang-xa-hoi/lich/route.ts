import { docTruyVan, xuLyApi } from "@/lib/api";
import { lichNoiDung } from "@/modules/mang-xa-hoi/lich";
import { LuocDoLocLich } from "@/modules/mang-xa-hoi/luoc-do";

/** Lịch nội dung tháng / tuần (giờ Việt Nam) — lọc theo kênh, chiến dịch, người soạn (0.25.0, QĐ-230). */
export const GET = xuLyApi((nc, req) => lichNoiDung(nc, docTruyVan(req, LuocDoLocLich)), { quyen: "mxh.view" });
