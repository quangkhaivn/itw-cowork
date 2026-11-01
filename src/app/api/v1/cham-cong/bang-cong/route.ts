import { docThan, xuLyApi } from "@/lib/api";
import { HAN_GIAO_DICH_THEO_LO_MS } from "@/lib/db";
import { danhSachBangCong, sinhBangCong } from "@/modules/cham-cong/bang-cong";
import { LuocDoSinhBangCong } from "@/modules/cham-cong/luoc-do";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => danhSachBangCong(nc), { quyen: "cham_cong.view" });
/** POST { nam, thang } — sinh / sinh lại bảng công nháp (NS-50). Tính cả công ty nên nới hạn giao dịch (QĐ-56). */
export const POST = xuLyApi(async (nc, req) => sinhBangCong(nc, await docThan(req, LuocDoSinhBangCong)), { quyen: "cham_cong.update", hanGiaoDichMs: HAN_GIAO_DICH_THEO_LO_MS });
