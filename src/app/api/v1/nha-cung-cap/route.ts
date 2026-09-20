import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { danhSachNhaCungCap, LuocDoLocNhaCungCap, LuocDoTaoNhaCungCap, taoNhaCungCap } from "@/modules/nha-cung-cap/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachNhaCungCap(nc, docTruyVan(req, LuocDoLocNhaCungCap)), { quyen: "supplier.view" });

export const POST = xuLyApi(async (nc, req) => taoNhaCungCap(nc, await docThan(req, LuocDoTaoNhaCungCap)));
