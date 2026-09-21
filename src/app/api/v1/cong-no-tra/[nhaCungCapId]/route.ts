import { xuLyApi } from "@/lib/api";
import { hoaDonConNoCua } from "@/modules/cong-no-tra/service";

export const dynamic = "force-dynamic";

/** Hóa đơn còn nợ của một nhà cung cấp — để màn hình chi tiền phân bổ nhanh. */
export const GET = xuLyApi<{ nhaCungCapId: string }>((nc, _req, { nhaCungCapId }) => hoaDonConNoCua(nc, nhaCungCapId), {
  quyen: "finance.view",
});
