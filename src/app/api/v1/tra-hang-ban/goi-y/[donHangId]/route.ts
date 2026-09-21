import { xuLyApi } from "@/lib/api";
import { goiYTraTheoDon } from "@/modules/tra-hang/service";

export const dynamic = "force-dynamic";

/** Đơn đã giao bao nhiêu, đã trả bao nhiêu, còn trả được bao nhiêu (TH-03). */
export const GET = xuLyApi<{ donHangId: string }>((nc, _req, { donHangId }) => goiYTraTheoDon(nc, donHangId));
