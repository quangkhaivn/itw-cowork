import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocDeNghi, LuocDoTaoDeNghi } from "@/modules/mua-hang/luoc-do";
import { danhSachDeNghi, taoDeNghi } from "@/modules/mua-hang/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachDeNghi(nc, docTruyVan(req, LuocDoLocDeNghi)), { quyen: "purchasing.view" });

export const POST = xuLyApi(async (nc, req) => taoDeNghi(nc, await docThan(req, LuocDoTaoDeNghi)));
