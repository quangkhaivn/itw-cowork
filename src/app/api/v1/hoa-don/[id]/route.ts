import { xuLyApi } from "@/lib/api";
import { chiTietHoaDon } from "@/modules/tai-chinh/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietHoaDon(nc, id), { quyen: "finance.view" });
