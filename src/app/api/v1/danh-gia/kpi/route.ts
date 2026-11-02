import { docThan, xuLyApi } from "@/lib/api";
import { danhSachBoKpi, LuocDoBoKpi, taoBoKpi } from "@/modules/danh-gia/service";

export const dynamic = "force-dynamic";

/** DG-50: bộ KPI theo vị trí (Nhân sự quản lý bằng nhan_su.update). */
export const GET = xuLyApi((nc) => danhSachBoKpi(nc));
export const POST = xuLyApi(async (nc, req) => taoBoKpi(nc, await docThan(req, LuocDoBoKpi)), { quyen: "nhan_su.update" });
