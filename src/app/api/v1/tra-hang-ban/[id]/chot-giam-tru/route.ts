import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoChotGiamTru } from "@/modules/tra-hang/luoc-do";
import { chotGiamTruBan } from "@/modules/tra-hang/service";

export const dynamic = "force-dynamic";

/** Chốt tiền: giảm trừ giá trị phiếu vào hóa đơn còn nợ của khách (TH-07). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) =>
  chotGiamTruBan(nc, id, await docThan(req, LuocDoChotGiamTru)),
);
