import { docThan, xuLyApi } from "@/lib/api";
import { traLaiKyLuong } from "@/modules/luong/service";
import { LuocDoLyDo } from "@/modules/luong/luoc-do";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => traLaiKyLuong(nc, id, await docThan(req, LuocDoLyDo)), { quyen: "luong.approve" });
