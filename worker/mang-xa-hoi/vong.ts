import type { PrismaClient } from "../../src/generated/prisma/client";
import { dangBaiMotVong } from "./dang-bai";
import { kiemTraAppDaXep, kiemTraKenhDaXep } from "./kiem-tra";

/**
 * Vòng Mạng xã hội của worker (0.23.0): chạy RIÊNG với nhịp 60 giây, mỗi 15 giây — bài hẹn giờ lệch không quá ~15 giây
 * cộng thời gian gọi nền tảng (yêu cầu ≤ 60 giây). Mỗi doanh nghiệp, mỗi phần trong `try` riêng.
 */
export const NHIP_MXH_MS = 15_000;

export async function vongMangXaHoi(prisma: PrismaClient, workerId: string, bayGio: Date = new Date()): Promise<void> {
  const dn = await prisma.tenant.findMany({ where: { status: "hoat-dong" }, select: { id: true, code: true } });
  for (const t of dn) {
    try {
      await kiemTraKenhDaXep(t.id, bayGio);
      await kiemTraAppDaXep(t.id, bayGio);
    } catch (e) {
      console.error(`[worker] ${t.code}: mxh kiểm tra kết nối hỏng:`, e instanceof Error ? e.message : e);
    }
    try {
      const kq = await dangBaiMotVong(t.id, workerId, bayGio);
      if (kq.length) {
        const dem = (k: string) => kq.filter((x) => x.ketQua === k).length;
        console.log(`[worker] ${t.code}: mạng xã hội — đã đăng ${dem("da-dang")}, chờ xác minh ${dem("xac-minh-sau")}, thử lại ${dem("thu-lai")}, lỗi ${dem("that-bai")}.`);
      }
    } catch (e) {
      console.error(`[worker] ${t.code}: mxh đăng bài hỏng:`, e instanceof Error ? e.message : e);
    }
  }
}
