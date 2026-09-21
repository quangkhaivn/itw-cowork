import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocHoaDonMua, LuocDoTaoHoaDonMua } from "@/modules/cong-no-tra/luoc-do";
import { danhSachHoaDonMua, taoHoaDonMua } from "@/modules/cong-no-tra/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachHoaDonMua(nc, docTruyVan(req, LuocDoLocHoaDonMua)), { quyen: "finance.view" });

/** Lập hóa đơn nhà cung cấp từ đơn mua, hoặc nhập tay cho khoản lẻ (CT-01). */
export const POST = xuLyApi(async (nc, req) => taoHoaDonMua(nc, await docThan(req, LuocDoTaoHoaDonMua)));
