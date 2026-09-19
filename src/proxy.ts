import { NextRequest, NextResponse } from "next/server";
import { giaiMaPhien } from "@/lib/xac-thuc";
import { cacHostHopLe, cungNguonGoc } from "@/lib/yeu-cau";

/**
 * Cổng vào (Next 16 đổi tên `middleware` thành `proxy`).
 *
 * Hai việc:
 *   1. Chặn CSRF: yêu cầu thay đổi dữ liệu tới /api phải đến từ chính trang của hệ thống.
 *   2. Chặn chưa đăng nhập: không vào được trang trong hệ thống.
 *
 * Đây chỉ là lớp chặn thứ nhất, kiểm chữ ký cookie. Nó KHÔNG thay thế kiểm quyền ở
 * từng hành động (`xuLyApi` → `batBuocQuyen`) và cũng không thay thế RLS.
 */

const DUONG_MO = ["/dang-nhap", "/api/dang-nhap", "/api/khoe"];

export async function proxy(req: NextRequest) {
  const duongDan = req.nextUrl.pathname;

  if (duongDan.startsWith("/api/") && !cungNguonGoc(req.method, req.headers, cacHostHopLe(req.headers))) {
    return NextResponse.json({ thongBao: "Yêu cầu bị từ chối: sai nguồn gốc." }, { status: 403 });
  }

  if (DUONG_MO.some((d) => duongDan === d || duongDan.startsWith(d + "/"))) {
    return NextResponse.next();
  }

  const token = req.cookies.get("cowork_phien")?.value;
  const phien = token ? await giaiMaPhien(token) : null;

  if (!phien) {
    if (duongDan.startsWith("/api/")) {
      return NextResponse.json({ thongBao: "Chưa đăng nhập." }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/dang-nhap", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
