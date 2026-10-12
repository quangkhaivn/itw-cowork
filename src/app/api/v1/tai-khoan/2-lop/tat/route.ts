import { docThan, xuLyApi } from "@/lib/api";
import { datCookiePhien, kyPhien } from "@/lib/xac-thuc";
import { LuocDoTat2Lop, tat2Lop } from "@/modules/xac-thuc-2-lop/service";

export const dynamic = "force-dynamic";

/** Tắt 2 lớp: cần cả mật khẩu và một mã. Thu hồi mọi phiên khác, ký lại phiên hiện tại. */
export const POST = xuLyApi(async (nc, req) => {
  const d = await docThan(req, LuocDoTat2Lop);
  const kq = await tat2Lop(nc, d.matKhau, d.ma);
  await datCookiePhien(await kyPhien({ userId: nc.hoSo.userId, tenantId: nc.tenantId, email: nc.hoSo.email }));
  return kq;
});
