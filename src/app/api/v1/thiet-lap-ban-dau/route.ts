import { xuLyApi } from "@/lib/api";
import { viecThietLap } from "@/modules/thiet-lap-ban-dau/service";

export const dynamic = "force-dynamic";

/** 0.22.0 (QĐ-180): việc thiết lập còn thiếu của người đang đăng nhập (theo quyền). */
export const GET = xuLyApi((nc) => viecThietLap(nc));
