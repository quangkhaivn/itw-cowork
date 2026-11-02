import { xuLyApi } from "@/lib/api";
import { ngayThieuGioCanXemXet } from "@/modules/cham-cong/ngay-cong";

export const dynamic = "force-dynamic";

/** GET — ngày công "thiếu giờ" chờ người xem xét quyết (QĐ-116): chỉ người mình được duyệt, không gồm mình. */
export const GET = xuLyApi(async (nc) => ({ dong: await ngayThieuGioCanXemXet(nc) }), { quyen: "cham_cong.view" });
