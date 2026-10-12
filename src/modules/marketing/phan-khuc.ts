import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { trongPhamVi } from "@/modules/crm/chung";
import { cheLienLac, locMarketing } from "./chung";
import { LuocDoPhanKhuc, type DieuKienLead, type DieuKienLienHe, type PhanKhucDieuKien } from "./luoc-do";

/**
 * Phân khúc lead / liên hệ theo điều kiện. Luật MK-14 (BUSINESS_RULES.md mục 21).
 *
 * Điều kiện lưu JSON nhưng chỉ gồm các trường trong danh mục (Zod `.strict()`), và mỗi
 * trường được dịch sang điều kiện Prisma bằng mã — không ghép chuỗi người dùng vào SQL,
 * không có "biểu thức tự do".
 *
 * Đếm trên toàn doanh nghiệp: phân khúc là tệp người nhận của Marketing (vai trò Marketing có
 * phạm vi "toàn công ty"). Thông tin liên lạc vẫn che theo MK-15 khi trả về giao diện.
 */

function khoangNgayTao(tu: string, den: string) {
  if (!tu && !den) return undefined;
  return {
    ...(tu && { gte: new Date(`${tu}T00:00:00+07:00`) }),
    ...(den && { lt: new Date(new Date(`${den}T00:00:00+07:00`).getTime() + 86_400_000) }),
  };
}

const CO_THE_NHAN = { marketingOptIn: true, marketingOptOutAt: null } as const;

export function dieuKienLead(dk: DieuKienLead): Prisma.LeadWhereInput {
  const and: Prisma.LeadWhereInput[] = [];
  if (dk.nguon.length) and.push({ source: { in: dk.nguon } });
  if (dk.chienDichIds.length) and.push({ campaignId: { in: dk.chienDichIds } });
  if (dk.giaiDoan.length) and.push({ stage: { in: dk.giaiDoan } });
  if (dk.kenhNhan.length) and.push({ captureChannel: { in: dk.kenhNhan } });
  if (dk.utmSource) and.push({ utmSource: { equals: dk.utmSource, mode: "insensitive" } });
  const ngay = khoangNgayTao(dk.taoTuNgay, dk.taoDenNgay);
  if (ngay) and.push({ createdAt: ngay });
  if (dk.coEmail === "co") and.push({ emailNormalized: { not: null } });
  if (dk.coEmail === "khong") and.push({ emailNormalized: null });
  if (dk.coDienThoai === "co") and.push({ phoneNormalized: { not: null } });
  if (dk.coDienThoai === "khong") and.push({ phoneNormalized: null });
  if (dk.dongYNhanTin === "co") and.push(CO_THE_NHAN);
  if (dk.dongYNhanTin === "khong") and.push({ marketingOptIn: false });
  return { AND: and };
}

export function dieuKienLienHe(dk: DieuKienLienHe): Prisma.ContactWhereInput {
  const khach: Prisma.CustomerWhereInput[] = [];
  if (dk.nguon.length) khach.push({ source: { in: dk.nguon } });
  if (dk.chienDichIds.length) khach.push({ campaignId: { in: dk.chienDichIds } });
  if (dk.phanKhuc.length) khach.push({ segment: { in: dk.phanKhuc } });
  if (dk.nganh.length) khach.push({ industry: { in: dk.nganh } });
  if (dk.loaiKhach.length) khach.push({ customerType: { in: dk.loaiKhach } });
  if (dk.trangThaiKhach.length) khach.push({ status: { in: dk.trangThaiKhach } });
  if (dk.tinhThanh.length) khach.push({ OR: dk.tinhThanh.map((t) => ({ province: { equals: t, mode: "insensitive" as const } })) });
  const and: Prisma.ContactWhereInput[] = [{ status: "hoat-dong" }];
  if (khach.length) and.push({ customer: { AND: khach } });
  if (dk.coEmail === "co") and.push({ emailNormalized: { not: null } });
  if (dk.coEmail === "khong") and.push({ emailNormalized: null });
  if (dk.coDienThoai === "co") and.push({ phoneNormalized: { not: null } });
  if (dk.coDienThoai === "khong") and.push({ phoneNormalized: null });
  if (dk.dongYNhanTin === "co") and.push(CO_THE_NHAN);
  if (dk.dongYNhanTin === "khong") and.push({ marketingOptIn: false });
  return { AND: and };
}

export interface NguoiTrongPhanKhuc {
  doiTuong: "lead" | "lien-he";
  id: string;
  hoTen: string;
  congTy: string | null;
  dienThoai: string | null;
  email: string | null;
  /** Khách hàng của liên hệ (null với lead). */
  khachHangId: string | null;
  dongYNhanTin: boolean;
  tuChoiNhanTin: boolean;
}

async function timNguoi(nc: NguCanh, pk: PhanKhucDieuKien, them: { chiNguoiNhanDuoc: boolean; gioiHan: number; boQua?: number }): Promise<NguoiTrongPhanKhuc[]> {
  if (pk.doiTuong === "lead") {
    const where: Prisma.LeadWhereInput = { AND: [dieuKienLead(pk.dieuKien), ...(them.chiNguoiNhanDuoc ? [CO_THE_NHAN] : [])] };
    const ds = await nc.tx.lead.findMany({
      where,
      select: { id: true, fullName: true, companyName: true, phone: true, email: true, marketingOptIn: true, marketingOptOutAt: true },
      orderBy: { createdAt: "desc" },
      take: them.gioiHan,
      skip: them.boQua ?? 0,
    });
    return ds.map((l) => ({ doiTuong: "lead", id: l.id, hoTen: l.fullName, congTy: l.companyName, dienThoai: l.phone, email: l.email, khachHangId: null, dongYNhanTin: l.marketingOptIn, tuChoiNhanTin: l.marketingOptOutAt !== null }));
  }
  const where: Prisma.ContactWhereInput = { AND: [dieuKienLienHe(pk.dieuKien), ...(them.chiNguoiNhanDuoc ? [CO_THE_NHAN] : [])] };
  const ds = await nc.tx.contact.findMany({
    where,
    select: { id: true, fullName: true, phone: true, email: true, marketingOptIn: true, marketingOptOutAt: true, customer: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
    take: them.gioiHan,
    skip: them.boQua ?? 0,
  });
  return ds.map((c) => ({ doiTuong: "lien-he", id: c.id, hoTen: c.fullName, congTy: c.customer.name, dienThoai: c.phone, email: c.email, khachHangId: c.customer.id, dongYNhanTin: c.marketingOptIn, tuChoiNhanTin: c.marketingOptOutAt !== null }));
}

async function demPhanKhuc(nc: NguCanh, pk: PhanKhucDieuKien) {
  if (pk.doiTuong === "lead") {
    const goc = dieuKienLead(pk.dieuKien);
    const [tong, nhanDuoc, tuChoi, coEmail] = await Promise.all([
      nc.tx.lead.count({ where: goc }),
      nc.tx.lead.count({ where: { AND: [goc, CO_THE_NHAN] } }),
      nc.tx.lead.count({ where: { AND: [goc, { marketingOptOutAt: { not: null } }] } }),
      nc.tx.lead.count({ where: { AND: [goc, CO_THE_NHAN, { emailNormalized: { not: null } }] } }),
    ]);
    return { tong, nhanDuoc, tuChoi, nhanDuocCoEmail: coEmail };
  }
  const goc = dieuKienLienHe(pk.dieuKien);
  const [tong, nhanDuoc, tuChoi, coEmail] = await Promise.all([
    nc.tx.contact.count({ where: goc }),
    nc.tx.contact.count({ where: { AND: [goc, CO_THE_NHAN] } }),
    nc.tx.contact.count({ where: { AND: [goc, { marketingOptOutAt: { not: null } }] } }),
    nc.tx.contact.count({ where: { AND: [goc, CO_THE_NHAN, { emailNormalized: { not: null } }] } }),
  ]);
  return { tong, nhanDuoc, tuChoi, nhanDuocCoEmail: coEmail };
}

/** Xem trước: số lượng + 20 dòng mẫu (đã che theo MK-15). Không lưu gì. */
export async function xemTruocPhanKhuc(nc: NguCanh, pk: PhanKhucDieuKien) {
  batBuocQuyen(nc.hoSo, "marketing.view");
  const kiem = LuocDoPhanKhuc.parse(pk);
  const [dem, mau] = await Promise.all([demPhanKhuc(nc, kiem), timNguoi(nc, kiem, { chiNguoiNhanDuoc: false, gioiHan: 20 })]);
  return { ...dem, mau: mau.map((m) => cheLienLac(nc.hoSo, kiem.doiTuong, m)) };
}

// ---------------------------------------------------------------------------
// Lưu / đọc phân khúc
// ---------------------------------------------------------------------------

const CHON = {
  id: true, name: true, target: true, conditions: true, note: true, status: true, ownerId: true, createdAt: true, updatedAt: true,
  owner: { select: { id: true, fullName: true } },
} satisfies Prisma.MarketingSegmentSelect;
type BanGhi = Prisma.MarketingSegmentGetPayload<{ select: typeof CHON }>;

function chuyenDoi(s: BanGhi) {
  // Điều kiện đã lưu được kiểm lại mỗi lần đọc: sửa tay trong CSDL thành sai lược đồ thì báo, không chạy bừa.
  const p = LuocDoPhanKhuc.safeParse({ doiTuong: s.target, dieuKien: s.conditions });
  return {
    id: s.id,
    ten: s.name,
    doiTuong: s.target as "lead" | "lien-he",
    phanKhuc: p.success ? p.data : null,
    ghiChu: s.note,
    trangThai: s.status,
    taoLuc: s.createdAt,
    suaLuc: s.updatedAt,
    nguoiPhuTrach: { id: s.owner.id, hoTen: s.owner.fullName },
  };
}

async function docTrongPhamVi(nc: NguCanh, id: string) {
  const s = await nc.tx.marketingSegment.findFirst({ where: { id, ...(await locMarketing(nc)) }, select: CHON });
  if (!s) throw new LoiKhongTimThay("Phân khúc");
  return chuyenDoi(s);
}

export async function danhSachPhanKhuc(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "marketing.view");
  const ds = await nc.tx.marketingSegment.findMany({ where: { status: "hoat-dong", ...(await locMarketing(nc)) }, select: CHON, orderBy: { createdAt: "desc" } });
  return Promise.all(
    ds.map(async (s) => {
      const pk = chuyenDoi(s);
      return { ...pk, dem: pk.phanKhuc ? await demPhanKhuc(nc, pk.phanKhuc) : null };
    }),
  );
}

export async function chiTietPhanKhuc(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "marketing.view", { objectType: "marketing_segment", objectId: id });
  const pk = await docTrongPhamVi(nc, id);
  return {
    phanKhuc: pk,
    xemTruoc: pk.phanKhuc ? await xemTruocPhanKhuc(nc, pk.phanKhuc) : null,
    duocSua: coQuyen(nc.hoSo, "marketing.update") && (await trongPhamVi(nc, "marketing.update", pk.nguoiPhuTrach.id)),
  };
}

export async function luuPhanKhuc(nc: NguCanh, id: string | null, d: { ten: string; ghiChu?: string | null; phanKhuc: PhanKhucDieuKien }) {
  const pk = LuocDoPhanKhuc.parse(d.phanKhuc);
  if (!id) {
    batBuocQuyen(nc.hoSo, "marketing.create", { objectType: "marketing_segment" });
    const s = await nc.tx.marketingSegment.create({
      data: { tenantId: nc.tenantId, name: d.ten, target: pk.doiTuong, conditions: pk.dieuKien as Prisma.InputJsonValue, note: d.ghiChu ?? null, ownerId: nc.hoSo.userId, createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId },
      select: CHON,
    });
    await nc.kiemToan({ action: "tao", objectType: "marketing_segment", objectId: s.id, after: { ten: d.ten, doiTuong: pk.doiTuong, dieuKien: pk.dieuKien } });
    await nc.suKien({ eventType: SU_KIEN.SEGMENT_SAVED, objectType: "marketing_segment", objectId: s.id, payload: { doiTuong: pk.doiTuong } });
    return chuyenDoi(s);
  }
  batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "marketing_segment", objectId: id });
  const truoc = await docTrongPhamVi(nc, id);
  if (!(await trongPhamVi(nc, "marketing.update", truoc.nguoiPhuTrach.id))) throw new LoiNghiepVu("Phân khúc ngoài phạm vi phụ trách của bạn.", 403, "ngoai-pham-vi");
  const s = await nc.tx.marketingSegment.update({
    where: { id },
    data: { name: d.ten, target: pk.doiTuong, conditions: pk.dieuKien as Prisma.InputJsonValue, note: d.ghiChu ?? null, updatedBy: nc.hoSo.userId },
    select: CHON,
  });
  await nc.kiemToan({ action: "sua", objectType: "marketing_segment", objectId: id, before: { ten: truoc.ten, phanKhuc: truoc.phanKhuc }, after: { ten: d.ten, phanKhuc: pk } });
  await nc.suKien({ eventType: SU_KIEN.SEGMENT_SAVED, objectType: "marketing_segment", objectId: id, payload: { doiTuong: pk.doiTuong } });
  return chuyenDoi(s);
}

export async function luuTruPhanKhuc(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "marketing_segment", objectId: id });
  const truoc = await docTrongPhamVi(nc, id);
  if (!(await trongPhamVi(nc, "marketing.update", truoc.nguoiPhuTrach.id))) throw new LoiNghiepVu("Phân khúc ngoài phạm vi phụ trách của bạn.", 403, "ngoai-pham-vi");
  await nc.tx.marketingSegment.update({ where: { id }, data: { status: "luu-tru", updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "marketing_segment", objectId: id, before: { trangThai: truoc.trangThai }, after: { trangThai: "luu-tru" } });
  return { id, trangThai: "luu-tru" };
}

// ---------------------------------------------------------------------------
// Cửa cho gói Email marketing
// ---------------------------------------------------------------------------

export interface TuyChonDanhSach {
  /** Mặc định true: chỉ người ĐÃ đồng ý và CHƯA từ chối nhận tin (MK-13, MK-14). */
  chiNguoiNhanDuoc?: boolean;
  /**
   * true: trả SĐT/email THẬT để máy chủ gửi tin — cần `marketing.update`, và kết quả KHÔNG
   * được trả thẳng về trình duyệt. Mặc định false: che theo MK-15 như mọi màn hình.
   */
  boCheDeGui?: boolean;
  gioiHan?: number;
  boQua?: number;
}

/**
 * Danh sách người trong một phân khúc đã lưu — gói E (email marketing) gọi hàm này để gửi.
 * Kiểm `marketing.view` + phạm vi phân khúc. Phân khúc lưu trữ hoặc điều kiện hỏng → lỗi.
 */
export async function danhSachTheoPhanKhuc(nc: NguCanh, phanKhucId: string, tuyChon: TuyChonDanhSach = {}): Promise<NguoiTrongPhanKhuc[]> {
  batBuocQuyen(nc.hoSo, "marketing.view", { objectType: "marketing_segment", objectId: phanKhucId });
  if (tuyChon.boCheDeGui) batBuocQuyen(nc.hoSo, "marketing.update", { objectType: "marketing_segment", objectId: phanKhucId });
  const pk = await docTrongPhamVi(nc, phanKhucId);
  if (pk.trangThai !== "hoat-dong") throw new LoiNghiepVu("Phân khúc đã lưu trữ.", 409, "da-luu-tru");
  if (!pk.phanKhuc) throw new LoiNghiepVu("Điều kiện phân khúc không còn hợp lệ. Mở phân khúc và lưu lại.", 409, "dieu-kien-hong");
  const ds = await timNguoi(nc, pk.phanKhuc, {
    chiNguoiNhanDuoc: tuyChon.chiNguoiNhanDuoc ?? true,
    gioiHan: Math.min(Math.max(tuyChon.gioiHan ?? 50_000, 1), 50_000),
    boQua: tuyChon.boQua,
  });
  if (tuyChon.boCheDeGui) return ds;
  return ds.map((d) => {
    const { daChe: _, ...con } = cheLienLac(nc.hoSo, pk.doiTuong, d);
    void _;
    return con;
  });
}
