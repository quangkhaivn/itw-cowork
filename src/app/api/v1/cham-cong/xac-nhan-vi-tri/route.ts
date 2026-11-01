import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoXacNhanViTri } from "@/modules/cham-cong/luoc-do";
import { xacNhanThongBaoViTri } from "@/modules/cham-cong/service";

export const dynamic = "force-dynamic";

/** POST — nhân viên xác nhận đã đọc thông báo xử lý dữ liệu vị trí (NS-18), chỉ ghi thêm. */
export const POST = xuLyApi(async (nc, req) => {
  await docThan(req, LuocDoXacNhanViTri);
  return xacNhanThongBaoViTri(nc);
}, { quyen: "cham_cong.create" });
