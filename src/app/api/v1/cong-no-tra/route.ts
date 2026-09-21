import { xuLyApi } from "@/lib/api";
import { congNoTheoNhaCungCap } from "@/modules/cong-no-tra/service";

export const dynamic = "force-dynamic";

/** Công nợ phải trả theo nhà cung cấp, kèm tuổi nợ. Con số TÍNH từ hóa đơn trừ phiếu chi. */
export const GET = xuLyApi((nc) => congNoTheoNhaCungCap(nc), { quyen: "finance.view" });
