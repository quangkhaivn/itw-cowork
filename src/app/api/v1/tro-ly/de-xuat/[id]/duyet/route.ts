import { xuLyApi } from "@/lib/api";
import { duyetDeXuat } from "@/modules/tro-ly/de-xuat";

export const dynamic = "force-dynamic";

/** Người dùng bấm Đồng ý: service chạy với quyền của NGƯỜI BẤM, không phải của trợ lý (AI-03). */
export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => duyetDeXuat(nc, id));
