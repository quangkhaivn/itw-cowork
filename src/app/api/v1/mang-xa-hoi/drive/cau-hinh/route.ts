import { xuLyApi } from "@/lib/api";
import { cauHinhPicker } from "@/modules/mang-xa-hoi/nen-tang-app";

/** Cấu hình Google Picker cho trình duyệt: Client ID, API key (khóa trình duyệt), số project. Không có Client Secret. */
export const GET = xuLyApi((nc) => cauHinhPicker(nc), { quyen: "mxh.view" });
