import type { ClientTenant } from "@/lib/db";
import { LoiNghiepVu } from "@/lib/loi";
import { docCauHinhMxh } from "./chung";
import { batDauNgayQuotaSau, ngayQuota } from "./oauth-thuan";
import { vuotHanMucNgay } from "./lich-thuan";

/**
 * Hạn mức theo ngày khi XẾP LỊCH (0.25.0, QĐ-231): YouTube tối đa `mxh.youtube_upload_toi_da_ngay` video / ngày quota
 * (giờ Thái Bình Dương, đếm chung doanh nghiệp — như worker, QĐ-215 / QĐ-218). Đếm = lượt tải đã dùng của ngày đó
 * (`social_quota_usages`) + video đã xếp hàng chờ đăng trong ngày đó (trừ chính bài này). Reels Facebook kiểm ở
 * `kiemHanMucReels` (bai.ts). Worker vẫn kiểm lại lúc gửi và dời sang ngày sau nếu thực tế chạm trần.
 */

/** [đầu, cuối) của ngày quota chứa `luc`. */
export function khungNgayQuota(luc: Date): { tu: Date; den: Date; ngay: string } {
  const den = batDauNgayQuotaSau(luc);
  // QA 0.25.0 (QĐ-242): ngày quota theo giờ Thái Bình Dương dài 23 / 25 giờ vào hai ngày đổi giờ — lùi đúng 24 giờ có thể rơi
  // vào HAI ngày trước (ví dụ giờ đầu của ngày ngay sau ngày 23 giờ) → khung thành hai ngày, đếm thừa video. Lùi 48 giờ rồi
  // tiến từng ranh giới ngày quota tới ranh giới cuối cùng ≤ luc.
  let tu = batDauNgayQuotaSau(new Date(luc.getTime() - 2 * 86_400_000));
  for (let i = 0; i < 4; i++) {
    const tiep = batDauNgayQuotaSau(tu);
    if (tiep.getTime() > luc.getTime()) break;
    tu = tiep;
  }
  return { tu, den, ngay: ngayQuota(luc) };
}

export async function kiemHanMucYoutube(tx: ClientTenant, b: { id: string; targets: { id: string; connection: { platform: string } }[] }, luc: Date): Promise<void> {
  const soMoi = b.targets.filter((t) => t.connection.platform === "YOUTUBE").length;
  if (!soMoi) return;
  const toiDa = (await docCauHinhMxh(tx)).youtubeToiDaNgay;
  const { tu, den, ngay } = khungNgayQuota(luc);
  const choDang = await tx.socialPostTarget.count({
    where: { postId: { not: b.id }, connection: { platform: "YOUTUBE" }, status: "QUEUED", nextAttemptAt: { gte: tu, lt: den } },
  });
  const daDung = await tx.socialQuotaUsage.findFirst({ where: { quotaKey: "youtube-upload", quotaDay: new Date(`${ngay}T00:00:00Z`) }, select: { used: true } });
  const daCo = choDang + (daDung?.used ?? 0);
  if (vuotHanMucNgay(daCo, soMoi, toiDa)) {
    throw new LoiNghiepVu(
      `YouTube: ngày này (ngày hạn mức của Google, đổi ngày lúc 14–15 giờ chiều giờ Việt Nam) đã có ${daCo} video đăng / chờ đăng — tối đa ${toiDa} video / ngày (Cấu hình “Số video tải lên YouTube tối đa mỗi ngày”). Chọn ngày khác.`,
      409, "han-muc-youtube", { daCo, toiDa },
    );
  }
}
