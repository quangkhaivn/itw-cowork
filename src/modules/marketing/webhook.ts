import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { trongPhamVi } from "@/modules/crm/chung";
import { docUtm, kiemTraDuLieuForm, taoSlug } from "./tinh-toan";
import { kiemTraChienDichGanDuoc, kiemTraNguonLead, locMarketing } from "./chung";
import { nhanLead } from "./nhan-lead";
import { LoiTuChoiNhan } from "./form";
import { LuocDoThanWebhook, type DuLieuNguonWebhook } from "./luoc-do";

/**
 * Webhook nhận lead — Facebook Lead Ads (qua Zapier / Make), Zalo, website khác. Luật MK-12.
 *
 * Khóa bí mật: sinh ngẫu nhiên 24 byte, trả về **một lần** lúc tạo / đổi khóa, máy chủ chỉ
 * giữ SHA-256. So khớp bằng `timingSafeEqual`. Thu hồi = nguồn thôi nhận, khóa cũ vô hiệu.
 */

export function bamKhoa(khoa: string): string {
  return createHash("sha256").update(khoa, "utf8").digest("hex");
}

export function sinhKhoa(): string {
  return `cwk_${randomBytes(24).toString("base64url")}`;
}

/** So hai bản băm hex 64 ký tự trong thời gian hằng. */
export function khopBam(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

const CHON = {
  id: true, code: true, name: true, keyHint: true, campaignId: true, source: true, ownerId: true, status: true,
  revokedAt: true, lastReceivedAt: true, createdAt: true,
  owner: { select: { id: true, fullName: true } },
  campaign: { select: { id: true, code: true, name: true } },
} satisfies Prisma.MarketingWebhookSourceSelect;
type BanGhi = Prisma.MarketingWebhookSourceGetPayload<{ select: typeof CHON }>;

function chuyenDoi(w: BanGhi) {
  return {
    id: w.id,
    ma: w.code,
    ten: w.name,
    goiYKhoa: `…${w.keyHint}`,
    nguon: w.source,
    trangThai: w.status,
    thuHoiLuc: w.revokedAt,
    nhanCuoiLuc: w.lastReceivedAt,
    taoLuc: w.createdAt,
    chienDich: w.campaign ? { id: w.campaign.id, ma: w.campaign.code, ten: w.campaign.name } : null,
    nguoiPhuTrach: { id: w.owner.id, hoTen: w.owner.fullName },
  };
}

export async function danhSachNguonWebhook(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "marketing.view");
  const ds = await nc.tx.marketingWebhookSource.findMany({ where: await locMarketing(nc), select: CHON, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  const dem = await nc.tx.leadCapture.groupBy({ by: ["webhookSourceId", "result"], where: { webhookSourceId: { in: ds.map((w) => w.id) } }, _count: { _all: true } });
  return ds.map((w) => {
    const cua = dem.filter((d) => d.webhookSourceId === w.id);
    return {
      ...chuyenDoi(w),
      soNhan: cua.filter((d) => d.result === "tao-moi" || d.result === "ghi-them").reduce((s, d) => s + d._count._all, 0),
      soTuChoi: cua.filter((d) => d.result === "tu-choi").reduce((s, d) => s + d._count._all, 0),
    };
  });
}

async function docDuocSua(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "marketing_webhook_source", objectId: id });
  const w = await nc.tx.marketingWebhookSource.findFirst({ where: { id, ...(await locMarketing(nc)) }, select: CHON });
  if (!w) throw new LoiKhongTimThay("Nguồn webhook");
  if (!(await trongPhamVi(nc, "marketing.update", w.ownerId))) throw new LoiNghiepVu("Nguồn webhook ngoài phạm vi phụ trách của bạn.", 403, "ngoai-pham-vi");
  return w;
}

/** Tạo nguồn — trả khóa bí mật MỘT LẦN DUY NHẤT. */
export async function taoNguonWebhook(nc: NguCanh, d: DuLieuNguonWebhook) {
  batBuocQuyen(nc.hoSo, "marketing.create", { objectType: "marketing_webhook_source" });
  const ma = d.ma || taoSlug(d.ten);
  if (!ma) throw new LoiDinhDang("ma", "Nhập mã nguồn (chữ thường không dấu, số, gạch nối).");
  if (await nc.tx.marketingWebhookSource.findFirst({ where: { code: ma }, select: { id: true } })) throw new LoiDinhDang("ma", `Mã "${ma}" đã dùng cho nguồn khác.`);
  await kiemTraChienDichGanDuoc(nc.tx, d.chienDichId);
  await kiemTraNguonLead(nc.tx, d.nguon);
  const khoa = sinhKhoa();
  const w = await nc.tx.marketingWebhookSource.create({
    data: {
      tenantId: nc.tenantId, code: ma, name: d.ten, keyHash: bamKhoa(khoa), keyHint: khoa.slice(-4), campaignId: d.chienDichId ?? null,
      source: d.nguon ?? null, ownerId: nc.hoSo.userId, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId,
    },
    select: CHON,
  });
  await nc.kiemToan({ action: "tao", objectType: "marketing_webhook_source", objectId: w.id, after: { ma, ten: d.ten, chienDichId: d.chienDichId ?? null, goiYKhoa: w.keyHint } });
  await nc.suKien({ eventType: SU_KIEN.WEBHOOK_SOURCE_CREATED, objectType: "marketing_webhook_source", objectId: w.id, payload: { ma } });
  return { nguon: chuyenDoi(w), khoa };
}

export async function doiKhoaWebhook(nc: NguCanh, id: string) {
  const w = await docDuocSua(nc, id);
  if (w.status !== "hoat-dong") throw new LoiNghiepVu("Nguồn đã thu hồi. Tạo nguồn mới nếu cần nhận lại.", 409, "da-thu-hoi");
  const khoa = sinhKhoa();
  await nc.tx.marketingWebhookSource.update({ where: { id }, data: { keyHash: bamKhoa(khoa), keyHint: khoa.slice(-4), updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "doi-khoa", objectType: "marketing_webhook_source", objectId: id, before: { goiYKhoa: w.keyHint }, after: { goiYKhoa: khoa.slice(-4) } });
  await nc.suKien({ eventType: SU_KIEN.WEBHOOK_KEY_ROTATED, objectType: "marketing_webhook_source", objectId: id, payload: {} });
  return { id, khoa };
}

export async function thuHoiWebhook(nc: NguCanh, id: string) {
  const w = await docDuocSua(nc, id);
  if (w.status !== "hoat-dong") return { id, trangThai: w.status };
  await nc.tx.marketingWebhookSource.update({ where: { id }, data: { status: "thu-hoi", revokedAt: new Date(), revokedBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "huy", objectType: "marketing_webhook_source", objectId: id, before: { trangThai: "hoat-dong" }, after: { trangThai: "thu-hoi" } });
  await nc.suKien({ eventType: SU_KIEN.WEBHOOK_SOURCE_REVOKED, objectType: "marketing_webhook_source", objectId: id, payload: {} });
  return { id, trangThai: "thu-hoi" };
}

/** Người xem có được sửa nguồn (để ẩn nút) — kiểm thật vẫn ở các hàm ghi. */
export function duocQuanLyWebhook(nc: NguCanh) {
  return { tao: coQuyen(nc.hoSo, "marketing.create"), sua: coQuyen(nc.hoSo, "marketing.update") };
}

// ---------------------------------------------------------------------------
// Nhận (công khai, xác thực bằng khóa)
// ---------------------------------------------------------------------------

export async function nhanQuaWebhook(
  tx: ClientTenant,
  tenantId: string,
  maNguon: string,
  khoa: string | null,
  than: unknown,
  meta: { ip: string | null; userAgent: string | null },
) {
  const w = await tx.marketingWebhookSource.findFirst({ where: { code: maNguon }, select: { id: true, code: true, keyHash: true, status: true, campaignId: true, source: true, ownerId: true } });
  // Không phân biệt "không có nguồn" với "sai khóa" trong câu trả lời — tránh dò mã nguồn.
  if (!w) throw new LoiTuChoiNhan("Khóa không hợp lệ.", 401, "sai-khoa", { kenh: "webhook", lyDo: `Nguồn "${maNguon.slice(0, 60)}" không tồn tại` });
  if (w.status !== "hoat-dong") throw new LoiTuChoiNhan("Khóa không hợp lệ.", 401, "sai-khoa", { kenh: "webhook", lyDo: "Nguồn đã thu hồi", webhookSourceId: w.id });
  if (!khoa || !khopBam(bamKhoa(khoa), w.keyHash)) {
    throw new LoiTuChoiNhan("Khóa không hợp lệ.", 401, "sai-khoa", { kenh: "webhook", lyDo: khoa ? "Sai khóa bí mật" : "Thiếu khóa bí mật", webhookSourceId: w.id });
  }
  const p = LuocDoThanWebhook.safeParse(than);
  if (!p.success) {
    throw new LoiTuChoiNhan("Dữ liệu không hợp lệ.", 400, "du-lieu-sai", { kenh: "webhook", lyDo: `Thân yêu cầu sai: ${p.error.issues.map((i) => i.path.join(".")).join(", ").slice(0, 300)}`, webhookSourceId: w.id });
  }
  const d = p.data;
  const { loi } = kiemTraDuLieuForm(
    [
      { khoa: "hoTen", nhan: "Họ tên", batBuoc: false },
      { khoa: "dienThoai", nhan: "Số điện thoại", batBuoc: false },
      { khoa: "email", nhan: "Email", batBuoc: false },
      { khoa: "congTy", nhan: "Công ty", batBuoc: false },
      { khoa: "maSoThue", nhan: "Mã số thuế", batBuoc: false },
    ],
    d,
  );
  if (Object.keys(loi).length) {
    throw new LoiTuChoiNhan(Object.values(loi)[0], 400, "du-lieu-sai", { kenh: "webhook", lyDo: `Dữ liệu sai: ${Object.keys(loi).join(", ")}`, webhookSourceId: w.id }, { loiTruong: loi });
  }
  const kq = await nhanLead(
    tx,
    tenantId,
    {
      kenh: "webhook",
      hoTen: d.hoTen || null,
      dienThoai: d.dienThoai || null,
      email: d.email || null,
      congTy: d.congTy || null,
      chucDanh: d.chucDanh || null,
      maSoThue: d.maSoThue || null,
      nhuCau: d.nhuCau || null,
      ghiChu: d.ghiChu || null,
      nguon: w.source,
      chienDichId: w.campaignId,
      utm: docUtm(d.utm),
      dongYNhanTin: d.dongYNhanTin,
      nguonDongY: `webhook:${w.code}`,
      webhookSourceId: w.id,
      nguoiDuPhongId: w.ownerId,
      payload: { hoTen: d.hoTen, dienThoai: d.dienThoai, email: d.email, congTy: d.congTy, nhuCau: d.nhuCau.slice(0, 1000), dongYNhanTin: d.dongYNhanTin },
    },
    { nguoiId: null, email: null, ip: meta.ip, userAgent: meta.userAgent },
  );
  await tx.marketingWebhookSource.update({ where: { id: w.id }, data: { lastReceivedAt: new Date() } });
  return { ketQua: kq.ketQua, ma: kq.leadMa };
}
