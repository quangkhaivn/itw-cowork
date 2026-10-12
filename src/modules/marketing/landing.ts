import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { chuoiTuyChon, trongPhamVi, uuidTuyChon } from "@/modules/crm/chung";
import { laSlugHopLe, taoSlug, tyLePhanTram } from "./tinh-toan";
import { kiemTraChienDichGanDuoc, locMarketing } from "./chung";
import { docKhoi, LuocDoDanhSachKhoi, MAU_KHOI_MAC_DINH } from "./khoi-landing";

/**
 * Landing page công khai /lp/<mã doanh nghiệp>/<slug>. Luật MK-16 (BUSINESS_RULES.md mục 21).
 * Quyền `marketing.*`, phạm vi theo `owner_id`. Trang công khai chỉ mở khi đang xuất bản.
 */

export const LuocDoLanding = z.object({
  ten: z.string().trim().min(3, "Tên tối thiểu 3 ký tự.").max(255),
  slug: z
    .union([z.string().trim().max(60), z.null()])
    .optional()
    .refine((s) => !s || laSlugHopLe(s), "Chỉ dùng chữ thường không dấu, số và dấu gạch nối."),
  tieuDe: z.string().trim().min(3, "Tiêu đề trang tối thiểu 3 ký tự.").max(255),
  moTa: chuoiTuyChon(500),
  khoi: LuocDoDanhSachKhoi.optional(),
  /** null = tắt thử nghiệm A/B. */
  khoiB: LuocDoDanhSachKhoi.nullable().optional(),
  formId: uuidTuyChon,
  chienDichId: uuidTuyChon,
});
export type DuLieuLanding = z.infer<typeof LuocDoLanding>;

export const LuocDoTrangThaiLanding = z.object({ trangThai: z.enum(["nhap", "xuat-ban", "an"]) });

const CHON = {
  id: true, slug: true, name: true, title: true, description: true, blocks: true, blocksB: true, formId: true, campaignId: true,
  ownerId: true, status: true, publishedAt: true, viewsA: true, viewsB: true, createdAt: true, updatedAt: true,
  owner: { select: { id: true, fullName: true } },
  form: { select: { id: true, name: true, slug: true, status: true } },
  campaign: { select: { id: true, code: true, name: true } },
} satisfies Prisma.LandingPageSelect;
type BanGhi = Prisma.LandingPageGetPayload<{ select: typeof CHON }>;

function chuyenDoi(p: BanGhi) {
  return {
    id: p.id,
    slug: p.slug,
    ten: p.name,
    tieuDe: p.title,
    moTa: p.description,
    khoi: docKhoi(p.blocks),
    khoiB: p.blocksB === null ? null : docKhoi(p.blocksB),
    coAB: p.blocksB !== null,
    trangThai: p.status,
    xuatBanLuc: p.publishedAt,
    luotXemA: p.viewsA,
    luotXemB: p.viewsB,
    form: p.form ? { id: p.form.id, ten: p.form.name, slug: p.form.slug, trangThai: p.form.status } : null,
    chienDich: p.campaign ? { id: p.campaign.id, ma: p.campaign.code, ten: p.campaign.name } : null,
    nguoiPhuTrach: { id: p.owner.id, hoTen: p.owner.fullName },
    suaLuc: p.updatedAt,
  };
}
export type Landing = ReturnType<typeof chuyenDoi>;

/** Thống kê theo biến thể: lượt xem, lượt đăng ký nhận được, tỷ lệ. */
async function thongKe(tx: ClientTenant, ids: string[]) {
  const dem = await tx.leadCapture.groupBy({
    by: ["landingPageId", "landingVariant"],
    where: { landingPageId: { in: ids }, result: { in: ["tao-moi", "ghi-them"] } },
    _count: { _all: true },
  });
  return (id: string, xemA: number, xemB: number) => {
    const dkA = dem.filter((d) => d.landingPageId === id && d.landingVariant !== "B").reduce((s, d) => s + d._count._all, 0);
    const dkB = dem.filter((d) => d.landingPageId === id && d.landingVariant === "B").reduce((s, d) => s + d._count._all, 0);
    return { A: { xem: xemA, dangKy: dkA, tyLe: tyLePhanTram(dkA, xemA) }, B: { xem: xemB, dangKy: dkB, tyLe: tyLePhanTram(dkB, xemB) } };
  };
}

export async function danhSachLanding(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "marketing.view");
  const ds = await nc.tx.landingPage.findMany({ where: await locMarketing(nc), select: CHON, orderBy: [{ updatedAt: "desc" }] });
  const tk = await thongKe(nc.tx, ds.map((p) => p.id));
  return ds.map((p) => ({ ...chuyenDoi(p), thongKe: tk(p.id, p.viewsA, p.viewsB) }));
}

export async function chiTietLanding(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "marketing.view", { objectType: "landing_page", objectId: id });
  const p = await nc.tx.landingPage.findFirst({ where: { id, ...(await locMarketing(nc)) }, select: CHON });
  if (!p) throw new LoiKhongTimThay("Landing page");
  const tk = await thongKe(nc.tx, [id]);
  const kq = chuyenDoi(p);
  return { landing: kq, thongKe: tk(id, p.viewsA, p.viewsB), duocSua: coQuyen(nc.hoSo, "marketing.update") && (await trongPhamVi(nc, "marketing.update", kq.nguoiPhuTrach.id)) };
}

async function kiemTraDuLieu(nc: NguCanh, d: DuLieuLanding, boQuaId?: string) {
  const slug = d.slug || taoSlug(d.ten);
  if (!slug) throw new LoiDinhDang("slug", "Nhập đường dẫn.");
  if (await nc.tx.landingPage.findFirst({ where: { slug, ...(boQuaId && { NOT: { id: boQuaId } }) }, select: { id: true } })) {
    throw new LoiDinhDang("slug", `Đường dẫn "${slug}" đã dùng cho landing page khác.`);
  }
  if (d.formId && !(await nc.tx.marketingForm.findFirst({ where: { id: d.formId }, select: { id: true } }))) throw new LoiDinhDang("formId", "Form không tồn tại.");
  await kiemTraChienDichGanDuoc(nc.tx, d.chienDichId);
  const coKhoiForm = [...(d.khoi ?? []), ...(d.khoiB ?? [])].some((k) => k.loai === "form" || (k.loai === "nut-goi" && k.kieu === "form"));
  if (coKhoiForm && !d.formId) throw new LoiDinhDang("formId", "Trang có khối Form / nút mở form thì phải chọn form đăng ký.");
  return slug;
}

export async function taoLanding(nc: NguCanh, d: DuLieuLanding) {
  batBuocQuyen(nc.hoSo, "marketing.create", { objectType: "landing_page" });
  const khoi = d.khoi ?? MAU_KHOI_MAC_DINH;
  const slug = await kiemTraDuLieu(nc, { ...d, khoi });
  const p = await nc.tx.landingPage.create({
    data: {
      tenantId: nc.tenantId, slug, name: d.ten, title: d.tieuDe, description: d.moTa ?? null,
      blocks: khoi as Prisma.InputJsonValue, blocksB: d.khoiB ? (d.khoiB as Prisma.InputJsonValue) : undefined,
      formId: d.formId ?? null, campaignId: d.chienDichId ?? null, ownerId: nc.hoSo.userId, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId,
    },
    select: CHON,
  });
  await nc.kiemToan({ action: "tao", objectType: "landing_page", objectId: p.id, after: { slug, ten: d.ten, soKhoi: khoi.length } });
  await nc.suKien({ eventType: SU_KIEN.LANDING_PAGE_SAVED, objectType: "landing_page", objectId: p.id, payload: { slug } });
  return chuyenDoi(p);
}

async function docDuocSua(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "landing_page", objectId: id });
  const { landing, duocSua } = await chiTietLanding(nc, id);
  if (!duocSua) throw new LoiNghiepVu("Landing page ngoài phạm vi phụ trách của bạn.", 403, "ngoai-pham-vi");
  return landing;
}

export async function suaLanding(nc: NguCanh, id: string, d: DuLieuLanding) {
  const truoc = await docDuocSua(nc, id);
  const khoi = d.khoi ?? truoc.khoi ?? [];
  const khoiB = d.khoiB !== undefined ? d.khoiB : truoc.khoiB;
  const slug = await kiemTraDuLieu(nc, { ...d, khoi, khoiB }, id);
  if (truoc.trangThai === "xuat-ban" && slug !== truoc.slug) {
    throw new LoiNghiepVu("Trang đang xuất bản — đổi đường dẫn sẽ làm hỏng liên kết quảng cáo đang chạy. Ẩn trang trước rồi đổi.", 409, "dang-xuat-ban");
  }
  const p = await nc.tx.landingPage.update({
    where: { id },
    data: {
      slug, name: d.ten, title: d.tieuDe, description: d.moTa ?? null, blocks: khoi as Prisma.InputJsonValue,
      blocksB: khoiB ? (khoiB as Prisma.InputJsonValue) : Prisma.DbNull,
      formId: d.formId ?? null, campaignId: d.chienDichId ?? null, updatedBy: nc.hoSo.userId,
    },
    select: CHON,
  });
  await nc.kiemToan({ action: "sua", objectType: "landing_page", objectId: id, before: { slug: truoc.slug, ten: truoc.ten, soKhoi: truoc.khoi?.length ?? 0, coAB: truoc.coAB }, after: { slug, ten: d.ten, soKhoi: khoi.length, coAB: Boolean(khoiB) } });
  await nc.suKien({ eventType: SU_KIEN.LANDING_PAGE_SAVED, objectType: "landing_page", objectId: id, payload: { slug } });
  return chuyenDoi(p);
}

export async function doiTrangThaiLanding(nc: NguCanh, id: string, trangThai: "nhap" | "xuat-ban" | "an") {
  const truoc = await docDuocSua(nc, id);
  if (trangThai === "xuat-ban") {
    if (!truoc.khoi || (truoc.coAB && !truoc.khoiB)) throw new LoiNghiepVu("Nội dung trang không hợp lệ, mở trang sửa và lưu lại trước khi xuất bản.", 409, "khoi-hong");
    if (truoc.form && truoc.form.trangThai !== "hoat-dong") throw new LoiNghiepVu("Form gắn với trang đang tắt — bật form trước khi xuất bản.", 409, "form-tat");
  }
  await nc.tx.landingPage.update({
    where: { id },
    data: { status: trangThai, ...(trangThai === "xuat-ban" && !truoc.xuatBanLuc && { publishedAt: new Date() }), updatedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "doi-giai-doan", objectType: "landing_page", objectId: id, before: { trangThai: truoc.trangThai }, after: { trangThai } });
  await nc.suKien({ eventType: SU_KIEN.LANDING_PAGE_STATUS_CHANGED, objectType: "landing_page", objectId: id, payload: { tu: truoc.trangThai, den: trangThai } });
  return { id, trangThai };
}

// ---------------------------------------------------------------------------
// Công khai
// ---------------------------------------------------------------------------

/**
 * Đọc trang đang xuất bản để dựng. Có A/B thì `bienThe` quyết định (khách gửi `?v=b`
 * hoặc trang chọn ngẫu nhiên). Đếm lượt xem cho đúng biến thể.
 */
export async function docLandingCongKhai(tx: ClientTenant, slug: string, bienThe: "A" | "B", tangLuotXem = true) {
  if (!laSlugHopLe(slug)) return null;
  const p = await tx.landingPage.findFirst({
    where: { slug, status: "xuat-ban" },
    select: { id: true, title: true, description: true, blocks: true, blocksB: true, form: { select: { slug: true, status: true } } },
  });
  if (!p) return null;
  const dungB = bienThe === "B" && p.blocksB !== null;
  const khoi = docKhoi(dungB ? p.blocksB : p.blocks);
  if (!khoi) return null;
  if (tangLuotXem) await tx.landingPage.update({ where: { id: p.id }, data: dungB ? { viewsB: { increment: 1 } } : { viewsA: { increment: 1 } } });
  return {
    id: p.id,
    tieuDe: p.title,
    moTa: p.description,
    khoi,
    bienThe: (dungB ? "B" : "A") as "A" | "B",
    formSlug: p.form && p.form.status === "hoat-dong" ? p.form.slug : null,
  };
}

/** Trang (đã xuất bản) có thật sự dùng form này không — để gắn lượt gửi vào landing. */
export async function landingDungForm(tx: ClientTenant, landingId: string, formId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(landingId)) return false;
  return Boolean(await tx.landingPage.findFirst({ where: { id: landingId, formId, status: "xuat-ban" }, select: { id: true } }));
}
