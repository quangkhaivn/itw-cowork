import { xuLyApi } from "@/lib/api";
import { chiTietHoiThoai } from "@/modules/tro-ly/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietHoiThoai(nc, id), { quyen: "ai.view" });
