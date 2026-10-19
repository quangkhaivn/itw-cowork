import Redis from "ioredis";

/**
 * Giới hạn tốc độ — chống dò mật khẩu (mục 34 master prompt: rate limiting).
 *
 * Kiểu "cửa sổ cố định": đếm số lần trong một khoảng; vượt ngưỡng thì chặn tới hết
 * khoảng đó. Đủ cho đăng nhập, không cần thuật toán phức tạp hơn.
 *
 * Kho đếm:
 *   - Có REDIS_URL (máy chủ thật) → Redis, dùng chung giữa mọi tiến trình.
 *   - Không có (máy phát triển) → bộ nhớ tiến trình.
 * Redis lỗi (0.16.1, QĐ-90): đếm tạm bằng bộ nhớ của CHÍNH tiến trình này thay vì cho qua hết —
 * vẫn chặn được dò mật khẩu / spam form từ một IP, chỉ không dùng chung giữa các tiến trình. Kho dự
 * phòng cũng hỏng thì mới cho qua (lớp khóa tài khoản `users.locked_until` vẫn chặn), để một sự cố
 * không khóa cả công ty ra ngoài. Lớp thứ ba nằm trước ứng dụng: `limit_req` của nginx (nginx/cowork.conf).
 */

export interface KetQuaGioiHan {
  choPhep: boolean;
  soLan: number;
  conLaiGiay: number;
}

export interface KhoDem {
  tang(khoa: string, cuaSoGiay: number): Promise<{ soLan: number; conLaiGiay: number }>;
  xoa(khoa: string): Promise<void>;
}

/** Kho trong bộ nhớ. Xuất ra để kiểm thử đơn vị. */
export class KhoDemBoNho implements KhoDem {
  private readonly bang = new Map<string, { soLan: number; hetHan: number }>();
  constructor(private readonly bayGio: () => number = Date.now) {}

  async tang(khoa: string, cuaSoGiay: number) {
    const t = this.bayGio();
    const cu = this.bang.get(khoa);
    if (!cu || cu.hetHan <= t) {
      this.bang.set(khoa, { soLan: 1, hetHan: t + cuaSoGiay * 1000 });
      // Dọn dần để bảng không phình mãi.
      if (this.bang.size > 10_000) {
        for (const [k, v] of this.bang) if (v.hetHan <= t) this.bang.delete(k);
      }
      return { soLan: 1, conLaiGiay: cuaSoGiay };
    }
    cu.soLan += 1;
    return { soLan: cu.soLan, conLaiGiay: Math.ceil((cu.hetHan - t) / 1000) };
  }

  async xoa(khoa: string) {
    this.bang.delete(khoa);
  }
}

class KhoDemRedis implements KhoDem {
  constructor(private readonly redis: Redis) {}

  async tang(khoa: string, cuaSoGiay: number) {
    const k = `cowork:gioi-han:${khoa}`;
    const [[, soLan], [, ttl]] = (await this.redis.multi().incr(k).ttl(k).exec()) as [
      [unknown, number],
      [unknown, number],
    ];
    if (ttl < 0) await this.redis.expire(k, cuaSoGiay);
    return { soLan, conLaiGiay: ttl > 0 ? ttl : cuaSoGiay };
  }

  async xoa(khoa: string) {
    await this.redis.del(`cowork:gioi-han:${khoa}`);
  }
}

const bienToanCuc = globalThis as unknown as { khoDemGioiHan?: KhoDem };

function layKho(): KhoDem {
  if (bienToanCuc.khoDemGioiHan) return bienToanCuc.khoDemGioiHan;
  const url = process.env.REDIS_URL;
  bienToanCuc.khoDemGioiHan = url
    ? new KhoDemRedis(new Redis(url, { maxRetriesPerRequest: 1 }))
    : new KhoDemBoNho();
  return bienToanCuc.khoDemGioiHan;
}

const bienDuPhong = globalThis as unknown as { khoDemDuPhong?: KhoDem };
function khoDuPhongMacDinh(): KhoDem {
  return (bienDuPhong.khoDemDuPhong ??= new KhoDemBoNho());
}

let lanBaoLoi = 0;

/** Đếm thêm một lần và cho biết còn được phép không. */
export async function demVaKiem(
  khoa: string,
  toiDa: number,
  cuaSoGiay: number,
  kho: KhoDem = layKho(),
  duPhong: KhoDem = khoDuPhongMacDinh(),
): Promise<KetQuaGioiHan> {
  try {
    const { soLan, conLaiGiay } = await kho.tang(khoa, cuaSoGiay);
    return { choPhep: soLan <= toiDa, soLan, conLaiGiay };
  } catch (loi) {
    if (Date.now() - lanBaoLoi > 60_000) {
      lanBaoLoi = Date.now();
      console.error("[gioi-han-toc-do] kho đếm lỗi, tạm đếm trong bộ nhớ tiến trình:", loi instanceof Error ? loi.message : loi);
    }
    try {
      const { soLan, conLaiGiay } = await duPhong.tang(khoa, cuaSoGiay);
      return { choPhep: soLan <= toiDa, soLan, conLaiGiay };
    } catch {
      return { choPhep: true, soLan: 0, conLaiGiay: 0 };
    }
  }
}

export async function xoaDem(khoa: string, kho: KhoDem = layKho()): Promise<void> {
  try {
    await kho.xoa(khoa);
  } catch {
    // Không quan trọng: khóa sẽ tự hết hạn.
  }
}
