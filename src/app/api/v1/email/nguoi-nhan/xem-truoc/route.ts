import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoXemTruocNguoiNhan } from "@/modules/email/luoc-do";
import { xemTruocNguoiNhan } from "@/modules/email/service";

export const dynamic = "force-dynamic";

/** Đếm trước số người nhận (đã loại người từ chối, email hỏng, trùng) — EM-07. */
export const POST = xuLyApi(
  async (nc, req) => {
    const d = await docThan(req, LuocDoXemTruocNguoiNhan);
    return xemTruocNguoiNhan(nc, d.nguon, d.thamSo);
  },
  { quyen: "marketing.view" },
);
