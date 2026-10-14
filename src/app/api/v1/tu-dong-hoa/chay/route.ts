import { xuLyApiNhieuBuoc } from "@/lib/api-nhieu-buoc";
import { chayQuetTay } from "@/modules/nhac-viec/service";

export const dynamic = "force-dynamic";

/**
 * Nút "Chạy quét ngay" — cùng bản quét mà worker chạy mỗi sáng, chỉ khác là ghi 'tay'.
 * Nhiều bước (QĐ-86): bản quét chạy trong giao dịch dài riêng, hỏng thì lần hỏng vẫn được ghi.
 */
export const POST = xuLyApiNhieuBuoc((nb) => chayQuetTay(nb));
