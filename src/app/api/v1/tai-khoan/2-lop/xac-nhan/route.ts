import { docThan, xuLyApi } from "@/lib/api";
import { datCookiePhien, kyPhien } from "@/lib/xac-thuc";
import { LuocDoMa, xacNhan2Lop } from "@/modules/xac-thuc-2-lop/service";

export const dynamic = "force-dynamic";

/**
 * Nhập mã đúng → bật 2 lớp. Mọi phiên khác bị thu hồi (XT-07), nên ký lại phiên cho chính
 * máy đang bật — như đổi mật khẩu.
 */
export const POST = xuLyApi(
  async (nc, req) => {
    const kq = await xacNhan2Lop(nc, (await docThan(req, LuocDoMa)).ma);
    await datCookiePhien(await kyPhien({ userId: nc.hoSo.userId, tenantId: nc.tenantId, email: nc.hoSo.email }));
    return kq;
  },
  { choPhepKhiPhaiBat2Lop: true },
);
