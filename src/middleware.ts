import { NextRequest, NextResponse } from "next/server";
import { giaiMaPhien } from "@/lib/xac-thuc";

/**
 * Chặn ở cổng: yêu cầu chưa đăng nhập không vào được trang trong hệ thống.
 *
 * Lưu ý: đây chỉ là lớp chặn thứ nhất, kiểm chữ ký cookie. Nó KHÔNG thay thế
 * việc kiểm quyền ở từng hành động (`batBuocQuyen`) và cũng không thay thế RLS.
 */

const DUONG_MO = ["/dang-nhap", "/api/dang-nhap", "/api/khoe"];

export async function middleware(req: NextRequest) {
  const duongDan = req.nextUrl.pathname;

  if (DUONG_MO.some((d) => duongDan === d || duongDan.startsWith(d + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("cowork_phien")?.value;
  const phien = token ? await giaiMaPhien(token) : null;

  if (!phien) {
    if (duongDan.startsWith("/api/")) {
      return NextResponse.json({ thongBao: "Chưa đăng nhập." }, { status: 401 });
    }
    const dich = new URL("/dang-nhap", req.url);
    return NextResponse.redirect(dich);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
