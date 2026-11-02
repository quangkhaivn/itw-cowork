import { xuLyApi } from "@/lib/api";
import { chiTietPhieuLuong } from "@/modules/luong/service";

export const dynamic = "force-dynamic";

/** GET — một phiếu lương: của mình (kỳ đã khóa) hoặc của người khác (phạm vi + 2 lớp + nhật ký xem). */
export const GET = xuLyApi<{ id: string }>(async (nc, _req, { id }) => chiTietPhieuLuong(nc, id), { quyen: "luong.view" });
