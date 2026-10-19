import { xuLyApi } from "@/lib/api";
import { xemVanHanh } from "@/modules/nhac-viec/service";

export const dynamic = "force-dynamic";

/** Tình trạng vận hành chi tiết (worker, sao lưu, bản quét) — chỉ người có `setting.view` (0.16.1). */
export const GET = xuLyApi((nc) => xemVanHanh(nc), { quyen: "setting.view" });
