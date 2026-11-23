import { NextRequest, NextResponse } from "next/server";
import { LoiChuaDangNhap, xuLyApi } from "@/lib/api";
import { layPhienHienTai } from "@/lib/xac-thuc";
import { nhanCallbackOAuth } from "@/modules/mang-xa-hoi/oauth";
import { maPhien } from "@/modules/mang-xa-hoi/oauth-thuan";

export const dynamic = "force-dynamic";

function goc(req: NextRequest): string {
  try {
    if (process.env.APP_URL) return new URL(process.env.APP_URL).origin;
  } catch {
    /* rơi xuống URL yêu cầu */
  }
  return req.nextUrl.origin;
}

const xuLy = xuLyApi<{ nhaCungCap: string }>(async (nc, req, { nhaCungCap }) => {
  const p = await layPhienHienTai();
  if (!p) throw new LoiChuaDangNhap();
  const q = req.nextUrl.searchParams;
  const kq = await nhanCallbackOAuth(nc, nhaCungCap, { code: q.get("code"), state: q.get("state"), error: q.get("error"), error_description: q.get("error_description") }, maPhien(p.userId, p.tenantId, p.kyLucMs), req.nextUrl.pathname);
  const dich = kq.ok ? `/mang-xa-hoi/kenh/chon/${kq.yeuCauId}` : `/mang-xa-hoi/kenh?loi-ket-noi=${encodeURIComponent(kq.ma)}`;
  return NextResponse.redirect(new URL(dich, goc(req)), 303);
}, { quyen: "mxh.update" });

/**
 * Nền tảng chuyển trình duyệt về đây sau màn hình cấp quyền (0.24.0, QĐ-203). Cần phiên đăng nhập (cookie SameSite=Lax đi
 * theo lần chuyển hướng cấp cao nhất); chưa đăng nhập → về trang đăng nhập (state vẫn còn hạn 10 phút).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ nhaCungCap: string }> }) {
  if (!(await layPhienHienTai())) return NextResponse.redirect(new URL("/dang-nhap", goc(req)), 303);
  return xuLy(req, ctx);
}
