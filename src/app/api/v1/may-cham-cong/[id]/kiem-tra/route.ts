import { xuLyApi } from "@/lib/api";
import { kiemTraKetNoiMay } from "@/modules/cham-cong/may-cham-cong";

export const dynamic = "force-dynamic";

/** 0.22.0 (QĐ-178): "Kiểm tra kết nối" — lần gọi cuối của máy, IP nguồn, trực tuyến hay chưa. */
export const GET = xuLyApi<{ id: string }>((nc, _req, { id }) => kiemTraKetNoiMay(nc, id));
