import { docThan, xuLyApi } from "@/lib/api";
import { HAN_GIAO_DICH_THEO_LO_MS } from "@/lib/db";
import { LuocDoNhapCsvDongY, nhapCsvDongY } from "@/modules/email/so-dong-y";

export const dynamic = "force-dynamic";

/**
 * Nhập đồng ý từ CSV (Email, Nguồn, Căn cứ, Thời điểm). `chiKiemTra: true` = đọc thử, không ghi.
 * Theo lô ≤ 5.000 dòng trong MỘT giao dịch → hạn giao dịch theo lô (QĐ-56), như các route nhập CSV
 * khác — hạn mặc định 5 giây của Prisma chỉ đủ vài trăm dòng (QA 0.18.0 đo ~15 giây cho 5.000 dòng).
 */
export const POST = xuLyApi(async (nc, req) => nhapCsvDongY(nc, await docThan(req, LuocDoNhapCsvDongY)), { quyen: "marketing.update", hanGiaoDichMs: HAN_GIAO_DICH_THEO_LO_MS });
