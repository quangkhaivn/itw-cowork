import { docThan, xuLyApi } from "@/lib/api";
import { HAN_GIAO_DICH_THEO_LO_MS } from "@/lib/db";
import { LuocDoNhapCsv } from "@/modules/cham-cong/luoc-do";
import { nhapCsvAnhXaPin } from "@/modules/cham-cong/may-cham-cong";

export const dynamic = "force-dynamic";

/** 0.22.0 (QĐ-179): POST { noiDung, ghi } — nhập CSV ánh xạ PIN ↔ email. ghi=false: chỉ xem trước. */
export const POST = xuLyApi(async (nc, req) => {
  const d = await docThan(req, LuocDoNhapCsv);
  return nhapCsvAnhXaPin(nc, d.noiDung, d.ghi);
}, { hanGiaoDichMs: HAN_GIAO_DICH_THEO_LO_MS });
