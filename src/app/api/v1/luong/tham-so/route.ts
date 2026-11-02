import { docThan, xuLyApi } from "@/lib/api";
import { danhSachThamSo, taoThamSo } from "@/modules/luong/tham-so";
import { LuocDoThamSo } from "@/modules/luong/luoc-do";

export const dynamic = "force-dynamic";

export const GET = xuLyApi(async (nc) => danhSachThamSo(nc));
/** POST — nhập bộ tham số mới có hiệu lực từ ngày (LU-13). */
export const POST = xuLyApi(async (nc, req) => taoThamSo(nc, await docThan(req, LuocDoThamSo)), { quyen: "luong.create" });
