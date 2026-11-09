import { xuLyApi } from "@/lib/api";
import { layLaiCongTuBangCong } from "@/modules/luong/service";

export const dynamic = "force-dynamic";

/** 0.22.0 (QĐ-172): "Lấy lại công từ bảng công" — bảng công đã khóa sau; kỳ còn nháp. */
export const POST = xuLyApi<{ id: string }>((nc, _req, { id }) => layLaiCongTuBangCong(nc, id), { quyen: "luong.create" });
