import { docThan, xuLyApi } from "@/lib/api";
import { HAN_GIAO_DICH_THEO_LO_MS } from "@/lib/db";
import { LuocDoNhapCsv } from "@/modules/cham-cong/luoc-do";
import { nhapCsvChamCong } from "@/modules/cham-cong/may-cham-cong";

export const dynamic = "force-dynamic";

/** POST { noiDung, ghi } — nhập lần chấm từ CSV (dự phòng, NS-16). ghi=false: chỉ xem trước. */
export const POST = xuLyApi(async (nc, req) => {
  const d = await docThan(req, LuocDoNhapCsv);
  return nhapCsvChamCong(nc, d.noiDung, d.ghi);
}, { quyen: "cham_cong.update", hanGiaoDichMs: HAN_GIAO_DICH_THEO_LO_MS });
