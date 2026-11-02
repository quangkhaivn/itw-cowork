import { docThan, xuLyApi } from "@/lib/api";
import { danhSachMauPhieu, LuocDoMauPhieuLuu, taoMauPhieu } from "@/modules/thuc-tap/service";

export const dynamic = "force-dynamic";

/** DG-72: mẫu phiếu đánh giá thực tập (Nhân sự cấu hình, mỗi trường một mẫu). */
export const GET = xuLyApi((nc) => danhSachMauPhieu(nc));
export const POST = xuLyApi(async (nc, req) => taoMauPhieu(nc, await docThan(req, LuocDoMauPhieuLuu)), { quyen: "nhan_su.update" });
