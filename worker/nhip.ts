import type Redis from "ioredis";
import { ghiNhip, TEN_NHIP_WORKER, type ClientNhip } from "../src/modules/van-hanh/nhip";
import { cauLoiGon } from "../src/modules/van-hanh/tinh-toan";

/**
 * Nhịp sống của worker (0.16.1, QĐ-87).
 *
 * Ghi vào **PostgreSQL** (`system_heartbeats`, dòng 'worker') — nơi màn hình Tự động hóa, `/api/khoe`
 * và healthcheck Docker (`worker/kiem-tra-song.ts`) đọc. Dấu trong Redis giữ lại cho tương thích,
 * nhưng mỗi kho nằm trong `try` riêng: trước đây Redis hỏng làm hỏng cả nhịp, bỏ luôn bản quét.
 */

export const KHOA_NHIP_REDIS = "cowork:worker:nhip-cuoi";
/** Redis treo (đang kết nối lại) thì không được giữ nhịp quá lâu. */
const HAN_REDIS_MS = 2_000;

export interface KetQuaNhip {
  pg: boolean;
  redis: boolean | null;
  loiPg: string | null;
  loiRedis: string | null;
}

function voiHan<T>(viec: Promise<T>, ms: number, cau: string): Promise<T> {
  let hen: NodeJS.Timeout | undefined;
  return Promise.race([
    viec,
    new Promise<T>((_, tuChoi) => {
      hen = setTimeout(() => tuChoi(new Error(cau)), ms);
    }),
  ]).finally(() => clearTimeout(hen));
}

export async function ghiNhipSong(
  client: ClientNhip,
  redis: Pick<Redis, "set"> | null,
  info: Record<string, unknown> = {},
  luc: Date = new Date(),
): Promise<KetQuaNhip> {
  const kq: KetQuaNhip = { pg: false, redis: redis ? false : null, loiPg: null, loiRedis: null };
  try {
    await ghiNhip(client, TEN_NHIP_WORKER, { ...info, luc: luc.toISOString() });
    kq.pg = true;
  } catch (loi) {
    kq.loiPg = cauLoiGon(loi, 200);
  }
  if (redis) {
    try {
      await voiHan(redis.set(KHOA_NHIP_REDIS, luc.toISOString(), "EX", 300), HAN_REDIS_MS, "Redis không trả lời.");
      kq.redis = true;
    } catch (loi) {
      kq.loiRedis = cauLoiGon(loi, 200);
    }
  }
  return kq;
}
