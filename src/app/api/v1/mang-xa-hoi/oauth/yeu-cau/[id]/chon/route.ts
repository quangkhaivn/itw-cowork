import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoChonKenhOAuth } from "@/modules/mang-xa-hoi/luoc-do";
import { chonKenhOAuth } from "@/modules/mang-xa-hoi/oauth";

/** Lưu các kênh đã chọn (chép bản niêm phong token sang kênh — ứng dụng web không mở token). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => chonKenhOAuth(nc, id, (await docThan(req, LuocDoChonKenhOAuth)).ungVienIds), { quyen: "mxh.update" });
