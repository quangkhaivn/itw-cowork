import { xuLyApi } from "@/lib/api";
import { goiYTraTheoDonMua } from "@/modules/tra-hang/service";

export const dynamic = "force-dynamic";

/** Đơn mua đã nhận bao nhiêu, đã trả bao nhiêu, còn trả được bao nhiêu (TH-03). */
export const GET = xuLyApi<{ donMuaId: string }>((nc, _req, { donMuaId }) => goiYTraTheoDonMua(nc, donMuaId));
