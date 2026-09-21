import { xuLyApi } from "@/lib/api";
import { chiTietHoaDonMua } from "@/modules/cong-no-tra/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietHoaDonMua(nc, id), { quyen: "finance.view" });
