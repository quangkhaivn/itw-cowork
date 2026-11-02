import { docThan, xuLyApi } from "@/lib/api";
import { danhSachHoSo, taoHoSoLuong } from "@/modules/luong/ho-so";
import { LuocDoHoSoLuong } from "@/modules/luong/luoc-do";

export const dynamic = "force-dynamic";

export const GET = xuLyApi(async (nc) => danhSachHoSo(nc), { quyen: "luong.view" });
/** POST — tạo PHIÊN BẢN hồ sơ lương mới (LU-02). */
export const POST = xuLyApi(async (nc, req) => taoHoSoLuong(nc, await docThan(req, LuocDoHoSoLuong)), { quyen: "luong.update" });
