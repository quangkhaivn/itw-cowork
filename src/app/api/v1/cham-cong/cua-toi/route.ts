import { xuLyApi } from "@/lib/api";
import { chamCongCuaToi } from "@/modules/cham-cong/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => chamCongCuaToi(nc), { quyen: "cham_cong.view" });
