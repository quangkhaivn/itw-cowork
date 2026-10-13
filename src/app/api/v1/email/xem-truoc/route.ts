import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoXemTruoc } from "@/modules/email/luoc-do";
import { xemTruocThu } from "@/modules/email/service";

export const dynamic = "force-dynamic";

/** Dựng HTML ở máy chủ để xem trước — trình duyệt hiện trong iframe sandbox, không chèn vào trang. */
export const POST = xuLyApi(async (nc, req) => xemTruocThu(nc, await docThan(req, LuocDoXemTruoc)), { quyen: "marketing.view" });
