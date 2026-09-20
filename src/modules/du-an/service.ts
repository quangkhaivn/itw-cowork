import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { capSoChungTu, KIEU_SO } from "@/lib/so-chung-tu";
import { dateVeNgay, homNayVN, kiemTraNguoiPhuTrach, locTheoPhamVi, ngayVeDate, trongPhamVi } from "@/modules/crm/chung";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import { chuyenDuocDuAn, dangChayDuAn, quaHanDuAn, tienDoDuAn } from "./tinh-toan";
import type { BoLocDuAn, DuLieuDoiTrangThaiDuAn, DuLieuSuaDuAn, DuLieuTaoDuAn } from "./luoc-do";
import type { z } from "zod";
import type { LuocDoHangMuc, LuocDoSuaHangMuc } from "./luoc-do";

/**
 * Dự án triển khai — mục 17 prompt 20/09. Luật: BUSINESS_RULES.md mục 10.
 *
 * Dự án đi ra từ một đơn hàng đã xác nhận (lắp đặt, thi công) và kết thúc bằng **nghiệm
 * thu**: chỉ nghiệm thu được khi mọi hạng mục đã xong, và nghiệm thu rồi thì khóa.
 *
 * Quyền `project.*`; phạm vi theo người phụ trách dự án (`manager_id`).
 */

const CHON_HANG_MUC = {
  id: true, name: true, status: true, dueDate: true, doneAt: true, note: true, sortOrder: true,
} satisfies Prisma.ProjectMilestoneSelect;

const CHON = {
  id: true, code: true, name: true, status: true, description: true, startDate: true, dueDate: true,
  acceptedAt: true, acceptedBy: true, acceptanceNote: true, cancelledAt: true, cancelReason: true,
  createdAt: true, updatedAt: true, managerId: true,
  customer: { select: { id: true, code: true, name: true } },
  salesOrder: { select: { id: true, number: true, status: true } },
  manager: { select: { id: true, fullName: true, email: true } },
  milestones: { select: CHON_HANG_MUC, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.ProjectSelect;

type BanGhi = Prisma.ProjectGetPayload<{ select: typeof CHON }>;

function hangMucRa(h: Prisma.ProjectMilestoneGetPayload<{ select: typeof CHON_HANG_MUC }>) {
  return {
    id: h.id,
    ten: h.name,
    trangThai: h.status,
    hanHoanThanh: h.dueDate,
    xongLuc: h.doneAt,
    ghiChu: h.note,
    thuTu: h.sortOrder,
  };
}

function duAnRa(d: BanGhi, homNay: string) {
  const hangMuc = d.milestones.map(hangMucRa);
  return {
    id: d.id,
    ma: d.code,
    ten: d.name,
    trangThai: d.status,
    moTa: d.description,
    ngayBatDau: d.startDate,
    ngayDuKien: d.dueDate,
    nghiemThuLuc: d.acceptedAt,
    ghiChuNghiemThu: d.acceptanceNote,
    huyLuc: d.cancelledAt,
    lyDoHuy: d.cancelReason,
    quaHan: quaHanDuAn(dateVeNgay(d.dueDate) || null, d.status, homNay),
    khachHang: { id: d.customer.id, ma: d.customer.code, ten: d.customer.name },
    donHang: d.salesOrder ? { id: d.salesOrder.id, so: d.salesOrder.number, trangThai: d.salesOrder.status } : null,
    nguoiPhuTrach: { id: d.manager.id, hoTen: d.manager.fullName, email: d.manager.email },
    hangMuc,
    tienDo: tienDoDuAn(hangMuc),
    taoLuc: d.createdAt,
    suaLuc: d.updatedAt,
  };
}
export type DuAnChiTiet = ReturnType<typeof duAnRa>;

// ---------------------------------------------------------------------------
// Phạm vi
// ---------------------------------------------------------------------------

export async function dieuKienXemDuAn(nc: NguCanh): Promise<Prisma.ProjectWhereInput> {
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "project.view");
  if (pv === "tat-ca") return {};
  // Người phụ trách dự án, hoặc người đang được giao việc trong dự án đó.
  return { OR: [{ managerId: { in: pv } }, { tasks: { some: { ownerId: { in: pv } } } }] };
}

async function docDuAn(nc: NguCanh, id: string): Promise<BanGhi> {
  const d = await nc.tx.project.findFirst({ where: { AND: [{ id }, await dieuKienXemDuAn(nc)] }, select: CHON });
  if (!d) throw new LoiKhongTimThay("Dự án");
  return d;
}

// ---------------------------------------------------------------------------
// Đọc
// ---------------------------------------------------------------------------

export async function danhSachDuAn(nc: NguCanh, boLoc: BoLocDuAn) {
  batBuocQuyen(nc.hoSo, "project.view");
  const homNay = homNayVN();
  const dieuKien: Prisma.ProjectWhereInput[] = [await dieuKienXemDuAn(nc)];
  if (boLoc.q) {
    dieuKien.push({
      OR: [
        { code: { contains: boLoc.q, mode: "insensitive" } },
        { name: { contains: boLoc.q, mode: "insensitive" } },
        { customer: { name: { contains: boLoc.q, mode: "insensitive" } } },
      ],
    });
  }
  if (boLoc.trangThai === "") dieuKien.push({ status: { in: ["PLANNING", "IN_PROGRESS", "ON_HOLD"] } });
  else if (boLoc.trangThai !== "tat-ca") dieuKien.push({ status: boLoc.trangThai });
  if (boLoc.nguoiPhuTrach) dieuKien.push({ managerId: boLoc.nguoiPhuTrach });
  if (boLoc.khachHang) dieuKien.push({ customerId: boLoc.khachHang });
  if (boLoc.quaHan === "1") {
    dieuKien.push({ status: { in: ["PLANNING", "IN_PROGRESS", "ON_HOLD"] }, dueDate: { lt: ngayVeDate(homNay) } });
  }

  const where: Prisma.ProjectWhereInput = { AND: dieuKien };
  const [tong, ds, tatCa] = await Promise.all([
    nc.tx.project.count({ where }),
    nc.tx.project.findMany({ where, select: CHON, orderBy: [{ createdAt: "desc" }], skip: (boLoc.trang - 1) * boLoc.coTrang, take: boLoc.coTrang }),
    nc.tx.project.findMany({ where: { AND: [await dieuKienXemDuAn(nc)] }, select: { status: true, dueDate: true } }),
  ]);

  return {
    tong,
    trang: boLoc.trang,
    coTrang: boLoc.coTrang,
    dong: ds.map((d) => duAnRa(d, homNay)),
    tomTat: {
      dangChay: tatCa.filter((d) => dangChayDuAn(d.status)).length,
      quaHan: tatCa.filter((d) => quaHanDuAn(dateVeNgay(d.dueDate) || null, d.status, homNay)).length,
      daNghiemThu: tatCa.filter((d) => d.status === "ACCEPTED").length,
    },
  };
}

export async function chiTietDuAn(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "project.view", { objectType: "project", objectId: id });
  const d = await docDuAn(nc, id);
  const [viec, phieu] = await Promise.all([
    nc.tx.task.findMany({
      where: { projectId: id },
      select: { id: true, title: true, status: true, priority: true, dueAt: true, owner: { select: { fullName: true } } },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: 100,
    }),
    coQuyen(nc.hoSo, "service_desk.view")
      ? nc.tx.supportTicket.findMany({ where: { projectId: id }, select: { id: true, number: true, title: true, status: true }, orderBy: { createdAt: "desc" }, take: 20 })
      : Promise.resolve([]),
  ]);

  const duocSua = coQuyen(nc.hoSo, "project.update") && (await trongPhamVi(nc, "project.update", d.managerId));
  const duAn = duAnRa(d, homNayVN());

  return {
    duAn,
    viec: viec.map((v) => ({ id: v.id, tieuDe: v.title, trangThai: v.status, uuTien: v.priority, han: v.dueAt, nguoi: v.owner.fullName })),
    phieuHoTro: phieu.map((p) => ({ id: p.id, so: p.number, tieuDe: p.title, trangThai: p.status })),
    quyen: {
      sua: duocSua && dangChayDuAn(duAn.trangThai),
      hangMuc: duocSua && dangChayDuAn(duAn.trangThai),
      doiTrangThai: duocSua && dangChayDuAn(duAn.trangThai),
      nghiemThu: coQuyen(nc.hoSo, "project.approve") && duAn.trangThai === "IN_PROGRESS" && !duAn.tienDo.conDangDo && duAn.tienDo.tong > 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

export async function taoDuAn(nc: NguCanh, d: DuLieuTaoDuAn) {
  batBuocQuyen(nc.hoSo, "project.create", { objectType: "project" });
  const khach = await batBuocThayKhach(nc, d.khachHangId);
  const nguoiPhuTrachId = d.nguoiPhuTrachId ?? nc.hoSo.userId;
  await kiemTraNguoiPhuTrach(nc, "project.create", nguoiPhuTrachId);

  if (d.donHangId) {
    const don = await nc.tx.salesOrder.findFirst({ where: { id: d.donHangId }, select: { id: true, customerId: true, status: true } });
    if (!don) throw new LoiDinhDang("donHangId", "Không tìm thấy đơn hàng.");
    if (don.customerId !== khach.id) throw new LoiDinhDang("donHangId", "Đơn hàng này của khách khác.");
    if (don.status === "DRAFT") throw new LoiDinhDang("donHangId", "Đơn còn nháp — xác nhận đơn trước khi mở dự án triển khai.");
  }

  const ma = await capSoChungTu(nc.tx, KIEU_SO.duAn);
  const da = await nc.tx.project.create({
    data: {
      tenantId: nc.tenantId,
      code: ma,
      name: d.ten,
      customerId: khach.id,
      salesOrderId: d.donHangId || null,
      managerId: nguoiPhuTrachId,
      description: d.moTa || null,
      startDate: d.ngayBatDau ? ngayVeDate(d.ngayBatDau) : null,
      dueDate: d.ngayDuKien ? ngayVeDate(d.ngayDuKien) : null,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
      ...(d.hangMuc.length > 0 && {
        milestones: { create: d.hangMuc.map((ten, i) => ({ tenantId: nc.tenantId, name: ten, sortOrder: i })) },
      }),
    },
    select: { id: true, code: true },
  });

  await nc.kiemToan({ action: "tao", objectType: "project", objectId: da.id, after: { ma, khachHangId: khach.id, soHangMuc: d.hangMuc.length } });
  await nc.suKien({ eventType: SU_KIEN.PROJECT_CREATED, objectType: "project", objectId: da.id, payload: { ma, khachHangId: khach.id, donHangId: d.donHangId ?? null } });
  return { id: da.id, ma };
}

export async function suaDuAn(nc: NguCanh, id: string, d: DuLieuSuaDuAn) {
  batBuocQuyen(nc.hoSo, "project.update", { objectType: "project", objectId: id });
  const truoc = await docDuAn(nc, id);
  if (!(await trongPhamVi(nc, "project.update", truoc.managerId))) throw new LoiKhongTimThay("Dự án");
  if (!dangChayDuAn(truoc.status)) throw new LoiNghiepVu("Dự án đã nghiệm thu hoặc đã hủy thì không sửa được.", 409, "du-an-da-dong");
  if (d.nguoiPhuTrachId && d.nguoiPhuTrachId !== truoc.managerId) await kiemTraNguoiPhuTrach(nc, "project.update", d.nguoiPhuTrachId);

  await nc.tx.project.update({
    where: { id },
    data: {
      ...(d.ten && { name: d.ten }),
      ...(d.moTa !== undefined && { description: d.moTa || null }),
      ...(d.nguoiPhuTrachId && { managerId: d.nguoiPhuTrachId }),
      ...(d.ngayBatDau !== undefined && { startDate: d.ngayBatDau ? ngayVeDate(d.ngayBatDau) : null }),
      ...(d.ngayDuKien !== undefined && { dueDate: d.ngayDuKien ? ngayVeDate(d.ngayDuKien) : null }),
      updatedBy: nc.hoSo.userId,
    },
  });
  await nc.kiemToan({ action: "sua", objectType: "project", objectId: id, before: { ten: truoc.name, nguoiPhuTrachId: truoc.managerId }, after: { ten: d.ten ?? truoc.name, nguoiPhuTrachId: d.nguoiPhuTrachId ?? truoc.managerId } });
  return { id };
}

export async function themHangMuc(nc: NguCanh, duAnId: string, d: z.infer<typeof LuocDoHangMuc>) {
  batBuocQuyen(nc.hoSo, "project.update", { objectType: "project", objectId: duAnId });
  const da = await docDuAn(nc, duAnId);
  if (!dangChayDuAn(da.status)) throw new LoiNghiepVu("Dự án đã đóng thì không thêm hạng mục.", 409, "du-an-da-dong");

  const h = await nc.tx.projectMilestone.create({
    data: {
      tenantId: nc.tenantId,
      projectId: duAnId,
      name: d.ten,
      dueDate: d.hanHoanThanh ? ngayVeDate(d.hanHoanThanh) : null,
      note: d.ghiChu || null,
      sortOrder: da.milestones.length,
    },
    select: CHON_HANG_MUC,
  });
  await nc.kiemToan({ action: "tao", objectType: "project_milestone", objectId: h.id, after: { duAnId, ten: d.ten } });
  return hangMucRa(h);
}

export async function suaHangMuc(nc: NguCanh, duAnId: string, hangMucId: string, d: z.infer<typeof LuocDoSuaHangMuc>) {
  batBuocQuyen(nc.hoSo, "project.update", { objectType: "project_milestone", objectId: hangMucId });
  const da = await docDuAn(nc, duAnId);
  if (!dangChayDuAn(da.status)) throw new LoiNghiepVu("Dự án đã đóng thì không sửa hạng mục.", 409, "du-an-da-dong");
  const truoc = da.milestones.find((h) => h.id === hangMucId);
  if (!truoc) throw new LoiKhongTimThay("Hạng mục");

  const h = await nc.tx.projectMilestone.update({
    where: { id: hangMucId },
    data: {
      ...(d.ten && { name: d.ten }),
      ...(d.trangThai && { status: d.trangThai, doneAt: d.trangThai === "xong" ? (truoc.doneAt ?? new Date()) : null }),
      ...(d.hanHoanThanh !== undefined && { dueDate: d.hanHoanThanh ? ngayVeDate(d.hanHoanThanh) : null }),
      ...(d.ghiChu !== undefined && { note: d.ghiChu || null }),
    },
    select: CHON_HANG_MUC,
  });

  // Hạng mục đầu tiên bắt đầu chạy thì dự án tự chuyển sang Đang triển khai (DU-03).
  if (d.trangThai && d.trangThai !== "chua-lam" && da.status === "PLANNING") {
    await nc.tx.project.update({ where: { id: duAnId }, data: { status: "IN_PROGRESS", startDate: da.startDate ?? new Date() } });
    await nc.suKien({ eventType: SU_KIEN.PROJECT_STARTED, objectType: "project", objectId: duAnId, payload: { ma: da.code } });
  }
  await nc.kiemToan({ action: "sua", objectType: "project_milestone", objectId: hangMucId, before: { trangThai: truoc.status }, after: { trangThai: d.trangThai ?? truoc.status } });
  return hangMucRa(h);
}

export async function xoaHangMuc(nc: NguCanh, duAnId: string, hangMucId: string) {
  batBuocQuyen(nc.hoSo, "project.update", { objectType: "project_milestone", objectId: hangMucId });
  const da = await docDuAn(nc, duAnId);
  if (!dangChayDuAn(da.status)) throw new LoiNghiepVu("Dự án đã đóng thì không xóa hạng mục.", 409, "du-an-da-dong");
  const h = da.milestones.find((x) => x.id === hangMucId);
  if (!h) throw new LoiKhongTimThay("Hạng mục");
  if (h.status === "xong") throw new LoiNghiepVu("Hạng mục đã xong thì giữ lại để còn đối chiếu khi nghiệm thu.", 409, "hang-muc-da-xong");

  await nc.tx.projectMilestone.delete({ where: { id: hangMucId } });
  await nc.kiemToan({ action: "xoa", objectType: "project_milestone", objectId: hangMucId, before: { duAnId, ten: h.name } });
  return { id: hangMucId };
}

/** Đổi trạng thái dự án: chạy, tạm dừng, nghiệm thu, hủy (DU-05, DU-06). */
export async function doiTrangThaiDuAn(nc: NguCanh, id: string, d: DuLieuDoiTrangThaiDuAn) {
  const canDuyet = d.trangThai === "ACCEPTED" || d.trangThai === "CANCELLED";
  batBuocQuyen(nc.hoSo, canDuyet ? "project.approve" : "project.update", { objectType: "project", objectId: id });
  const da = await docDuAn(nc, id);
  if (!chuyenDuocDuAn(da.status, d.trangThai)) {
    throw new LoiNghiepVu(`Không chuyển dự án từ "${da.status}" sang "${d.trangThai}" được.`, 409, "sai-trang-thai");
  }

  const hangMuc = da.milestones.map(hangMucRa);
  const tienDo = tienDoDuAn(hangMuc);
  if (d.trangThai === "ACCEPTED") {
    if (tienDo.tong === 0) throw new LoiNghiepVu("Dự án chưa có hạng mục nào — chưa nghiệm thu được.", 409, "chua-co-hang-muc");
    if (tienDo.conDangDo) {
      throw new LoiNghiepVu(`Còn ${tienDo.tong - tienDo.xong} hạng mục chưa xong, chưa nghiệm thu được (DU-05).`, 409, "con-hang-muc-do", { conLai: tienDo.tong - tienDo.xong });
    }
  }
  if (d.trangThai === "CANCELLED" && !(d.ghiChu && d.ghiChu.trim().length >= 2)) {
    throw new LoiDinhDang("ghiChu", "Hủy dự án phải ghi lý do.");
  }

  const bayGio = new Date();
  await nc.tx.project.update({
    where: { id },
    data: {
      status: d.trangThai,
      ...(d.trangThai === "IN_PROGRESS" && !da.startDate && { startDate: bayGio }),
      ...(d.trangThai === "ACCEPTED" && { acceptedAt: bayGio, acceptedBy: nc.hoSo.userId, acceptanceNote: d.ghiChu || "Nghiệm thu đủ hạng mục" }),
      ...(d.trangThai === "CANCELLED" && { cancelledAt: bayGio, cancelReason: d.ghiChu }),
      updatedBy: nc.hoSo.userId,
    },
  });

  await nc.kiemToan({ action: "sua", objectType: "project", objectId: id, before: { trangThai: da.status }, after: { trangThai: d.trangThai, ghiChu: d.ghiChu ?? null } });
  if (d.trangThai === "IN_PROGRESS") await nc.suKien({ eventType: SU_KIEN.PROJECT_STARTED, objectType: "project", objectId: id, payload: { ma: da.code } });
  if (d.trangThai === "ACCEPTED") {
    await nc.suKien({ eventType: SU_KIEN.PROJECT_ACCEPTED, objectType: "project", objectId: id, payload: { ma: da.code } });
    await nc.suKien({ eventType: SU_KIEN.ACCEPTANCE_COMPLETED, objectType: "project", objectId: id, payload: { ma: da.code } });
  }
  if (d.trangThai === "CANCELLED") await nc.suKien({ eventType: SU_KIEN.PROJECT_CANCELLED, objectType: "project", objectId: id, payload: { ma: da.code, lyDo: d.ghiChu } });
  return { id, trangThai: d.trangThai };
}

/** Dự án của một khách — dùng cho Customer 360 và khi mở phiếu hỗ trợ. */
export async function duAnCuaKhach(nc: NguCanh, khachHangId: string) {
  if (!coQuyen(nc.hoSo, "project.view")) return [];
  const ds = await nc.tx.project.findMany({
    where: { AND: [{ customerId: khachHangId }, await dieuKienXemDuAn(nc)] },
    select: { id: true, code: true, name: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return ds.map((d) => ({ id: d.id, ma: d.code, ten: d.name, trangThai: d.status }));
}

/** Phạm vi lọc dùng lại cho màn hình danh sách người phụ trách. */
export async function locDuAnTheoPhamVi(nc: NguCanh) {
  return locTheoPhamVi(nc, "project.view");
}
