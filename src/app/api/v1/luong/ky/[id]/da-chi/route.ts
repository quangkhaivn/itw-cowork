import { xuLyApi } from "@/lib/api";
import { daChiKyLuong } from "@/modules/luong/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, _req, { id }) => daChiKyLuong(nc, id), { quyen: "luong.export" });
