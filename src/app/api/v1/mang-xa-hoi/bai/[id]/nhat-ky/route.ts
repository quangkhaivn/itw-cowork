import { xuLyApi } from "@/lib/api";
import { nhatKyDang } from "@/modules/mang-xa-hoi/bai";

/** Nhật ký gọi nền tảng (bằng chứng từng lần thử). */
export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => nhatKyDang(nc, id), { quyen: "mxh.view" });
