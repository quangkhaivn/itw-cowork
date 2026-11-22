import { xuLyApi } from "@/lib/api";
import { danhSachChoDuyet } from "@/modules/mang-xa-hoi/bai";

export const GET = xuLyApi((nc) => danhSachChoDuyet(nc), { quyen: "mxh.approve" });
