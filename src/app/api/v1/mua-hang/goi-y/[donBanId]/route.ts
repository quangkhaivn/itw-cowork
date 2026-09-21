import { xuLyApi } from "@/lib/api";
import { goiYMuaChoDonBan } from "@/modules/mua-hang/service";

export const dynamic = "force-dynamic";

/** Đơn bán này thiếu hàng gì — để lập đề nghị mua không phải dò từng mặt hàng. */
export const GET = xuLyApi<{ donBanId: string }>((nc, _req, { donBanId }) => goiYMuaChoDonBan(nc, donBanId), {
  quyen: "purchasing.view",
});
