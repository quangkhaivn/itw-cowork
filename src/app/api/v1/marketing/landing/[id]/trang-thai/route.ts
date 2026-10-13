import { docThan, xuLyApi } from "@/lib/api";
import { doiTrangThaiLanding, LuocDoTrangThaiLanding } from "@/modules/marketing/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(
  async (nc, req, { id }) => doiTrangThaiLanding(nc, id, (await docThan(req, LuocDoTrangThaiLanding)).trangThai),
  { quyen: "marketing.update" },
);
