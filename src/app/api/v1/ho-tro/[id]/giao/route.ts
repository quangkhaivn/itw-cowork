import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoGiaoPhieu } from "@/modules/ho-tro/luoc-do";
import { giaoPhieu } from "@/modules/ho-tro/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const d = await docThan(req, LuocDoGiaoPhieu);
  return giaoPhieu(nc, id, d.nguoiXuLyId, d.ghiChu ?? null);
});
