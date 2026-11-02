import { docThan, xuLyApi } from "@/lib/api";
import { danhSachKyLuong, taoKyLuong } from "@/modules/luong/service";
import { LuocDoTaoKy } from "@/modules/luong/luoc-do";

export const dynamic = "force-dynamic";

/** GET — danh sách kỳ lương + tổng (LU-20). POST — tạo kỳ lương tháng. Kiểm quyền + 2 lớp ở service (LU-61). */
export const GET = xuLyApi(async (nc) => danhSachKyLuong(nc), { quyen: "luong.view" });
export const POST = xuLyApi(async (nc, req) => taoKyLuong(nc, await docThan(req, LuocDoTaoKy)), { quyen: "luong.create" });
