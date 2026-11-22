import { docThan, xuLyApi } from "@/lib/api";
import { xuLyApiNhieuBuoc } from "@/lib/api-nhieu-buoc";
import { danhSachKenh, ketNoiWordPress } from "@/modules/mang-xa-hoi/kenh";
import { LuocDoKetNoiWordPress } from "@/modules/mang-xa-hoi/luoc-do";

export const GET = xuLyApi((nc) => danhSachKenh(nc), { quyen: "mxh.view" });

/** Nối site WordPress: kiểm tra kết nối thật (gọi mạng — nhiều bước, QĐ-89) rồi lưu, mật khẩu ứng dụng niêm phong. */
export const POST = xuLyApiNhieuBuoc(async (nb, req) => ketNoiWordPress(nb, await docThan(req, LuocDoKetNoiWordPress)), { quyen: "mxh.update" });
