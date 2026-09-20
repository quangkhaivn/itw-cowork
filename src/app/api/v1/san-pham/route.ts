import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocSanPham, LuocDoTaoSanPham } from "@/modules/san-pham/luoc-do";
import { danhSachSanPham, taoSanPham } from "@/modules/san-pham/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachSanPham(nc, docTruyVan(req, LuocDoLocSanPham)), { quyen: "product.view" });

export const POST = xuLyApi(async (nc, req) => taoSanPham(nc, await docThan(req, LuocDoTaoSanPham)));
