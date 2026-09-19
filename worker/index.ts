import Redis from "ioredis";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Tiến trình nền.
 *
 * Phase 1 CỐ Ý để trống phần nghiệp vụ. Ở đây mới chỉ đấu dây và chứng minh
 * worker nói chuyện được với cơ sở dữ liệu và Redis. Việc thật của worker —
 * quét cảnh báo (mục 23), chạy automation (mục 24), sinh CEO Briefing (mục 5.6) —
 * thuộc Phase 4 trở đi. Không giả vờ đã làm.
 */

const NHIP_MS = 60_000;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Thiếu DATABASE_URL.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("Thiếu REDIS_URL.");
const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });

let dangChay = true;

async function motNhip() {
  const luc = new Date().toISOString();
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.set("cowork:worker:nhip-cuoi", luc, "EX", 300);
    console.log(`[worker] ${luc} — db ok, redis ok`);
  } catch (loi) {
    console.error(`[worker] ${luc} — nhịp hỏng:`, loi);
  }
}

async function main() {
  console.log("[worker] Khởi động. Phase 1: mới đấu dây, chưa xử lý nghiệp vụ.");
  await motNhip();
  while (dangChay) {
    await new Promise((r) => setTimeout(r, NHIP_MS));
    if (dangChay) await motNhip();
  }
}

for (const tinHieu of ["SIGTERM", "SIGINT"] as const) {
  process.on(tinHieu, async () => {
    console.log(`[worker] Nhận ${tinHieu}, đang dừng gọn.`);
    dangChay = false;
    await Promise.allSettled([prisma.$disconnect(), redis.quit()]);
    process.exit(0);
  });
}

main().catch((loi) => {
  console.error("[worker] Hỏng:", loi);
  process.exit(1);
});
