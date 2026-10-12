import { xuLyApi } from "@/lib/api";
import { batDau2Lop } from "@/modules/xac-thuc-2-lop/service";

export const dynamic = "force-dynamic";

/** Sinh khóa bí mật mới (chưa có hiệu lực). Khóa chỉ trả về một lần cho chính chủ. */
export const POST = xuLyApi((nc) => batDau2Lop(nc), { choPhepKhiPhaiBat2Lop: true });
