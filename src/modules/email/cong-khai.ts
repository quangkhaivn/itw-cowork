import { voiTenant, type ClientTenant } from "@/lib/db";
import { ghiSuKien, SU_KIEN } from "@/lib/su-kien";
import { ghiKiemToan } from "@/lib/kiem-toan";
import { docMaLienKet } from "./ma-lien-ket";
import { cheEmail, danhSachLienKet, LuocDoDanhSachKhoi } from "./tinh-toan";
import { docChanThu } from "./service";

/**
 * Đường công khai của email: huỷ nhận tin, điểm ảnh mở, chuyển hướng bấm (EM-10, EM-11).
 * Không có phiên đăng nhập — **mã ký** trong liên kết là thứ duy nhất xác định người nhận và
 * doanh nghiệp. Mã sai → trả kết quả trung tính, không nói vì sao.
 */

export interface BoiCanhYeuCau {
  ip: string | null;
  userAgent: string | null;
}

async function timNguoiNhan(tx: ClientTenant, id: string) {
  return tx.emailRecipient.findFirst({
    where: { id },
    select: { id: true, email: true, campaignId: true, status: true, unsubscribedAt: true, leadId: true, contactId: true },
  });
}

/** Cho trang `/huy-nhan-tin/[ma]`: tên công ty gửi + email đã che. Không đổi gì. */
export async function thongTinHuyNhanTin(ma: string) {
  const m = docMaLienKet(ma, "huy");
  if (!m) return null;
  return voiTenant(m.tenantId, async (tx) => {
    const r = await timNguoiNhan(tx, m.nguoiNhanId);
    if (!r) return null;
    const chan = await docChanThu(tx, m.tenantId);
    return { tenCongTy: chan.tenCongTy, emailChe: cheEmail(r.email), daHuy: Boolean(r.unsubscribedAt) };
  });
}

/**
 * Huỷ nhận tin. Gọi lại nhiều lần vẫn an toàn (lần sau không ghi gì thêm).
 * Ghi đủ bốn chỗ trong một giao dịch: dòng người nhận, cờ `marketing_opt_out_at` trên **mọi**
 * lead/liên hệ cùng email, danh sách chặn theo email, và nhật ký sự kiện.
 */
export async function huyNhanTin(ma: string, bc: BoiCanhYeuCau): Promise<boolean> {
  const m = docMaLienKet(ma, "huy");
  if (!m) return false;
  return voiTenant(m.tenantId, async (tx) => {
    const r = await timNguoiNhan(tx, m.nguoiNhanId);
    if (!r) return false;
    if (r.unsubscribedAt) return true;
    const luc = new Date();
    await tx.emailRecipient.update({ where: { id: r.id }, data: { unsubscribedAt: luc } });
    // Gói Marketing (MK-13): từ chối luôn thắng đồng ý, CHECK `*_dong_y_nhan_tin_check` cấm hai cờ cùng
    // bật → tắt `marketing_opt_in` cùng lúc và ghi nguồn, y như ghi nhận từ chối ở màn hình lead.
    const tuChoi = { marketingOptOutAt: luc, marketingOptIn: false, marketingConsentSource: "huy-nhan-tin-email" };
    const lead = await tx.lead.updateMany({ where: { emailNormalized: r.email, marketingOptOutAt: null }, data: tuChoi });
    const lh = await tx.contact.updateMany({ where: { emailNormalized: r.email, marketingOptOutAt: null }, data: tuChoi });
    await tx.emailSuppression.upsert({
      where: { tenantId_email: { tenantId: m.tenantId, email: r.email } },
      update: { reason: "huy-nhan-tin", status: "hoat-dong", recipientId: r.id },
      create: { tenantId: m.tenantId, email: r.email, reason: "huy-nhan-tin", recipientId: r.id },
    });
    await tx.emailEvent.create({
      data: { tenantId: m.tenantId, campaignId: r.campaignId, recipientId: r.id, eventType: "unsubscribe", ipAddress: bc.ip, userAgent: bc.userAgent?.slice(0, 500) ?? null },
    });
    await ghiSuKien(tx, {
      eventType: SU_KIEN.EMAIL_UNSUBSCRIBED,
      actorType: "system",
      objectType: "email_recipient",
      objectId: r.id,
      payload: { chienDichId: r.campaignId, soLead: lead.count, soLienHe: lh.count },
    });
    await ghiKiemToan(tx, {
      action: "huy-nhan-tin",
      objectType: "email_recipient",
      objectId: r.id,
      after: { chienDichId: r.campaignId, soLead: lead.count, soLienHe: lh.count },
      ipAddress: bc.ip,
      userAgent: bc.userAgent,
    });
    return true;
  });
}

/** Điểm ảnh mở thư. Chỉ đếm cho thư đã gửi. Không bao giờ ném lỗi ra ngoài (trả ảnh dù sao). */
export async function ghiMo(ma: string, bc: BoiCanhYeuCau): Promise<void> {
  const m = docMaLienKet(ma, "mo");
  if (!m) return;
  await voiTenant(m.tenantId, async (tx) => {
    const r = await timNguoiNhan(tx, m.nguoiNhanId);
    if (!r || r.status !== "SENT") return;
    const luc = new Date();
    await tx.$executeRaw`UPDATE email_recipients SET open_count = open_count + 1, opened_at = COALESCE(opened_at, ${luc}), updated_at = ${luc} WHERE id = ${r.id}::uuid`;
    await tx.emailEvent.create({ data: { tenantId: m.tenantId, campaignId: r.campaignId, recipientId: r.id, eventType: "open", ipAddress: bc.ip, userAgent: bc.userAgent?.slice(0, 500) ?? null } });
  });
}

/**
 * Bấm liên kết: trả URL đích **lấy từ nội dung chiến dịch** theo chỉ số trong mã ký — không bao
 * giờ chuyển tới URL nằm trên đường dẫn (chống open redirect). Mã hỏng → null.
 */
export async function ghiBam(ma: string, bc: BoiCanhYeuCau): Promise<string | null> {
  const m = docMaLienKet(ma, "bam");
  if (!m) return null;
  return voiTenant(m.tenantId, async (tx) => {
    const r = await timNguoiNhan(tx, m.nguoiNhanId);
    if (!r) return null;
    const c = await tx.emailCampaign.findFirst({ where: { id: r.campaignId }, select: { blocks: true } });
    const khoi = LuocDoDanhSachKhoi.safeParse(c?.blocks);
    if (!khoi.success) return null;
    const url = danhSachLienKet(khoi.data)[m.chiSo];
    if (!url) return null;
    if (r.status === "SENT") {
      const luc = new Date();
      await tx.$executeRaw`UPDATE email_recipients SET click_count = click_count + 1, clicked_at = COALESCE(clicked_at, ${luc}), updated_at = ${luc} WHERE id = ${r.id}::uuid`;
      await tx.emailEvent.create({
        data: { tenantId: m.tenantId, campaignId: r.campaignId, recipientId: r.id, eventType: "click", linkIndex: m.chiSo, url, ipAddress: bc.ip, userAgent: bc.userAgent?.slice(0, 500) ?? null },
      });
    }
    return url;
  });
}
