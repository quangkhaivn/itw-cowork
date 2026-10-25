import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoNhapCsvDongY, nhapCsvDongY } from "@/modules/email/so-dong-y";

export const dynamic = "force-dynamic";

/** Nhập đồng ý từ CSV (Email, Nguồn, Căn cứ, Thời điểm). `chiKiemTra: true` = đọc thử, không ghi. */
export const POST = xuLyApi(async (nc, req) => nhapCsvDongY(nc, await docThan(req, LuocDoNhapCsvDongY)), { quyen: "marketing.update" });
