import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoPhatHanh } from "@/modules/tai-chinh/luoc-do";
import { phatHanhHoaDon } from "@/modules/tai-chinh/service";

export const dynamic = "force-dynamic";

/** Phát hành: chốt số tiền và đặt hạn thanh toán — từ đây mới tính công nợ (TC-03). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => phatHanhHoaDon(nc, id, await docThan(req, LuocDoPhatHanh)));
