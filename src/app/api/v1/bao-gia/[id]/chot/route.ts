import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoChotBaoGia } from "@/modules/bao-gia/luoc-do";
import { chotBaoGia } from "@/modules/bao-gia/service";

export const dynamic = "force-dynamic";

/** Khách trả lời: chấp nhận, từ chối, hoặc đang thương lượng. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const d = await docThan(req, LuocDoChotBaoGia);
  return chotBaoGia(nc, id, { ketQua: d.ketQua, ghiChu: d.ghiChu ?? null });
});
