import { docThan, xuLyApi } from "@/lib/api";
import { datCookiePhien, kyPhien } from "@/lib/xac-thuc";
import { LuocDoDoiMatKhauCuaToi } from "@/modules/nguoi-dung/luoc-do";
import { doiMatKhauCuaToi } from "@/modules/nguoi-dung/service";

export const dynamic = "force-dynamic";

/**
 * Tự đổi mật khẩu. Đổi xong thì mọi phiên cũ (máy khác) hết hiệu lực — nên phải
 * cấp lại cookie phiên cho chính máy đang đổi, nếu không người dùng tự bị đẩy ra.
 */
export const POST = xuLyApi(
  async (nc, req) => {
    const d = await docThan(req, LuocDoDoiMatKhauCuaToi);
    await doiMatKhauCuaToi(nc, d.matKhauHienTai, d.matKhauMoi);
    // Phiên mới ký SAU mốc đổi mật khẩu nên vẫn hợp lệ; phiên cũ ở máy khác thì không.
    await datCookiePhien(await kyPhien({ userId: nc.hoSo.userId, tenantId: nc.tenantId, email: nc.hoSo.email }));
    return { ok: true };
  },
  { choPhepKhiPhaiDoiMatKhau: true },
);
