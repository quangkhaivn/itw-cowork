import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocDonMua, LuocDoTaoDonMua } from "@/modules/mua-hang/luoc-do";
import { danhSachDonMua, taoDonMua } from "@/modules/mua-hang/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachDonMua(nc, docTruyVan(req, LuocDoLocDonMua)), { quyen: "purchasing.view" });

export const POST = xuLyApi(async (nc, req) => taoDonMua(nc, await docThan(req, LuocDoTaoDonMua)));
