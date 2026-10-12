import { xuLyApi } from "@/lib/api";
import { tinhLaiToanBo } from "@/modules/cham-diem/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi((nc) => tinhLaiToanBo(nc), { quyen: "customer.approve" });
