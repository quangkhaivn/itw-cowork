import { xuLyApi } from "@/lib/api";
import { phieuLuongCuaToi } from "@/modules/luong/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi(async (nc) => phieuLuongCuaToi(nc), { quyen: "luong.view" });
