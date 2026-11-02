import { xuLyApi } from "@/lib/api";
import { kiemLaiPhieuLuong } from "@/modules/luong/service";

export const dynamic = "force-dynamic";

/** POST — tính lại từ ảnh chụp đầu vào và so với số đã lưu (LU-28). */
export const POST = xuLyApi<{ id: string }>(async (nc, _req, { id }) => kiemLaiPhieuLuong(nc, id), { quyen: "luong.view" });
