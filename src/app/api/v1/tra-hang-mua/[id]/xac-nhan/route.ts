import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoXacNhanTraHang } from "@/modules/tra-hang/luoc-do";
import { xacNhanTraHangMua } from "@/modules/tra-hang/service";

export const dynamic = "force-dynamic";

/** Xác nhận: hàng thật sự ra khỏi kho để gửi trả nhà cung cấp (TH-04). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) =>
  xacNhanTraHangMua(nc, id, await docThan(req, LuocDoXacNhanTraHang)),
);
