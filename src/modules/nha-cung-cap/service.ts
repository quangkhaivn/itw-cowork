import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, KIEU_SO } from "@/lib/so-chung-tu";
import { chuanHoaDienThoai, chuanHoaEmail, chuanHoaMaSoThue, chuanHoaTen } from "@/modules/crm/chuan-hoa";
import { chuoiTuyChon, kiemTraMaDuLieuGoc } from "@/modules/crm/chung";

/**
 * Nhà cung cấp. Quyền `supplier.*`, không có phạm vi theo người phụ trách — cả công ty
 * dùng chung một danh sách nguồn hàng. Chống trùng theo mã số thuế (như khách hàng).
 */

const emailTuyChon = z
  .union([z.email("Email không hợp lệ.").max(255), z.literal(""), z.null()])
  .transform((s) => (s ? s.trim() : null))
  .optional();

const truong = {
  ten: z.string().trim().min(2, "Tên nhà cung cấp tối thiểu 2 ký tự.").max(255),
  maSoThue: chuoiTuyChon(30),
  nguoiLienHe: chuoiTuyChon(255),
  dienThoai: chuoiTuyChon(30),
  email: emailTuyChon,
  diaChi: chuoiTuyChon(1000),
  website: chuoiTuyChon(255),
  dieuKhoanThanhToan: chuoiTuyChon(50),
  soNgayGiao: z.union([z.coerce.number().int().min(0).max(365), z.literal("" as const), z.null()]).transform((v) => (v === "" || v === null ? null : v)).optional(),
  ghiChu: chuoiTuyChon(5000),
};

export const LuocDoTaoNhaCungCap = z.object(truong);
export const LuocDoSuaNhaCungCap = z.object({ ...truong, ten: truong.ten.optional(), trangThai: z.enum(["hoat-dong", "ngung-hoat-dong"]).optional() });
export const LuocDoLocNhaCungCap = z.object({
  q: z.string().trim().max(100).optional().default(""),
  trangThai: z.enum(["", "hoat-dong", "ngung-hoat-dong"]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});

const CHON = {
  id: true, code: true, name: true, taxCode: true, contactName: true, phone: true, email: true,
  address: true, website: true, paymentTerms: true, leadTimeDays: true, note: true, status: true,
  createdAt: true, updatedAt: true,
} satisfies Prisma.SupplierSelect;

function chuyenDoi(n: Prisma.SupplierGetPayload<{ select: typeof CHON }>) {
  return {
    id: n.id, ma: n.code, ten: n.name, maSoThue: n.taxCode, nguoiLienHe: n.contactName,
    dienThoai: n.phone, email: n.email, diaChi: n.address, website: n.website,
    dieuKhoanThanhToan: n.paymentTerms, soNgayGiao: n.leadTimeDays, ghiChu: n.note,
    trangThai: n.status, taoLuc: n.createdAt, suaLuc: n.updatedAt,
  };
}
export type NhaCungCapChiTiet = ReturnType<typeof chuyenDoi>;

export async function danhSachNhaCungCap(nc: NguCanh, boLoc: z.infer<typeof LuocDoLocNhaCungCap>) {
  batBuocQuyen(nc.hoSo, "supplier.view");
  const dieuKien: Prisma.SupplierWhereInput[] = [];
  if (boLoc.q) {
    const so = boLoc.q.replace(/\D/g, "");
    dieuKien.push({
      OR: [
        { name: { contains: boLoc.q, mode: "insensitive" } },
        { nameNormalized: { contains: chuanHoaTen(boLoc.q) } },
        { code: { contains: boLoc.q, mode: "insensitive" } },
        { contactName: { contains: boLoc.q, mode: "insensitive" } },
        ...(so.length >= 4 ? [{ taxCodeNormalized: { contains: so } }, { phoneNormalized: { contains: so } }] : []),
      ],
    });
  }
  if (boLoc.trangThai) dieuKien.push({ status: boLoc.trangThai });
  const where: Prisma.SupplierWhereInput = { AND: dieuKien };
  const [tong, dong] = await Promise.all([
    nc.tx.supplier.count({ where }),
    nc.tx.supplier.findMany({
      where,
      select: { ...CHON, _count: { select: { prices: true } } },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
    }),
  ]);
  return { tong, trang: boLoc.trang, coTrang: boLoc.coTrang, dong: dong.map((n) => ({ ...chuyenDoi(n), soMatHang: n._count.prices })) };
}

export async function chiTietNhaCungCap(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "supplier.view", { objectType: "supplier", objectId: id });
  const n = await nc.tx.supplier.findFirst({ where: { id }, select: CHON });
  if (!n) throw new LoiKhongTimThay("Nhà cung cấp");
  const [matHang, doiGiaGanDay] = await Promise.all([
    nc.tx.supplierProductPrice.findMany({
      where: { supplierId: id },
      select: {
        id: true, purchasePrice: true, availability: true, leadTimeDays: true, updatedAt: true,
        product: { select: { id: true, sku: true, name: true, status: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    nc.tx.priceHistory.findMany({
      where: { supplierId: id },
      select: { id: true, oldPrice: true, newPrice: true, changedAt: true, source: true, product: { select: { id: true, sku: true, name: true } } },
      orderBy: { changedAt: "desc" },
      take: 30,
    }),
  ]);
  return {
    nhaCungCap: chuyenDoi(n),
    matHang: matHang.map((m) => ({
      id: m.id,
      giaMua: m.purchasePrice.toString(),
      tinhTrang: m.availability,
      soNgayGiao: m.leadTimeDays,
      capNhatLuc: m.updatedAt,
      sanPham: m.product,
    })),
    doiGiaGanDay: doiGiaGanDay.map((h) => ({
      id: h.id,
      giaCu: h.oldPrice?.toString() ?? null,
      giaMoi: h.newPrice?.toString() ?? null,
      luc: h.changedAt,
      nguon: h.source,
      sanPham: h.product,
    })),
    quyen: { sua: coQuyen(nc.hoSo, "supplier.update"), xemGia: coQuyen(nc.hoSo, "product.view") },
  };
}

function khoa(d: { ten?: string | null; maSoThue?: string | null; dienThoai?: string | null; email?: string | null }) {
  return {
    tenChuan: d.ten ? chuanHoaTen(d.ten) : null,
    maSoThue: chuanHoaMaSoThue(d.maSoThue),
    dienThoai: chuanHoaDienThoai(d.dienThoai),
    email: chuanHoaEmail(d.email),
  };
}

export async function taoNhaCungCap(nc: NguCanh, d: z.infer<typeof LuocDoTaoNhaCungCap>) {
  batBuocQuyen(nc.hoSo, "supplier.create", { objectType: "supplier" });
  const k = khoa(d);
  await kiemTraMaDuLieuGoc(nc, "dieu_khoan_thanh_toan", d.dieuKhoanThanhToan, "dieuKhoanThanhToan");
  if (k.maSoThue) {
    const trung = await nc.tx.supplier.findFirst({ where: { taxCodeNormalized: k.maSoThue }, select: { code: true, name: true } });
    if (trung) throw new LoiNghiepVu(`Mã số thuế đã thuộc nhà cung cấp ${trung.code} — ${trung.name}.`, 409, "trung-ma-so-thue");
  }
  const ma = await capSoChungTu(nc.tx, KIEU_SO.nhaCungCap);
  try {
    const n = await nc.tx.supplier.create({
      data: {
        tenantId: nc.tenantId,
        code: ma,
        name: d.ten,
        nameNormalized: k.tenChuan ?? chuanHoaTen(d.ten),
        taxCode: d.maSoThue ?? null,
        taxCodeNormalized: k.maSoThue,
        contactName: d.nguoiLienHe ?? null,
        phone: d.dienThoai ?? null,
        phoneNormalized: k.dienThoai,
        email: d.email ?? null,
        emailNormalized: k.email,
        address: d.diaChi ?? null,
        website: d.website ?? null,
        paymentTerms: d.dieuKhoanThanhToan ?? null,
        leadTimeDays: d.soNgayGiao ?? null,
        note: d.ghiChu ?? null,
        createdBy: nc.hoSo.userId,
        updatedBy: nc.hoSo.userId,
      },
      select: CHON,
    });
    const kq = chuyenDoi(n);
    await nc.kiemToan({ action: "tao", objectType: "supplier", objectId: n.id, after: kq });
    await nc.suKien({ eventType: SU_KIEN.SUPPLIER_CREATED, objectType: "supplier", objectId: n.id, payload: { ma } });
    return kq;
  } catch (loi) {
    if (laLoiTrung(loi)) throw new LoiNghiepVu("Mã số thuế hoặc mã nhà cung cấp đã tồn tại.", 409, "trung");
    throw loi;
  }
}

export async function suaNhaCungCap(nc: NguCanh, id: string, d: z.infer<typeof LuocDoSuaNhaCungCap>) {
  batBuocQuyen(nc.hoSo, "supplier.update", { objectType: "supplier", objectId: id });
  const goc = await nc.tx.supplier.findFirst({ where: { id }, select: CHON });
  if (!goc) throw new LoiKhongTimThay("Nhà cung cấp");
  const truoc = chuyenDoi(goc);
  const doiMst = d.maSoThue !== undefined && d.maSoThue !== truoc.maSoThue;
  const k = khoa({ ten: d.ten, maSoThue: doiMst ? d.maSoThue : null, dienThoai: d.dienThoai, email: d.email });
  await kiemTraMaDuLieuGoc(nc, "dieu_khoan_thanh_toan", d.dieuKhoanThanhToan, "dieuKhoanThanhToan", truoc.dieuKhoanThanhToan);
  if (doiMst && k.maSoThue) {
    const trung = await nc.tx.supplier.findFirst({ where: { taxCodeNormalized: k.maSoThue, NOT: { id } }, select: { code: true, name: true } });
    if (trung) throw new LoiNghiepVu(`Mã số thuế đã thuộc nhà cung cấp ${trung.code} — ${trung.name}.`, 409, "trung-ma-so-thue");
  }
  if (d.trangThai === "ngung-hoat-dong" && truoc.trangThai !== "ngung-hoat-dong") {
    const soGia = await nc.tx.supplierProductPrice.count({ where: { supplierId: id, status: "hoat-dong" } });
    if (soGia) {
      throw new LoiNghiepVu(
        `Nhà cung cấp còn ${soGia} dòng giá đang dùng. Ngừng nhà cung cấp sẽ để lại giá cũ trong bảng giá — hãy gỡ hoặc đánh dấu hết hàng trước.`,
        409,
      );
    }
  }
  const sau = chuyenDoi(
    await nc.tx.supplier.update({
      where: { id },
      data: {
        ...(d.ten !== undefined && { name: d.ten, nameNormalized: chuanHoaTen(d.ten) }),
        ...(doiMst && { taxCode: d.maSoThue ?? null, taxCodeNormalized: k.maSoThue }),
        ...(d.nguoiLienHe !== undefined && { contactName: d.nguoiLienHe }),
        ...(d.dienThoai !== undefined && { phone: d.dienThoai, phoneNormalized: chuanHoaDienThoai(d.dienThoai) }),
        ...(d.email !== undefined && { email: d.email, emailNormalized: chuanHoaEmail(d.email) }),
        ...(d.diaChi !== undefined && { address: d.diaChi }),
        ...(d.website !== undefined && { website: d.website }),
        ...(d.dieuKhoanThanhToan !== undefined && { paymentTerms: d.dieuKhoanThanhToan }),
        ...(d.soNgayGiao !== undefined && { leadTimeDays: d.soNgayGiao }),
        ...(d.ghiChu !== undefined && { note: d.ghiChu }),
        ...(d.trangThai !== undefined && { status: d.trangThai }),
        updatedBy: nc.hoSo.userId,
      },
      select: CHON,
    }),
  );
  await nc.kiemToan({ action: "sua", objectType: "supplier", objectId: id, before: truoc, after: sau });
  await nc.suKien({ eventType: SU_KIEN.SUPPLIER_UPDATED, objectType: "supplier", objectId: id });
  return sau;
}

/** Danh sách gọn cho ô chọn nhà cung cấp trên form bảng giá. */
export async function luaChonNhaCungCap(nc: NguCanh) {
  if (!coQuyen(nc.hoSo, "supplier.view") && !coQuyen(nc.hoSo, "product.view")) batBuocQuyen(nc.hoSo, "supplier.view");
  const ds = await nc.tx.supplier.findMany({ where: { status: "hoat-dong" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } });
  return ds.map((n) => ({ id: n.id, ma: n.code, ten: n.name }));
}
