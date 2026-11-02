import { docThan, xuLyApi } from "@/lib/api";
import { LuocDoNhanXetNhatKy, nhanXetNhatKy } from "@/modules/thuc-tap/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi<{ id: string }>(async (nc, req, { id }) => nhanXetNhatKy(nc, id, await docThan(req, LuocDoNhanXetNhatKy)));
