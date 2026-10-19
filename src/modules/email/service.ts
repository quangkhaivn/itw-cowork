import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { thanhBuoc, type BuocGiaoDich } from "@/lib/api-nhieu-buoc";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, KIEU_SO } from "@/lib/so-chung-tu";
import { docHoSoCongTy } from "@/modules/ho-so-cong-ty/service";
import type { DuLieuMau, DuLieuSuaChienDich, DuLieuTaoChienDich } from "./luoc-do";
import { docKetNoiDeGui } from "./ket-noi";
import { layUngVien, timNguon } from "./nguon-nguoi-nhan";
import {
  bienMau,
  cauLoiGui,
  cheEmail,
  chuyenHopLe,
  dungThu,
  LuocDoDanhSachKhoi,
  locNguoiNhan,
  NHAN_LY_DO_LOAI,
  thieuChanThu,
  type ChanThu,
  type Khoi,
  type LyDoLoai,
  type TrangThaiChienDich,
} from "./tinh-toan";
import { taoVanChuyen } from "./van-chuyen";

/**
 * Mẫu email và chiến dịch email — BUSINESS_RULES.md mục 23 (EM).
 *
 * Quyền: phân hệ `marketing` có sẵn. Soạn mẫu / lập chiến dịch: `marketing.create|update`.
 * **Gửi cần duyệt** (QĐ-69): chỉ người có `marketing.approve` mới đưa chiến dịch vào hàng gửi,
 * tiếp tục chiến dịch đã tạm dừng, hoặc huỷ chiến dịch đang gửi.
 * Chọn người nhận còn cần quyền xem nguồn dữ liệu (`crm.view` cho lead, `customer.view` cho
 * liên hệ) và đi theo **phạm vi dữ liệu** của người thao tác (EM-12).
 */

// ---------------------------------------------------------------------------
// Dùng chung
// ---------------------------------------------------------------------------

export async function docChanThu(tx: ClientTenant, tenantId: string): Promise<{ tenCongTy: string; diaChi: string }> {
  const hs = await docHoSoCongTy(tx, tenantId);
  return { tenCongTy: hs.tenHienThi ?? "", diaChi: hs["cong_ty.dia_chi"] ?? "" };
}

function khoiCua(gt: Prisma.JsonValue): Khoi[] {
  const kq = LuocDoDanhSachKhoi.safeParse(gt);
  return kq.success ? kq.data : [];
}

/** Bản đồ email → lý do chặn, cho một danh sách email. */
export async function danhSachChan(tx: ClientTenant, emails: string[]): Promise<Map<string, string>> {
  const ban = new Map<string, string>();
  const ds = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))];
  for (let i = 0; i < ds.length; i += 5000) {
    const dong = await tx.emailSuppression.findMany({
      where: { email: { in: ds.slice(i, i + 5000) }, status: "hoat-dong" },
      select: { email: true, reason: true },
    });
    for (const d of dong) ban.set(d.email, d.reason);
  }
  return ban;
}

/** Thư xem trước / thư thử với biến mẫu và liên kết huỷ giả. */
async function dungThuMau(nc: NguCanh, tieuDe: string, khoi: Khoi[]) {
  const chan = await docChanThu(nc.tx, nc.tenantId);
  const thu = dungThu(tieuDe, khoi, bienMau(chan.tenCongTy, { ten: nc.hoSo.hoTen, email: nc.hoSo.email }), { ...chan, lienKetHuy: "#" });
  return { thu, thieuChanThu: thieuChanThu(chan) };
}

export async function xemTruocThu(nc: NguCanh, d: { tieuDe: string; khoi: Khoi[] }) {
  batBuocQuyen(nc.hoSo, "marketing.view");
  const { thu, thieuChanThu: thieu } = await dungThuMau(nc, d.tieuDe, d.khoi);
  return { tieuDe: thu.tieuDe, html: thu.html, thieuChanThu: thieu };
}

/**
 * Gửi thư thử tới chính người đang soạn (EM-15). Không ghi người nhận, không ghi tương tác.
 *
 * 0.16.1 (QĐ-89, QA): cùng mẫu với `guiThuKiemTraKetNoi` — dựng thư trong giao dịch ngắn, **gửi SMTP
 * ngoài giao dịch** (máy chủ thư chậm không giữ kết nối CSDL và không vượt hạn 5 giây của Prisma), ghi
 * nhật ký ở giao dịch ngắn thứ hai. Nhận `NguCanh` (bài thử cũ) hoặc `BuocGiaoDich` (route nhiều bước).
 */
export async function guiThuThu(x: NguCanh | BuocGiaoDich, d: { tieuDe: string; khoi: Khoi[] }) {
  const nb = thanhBuoc(x);
  const { kn, thu, den } = await nb.giaoDich(async (nc) => {
    batBuocQuyen(nc.hoSo, "marketing.create", { objectType: "email_template" });
    const kn = await docKetNoiDeGui(nc.tx, nc.tenantId);
    if (!kn) throw new LoiNghiepVu("Chưa cấu hình kết nối email (Quản trị → Kết nối email).", 409, "chua-cau-hinh-email");
    const { thu } = await dungThuMau(nc, d.tieuDe, d.khoi);
    return { kn, thu, den: { ten: nc.hoSo.hoTen, email: nc.hoSo.email } };
  });
  const vc = taoVanChuyen(kn.smtp);
  try {
    await vc.gui({ tu: kn.tu, den, traLoi: kn.traLoi, tieuDe: `[THỬ] ${thu.tieuDe}`, html: thu.html, text: thu.text });
  } catch (e) {
    throw new LoiNghiepVu(`Không gửi được thư thử: ${cauLoiGui(e as Record<string, never>)}`, 502, "gui-thu-loi");
  } finally {
    vc.dong();
  }
  await nb.giaoDich((nc) => nc.kiemToan({ action: "gui-thu", objectType: "email_template", after: { den: den.email, tieuDe: thu.tieuDe } }));
  return { ok: true, den: den.email };
}

// ---------------------------------------------------------------------------
// Mẫu email
// ---------------------------------------------------------------------------

export async function danhSachMau(nc: NguCanh, loc: { q: string; luuTru: "" | "co" }) {
  batBuocQuyen(nc.hoSo, "marketing.view");
  const ds = await nc.tx.emailTemplate.findMany({
    where: {
      status: loc.luuTru === "co" ? "luu-tru" : "hoat-dong",
      ...(loc.q && { OR: [{ name: { contains: loc.q, mode: "insensitive" } }, { subject: { contains: loc.q, mode: "insensitive" } }] }),
    },
    select: { id: true, name: true, subject: true, status: true, updatedAt: true, blocks: true },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });
  return ds.map((m) => ({ id: m.id, ten: m.name, tieuDe: m.subject, trangThai: m.status, capNhatLuc: m.updatedAt, soKhoi: khoiCua(m.blocks).length }));
}

export async function chiTietMau(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "marketing.view", { objectType: "email_template", objectId: id });
  const m = await nc.tx.emailTemplate.findFirst({ where: { id } });
  if (!m) throw new LoiKhongTimThay("Mẫu email");
  return { id: m.id, ten: m.name, tieuDe: m.subject, khoi: khoiCua(m.blocks), trangThai: m.status, capNhatLuc: m.updatedAt };
}

export async function taoMau(nc: NguCanh, d: DuLieuMau) {
  batBuocQuyen(nc.hoSo, "marketing.create", { objectType: "email_template" });
  const m = await nc.tx.emailTemplate.create({
    data: { tenantId: nc.tenantId, name: d.ten, subject: d.tieuDe, blocks: d.khoi as never, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
    select: { id: true },
  });
  await nc.kiemToan({ action: "tao", objectType: "email_template", objectId: m.id, after: { ten: d.ten, tieuDe: d.tieuDe, soKhoi: d.khoi.length } });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_TEMPLATE_CREATED, objectType: "email_template", objectId: m.id, payload: { ten: d.ten } });
  return { id: m.id };
}

export async function suaMau(nc: NguCanh, id: string, d: DuLieuMau) {
  batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "email_template", objectId: id });
  const cu = await nc.tx.emailTemplate.findFirst({ where: { id } });
  if (!cu) throw new LoiKhongTimThay("Mẫu email");
  await nc.tx.emailTemplate.update({ where: { id }, data: { name: d.ten, subject: d.tieuDe, blocks: d.khoi as never, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({
    action: "sua",
    objectType: "email_template",
    objectId: id,
    before: { ten: cu.name, tieuDe: cu.subject, soKhoi: khoiCua(cu.blocks).length },
    after: { ten: d.ten, tieuDe: d.tieuDe, soKhoi: d.khoi.length },
  });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_TEMPLATE_UPDATED, objectType: "email_template", objectId: id });
  return { id };
}

/** Lưu trữ / dùng lại mẫu. Không xóa: chiến dịch cũ vẫn giữ con trỏ về mẫu. */
export async function doiTrangThaiMau(nc: NguCanh, id: string, luuTru: boolean) {
  batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "email_template", objectId: id });
  const cu = await nc.tx.emailTemplate.findFirst({ where: { id }, select: { status: true } });
  if (!cu) throw new LoiKhongTimThay("Mẫu email");
  const moi = luuTru ? "luu-tru" : "hoat-dong";
  if (cu.status === moi) return { id };
  await nc.tx.emailTemplate.update({ where: { id }, data: { status: moi, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "email_template", objectId: id, before: { trangThai: cu.status }, after: { trangThai: moi } });
  return { id };
}

// ---------------------------------------------------------------------------
// Người nhận
// ---------------------------------------------------------------------------

export async function xemTruocNguoiNhan(nc: NguCanh, nguon: string, thamSo: unknown) {
  batBuocQuyen(nc.hoSo, "marketing.view");
  const { ds, moTa } = await layUngVien(nc, nguon, thamSo);
  const chan = await danhSachChan(nc.tx, ds.map((u) => u.email ?? ""));
  const { hopLe, biLoai } = locNguoiNhan(ds, chan);
  const theoLyDo: Partial<Record<LyDoLoai, number>> = {};
  for (const b of biLoai) theoLyDo[b.lyDo] = (theoLyDo[b.lyDo] ?? 0) + 1;
  return {
    moTa,
    tong: ds.length,
    hopLe: hopLe.length,
    biLoai: Object.entries(theoLyDo).map(([lyDo, so]) => ({ lyDo, nhan: NHAN_LY_DO_LOAI[lyDo as LyDoLoai], so })),
    mau: hopLe.slice(0, 10).map((u) => ({ ten: u.ten, congTy: u.congTy, email: duocXemEmail(nc, u.loai) ? u.email : cheEmail(u.email), loai: u.loai })),
  };
}

/** Email người nhận chỉ hiện đủ cho người có quyền xem nguồn của nó (lead → crm.view, liên hệ → customer.view). */
function duocXemEmail(nc: NguCanh, loai: string): boolean {
  return coQuyen(nc.hoSo, loai === "lead" ? "crm.view" : "customer.view");
}

// ---------------------------------------------------------------------------
// Chiến dịch
// ---------------------------------------------------------------------------

async function layChienDich(nc: NguCanh, id: string) {
  const c = await nc.tx.emailCampaign.findFirst({ where: { id } });
  if (!c) throw new LoiKhongTimThay("Chiến dịch email");
  return c;
}

function batBuocChuyen(tu: string, den: TrangThaiChienDich, viec: string) {
  if (!chuyenHopLe(tu, den)) throw new LoiNghiepVu(`Không ${viec} được chiến dịch đang ở trạng thái này.`, 409, "sai-trang-thai");
}

export async function taoChienDich(nc: NguCanh, d: DuLieuTaoChienDich) {
  batBuocQuyen(nc.hoSo, "marketing.create", { objectType: "email_campaign" });
  const mau = await nc.tx.emailTemplate.findFirst({ where: { id: d.mauId, status: "hoat-dong" } });
  if (!mau) throw new LoiKhongTimThay("Mẫu email");
  const nguon = timNguon(d.nguon);
  const thamSo = nguon.luocDo.parse(d.thamSo);
  const ma = await capSoChungTu(nc.tx, KIEU_SO.chienDichEmail);
  const c = await nc.tx.emailCampaign.create({
    data: {
      tenantId: nc.tenantId,
      code: ma,
      name: d.ten,
      templateId: mau.id,
      subject: mau.subject,
      blocks: mau.blocks as never,
      sourceCode: d.nguon,
      sourceParams: thamSo as never,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: { id: true, code: true },
  });
  await nc.kiemToan({ action: "tao", objectType: "email_campaign", objectId: c.id, after: { ma, ten: d.ten, mau: mau.name, nguon: d.nguon, thamSo } });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_CAMPAIGN_CREATED, objectType: "email_campaign", objectId: c.id, payload: { ma } });
  return { id: c.id, ma: c.code };
}

/** Sửa nội dung / điều kiện người nhận — chỉ khi còn Nháp (EM-06: nội dung đóng băng từ lúc gửi duyệt). */
export async function suaChienDich(nc: NguCanh, id: string, d: DuLieuSuaChienDich) {
  batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "email_campaign", objectId: id });
  const c = await layChienDich(nc, id);
  if (c.status !== "DRAFT") throw new LoiNghiepVu("Chỉ sửa được chiến dịch còn Nháp. Chiến dịch chờ duyệt thì trả về Nháp trước.", 409, "sai-trang-thai");
  const nguonMa = d.nguon ?? c.sourceCode;
  const thamSo = d.thamSo !== undefined || d.nguon ? timNguon(nguonMa).luocDo.parse(d.thamSo ?? c.sourceParams) : undefined;
  await nc.tx.emailCampaign.update({
    where: { id },
    data: {
      ...(d.ten && { name: d.ten }),
      ...(d.tieuDe && { subject: d.tieuDe }),
      ...(d.khoi && { blocks: d.khoi as never }),
      ...(d.nguon && { sourceCode: d.nguon }),
      ...(thamSo !== undefined && { sourceParams: thamSo as never }),
      updatedBy: nc.hoSo.userId,
    },
  });
  await nc.kiemToan({
    action: "sua",
    objectType: "email_campaign",
    objectId: id,
    before: { ten: c.name, tieuDe: c.subject, nguon: c.sourceCode, thamSo: c.sourceParams },
    after: { ten: d.ten ?? c.name, tieuDe: d.tieuDe ?? c.subject, nguon: nguonMa, thamSo: thamSo ?? c.sourceParams, doiNoiDung: Boolean(d.khoi) },
  });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_CAMPAIGN_UPDATED, objectType: "email_campaign", objectId: id });
  return { id };
}

async function kiemTruocKhiGui(nc: NguCanh, c: { subject: string; blocks: Prisma.JsonValue }) {
  if (!LuocDoDanhSachKhoi.safeParse(c.blocks).success) throw new LoiNghiepVu("Nội dung thư chưa hợp lệ — mở sửa và lưu lại.", 422, "noi-dung-loi");
  const chan = await docChanThu(nc.tx, nc.tenantId);
  const thieu = thieuChanThu(chan);
  if (thieu.length) {
    throw new LoiNghiepVu(
      `Thư marketing phải có chân thư ghi ${thieu.join(" và ")} của công ty. Khai ở Quản trị → Hồ sơ công ty trước.`,
      422,
      "thieu-chan-thu",
    );
  }
}

export async function guiDuyetChienDich(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "email_campaign", objectId: id });
  const c = await layChienDich(nc, id);
  batBuocChuyen(c.status, "PENDING_APPROVAL", "gửi duyệt");
  await kiemTruocKhiGui(nc, c);
  const xt = await xemTruocNguoiNhan(nc, c.sourceCode, c.sourceParams);
  if (xt.hopLe === 0) throw new LoiNghiepVu("Điều kiện lọc không ra người nhận hợp lệ nào.", 422, "khong-co-nguoi-nhan");
  await nc.tx.emailCampaign.update({ where: { id }, data: { status: "PENDING_APPROVAL", submittedAt: new Date(), submittedBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "email_campaign", objectId: id, before: { trangThai: c.status }, after: { trangThai: "PENDING_APPROVAL", duKienNguoiNhan: xt.hopLe } });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_CAMPAIGN_SUBMITTED, objectType: "email_campaign", objectId: id, payload: { duKien: xt.hopLe } });
  return { id, duKienNguoiNhan: xt.hopLe };
}

export async function traVeNhapChienDich(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "marketing.approve", { objectType: "email_campaign", objectId: id });
  const c = await layChienDich(nc, id);
  if (c.status !== "PENDING_APPROVAL") throw new LoiNghiepVu("Chỉ trả về được chiến dịch đang chờ duyệt.", 409, "sai-trang-thai");
  await nc.tx.emailCampaign.update({ where: { id }, data: { status: "DRAFT", submittedAt: null, submittedBy: null, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "email_campaign", objectId: id, before: { trangThai: c.status }, after: { trangThai: "DRAFT", lyDo } });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_CAMPAIGN_RETURNED, objectType: "email_campaign", objectId: id, payload: { lyDo } });
  return { id };
}

/**
 * Duyệt = chốt danh sách người nhận và đưa vào hàng gửi (EM-06, EM-07, EM-08).
 * Danh sách tính lại **tại lúc duyệt**, theo phạm vi dữ liệu của người duyệt, rồi ghi mỗi
 * người một dòng `email_recipients` — QUEUED hoặc SKIPPED kèm lý do. Từ đây worker gửi dần.
 */
export async function duyetChienDich(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "marketing.approve", { objectType: "email_campaign", objectId: id });
  const c = await layChienDich(nc, id);
  if (c.status !== "PENDING_APPROVAL") throw new LoiNghiepVu("Chỉ duyệt được chiến dịch đang chờ duyệt.", 409, "sai-trang-thai");
  await kiemTruocKhiGui(nc, c);
  const ketNoi = await nc.tx.emailSetting.findFirst({ where: { status: "hoat-dong" }, select: { trackingEnabled: true } });
  if (!ketNoi) throw new LoiNghiepVu("Chưa cấu hình kết nối email (Quản trị → Kết nối email) nên chưa gửi được.", 409, "chua-cau-hinh-email");

  const { ds } = await layUngVien(nc, c.sourceCode, c.sourceParams);
  const { hopLe, biLoai } = locNguoiNhan(ds, await danhSachChan(nc.tx, ds.map((u) => u.email ?? "")));
  if (hopLe.length === 0) throw new LoiNghiepVu("Không còn người nhận hợp lệ nào — không có gì để gửi.", 422, "khong-co-nguoi-nhan");

  const tomTat: Record<string, number> = { hopLe: hopLe.length };
  for (const b of biLoai) tomTat[b.lyDo] = (tomTat[b.lyDo] ?? 0) + 1;

  const dong = (u: (typeof hopLe)[number] | (typeof biLoai)[number], status: string, reason: string | null): Prisma.EmailRecipientCreateManyInput => ({
    tenantId: nc.tenantId,
    campaignId: id,
    email: u.email!,
    name: u.ten.slice(0, 255),
    companyName: u.congTy?.slice(0, 255) ?? null,
    recipientType: u.loai,
    leadId: u.loai === "lead" ? u.id : null,
    contactId: u.loai === "contact" ? u.id : null,
    customerId: u.khachHangId ?? null,
    status,
    reason,
  });
  const ghi = [
    ...hopLe.map((u) => dong(u, "QUEUED", null)),
    // Người bị loại mà vẫn có email hợp lệ (đã từ chối, email hỏng) được ghi thành dòng SKIPPED để
    // tra được "vì sao không gửi cho người này". Không email / sai dạng / trùng chỉ đếm trong tóm tắt.
    ...biLoai.filter((b) => b.lyDo === "da-tu-choi" || b.lyDo === "email-hong").map((b) => dong(b, "SKIPPED", NHAN_LY_DO_LOAI[b.lyDo])),
  ];
  // Khóa duy nhất (chiến dịch, email) là chốt cuối chống trùng; skipDuplicates để người bị loại
  // trùng email với người hợp lệ không làm hỏng cả lần duyệt.
  for (let i = 0; i < ghi.length; i += 1000) await nc.tx.emailRecipient.createMany({ data: ghi.slice(i, i + 1000), skipDuplicates: true });

  const bayGio = new Date();
  await nc.tx.emailCampaign.update({
    where: { id },
    data: { status: "SENDING", approvedAt: bayGio, approvedBy: nc.hoSo.userId, trackingEnabled: ketNoi.trackingEnabled, recipientSummary: tomTat, updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "sua", objectType: "email_campaign", objectId: id, before: { trangThai: c.status }, after: { trangThai: "SENDING", duyet: true, ...tomTat } });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_CAMPAIGN_APPROVED, objectType: "email_campaign", objectId: id, payload: tomTat });
  return { id, tomTat };
}

export async function tamDungChienDich(nc: NguCanh, id: string, lyDo: string) {
  batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "email_campaign", objectId: id });
  const c = await layChienDich(nc, id);
  batBuocChuyen(c.status, "PAUSED", "tạm dừng");
  const ly = `Tạm dừng bởi ${nc.hoSo.hoTen}${lyDo ? `: ${lyDo}` : ""}`;
  await nc.tx.emailCampaign.update({ where: { id }, data: { status: "PAUSED", pausedAt: new Date(), pauseReason: ly, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "email_campaign", objectId: id, before: { trangThai: c.status }, after: { trangThai: "PAUSED", lyDo } });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_CAMPAIGN_PAUSED, objectType: "email_campaign", objectId: id, payload: { lyDo } });
  return { id };
}

export async function tiepTucChienDich(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "marketing.approve", { objectType: "email_campaign", objectId: id });
  const c = await layChienDich(nc, id);
  batBuocChuyen(c.status, "SENDING", "tiếp tục");
  if (!(await nc.tx.emailSetting.findFirst({ where: { status: "hoat-dong" }, select: { id: true } }))) {
    throw new LoiNghiepVu("Chưa cấu hình kết nối email.", 409, "chua-cau-hinh-email");
  }
  await nc.tx.emailCampaign.update({ where: { id }, data: { status: "SENDING", pausedAt: null, pauseReason: null, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "email_campaign", objectId: id, before: { trangThai: c.status, lyDoDung: c.pauseReason }, after: { trangThai: "SENDING" } });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_CAMPAIGN_RESUMED, objectType: "email_campaign", objectId: id });
  return { id };
}

/** Huỷ: Nháp / Chờ duyệt cần `marketing.update`; đang gửi / tạm dừng cần `marketing.approve`. */
export async function huyChienDich(nc: NguCanh, id: string, lyDo: string) {
  const c = await layChienDich(nc, id);
  batBuocQuyen(nc.hoSo, ["SENDING", "PAUSED"].includes(c.status) ? "marketing.approve" : "marketing.update", { objectType: "email_campaign", objectId: id });
  batBuocChuyen(c.status, "CANCELLED", "huỷ");
  const boQua = await nc.tx.emailRecipient.updateMany({ where: { campaignId: id, status: "QUEUED" }, data: { status: "SKIPPED", reason: "Chiến dịch bị huỷ trước khi tới lượt gửi" } });
  await nc.tx.emailCampaign.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: nc.hoSo.userId, cancelReason: lyDo, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "email_campaign", objectId: id, before: { trangThai: c.status }, after: { trangThai: "CANCELLED", lyDo, soBoQua: boQua.count } });
  await nc.suKien({ eventType: SU_KIEN.EMAIL_CAMPAIGN_CANCELLED, objectType: "email_campaign", objectId: id, payload: { lyDo, soBoQua: boQua.count } });
  return { id, soBoQua: boQua.count };
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export interface ThongKeChienDich {
  tong: number;
  choGui: number;
  dangGui: number;
  daGui: number;
  loi: number;
  biLoai: number;
  mo: number;
  bam: number;
  huyNhanTin: number;
}

export async function thongKeChienDich(tx: ClientTenant, ids: string[]): Promise<Map<string, ThongKeChienDich>> {
  const ban = new Map<string, ThongKeChienDich>();
  if (!ids.length) return ban;
  const rong = (): ThongKeChienDich => ({ tong: 0, choGui: 0, dangGui: 0, daGui: 0, loi: 0, biLoai: 0, mo: 0, bam: 0, huyNhanTin: 0 });
  const nhom = await tx.emailRecipient.groupBy({ by: ["campaignId", "status"], where: { campaignId: { in: ids } }, _count: { _all: true } });
  for (const n of nhom) {
    const t = ban.get(n.campaignId) ?? rong();
    const so = n._count._all;
    t.tong += so;
    if (n.status === "QUEUED") t.choGui += so;
    if (n.status === "SENDING") t.dangGui += so;
    if (n.status === "SENT") t.daGui += so;
    if (n.status === "FAILED") t.loi += so;
    if (n.status === "SKIPPED") t.biLoai += so;
    ban.set(n.campaignId, t);
  }
  const tuongTac = await tx.$queryRaw<{ campaign_id: string; mo: bigint; bam: bigint; huy: bigint }[]>`
    SELECT campaign_id::text, count(opened_at) AS mo, count(clicked_at) AS bam, count(unsubscribed_at) AS huy
    FROM email_recipients WHERE campaign_id = ANY(${ids}::uuid[]) GROUP BY campaign_id`;
  for (const r of tuongTac) {
    const t = ban.get(r.campaign_id) ?? rong();
    t.mo = Number(r.mo);
    t.bam = Number(r.bam);
    t.huyNhanTin = Number(r.huy);
    ban.set(r.campaign_id, t);
  }
  return ban;
}

const CO_TRANG = 20;

export async function danhSachChienDich(nc: NguCanh, loc: { q: string; trangThai: string; trang: number }) {
  batBuocQuyen(nc.hoSo, "marketing.view");
  const where: Prisma.EmailCampaignWhereInput = {
    ...(loc.trangThai && { status: loc.trangThai }),
    ...(loc.q && { OR: [{ name: { contains: loc.q, mode: "insensitive" } }, { code: { contains: loc.q, mode: "insensitive" } }] }),
  };
  const [tong, ds] = await Promise.all([
    nc.tx.emailCampaign.count({ where }),
    nc.tx.emailCampaign.findMany({
      where,
      select: { id: true, code: true, name: true, status: true, subject: true, createdAt: true, approvedAt: true, completedAt: true, pauseReason: true },
      orderBy: { createdAt: "desc" },
      skip: (loc.trang - 1) * CO_TRANG,
      take: CO_TRANG,
    }),
  ]);
  const tk = await thongKeChienDich(nc.tx, ds.map((c) => c.id));
  return {
    tong,
    trang: loc.trang,
    coTrang: CO_TRANG,
    dong: ds.map((c) => ({
      id: c.id,
      ma: c.code,
      ten: c.name,
      tieuDe: c.subject,
      trangThai: c.status,
      lapLuc: c.createdAt,
      duyetLuc: c.approvedAt,
      xongLuc: c.completedAt,
      lyDoDung: c.pauseReason,
      thongKe: tk.get(c.id) ?? null,
    })),
  };
}

export async function chiTietChienDich(nc: NguCanh, id: string, loc: { trangThai: string; trang: number } = { trangThai: "", trang: 1 }) {
  batBuocQuyen(nc.hoSo, "marketing.view", { objectType: "email_campaign", objectId: id });
  const c = await layChienDich(nc, id);
  const khoi = khoiCua(c.blocks);
  const idNguoi = [c.createdBy, c.submittedBy, c.approvedBy, c.cancelledBy].filter((x): x is string => Boolean(x));
  const [nguoi, tk, tongNN, nn, mau] = await Promise.all([
    nc.tx.user.findMany({ where: { id: { in: idNguoi } }, select: { id: true, fullName: true } }),
    thongKeChienDich(nc.tx, [id]),
    nc.tx.emailRecipient.count({ where: { campaignId: id, ...(loc.trangThai && { status: loc.trangThai }) } }),
    nc.tx.emailRecipient.findMany({
      where: { campaignId: id, ...(loc.trangThai && { status: loc.trangThai }) },
      select: { id: true, email: true, name: true, companyName: true, recipientType: true, status: true, reason: true, sentAt: true, openedAt: true, clickedAt: true, unsubscribedAt: true, leadId: true, customerId: true },
      orderBy: [{ createdAt: "asc" }, { email: "asc" }],
      skip: (loc.trang - 1) * 50,
      take: 50,
    }),
    c.templateId ? nc.tx.emailTemplate.findFirst({ where: { id: c.templateId }, select: { id: true, name: true } }) : null,
  ]);
  const ten = new Map(nguoi.map((n) => [n.id, n.fullName]));
  let moTaNguon = c.sourceCode;
  try {
    const n = timNguon(c.sourceCode);
    moTaNguon = n.moTa(n.luocDo.parse(c.sourceParams));
  } catch {
    // nguồn đã gỡ (gói cắm ngoài) — vẫn hiện mã
  }
  const { thu, thieuChanThu: thieu } = await dungThuMau(nc, c.subject, khoi);
  return {
    id: c.id,
    ma: c.code,
    ten: c.name,
    trangThai: c.status,
    tieuDe: c.subject,
    khoi,
    nguon: c.sourceCode,
    thamSo: c.sourceParams,
    moTaNguon,
    mau,
    theoDoi: c.trackingEnabled,
    tomTatLoai: c.recipientSummary as Record<string, number>,
    lyDoDung: c.pauseReason,
    lyDoHuy: c.cancelReason,
    lapLuc: c.createdAt,
    nguoiLap: c.createdBy ? ten.get(c.createdBy) ?? null : null,
    guiDuyetLuc: c.submittedAt,
    duyetLuc: c.approvedAt,
    nguoiDuyet: c.approvedBy ? ten.get(c.approvedBy) ?? null : null,
    huyLuc: c.cancelledAt,
    xongLuc: c.completedAt,
    thongKe: tk.get(id) ?? { tong: 0, choGui: 0, dangGui: 0, daGui: 0, loi: 0, biLoai: 0, mo: 0, bam: 0, huyNhanTin: 0 },
    xemTruoc: { tieuDe: thu.tieuDe, html: thu.html, thieuChanThu: thieu },
    nguoiNhan: {
      tong: tongNN,
      trang: loc.trang,
      coTrang: 50,
      dong: nn.map((r) => ({
        id: r.id,
        email: duocXemEmail(nc, r.recipientType) ? r.email : cheEmail(r.email),
        ten: r.name,
        congTy: r.companyName,
        loai: r.recipientType,
        trangThai: r.status,
        lyDo: r.reason,
        guiLuc: r.sentAt,
        moLuc: r.openedAt,
        bamLuc: r.clickedAt,
        huyLuc: r.unsubscribedAt,
        leadId: duocXemEmail(nc, r.recipientType) ? r.leadId : null,
        khachHangId: duocXemEmail(nc, r.recipientType) ? r.customerId : null,
      })),
    },
  };
}

/** Quyền thao tác trên màn hình chiến dịch — chỉ để ẩn/hiện nút; service tự kiểm lại. */
export function quyenGiaoDienEmail(hoSo: NguCanh["hoSo"]) {
  return {
    tao: coQuyen(hoSo, "marketing.create"),
    sua: coQuyen(hoSo, "marketing.update"),
    duyet: coQuyen(hoSo, "marketing.approve"),
    xemLead: coQuyen(hoSo, "crm.view"),
    xemLienHe: coQuyen(hoSo, "customer.view"),
    /** Nguồn "phân khúc" của gói Marketing cần email thật → `marketing.update` (xem nguon-nguoi-nhan.ts). */
    phanKhuc: coQuyen(hoSo, "marketing.update"),
  };
}

export type { ChanThu };
