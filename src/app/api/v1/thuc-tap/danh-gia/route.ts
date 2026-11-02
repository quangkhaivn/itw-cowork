import { docThan, xuLyApi } from "@/lib/api";
import { danhSachPhieuThucTap, LuocDoTaoPhieuThucTap, taoPhieuThucTap } from "@/modules/thuc-tap/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachPhieuThucTap(nc), { quyen: "danh_gia.view" });
export const POST = xuLyApi(async (nc, req) => taoPhieuThucTap(nc, await docThan(req, LuocDoTaoPhieuThucTap)), { quyen: "danh_gia.view" });
