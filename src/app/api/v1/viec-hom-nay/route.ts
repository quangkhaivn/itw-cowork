import { xuLyApi } from "@/lib/api";
import { viecHomNay } from "@/modules/nhac-viec/service";

export const dynamic = "force-dynamic";

const LA_NGAY = /^\d{4}-\d{2}-\d{2}$/;

/** Việc hôm nay của chính người đang đăng nhập — không có đường xem của người khác. */
export const GET = xuLyApi((nc, req) => {
  const ngay = new URL(req.url).searchParams.get("ngay") ?? "";
  return viecHomNay(nc, LA_NGAY.test(ngay) ? ngay : undefined);
});
