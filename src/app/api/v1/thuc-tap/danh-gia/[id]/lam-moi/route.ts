import { xuLyApi } from "@/lib/api";
import { lamMoiPhieuThucTap } from "@/modules/thuc-tap/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => lamMoiPhieuThucTap(nc, id), { quyen: "danh_gia.view" });
