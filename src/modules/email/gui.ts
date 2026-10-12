import { voiTenant, type ClientTenant } from "@/lib/db";
import { ghiSuKien, SU_KIEN } from "@/lib/su-kien";
import { dauHomNayVN } from "@/lib/dinh-dang";
import { docCauHinh } from "@/modules/cau-hinh/service";
import { taoThongBao } from "@/modules/thong-bao/service";
import { docKetNoiDeGui, type KetNoiDeGui } from "./ket-noi";
import { urlAnhMo, urlBam, urlHuyMotCham, urlHuyNhanTin } from "./ma-lien-ket";
import { docChanThu } from "./service";
import { cauLoiGui, dungThu, LuocDoDanhSachKhoi, phanLoaiLoiGui } from "./tinh-toan";
import { taoVanChuyen, type VanChuyenThu } from "./van-chuyen";

/**
 * Gửi chiến dịch email — chạy trong worker (`worker/index.ts`), mỗi nhịp một lô cho mỗi doanh
 * nghiệp. Luật: EM-08, EM-13, EM-14.
 *
 * **Gửi tối đa một lần, không bao giờ gửi đôi** (QĐ-69):
 *  1. Nhận việc: trong một giao dịch, khóa các dòng QUEUED (`FOR UPDATE SKIP LOCKED`) và đổi
 *     sang SENDING kèm `attempt_at`, rồi COMMIT — trước khi mở kết nối SMTP.
 *  2. Gửi từng thư **ngoài** giao dịch; xong thì giao dịch nhỏ ghi SENT / FAILED.
 *  3. Worker chết giữa 1 và 2 → dòng nằm lại SENDING. Lần chạy sau thấy SENDING quá
 *     `PHUT_KET` phút thì ghi FAILED "không rõ đã gửi chưa" — **không** gửi lại, vì gửi đôi
 *     cho khách tệ hơn thiếu một thư. Khóa duy nhất (chiến dịch, email) chặn trùng ở CSDL.
 *
 * Tốc độ: `email.so_thu_moi_phut` (mặc định 10) đếm theo **CSDL** (thư đã nhận việc trong 60
 * giây qua), nên khởi động lại worker hay chạy hai worker cũng không vượt ngưỡng.
 */

export const PHUT_KET = 10;

export interface KetQuaLo {
  daGui: number;
  loi: number;
  boQua: number;
  traLai: number;
  tamDung: boolean;
  xong: string[];
}

interface ViecGui {
  id: string;
  email: string;
  name: string;
  companyName: string | null;
  recipientType: string;
  leadId: string | null;
  contactId: string | null;
  customerId: string | null;
  campaign: {
    id: string;
    code: string;
    name: string;
    subject: string;
    blocks: unknown;
    trackingEnabled: boolean;
    createdBy: string | null;
    approvedBy: string | null;
  };
}

async function daTuChoi(tx: ClientTenant, v: ViecGui): Promise<boolean> {
  if (await tx.emailSuppression.findFirst({ where: { email: v.email, status: "hoat-dong" }, select: { id: true } })) return true;
  if (v.leadId && (await tx.lead.findFirst({ where: { id: v.leadId, marketingOptOutAt: { not: null } }, select: { id: true } }))) return true;
  if (v.contactId && (await tx.contact.findFirst({ where: { id: v.contactId, marketingOptOutAt: { not: null } }, select: { id: true } }))) return true;
  return false;
}

/** Tạm dừng mọi chiến dịch đang gửi khi hộp thư gửi hỏng (sai mật khẩu, mất kết nối…) và báo người lập. */
async function tuTamDung(tx: ClientTenant, tenantId: string, lyDo: string) {
  const ds = await tx.emailCampaign.findMany({ where: { status: "SENDING" }, select: { id: true, code: true, createdBy: true, approvedBy: true } });
  for (const c of ds) {
    await tx.emailCampaign.update({ where: { id: c.id }, data: { status: "PAUSED", pausedAt: new Date(), pauseReason: `Máy tự tạm dừng: ${lyDo}` } });
    await ghiSuKien(tx, { eventType: SU_KIEN.EMAIL_CAMPAIGN_PAUSED, actorType: "system", objectType: "email_campaign", objectId: c.id, payload: { tuDong: true, lyDo } });
    for (const u of new Set([c.createdBy, c.approvedBy].filter((x): x is string => Boolean(x)))) {
      await taoThongBao(tx, tenantId, {
        nguoiNhanId: u,
        loai: "email-tam-dung",
        mucDo: "khan",
        tieuDe: `Chiến dịch ${c.code} tự tạm dừng`,
        noiDung: lyDo.slice(0, 500),
        duongDan: `/marketing/email/chien-dich/${c.id}`,
        doiTuong: "email_campaign",
        doiTuongId: c.id,
      });
    }
  }
}

/** Bước 1: dọn dòng kẹt, khép chiến dịch đã xong, đọc ngưỡng, nhận việc. */
async function nhanViec(tenantId: string, bayGio: Date): Promise<{ viec: ViecGui[]; ketNoi: KetNoiDeGui | null; chan: Awaited<ReturnType<typeof docChanThu>>; xong: string[] }> {
  return voiTenant(tenantId, async (tx) => {
    await tx.emailRecipient.updateMany({
      where: { status: "SENDING", attemptAt: { lt: new Date(bayGio.getTime() - PHUT_KET * 60_000) } },
      data: { status: "FAILED", reason: "Máy gửi dừng giữa chừng — không rõ thư đã đi hay chưa nên không gửi lại để tránh trùng." },
    });

    const xong: string[] = [];
    const dangGui = await tx.emailCampaign.findMany({ where: { status: "SENDING" }, select: { id: true, code: true, createdBy: true } });
    for (const c of dangGui) {
      const con = await tx.emailRecipient.count({ where: { campaignId: c.id, status: { in: ["QUEUED", "SENDING"] } } });
      if (con > 0) continue;
      await tx.emailCampaign.update({ where: { id: c.id }, data: { status: "COMPLETED", completedAt: bayGio } });
      await ghiSuKien(tx, { eventType: SU_KIEN.EMAIL_CAMPAIGN_COMPLETED, actorType: "system", objectType: "email_campaign", objectId: c.id, payload: { ma: c.code } });
      if (c.createdBy) {
        await taoThongBao(tx, tenantId, {
          nguoiNhanId: c.createdBy,
          loai: "email-xong",
          tieuDe: `Chiến dịch ${c.code} đã gửi xong`,
          duongDan: `/marketing/email/chien-dich/${c.id}`,
          doiTuong: "email_campaign",
          doiTuongId: c.id,
          khoaChongTrung: `email-xong:${c.id}`,
        });
      }
      xong.push(c.id);
    }
    const chan = await docChanThu(tx, tenantId);
    if (dangGui.length === xong.length) return { viec: [], ketNoi: null, chan, xong };

    const ketNoi = await docKetNoiDeGui(tx, tenantId);
    if (!ketNoi) {
      await tuTamDung(tx, tenantId, "Chưa cấu hình kết nối email.");
      return { viec: [], ketNoi: null, chan, xong };
    }

    const moiPhut = (await docCauHinh(tx, "email.so_thu_moi_phut")) ?? 10;
    const moiNgay = await docCauHinh(tx, "email.so_thu_toi_da_moi_ngay");
    const trongPhut = await tx.emailRecipient.count({ where: { attemptAt: { gte: new Date(bayGio.getTime() - 60_000) }, status: { in: ["SENDING", "SENT", "FAILED"] } } });
    let quota = moiPhut - trongPhut;
    if (moiNgay !== null) {
      const homNay = await tx.emailRecipient.count({ where: { sentAt: { gte: dauHomNayVN(bayGio) }, status: "SENT" } });
      quota = Math.min(quota, moiNgay - homNay);
    }
    if (quota <= 0) return { viec: [], ketNoi, chan, xong };

    const ids = await tx.$queryRaw<{ id: string }[]>`
      SELECT r.id::text AS id
      FROM email_recipients r JOIN email_campaigns c ON c.id = r.campaign_id
      WHERE r.status = 'QUEUED' AND c.status = 'SENDING'
      ORDER BY c.approved_at, r.created_at, r.email
      LIMIT ${quota}
      FOR UPDATE OF r SKIP LOCKED`;
    if (!ids.length) return { viec: [], ketNoi, chan, xong };
    await tx.emailRecipient.updateMany({ where: { id: { in: ids.map((r) => r.id) }, status: "QUEUED" }, data: { status: "SENDING", attemptAt: bayGio } });
    const viec = await tx.emailRecipient.findMany({
      where: { id: { in: ids.map((r) => r.id) } },
      select: {
        id: true,
        email: true,
        name: true,
        companyName: true,
        recipientType: true,
        leadId: true,
        contactId: true,
        customerId: true,
        campaign: { select: { id: true, code: true, name: true, subject: true, blocks: true, trackingEnabled: true, createdBy: true, approvedBy: true } },
      },
      orderBy: [{ createdAt: "asc" }, { email: "asc" }],
    });
    return { viec, ketNoi, chan, xong };
  });
}

/** TT-02: thư đã đi thì ghi một tương tác `email` vào dòng thời gian lead / khách. */
async function ghiTuongTacEmail(tx: ClientTenant, tenantId: string, v: ViecGui, tieuDe: string, luc: Date) {
  const nguoi = v.campaign.createdBy ?? v.campaign.approvedBy;
  if (!nguoi || (!v.leadId && !v.customerId)) return;
  await tx.interaction.create({
    data: {
      tenantId,
      type: "email",
      subject: `Email marketing ${v.campaign.code}: ${v.campaign.name}`.slice(0, 255),
      content: `Tiêu đề thư: ${tieuDe}\nGửi tới: ${v.email}`,
      outcome: "Đã gửi",
      occurredAt: luc,
      leadId: v.leadId,
      customerId: v.customerId,
      contactId: v.contactId,
      ownerId: nguoi,
      createdBy: nguoi,
      updatedBy: nguoi,
    },
  });
}

/**
 * Gửi một lô cho một doanh nghiệp. Trả số liệu để worker ghi log; bài thử gọi thẳng hàm này.
 */
export async function guiLoThu(tenantId: string, bayGio: Date = new Date()): Promise<KetQuaLo> {
  const kq: KetQuaLo = { daGui: 0, loi: 0, boQua: 0, traLai: 0, tamDung: false, xong: [] };
  const { viec, ketNoi, chan, xong } = await nhanViec(tenantId, bayGio);
  kq.xong = xong;
  if (!viec.length || !ketNoi) return kq;

  let vc: VanChuyenThu | null = null;
  try {
    for (let i = 0; i < viec.length; i++) {
      const v = viec[i];
      // Kiểm lại ngay trước khi gửi: người nhận có thể vừa bấm huỷ, chiến dịch có thể vừa bị dừng.
      const truoc = await voiTenant(tenantId, async (tx) => {
        const c = await tx.emailCampaign.findFirst({ where: { id: v.campaign.id }, select: { status: true } });
        if (c?.status === "CANCELLED") {
          await tx.emailRecipient.update({ where: { id: v.id }, data: { status: "SKIPPED", reason: "Chiến dịch bị huỷ trước khi tới lượt gửi" } });
          return "bo-qua";
        }
        if (c?.status !== "SENDING") {
          await tx.emailRecipient.update({ where: { id: v.id }, data: { status: "QUEUED", attemptAt: null } });
          return "tra-lai";
        }
        if (await daTuChoi(tx, v)) {
          await tx.emailRecipient.update({ where: { id: v.id }, data: { status: "SKIPPED", reason: "Đã từ chối nhận tin" } });
          return "bo-qua";
        }
        return "gui";
      });
      if (truoc === "bo-qua") {
        kq.boQua++;
        continue;
      }
      if (truoc === "tra-lai") {
        kq.traLai++;
        continue;
      }

      const khoi = LuocDoDanhSachKhoi.safeParse(v.campaign.blocks);
      if (!khoi.success) {
        await voiTenant(tenantId, (tx) => tx.emailRecipient.update({ where: { id: v.id }, data: { status: "FAILED", reason: "Nội dung thư không hợp lệ" } }));
        kq.loi++;
        continue;
      }
      const thu = dungThu(
        v.campaign.subject,
        khoi.data,
        { ten: v.name, cong_ty: v.companyName ?? "", email: v.email, cong_ty_gui: chan.tenCongTy },
        { ...chan, lienKetHuy: urlHuyNhanTin(tenantId, v.id) },
        v.campaign.trackingEnabled ? { anhMo: urlAnhMo(tenantId, v.id), lienKetBam: (chiSo) => urlBam(tenantId, v.id, chiSo) } : undefined,
      );

      vc ??= taoVanChuyen(ketNoi.smtp);
      try {
        const { messageId } = await vc.gui({
          tu: ketNoi.tu,
          den: { ten: v.name, email: v.email },
          traLoi: ketNoi.traLoi,
          tieuDe: thu.tieuDe,
          html: thu.html,
          text: thu.text,
          // EM-10: huỷ nhận tin một chạm ngay trong ứng dụng thư (RFC 2369 + RFC 8058).
          tieuDePhu: {
            "List-Unsubscribe": `<${urlHuyMotCham(tenantId, v.id)}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        const luc = new Date();
        await voiTenant(tenantId, async (tx) => {
          await tx.emailRecipient.update({ where: { id: v.id }, data: { status: "SENT", sentAt: luc, messageId } });
          await ghiTuongTacEmail(tx, tenantId, v, thu.tieuDe, luc);
        });
        kq.daGui++;
      } catch (e) {
        const loi = e as { code?: string; responseCode?: number; command?: string; response?: string; message?: string };
        const loai = phanLoaiLoiGui(loi);
        const cau = cauLoiGui(loi);
        if (loai === "ket-noi") {
          // Thư chưa đi: trả cả lô về hàng chờ và dừng chiến dịch cho người sửa kết nối.
          const conLai = viec.slice(i).map((x) => x.id);
          await voiTenant(tenantId, async (tx) => {
            await tx.emailRecipient.updateMany({ where: { id: { in: conLai }, status: "SENDING" }, data: { status: "QUEUED", attemptAt: null } });
            await tuTamDung(tx, tenantId, `Hộp thư gửi báo lỗi — ${cau}`);
          });
          kq.traLai += conLai.length;
          kq.tamDung = true;
          break;
        }
        await voiTenant(tenantId, async (tx) => {
          await tx.emailRecipient.update({ where: { id: v.id }, data: { status: "FAILED", reason: cau } });
          if (loai === "nguoi-nhan-hong") {
            await tx.emailSuppression.upsert({
              where: { tenantId_email: { tenantId, email: v.email } },
              update: {},
              create: { tenantId, email: v.email, reason: "email-hong", recipientId: v.id, note: cau },
            });
          }
        });
        kq.loi++;
      }
    }
  } finally {
    vc?.dong();
  }
  return kq;
}
