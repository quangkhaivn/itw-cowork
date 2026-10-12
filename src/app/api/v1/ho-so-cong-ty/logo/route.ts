import { docThan, xuLyApi } from "@/lib/api";
import { datLogoCongTy, LuocDoLogo, xoaLogoCongTy } from "@/modules/ho-so-cong-ty/service";

export const dynamic = "force-dynamic";

/** Đặt logo công ty (PNG / JPEG / WebP ≤ 512 KB, kiểm byte đầu). */
export const PUT = xuLyApi(async (nc, req) => datLogoCongTy(nc, await docThan(req, LuocDoLogo)), { quyen: "setting.update" });
export const DELETE = xuLyApi((nc) => xoaLogoCongTy(nc), { quyen: "setting.update" });
