import { xuLyApi } from "@/lib/api";
import { chiTietChuyenKho } from "@/modules/chuyen-kho/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => chiTietChuyenKho(nc, id), { quyen: "inventory.view" });
