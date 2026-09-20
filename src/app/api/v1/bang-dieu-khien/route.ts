import { xuLyApi } from "@/lib/api";
import { bangDieuKhien } from "@/modules/bang-dieu-khien/service";

export const dynamic = "force-dynamic";

/** Chỉ số cho Bảng điều hành — chỉ trả khối nào người xem có quyền. */
export const GET = xuLyApi((nc) => bangDieuKhien(nc));
