import { xuLyApi } from "@/lib/api";
import { chiTietPhieu } from "@/modules/danh-gia/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietPhieu(nc, id), { quyen: "danh_gia.view" });
