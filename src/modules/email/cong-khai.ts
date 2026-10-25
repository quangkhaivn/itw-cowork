import { voiTenant, type ClientTenant } from "@/lib/db";
import { ghiSuKien, SU_KIEN } from "@/lib/su-kien";
import { ghiKiemToan } from "@/lib/kiem-toan";
import { docMaLienKet } from "./ma-lien-ket";
import { cheEmail, danhSachLienKet, LuocDoDanhSachKhoi } from "./tinh-toan";
import { docChanThu } from "./service";
import { ghiSoDongY } from "./so-dong-y";

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
    const truocLead = await tx.lead.count({ where: { emailNormalized: r.email, marketingOptOutAt: null } });
    const truocLh = await tx.contact.count({ where: { emailNormalized: r.email, marketingOptOutAt: null } });
    // 0.18.0 — EG-08: ghi "rút đồng ý" vào sổ; sổ tự đồng bộ cờ cũ (MK-13: tắt `marketing_opt_in`, ghi
    // `marketing_opt_out_at` + nguồn `huy-nhan-tin-email` trên MỌI lead / liên hệ cùng email) và danh sách chặn.
    const c = await tx.emailCampaign.findFirst({ where: { id: r.campaignId }, select: { code: true } });
    const so = await ghiSoDongY(tx, m.tenantId, {
      email: r.email,
      hanhDong: "rut",
      nguon: "huy-nhan-tin",
      canCu: `Bấm "Huỷ nhận tin" trong thư chiến dịch ${c?.code ?? ""}`.trim(),
      thamChieu: `email_recipient:${r.id}`,
      luc,
      ip: bc.ip,
      leadId: r.leadId,
      contactId: r.contactId,
    });
    await tx.emailSuppression.updateMany({ where: { email: r.email, recipientId: null }, data: { recipientId: r.id } });
    const lead = { count: truocLead - (await tx.lead.count({ where: { emailNormalized: r.email, marketingOptOutAt: null } })) };
    const lh = { count: truocLh - (await tx.contact.count({ where: { emailNormalized: r.email, marketingOptOutAt: null } })) };
    // EG-13 (NĐ 91/2020 Điều 20): một thư xác nhận cho MỖI lần trạng thái đổi sang từ chối — bấm lại,
    // hay bấm ở thư của chiến dịch khác khi đã từ chối rồi, không sinh thêm thư.
    if (so.truoc !== "rut" && so.truoc !== "phan-doi") {
      await tx.emailTransactional.createMany({
        data: [{ tenantId: m.tenantId, kind: "xac-nhan-tu-choi", email: r.email, recipientId: r.id, dedupeKey: `xac-nhan-tu-choi:${so.id}`, payload: { nhanLuc: luc.toISOString(), dungTu: luc.toISOString() } }],
        skipDuplicates: true,
      });
    }
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
