import { xuLyApi } from "@/lib/api";
import { khoaKyLuong } from "@/modules/luong/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, _req, { id }) => khoaKyLuong(nc, id), { quyen: "luong.approve" });
