import { xuLyApi } from "@/lib/api";
import { HAN_GIAO_DICH_THEO_LO_MS } from "@/lib/db";
import { tinhLaiToanBo } from "@/modules/cham-diem/service";

export const dynamic = "force-dynamic";

export const POST = xuLyApi((nc) => tinhLaiToanBo(nc), { quyen: "customer.approve", hanGiaoDichMs: HAN_GIAO_DICH_THEO_LO_MS });
