import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoXacNhanTraHang } from "@/modules/tra-hang/luoc-do";
import { xacNhanTraHangBan } from "@/modules/tra-hang/service";

export const dynamic = "force-dynamic";

/** Xác nhận: hàng thật sự về kho, sê-ri đổi trạng thái, máy đổi được giao đi (TH-04). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) =>
  xacNhanTraHangBan(nc, id, await docThan(req, LuocDoXacNhanTraHang)),
);
