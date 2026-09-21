import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoGhiNhanHoaDonMua } from "@/modules/cong-no-tra/luoc-do";
import { ghiNhanHoaDonMua } from "@/modules/cong-no-tra/service";

export const dynamic = "force-dynamic";

/** Ghi nhận: chốt số tiền và hạn thanh toán — từ đây mới tính nợ phải trả (CT-03). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => ghiNhanHoaDonMua(nc, id, await docThan(req, LuocDoGhiNhanHoaDonMua)));
