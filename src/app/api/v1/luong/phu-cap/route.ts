import { docThan, xuLyApi } from "@/lib/api";
import { danhSachLoaiPhuCap, taoLoaiPhuCap } from "@/modules/luong/ho-so";
import { LuocDoLoaiPhuCap } from "@/modules/luong/luoc-do";

export const dynamic = "force-dynamic";

export const GET = xuLyApi(async (nc) => danhSachLoaiPhuCap(nc));
export const POST = xuLyApi(async (nc, req) => taoLoaiPhuCap(nc, await docThan(req, LuocDoLoaiPhuCap)), { quyen: "luong.update" });
