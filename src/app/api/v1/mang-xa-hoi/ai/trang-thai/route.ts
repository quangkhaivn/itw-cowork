import { xuLyApi } from "@/lib/api";
import { trangThaiAiVietBai } from "@/modules/mang-xa-hoi/ai/service";

/** AI viết bài: đã cấu hình chưa + ngân sách AI tháng này (QĐ-236). */
export const GET = xuLyApi((nc) => trangThaiAiVietBai(nc), { quyen: "mxh.view" });
