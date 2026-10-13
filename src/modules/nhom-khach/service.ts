import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { locTheoPhamVi } from "@/modules/crm/chung";
import type { DuLieuNhomKhach } from "./luoc-do";
import type { LuocDoSuaNhomKhach } from "./luoc-do";
import type { z } from "zod";

/**
 * Nhóm khách hàng — nhiều–nhiều (BUSINESS_RULES.md mục 21, KHN-05).
 *
 * Danh mục nhóm là tài sản chung: tạo/sửa/ngừng cần `customer.approve`. Gắn hay gỡ một
 * khách khỏi nhóm là sửa khách đó: cần `customer.update` và khách nằm trong phạm vi.
 */

function nhomRa(g: { id: string; name: string; color: string; description: string | null; sortOrder: number; status: string }) {
  return { id: g.id, ten: g.name, mau: g.color, moTa: g.description, thuTu: g.sortOrder, trangThai: g.status };
}

/** Danh sách nhóm + số khách TRONG PHẠM VI người xem (không lộ số khách ngoài phạm vi). */
export async function danhSachNhomKhach(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "customer.view");
  const phamVi = await locTheoPhamVi(nc, "customer.view");
  const ds = await nc.tx.customerGroup.findMany({
    select: {
      id: true, name: true, color: true, description: true, sortOrder: true, status: true,
      _count: { select: { members: { where: { customer: { ...phamVi, status: { not: "da-gop" } } } } } },
    },
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return { nhom: ds.map((g) => ({ ...nhomRa(g), soKhach: g._count.members })), quanLy: coQuyen(nc.hoSo, "customer.approve") };
}

function loiTrungTen(loi: unknown, ten: string): never {
  if (laLoiTrung(loi)) throw new LoiNghiepVu(`Nhóm "${ten}" đã có.`, 409, "trung-ten");
  throw loi;
}

export async function taoNhomKhach(nc: NguCanh, d: DuLieuNhomKhach) {
  batBuocQuyen(nc.hoSo, "customer.approve", { objectType: "customer_group" });
  const cuoi = await nc.tx.customerGroup.aggregate({ _max: { sortOrder: true } });
  try {
    const g = await nc.tx.customerGroup.create({
      data: {
        tenantId: nc.tenantId,
        name: d.ten,
        color: d.mau,
        description: d.moTa ?? null,
        sortOrder: (cuoi._max.sortOrder ?? 0) + 1,
        createdBy: nc.hoSo.userId,
        updatedBy: nc.hoSo.userId,
      },
    });
    const kq = nhomRa(g);
    await nc.kiemToan({ action: "tao", objectType: "customer_group", objectId: g.id, after: kq });
    await nc.suKien({ eventType: SU_KIEN.CUSTOMER_GROUP_CHANGED, objectType: "customer_group", objectId: g.id, payload: { viec: "tao" } });
    return kq;
  } catch (loi) {
    loiTrungTen(loi, d.ten);
  }
}

export async function suaNhomKhach(nc: NguCanh, id: string, d: z.infer<typeof LuocDoSuaNhomKhach>) {
  batBuocQuyen(nc.hoSo, "customer.approve", { objectType: "customer_group", objectId: id });
  const goc = await nc.tx.customerGroup.findFirst({ where: { id } });
  if (!goc) throw new LoiKhongTimThay("Nhóm khách hàng");
  try {
    const g = await nc.tx.customerGroup.update({
      where: { id },
      data: {
        ...(d.ten !== undefined && { name: d.ten }),
        ...(d.mau !== undefined && { color: d.mau }),
        ...(d.moTa !== undefined && { description: d.moTa }),
        ...(d.trangThai !== undefined && { status: d.trangThai }),
        updatedBy: nc.hoSo.userId,
      },
    });
    const sau = nhomRa(g);
    await nc.kiemToan({ action: "sua", objectType: "customer_group", objectId: id, before: nhomRa(goc), after: sau });
    await nc.suKien({ eventType: SU_KIEN.CUSTOMER_GROUP_CHANGED, objectType: "customer_group", objectId: id, payload: { viec: "sua" } });
    return sau;
  } catch (loi) {
    loiTrungTen(loi, d.ten ?? goc.name);
  }
}

/** Kiểm các khách đều nằm trong phạm vi sửa của người thao tác; thiếu một → từ chối cả lô. */
async function khachSuaDuoc(nc: NguCanh, khachIds: string[]) {
  batBuocQuyen(nc.hoSo, "customer.update", { objectType: "customer" });
  const ds = await nc.tx.customer.findMany({
    where: { id: { in: khachIds }, ...(await locTheoPhamVi(nc, "customer.update")) },
    select: { id: true, code: true, status: true },
  });
  if (ds.length !== new Set(khachIds).size) {
    throw new LoiNghiepVu("Có khách không tồn tại hoặc nằm ngoài phạm vi bạn được sửa — không thao tác lô này.", 403, "ngoai-pham-vi");
  }
  const daGop = ds.find((k) => k.status === "da-gop");
  if (daGop) throw new LoiNghiepVu(`Khách ${daGop.code} đã được gộp — không gắn nhóm được (KHN-13).`, 409, "da-gop");
  return ds;
}

async function docNhomDangDung(nc: NguCanh, nhomId: string) {
  const g = await nc.tx.customerGroup.findFirst({ where: { id: nhomId }, select: { id: true, name: true, status: true } });
  if (!g) throw new LoiKhongTimThay("Nhóm khách hàng");
  return g;
}

/** Gắn nhiều khách vào một nhóm. Trả số khách mới được gắn. */
export async function ganKhachVaoNhom(nc: NguCanh, nhomId: string, khachIds: string[]) {
  const g = await docNhomDangDung(nc, nhomId);
  if (g.status !== "hoat-dong") throw new LoiNghiepVu(`Nhóm "${g.name}" đã ngừng dùng.`, 422, "nhom-ngung");
  await khachSuaDuoc(nc, khachIds);
  const daCo = new Set((await nc.tx.customerGroupMember.findMany({ where: { groupId: nhomId, customerId: { in: khachIds } }, select: { customerId: true } })).map((m) => m.customerId));
  const moi = [...new Set(khachIds)].filter((id) => !daCo.has(id));
  if (moi.length) {
    await nc.tx.customerGroupMember.createMany({
      data: moi.map((customerId) => ({ tenantId: nc.tenantId, groupId: nhomId, customerId, createdBy: nc.hoSo.userId })),
    });
    await nc.kiemToan({ action: "gan-nhom", objectType: "customer_group", objectId: nhomId, after: { khach: moi } });
    await nc.suKien({ eventType: SU_KIEN.CUSTOMER_GROUP_CHANGED, objectType: "customer_group", objectId: nhomId, payload: { viec: "gan", soKhach: moi.length } });
  }
  return moi.length;
}

export async function boKhachKhoiNhom(nc: NguCanh, nhomId: string, khachIds: string[]) {
  await docNhomDangDung(nc, nhomId);
  await khachSuaDuoc(nc, khachIds);
  const xoa = await nc.tx.customerGroupMember.deleteMany({ where: { groupId: nhomId, customerId: { in: khachIds } } });
  if (xoa.count) {
    await nc.kiemToan({ action: "bo-nhom", objectType: "customer_group", objectId: nhomId, after: { khach: khachIds, soGo: xoa.count } });
    await nc.suKien({ eventType: SU_KIEN.CUSTOMER_GROUP_CHANGED, objectType: "customer_group", objectId: nhomId, payload: { viec: "bo", soKhach: xoa.count } });
  }
  return xoa.count;
}

/** Nhóm của một khách — người gọi đã kiểm khách trong phạm vi xem. */
export async function nhomCuaKhach(nc: NguCanh, khachId: string) {
  const ds = await nc.tx.customerGroupMember.findMany({
    where: { customerId: khachId },
    select: { group: { select: { id: true, name: true, color: true, description: true, sortOrder: true, status: true } } },
  });
  return ds.map((m) => nhomRa(m.group)).sort((a, b) => a.thuTu - b.thuTu);
}

/** Đặt lại toàn bộ nhóm của một khách: gắn nhóm thiếu, gỡ nhóm thừa. */
export async function datNhomChoKhach(nc: NguCanh, khachId: string, nhomIds: string[]) {
  await khachSuaDuoc(nc, [khachId]);
  const hien = await nc.tx.customerGroupMember.findMany({ where: { customerId: khachId }, select: { groupId: true } });
  const hienTap = new Set(hien.map((h) => h.groupId));
  const moiTap = new Set(nhomIds);
  for (const id of moiTap) if (!hienTap.has(id)) await ganKhachVaoNhom(nc, id, [khachId]);
  for (const id of hienTap) if (!moiTap.has(id)) await boKhachKhoiNhom(nc, id, [khachId]);
  return nhomCuaKhach(nc, khachId);
}
