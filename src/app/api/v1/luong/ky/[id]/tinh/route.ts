import { xuLyApi } from "@/lib/api";
import { tinhKyLuong } from "@/modules/luong/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, _req, { id }) => tinhKyLuong(nc, id), { quyen: "luong.create" });
