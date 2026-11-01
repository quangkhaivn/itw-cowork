import { docThan, xuLyApi } from "@/lib/api";
import { guiPhanHoiCong } from "@/modules/cham-cong/bang-cong";
import { LuocDoPhanHoiCong } from "@/modules/cham-cong/luoc-do";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => guiPhanHoiCong(nc, id, await docThan(req, LuocDoPhanHoiCong)), { quyen: "cham_cong.create" });
