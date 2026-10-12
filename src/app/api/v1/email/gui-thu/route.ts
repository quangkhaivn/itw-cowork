import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoXemTruoc } from "@/modules/email/luoc-do";
import { guiThuThu } from "@/modules/email/service";

export const dynamic = "force-dynamic";

/** Gửi thư thử của một mẫu / chiến dịch tới chính người bấm. */
export const POST = xuLyApi(async (nc, req) => guiThuThu(nc, await docThan(req, LuocDoXemTruoc)), { quyen: "marketing.create" });
