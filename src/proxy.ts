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

const DUONG_MO = [
  "/dang-nhap",
  "/api/dang-nhap",
  "/api/khoe",
  // 0.16.0 — Marketing (QĐ-61). Trang form / landing công khai và API nhận lead không cần phiên;
  // mỗi route tự giải tenant từ mã doanh nghiệp trên đường dẫn rồi mới chạy trong voiTenant.
  "/f",
  "/lp",
  "/api/cong-khai",
  // 0.16.0 — Email marketing (QĐ-76): trang hủy nhận tin một chạm từ liên kết trong thư.
  "/huy-nhan-tin",
];

/**
 * Đường ghi KHÔNG kiểm Origin: webhook gọi từ máy chủ khác (Zapier, Make…) không có Origin.
 * Không có cookie nào được dùng ở đây — xác thực bằng khóa bí mật trong tiêu đề (MK-12), nên
 * CSRF (vốn lợi dụng cookie của trình duyệt) không áp dụng. Form công khai thì VẪN kiểm Origin:
 * chỉ trang /f, /lp của chính hệ thống (kể cả khi nằm trong iframe) mới gửi được.
 */
const KHONG_KIEM_NGUON = [
  "/api/cong-khai/webhook/",
  // Email marketing (QĐ-76): người nhận thư / ứng dụng thư (List-Unsubscribe-Post) không gửi Origin.
  // Xác thực bằng MÃ KÝ trong đường dẫn, không dùng cookie phiên — không có gì để giả mạo liên trang.
  "/api/cong-khai/huy-nhan-tin/",
  "/api/cong-khai/email/",
];

export async function proxy(req: NextRequest) {
  const duongDan = req.nextUrl.pathname;

  if (
    duongDan.startsWith("/api/") &&
    !KHONG_KIEM_NGUON.some((d) => duongDan.startsWith(d)) &&
    !cungNguonGoc(req.method, req.headers, cacHostHopLe(req.headers))
  ) {
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
