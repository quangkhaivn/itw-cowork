import { xuLyApi } from "@/lib/api";
import { guiLaiPhieuLuong } from "@/modules/luong/xuat";

export const dynamic = "force-dynamic";

/** POST — gửi lại thư phiếu lương của một dòng (khóa chống trùng mới, ghi kiểm toán) — QĐ-163. */
export const POST = xuLyApi<{ id: string }>(async (nc, _req, { id }) => guiLaiPhieuLuong(nc, id), { quyen: "luong.export" });
