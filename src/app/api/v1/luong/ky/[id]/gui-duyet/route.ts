import { xuLyApi } from "@/lib/api";
import { guiDuyetKyLuong } from "@/modules/luong/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, _req, { id }) => guiDuyetKyLuong(nc, id), { quyen: "luong.create" });
