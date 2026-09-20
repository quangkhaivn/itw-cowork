import { xuLyApi } from "@/lib/api";
import { hoaDonConNo } from "@/modules/tai-chinh/service";

export const dynamic = "force-dynamic";

/** Hóa đơn còn nợ của một khách — để màn hình thu tiền phân bổ nhanh. */
export const GET = xuLyApi<{ khachHangId: string }>((nc, _req, { khachHangId }) => hoaDonConNo(nc, khachHangId), { quyen: "finance.view" });
