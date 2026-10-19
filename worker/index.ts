import Redis from "ioredis";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { quetTheoLich } from "../src/modules/nhac-viec/service";
import { homNayVN } from "../src/modules/crm/chung";
import { guiLoThu } from "../src/modules/email/gui";
import { ghiNhipSong } from "./nhip";

/**
 * Tiến trình nền — Phase 8.
 *
 * Mỗi nhịp: kiểm tra kết nối, rồi hỏi từng doanh nghiệp "hôm nay đã quét nhắc việc
 * chưa, và đã tới giờ quét chưa". Tới giờ mà chưa quét thì chạy.
 *
 * Ba điều giữ cho nó không làm bậy khi máy chủ khởi động lại giữa chừng:
 *  1. **Một lần chạy theo lịch THÀNH CÔNG mỗi ngày** — chỉ mục riêng phần `job_runs_lich_moi_ngay`
 *     trên CSDL chặn lần thứ hai, không dựa vào biến trong bộ nhớ.
 *  2. **Việc sinh ra chống trùng bằng khóa duy nhất**, nên chạy lại cũng không nhân đôi.
 *  3. **Quét từng doanh nghiệp trong giao dịch riêng** — một doanh nghiệp hỏng không
 *     kéo theo doanh nghiệp khác.
 *
 * 0.16.1 (QĐ-86, QĐ-87): lần quét hỏng được ghi bằng giao dịch riêng và thử lại có giãn cách
 * (15 → 30 → 60 → 120 phút, tối đa 5 lần/ngày), hỏng liên tiếp thì báo quản trị; mỗi nhịp ghi
 * dấu sống vào PostgreSQL (`system_heartbeats`) — Redis hỏng không còn làm hỏng cả nhịp.
 *
 * Việc nặng hơn (sinh CEO Briefing, chạy tác nhân AI) thuộc Phase 9. Không giả vờ đã làm.
 */

const NHIP_MS = 60_000;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Thiếu DATABASE_URL.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Redis chỉ giữ thêm một bản dấu "nhịp cuối" (tương thích cũ); nhịp sống chính nằm ở PostgreSQL
// (`system_heartbeats`). Bản chạy thử trên máy cá nhân không có Redis thì worker vẫn chạy.
const redisUrl = process.env.REDIS_URL;
const redis = redisUrl ? new Redis(redisUrl, { maxRetriesPerRequest: 3 }) : null;
if (!redis) console.warn("[worker] Không có REDIS_URL — bỏ ghi dấu nhịp cuối (chỉ chấp nhận trên máy chạy thử).");
// ioredis phát sự kiện "error" mỗi lần kết nối lại hỏng; không bắt thì nó in "Unhandled error event"
// liên tục. Chỉ ghi một dòng mỗi 10 phút — nhịp sống thật đã nằm ở PostgreSQL.
let lanBaoRedis = 0;
redis?.on("error", (loi) => {
  if (Date.now() - lanBaoRedis < 600_000) return;
  lanBaoRedis = Date.now();
  console.error("[worker] Redis lỗi (worker vẫn chạy, nhịp sống ghi vào PostgreSQL):", loi.message);
});
let soNhip = 0;

let dangChay = true;

/** Giờ hiện tại theo giờ Việt Nam (0–23). */
function gioVN(luc: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", hour12: false }).format(luc),
  );
}

async function quetMotDoanhNghiep(tenantId: string, ma: string): Promise<void> {
  const homNay = homNayVN();
  const kq = await quetTheoLich(tenantId, gioVN(), { ngay: homNay });
  if (kq.trangThai === "xong") {
    const r = kq.ketQua;
    console.log(
      `[worker] ${ma}: quét ${homNay} — ${r.soQuyTacChay} quy tắc chạy, ${r.soQuyTacBoQua} bỏ qua, ` +
        `${r.soViec} việc, ${r.soThongBao} thông báo.`,
    );
  } else if (kq.trangThai === "hong") {
    console.error(`[worker] ${ma}: quét ${homNay} HỎNG (liên tiếp ${kq.loi.soLanHongLienTiep}) — ${kq.loi.loiGoc}`);
  } else if (kq.trangThai === "cho-thu-lai") {
    // Ghi mỗi 15 phút một lần là đủ, không kêu ca mỗi phút.
    if (new Date().getMinutes() % 15 === 0) console.warn(`[worker] ${ma}: bản quét ${homNay} ${kq.lyDo}.`);
  }
}

async function motNhip() {
  const luc = new Date().toISOString();
  soNhip += 1;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (loi) {
    console.error(`[worker] ${luc} — nhịp hỏng, không nói chuyện được với CSDL:`, loi);
    return;
  }
  // Mỗi kho trong try riêng (ghiNhipSong tự bắt lỗi): Redis hỏng không bỏ bản quét như trước.
  const nhip = await ghiNhipSong(prisma, redis, { pid: process.pid, nhip: soNhip, phienBan: process.env.npm_package_version ?? null });
  if (!nhip.pg) console.error(`[worker] ${luc} — không ghi được nhịp sống vào PostgreSQL: ${nhip.loiPg}`);
  if (nhip.redis === false && Date.now() - lanBaoRedis >= 600_000) {
    lanBaoRedis = Date.now();
    console.error(`[worker] ${luc} — không ghi được dấu nhịp vào Redis (bỏ qua): ${nhip.loiRedis}`);
  }

  let dn: { id: string; code: string }[] = [];
  try {
    dn = await prisma.tenant.findMany({ where: { status: "hoat-dong" }, select: { id: true, code: true } });
  } catch (loi) {
    console.error(`[worker] ${luc} — không đọc được danh sách doanh nghiệp:`, loi);
    return;
  }

  for (const t of dn) {
    if (!dangChay) return;
    try {
      await quetMotDoanhNghiep(t.id, t.code);
    } catch (loi) {
      // Một doanh nghiệp hỏng thì ghi lại và đi tiếp. Bản quét hỏng đã được quetTheoLich ghi vào
      // job_runs; tới đây chỉ còn lỗi ở bước kiểm (CSDL đứt giữa chừng…).
      console.error(`[worker] ${luc} — quét doanh nghiệp ${t.code} hỏng:`, loi);
    }
    // 0.16.0 — gửi chiến dịch email: mỗi nhịp một lô, tốc độ theo Cấu hình (email.so_thu_moi_phut).
    try {
      const kq = await guiLoThu(t.id);
      if (kq.daGui || kq.loi || kq.boQua || kq.tamDung || kq.xong.length) {
        console.log(
          `[worker] ${t.code}: email — gửi ${kq.daGui}, lỗi ${kq.loi}, bỏ qua ${kq.boQua}, trả lại ${kq.traLai}` +
            `${kq.tamDung ? ", TỰ TẠM DỪNG (hộp thư gửi lỗi)" : ""}${kq.xong.length ? `, ${kq.xong.length} chiến dịch xong` : ""}.`,
        );
      }
    } catch (loi) {
      console.error(`[worker] ${luc} — gửi email doanh nghiệp ${t.code} hỏng:`, loi);
    }
  }
}

async function main() {
  console.log("[worker] Khởi động. Phase 8: quét nhắc việc hằng ngày theo giờ trong Cấu hình. 0.16.0: gửi chiến dịch email theo lô. 0.16.1: nhịp sống vào PostgreSQL, quét hỏng thì thử lại có giãn cách.");
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
    await Promise.allSettled([prisma.$disconnect(), redis?.quit()]);
    process.exit(0);
  });
}

main().catch((loi) => {
  console.error("[worker] Hỏng:", loi);
  process.exit(1);
});
