import { docThan, xuLyApi } from "@/lib/api";
import { danhSachNhatKy, LuocDoNhatKy, luuNhatKy } from "@/modules/thuc-tap/service";

export const dynamic = "force-dynamic";

/** DG-70: nhật ký tuần. `?nguoi=` xem của thực tập sinh mình hướng dẫn / trong phạm vi. */
export const GET = xuLyApi((nc, req) => danhSachNhatKy(nc, req.nextUrl.searchParams.get("nguoi") || undefined), { quyen: "danh_gia.view" });
export const POST = xuLyApi(async (nc, req) => luuNhatKy(nc, await docThan(req, LuocDoNhatKy)));
