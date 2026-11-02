import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { taoNguCanh, type NguCanh } from "@/lib/api";
import { voiTenant } from "@/lib/db";
import { batBuocQuyen, coQuyen, layHoSoQuyen } from "@/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { banDoTen } from "@/modules/cham-cong/chung";
import { gioVePhut, laNgayHopLe, mocVN, ngayVNCua, phutVeGio } from "@/modules/cham-cong/tinh-toan";
import { chuoiTuyChon, dateVeNgay, kiemTraNguoiPhuTrach, ngayVeDate, trongPhamVi } from "@/modules/crm/chung";
import { UU_TIEN } from "@/modules/crm/hang-so";
import { laNgayLap, LuocDoChuoiDuyet, TAN_SUAT, TOI_DA_NGUOI_MOT_LAN_GIAO, type CapDuyet } from "@/modules/danh-gia/tinh-toan";
import { chuoiDuyetTuDong, docChuoiDuyet, dungChuoiDuyetChoViec, kiemChuoiDuyetKhiGiao } from "./duyet";
import { taoViec } from "./service";

/**
 * Mẫu việc (DG-06) và việc định kỳ (DG-07).
 * Việc định kỳ do worker sinh mỗi nhịp: ngày hôm nay (giờ VN) là ngày lặp thì mỗi người được giao một
 * việc, **nhân danh người lập lịch** (kiểm lại phạm vi giao của người đó lúc sinh). Chống trùng hai lớp:
 * khóa tư vấn theo doanh nghiệp + chỉ mục duy nhất `(recurrence_id, recurrence_date, recurrence_assignee_id)`.
 * Ngày worker không chạy không sinh bù (việc đã trễ thì không còn ý nghĩa nhắc).
 */

const LuocDoMuc = z.object({ nhan: z.string().trim().min(2).max(300), batBuoc: z.boolean().optional().default(true) });

export const LuocDoMauViec = z.object({
  ten: z.string().trim().min(3, "Tên mẫu tối thiểu 3 ký tự.").max(255),
  tieuDe: z.string().trim().min(3, "Tiêu đề tối thiểu 3 ký tự.").max(255),
  moTa: chuoiTuyChon(5000),
  doKho: z.coerce.number().int().min(1).max(5).optional().default(3),
  uuTien: z.enum(UU_TIEN).optional().default("trung-binh"),
  canDuyet: z.boolean().optional().default(true),
  soNgayHan: z.union([z.coerce.number().int().min(0).max(365), z.literal(""), z.null()]).transform((x) => (x === "" ? null : x)).optional().default(null),
  mucKiemTra: z.array(LuocDoMuc).max(30).optional().default([]),
  chuoiDuyet: LuocDoChuoiDuyet.optional().default([]),
  trangThai: z.enum(["hoat-dong", "ngung-hoat-dong"]).optional().default("hoat-dong"),
});
export type DuLieuMauViec = z.infer<typeof LuocDoMauViec>;

async function kiemChuoiKhai(nc: NguCanh, chuoi: CapDuyet[]) {
  const ids = chuoi.filter((c) => c.loai === "nguoi-cu-the").map((c) => c.nguoiId!) as string[];
  if (!ids.length) return;
  const n = await nc.tx.user.count({ where: { id: { in: ids }, status: "hoat-dong", isSystem: false } });
  if (n !== new Set(ids).size) throw new LoiNghiepVu("Người duyệt trong chuỗi không tồn tại hoặc đã ngừng hoạt động.", 422, "nguoi-duyet");
}

function sangMau(m: { id: string; name: string; title: string; description: string | null; difficulty: number; priority: string; needsApproval: boolean; dueDays: number | null; checklist: unknown; approvalChain: unknown; status: string; createdBy: string | null }) {
  return {
    id: m.id,
    ten: m.name,
    tieuDe: m.title,
    moTa: m.description,
    doKho: m.difficulty,
    uuTien: m.priority,
    canDuyet: m.needsApproval,
    soNgayHan: m.dueDays,
    mucKiemTra: Array.isArray(m.checklist) ? (m.checklist as { nhan: string; batBuoc: boolean }[]) : [],
    chuoiDuyet: docChuoiDuyet(m.approvalChain),
    trangThai: m.status,
    nguoiTaoId: m.createdBy,
  };
}

export async function danhSachMauViec(nc: NguCanh, caNgung = false) {
  batBuocQuyen(nc.hoSo, "task.view");
  const ds = await nc.tx.taskTemplate.findMany({ where: caNgung ? {} : { status: "hoat-dong" }, orderBy: { name: "asc" } });
  return ds.map(sangMau);
}

export async function taoMauViec(nc: NguCanh, d: DuLieuMauViec) {
  batBuocQuyen(nc.hoSo, "task.create", { objectType: "task_template" });
  await kiemChuoiKhai(nc, d.chuoiDuyet);
  try {
    const m = await nc.tx.taskTemplate.create({
      data: {
        tenantId: nc.tenantId, name: d.ten, title: d.tieuDe, description: d.moTa ?? null, difficulty: d.doKho, priority: d.uuTien,
        needsApproval: d.canDuyet, dueDays: d.soNgayHan, checklist: d.mucKiemTra, approvalChain: d.chuoiDuyet, status: d.trangThai,
        createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId,
      },
    });
    await nc.kiemToan({ action: "tao", objectType: "task_template", objectId: m.id, after: d });
    return sangMau(m);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new LoiNghiepVu("Đã có mẫu việc cùng tên.", 409, "trung-ten");
    throw e;
  }
}

/** Sửa mẫu: người tạo mẫu hoặc Nhân sự (`nhan_su.update`). Việc đã sinh từ mẫu không đổi theo. */
export async function suaMauViec(nc: NguCanh, id: string, d: DuLieuMauViec) {
  batBuocQuyen(nc.hoSo, "task.create", { objectType: "task_template", objectId: id });
  const goc = await nc.tx.taskTemplate.findFirst({ where: { id } });
  if (!goc) throw new LoiKhongTimThay("Mẫu việc");
  if (goc.createdBy !== nc.hoSo.userId && !coQuyen(nc.hoSo, "nhan_su.update")) throw new LoiNghiepVu("Chỉ người tạo mẫu hoặc Nhân sự sửa được mẫu này.", 403, "khong-phai-nguoi-tao");
  await kiemChuoiKhai(nc, d.chuoiDuyet);
  const m = await nc.tx.taskTemplate.update({
    where: { id },
    data: {
      name: d.ten, title: d.tieuDe, description: d.moTa ?? null, difficulty: d.doKho, priority: d.uuTien, needsApproval: d.canDuyet,
      dueDays: d.soNgayHan, checklist: d.mucKiemTra, approvalChain: d.chuoiDuyet, status: d.trangThai, updatedBy: nc.hoSo.userId,
    },
  });
  await nc.kiemToan({ action: "sua", objectType: "task_template", objectId: id, before: sangMau(goc), after: d });
  return sangMau(m);
}

// ---------------------------------------------------------------------------
// Việc định kỳ
// ---------------------------------------------------------------------------

// QA 0.20.0: ngày phải có thật (30/02 trước đây lặng lẽ thành 02/03), giờ hạn phải là giờ thật (25:99 trước đây lặng lẽ thành 17:00).
const ngay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày dạng yyyy-mm-dd.").refine(laNgayHopLe, "Ngày không có thật.");
export const LuocDoLapViec = z
  .object({
    ten: z.string().trim().min(3).max(255),
    mauViecId: z.union([z.uuid(), z.literal(""), z.null()]).transform((x) => x || null).optional().default(null),
    tieuDe: z.string().trim().min(3).max(255),
    moTa: chuoiTuyChon(5000),
    doKho: z.coerce.number().int().min(1).max(5).optional().default(3),
    uuTien: z.enum(UU_TIEN).optional().default("trung-binh"),
    canDuyet: z.boolean().optional().default(false),
    mucKiemTra: z.array(LuocDoMuc).max(30).optional().default([]),
    chuoiDuyet: LuocDoChuoiDuyet.optional().default([]),
    tanSuat: z.enum(TAN_SUAT),
    thu: z.array(z.coerce.number().int().min(1).max(7)).max(7).optional().default([]),
    ngayThang: z.union([z.coerce.number().int().min(1).max(31), z.literal(""), z.null()]).transform((x) => (x === "" ? null : x)).optional().default(null),
    gioHan: z.string().regex(/^\d{2}:\d{2}$/, "Giờ dạng HH:mm.").refine((g) => gioVePhut(g) !== null, "Giờ không hợp lệ (00:00 – 23:59).").optional().default("17:00"),
    nguoiIds: z.array(z.uuid()).min(1, "Chọn ít nhất một người.").max(TOI_DA_NGUOI_MOT_LAN_GIAO),
    tuNgay: ngay,
    denNgay: z.union([ngay, z.literal(""), z.null()]).transform((x) => x || null).optional().default(null),
    trangThai: z.enum(["hoat-dong", "ngung-hoat-dong"]).optional().default("hoat-dong"),
  })
  .refine((d) => d.tanSuat !== "tuan" || d.thu.length > 0, { message: "Chọn ít nhất một thứ trong tuần.", path: ["thu"] })
  .refine((d) => d.tanSuat !== "thang" || d.ngayThang !== null, { message: "Chọn ngày trong tháng.", path: ["ngayThang"] })
  .refine((d) => !d.denNgay || d.denNgay >= d.tuNgay, { message: "Ngày kết thúc phải sau ngày bắt đầu.", path: ["denNgay"] });
export type DuLieuLapViec = z.infer<typeof LuocDoLapViec>;

async function kiemLapViec(nc: NguCanh, d: DuLieuLapViec) {
  const ds = [...new Set(d.nguoiIds)];
  for (const n of ds) await kiemTraNguoiPhuTrach(nc, "task.create", n);
  await kiemChuoiKhai(nc, d.chuoiDuyet);
  if (d.canDuyet) {
    for (const n of ds) {
      // QĐ-154: chuỗi khai (người cụ thể / người giao / quản lý) kiểm nghiêm cho từng người được giao; để trống thì
      // mặc định (người lập lịch nếu là cấp trên của người làm, không thì quản lý trực tiếp → Giám đốc).
      const c = d.chuoiDuyet.length
        ? await dungChuoiDuyetChoViec(nc, { chuoi: d.chuoiDuyet, nguoiLamId: n, nguoiGiaoId: nc.hoSo.userId })
        : await chuoiDuyetTuDong(nc, { chuoi: [], nguoiLamId: n, nguoiGiaoId: nc.hoSo.userId });
      if (d.chuoiDuyet.length) await kiemChuoiDuyetKhiGiao(nc, c, n, nc.hoSo.userId);
      if (!c.length) throw new LoiNghiepVu("Có người được giao không có ai duyệt (tự giao cho mình). Thêm cấp duyệt hoặc tắt \"cần duyệt\".", 422, "thieu-nguoi-duyet");
    }
  }
  if (d.mauViecId && !(await nc.tx.taskTemplate.count({ where: { id: d.mauViecId } }))) throw new LoiKhongTimThay("Mẫu việc");
  return ds;
}

function duLieuLap(d: DuLieuLapViec, ds: string[]) {
  return {
    name: d.ten, templateId: d.mauViecId, title: d.tieuDe, description: d.moTa ?? null, difficulty: d.doKho, priority: d.uuTien,
    needsApproval: d.canDuyet, checklist: d.mucKiemTra, approvalChain: d.chuoiDuyet, frequency: d.tanSuat,
    weekdays: d.tanSuat === "tuan" ? [...new Set(d.thu)].sort() : [], monthDay: d.tanSuat === "thang" ? d.ngayThang : null,
    dueMinute: gioVePhut(d.gioHan) ?? 1020, assigneeIds: ds, startDate: ngayVeDate(d.tuNgay), endDate: d.denNgay ? ngayVeDate(d.denNgay) : null,
    status: d.trangThai,
  };
}

type BanGhiLap = Awaited<ReturnType<NguCanh["tx"]["taskRecurrence"]["findFirstOrThrow"]>>;
function sangLap(l: BanGhiLap, ten: Map<string, string>) {
  return {
    id: l.id, ten: l.name, mauViecId: l.templateId, tieuDe: l.title, moTa: l.description, doKho: l.difficulty, uuTien: l.priority,
    canDuyet: l.needsApproval, tanSuat: l.frequency, thu: l.weekdays, ngayThang: l.monthDay, gioHan: phutVeGio(l.dueMinute),
    nguoi: l.assigneeIds.map((id) => ({ id, hoTen: ten.get(id) ?? "—" })), tuNgay: dateVeNgay(l.startDate), denNgay: dateVeNgay(l.endDate),
    lanCuoi: dateVeNgay(l.lastRunDate), trangThai: l.status, nguoiLap: { id: l.createdBy, hoTen: ten.get(l.createdBy) ?? "—" },
    mucKiemTra: Array.isArray(l.checklist) ? (l.checklist as { nhan: string; batBuoc: boolean }[]) : [],
    chuoiDuyet: docChuoiDuyet(l.approvalChain),
  };
}

/** Lịch mình lập + lịch giao cho mình; phạm vi `task.view` toàn công ty thấy hết. */
export async function danhSachLapViec(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "task.view");
  const tatCa = nc.hoSo.phamVi.get("task.view") === "all";
  const ds = await nc.tx.taskRecurrence.findMany({
    where: tatCa ? {} : { OR: [{ createdBy: nc.hoSo.userId }, { assigneeIds: { has: nc.hoSo.userId } }] },
    orderBy: { createdAt: "desc" },
  });
  const ten = await banDoTen(nc.tx, ds.flatMap((l) => [...l.assigneeIds, l.createdBy]));
  return ds.map((l) => sangLap(l, ten));
}

export async function taoLapViec(nc: NguCanh, d: DuLieuLapViec) {
  batBuocQuyen(nc.hoSo, "task.create", { objectType: "task_recurrence" });
  const ds = await kiemLapViec(nc, d);
  const l = await nc.tx.taskRecurrence.create({ data: { tenantId: nc.tenantId, ...duLieuLap(d, ds), createdBy: nc.hoSo.userId, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "tao", objectType: "task_recurrence", objectId: l.id, after: d });
  return sangLap(l, await banDoTen(nc.tx, [...ds, nc.hoSo.userId]));
}

/** Chỉ người lập lịch sửa / dừng (việc sinh ra nhân danh người đó). */
export async function suaLapViec(nc: NguCanh, id: string, d: DuLieuLapViec) {
  batBuocQuyen(nc.hoSo, "task.create", { objectType: "task_recurrence", objectId: id });
  const goc = await nc.tx.taskRecurrence.findFirst({ where: { id } });
  if (!goc) throw new LoiKhongTimThay("Việc định kỳ");
  if (goc.createdBy !== nc.hoSo.userId) throw new LoiNghiepVu("Chỉ người lập lịch sửa được việc định kỳ này.", 403, "khong-phai-nguoi-tao");
  const ds = await kiemLapViec(nc, d);
  const l = await nc.tx.taskRecurrence.update({ where: { id }, data: { ...duLieuLap(d, ds), updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "sua", objectType: "task_recurrence", objectId: id, after: d });
  return sangLap(l, await banDoTen(nc.tx, [...ds, l.createdBy]));
}

/**
 * Worker: sinh việc định kỳ của hôm nay cho một doanh nghiệp (DG-07). Trả số việc sinh và số người bỏ
 * qua (người lập / người được giao đã nghỉ, ra khỏi phạm vi, mẫu ngừng…). Chạy lại bao nhiêu lần cũng
 * không nhân đôi.
 */
export async function sinhViecDinhKy(tenantId: string, bayGio = new Date()): Promise<{ soViec: number; boQua: number }> {
  return voiTenant(tenantId, async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`lap-viec:${tenantId}`}))`;
    const homNay = ngayVNCua(bayGio);
    const ngayDb = ngayVeDate(homNay);
    const ds = await tx.taskRecurrence.findMany({
      where: { status: "hoat-dong", startDate: { lte: ngayDb }, OR: [{ endDate: null }, { endDate: { gte: ngayDb } }] },
    });
    let soViec = 0;
    let boQua = 0;
    for (const l of ds) {
      const lich = { tanSuat: l.frequency as "ngay" | "tuan" | "thang", thu: l.weekdays, ngayThang: l.monthDay, tuNgay: dateVeNgay(l.startDate), denNgay: l.endDate ? dateVeNgay(l.endDate) : null };
      if (!laNgayLap(lich, homNay)) continue;
      const daCo = new Set(
        (await tx.task.findMany({ where: { recurrenceId: l.id, recurrenceDate: ngayDb }, select: { recurrenceAssigneeId: true } })).map((t) => t.recurrenceAssigneeId),
      );
      const canSinh = l.assigneeIds.filter((n) => !daCo.has(n));
      if (canSinh.length === 0) continue;
      const hoSo = await layHoSoQuyen(tx, l.createdBy);
      if (!hoSo || !hoSo.quyen.has("task.create")) {
        boQua += canSinh.length;
        continue;
      }
      const nc = taoNguCanh(tx, tenantId, hoSo, null, "worker-viec-dinh-ky");
      for (const nguoi of canSinh) {
        const conHoatDong = await tx.user.count({ where: { id: nguoi, status: "hoat-dong", isSystem: false } });
        if (!conHoatDong || !(await trongPhamVi(nc, "task.create", nguoi))) {
          boQua += 1;
          continue;
        }
        // Điểm lưu (savepoint): một việc hỏng (chuỗi duyệt không còn ai…) không làm hỏng cả bản quét.
        await tx.$executeRawUnsafe("SAVEPOINT sinh_viec");
        try {
          await taoViec(
            nc,
            {
              tieuDe: l.title, moTa: l.description, nguoiPhuTrachId: nguoi, uuTien: l.priority as (typeof UU_TIEN)[number],
              han: mocVN(homNay, l.dueMinute), khachHangId: null, leadId: null, coHoiId: null,
              mucKiemTra: Array.isArray(l.checklist) ? (l.checklist as { nhan: string; batBuoc: boolean }[]) : [],
              doKho: l.difficulty, canDuyet: l.needsApproval,
              // QĐ-154: chuỗi khai của lịch đi qua kiểm nghiêm lúc sinh (taoViec) — lịch lập trước luật này mà để
              // đồng nghiệp ngang cấp tự đứng duyệt thì không sinh (bỏ qua, ghi nhật ký); chuỗi trống → mặc định.
              nguoiDuyetIds: l.needsApproval && docChuoiDuyet(l.approvalChain).length
                ? await dungChuoiDuyetChoViec(nc, { chuoi: docChuoiDuyet(l.approvalChain), nguoiLamId: nguoi, nguoiGiaoId: l.createdBy })
                : undefined,
              mauViecId: null,
            },
            { lap: { id: l.id, ngay: ngayDb, nguoiId: nguoi } },
          );
          await tx.$executeRawUnsafe("RELEASE SAVEPOINT sinh_viec");
          soViec += 1;
        } catch (e) {
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT sinh_viec");
          console.warn(`[worker] việc định kỳ ${l.id} cho ${nguoi}: ${e instanceof Error ? e.message : e}`);
          boQua += 1;
        }
      }
      if (l.templateId) await tx.task.updateMany({ where: { recurrenceId: l.id, recurrenceDate: ngayDb, templateId: null }, data: { templateId: l.templateId } });
      await tx.taskRecurrence.update({ where: { id: l.id }, data: { lastRunDate: ngayDb } });
    }
    return { soViec, boQua };
  });
}
