import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocTraHangMua, LuocDoTaoTraHangMua } from "@/modules/tra-hang/luoc-do";
import { danhSachTraHangMua, taoTraHangMua } from "@/modules/tra-hang/service";

export const dynamic = "force-dynamic";

/** Quyền kiểm trong service: một trong `purchasing.view` / `finance.view`. */
export const GET = xuLyApi((nc, req) => danhSachTraHangMua(nc, docTruyVan(req, LuocDoLocTraHangMua)));

export const POST = xuLyApi(async (nc, req) => taoTraHangMua(nc, await docThan(req, LuocDoTaoTraHangMua)));
