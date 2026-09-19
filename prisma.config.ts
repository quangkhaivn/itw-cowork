import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 chuyển url của datasource ra khỏi schema.prisma.
 *
 * Tệp này chỉ phục vụ Prisma CLI (migrate, generate). Ứng dụng lúc chạy KHÔNG
 * đọc tệp này — nó kết nối qua adapter trong src/lib/db.ts bằng vai `cowork_app`.
 *
 * Khi chạy migration, script trien-khai.sh ghi đè DATABASE_URL bằng
 * DATABASE_URL_OWNER, vì migration cần vai chủ sở hữu.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
