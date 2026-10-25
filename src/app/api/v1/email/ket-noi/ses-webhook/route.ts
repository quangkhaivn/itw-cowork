import { xuLyApi } from "@/lib/api";
import { doiMaWebhookSes } from "@/modules/email/ket-noi";

export const dynamic = "force-dynamic";

/** Tạo / đổi mã webhook sự kiện SES. URL chứa mã chỉ trả về MỘT lần (EG-02). */
export const POST = xuLyApi((nc) => doiMaWebhookSes(nc), { quyen: "integration.update" });
