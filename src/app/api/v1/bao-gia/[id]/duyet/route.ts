import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoQuyetDuyet } from "@/modules/bao-gia/luoc-do";
import { quyetDuyet } from "@/modules/bao-gia/service";

export const dynamic = "force-dynamic";

/** Duyệt hoặc từ chối báo giá dưới ngưỡng biên lợi nhuận. */
export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const d = await docThan(req, LuocDoQuyetDuyet);
  return quyetDuyet(nc, id, { quyetDinh: d.quyetDinh, ghiChu: d.ghiChu ?? null });
});
