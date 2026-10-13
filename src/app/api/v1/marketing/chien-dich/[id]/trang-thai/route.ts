import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoDoiTrangThaiChienDich } from "@/modules/marketing/luoc-do";
import { doiTrangThaiChienDich } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(
  async (nc, req, { id }) => {
    const d = await docThan(req, LuocDoDoiTrangThaiChienDich);
    return doiTrangThaiChienDich(nc, id, d.trangThai, d.lyDo);
  },
  { quyen: "marketing.update" },
);
