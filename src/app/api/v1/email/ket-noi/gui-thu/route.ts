import { xuLyApi } from "@/lib/api";
import { guiThuKiemTraKetNoi } from "@/modules/email/ket-noi";

export const dynamic = "force-dynamic";

/** Gửi một thư thử tới email của chính người bấm. */
export const POST = xuLyApi((nc) => guiThuKiemTraKetNoi(nc), { quyen: "integration.update" });
