import Redis from "ioredis";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { voiTenant } from "../src/lib/db";
import { chayQuet } from "../src/modules/nhac-viec/service";
import { docCauHinh } from "../src/modules/cau-hinh/service";
import { homNayVN } from "../src/modules/crm/chung";
import { MA_TAC_VU_QUET } from "../src/modules/nhac-viec/quy-tac";
import { daToiGioChay } from "../src/modules/nhac-viec/tinh-toan";

/**
 * Tiến trình nền — Phase 8.
 *
 * Mỗi nhịp: kiểm tra kết nối, rồi hỏi từng doanh nghiệp "hôm nay đã quét nhắc việc
 * chưa, và đã tới giờ quét chưa". Tới giờ mà chưa quét thì chạy.
 *
 * Ba điều giữ cho nó không làm bậy khi máy chủ khởi động lại giữa chừng:
 *  1. **Một lần chạy theo lịch mỗi ngày** — chỉ mục riêng phần `job_runs_lich_moi_ngay`
 *     trên CSDL chặn lần thứ hai, không dựa vào biến trong bộ nhớ.
 *  2. **Việc sinh ra chống trùng bằng khóa duy nhất**, nên chạy lại cũng không nhân đôi.
 *  3. **Quét từng doanh nghiệp trong giao dịch riêng** — một doanh nghiệp hỏng không
 *     kéo theo doanh nghiệp khác.
 *
 * Việc nặng hơn (sinh CEO Briefing, chạy tác nhân AI) thuộc Phase 9. Không giả vờ đã làm.
 */

const NHIP_MS = 60_000;
/** Chưa đặt `tu_dong.gio_quet_hang_ngay` thì KHÔNG tự quét — Giám đốc chọn giờ. */
const KHOA_GIO_QUET = "tu_dong.gio_quet_hang_ngay";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Thiếu DATABASE_URL.");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("Thiếu REDIS_URL.");
const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });

let dangChay = true;

/** Giờ hiện tại theo giờ Việt Nam (0–23). */
function gioVN(luc: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", hour12: false }).format(luc),
  );
}

async function quetMotDoanhNghiep(tenantId: string, ma: string): Promise<void> {
  const homNay = homNayVN();
  await voiTenant(tenantId, async (tx) => {
    const gioQuet = await docCauHinh(tx, KHOA_GIO_QUET);
    if (gioQuet === null) return; // Chưa đặt giờ → không tự quét, và không kêu ca mỗi phút.
    if (!daToiGioChay(gioVN(), gioQuet)) return;

    const daQuet = await tx.jobRun.findFirst({
      where: { jobCode: MA_TAC_VU_QUET, forDate: new Date(`${homNay}T00:00:00Z`), trigger: "lich" },
      select: { id: true },
    });
    if (daQuet) return;

    const kq = await chayQuet(tx, tenantId, { ngay: homNay, trigger: "lich" });
    console.log(
      `[worker] ${ma}: quét ${homNay} — ${kq.soQuyTacChay} quy tắc chạy, ${kq.soQuyTacBoQua} bỏ qua, ` +
        `${kq.soViec} việc, ${kq.soThongBao} thông báo.`,
    );
  });
}

async function motNhip() {
  const luc = new Date().toISOString();
  try {
    await prisma.$queryRaw`SELECT 1`;
    await redis.set("cowork:worker:nhip-cuoi", luc, "EX", 300);
  } catch (loi) {
    console.error(`[worker] ${luc} — nhịp hỏng:`, loi);
    return;
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
      // Một doanh nghiệp hỏng thì ghi lại và đi tiếp; lần chạy hỏng đã nằm trong job_runs.
      console.error(`[worker] ${luc} — quét doanh nghiệp ${t.code} hỏng:`, loi);
    }
  }
}

async function main() {
  console.log("[worker] Khởi động. Phase 8: quét nhắc việc hằng ngày theo giờ trong Cấu hình.");
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
