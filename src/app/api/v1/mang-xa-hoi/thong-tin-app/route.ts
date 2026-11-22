import { xuLyApi } from "@/lib/api";
import { danhSachThongTinApp } from "@/modules/mang-xa-hoi/nen-tang-app";

/** Trạng thái thông tin app nền tảng. Giá trị (không bao giờ có bí mật) chỉ trả cho Giám đốc / Quản trị đã bật 2 lớp. */
export const GET = xuLyApi((nc) => danhSachThongTinApp(nc));
