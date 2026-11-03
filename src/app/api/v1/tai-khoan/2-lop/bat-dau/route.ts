import { docThan, xuLyApi } from "@/lib/api";
import { batDau2Lop, LuocDoBatDau2Lop } from "@/modules/xac-thuc-2-lop/service";

export const dynamic = "force-dynamic";

/**
 * Sinh khóa bí mật mới (chưa có hiệu lực). Khóa chỉ trả về một lần cho chính chủ. QĐ-162: bắt buộc mật khẩu hiện tại;
 * đang bật (đổi thiết bị) thì thêm mã của thiết bị cũ.
 */
export const POST = xuLyApi(async (nc, req) => {
  const d = await docThan(req, LuocDoBatDau2Lop);
  return batDau2Lop(nc, d.matKhau, d.ma);
}, { choPhepKhiPhaiBat2Lop: true });
