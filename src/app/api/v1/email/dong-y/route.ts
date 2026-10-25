import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { ghiTayDongY, LuocDoGhiTayDongY, LuocDoLocSoDongY, xemSoDongY } from "@/modules/email/so-dong-y";

export const dynamic = "force-dynamic";

/** Sổ đồng ý nhận thư quảng cáo (EG-08). Xem: marketing.view; ghi tay: marketing.update. */
export const GET = xuLyApi((nc, req) => xemSoDongY(nc, docTruyVan(req, LuocDoLocSoDongY)), { quyen: "marketing.view" });
export const POST = xuLyApi(async (nc, req) => ghiTayDongY(nc, await docThan(req, LuocDoGhiTayDongY)), { quyen: "marketing.update" });
