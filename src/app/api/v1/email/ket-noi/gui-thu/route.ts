import { xuLyApiNhieuBuoc } from "@/lib/api-nhieu-buoc";
import { guiThuKiemTraKetNoi } from "@/modules/email/ket-noi";

export const dynamic = "force-dynamic";

/** Gửi một thư thử tới email của chính người bấm. Gửi SMTP NGOÀI giao dịch CSDL (QĐ-89). */
export const POST = xuLyApiNhieuBuoc((nb) => guiThuKiemTraKetNoi(nb), { quyen: "integration.update" });
