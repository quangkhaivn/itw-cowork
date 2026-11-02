import { docThan, xuLyApi } from "@/lib/api";
import { danhSachKy, LuocDoKy, taoKyDanhGia } from "@/modules/danh-gia/service";

export const dynamic = "force-dynamic";

/** DG-60: kỳ đánh giá; tạo kỳ = điền sẵn phiếu cho mọi người có quản lý trực tiếp. */
export const GET = xuLyApi((nc) => danhSachKy(nc));
export const POST = xuLyApi(async (nc, req) => taoKyDanhGia(nc, await docThan(req, LuocDoKy)), { quyen: "nhan_su.update", hanGiaoDichMs: 120_000 });
