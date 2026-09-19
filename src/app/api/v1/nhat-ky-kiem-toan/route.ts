import { docTruyVan, xuLyApi } from "@/lib/api";
import { LuocDoLocKiemToan, traCuuKiemToan } from "@/modules/kiem-toan/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc, req) => traCuuKiemToan(nc, docTruyVan(req, LuocDoLocKiemToan)));
