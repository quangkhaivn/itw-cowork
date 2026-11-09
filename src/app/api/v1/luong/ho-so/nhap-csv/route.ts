import { z } from "zod";
import { docThan, xuLyApi } from "@/lib/api";
import { HAN_GIAO_DICH_THEO_LO_MS } from "@/lib/db";
import { nhapCsvHoSoLuong } from "@/modules/luong/ho-so";
import { ngayHopLe } from "@/modules/luong/luoc-do";

export const dynamic = "force-dynamic";

const Than = z.object({
  noiDung: z.string().max(5_000_000, "Tệp quá lớn."),
  ghi: z.boolean().default(false),
  hieuLucTu: z.union([ngayHopLe, z.literal(""), z.null()]).optional().transform((x) => x || undefined),
});

/** 0.22.0 (QĐ-179): POST { noiDung, ghi, hieuLucTu? } — nhập CSV hồ sơ lương. ghi=false: chỉ xem trước. */
export const POST = xuLyApi(async (nc, req) => {
  const d = await docThan(req, Than);
  return nhapCsvHoSoLuong(nc, d.noiDung, d.ghi, d.hieuLucTu);
}, { quyen: "luong.update", hanGiaoDichMs: HAN_GIAO_DICH_THEO_LO_MS });
