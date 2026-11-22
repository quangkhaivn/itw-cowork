import { docThan } from "@/lib/api";
import { xuLyApiNhieuBuoc } from "@/lib/api-nhieu-buoc";
import { kiemTraThongTinWordPress } from "@/modules/mang-xa-hoi/kenh";
import { LuocDoThongTinWordPress } from "@/modules/mang-xa-hoi/luoc-do";

/** "Kiểm tra kết nối" với thông tin vừa nhập (chưa lưu, không ghi mật khẩu ở đâu). */
export const POST = xuLyApiNhieuBuoc(async (nb, req) => kiemTraThongTinWordPress(nb, await docThan(req, LuocDoThongTinWordPress)), { quyen: "mxh.update" });
