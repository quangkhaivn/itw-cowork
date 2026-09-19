import { docThan, xuLyApi } from "@/lib/api";
import { cayPhongBan, LuocDoTaoPhongBan, taoPhongBan } from "@/modules/phong-ban/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => cayPhongBan(nc));

export const POST = xuLyApi(async (nc, req) => taoPhongBan(nc, await docThan(req, LuocDoTaoPhongBan)));
