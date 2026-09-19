import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ứng dụng chạy sau hai lớp proxy (nginx máy chủ → nginx trong compose).
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["@prisma/client", "pg", "bcryptjs"],
};

export default nextConfig;
