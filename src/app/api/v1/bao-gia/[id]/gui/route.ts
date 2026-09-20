import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoGuiKhach } from "@/modules/bao-gia/luoc-do";
import { guiKhach } from "@/modules/bao-gia/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => {
  const d = await docThan(req, LuocDoGuiKhach);
  return guiKhach(nc, id, { kenh: d.kenh, ghiChu: d.ghiChu ?? null });
});
