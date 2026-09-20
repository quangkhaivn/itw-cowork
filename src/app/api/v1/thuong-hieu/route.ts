import { docThan, xuLyApi } from "@/lib/api";
import { danhSachThuongHieu, LuocDoTaoThuongHieu, taoThuongHieu } from "@/modules/danh-muc-san-pham/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachThuongHieu(nc), { quyen: "product.view" });

export const POST = xuLyApi(async (nc, req) => taoThuongHieu(nc, await docThan(req, LuocDoTaoThuongHieu)));
