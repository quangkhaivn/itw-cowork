import { docThan, xuLyApi } from "@/lib/api";
import { capNhatHoSoCongTy, LuocDoHoSoCongTy, xemHoSoCongTy } from "@/modules/ho-so-cong-ty/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => xemHoSoCongTy(nc), { quyen: "setting.view" });

export const PATCH = xuLyApi(async (nc, req) => capNhatHoSoCongTy(nc, await docThan(req, LuocDoHoSoCongTy)));
