import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoChiTien, LuocDoLocPhieuChi } from "@/modules/cong-no-tra/luoc-do";
import { chiTien, danhSachPhieuChi } from "@/modules/cong-no-tra/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachPhieuChi(nc, docTruyVan(req, LuocDoLocPhieuChi)), { quyen: "finance.view" });

/** Ghi nhận tiền đã trả nhà cung cấp và phân bổ cho từng hóa đơn (CT-05). */
export const POST = xuLyApi(async (nc, req) => chiTien(nc, await docThan(req, LuocDoChiTien)));
