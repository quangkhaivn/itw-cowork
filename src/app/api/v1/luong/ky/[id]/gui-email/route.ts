import { xuLyApi } from "@/lib/api";
import { guiEmailPhieuLuong } from "@/modules/luong/xuat";

export const dynamic = "force-dynamic";

/** POST — xếp thư phiếu lương vào hàng chờ (worker gửi) — LU-44. */
export const POST = xuLyApi<{ id: string }>(async (nc, _req, { id }) => guiEmailPhieuLuong(nc, id), { quyen: "luong.export" });
