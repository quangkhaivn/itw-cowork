import { xuLyApi } from "@/lib/api";
import { danhMucNenTang } from "@/modules/mang-xa-hoi/kenh";

/** Danh mục nền tảng + trạng thái connector (ADR-04). */
export const GET = xuLyApi((nc) => danhMucNenTang(nc), { quyen: "mxh.view" });
