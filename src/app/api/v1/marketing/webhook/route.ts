import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoNguonWebhook } from "@/modules/marketing/luoc-do";
import { danhSachNguonWebhook, taoNguonWebhook } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachNguonWebhook(nc), { quyen: "marketing.view" });

/** Trả khóa bí mật MỘT LẦN — không có đường nào đọc lại (MK-12). */
export const POST = xuLyApi(async (nc, req) => taoNguonWebhook(nc, await docThan(req, LuocDoNguonWebhook)), { quyen: "marketing.create" });
