import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocTraHangBan, LuocDoTaoTraHangBan } from "@/modules/tra-hang/luoc-do";
import { danhSachTraHangBan, taoTraHangBan } from "@/modules/tra-hang/service";

export const dynamic = "force-dynamic";

/** Quyền kiểm trong service: một trong `order.view` / `service_desk.view` / `finance.view`. */
export const GET = xuLyApi((nc, req) => danhSachTraHangBan(nc, docTruyVan(req, LuocDoLocTraHangBan)));

/** Lập phiếu khách trả hàng hoặc đổi máy (TH-01). */
export const POST = xuLyApi(async (nc, req) => taoTraHangBan(nc, await docThan(req, LuocDoTaoTraHangBan)));
