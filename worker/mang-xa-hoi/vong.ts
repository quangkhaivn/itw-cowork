import type { PrismaClient } from "../../src/generated/prisma/client";
import { dangBaiMotVong } from "./dang-bai";
import { kiemTraAppDaXep, kiemTraKenhDaXep } from "./kiem-tra";
import { doiMaOAuthDaXep, donDepOAuth } from "./oauth";
import { lamMoiTokenDenHan } from "./token";
import { xuLyXoaDuLieu } from "./xoa-du-lieu";

/**
 * Vòng Mạng xã hội của worker (0.23.0): chạy RIÊNG với nhịp 60 giây, mỗi 15 giây — bài hẹn giờ lệch không quá ~15 giây
 * cộng thời gian gọi nền tảng (yêu cầu ≤ 60 giây). Mỗi doanh nghiệp, mỗi phần trong `try` riêng.
 */
export const NHIP_MXH_MS = 15_000;

export async function vongMangXaHoi(prisma: PrismaClient, workerId: string, dongHo: () => Date = () => new Date()): Promise<void> {
  const dn = await prisma.tenant.findMany({ where: { status: "hoat-dong" }, select: { id: true, code: true } });
  for (const t of dn) {
    // QA 0.23.0: giờ lấy mới cho từng doanh nghiệp / từng việc — một vòng gọi nền tảng có thể kéo dài nhiều phút.
    const bayGio = dongHo();
    try {
      await kiemTraKenhDaXep(t.id, bayGio);
      await kiemTraAppDaXep(t.id, bayGio);
    } catch (e) {
      console.error(`[worker] ${t.code}: mxh kiểm tra kết nối hỏng:`, e instanceof Error ? e.message : e);
    }
    // 0.24.0: đổi mã OAuth (người dùng đang chờ màn hình chọn kênh), Data Deletion Callback, làm mới token trước hạn.
    try {
      await doiMaOAuthDaXep(t.id, bayGio);
      await donDepOAuth(t.id, bayGio);
    } catch (e) {
      console.error(`[worker] ${t.code}: mxh đổi mã OAuth hỏng:`, e instanceof Error ? e.message : e);
    }
    try {
      await xuLyXoaDuLieu(t.id, bayGio);
    } catch (e) {
      console.error(`[worker] ${t.code}: mxh xử lý yêu cầu xóa dữ liệu hỏng:`, e instanceof Error ? e.message : e);
    }
    try {
      const lm = await lamMoiTokenDenHan(t.id, bayGio);
      if (lm.canKetNoiLai) console.log(`[worker] ${t.code}: mạng xã hội — ${lm.canKetNoiLai} kênh cần kết nối lại.`);
    } catch (e) {
      console.error(`[worker] ${t.code}: mxh làm mới token hỏng:`, e instanceof Error ? e.message : e);
    }
    try {
      const kq = await dangBaiMotVong(t.id, workerId, dongHo(), 5, process.env, dongHo);
      if (kq.length) {
        const dem = (k: string) => kq.filter((x) => x.ketQua === k).length;
        console.log(`[worker] ${t.code}: mạng xã hội — đã đăng ${dem("da-dang")}, chờ xác minh ${dem("xac-minh-sau")}, thử lại ${dem("thu-lai")}, lỗi ${dem("that-bai")}.`);
      }
    } catch (e) {
      console.error(`[worker] ${t.code}: mxh đăng bài hỏng:`, e instanceof Error ? e.message : e);
    }
  }
}
