import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoSuaPhongBan, suaPhongBan } from "@/modules/phong-ban/service";

export const dynamic = "force-dynamic";

export const PATCH = xuLyApi<{ id: string }>(async (nc, req, { id }) =>
  suaPhongBan(nc, id, await docThan(req, LuocDoSuaPhongBan)),
);
