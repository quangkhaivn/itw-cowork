import { xuLyApi } from "@/lib/api";
import { chiTietPhieuThucTap } from "@/modules/thuc-tap/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietPhieuThucTap(nc, id), { quyen: "danh_gia.view" });
