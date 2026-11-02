import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoBoKpi, suaBoKpi } from "@/modules/danh-gia/service";

export const dynamic = "force-dynamic";

export const PUT = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaBoKpi(nc, id, await docThan(req, LuocDoBoKpi)), { quyen: "nhan_su.update" });
