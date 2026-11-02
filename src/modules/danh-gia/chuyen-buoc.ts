import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { taoThongBao } from "@/modules/thong-bao/service";
import { banDoTen } from "@/modules/cham-cong/chung";
import { napBanDoCapTren, type BanDoCapTren } from "./cap-tren";

/**
 * QĐ-135 — người giữ bước đang chờ nghỉ việc / bị khóa / bàn giao: chuyển các bước đó cho **quản lý trực
 * tiếp của người đó**, không có (hoặc đã nghỉ) thì cấp trên tiếp theo, rồi **Giám đốc** (cuối cùng Quản trị).
 * Người nhận lại chính là người làm việc / người viết báo cáo / người được đánh giá, hoặc đã đứng ở cấp
 * khác của cùng chuỗi → đi tiếp lên cấp trên, để **không ai tự duyệt**.
 *
 * Bốn loại bước:
 *  - duyệt việc: dòng `task_approvers` của việc chưa duyệt xong (mở / đang làm / chờ duyệt);
 *  - gia hạn: đề nghị `task_extensions` đang chờ mà người quyết định là người đó;
 *  - báo cáo: báo cáo đã nộp trong `NGAY_BAO_CAO_CHO` ngày, chưa ai nhận xét, của cấp dưới trực tiếp;
 *  - phiếu đánh giá: phiếu chưa gửi chốt (`nhan-vien`, `quan-ly`) có `manager_id` là người đó.
 * Mỗi lần chuyển ghi một dòng `approval_transfers` (chỉ ghi thêm) + kiểm toán, và báo người nhận.
 * Chạy lại không chuyển lại (bước đã rời người đó). Phiếu chờ chốt không cần chuyển: chốt theo quyền
 * (mặc định Giám đốc — QĐ-133), không gắn với một người.
 */

export const NGAY_BAO_CAO_CHO = 14;
export type LyDoChuyen = "ngung-hoat-dong" | "ban-giao" | "tu-duyet";

export interface KetQuaChuyenBuoc {
  viec: number;
  giaHan: number;
  baoCao: number;
  phieu: number;
  /** Bước không tìm được ai nhận (doanh nghiệp không còn Giám đốc / Quản trị nào khác) — để nguyên. */
  khongChuyenDuoc: number;
}

const VIEC_CHUA_DUYET = ["mo", "dang-lam", "cho-duyet"];

function chon(bd: BanDoCapTren, tu: string, loaiTru: (string | null | undefined)[]): string | null {
  return bd.chuoiCapTren(tu).find((x) => !loaiTru.includes(x)) ?? null;
}

async function ghiChuyen(
  nc: NguCanh,
  d: { loai: "task" | "task_extension" | "work_report" | "evaluation"; id: string; taskId?: string | null; cap?: number | null; tu: string; sang: string; lyDo: LyDoChuyen; ghiChu?: string },
) {
  await nc.tx.approvalTransfer.create({
    data: {
      tenantId: nc.tenantId, objectType: d.loai, objectId: d.id, taskId: d.taskId ?? null, level: d.cap ?? null,
      fromUserId: d.tu, toUserId: d.sang, reason: d.lyDo, note: d.ghiChu ?? null, createdBy: nc.hoSo.userId,
    },
  });
}

const NHAN_LY_DO: Record<LyDoChuyen, string> = {
  "ngung-hoat-dong": "đã nghỉ việc / bị khóa tài khoản",
  "ban-giao": "đã bàn giao công việc",
  "tu-duyet": "là người làm việc này",
};

/** Đếm các bước đang chờ một người (xem trước ở màn hình bàn giao). */
export async function demBuocChoCuaNguoi(tx: ClientTenant, nguoiId: string): Promise<{ viec: number; giaHan: number; baoCao: number; phieu: number }> {
  const viec = await tx.taskApprover.count({ where: { approverId: nguoiId, task: { approvedAt: null, status: { in: VIEC_CHUA_DUYET } } } });
  const giaHan = await tx.taskExtension.count({ where: { status: "cho-duyet", OR: [{ approverId: nguoiId }, { approverId: null, task: { OR: [{ assignedBy: nguoiId }, { assignedBy: null, createdBy: nguoiId }] } }] } });
  const baoCao = (await baoCaoChoXet(tx, nguoiId)).length;
  const phieu = await tx.evaluation.count({ where: { managerId: nguoiId, status: { in: ["nhan-vien", "quan-ly"] } } });
  return { viec, giaHan, baoCao, phieu };
}

async function baoCaoChoXet(tx: ClientTenant, nguoiId: string, bayGio = new Date()) {
  const capDuoi = (await tx.staffProfile.findMany({ where: { managerId: nguoiId }, select: { userId: true } })).map((x) => x.userId);
  if (capDuoi.length === 0) return [];
  return tx.workReport.findMany({
    where: { userId: { in: capDuoi }, status: "da-nop", submittedAt: { gte: new Date(bayGio.getTime() - NGAY_BAO_CAO_CHO * 86_400_000) }, comments: { none: {} } },
    select: { id: true, userId: true, kind: true, periodStart: true },
  });
}

/** Chuyển mọi bước đang chờ người `nguoiId` (xem đầu tệp). Gọi trong giao dịch khóa / bàn giao người đó. */
export async function chuyenBuocChoCuaNguoi(nc: NguCanh, nguoiId: string, lyDo: LyDoChuyen, bayGio = new Date()): Promise<KetQuaChuyenBuoc> {
  const bd = await napBanDoCapTren(nc.tx);
  const kq: KetQuaChuyenBuoc = { viec: 0, giaHan: 0, baoCao: 0, phieu: 0, khongChuyenDuoc: 0 };
  const tenNguoi = (await banDoTen(nc.tx, [nguoiId])).get(nguoiId) ?? "Người duyệt";
  const lyDoChu = NHAN_LY_DO[lyDo];

  // 1. Duyệt việc
  const capDuyet = await nc.tx.taskApprover.findMany({
    where: { approverId: nguoiId, task: { approvedAt: null, status: { in: VIEC_CHUA_DUYET } } },
    select: { id: true, taskId: true, level: true },
    orderBy: [{ taskId: "asc" }, { level: "asc" }],
  });
  for (const c of capDuyet) {
    await khoaChungTu(nc.tx, "tasks", c.taskId);
    const v = await nc.tx.task.findUniqueOrThrow({ where: { id: c.taskId }, select: { id: true, title: true, ownerId: true, status: true, approvalLevel: true, approvalRound: true } });
    const chuoi = (await nc.tx.taskApprover.findMany({ where: { taskId: v.id }, select: { approverId: true } })).map((x) => x.approverId);
    const sang = chon(bd, nguoiId, [v.ownerId, ...chuoi]);
    if (!sang) {
      kq.khongChuyenDuoc += 1;
      continue;
    }
    await nc.tx.taskApprover.update({ where: { id: c.id }, data: { approverId: sang } });
    await ghiChuyen(nc, { loai: "task", id: v.id, taskId: v.id, cap: c.level, tu: nguoiId, sang, lyDo });
    const dangCho = v.status === "cho-duyet" && v.approvalLevel === c.level;
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: sang,
      loai: dangCho ? "viec-cho-duyet" : "viec-chuyen-buoc-duyet",
      mucDo: dangCho ? "canh-bao" : "thong-tin",
      tieuDe: `${dangCho ? "Chờ bạn duyệt" : "Bạn thành người duyệt"}${c.level > 1 ? ` (cấp ${c.level})` : ""}: ${v.title}`.slice(0, 300),
      noiDung: `${tenNguoi} ${lyDoChu} — bước duyệt chuyển cho bạn.`,
      duongDan: `/cong-viec/${v.id}`,
      doiTuong: "task",
      doiTuongId: v.id,
      khoaChongTrung: `chuyen-duyet:${v.id}:${c.level}:${sang}:${bayGio.getTime()}`,
    });
    kq.viec += 1;
  }

  // 2. Gia hạn
  const giaHan = await nc.tx.taskExtension.findMany({
    where: { status: "cho-duyet", OR: [{ approverId: nguoiId }, { approverId: null, task: { OR: [{ assignedBy: nguoiId }, { assignedBy: null, createdBy: nguoiId }] } }] },
    select: { id: true, taskId: true, requestedBy: true, task: { select: { title: true, ownerId: true } } },
  });
  for (const g of giaHan) {
    await khoaChungTu(nc.tx, "task_extensions", g.id);
    const sang = chon(bd, nguoiId, [g.requestedBy, g.task.ownerId]);
    if (!sang) {
      kq.khongChuyenDuoc += 1;
      continue;
    }
    await nc.tx.taskExtension.update({ where: { id: g.id }, data: { approverId: sang } });
    await ghiChuyen(nc, { loai: "task_extension", id: g.id, taskId: g.taskId, tu: nguoiId, sang, lyDo });
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: sang, loai: "viec-xin-gia-han", mucDo: "canh-bao",
      tieuDe: `Đề nghị gia hạn chờ bạn quyết định: ${g.task.title}`.slice(0, 300),
      noiDung: `${tenNguoi} ${lyDoChu} — đề nghị gia hạn chuyển cho bạn.`,
      duongDan: `/cong-viec/${g.taskId}`, doiTuong: "task", doiTuongId: g.taskId, khoaChongTrung: `chuyen-gia-han:${g.id}:${sang}`,
    });
    kq.giaHan += 1;
  }

  // 3. Báo cáo chờ xét (người xét = quản lý hiệu lực, tự đi lên khi quản lý nghỉ — chỉ cần báo người nhận mới)
  for (const r of await baoCaoChoXet(nc.tx, nguoiId, bayGio)) {
    const sang = chon(bd, nguoiId, [r.userId]);
    if (!sang) {
      kq.khongChuyenDuoc += 1;
      continue;
    }
    await ghiChuyen(nc, { loai: "work_report", id: r.id, tu: nguoiId, sang, lyDo });
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: sang, loai: "bao-cao-da-nop",
      tieuDe: `Báo cáo chờ bạn xem (${r.periodStart.toISOString().slice(0, 10).split("-").reverse().join("/")})`,
      noiDung: `${tenNguoi} ${lyDoChu} — báo cáo của cấp dưới chuyển cho bạn nhận xét.`,
      duongDan: `/bao-cao-cong-viec/${r.id}`, doiTuong: "work_report", doiTuongId: r.id, khoaChongTrung: `chuyen-bao-cao:${r.id}:${sang}`,
    });
    kq.baoCao += 1;
  }

  // 4. Phiếu đánh giá chờ chấm
  const phieu = await nc.tx.evaluation.findMany({ where: { managerId: nguoiId, status: { in: ["nhan-vien", "quan-ly"] } }, select: { id: true, userId: true } });
  for (const p of phieu) {
    await khoaChungTu(nc.tx, "evaluations", p.id);
    const sang = chon(bd, nguoiId, [p.userId]);
    if (!sang) {
      kq.khongChuyenDuoc += 1;
      continue;
    }
    await nc.tx.evaluation.update({ where: { id: p.id }, data: { managerId: sang } });
    await ghiChuyen(nc, { loai: "evaluation", id: p.id, tu: nguoiId, sang, lyDo });
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: sang, loai: "danh-gia-cho-cham",
      tieuDe: "Phiếu đánh giá chuyển cho bạn chấm",
      noiDung: `${tenNguoi} ${lyDoChu} — bạn là người chấm mới.`,
      duongDan: `/danh-gia/${p.id}`, doiTuong: "evaluation", doiTuongId: p.id, khoaChongTrung: `chuyen-phieu:${p.id}:${sang}`,
    });
    kq.phieu += 1;
  }

  if (kq.viec + kq.giaHan + kq.baoCao + kq.phieu + kq.khongChuyenDuoc > 0) {
    await nc.kiemToan({ action: "chuyen-buoc-duyet", objectType: "user", objectId: nguoiId, after: { lyDo, ...kq } });
  }
  return kq;
}

/**
 * Sau khi việc được chuyển cho `nguoiLamId` (bàn giao): người đó đang đứng trong chuỗi duyệt của chính việc
 * mình làm → cấp đó chuyển lên cấp trên của họ (không ai tự duyệt — DG-21).
 */
export async function goTuDuyet(nc: NguCanh, nguoiLamId: string, bayGio = new Date()): Promise<number> {
  const ds = await nc.tx.taskApprover.findMany({
    where: { approverId: nguoiLamId, task: { ownerId: nguoiLamId, approvedAt: null, status: { in: VIEC_CHUA_DUYET } } },
    select: { id: true, taskId: true, level: true },
  });
  if (ds.length === 0) return 0;
  const bd = await napBanDoCapTren(nc.tx);
  let n = 0;
  for (const c of ds) {
    await khoaChungTu(nc.tx, "tasks", c.taskId);
    const chuoi = (await nc.tx.taskApprover.findMany({ where: { taskId: c.taskId }, select: { approverId: true } })).map((x) => x.approverId);
    const sang = chon(bd, nguoiLamId, chuoi);
    if (!sang) continue;
    await nc.tx.taskApprover.update({ where: { id: c.id }, data: { approverId: sang } });
    await ghiChuyen(nc, { loai: "task", id: c.taskId, taskId: c.taskId, cap: c.level, tu: nguoiLamId, sang, lyDo: "tu-duyet" });
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: sang, loai: "viec-chuyen-buoc-duyet",
      tieuDe: `Bạn thành người duyệt${c.level > 1 ? ` (cấp ${c.level})` : ""} của một việc được bàn giao`,
      noiDung: "Người nhận bàn giao đang đứng trong chuỗi duyệt của chính việc mình làm — bước duyệt chuyển lên bạn.",
      duongDan: `/cong-viec/${c.taskId}`, doiTuong: "task", doiTuongId: c.taskId, khoaChongTrung: `tu-duyet:${c.taskId}:${c.level}:${sang}:${bayGio.getTime()}`,
    });
    n += 1;
  }
  return n;
}
