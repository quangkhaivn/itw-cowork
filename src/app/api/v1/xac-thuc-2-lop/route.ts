import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoChinhSach2Lop, luuChinhSach2Lop, xemQuanTri2Lop } from "@/modules/xac-thuc-2-lop/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => xemQuanTri2Lop(nc), { quyen: "user.view" });
/** Chọn vai trò bắt buộc 2 lớp (XT-06). */
export const PUT = xuLyApi(async (nc, req) => luuChinhSach2Lop(nc, (await docThan(req, LuocDoChinhSach2Lop)).vaiTro), {
  quyen: "setting.update",
});
