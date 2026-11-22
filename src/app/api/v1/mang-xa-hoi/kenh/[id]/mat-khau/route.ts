import { docThan } from "@/lib/api";
import { xuLyApiNhieuBuoc } from "@/lib/api-nhieu-buoc";
import { doiMatKhauKenh } from "@/modules/mang-xa-hoi/kenh";
import { LuocDoDoiMatKhauKenh } from "@/modules/mang-xa-hoi/luoc-do";

/** Nhập lại mật khẩu ứng dụng: kiểm tra thật rồi niêm phong lại. */
export const POST = xuLyApiNhieuBuoc<{ id: string }>(async (nb, req, { id }) => doiMatKhauKenh(nb, id, await docThan(req, LuocDoDoiMatKhauKenh)), { quyen: "mxh.update" });
