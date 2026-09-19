import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu, laLoiTrung } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { LOAI_DU_LIEU_GOC, timLoai } from "./loai";

const MA_LOAI = z.string().refine((m) => Boolean(timLoai(m)), "Loại dữ liệu gốc không tồn tại.");

export const LuocDoTaoMuc = z.object({
  loai: MA_LOAI,
  ma: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{0,49}$/, "Mã chỉ gồm chữ thường không dấu, số và gạch ngang."),
  ten: z.string().trim().min(1, "Nhập tên.").max(255),
  moTa: z.string().trim().max(1000).optional().default(""),
  thuTu: z.coerce.number().int().min(0).max(9999).optional().default(0),
});

export const LuocDoSuaMuc = z.object({
  ten: z.string().trim().min(1).max(255).optional(),
  moTa: z.string().trim().max(1000).optional(),
  thuTu: z.coerce.number().int().min(0).max(9999).optional(),
  trangThai: z.enum(["hoat-dong", "ngung-hoat-dong"]).optional(),
});

const CHON = {
  id: true,
  type: true,
  code: true,
  name: true,
  description: true,
  sortOrder: true,
  status: true,
  updatedAt: true,
} as const;

function chuyenDoi(m: {
  id: string;
  type: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  status: string;
  updatedAt: Date;
}) {
  return {
    id: m.id,
    loai: m.type,
    ma: m.code,
    ten: m.name,
    moTa: m.description,
    thuTu: m.sortOrder,
    trangThai: m.status,
    capNhatLuc: m.updatedAt,
  };
}

/** Tổng quan số mục mỗi loại — cho thanh chọn loại. */
export async function demTheoLoai(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "master_data.view");
  const dem = await nc.tx.masterDataItem.groupBy({ by: ["type"], _count: { _all: true } });
  const bang = new Map(dem.map((d) => [d.type, d._count._all]));
  return LOAI_DU_LIEU_GOC.map((l) => ({ ...l, soMuc: bang.get(l.ma) ?? 0 }));
}

export async function danhSachMuc(nc: NguCanh, loai: string) {
  batBuocQuyen(nc.hoSo, "master_data.view");
  if (!timLoai(loai)) throw new LoiKhongTimThay("Loại dữ liệu gốc");
  const ds = await nc.tx.masterDataItem.findMany({
    where: { type: loai },
    select: CHON,
    orderBy: [{ status: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });
  return ds.map(chuyenDoi);
}

/**
 * Danh sách chọn cho form của phân hệ khác. KHÔNG đòi quyền `master_data.view`:
 * người lập báo giá cần chọn đơn vị tính mà không cần vào được màn hình quản trị.
 * Chỉ trả mục đang hoạt động.
 */
export async function luaChon(tx: ClientTenant, loai: string) {
  const ds = await tx.masterDataItem.findMany({
    where: { type: loai, status: "hoat-dong" },
    select: { code: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return ds.map((m) => ({ ma: m.code, ten: m.name }));
}

export async function taoMuc(nc: NguCanh, d: z.infer<typeof LuocDoTaoMuc>) {
  batBuocQuyen(nc.hoSo, "master_data.create", { objectType: "master_data" });
  try {
    const m = await nc.tx.masterDataItem.create({
      data: {
        tenantId: nc.tenantId,
        type: d.loai,
        code: d.ma,
        name: d.ten,
        description: d.moTa || null,
        sortOrder: d.thuTu,
        createdBy: nc.hoSo.userId,
        updatedBy: nc.hoSo.userId,
      },
      select: CHON,
    });
    const kq = chuyenDoi(m);
    await nc.kiemToan({ action: "tao", objectType: "master_data", objectId: m.id, after: kq });
    await nc.suKien({
      eventType: SU_KIEN.MASTER_DATA_CHANGED,
      objectType: "master_data",
      objectId: m.id,
      payload: { loai: d.loai, hanhDong: "tao" },
    });
    return kq;
  } catch (loi) {
    if (laLoiTrung(loi)) throw new LoiNghiepVu(`Mã "${d.ma}" đã có trong loại này.`, 409, "trung");
    throw loi;
  }
}

export async function suaMuc(nc: NguCanh, id: string, d: z.infer<typeof LuocDoSuaMuc>) {
  batBuocQuyen(nc.hoSo, "master_data.update", { objectType: "master_data", objectId: id });
  const truoc = await nc.tx.masterDataItem.findFirst({ where: { id }, select: CHON });
  if (!truoc) throw new LoiKhongTimThay("Mục dữ liệu gốc");
  const sau = await nc.tx.masterDataItem.update({
    where: { id },
    data: {
      ...(d.ten !== undefined && { name: d.ten }),
      ...(d.moTa !== undefined && { description: d.moTa || null }),
      ...(d.thuTu !== undefined && { sortOrder: d.thuTu }),
      ...(d.trangThai !== undefined && { status: d.trangThai }),
      updatedBy: nc.hoSo.userId,
    },
    select: CHON,
  });
  const kq = chuyenDoi(sau);
  await nc.kiemToan({ action: "sua", objectType: "master_data", objectId: id, before: chuyenDoi(truoc), after: kq });
  await nc.suKien({
    eventType: SU_KIEN.MASTER_DATA_CHANGED,
    objectType: "master_data",
    objectId: id,
    payload: { loai: truoc.type, hanhDong: "sua" },
  });
  return kq;
}
