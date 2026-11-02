import { xuLyApi } from "@/lib/api";
import { xoaKhoanLuong } from "@/modules/luong/service";

export const dynamic = "force-dynamic";

export const DELETE = xuLyApi<{ id: string }>(async (nc, _req, { id }) => xoaKhoanLuong(nc, id), { quyen: "luong.create" });
