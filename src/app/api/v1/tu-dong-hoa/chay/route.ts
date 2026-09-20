import { xuLyApi } from "@/lib/api";
import { chayQuetTay } from "@/modules/nhac-viec/service";

export const dynamic = "force-dynamic";

/** Nút "Chạy quét ngay" — cùng bản quét mà worker chạy mỗi sáng, chỉ khác là ghi 'tay'. */
export const POST = xuLyApi((nc) => chayQuetTay(nc));
