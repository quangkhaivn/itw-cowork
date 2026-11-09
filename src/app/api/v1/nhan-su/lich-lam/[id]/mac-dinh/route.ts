import { xuLyApi } from "@/lib/api";
import { datLichMacDinh } from "@/modules/nhan-su/service";

export const dynamic = "force-dynamic";

/** 0.22.0 (QĐ-171): chọn lịch này làm lịch mặc định của doanh nghiệp. */
export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => datLichMacDinh(nc, id), { quyen: "nhan_su.update" });
