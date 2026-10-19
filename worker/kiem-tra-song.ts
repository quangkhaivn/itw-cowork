import pg from "pg";
import { danhGiaNhipWorker, PHUT_WORKER_TRE } from "../src/modules/van-hanh/tinh-toan";

/**
 * Healthcheck của container `worker` (docker-compose.yml) — 0.16.1, QĐ-87.
 *
 *   node_modules/.bin/tsx worker/kiem-tra-song.ts     → mã thoát 0 = sống, 1 = trễ / không đọc được
 *
 * Đọc dòng 'worker' trong `system_heartbeats` (worker ghi mỗi phút). Trễ quá PHUT_WORKER_TRE phút
 * (mặc định 5, đổi bằng biến NGUONG_PHUT_WORKER) là coi như worker đứng — tiến trình còn đó nhưng
 * vòng lặp treo, hoặc không ghi được vào CSDL. Không dùng Prisma để chạy nhanh và nhẹ.
 */
async function main(): Promise<number> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("kiem-tra-song: thiếu DATABASE_URL");
    return 1;
  }
  const nguong = Number(process.env.NGUONG_PHUT_WORKER) || PHUT_WORKER_TRE;
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5_000, statement_timeout: 5_000 });
  try {
    await client.connect();
    const r = await client.query<{ last_at: Date }>("SELECT last_at FROM system_heartbeats WHERE name = 'worker'");
    const lanCuoi = r.rows[0]?.last_at ?? null;
    const tt = danhGiaNhipWorker(lanCuoi, new Date(), nguong);
    console.log(`kiem-tra-song: ${tt}${lanCuoi ? ` (nhịp cuối ${lanCuoi.toISOString()})` : ""}`);
    return tt === "ok" ? 0 : 1;
  } catch (loi) {
    console.error("kiem-tra-song: không đọc được nhịp —", loi instanceof Error ? loi.message : loi);
    return 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main().then((ma) => process.exit(ma));
