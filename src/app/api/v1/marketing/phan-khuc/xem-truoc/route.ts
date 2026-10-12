import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoPhanKhuc } from "@/modules/marketing/luoc-do";
import { xemTruocPhanKhuc } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

/** Xem trước số lượng + 20 dòng mẫu đã che. POST vì điều kiện là JSON lồng nhau; không ghi gì. */
export const POST = xuLyApi(async (nc, req) => xemTruocPhanKhuc(nc, await docThan(req, LuocDoPhanKhuc)), { quyen: "marketing.view" });
