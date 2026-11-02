import { xuLyApi } from "@/lib/api";
import { chiTietKyLuong } from "@/modules/luong/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>(async (nc, _req, { id }) => chiTietKyLuong(nc, id), { quyen: "luong.view" });
