import { xuLyApi } from "@/lib/api";
import { danhSachHoiThoai, trangThaiTroLy } from "@/modules/tro-ly/service";

export const dynamic = "force-dynamic";

/** Trợ lý đã dùng được chưa, có những công cụ nào, và các hội thoại gần đây của tôi. */
export const GET = xuLyApi(async (nc) => ({
  trangThai: await trangThaiTroLy(nc),
  hoiThoai: await danhSachHoiThoai(nc),
}), { quyen: "ai.view" });
