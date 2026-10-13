import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { trongPhamVi } from "@/modules/crm/chung";
import { TEN_O_BAY, TRUONG_FORM, type KenhNhan, type KhoaTruongForm } from "./hang-so";
import { docUtm, kiemTraDuLieuForm, laSlugHopLe, taoSlug, type TruongFormCauHinh } from "./tinh-toan";
import { kiemTraChienDichGanDuoc, kiemTraNguonLead, locMarketing } from "./chung";
import { ghiNhanBiTuChoi, nhanLead, type KetQuaNhanLead } from "./nhan-lead";
import { landingDungForm } from "./landing";
import type { DuLieuForm } from "./luoc-do";

/**
 * Form đăng ký công khai. Luật MK-11 (BUSINESS_RULES.md mục 22).
 * Quản lý form: quyền `marketing.*`, phạm vi theo `owner_id`. Gửi form: không cần đăng nhập,
 * đi qua `nhanLead()`.
 */

const CHON = {
  id: true, slug: true, name: true, title: true, intro: true, fields: true, buttonText: true, successMessage: true,
  consentText: true, campaignId: true, source: true, ownerId: true, viewCount: true, status: true, createdAt: true, updatedAt: true,
  owner: { select: { id: true, fullName: true } },
  campaign: { select: { id: true, code: true, name: true } },
} satisfies Prisma.MarketingFormSelect;
type BanGhi = Prisma.MarketingFormGetPayload<{ select: typeof CHON }>;

/** Đọc lại cấu hình trường đã lưu, bỏ mọi khóa không còn trong danh mục. */
export function docTruong(json: unknown): TruongFormCauHinh[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((t): t is { khoa: string; nhan?: string; batBuoc?: boolean } => Boolean(t) && typeof t === "object" && typeof (t as { khoa?: unknown }).khoa === "string")
    .filter((t) => t.khoa in TRUONG_FORM)
    .map((t) => ({ khoa: t.khoa as KhoaTruongForm, nhan: (t.nhan || TRUONG_FORM[t.khoa as KhoaTruongForm].nhan).slice(0, 100), batBuoc: Boolean(t.batBuoc) }));
}

function chuyenDoi(f: BanGhi) {
  return {
    id: f.id,
    slug: f.slug,
    ten: f.name,
    tieuDe: f.title,
    gioiThieu: f.intro,
    truong: docTruong(f.fields),
    nutGui: f.buttonText,
    loiCamOn: f.successMessage,
    cauDongY: f.consentText,
    nguon: f.source,
    luotXem: f.viewCount,
    trangThai: f.status,
    taoLuc: f.createdAt,
    suaLuc: f.updatedAt,
    chienDich: f.campaign ? { id: f.campaign.id, ma: f.campaign.code, ten: f.campaign.name } : null,
    nguoiPhuTrach: { id: f.owner.id, hoTen: f.owner.fullName },
  };
}
export type FormDangKy = ReturnType<typeof chuyenDoi>;

// ---------------------------------------------------------------------------
// Quản lý
// ---------------------------------------------------------------------------

export async function danhSachForm(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "marketing.view");
  const ds = await nc.tx.marketingForm.findMany({ where: await locMarketing(nc), select: CHON, orderBy: [{ status: "asc" }, { createdAt: "desc" }] });
  const dem = await nc.tx.leadCapture.groupBy({ by: ["formId", "result"], where: { formId: { in: ds.map((f) => f.id) } }, _count: { _all: true } });
  return ds.map((f) => {
    const cua = dem.filter((d) => d.formId === f.id);
    const nhan = cua.filter((d) => d.result === "tao-moi" || d.result === "ghi-them").reduce((s, d) => s + d._count._all, 0);
    return { ...chuyenDoi(f), soLanGui: nhan, soLeadMoi: cua.find((d) => d.result === "tao-moi")?._count._all ?? 0, soBiChan: cua.filter((d) => d.result === "tu-choi" || d.result === "spam").reduce((s, d) => s + d._count._all, 0) };
  });
}

export async function chiTietForm(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "marketing.view", { objectType: "marketing_form", objectId: id });
  const f = await nc.tx.marketingForm.findFirst({ where: { id, ...(await locMarketing(nc)) }, select: CHON });
  if (!f) throw new LoiKhongTimThay("Form");
  const kq = chuyenDoi(f);
  return { form: kq, duocSua: coQuyen(nc.hoSo, "marketing.update") && (await trongPhamVi(nc, "marketing.update", kq.nguoiPhuTrach.id)) };
}

async function kiemTraForm(nc: NguCanh, d: DuLieuForm, boQuaId?: string) {
  const slug = d.slug || taoSlug(d.ten);
  if (!slug) throw new LoiDinhDang("slug", "Không tạo được đường dẫn từ tên form — nhập đường dẫn.");
  const trung = await nc.tx.marketingForm.findFirst({ where: { slug, ...(boQuaId && { NOT: { id: boQuaId } }) }, select: { id: true } });
  if (trung) throw new LoiDinhDang("slug", `Đường dẫn "${slug}" đã dùng cho form khác.`);
  await kiemTraChienDichGanDuoc(nc.tx, d.chienDichId);
  await kiemTraNguonLead(nc.tx, d.nguon);
  return slug;
}

function duLieuGhi(d: DuLieuForm, slug: string) {
  return {
    slug,
    name: d.ten,
    title: d.tieuDe,
    intro: d.gioiThieu ?? null,
    fields: d.truong as unknown as Prisma.InputJsonValue,
    buttonText: d.nutGui ?? null,
    successMessage: d.loiCamOn ?? null,
    consentText: d.cauDongY ?? null,
    campaignId: d.chienDichId ?? null,
    source: d.nguon ?? null,
    status: d.trangThai,
  };
}

export async function taoForm(nc: NguCanh, d: DuLieuForm) {
  batBuocQuyen(nc.hoSo, "marketing.create", { objectType: "marketing_form" });
  const slug = await kiemTraForm(nc, d);
  try {
    const f = await nc.tx.marketingForm.create({
      data: { tenantId: nc.tenantId, ...duLieuGhi(d, slug), ownerId: nc.hoSo.userId, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
      select: CHON,
    });
    const kq = chuyenDoi(f);
    await nc.kiemToan({ action: "tao", objectType: "marketing_form", objectId: f.id, after: { ...kq, taoLuc: undefined, suaLuc: undefined } });
    await nc.suKien({ eventType: SU_KIEN.LEAD_FORM_SAVED, objectType: "marketing_form", objectId: f.id, payload: { slug } });
    return kq;
  } catch (e) {
    if (laLoiTrung(e)) throw new LoiDinhDang("slug", `Đường dẫn "${slug}" đã dùng cho form khác.`);
    throw e;
  }
}

export async function suaForm(nc: NguCanh, id: string, d: DuLieuForm) {
  batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "marketing_form", objectId: id });
  const { form: truoc, duocSua } = await chiTietForm(nc, id);
  if (!duocSua) throw new LoiNghiepVu("Bạn chỉ xem được form này, không sửa được (ngoài phạm vi phụ trách).", 403, "ngoai-pham-vi");
  const slug = await kiemTraForm(nc, d, id);
  const f = await nc.tx.marketingForm.update({ where: { id }, data: { ...duLieuGhi(d, slug), updatedBy: nc.hoSo.userId }, select: CHON });
  const sau = chuyenDoi(f);
  await nc.kiemToan({ action: "sua", objectType: "marketing_form", objectId: id, before: { ...truoc, taoLuc: undefined, suaLuc: undefined }, after: { ...sau, taoLuc: undefined, suaLuc: undefined } });
  await nc.suKien({ eventType: SU_KIEN.LEAD_FORM_SAVED, objectType: "marketing_form", objectId: id, payload: { slug, doiDuongDan: slug !== truoc.slug } });
  return sau;
}

// ---------------------------------------------------------------------------
// Công khai — chạy trong voiTenant của doanh nghiệp đã giải từ mã trên đường dẫn
// ---------------------------------------------------------------------------

/** Form để dựng trang công khai. Form tắt / không có → null (trang trả 404, MK-11). */
export async function docFormCongKhai(tx: ClientTenant, slug: string, tangLuotXem = false) {
  // Slug sai khuôn (NUL, "../", chữ hoa…) → không truy vấn, coi như không có.
  if (!laSlugHopLe(slug)) return null;
  const f = await tx.marketingForm.findFirst({
    where: { slug, status: "hoat-dong" },
    select: { id: true, slug: true, title: true, intro: true, fields: true, buttonText: true, successMessage: true, consentText: true },
  });
  if (!f) return null;
  if (tangLuotXem) await tx.marketingForm.update({ where: { id: f.id }, data: { viewCount: { increment: 1 } } });
  return {
    id: f.id,
    slug: f.slug,
    tieuDe: f.title,
    gioiThieu: f.intro,
    truong: docTruong(f.fields),
    nutGui: f.buttonText || "Gửi đăng ký",
    loiCamOn: f.successMessage || "Cảm ơn bạn! Chúng tôi sẽ liên hệ lại sớm.",
    cauDongY: f.consentText,
  };
}
export type FormCongKhai = NonNullable<Awaited<ReturnType<typeof docFormCongKhai>>>;

/**
 * Lỗi từ chối một lần nhận — mang theo thông tin để ghi nhật ký trong giao dịch RIÊNG
 * (giao dịch chính cuộn ngược thì dòng nhật ký ghi chung cũng mất).
 */
export class LoiTuChoiNhan extends LoiNghiepVu {
  constructor(
    message: string,
    status: number,
    ma: string,
    public readonly nhatKy: { kenh: KenhNhan; lyDo: string; formId?: string | null; webhookSourceId?: string | null; landingPageId?: string | null },
    chiTiet?: unknown,
  ) {
    super(message, status, ma, chiTiet);
    this.name = "LoiTuChoiNhan";
  }
}

export interface MetaGuiCongKhai {
  ip: string | null;
  userAgent: string | null;
  landingPageId?: string | null;
  landingVariant?: "A" | "B" | null;
}

export type KetQuaGuiForm = { ketQua: "spam" } | ({ ketQua: KetQuaNhanLead["ketQua"] } & Pick<KetQuaNhanLead, "leadId">);

/** Gửi form công khai (MK-11) → `nhanLead()`. */
export async function guiFormCongKhai(tx: ClientTenant, tenantId: string, slug: string, than: Record<string, unknown>, meta: MetaGuiCongKhai): Promise<KetQuaGuiForm & { loiCamOn: string }> {
  if (!laSlugHopLe(slug)) {
    throw new LoiTuChoiNhan("Form không tồn tại hoặc đã tắt.", 404, "khong-tim-thay", { kenh: "form", lyDo: "Đường dẫn form sai khuôn" });
  }
  const f = await tx.marketingForm.findFirst({
    where: { slug, status: "hoat-dong" },
    select: { id: true, slug: true, fields: true, consentText: true, campaignId: true, source: true, ownerId: true, successMessage: true },
  });
  if (!f) throw new LoiTuChoiNhan("Form không tồn tại hoặc đã tắt.", 404, "khong-tim-thay", { kenh: "form", lyDo: `Form "${slug.slice(0, 60)}" không tồn tại hoặc đã tắt` });
  // Lượt gửi chỉ được tính cho landing khi trang đó đang xuất bản và thật sự dùng form này.
  const landingId = meta.landingPageId && (await landingDungForm(tx, meta.landingPageId, f.id)) ? meta.landingPageId : null;
  meta = { ...meta, landingPageId: landingId, landingVariant: landingId ? (meta.landingVariant ?? "A") : null };
  const kenh: KenhNhan = landingId ? "landing" : "form";
  const loiCamOn = f.successMessage || "Cảm ơn bạn! Chúng tôi sẽ liên hệ lại sớm.";

  // Bẫy bot: trả "thành công" để bot không học được, nhưng không tạo lead.
  const bay = than[TEN_O_BAY];
  if (typeof bay === "string" && bay.trim()) {
    await ghiNhanBiTuChoi(tx, tenantId, { kenh, ketQua: "spam", lyDo: "Ô bẫy chống bot có dữ liệu", formId: f.id, landingPageId: meta.landingPageId, ip: meta.ip });
    return { ketQua: "spam", loiCamOn };
  }

  const truong = docTruong(f.fields);
  const { duLieu, loi } = kiemTraDuLieuForm(truong, than);
  if (f.consentText && than.dongYNhanTin !== undefined && typeof than.dongYNhanTin !== "boolean") loi.dongYNhanTin = "Giá trị đồng ý không hợp lệ.";
  if (Object.keys(loi).length) {
    throw new LoiTuChoiNhan(Object.values(loi)[0], 400, "du-lieu-sai", { kenh, lyDo: `Dữ liệu sai: ${Object.keys(loi).join(", ")}`, formId: f.id, landingPageId: meta.landingPageId }, { loiTruong: loi });
  }
  const utmNguon = (than.utm && typeof than.utm === "object" ? than.utm : than) as Record<string, unknown>;
  const kq = await nhanLead(
    tx,
    tenantId,
    {
      kenh,
      hoTen: duLieu.hoTen ?? null,
      dienThoai: duLieu.dienThoai ?? null,
      email: duLieu.email ?? null,
      congTy: duLieu.congTy ?? null,
      chucDanh: duLieu.chucDanh ?? null,
      maSoThue: duLieu.maSoThue ?? null,
      nhuCau: duLieu.nhuCau ?? null,
      ghiChu: duLieu.ghiChu ?? null,
      nguon: f.source,
      chienDichId: f.campaignId,
      utm: docUtm(utmNguon),
      // MK-13: chỉ khi form có hỏi VÀ người gửi tự tích.
      dongYNhanTin: Boolean(f.consentText) && than.dongYNhanTin === true,
      nguonDongY: `${kenh}:${f.slug}`,
      formId: f.id,
      landingPageId: meta.landingPageId ?? null,
      landingVariant: meta.landingVariant ?? null,
      nguoiDuPhongId: f.ownerId,
      payload: { ...duLieu, dongYNhanTin: than.dongYNhanTin === true, trang: typeof than.trang === "string" ? than.trang.slice(0, 300) : null, userAgent: meta.userAgent?.slice(0, 300) ?? null },
    },
    { nguoiId: null, email: null, ip: meta.ip, userAgent: meta.userAgent },
  );
  return { ketQua: kq.ketQua, leadId: kq.leadId, loiCamOn };
}
