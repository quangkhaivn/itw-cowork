import { xuLyApi } from "@/lib/api";
import { xemTuDongHoa } from "@/modules/nhac-viec/service";

export const dynamic = "force-dynamic";

export const GET = xuLyApi((nc) => xemTuDongHoa(nc), { quyen: "setting.view" });
