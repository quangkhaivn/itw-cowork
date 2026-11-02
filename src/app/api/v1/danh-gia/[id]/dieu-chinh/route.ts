import { docThan, xuLyApi } from "@/lib/api";
import { dieuChinhPhieu, LuocDoDieuChinh } from "@/modules/danh-gia/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => dieuChinhPhieu(nc, id, await docThan(req, LuocDoDieuChinh)), { quyen: "danh_gia.view" });
