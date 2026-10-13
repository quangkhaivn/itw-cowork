import { docThan, docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocNguoiNhan, LuocDoSuaChienDich } from "@/modules/email/luoc-do";
import { chiTietChienDich, suaChienDich } from "@/modules/email/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi<{ id: string }>((nc, req, { id }) => chiTietChienDich(nc, id, docTruyVan(req, LuocDoLocNguoiNhan)), {
  quyen: "marketing.view",
});
/** Sửa khi còn Nháp. */
export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) => suaChienDich(nc, id, await docThan(req, LuocDoSuaChienDich)), {
  quyen: "marketing.update",
});
