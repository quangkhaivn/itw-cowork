import { xuLyApi } from "@/lib/api";
import { taoLaiMaXacMinh } from "@/modules/cham-cong/may-cham-cong";

export const dynamic = "force-dynamic";

/** 0.22.0 (QĐ-181): tạo lại mã PIN xác minh sở hữu (24 giờ) cho máy chờ xác minh. */
export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => taoLaiMaXacMinh(nc, id));
