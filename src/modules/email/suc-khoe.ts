import type { ClientTenant } from "@/lib/db";
import { ghiSuKien, SU_KIEN } from "@/lib/su-kien";
import { ghiKiemToan } from "@/lib/kiem-toan";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { baoChoNguoiCoQuyen, taoThongBao } from "@/modules/thong-bao/service";
import { danhGiaTyLe, type SoLieuTyLe } from "./tinh-toan";

/**
 * Tự tạm dừng chiến dịch khi tỷ lệ trả lại vĩnh viễn / báo thư rác vượt ngưỡng (EG-05).
 * Gọi ở mỗi nhịp worker (trước khi nhận việc) và ngay sau khi webhook SES ghi một lần trả lại / báo rác.
 *
 *  - Mẫu = số người nhận đã có kết quả gửi (đã đi, hoặc bị trả lại ngay lúc gửi qua SMTP).
 *  - Chỉ xét phần thư GỬI SAU mốc `rate_base_at` — mốc chụp khi người duyệt bấm Tiếp tục sau lần tự
 *    dừng vì tỷ lệ, để chiến dịch không bị dừng lại ngay vì chính những thư cũ đã được xem xét. So theo
 *    `sent_at` của từng người nhận (trả lại ngay lúc gửi: `bounced_at`), nên trả lại / báo rác **tới trễ**
 *    của thư gửi trước mốc không lọt vào cửa sổ mới (quyết định trước khi phát hành 0.18.0).
 *    Chiến dịch có mốc số đếm cũ mà không có `rate_base_at` vẫn trừ theo số đếm như trước.
 *  - Báo người lập + mọi người có `marketing.approve`, chống trùng theo (chiến dịch, loại, mốc).
 */

/**
 * Số liệu tỷ lệ của một chiến dịch. `tuLuc` (mốc tiếp tục) → chỉ người nhận có thư **gửi** từ mốc đó
 * (`sent_at >= mốc`; thư trả lại ngay lúc gửi, chưa có `sent_at`: `bounced_at >= mốc`).
 */
export async function soLieuTyLe(tx: ClientTenant, campaignId: string, tuLuc: Date | null = null): Promise<SoLieuTyLe> {
  const [r] = await tx.$queryRaw<{ mau: bigint; hong: bigint; bao_rac: bigint }[]>`
    SELECT count(*) FILTER (WHERE sent_at IS NOT NULL OR bounced_at IS NOT NULL) AS mau,
           count(*) FILTER (WHERE bounced_at IS NOT NULL AND bounce_type = 'Permanent') AS hong,
           count(complained_at) AS bao_rac
    FROM email_recipients
    WHERE campaign_id = ${campaignId}::uuid
      AND (${tuLuc}::timestamptz IS NULL OR sent_at >= ${tuLuc}::timestamptz OR (sent_at IS NULL AND bounced_at >= ${tuLuc}::timestamptz))`;
  return { mau: Number(r?.mau ?? 0), hong: Number(r?.hong ?? 0), baoRac: Number(r?.bao_rac ?? 0) };
}

export async function docNguongTyLe(tx: ClientTenant) {
  const [hong, baoRac, mau] = await Promise.all([
    docCauHinh(tx, "email.nguong_hong_phan_tram"),
    docCauHinh(tx, "email.nguong_bao_rac_phan_nghin"),
    docCauHinh(tx, "email.mau_toi_thieu_danh_gia"),
  ]);
  return { hongPhanTram: hong ?? 5, baoRacPhanNghin: baoRac ?? 1, mauToiThieu: mau ?? 200 };
}

/** Xét một chiến dịch đang gửi; vượt ngưỡng → PAUSED kèm lý do, sự kiện, kiểm toán, chuông. Trả true nếu vừa dừng. */
export async function kiemTyLeChienDich(tx: ClientTenant, tenantId: string, campaignId: string): Promise<boolean> {
  const c = await tx.emailCampaign.findFirst({
    where: { id: campaignId },
    select: { id: true, code: true, status: true, createdBy: true, rateBaseSample: true, rateBaseBounced: true, rateBaseComplained: true, rateBaseAt: true },
  });
  if (!c || c.status !== "SENDING") return false;
  const so = await soLieuTyLe(tx, c.id, c.rateBaseAt);
  const moc = c.rateBaseAt ? { mau: 0, hong: 0, baoRac: 0 } : { mau: c.rateBaseSample, hong: c.rateBaseBounced, baoRac: c.rateBaseComplained };
  const kq = danhGiaTyLe(so, moc, await docNguongTyLe(tx));
  if (!kq.tamDung) return false;
  // Có điều kiện trạng thái: hai đường (worker + webhook) cùng xét thì chỉ một bên ghi.
  const doi = await tx.emailCampaign.updateMany({
    where: { id: c.id, status: "SENDING" },
    data: { status: "PAUSED", pausedAt: new Date(), pauseCode: kq.ma, pauseReason: `Máy tự tạm dừng: ${kq.lyDo}` },
  });
  if (doi.count !== 1) return false;
  await ghiSuKien(tx, { eventType: SU_KIEN.EMAIL_CAMPAIGN_PAUSED, actorType: "system", objectType: "email_campaign", objectId: c.id, payload: { tuDong: true, ma: kq.ma, ...so } });
  await ghiKiemToan(tx, { action: "tu-tam-dung", objectType: "email_campaign", objectId: c.id, before: { trangThai: "SENDING" }, after: { trangThai: "PAUSED", ma: kq.ma, ...so } });
  const thongBao = {
    loai: "email-tam-dung",
    mucDo: "khan" as const,
    tieuDe: `Chiến dịch ${c.code} tự tạm dừng vì ${kq.ma === "ty-le-hong" ? "tỷ lệ thư bị trả lại" : "tỷ lệ báo thư rác"} cao`,
    noiDung: kq.lyDo.slice(0, 500),
    duongDan: `/marketing/email/chien-dich/${c.id}`,
    doiTuong: "email_campaign",
    doiTuongId: c.id,
    khoaChongTrung: `email-ty-le:${c.id}:${kq.ma}:${c.rateBaseAt?.getTime() ?? c.rateBaseSample}`,
  };
  await baoChoNguoiCoQuyen(tx, tenantId, "marketing.approve", thongBao);
  if (c.createdBy) await taoThongBao(tx, tenantId, { ...thongBao, nguoiNhanId: c.createdBy });
  return true;
}
