import { xuLyApi } from "@/lib/api";
import { chotPhieuThucTap } from "@/modules/thuc-tap/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => chotPhieuThucTap(nc, id), { quyen: "danh_gia.view" });
