import { voiTenant, type ClientTenant } from "@/lib/db";
import { ghiSuKien, SU_KIEN } from "@/lib/su-kien";
import { ghiSoDongY } from "./so-dong-y";
import { kiemTyLeChienDich } from "./suc-khoe";
import { khopMaWebhookSes, tenantCuaMaWebhook } from "./ma-webhook-ses";
import {
  docSuKienSes,
  goiXacNhanDangKySns,
  laUrlChungChiSns,
  laUrlDangKySns,
  layChungChiSns,
  LuocDoThongDiepSns,
  vungCuaTopic,
  xacMinhChuKySns,
  type SuKienSes,
  type ThongDiepSns,
} from "./sns";

/**
 * Webhook sự kiện SES qua SNS — `/api/cong-khai/email/ses/<mã>` (EG-02 → EG-04, QĐ-95).
 *
 * Thứ tự (không có bước nào gọi mạng trong giao dịch CSDL — QĐ-89):
 *   1. Mã sai khuôn → 403, không truy vấn.
 *   2. JSON / lược đồ sai → 400.
 *   3. Giao dịch ngắn: đọc cấu hình — kênh phải là SES, mã khớp băm, TopicArn khớp chủ đề đã khai → 403.
 *   4. Ngoài giao dịch: kiểm URL chứng chỉ (host chặt, đúng vùng của chủ đề), tải chứng chỉ (có đệm),
 *      kiểm chữ ký SignatureVersion 1/2 → 403 nếu sai. SubscriptionConfirmation: gọi SubscribeURL
 *      (host chặt) để xác nhận.
 *   5. Giao dịch ngắn: khóa theo MessageId, đã xử lý → trả "trùng lặp", không làm gì thêm; chưa thì áp
 *      tác dụng của sự kiện và ghi `email_sns_messages` (chỉ ghi thêm).
 * Lỗi không lường trước → 503 (SNS sẽ gửi lại), không bao giờ 500 vì dữ liệu vào sai.
 */

export interface KetQuaWebhook {
  status: number;
  than: Record<string, unknown>;
}

const tu = (status: number, thongBao: string, them: Record<string, unknown> = {}): KetQuaWebhook => ({ status, than: { thongBao, ...them } });

export async function nhanThongDiepSes(ma: string, tho: string, meta: { loaiTieuDe: string | null }): Promise<KetQuaWebhook> {
  const tenantId = tenantCuaMaWebhook(ma);
  if (!tenantId) return tu(403, "Không có quyền.");

  let json: unknown;
  try {
    json = JSON.parse(tho);
  } catch {
    return tu(400, "Thân yêu cầu không phải JSON.");
  }
  const p = LuocDoThongDiepSns.safeParse(json);
  if (!p.success) return tu(400, "Không phải thông điệp SNS hợp lệ.");
  const m = p.data;
  if (meta.loaiTieuDe && meta.loaiTieuDe !== m.Type) return tu(400, "Loại thông điệp không khớp tiêu đề x-amz-sns-message-type.");

  // 3. Cấu hình (giao dịch ngắn).
  const ch = await voiTenant(tenantId, (tx) =>
    tx.emailSetting.findFirst({ where: { status: "hoat-dong" }, select: { id: true, provider: true, sesTopicArn: true, sesWebhookHash: true, sesRegion: true } }),
  );
  if (!ch || !khopMaWebhookSes(ma, ch.sesWebhookHash)) return tu(403, "Không có quyền.");
  if (ch.provider !== "ses") return tu(403, "Kênh gửi Amazon SES chưa bật.");
  if (!ch.sesTopicArn) return tu(403, "Chưa khai ARN chủ đề SNS ở Kết nối email.");
  if (m.TopicArn !== ch.sesTopicArn) return tu(403, "Chủ đề SNS không khớp.");

  // 4. Chữ ký (ngoài giao dịch).
  const vung = vungCuaTopic(m.TopicArn);
  if (!laUrlChungChiSns(m.SigningCertURL, vung)) return tu(403, "URL chứng chỉ ký không phải của Amazon SNS.");
  let pem: string;
  try {
    pem = await layChungChiSns(m.SigningCertURL);
  } catch {
    return tu(503, "Không tải được chứng chỉ ký — thử lại sau.");
  }
  if (!xacMinhChuKySns(m, pem)) return tu(403, "Chữ ký SNS không hợp lệ.");

  if (m.Type === "SubscriptionConfirmation") return xacNhanDangKy(tenantId, ch.id, m, vung);
  if (m.Type === "UnsubscribeConfirmation") {
    await voiTenant(tenantId, async (tx) => {
      if (!(await giuMessageId(tx, tenantId, m.MessageId))) return;
      await tx.emailSnsMessage.create({ data: { tenantId, snsMessageId: m.MessageId, messageType: m.Type, result: "da-xu-ly", note: "SNS báo đã huỷ đăng ký" } });
      await tx.emailSetting.update({ where: { id: ch.id }, data: { sesSubscribedAt: null } });
    });
    return tu(200, "Đã ghi nhận.");
  }
  return xuLyThongBao(tenantId, ch.id, m);
}

/** Khóa theo MessageId rồi kiểm đã xử lý chưa. true = chưa có (được xử lý). */
async function giuMessageId(tx: ClientTenant, tenantId: string, messageId: string): Promise<boolean> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cowork:sns:${tenantId}:${messageId}`}))`;
  return !(await tx.emailSnsMessage.findFirst({ where: { snsMessageId: messageId }, select: { id: true } }));
}

async function xacNhanDangKy(tenantId: string, settingId: string, m: ThongDiepSns, vung: string | null): Promise<KetQuaWebhook> {
  if (!m.SubscribeURL || !laUrlDangKySns(m.SubscribeURL, vung)) return tu(403, "SubscribeURL không phải của Amazon SNS.");
  const daCo = await voiTenant(tenantId, (tx) => tx.emailSnsMessage.findFirst({ where: { snsMessageId: m.MessageId }, select: { id: true } }));
  if (daCo) return tu(200, "Đã xác nhận trước đó.", { trungLap: true });
  try {
    await goiXacNhanDangKySns(m.SubscribeURL);
  } catch {
    return tu(503, "Không gọi được SubscribeURL — SNS sẽ gửi lại.");
  }
  await voiTenant(tenantId, async (tx) => {
    if (!(await giuMessageId(tx, tenantId, m.MessageId))) return;
    await tx.emailSnsMessage.create({ data: { tenantId, snsMessageId: m.MessageId, messageType: m.Type, result: "da-xac-nhan", note: m.TopicArn } });
    await tx.emailSetting.update({ where: { id: settingId }, data: { sesSubscribedAt: new Date() } });
    await ghiSuKien(tx, { eventType: SU_KIEN.EMAIL_SES_SUBSCRIBED, actorType: "system", objectType: "email_setting", objectId: settingId, payload: { topic: m.TopicArn } });
  });
  return tu(200, "Đã xác nhận đăng ký.");
}

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function timNguoiNhan(tx: ClientTenant, tenantId: string, e: SuKienSes) {
  const chon = { id: true, email: true, campaignId: true, status: true, messageId: true, leadId: true, contactId: true, sentAt: true } as const;
  // Thẻ do chính máy gắn (X-SES-MESSAGE-TAGS) — khớp doanh nghiệp, rồi người nhận. Mã thư phải khớp nếu đã lưu.
  if (e.theNguoiNhan && LA_UUID.test(e.theNguoiNhan) && (!e.theTenant || e.theTenant === tenantId)) {
    const r = await tx.emailRecipient.findFirst({ where: { id: e.theNguoiNhan }, select: chon });
    if (r && (!r.messageId || r.messageId === e.sesMessageId)) return r;
  }
  return tx.emailRecipient.findFirst({ where: { messageId: e.sesMessageId }, select: chon });
}

async function xuLyThongBao(tenantId: string, settingId: string, m: ThongDiepSns): Promise<KetQuaWebhook> {
  const e = docSuKienSes(m.Message);
  return voiTenant(tenantId, async (tx) => {
    if (!(await giuMessageId(tx, tenantId, m.MessageId))) return tu(200, "Đã xử lý trước đó.", { trungLap: true });
    const ghi = (result: "da-xu-ly" | "bo-qua", note: string | null, extra: { eventType?: string; ses?: string; recipientId?: string } = {}) =>
      tx.emailSnsMessage.create({
        data: { tenantId, snsMessageId: m.MessageId, messageType: m.Type, eventType: extra.eventType ?? null, sesMessageId: extra.ses ?? null, recipientId: extra.recipientId ?? null, result, note },
      });
    await tx.emailSetting.update({ where: { id: settingId }, data: { sesLastEventAt: new Date() } });
    // Thông điệp đã ký đúng nhưng nội dung không đọc được: ghi "bỏ qua", trả 200 để SNS không gửi lại mãi.
    if (!e) {
      await ghi("bo-qua", "Nội dung không phải sự kiện SES đọc được");
      return tu(200, "Đã ghi nhận (bỏ qua).");
    }
    if (e.theTenant && e.theTenant !== tenantId) {
      await ghi("bo-qua", "Thẻ doanh nghiệp không khớp", { eventType: e.tenGoc, ses: e.sesMessageId });
      return tu(200, "Đã ghi nhận (bỏ qua).");
    }
    const r = await timNguoiNhan(tx, tenantId, e);
    if (!r) {
      await ghi("bo-qua", "Không khớp người nhận nào (thư giao dịch hoặc thư ngoài hệ thống)", { eventType: e.tenGoc, ses: e.sesMessageId });
      return tu(200, "Đã ghi nhận (bỏ qua).");
    }
    if (e.loai === "khac") {
      await ghi("bo-qua", `Loại sự kiện không xử lý: ${e.tenGoc}`, { eventType: e.tenGoc, ses: e.sesMessageId, recipientId: r.id });
      return tu(200, "Đã ghi nhận (bỏ qua).");
    }
    const luc = e.luc ?? new Date();
    const lienQuan = e.diaChi.length === 0 || e.diaChi.includes(r.email);
    await tx.emailEvent.create({ data: { tenantId, campaignId: r.campaignId, recipientId: r.id, eventType: e.loai, detail: e.chiTiet as never, occurredAt: luc } });
    if (!r.messageId) await tx.emailRecipient.update({ where: { id: r.id }, data: { messageId: e.sesMessageId } });

    switch (e.loai) {
      case "delivery":
        await tx.$executeRaw`UPDATE email_recipients SET delivered_at = COALESCE(delivered_at, ${luc}), updated_at = now() WHERE id = ${r.id}::uuid`;
        break;
      case "bounce":
        if (!lienQuan) break;
        if (e.loaiTraLai === "Permanent") {
          const chanDoan = String(e.chiTiet.chanDoan ?? e.chiTiet.loaiPhu ?? "").slice(0, 300);
          await tx.emailRecipient.update({
            where: { id: r.id },
            data: {
              bouncedAt: luc,
              bounceType: "Permanent",
              ...(r.status === "SENT" && { status: "FAILED", reason: `Thư bị trả lại vĩnh viễn (SES)${chanDoan ? `: ${chanDoan}` : ""}` }),
            },
          });
          const cu = await tx.emailSuppression.findFirst({ where: { email: r.email }, select: { id: true, status: true } });
          if (!cu) await tx.emailSuppression.create({ data: { tenantId, email: r.email, reason: "email-hong", recipientId: r.id, note: `SES Bounce Permanent ${chanDoan}`.slice(0, 500) } });
          else if (cu.status !== "hoat-dong") await tx.emailSuppression.update({ where: { id: cu.id }, data: { reason: "email-hong", status: "hoat-dong", recipientId: r.id } });
          await ghiSuKien(tx, { eventType: SU_KIEN.EMAIL_BOUNCED, actorType: "system", objectType: "email_recipient", objectId: r.id, payload: { chienDichId: r.campaignId, loai: "Permanent" } });
        } else {
          // Trả lại tạm thời (hộp thư đầy, máy chủ bận…): chỉ ghi nhật ký, không chặn, không tính tỷ lệ hỏng.
          await tx.emailRecipient.update({ where: { id: r.id }, data: { bounceType: e.loaiTraLai ?? "Undetermined" } });
        }
        break;
      case "complaint":
        if (!lienQuan) break;
        await tx.$executeRaw`UPDATE email_recipients SET complained_at = COALESCE(complained_at, ${luc}), updated_at = now() WHERE id = ${r.id}::uuid`;
        // Báo rác = phản đối: sổ đồng ý ghi "phan-doi"; sổ tự đặt danh sách chặn "bao-rac" và từ chối trên
        // mọi lead / liên hệ cùng email (EG-04). Không gửi thư xác nhận (không gửi thêm gì cho người báo rác).
        await ghiSoDongY(tx, tenantId, {
          email: r.email,
          hanhDong: "phan-doi",
          nguon: "bao-rac",
          canCu: `Người nhận bấm "Báo thư rác" (SES Complaint${e.chiTiet.loaiPhanHoi ? `: ${String(e.chiTiet.loaiPhanHoi)}` : ""})`,
          thamChieu: `sns:${m.MessageId}`.slice(0, 255),
          luc,
          leadId: r.leadId,
          contactId: r.contactId,
        });
        await ghiSuKien(tx, { eventType: SU_KIEN.EMAIL_COMPLAINED, actorType: "system", objectType: "email_recipient", objectId: r.id, payload: { chienDichId: r.campaignId } });
        break;
      case "reject":
      case "rendering-failure":
        if (r.status === "SENT") {
          const ly = e.loai === "reject" ? `SES từ chối gửi: ${String(e.chiTiet.lyDo ?? "")}` : `SES không dựng được thư: ${String(e.chiTiet.loi ?? "")}`;
          await tx.emailRecipient.update({ where: { id: r.id }, data: { status: "FAILED", reason: ly.slice(0, 500) } });
        }
        break;
      default:
        break;
    }
    await ghi("da-xu-ly", null, { eventType: e.tenGoc, ses: e.sesMessageId, recipientId: r.id });
    if (e.loai === "bounce" || e.loai === "complaint") await kiemTyLeChienDich(tx, tenantId, r.campaignId);
    return tu(200, "Đã xử lý.", { loai: e.loai });
  });
}
