import { docThan } from "@/lib/api";
import { xuLyApiNhieuBuoc } from "@/lib/api-nhieu-buoc";
import { LuocDoXemTruoc } from "@/modules/email/luoc-do";
import { guiThuThu } from "@/modules/email/service";

export const dynamic = "force-dynamic";

/** Gửi thư thử của một mẫu / chiến dịch tới chính người bấm. Gửi SMTP NGOÀI giao dịch CSDL (QĐ-89). */
export const POST = xuLyApiNhieuBuoc(async (nb, req) => guiThuThu(nb, await docThan(req, LuocDoXemTruoc)), { quyen: "marketing.create" });
