import { xuLyApi } from "@/lib/api";
import { duyetKyLuong } from "@/modules/luong/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, _req, { id }) => duyetKyLuong(nc, id), { quyen: "luong.approve" });
