import { xuLyApi } from "@/lib/api";
import { congNoTheoKhach } from "@/modules/tai-chinh/service";

export const dynamic = "force-dynamic";

/** Công nợ phải thu theo khách, kèm tuổi nợ. Con số TÍNH từ hóa đơn trừ phiếu thu. */
export const GET = xuLyApi((nc) => congNoTheoKhach(nc), { quyen: "finance.view" });
