import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoNhanHang } from "@/modules/mua-hang/luoc-do";
import { nhanHang } from "@/modules/mua-hang/service";

export const dynamic = "force-dynamic";

/** MH-06: hàng vào kho bằng đúng ghiSoKho() mà bán hàng dùng để xuất. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => nhanHang(nc, id, await docThan(req, LuocDoNhanHang)));
