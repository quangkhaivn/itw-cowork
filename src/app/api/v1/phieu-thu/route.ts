import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocPhieuThu, LuocDoThuTien } from "@/modules/tai-chinh/luoc-do";
import { danhSachPhieuThu, thuTien } from "@/modules/tai-chinh/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => danhSachPhieuThu(nc, docTruyVan(req, LuocDoLocPhieuThu)), { quyen: "finance.view" });

/** Ghi nhận tiền khách trả và phân bổ cho từng hóa đơn (TC-05). */
export const POST = xuLyApi(async (nc, req) => thuTien(nc, await docThan(req, LuocDoThuTien)));
