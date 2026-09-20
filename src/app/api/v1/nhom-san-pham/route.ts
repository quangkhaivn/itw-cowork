import { docThan, xuLyApi } from "@/lib/api";
import { cayNhomSanPham, LuocDoTaoNhom, taoNhom } from "@/modules/danh-muc-san-pham/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => cayNhomSanPham(nc), { quyen: "product.view" });

export const POST = xuLyApi(async (nc, req) => taoNhom(nc, await docThan(req, LuocDoTaoNhom)));
