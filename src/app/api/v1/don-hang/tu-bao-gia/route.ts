import { z } from "zod";
import { docThan, xuLyApi } from "@/lib/api";
import { taoDonTuBaoGia } from "@/modules/don-hang/service";

export const dynamic = "force-dynamic";

const LuocDo = z.object({ baoGiaId: z.uuid() });

/** Chuyển báo giá khách đã chấp nhận thành đơn hàng — một thao tác (DH-01). */
export const POST = xuLyApi(async (nc, req) => taoDonTuBaoGia(nc, (await docThan(req, LuocDo)).baoGiaId));
