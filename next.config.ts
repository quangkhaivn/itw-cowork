import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ứng dụng chạy sau hai lớp proxy (nginx máy chủ → nginx trong compose).
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["@prisma/client", "pg", "bcryptjs"],
  // 0.24.0: proxy (src/proxy.ts) đệm thân yêu cầu tối đa 10 MB theo mặc định — tệp đính kèm 10–20 MB bị cắt cụt. Nâng
  // khớp nginx (client_max_body_size 25m). Video lớn hơn đi đường Google Drive (máy chủ tự tải), không qua trình duyệt.
  experimental: { proxyClientMaxBodySize: "25mb" },
  // Tiêu đề bảo mật đặt ngay trong ứng dụng, không phụ thuộc cấu hình nginx của từng máy.
  // Không đặt X-Frame-Options: nginx máy chủ đã gửi SAMEORIGIN, đặt thêm DENY ở đây thành hai
  // giá trị mâu thuẫn (đã thấy trên máy thật 19/09). Chống nhúng khung bằng CSP frame-ancestors —
  // chuẩn mới, trình duyệt ưu tiên hơn X-Frame-Options.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
        ],
      },
      {
        // 0.16.0 — QĐ-62: CHỈ trang form đăng ký công khai được nhúng iframe vào website khác
        // (https). Mục này đứng sau nên ghi đè CSP của mục trên cho đúng đường /f/… (khóa trùng
        // thì mục sau thắng — tài liệu next.config `headers`). Landing page và mọi trang trong hệ
        // thống vẫn 'none'. Trình duyệt hiện đại bỏ qua X-Frame-Options khi có frame-ancestors.
        source: "/f/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self' https:; base-uri 'self'; form-action 'self'" }],
      },
    ];
  },
};

export default nextConfig;
