import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoKetNoiEmail } from "@/modules/email/luoc-do";
import { luuKetNoi, xemKetNoi } from "@/modules/email/ket-noi";

export const dynamic = "force-dynamic";

/** Kết nối hộp thư gửi. Không bao giờ trả mật khẩu — chỉ cờ `coMatKhau` (EM-02). */
export const GET = xuLyApi((nc) => xemKetNoi(nc), { quyen: "integration.view" });
export const PUT = xuLyApi(async (nc, req) => luuKetNoi(nc, await docThan(req, LuocDoKetNoiEmail)), { quyen: "integration.update" });
