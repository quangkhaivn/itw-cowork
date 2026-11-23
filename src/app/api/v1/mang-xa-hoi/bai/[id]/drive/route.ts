import { docThan } from "@/lib/api";
import { xuLyApiNhieuBuoc } from "@/lib/api-nhieu-buoc";
import { taiTuDrive } from "@/modules/mang-xa-hoi/drive";
import { LuocDoTaiDrive } from "@/modules/mang-xa-hoi/luoc-do";

export const runtime = "nodejs";

/** Tải tệp đã chọn bằng Google Picker vào bài (gọi mạng — nhiều bước, QĐ-89). Token chỉ dùng trong yêu cầu này. */
export const POST = xuLyApiNhieuBuoc<{ id: string }>(async (nb, req, { id }) => taiTuDrive(nb, id, await docThan(req, LuocDoTaiDrive)), { quyen: "mxh.view" });
