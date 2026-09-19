import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocKhachHang, LuocDoTaoKhachHang } from "@/modules/khach-hang/luoc-do";
import { danhSachKhachHang, taoKhachHang } from "@/modules/khach-hang/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachKhachHang(nc, docTruyVan(req, LuocDoLocKhachHang)), { quyen: "customer.view" });

export const POST = xuLyApi(async (nc, req) => taoKhachHang(nc, await docThan(req, LuocDoTaoKhachHang)));
