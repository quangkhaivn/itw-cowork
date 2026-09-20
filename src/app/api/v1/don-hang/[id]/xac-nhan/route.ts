import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoXacNhanDon } from "@/modules/don-hang/luoc-do";
import { xacNhanDon } from "@/modules/don-hang/service";

export const dynamic = "force-dynamic";

/** Xác nhận đơn và giữ chỗ hàng trong kho (DH-04). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const d = await docThan(req, LuocDoXacNhanDon);
  return xacNhanDon(nc, id, { khoId: d.khoId, ghiChu: d.ghiChu ?? null });
});
