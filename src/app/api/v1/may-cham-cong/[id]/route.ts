import { xuLyApi } from "@/lib/api";
import { huyDangKyMay } from "@/modules/cham-cong/may-cham-cong";

export const dynamic = "force-dynamic";

/** 0.22.0 (QĐ-181): hủy đăng ký máy CHƯA xác minh — xóa máy + log cách ly. */
export const DELETE = xuLyApi<{ id: string }>((nc, _req, { id }) => huyDangKyMay(nc, id));
