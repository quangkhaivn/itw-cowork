import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ứng dụng chạy sau hai lớp proxy (nginx máy chủ → nginx trong compose).
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["@prisma/client", "pg", "bcryptjs"],
  // Tiêu đề bảo mật đặt ngay trong ứng dụng, không phụ thuộc cấu hình nginx của từng máy.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
