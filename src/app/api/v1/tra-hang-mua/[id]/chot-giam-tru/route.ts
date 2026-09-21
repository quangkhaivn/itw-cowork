import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoChotGiamTru } from "@/modules/tra-hang/luoc-do";
import { chotGiamTruMua } from "@/modules/tra-hang/service";

export const dynamic = "force-dynamic";

/** Chốt tiền: giảm trừ vào hóa đơn nhà cung cấp còn nợ (TH-07). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) =>
  chotGiamTruMua(nc, id, await docThan(req, LuocDoChotGiamTru)),
);
