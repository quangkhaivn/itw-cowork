import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoGhiDienBien } from "@/modules/ho-tro/luoc-do";
import { ghiDienBien } from "@/modules/ho-tro/service";

export const dynamic = "force-dynamic";

/** Ghi việc đã làm cho khách. Lần liên hệ khách đầu tiên tính là mốc phản hồi SLA (HT-04). */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const d = await docThan(req, LuocDoGhiDienBien);
  return ghiDienBien(nc, id, { loai: d.loai, noiDung: d.noiDung });
});
