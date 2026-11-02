import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoXetNgayCong } from "@/modules/cham-cong/luoc-do";
import { xetNgayThieuGio } from "@/modules/cham-cong/ngay-cong";

export const dynamic = "force-dynamic";

/** POST — quản lý xét một ngày "thiếu giờ": tính đủ / nửa / không công (QĐ-116). */
export const POST = xuLyApi(async (nc, req) => xetNgayThieuGio(nc, await docThan(req, LuocDoXetNgayCong)));
