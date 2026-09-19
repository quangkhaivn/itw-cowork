import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { chuoiTuyChon, kiemTraNguoiPhuTrach, locTheoPhamVi, thoiDiemTuyChon, trongPhamVi, uuidTuyChon } from "@/modules/crm/chung";
import { TRANG_THAI_VIEC, UU_TIEN } from "@/modules/crm/hang-so";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import { batBuocThayCoHoi } from "@/modules/co-hoi/service";
import { batBuocThayLead } from "@/modules/lead/service";

/**
 * Công việc — việc SẮP làm, có hạn ("Activity" trong prompt). Luật CV-01 → CV-03.
 * Quyền `task.*`, phạm vi theo `tasks.owner_id`.
 */

export const LuocDoTaoViec = z.object({
  tieuDe: z.string().trim().min(3, "Tiêu đề tối thiểu 3 ký tự.").max(255),
  moTa: chuoiTuyChon(5000),
  nguoiPhuTrachId: uuidTuyChon,
  uuTien: z.enum(UU_TIEN).optional().default("trung-binh"),
  han: thoiDiemTuyChon,
  khachHangId: uuidTuyChon,
  leadId: uuidTuyChon,
  coHoiId: uuidTuyChon,
});
export type DuLieuTaoViec = z.infer<typeof LuocDoTaoViec>;

export const LuocDoSuaViec = z.object({
  tieuDe: z.string().trim().min(3).max(255).optional(),
  moTa: chuoiTuyChon(5000),
  nguoiPhuTrachId: uuidTuyChon,
  uuTien: z.enum(UU_TIEN).optional(),
  han: thoiDiemTuyChon,
  trangThai: z.enum(TRANG_THAI_VIEC).optional(),
});
export type DuLieuSuaViec = z.infer<typeof LuocDoSuaViec>;

export const LuocDoLocViec = z.object({
  /** cua-toi | qua-han | tat-ca (trong phạm vi) */
  cheDo: z.enum(["cua-toi", "qua-han", "tat-ca"]).optional().default("cua-toi"),
  /** "" = chưa xong (mo + dang-lam); "tat-ca"; hoặc một trạng thái */
  trangThai: z.enum(["", "tat-ca", ...TRANG_THAI_VIEC]).optional().default(""),
  nguoiPhuTrach: z.union([z.uuid(), z.literal("")]).optional().default(""),
  q: z.string().trim().max(100).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(30),
});
export type BoLocViec = z.infer<typeof LuocDoLocViec>;

const CHUA_XONG = ["mo", "dang-lam"];

const CHON_VIEC = {
  id: true,
  title: true,
  description: true,
  priority: true,
  dueAt: true,
  status: true,
  completedAt: true,
  ownerId: true,
  createdAt: true,
  owner: { select: { id: true, fullName: true } },
  customer: { select: { id: true, code: true, name: true } },
  lead: { select: { id: true, code: true, fullName: true } },
  opportunity: { select: { id: true, code: true, title: true } },
} satisfies Prisma.TaskSelect;

function chuyenDoi(v: Prisma.TaskGetPayload<{ select: typeof CHON_VIEC }>) {
  return {
    id: v.id,
    tieuDe: v.title,
    moTa: v.description,
    uuTien: v.priority,
    han: v.dueAt,
    trangThai: v.status,
    xongLuc: v.completedAt,
    taoLuc: v.createdAt,
    nguoiPhuTrach: { id: v.owner.id, hoTen: v.owner.fullName },
    khachHang: v.customer ? { id: v.customer.id, ma: v.customer.code, ten: v.customer.name } : null,
    lead: v.lead ? { id: v.lead.id, ma: v.lead.code, ten: v.lead.fullName } : null,
    coHoi: v.opportunity ? { id: v.opportunity.id, ma: v.opportunity.code, ten: v.opportunity.title } : null,
    quaHan: CHUA_XONG.includes(v.status) && !!v.dueAt && v.dueAt < new Date(),
  };
}
export type CongViec = ReturnType<typeof chuyenDoi>;

function anhChup(v: CongViec) {
  return {
    tieuDe: v.tieuDe,
    uuTien: v.uuTien,
    han: v.han,
    trangThai: v.trangThai,
    nguoiPhuTrachId: v.nguoiPhuTrach.id,
    khachHangId: v.khachHang?.id ?? null,
    leadId: v.lead?.id ?? null,
    coHoiId: v.coHoi?.id ?? null,
  };
}

export async function danhSachViec(nc: NguCanh, boLoc: BoLocViec) {
  batBuocQuyen(nc.hoSo, "task.view");
  const dieuKien: Prisma.TaskWhereInput[] = [await locTheoPhamVi(nc, "task.view")];
  if (boLoc.cheDo === "cua-toi") dieuKien.push({ ownerId: nc.hoSo.userId });
  if (boLoc.cheDo === "qua-han") dieuKien.push({ status: { in: CHUA_XONG }, dueAt: { lt: new Date() } });
  if (boLoc.trangThai === "") dieuKien.push({ status: { in: CHUA_XONG } });
  else if (boLoc.trangThai !== "tat-ca") dieuKien.push({ status: boLoc.trangThai });
  if (boLoc.nguoiPhuTrach) dieuKien.push({ ownerId: boLoc.nguoiPhuTrach });
  if (boLoc.q) dieuKien.push({ OR: [{ title: { contains: boLoc.q, mode: "insensitive" } }, { customer: { name: { contains: boLoc.q, mode: "insensitive" } } }] });

  const where: Prisma.TaskWhereInput = { AND: dieuKien };
  const [tong, dong, soQuaHanCuaToi] = await Promise.all([
    nc.tx.task.count({ where }),
    nc.tx.task.findMany({
      where,
      select: CHON_VIEC,
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (boLoc.trang - 1) * boLoc.coTrang,
      take: boLoc.coTrang,
    }),
    nc.tx.task.count({ where: { ownerId: nc.hoSo.userId, status: { in: CHUA_XONG }, dueAt: { lt: new Date() } } }),
  ]);
  const pvSua = coQuyen(nc.hoSo, "task.update");
  const ketQua = await Promise.all(
    dong.map(async (v) => ({ ...chuyenDoi(v), duocSua: pvSua && (await trongPhamVi(nc, "task.update", v.ownerId)) })),
  );
  return { tong, trang: boLoc.trang, coTrang: boLoc.coTrang, dong: ketQua, soQuaHanCuaToi };
}

/** CV-03: bản ghi gắn kèm phải nằm trong tầm nhìn của người tạo. */
async function kiemTraGanKem(nc: NguCanh, d: { khachHangId?: string | null; leadId?: string | null; coHoiId?: string | null }) {
  let khachId = d.khachHangId ?? null;
  if (d.coHoiId) {
    const ch = await batBuocThayCoHoi(nc, d.coHoiId);
    khachId = khachId ?? ch.khachHang.id;
  }
  if (khachId) await batBuocThayKhach(nc, khachId);
  if (d.leadId) await batBuocThayLead(nc, d.leadId);
  return khachId;
}

export async function taoViec(nc: NguCanh, d: DuLieuTaoViec) {
  batBuocQuyen(nc.hoSo, "task.create", { objectType: "task" });
  const ownerId = d.nguoiPhuTrachId ?? nc.hoSo.userId;
  await kiemTraNguoiPhuTrach(nc, "task.create", ownerId);
  const khachId = await kiemTraGanKem(nc, d);

  const v = await nc.tx.task.create({
    data: {
      tenantId: nc.tenantId,
      title: d.tieuDe,
      description: d.moTa ?? null,
      ownerId,
      priority: d.uuTien,
      dueAt: d.han ?? null,
      customerId: khachId,
      leadId: d.leadId ?? null,
      opportunityId: d.coHoiId ?? null,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
    },
    select: CHON_VIEC,
  });
  const kq = chuyenDoi(v);
  await nc.kiemToan({ action: "tao", objectType: "task", objectId: v.id, after: anhChup(kq) });
  await nc.suKien({ eventType: SU_KIEN.TASK_CREATED, objectType: "task", objectId: v.id, payload: { nguoiPhuTrachId: ownerId } });
  return kq;
}

export async function suaViec(nc: NguCanh, id: string, d: DuLieuSuaViec) {
  batBuocQuyen(nc.hoSo, "task.update", { objectType: "task", objectId: id });
  const goc = await nc.tx.task.findFirst({ where: { id, ...(await locTheoPhamVi(nc, "task.view")) }, select: CHON_VIEC });
  if (!goc) throw new LoiKhongTimThay("Công việc");
  if (!(await trongPhamVi(nc, "task.update", goc.ownerId))) {
    throw new LoiNghiepVu("Bạn chỉ xem được công việc này, không sửa được.", 403, "ngoai-pham-vi");
  }
  const truoc = chuyenDoi(goc);
  if (d.nguoiPhuTrachId && d.nguoiPhuTrachId !== goc.ownerId) await kiemTraNguoiPhuTrach(nc, "task.update", d.nguoiPhuTrachId);

  const xongMoi = d.trangThai === "xong" && goc.status !== "xong";
  const v = await nc.tx.task.update({
    where: { id },
    data: {
      ...(d.tieuDe !== undefined && { title: d.tieuDe }),
      ...(d.moTa !== undefined && { description: d.moTa }),
      ...(d.nguoiPhuTrachId && { ownerId: d.nguoiPhuTrachId }),
      ...(d.uuTien !== undefined && { priority: d.uuTien }),
      ...(d.han !== undefined && { dueAt: d.han }),
      ...(d.trangThai !== undefined && {
        status: d.trangThai,
        completedAt: d.trangThai === "xong" ? (goc.completedAt ?? new Date()) : null,
      }),
      updatedBy: nc.hoSo.userId,
    },
    select: CHON_VIEC,
  });
  const sau = chuyenDoi(v);
  await nc.kiemToan({ action: "sua", objectType: "task", objectId: id, before: anhChup(truoc), after: anhChup(sau) });
  await nc.suKien({ eventType: xongMoi ? SU_KIEN.TASK_COMPLETED : SU_KIEN.TASK_UPDATED, objectType: "task", objectId: id });
  return sau;
}
