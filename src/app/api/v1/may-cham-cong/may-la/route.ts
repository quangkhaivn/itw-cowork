import { xuLyApi } from "@/lib/api";
import { danhSachMayLa } from "@/modules/cham-cong/may-cham-cong";

export const dynamic = "force-dynamic";

/** 0.22.0 (QĐ-175): máy đang gọi nhưng chưa đăng ký mà doanh nghiệp này được thấy (?sn= tìm đúng SN). */
export const GET = xuLyApi((nc, req) => danhSachMayLa(nc, req.nextUrl.searchParams.get("sn")?.trim() || null));
