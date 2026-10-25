import { voiTenant, type ClientTenant } from "@/lib/db";
import { ghiSuKien, SU_KIEN } from "@/lib/su-kien";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { taoThongBao } from "@/modules/thong-bao/service";
import { docHanMucHomNay, docNhanQuangCao } from "./han-muc";
import { kiemTyLeChienDich } from "./suc-khoe";
import { batBuocDongY, trangThaiDongYCuaNhieu } from "./so-dong-y";
import { docKetNoiDeGui, type KetNoiDeGui } from "./ket-noi";
import { urlAnhMo, urlBam, urlHuyMotCham, urlHuyNhanTin } from "./ma-lien-ket";
import { docChanThu } from "./service";
import { LoiNghiepVu } from "@/lib/loi";
import { cauLoiGui, CUA_SO_DIA_CHI_MS, docMaThuSes, dungThu, lyDoTamDung, LuocDoDanhSachKhoi, phanLoaiLoiGui, THE_SES, thieuChanThu, thoatHtml, tieuDeSes, xetGioiHanDiaChi } from "./tinh-toan";
import { taoVanChuyen, type VanChuyenThu } from "./van-chuyen";

/**
 * Gửi chiến dịch email — chạy trong worker (`worker/index.ts`), mỗi nhịp một lô cho mỗi doanh
 * nghiệp. Luật: EM-08, EM-13, EM-14.
 *
 * **Gửi tối đa một lần, không bao giờ gửi đôi** (QĐ-70):
 *  1. Nhận việc: trong một giao dịch, khóa các dòng QUEUED (`FOR UPDATE SKIP LOCKED`) và đổi
 *     sang SENDING kèm `attempt_at`, rồi COMMIT — trước khi mở kết nối SMTP.
 *  2. Gửi từng thư **ngoài** giao dịch; xong thì giao dịch nhỏ ghi SENT / FAILED.
 *  3. Worker chết giữa 1 và 2 → dòng nằm lại SENDING. Lần chạy sau thấy SENDING quá
 *     `PHUT_KET` phút thì ghi FAILED "không rõ đã gửi chưa" — **không** gửi lại, vì gửi đôi
 *     cho khách tệ hơn thiếu một thư. Khóa duy nhất (chiến dịch, email) chặn trùng ở CSDL.
 *
 * Tốc độ: `email.so_thu_moi_phut` (mặc định 10) đếm theo **CSDL** (thư đã nhận việc trong 60
 * giây qua). Bước đếm + nhận việc chạy dưới khóa `pg_advisory_xact_lock` theo doanh nghiệp, nên
 * nhiều worker cùng lúc phải xếp hàng: worker sau chỉ đếm sau khi worker trước đã COMMIT phần việc
 * vừa nhận — không ai vượt ngưỡng. Khởi động lại worker cũng không vượt, vì số đếm nằm trong CSDL.
 *
 * 0.18.0 (mục 29, EG): trần ngày = min(trần đã đặt, đường khởi động) (EG-10); tối đa N thư quảng cáo
 * mỗi địa chỉ trong 24 giờ trên mọi chiến dịch — vượt thì HOÃN (`deferred_until`), không lỗi (EG-07);
 * nhãn [QC] đầu tiêu đề (EG-06); kiểm sổ đồng ý ngay trước khi gửi (EG-09); xét tỷ lệ hỏng / báo rác
 * mỗi nhịp (EG-05); kênh SES gắn configuration set + thẻ và lưu mã thư SES (EG-01); thư xác nhận từ
 * chối đi qua hàng chờ giao dịch riêng (EG-13).
 */

export const PHUT_KET = 10;

export interface KetQuaLo {
  daGui: number;
  loi: number;
  boQua: number;
  traLai: number;
  tamDung: boolean;
  xong: string[];
  /** 0.18.0 — số người nhận bị hoãn vì đã đủ N thư / 24 giờ (EG-07). */
  hoan: number;
  /** 0.18.0 — số thư xác nhận từ chối đã gửi (EG-13). */
  xacNhan: number;
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

async function daTuChoi(tx: ClientTenant, v: ViecGui, canDongY: boolean): Promise<string | null> {
  const lyDo = await daTuChoiCu(tx, v);
  if (lyDo) return "Đã từ chối nhận tin";
  // EG-09 kiểm lại lúc gửi: người vừa rút đồng ý sau lúc duyệt thì không gửi.
  if (canDongY && (await trangThaiDongYCuaNhieu(tx, [v.email])).get(v.email)?.hanhDong !== "dong-y") return "Chưa có đồng ý nhận thư quảng cáo";
  return null;
}

async function daTuChoiCu(tx: ClientTenant, v: ViecGui): Promise<boolean> {
  if (await tx.emailSuppression.findFirst({ where: { email: v.email, status: "hoat-dong" }, select: { id: true } })) return true;
  if (v.leadId && (await tx.lead.findFirst({ where: { id: v.leadId, marketingOptOutAt: { not: null } }, select: { id: true } }))) return true;
  if (v.contactId && (await tx.contact.findFirst({ where: { id: v.contactId, marketingOptOutAt: { not: null } }, select: { id: true } }))) return true;
  return false;
}

/** Tạm dừng mọi chiến dịch đang gửi khi hộp thư gửi hỏng (sai mật khẩu, mất kết nối…) và báo người lập. */
async function tuTamDung(tx: ClientTenant, tenantId: string, lyDo: string) {
  const ds = await tx.emailCampaign.findMany({ where: { status: "SENDING" }, select: { id: true, code: true, createdBy: true, approvedBy: true } });
  for (const c of ds) {
    await tx.emailCampaign.update({ where: { id: c.id }, data: { status: "PAUSED", pausedAt: new Date(), pauseCode: "ket-noi", pauseReason: `Máy tự tạm dừng: ${lyDo}` } });
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
interface KetQuaNhanViec {
  viec: ViecGui[];
  ketNoi: KetNoiDeGui | null;
  chan: Awaited<ReturnType<typeof docChanThu>>;
  xong: string[];
  nhanQC: string;
  canDongY: boolean;
  hoan: number;
}

async function nhanViec(tenantId: string, bayGio: Date): Promise<KetQuaNhanViec> {
  return voiTenant(tenantId, async (tx) => {
    // Một worker một lúc cho mỗi doanh nghiệp (EM-14): khóa giữ tới hết giao dịch nhận việc.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cowork:email-gui:${tenantId}`}))`;
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
    const nhanQC = await docNhanQuangCao(tx);
    const canDongY = await batBuocDongY(tx);
    const rong = (ketNoi: KetNoiDeGui | null = null, hoan = 0): KetQuaNhanViec => ({ viec: [], ketNoi, chan, xong, nhanQC, canDongY, hoan });
    if (dangGui.length === xong.length) return rong();

    // EG-05: chiến dịch có tỷ lệ trả lại / báo rác vượt ngưỡng thì dừng trước khi nhận thêm việc.
    for (const c of dangGui) if (!xong.includes(c.id)) await kiemTyLeChienDich(tx, tenantId, c.id);

    // EM-09 kiểm lại lúc gửi, không chỉ lúc duyệt: Hồ sơ công ty bị gỡ địa chỉ sau khi duyệt thì
    // dừng, không gửi thư thiếu chân thư.
    const thieu = thieuChanThu(chan);
    if (thieu.length) {
      await tuTamDung(tx, tenantId, `Hồ sơ công ty đang thiếu ${thieu.join(" và ")} — thư marketing bắt buộc có chân thư. Khai ở Quản trị → Hồ sơ công ty rồi bấm Tiếp tục.`);
      return rong();
    }

    let ketNoi: KetNoiDeGui | null;
    try {
      ketNoi = await docKetNoiDeGui(tx, tenantId);
    } catch (e) {
      // APP_ENC_KEY thiếu / sai / bản mã hỏng: dừng chiến dịch kèm lý do, không ném lỗi mỗi phút.
      if (e instanceof LoiNghiepVu && e.ma === "khoa-ma-hoa-khong-khop") {
        await tuTamDung(tx, tenantId, e.message);
        return rong();
      }
      throw e;
    }
    if (!ketNoi) {
      await tuTamDung(tx, tenantId, "Chưa cấu hình kết nối email.");
      return rong();
    }

    const hm = await docHanMucHomNay(tx, ketNoi.kenh, bayGio);
    const trongPhut = await tx.emailRecipient.count({ where: { attemptAt: { gte: new Date(bayGio.getTime() - 60_000) }, status: { in: ["SENDING", "SENT", "FAILED"] } } });
    let quota = hm.moiPhut - trongPhut;
    if (hm.tranHomNay !== null) quota = Math.min(quota, hm.tranHomNay - hm.daGuiHomNay);
    if (quota <= 0) return rong(ketNoi);

    const ungVien = await tx.$queryRaw<{ id: string; email: string }[]>`
      SELECT r.id::text AS id, r.email
      FROM email_recipients r JOIN email_campaigns c ON c.id = r.campaign_id
      WHERE r.status = 'QUEUED' AND c.status = 'SENDING'
        AND (r.deferred_until IS NULL OR r.deferred_until <= ${bayGio})
      ORDER BY c.approved_at, r.created_at, r.email
      LIMIT ${quota}
      FOR UPDATE OF r SKIP LOCKED`;
    if (!ungVien.length) return rong(ketNoi);

    // EG-07: tối đa N thư quảng cáo / địa chỉ / 24 giờ trên MỌI chiến dịch. Khóa tư vấn theo từng email
    // (thứ tự cố định) giữ tới hết giao dịch — hai worker không cùng đếm một địa chỉ; khóa doanh nghiệp ở
    // trên đã xếp hàng các lần nhận việc, khóa theo email là chốt thứ hai cho mọi đường gửi quảng cáo khác.
    const emails = [...new Set(ungVien.map((u) => u.email))].sort();
    for (const e of emails) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cowork:email-24h:${tenantId}:${e}`}))`;
    const daGuiDong = await tx.emailRecipient.findMany({
      where: {
        email: { in: emails },
        attemptAt: { gt: new Date(bayGio.getTime() - CUA_SO_DIA_CHI_MS) },
        OR: [{ status: "SENDING" }, { sentAt: { not: null } }],
      },
      select: { email: true, attemptAt: true },
    });
    const daGui = new Map<string, Date[]>();
    for (const d of daGuiDong) if (d.attemptAt) daGui.set(d.email, [...(daGui.get(d.email) ?? []), d.attemptAt]);
    const xet = xetGioiHanDiaChi(ungVien, daGui, hm.toiDaMoiDiaChi24h, bayGio);
    for (const h of xet.hoan) {
      await tx.emailRecipient.update({ where: { id: h.id }, data: { deferredUntil: h.den, deferCount: { increment: 1 } } });
    }
    if (!xet.nhan.length) return rong(ketNoi, xet.hoan.length);
    const ids = xet.nhan.map((id) => ({ id }));
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
    return { viec, ketNoi, chan, xong, nhanQC, canDongY, hoan: xet.hoan.length };
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
  const kq: KetQuaLo = { daGui: 0, loi: 0, boQua: 0, traLai: 0, tamDung: false, xong: [], hoan: 0, xacNhan: 0 };
  try {
    kq.xacNhan = await guiThuGiaoDich(tenantId, bayGio);
  } catch (e) {
    console.error("[email] thư xác nhận từ chối lỗi:", e);
  }
  const { viec, ketNoi, chan, xong, nhanQC, canDongY, hoan } = await nhanViec(tenantId, bayGio);
  kq.xong = xong;
  kq.hoan = hoan;
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
        const tuChoi = await daTuChoi(tx, v, canDongY);
        if (tuChoi) {
          await tx.emailRecipient.update({ where: { id: v.id }, data: { status: "SKIPPED", reason: tuChoi } });
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
        nhanQC,
      );

      vc ??= taoVanChuyen(ketNoi.smtp);
      try {
        const ketQuaGui = await vc.gui({
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
            // EG-01: SES đẩy sự kiện qua configuration set; thẻ để khớp sự kiện về đúng doanh nghiệp + người nhận.
            ...(ketNoi.kenh === "ses" ? tieuDeSes(ketNoi.sesConfigurationSet, { [THE_SES.tenant]: tenantId, [THE_SES.nguoiNhan]: v.id }) : {}),
          },
        });
        const messageId = ketNoi.kenh === "ses" ? (docMaThuSes(ketQuaGui.phanHoi) ?? ketQuaGui.messageId) : ketQuaGui.messageId;
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
            await tuTamDung(tx, tenantId, lyDoTamDung(loi));
          });
          kq.traLai += conLai.length;
          kq.tamDung = true;
          break;
        }
        await voiTenant(tenantId, async (tx) => {
          // EG-05: 5.1.x lúc gửi là trả lại vĩnh viễn — đếm vào tỷ lệ hỏng như sự kiện Bounce của SES.
          await tx.emailRecipient.update({
            where: { id: v.id },
            data: { status: "FAILED", reason: cau, ...(loai === "nguoi-nhan-hong" && { bouncedAt: new Date(), bounceType: "Permanent" }) },
          });
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

// ---------------------------------------------------------------------------
// Thư giao dịch: xác nhận từ chối (EG-13, NĐ 91/2020 Điều 20)
// ---------------------------------------------------------------------------

/** Nội dung thư xác nhận từ chối — không nhãn [QC], không theo dõi, không liên kết huỷ (không phải quảng cáo). */
export function dungThuXacNhanTuChoi(tenCongTy: string, nhanLuc: Date, dungTu: Date) {
  const cty = tenCongTy.trim() || "chúng tôi";
  const tieuDe = `Xác nhận từ chối nhận thư quảng cáo từ ${cty}`.replace(/[\r\n]+/g, " ").slice(0, 200);
  const dong = [
    "Xin chào,",
    `${cty} đã nhận được yêu cầu từ chối nhận thư quảng cáo của bạn lúc ${dinhDangNgayGio(nhanLuc)} (giờ Việt Nam).`,
    `Kể từ ${dinhDangNgayGio(dungTu)}, chúng tôi đã ngừng gửi thư quảng cáo tới địa chỉ email này.`,
    "Đây là thư xác nhận tự động, gửi một lần duy nhất. Bạn không cần làm gì thêm.",
  ];
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${thoatHtml(tieuDe)}</title></head><body style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1f2937">${dong.map((d) => `<p>${thoatHtml(d)}</p>`).join("")}</body></html>`;
  return { tieuDe, html, text: dong.join("\n\n") };
}

const TOI_DA_GIAO_DICH_MOI_NHIP = 20;

/**
 * Gửi các thư giao dịch đang chờ của một doanh nghiệp. Cùng nguyên tắc gửi tối đa một lần (QĐ-70):
 * nhận việc + COMMIT trước, gửi ngoài giao dịch, ghi kết quả bằng giao dịch nhỏ; kẹt quá PHUT_KET phút
 * → FAILED, không gửi lại. Không qua danh sách chặn (người nhận vừa từ chối — đây chính là thư xác nhận
 * cho họ), không tính vào trần N thư quảng cáo / 24 giờ.
 */
export async function guiThuGiaoDich(tenantId: string, bayGio: Date = new Date()): Promise<number> {
  const nhan = await voiTenant(tenantId, async (tx) => {
    await tx.emailTransactional.updateMany({
      where: { status: "SENDING", attemptAt: { lt: new Date(bayGio.getTime() - PHUT_KET * 60_000) } },
      data: { status: "FAILED", reason: "Máy gửi dừng giữa chừng — không rõ thư đã đi hay chưa nên không gửi lại." },
    });
    const ds = await tx.$queryRaw<{ id: string }[]>`
      SELECT id::text AS id FROM email_transactionals WHERE status = 'QUEUED'
      ORDER BY created_at LIMIT ${TOI_DA_GIAO_DICH_MOI_NHIP} FOR UPDATE SKIP LOCKED`;
    if (!ds.length) return null;
    let ketNoi: KetNoiDeGui | null;
    try {
      ketNoi = await docKetNoiDeGui(tx, tenantId);
    } catch {
      return null;
    }
    if (!ketNoi) return null;
    await tx.emailTransactional.updateMany({ where: { id: { in: ds.map((d) => d.id) } }, data: { status: "SENDING", attemptAt: bayGio } });
    const viec = await tx.emailTransactional.findMany({ where: { id: { in: ds.map((d) => d.id) } }, select: { id: true, email: true, kind: true, payload: true } });
    return { viec, ketNoi, chan: await docChanThu(tx, tenantId) };
  });
  if (!nhan) return 0;
  const vc = taoVanChuyen(nhan.ketNoi.smtp);
  let soGui = 0;
  try {
    for (const v of nhan.viec) {
      const p = (v.payload ?? {}) as { nhanLuc?: string; dungTu?: string };
      const thu = dungThuXacNhanTuChoi(nhan.chan.tenCongTy, new Date(p.nhanLuc ?? bayGio), new Date(p.dungTu ?? p.nhanLuc ?? bayGio));
      try {
        const kq = await vc.gui({
          tu: nhan.ketNoi.tu,
          den: { ten: "", email: v.email },
          traLoi: nhan.ketNoi.traLoi,
          tieuDe: thu.tieuDe,
          html: thu.html,
          text: thu.text,
          tieuDePhu: nhan.ketNoi.kenh === "ses" ? tieuDeSes(nhan.ketNoi.sesConfigurationSet, {}) : undefined,
        });
        const messageId = nhan.ketNoi.kenh === "ses" ? (docMaThuSes(kq.phanHoi) ?? kq.messageId) : kq.messageId;
        await voiTenant(tenantId, async (tx) => {
          await tx.emailTransactional.update({ where: { id: v.id }, data: { status: "SENT", sentAt: new Date(), messageId } });
          await ghiSuKien(tx, { eventType: SU_KIEN.EMAIL_OPT_OUT_CONFIRMATION_SENT, actorType: "system", objectType: "email_transactional", objectId: v.id, payload: { loai: v.kind } });
        });
        soGui++;
      } catch (e) {
        await voiTenant(tenantId, (tx) => tx.emailTransactional.update({ where: { id: v.id }, data: { status: "FAILED", reason: cauLoiGui(e as Record<string, never>) } }));
      }
    }
  } finally {
    vc.dong();
  }
  return soGui;
}
