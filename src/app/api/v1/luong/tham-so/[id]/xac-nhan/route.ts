import { xuLyApi } from "@/lib/api";
import { xacNhanThamSo } from "@/modules/luong/tham-so";

export const dynamic = "force-dynamic";

/** POST — kế toán xác nhận một bộ tham số (LU-11). */
export const POST = xuLyApi<{ id: string }>(async (nc, _req, { id }) => xacNhanThamSo(nc, id), { quyen: "luong.create" });
