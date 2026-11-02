import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { chuoiTuyChon, kiemTraNguoiPhuTrach, locTheoPhamVi, thoiDiemTuyChon, trongPhamVi, uuidTuyChon } from "@/modules/crm/chung";
import { DANH_GIA_KET_QUA, NHAN_DANH_GIA_KET_QUA, TRANG_THAI_VIEC, UU_TIEN } from "@/modules/crm/hang-so";
import { batBuocThayKhach } from "@/modules/khach-hang/service";
import { danhGiaHoSoKhach } from "@/modules/khach-hang/ho-so";
import { batBuocThayCoHoi } from "@/modules/co-hoi/service";
import { batBuocThayLead } from "@/modules/lead/service";
import { taoThongBao } from "@/modules/thong-bao/service";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { nguoiXemDuocDanhGia } from "@/modules/danh-gia/chung";
import { TOI_DA_CAP_DUYET, TOI_DA_NGUOI_MOT_LAN_GIAO } from "@/modules/danh-gia/tinh-toan";
import { DO_DAI_KET_QUA_TOI_THIEU, kiemTraTruocKhiXong, type KetQuaKiemTra } from "./kiem-tra";
import { baoChoDuyet, chuoiDuyetCuaViec, dungChuoiDuyetChoViec, ghiNhatKyDuyet, ghiChuoiDuyet, kiemNguoiDuyet, mauViecDung } from "./duyet";

/**
 * Công việc — việc SẮP làm, có hạn ("Activity" trong prompt). Luật CV-01 → CV-11.
 * Quyền `task.*`, phạm vi theo `tasks.owner_id`.
 *
 * 0.17.0 "Công việc thông suốt": việc xong phải có kết quả (CV-04, CV-05), máy kiểm tra trước
 * khi cho xong (CV-06), danh sách kiểm tra (CV-07), báo cho người nhận khi được giao và cho
 * người giao khi xong (CV-08), "Cần làm tiếp" phải hẹn việc tiếp theo (CV-09), đính kèm (CV-10).
 *
 * 0.20.0 (BUSINESS_RULES mục 31): độ khó, cờ "cần duyệt" + chuỗi người duyệt (DG-01, DG-02, DG-21),
 * người được giao phải Nhận / Từ chối (DG-03), đổi hạn việc người khác giao phải xin gia hạn (DG-05),
 * mẫu việc (DG-06), giao nhiều người (DG-08); việc cần duyệt bấm Xong thì sang `cho-duyet` (DG-20).
 * Nhận / từ chối, tiến độ, gia hạn, duyệt / trả lại / chấm điểm nằm ở `giao-viec.ts`.
 */

/** Tối đa mục kiểm tra trên một việc — trần kỹ thuật, không phải chính sách. */
export const TOI_DA_MUC_KIEM_TRA = 30;

const LuocDoMucKiemTra = z.object({
  nhan: z.string().trim().min(2, "Mục kiểm tra tối thiểu 2 ký tự.").max(300),
  batBuoc: z.boolean().optional().default(true),
});

export const LuocDoTaoViec = z.object({
  tieuDe: z.string().trim().min(3, "Tiêu đề tối thiểu 3 ký tự.").max(255),
  moTa: chuoiTuyChon(5000),
  nguoiPhuTrachId: uuidTuyChon,
  uuTien: z.enum(UU_TIEN).optional().default("trung-binh"),
  han: thoiDiemTuyChon,
  khachHangId: uuidTuyChon,
  leadId: uuidTuyChon,
  coHoiId: uuidTuyChon,
  /** 0.17.0 — danh sách kiểm tra lập cùng lúc với việc. */
  mucKiemTra: z.array(LuocDoMucKiemTra).max(TOI_DA_MUC_KIEM_TRA, `Tối đa ${TOI_DA_MUC_KIEM_TRA} mục kiểm tra.`).optional().default([]),
  /** 0.20.0 — độ khó 1–5 (trống = theo mẫu, không mẫu = 3). */
  doKho: z.coerce.number().int().min(1, "Độ khó từ 1 đến 5.").max(5, "Độ khó từ 1 đến 5.").optional(),
  /** Trống = mặc định: bật khi giao cho người khác, tắt khi tự tạo (DG-02). */
  canDuyet: z.boolean().optional(),
  /** Chuỗi người duyệt theo thứ tự cấp. Trống = theo mẫu, không mẫu = người giao (DG-21). */
  nguoiDuyetIds: z.array(z.uuid()).max(TOI_DA_CAP_DUYET, `Tối đa ${TOI_DA_CAP_DUYET} cấp duyệt.`).optional(),
  mauViecId: uuidTuyChon,
  /** Giao cho nhiều người: mỗi người một việc, chung một nhóm (DG-08). */
  nguoiPhuTrachIds: z.array(z.uuid()).max(TOI_DA_NGUOI_MOT_LAN_GIAO, `Tối đa ${TOI_DA_NGUOI_MOT_LAN_GIAO} người một lần giao.`).optional(),
});
/** Kết quả đã qua lược đồ; `mucKiemTra` tùy chọn để mọi chỗ gọi cũ (trợ lý AI, bài thử) giữ nguyên. */
export type DuLieuTaoViec = Omit<z.infer<typeof LuocDoTaoViec>, "mucKiemTra"> & { mucKiemTra?: z.infer<typeof LuocDoMucKiemTra>[] };

/** Gắn thêm khi tạo từ máy (việc định kỳ, vướng mắc báo cáo, giao nhiều người) — không nhận từ API. */
export interface ThemKhiTaoViec {
  nhomId?: string;
  lap?: { id: string; ngay: Date; nguoiId: string };
  baoCaoId?: string;
}

const LuocDoViecTiepTheo = z.object({
  tieuDe: z.string().trim().min(3, "Việc tiếp theo tối thiểu 3 ký tự.").max(255),
  han: thoiDiemTuyChon,
});

const ketQuaTuyChon = z
  .string()
  .trim()
  .max(5000, "Tối đa 5.000 ký tự.")
  .transform((s) => (s === "" ? null : s))
  .nullable()
  .optional();

export const LuocDoSuaViec = z.object({
  tieuDe: z.string().trim().min(3).max(255).optional(),
  moTa: chuoiTuyChon(5000),
  nguoiPhuTrachId: uuidTuyChon,
  uuTien: z.enum(UU_TIEN).optional(),
  han: thoiDiemTuyChon,
  trangThai: z.enum(TRANG_THAI_VIEC).optional(),
  /** 0.17.0 — kết quả và đánh giá (CV-04). Gửi cùng `trangThai: "xong"` hoặc ghi riêng. */
  ketQua: ketQuaTuyChon,
  danhGia: z.enum(DANH_GIA_KET_QUA).nullable().optional(),
  /** CV-09 — việc tiếp theo tạo cùng lúc với lần đánh dấu xong. */
  viecTiepTheo: LuocDoViecTiepTheo.nullable().optional(),
  /** 0.20.0 — chỉ người giao / quản lý (không phải người làm việc được giao) đổi được (DG-02). */
  doKho: z.coerce.number().int().min(1).max(5).optional(),
  canDuyet: z.boolean().optional(),
  nguoiDuyetIds: z.array(z.uuid()).max(TOI_DA_CAP_DUYET).optional(),
});
export type DuLieuSuaViec = z.infer<typeof LuocDoSuaViec>;

export const LuocDoKiemTraViec = z.object({
  ketQua: z.string().max(5000).optional(),
  danhGia: z.union([z.enum(DANH_GIA_KET_QUA), z.literal("")]).optional(),
  coViecTiepTheo: z.union([z.boolean(), z.enum(["1", "0", "true", "false"])]).optional(),
});

export const LuocDoLocViec = z.object({
  /** cua-toi | toi-giao | qua-han | tat-ca (trong phạm vi) | cho-toi-duyet | cho-nhan (0.20.0) */
  cheDo: z.enum(["cua-toi", "toi-giao", "qua-han", "tat-ca", "cho-toi-duyet", "cho-nhan"]).optional().default("cua-toi"),
  /** "" = đang mở (mo + dang-lam + cho-duyet); "tat-ca"; hoặc một trạng thái */
  trangThai: z.enum(["", "tat-ca", ...TRANG_THAI_VIEC]).optional().default(""),
  nguoiPhuTrach: z.union([z.uuid(), z.literal("")]).optional().default(""),
  q: z.string().trim().max(100).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(30),
  /** Mở đúng một công việc (liên kết từ Customer 360, dòng thời gian). */
  id: z.union([z.uuid(), z.literal("")]).optional().default(""),
});
export type BoLocViec = z.infer<typeof LuocDoLocViec>;

/** Việc còn phải làm (tính quá hạn). */
const CHUA_XONG = ["mo", "dang-lam"];
/** Việc chưa khép lại: còn làm hoặc đang chờ duyệt (lọc mặc định). */
const DANG_MO = ["mo", "dang-lam", "cho-duyet"];

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
  createdBy: true,
  result: true,
  outcome: true,
  resultAt: true,
  assignedBy: true,
  assignedAt: true,
  difficulty: true,
  needsApproval: true,
  acceptStatus: true,
  acceptedAt: true,
  declinedAt: true,
  declineReason: true,
  progress: true,
  groupId: true,
  templateId: true,
  recurrenceId: true,
  originalDueAt: true,
  submittedAt: true,
  approvalRound: true,
  approvalLevel: true,
  approvedAt: true,
  qualityScore: true,
  onTimeFactor: true,
  taskScore: true,
  owner: { select: { id: true, fullName: true } },
  assigner: { select: { id: true, fullName: true } },
  resultUser: { select: { id: true, fullName: true } },
  customer: { select: { id: true, code: true, name: true } },
  lead: { select: { id: true, code: true, fullName: true } },
  opportunity: { select: { id: true, code: true, title: true } },
  checklist: { where: { removedAt: null }, select: { required: true, doneAt: true } },
} satisfies Prisma.TaskSelect;

type BanGhiViec = Prisma.TaskGetPayload<{ select: typeof CHON_VIEC }>;

function chuyenDoi(v: BanGhiViec) {
  const batBuoc = v.checklist.filter((m) => m.required);
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
    /** Người giao. Việc do hệ thống tự tạo (lead mới) thì null. */
    nguoiGiao: v.assigner ? { id: v.assigner.id, hoTen: v.assigner.fullName } : null,
    giaoLuc: v.assignedAt ?? v.createdAt,
    ketQua: v.result,
    danhGia: v.outcome,
    ketQuaLuc: v.resultAt,
    nguoiGhiKetQua: v.resultUser ? { id: v.resultUser.id, hoTen: v.resultUser.fullName } : null,
    khachHang: v.customer ? { id: v.customer.id, ma: v.customer.code, ten: v.customer.name } : null,
    lead: v.lead ? { id: v.lead.id, ma: v.lead.code, ten: v.lead.fullName } : null,
    coHoi: v.opportunity ? { id: v.opportunity.id, ma: v.opportunity.code, ten: v.opportunity.title } : null,
    quaHan: CHUA_XONG.includes(v.status) && !!v.dueAt && v.dueAt < new Date(),
    // 0.20.0
    doKho: v.difficulty,
    canDuyet: v.needsApproval,
    trangThaiNhan: v.acceptStatus,
    nhanLuc: v.acceptedAt,
    tuChoiLuc: v.declinedAt,
    lyDoTuChoi: v.declineReason,
    tienDo: v.progress,
    nhomId: v.groupId,
    mauViecId: v.templateId,
    lapId: v.recurrenceId,
    hanBanDau: v.originalDueAt,
    guiDuyetLuc: v.submittedAt,
    lanGuiDuyet: v.approvalRound,
    capDangCho: v.approvalLevel,
    duyetLuc: v.approvedAt,
    /** Điểm chỉ hiện cho người xem được đánh giá của người làm (DG-80) — `anDiem` gỡ khi không. */
    chatLuong: v.qualityScore as number | null,
    heSoDungHan: v.onTimeFactor === null ? null : Number(v.onTimeFactor),
    diemViec: v.taskScore === null ? null : Number(v.taskScore),
    kiemTra: {
      tong: v.checklist.length,
      daTich: v.checklist.filter((m) => m.doneAt).length,
      batBuocConThieu: batBuoc.filter((m) => !m.doneAt).length,
    },
  };
}
export type CongViec = ReturnType<typeof chuyenDoi>;

/** Gỡ điểm khỏi việc khi người xem không được xem đánh giá của người làm (trợ lý AI luôn rơi vào đây). */
export function anDiem<T extends CongViec>(v: T, xemDuoc: boolean): T {
  return xemDuoc ? v : { ...v, chatLuong: null, heSoDungHan: null, diemViec: null };
}
async function boLocDiem(nc: NguCanh): Promise<(ownerId: string) => boolean> {
  const pv = await nguoiXemDuocDanhGia(nc);
  return (id) => pv === "tat-ca" || pv.includes(id);
}

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
    ketQua: v.ketQua,
    danhGia: v.danhGia,
    doKho: v.doKho,
    canDuyet: v.canDuyet,
  };
}

export const duongDanViec = (id: string) => `/cong-viec/${id}`;

export async function danhSachViec(nc: NguCanh, boLoc: BoLocViec) {
  batBuocQuyen(nc.hoSo, "task.view");
  // "Chờ tôi duyệt": quan hệ người duyệt cho thấy việc dù người làm ngoài phạm vi (DG-21).
  const dieuKien: Prisma.TaskWhereInput[] =
    boLoc.cheDo === "cho-toi-duyet" && !boLoc.id
      ? [{ id: { in: await viecChoToiDuyet(nc) } }]
      : [await dieuKienXemViec(nc)];
  // Mở đúng một việc: bỏ qua chế độ và trạng thái, vẫn giữ phạm vi.
  if (boLoc.id) {
    dieuKien.push({ id: boLoc.id });
    boLoc = { ...boLoc, cheDo: "tat-ca", trangThai: "tat-ca" };
  }
  if (boLoc.cheDo === "cho-toi-duyet" && boLoc.trangThai === "") boLoc = { ...boLoc, trangThai: "tat-ca" };
  if (boLoc.cheDo === "cua-toi") dieuKien.push({ ownerId: nc.hoSo.userId });
  if (boLoc.cheDo === "cho-nhan") dieuKien.push({ ownerId: nc.hoSo.userId, acceptStatus: "cho-nhan" });
  // "Tôi giao": việc mình giao cho NGƯỜI KHÁC — để người giao theo dõi được tới lúc xong (CV-08).
  if (boLoc.cheDo === "toi-giao") dieuKien.push({ assignedBy: nc.hoSo.userId, ownerId: { not: nc.hoSo.userId } });
  if (boLoc.cheDo === "qua-han") dieuKien.push({ status: { in: CHUA_XONG }, dueAt: { lt: new Date() } });
  if (boLoc.trangThai === "") dieuKien.push({ status: { in: DANG_MO } });
  else if (boLoc.trangThai !== "tat-ca") dieuKien.push({ status: boLoc.trangThai });
  if (boLoc.nguoiPhuTrach) dieuKien.push({ ownerId: boLoc.nguoiPhuTrach });
  if (boLoc.q) dieuKien.push({ OR: [{ title: { contains: boLoc.q, mode: "insensitive" } }, { customer: { name: { contains: boLoc.q, mode: "insensitive" } } }] });

  const where: Prisma.TaskWhereInput = { AND: dieuKien };
  // Tuần tự, không Promise.all trong giao dịch (cảnh báo của `pg`, mục 4 kế hoạch).
  const tong = await nc.tx.task.count({ where });
  const dong = await nc.tx.task.findMany({
    where,
    select: CHON_VIEC,
    orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    skip: (boLoc.trang - 1) * boLoc.coTrang,
    take: boLoc.coTrang,
  });
  const soQuaHanCuaToi = await nc.tx.task.count({ where: { ownerId: nc.hoSo.userId, status: { in: CHUA_XONG }, dueAt: { lt: new Date() } } });
  const pvSua = coQuyen(nc.hoSo, "task.update");
  const xemDiem = await boLocDiem(nc);
  const ketQua = [];
  for (const v of dong) ketQua.push({ ...anDiem(chuyenDoi(v), xemDiem(v.ownerId)), duocSua: pvSua && (await trongPhamVi(nc, "task.update", v.ownerId)) });
  const soChoToiDuyet = (await viecChoToiDuyet(nc)).length;
  const soChoNhan = await nc.tx.task.count({ where: { ownerId: nc.hoSo.userId, acceptStatus: "cho-nhan", status: { in: CHUA_XONG } } });
  return { tong, trang: boLoc.trang, coTrang: boLoc.coTrang, dong: ketQua, soQuaHanCuaToi, soChoToiDuyet, soChoNhan };
}

/**
 * Điều kiện Prisma "người đang xem thấy được việc này" — tệp đính kèm mượn đúng điều kiện này (DK-02).
 * 0.20.0: ngoài phạm vi `task.view`, người giao và người trong chuỗi duyệt luôn thấy việc (DG-21).
 */
export async function dieuKienXemViec(nc: NguCanh): Promise<Prisma.TaskWhereInput> {
  const pv = await locTheoPhamVi(nc, "task.view");
  if (!pv.ownerId) return {};
  return { OR: [pv, { assignedBy: nc.hoSo.userId }, { approvers: { some: { approverId: nc.hoSo.userId } } }] };
}

/** Id các việc đang chờ CHÍNH tôi duyệt ở cấp hiện tại. */
export async function viecChoToiDuyet(nc: NguCanh): Promise<string[]> {
  const dong = await nc.tx.$queryRaw<{ id: string }[]>`
    SELECT t.id::text AS id FROM tasks t
    JOIN task_approvers a ON a.task_id = t.id AND a.level = t.approval_level
    WHERE t.status = 'cho-duyet' AND a.approver_id = ${nc.hoSo.userId}::uuid`;
  return dong.map((d) => d.id);
}

export async function docViecTrongPhamVi(nc: NguCanh, id: string) {
  const v = await nc.tx.task.findFirst({ where: { AND: [{ id }, await dieuKienXemViec(nc)] }, select: CHON_VIEC });
  if (!v) throw new LoiKhongTimThay("Công việc");
  return v;
}
export type { BanGhiViec };
export { chuyenDoi, CHON_VIEC };

export async function batBuocSuaDuoc(nc: NguCanh, v: { ownerId: string }) {
  if (!(await trongPhamVi(nc, "task.update", v.ownerId))) {
    throw new LoiNghiepVu("Bạn chỉ xem được công việc này, không sửa được.", 403, "ngoai-pham-vi");
  }
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

// ---------------------------------------------------------------------------
// Thông báo (CV-08) — chỉ báo người KHÁC người đang thao tác; không ai cần tự báo mình.
// ---------------------------------------------------------------------------

async function baoDuocGiao(nc: NguCanh, v: CongViec, laChuyen: boolean) {
  if (v.nguoiPhuTrach.id === nc.hoSo.userId) return;
  const gan = v.khachHang ? ` — ${v.khachHang.ten}` : v.lead ? ` — lead ${v.lead.ma}` : "";
  await taoThongBao(nc.tx, nc.tenantId, {
    nguoiNhanId: v.nguoiPhuTrach.id,
    loai: "viec-duoc-giao",
    mucDo: v.uuTien === "khan" ? "khan" : v.uuTien === "cao" ? "canh-bao" : "thong-tin",
    tieuDe: `${laChuyen ? "Được chuyển việc" : "Được giao việc"}: ${v.tieuDe}`.slice(0, 300),
    noiDung: `${nc.hoSo.hoTen} ${laChuyen ? "chuyển" : "giao"} cho bạn${gan}.${v.han ? ` Hạn: ${dinhDangNgayGio(v.han)}.` : " Không có hạn."}${v.trangThaiNhan === "cho-nhan" ? " Mở việc để bấm Nhận, hoặc Từ chối kèm lý do." : ""}${v.canDuyet ? " Việc cần duyệt khi xong." : ""}`,
    duongDan: duongDanViec(v.id),
    doiTuong: "task",
    doiTuongId: v.id,
    // Chống trùng theo đúng lần giao: giao lại cho cùng người ở lần sau vẫn báo.
    khoaChongTrung: `viec-giao:${v.id}:${v.nguoiPhuTrach.id}:${v.giaoLuc.getTime()}`,
  });
}

async function baoChuyenDi(nc: NguCanh, v: CongViec, nguoiCuId: string) {
  if (nguoiCuId === nc.hoSo.userId) return;
  await taoThongBao(nc.tx, nc.tenantId, {
    nguoiNhanId: nguoiCuId,
    loai: "viec-chuyen-di",
    tieuDe: `Việc đã chuyển sang ${v.nguoiPhuTrach.hoTen}: ${v.tieuDe}`.slice(0, 300),
    noiDung: `${nc.hoSo.hoTen} đã chuyển việc này cho ${v.nguoiPhuTrach.hoTen}. Bạn không cần làm tiếp.`,
    duongDan: duongDanViec(v.id),
    doiTuong: "task",
    doiTuongId: v.id,
  });
}

async function baoDaXong(nc: NguCanh, v: CongViec, nguoiTaoId: string | null) {
  // Báo người giao; việc tự tạo hoặc người giao đã ngừng thì báo người tạo.
  const nhan = v.nguoiGiao?.id ?? nguoiTaoId;
  if (!nhan || nhan === nc.hoSo.userId) return;
  const conHoatDong = await nc.tx.user.count({ where: { id: nhan, status: "hoat-dong" } });
  if (!conHoatDong) return;
  await taoThongBao(nc.tx, nc.tenantId, {
    nguoiNhanId: nhan,
    loai: "viec-da-xong",
    mucDo: v.danhGia === "khong-dat" ? "canh-bao" : "thong-tin",
    tieuDe: `${v.nguoiPhuTrach.hoTen} đã xong: ${v.tieuDe}`.slice(0, 300),
    noiDung: `Đánh giá: ${NHAN_DANH_GIA_KET_QUA[v.danhGia ?? ""] ?? "—"}. Kết quả: ${(v.ketQua ?? "").slice(0, 400)}`,
    duongDan: duongDanViec(v.id),
    doiTuong: "task",
    doiTuongId: v.id,
    khoaChongTrung: `viec-xong:${v.id}:${v.xongLuc?.getTime() ?? 0}`,
  });
}

// ---------------------------------------------------------------------------
// Tạo, sửa, hoàn thành
// ---------------------------------------------------------------------------

export async function taoViec(nc: NguCanh, dauVao: DuLieuTaoViec, them: ThemKhiTaoViec = {}) {
  batBuocQuyen(nc.hoSo, "task.create", { objectType: "task" });
  // DG-06: mẫu việc điền phần người giao bỏ trống (danh sách kiểm tra, độ khó, cần duyệt, hạn, chuỗi duyệt).
  const mau = dauVao.mauViecId ? await mauViecDung(nc, dauVao.mauViecId) : null;
  const d = {
    ...dauVao,
    mucKiemTra: dauVao.mucKiemTra?.length ? dauVao.mucKiemTra : (mau?.mucKiemTra ?? []),
    han: dauVao.han ?? (mau?.soNgayHan !== null && mau?.soNgayHan !== undefined ? new Date(Date.now() + mau.soNgayHan * 86_400_000) : null),
  };
  const ownerId = d.nguoiPhuTrachId ?? nc.hoSo.userId;
  await kiemTraNguoiPhuTrach(nc, "task.create", ownerId);
  const khachId = await kiemTraGanKem(nc, d);
  const bayGio = new Date();
  const giaoNguoiKhac = ownerId !== nc.hoSo.userId;
  // DG-02: mặc định cần duyệt khi giao cho người khác, tự tạo thì không; người giao tắt / bật được.
  const canDuyet = d.canDuyet ?? mau?.canDuyet ?? giaoNguoiKhac;
  let chuoi: string[] = [];
  if (canDuyet) {
    chuoi = d.nguoiDuyetIds?.length
      ? d.nguoiDuyetIds
      : await dungChuoiDuyetChoViec(nc, { chuoi: mau?.chuoiDuyet ?? [], nguoiLamId: ownerId, nguoiGiaoId: nc.hoSo.userId });
    await kiemNguoiDuyet(nc, chuoi, ownerId);
  }

  const v = await nc.tx.task.create({
    data: {
      tenantId: nc.tenantId,
      title: d.tieuDe,
      description: d.moTa ?? mau?.moTa ?? null,
      ownerId,
      priority: d.uuTien,
      dueAt: d.han ?? null,
      originalDueAt: d.han ?? null,
      customerId: khachId,
      leadId: d.leadId ?? null,
      opportunityId: d.coHoiId ?? null,
      createdBy: nc.hoSo.userId,
      updatedBy: nc.hoSo.userId,
      assignedBy: nc.hoSo.userId,
      assignedAt: bayGio,
      difficulty: d.doKho ?? mau?.doKho ?? 3,
      needsApproval: canDuyet,
      // DG-03: giao cho người khác thì người đó phải Nhận hoặc Từ chối.
      acceptStatus: giaoNguoiKhac ? "cho-nhan" : null,
      templateId: mau?.id ?? null,
      groupId: them.nhomId ?? null,
      recurrenceId: them.lap?.id ?? null,
      recurrenceDate: them.lap?.ngay ?? null,
      recurrenceAssigneeId: them.lap?.nguoiId ?? null,
      sourceReportId: them.baoCaoId ?? null,
      checklist: d.mucKiemTra.length
        ? {
            create: d.mucKiemTra.map((m, i) => ({
              tenantId: nc.tenantId,
              label: m.nhan,
              required: m.batBuoc,
              position: i,
              createdBy: nc.hoSo.userId,
            })),
          }
        : undefined,
    },
    select: CHON_VIEC,
  });
  if (chuoi.length) await ghiChuoiDuyet(nc, v.id, chuoi);
  const kq = chuyenDoi(v);
  await nc.kiemToan({
    action: "tao", objectType: "task", objectId: v.id,
    after: { ...anhChup(kq), soMucKiemTra: d.mucKiemTra.length, nguoiDuyet: chuoi, mauViecId: mau?.id ?? null, nhomId: them.nhomId ?? null },
  });
  await nc.suKien({ eventType: SU_KIEN.TASK_CREATED, objectType: "task", objectId: v.id, payload: { nguoiPhuTrachId: ownerId } });
  if (ownerId !== nc.hoSo.userId) {
    await nc.suKien({ eventType: SU_KIEN.TASK_ASSIGNED, objectType: "task", objectId: v.id, payload: { nguoiPhuTrachId: ownerId } });
  }
  await baoDuocGiao(nc, kq, false);
  return kq;
}

/** Đọc hồ sơ khách gắn với việc để cảnh báo (HS-04). Không thấy khách thì không cảnh báo. */
async function hoSoKhachCuaViec(nc: NguCanh, khachHangId: string | null) {
  if (!khachHangId || !coQuyen(nc.hoSo, "customer.view")) return null;
  const k = await nc.tx.customer.findFirst({
    where: { id: khachHangId, ...(await locTheoPhamVi(nc, "customer.view")) },
    select: {
      name: true, customerType: true, taxCode: true, phone: true, email: true, address: true,
      province: true, industry: true, source: true,
      _count: { select: { contacts: { where: { status: "hoat-dong" } } } },
    },
  });
  if (!k) return null;
  const hs = danhGiaHoSoKhach({
    loaiKhach: k.customerType, maSoThue: k.taxCode, dienThoai: k.phone, email: k.email, diaChi: k.address,
    tinhThanh: k.province, nganh: k.industry, nguon: k.source, soLienHe: k._count.contacts,
  });
  return { tenKhach: k.name, thieuBatBuoc: hs.thieuBatBuoc, diem: hs.diem };
}

async function mucKiemTraCuaViec(nc: NguCanh, taskId: string) {
  return nc.tx.taskChecklistItem.findMany({
    where: { taskId, removedAt: null },
    select: { label: true, required: true, doneAt: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

/** CV-06: chạy đúng bộ kiểm tra mà service sẽ chạy khi ghi. */
async function chayKiemTra(
  nc: NguCanh,
  v: BanGhiViec,
  d: { ketQua?: string | null; danhGia?: string | null; coViecTiepTheo: boolean },
): Promise<KetQuaKiemTra> {
  const muc = await mucKiemTraCuaViec(nc, v.id);
  return kiemTraTruocKhiXong({
    trangThai: v.status,
    ketQua: d.ketQua !== undefined ? d.ketQua : v.result,
    danhGia: d.danhGia !== undefined ? d.danhGia : v.outcome,
    mucKiemTra: muc.map((m) => ({ nhan: m.label, batBuoc: m.required, daTich: !!m.doneAt })),
    coViecTiepTheo: d.coViecTiepTheo,
    hoSoKhach: await hoSoKhachCuaViec(nc, v.customer?.id ?? null),
  });
}

/** Xem trước: nếu bấm "Xong" bây giờ thì máy có cho không, và vì sao. Không ghi gì. */
export async function kiemTraViec(nc: NguCanh, id: string, d: z.infer<typeof LuocDoKiemTraViec>) {
  batBuocQuyen(nc.hoSo, "task.view");
  const v = await docViecTrongPhamVi(nc, id);
  return chayKiemTra(nc, v, {
    ketQua: d.ketQua,
    danhGia: d.danhGia === undefined ? undefined : d.danhGia || null,
    coViecTiepTheo: d.coViecTiepTheo === true || d.coViecTiepTheo === "1" || d.coViecTiepTheo === "true",
  });
}

export async function suaViec(nc: NguCanh, id: string, d: DuLieuSuaViec) {
  batBuocQuyen(nc.hoSo, "task.update", { objectType: "task", objectId: id });
  // 0.20.0: khóa dòng việc trước khi đọc — hoàn thành / gửi duyệt và duyệt không chạy chéo nhau (QĐ-77).
  await khoaChungTu(nc.tx, "tasks", id);
  const goc = await docViecTrongPhamVi(nc, id);
  await batBuocSuaDuoc(nc, goc);
  const truoc = chuyenDoi(goc);
  const toi = nc.hoSo.userId;
  const doiNguoi = !!d.nguoiPhuTrachId && d.nguoiPhuTrachId !== goc.ownerId;
  if (doiNguoi) await kiemTraNguoiPhuTrach(nc, "task.update", d.nguoiPhuTrachId!);

  const trangThaiMoi = d.trangThai ?? goc.status;
  const xongMoi = trangThaiMoi === "xong" && goc.status !== "xong";
  const laNguoiLam = goc.ownerId === toi;
  // Việc người khác giao cho mình: người làm không tự đổi độ khó, cờ duyệt, người duyệt, hạn (DG-02, DG-05).
  const viecDuocGiao = laNguoiLam && !!goc.assignedBy && goc.assignedBy !== toi;

  // DG-20: đang chờ duyệt thì chỉ người duyệt thao tác (duyệt / trả lại) — không sửa, không giao lại.
  if (goc.status === "cho-duyet") {
    throw new LoiNghiepVu("Việc đang chờ duyệt. Người duyệt duyệt hoặc trả lại trước khi sửa.", 409, "dang-cho-duyet");
  }
  if (d.trangThai === "cho-duyet") {
    throw new LoiNghiepVu("Bấm Xong để gửi duyệt — không đặt thẳng trạng thái chờ duyệt.", 422, "sai-trang-thai");
  }
  // DG-31: việc đã duyệt + chấm điểm không mở lại, không sửa kết quả; sai thì điều chỉnh điểm có lý do.
  const doiKetQuaYeuCau = d.ketQua !== undefined || d.danhGia !== undefined;
  if (goc.approvedAt && ((d.trangThai !== undefined && d.trangThai !== goc.status) || doiKetQuaYeuCau)) {
    throw new LoiNghiepVu("Việc đã được duyệt và chấm điểm nên không mở lại / sửa kết quả được. Sai điểm thì điều chỉnh điểm kèm lý do.", 409, "viec-da-duyet");
  }
  // DG-03: đã từ chối thì người làm không làm tiếp; người giao giao lại / sửa rồi gửi lại.
  if (goc.acceptStatus === "tu-choi" && laNguoiLam && !doiNguoi && (d.trangThai !== undefined || doiKetQuaYeuCau)) {
    throw new LoiNghiepVu("Bạn đã từ chối việc này. Người giao sẽ giao lại hoặc sửa rồi gửi lại.", 409, "viec-da-tu-choi");
  }
  if (viecDuocGiao && (d.doKho !== undefined || d.canDuyet !== undefined || d.nguoiDuyetIds !== undefined)) {
    throw new LoiNghiepVu("Độ khó, cờ cần duyệt và người duyệt do người giao đặt.", 403, "chi-nguoi-giao");
  }
  const hanCu = goc.dueAt?.getTime() ?? null;
  const doiHan = d.han !== undefined && (d.han?.getTime() ?? null) !== hanCu;
  if (doiHan && viecDuocGiao) {
    throw new LoiNghiepVu("Việc do người khác giao: muốn đổi hạn thì gửi đề nghị gia hạn để người giao duyệt.", 403, "phai-xin-gia-han");
  }
  // DG-31 (QA 0.20.0): việc đã chấm điểm thì mọi thứ quyết định điểm / KPI cũng khóa — người làm (điểm chạy
  // sang người khác), độ khó, cờ duyệt, chuỗi duyệt (ai được điều chỉnh điểm), hạn (tỷ lệ đúng hạn).
  if (goc.approvedAt) {
    const doiChuoi = d.nguoiDuyetIds !== undefined && d.nguoiDuyetIds.join() !== (await chuoiDuyetCuaViec(nc.tx, id)).join();
    if (doiNguoi || doiHan || doiChuoi || (d.doKho !== undefined && d.doKho !== goc.difficulty) || (d.canDuyet !== undefined && d.canDuyet !== goc.needsApproval)) {
      throw new LoiNghiepVu("Việc đã được duyệt và chấm điểm nên không đổi người làm, độ khó, người duyệt hay hạn được. Sai điểm thì điều chỉnh điểm kèm lý do.", 409, "viec-da-duyet");
    }
  }

  // Việc cũ (trước 0.17) đã xong mà chưa có kết quả: chỉ được mở lại hoặc ghi kết quả,
  // không lặng lẽ sửa thứ khác cho tới khi có kết quả (CV-05).
  if (goc.status === "xong" && trangThaiMoi === "xong" && !goc.result && !d.ketQua) {
    throw new LoiNghiepVu("Việc này xong từ trước khi có luật ghi kết quả. Ghi kết quả trước, hoặc mở lại việc rồi sửa.", 422, "thieu-ket-qua");
  }

  // Kết quả và đánh giá đi cùng nhau (CHECK tasks_ket_qua_di_cung_check).
  const ketQuaMoi = d.ketQua !== undefined ? d.ketQua : goc.result;
  const danhGiaMoi = d.danhGia !== undefined ? d.danhGia : goc.outcome;
  const doiKetQua = (d.ketQua !== undefined && d.ketQua !== goc.result) || (d.danhGia !== undefined && d.danhGia !== goc.outcome);
  if (doiKetQua) {
    if (!ketQuaMoi !== !danhGiaMoi) {
      throw new LoiDinhDang(
        ketQuaMoi ? "danhGia" : "ketQua",
        ketQuaMoi ? "Chọn đánh giá cho kết quả này." : "Ghi kết quả cho đánh giá này.",
      );
    }
    if (ketQuaMoi && ketQuaMoi.trim().length < DO_DAI_KET_QUA_TOI_THIEU) {
      throw new LoiNghiepVu(`Kết quả tối thiểu ${DO_DAI_KET_QUA_TOI_THIEU} ký tự.`, 422, "thieu-ket-qua");
    }
  }
  if (doiKetQua && !ketQuaMoi && trangThaiMoi === "xong") {
    throw new LoiNghiepVu("Việc đã xong phải giữ kết quả. Mở lại việc nếu muốn bỏ kết quả.", 422, "thieu-ket-qua");
  }
  if (d.viecTiepTheo && !xongMoi) {
    throw new LoiNghiepVu("Việc tiếp theo chỉ hẹn được lúc đánh dấu xong.", 422, "viec-tiep-theo-sai-luc");
  }

  // CV-06: kiểm tra trước khi xong — chạy trong cùng giao dịch, không tin kết quả xem trước.
  if (xongMoi) {
    // goc.status = "huy" thì bộ kiểm tra báo "viec-da-huy": hủy → xong phải mở lại trước.
    const kt = await chayKiemTra(nc, goc, {
      ketQua: ketQuaMoi,
      danhGia: danhGiaMoi,
      coViecTiepTheo: !!d.viecTiepTheo,
    });
    if (!kt.duocXong) {
      throw new LoiNghiepVu(`Chưa đánh dấu xong được: ${kt.loi.map((l) => l.thongBao).join(" ")}`, 422, "chua-du-dieu-kien-xong", kt);
    }
  }

  // Chuỗi duyệt sau thay đổi (DG-21): người làm mới không được đứng trong chuỗi.
  const nguoiLamMoi = doiNguoi ? d.nguoiPhuTrachId! : goc.ownerId;
  const canDuyetMoi = d.canDuyet ?? goc.needsApproval;
  const chuoiCu = await chuoiDuyetCuaViec(nc.tx, id);
  let chuoiMoi: string[] | null = null;
  if (canDuyetMoi) {
    if (d.nguoiDuyetIds?.length) chuoiMoi = d.nguoiDuyetIds;
    else if (chuoiCu.length === 0) chuoiMoi = await dungChuoiDuyetChoViec(nc, { chuoi: [], nguoiLamId: nguoiLamMoi, nguoiGiaoId: doiNguoi ? toi : (goc.assignedBy ?? toi) });
    if (chuoiMoi || doiNguoi || (d.canDuyet && !goc.needsApproval)) await kiemNguoiDuyet(nc, chuoiMoi ?? chuoiCu, nguoiLamMoi);
  } else if (goc.needsApproval && chuoiCu.length) {
    chuoiMoi = [];
  }
  // DG-20: việc cần duyệt bấm Xong → chờ duyệt (cấp 1), chưa xong.
  const guiDuyet = xongMoi && canDuyetMoi;

  const bayGio = new Date();
  const ngamNhan = laNguoiLam && goc.acceptStatus === "cho-nhan" && (d.trangThai !== undefined || doiKetQuaYeuCau);
  const v = await nc.tx.task.update({
    where: { id },
    data: {
      ...(d.tieuDe !== undefined && { title: d.tieuDe }),
      ...(d.moTa !== undefined && { description: d.moTa }),
      ...(doiNguoi && {
        ownerId: d.nguoiPhuTrachId!,
        assignedBy: toi,
        assignedAt: bayGio,
        acceptStatus: d.nguoiPhuTrachId === toi ? null : "cho-nhan",
        acceptedAt: null,
        declinedAt: null,
        declineReason: null,
      }),
      // Người giao "gửi lại" việc đã bị từ chối cho cùng người: sửa gì đó thì việc về chờ nhận.
      ...(!doiNguoi && goc.acceptStatus === "tu-choi" && !laNguoiLam && { acceptStatus: "cho-nhan", declinedAt: null, declineReason: null, assignedAt: bayGio }),
      // Người làm bắt tay vào việc / hoàn thành mà chưa bấm Nhận: coi như đã nhận (DG-03).
      ...(ngamNhan && { acceptStatus: "da-nhan", acceptedAt: bayGio }),
      ...(d.uuTien !== undefined && { priority: d.uuTien }),
      ...(d.han !== undefined && { dueAt: d.han, ...(goc.originalDueAt === null && { originalDueAt: d.han }) }),
      ...(d.doKho !== undefined && { difficulty: d.doKho }),
      ...(d.canDuyet !== undefined && { needsApproval: d.canDuyet }),
      ...(guiDuyet
        ? { status: "cho-duyet", completedAt: null, submittedAt: bayGio, approvalRound: { increment: 1 }, approvalLevel: 1 }
        : d.trangThai !== undefined && {
            status: d.trangThai,
            completedAt: d.trangThai === "xong" ? (goc.completedAt ?? bayGio) : null,
          }),
      ...(doiKetQua && {
        result: ketQuaMoi ?? null,
        outcome: danhGiaMoi ?? null,
        resultAt: ketQuaMoi ? bayGio : null,
        resultBy: ketQuaMoi ? toi : null,
      }),
      updatedBy: toi,
    },
    select: CHON_VIEC,
  });
  if (chuoiMoi) await ghiChuoiDuyet(nc, id, chuoiMoi);
  // DG-05: người giao / quản lý đổi thẳng hạn việc đã có hạn → ghi như một lần gia hạn đã duyệt (giữ lịch sử).
  if (doiHan && hanCu !== null && d.han) {
    await nc.tx.taskExtension.create({
      data: {
        tenantId: nc.tenantId, taskId: id, requestedBy: toi, oldDueAt: goc.dueAt, newDueAt: d.han,
        reason: "Người giao đổi hạn trực tiếp.", status: "da-duyet", decidedBy: toi, decidedAt: bayGio,
      },
    });
  }
  const sau = chuyenDoi(v);
  await nc.kiemToan({ action: "sua", objectType: "task", objectId: id, before: anhChup(truoc), after: { ...anhChup(sau), ...(chuoiMoi && { nguoiDuyet: chuoiMoi }) } });
  await nc.suKien({ eventType: guiDuyet ? SU_KIEN.TASK_SUBMITTED : xongMoi ? SU_KIEN.TASK_COMPLETED : SU_KIEN.TASK_UPDATED, objectType: "task", objectId: id });
  if (ngamNhan) await nc.suKien({ eventType: SU_KIEN.TASK_ACCEPTED, objectType: "task", objectId: id, payload: { ngam: true } });

  if (doiNguoi) {
    await nc.suKien({ eventType: SU_KIEN.TASK_ASSIGNED, objectType: "task", objectId: id, payload: { tu: goc.ownerId, sang: sau.nguoiPhuTrach.id } });
    await baoDuocGiao(nc, sau, true);
    await baoChuyenDi(nc, sau, goc.ownerId);
  } else if (goc.acceptStatus === "tu-choi" && !laNguoiLam) {
    await baoDuocGiao(nc, sau, false);
  }

  let viecTiepTheo: CongViec | null = null;
  if (xongMoi) {
    if (d.viecTiepTheo) {
      // Việc tiếp theo cùng người làm, cùng khách / lead / cơ hội — mạch công việc không đứt (CV-09).
      viecTiepTheo = await taoViec(nc, {
        tieuDe: d.viecTiepTheo.tieuDe,
        moTa: `Tiếp theo của việc “${sau.tieuDe}”. Kết quả lần trước: ${(sau.ketQua ?? "").slice(0, 1000)}`,
        nguoiPhuTrachId: sau.nguoiPhuTrach.id,
        uuTien: sau.uuTien as (typeof UU_TIEN)[number],
        han: d.viecTiepTheo.han ?? null,
        khachHangId: sau.khachHang?.id ?? null,
        leadId: sau.lead?.id ?? null,
        coHoiId: sau.coHoi?.id ?? null,
      });
    }
    if (guiDuyet) {
      await ghiNhatKyDuyet(nc, { taskId: id, vong: v.approvalRound, cap: null, hanhDong: "gui-duyet", han: v.dueAt });
      await baoChoDuyet(nc, sau, 1);
    } else {
      await baoDaXong(nc, sau, goc.createdBy);
    }
  }
  return { ...sau, viecTiepTheo };
}

// ---------------------------------------------------------------------------
// Chi tiết một việc
// ---------------------------------------------------------------------------

export async function chiTietViec(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "task.view", { objectType: "task", objectId: id });
  const v = await docViecTrongPhamVi(nc, id);
  const muc = await nc.tx.taskChecklistItem.findMany({
    where: { taskId: id, removedAt: null },
    select: { id: true, label: true, required: true, doneAt: true, doneUser: { select: { fullName: true } } },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const duocSua = coQuyen(nc.hoSo, "task.update") && (await trongPhamVi(nc, "task.update", v.ownerId));
  const kiemTra = await chayKiemTra(nc, v, { coViecTiepTheo: false });
  const hoSoKhach = await hoSoKhachCuaViec(nc, v.customer?.id ?? null);
  const xemDiem = (await boLocDiem(nc))(v.ownerId);
  return {
    viec: anDiem(chuyenDoi(v), xemDiem),
    xemDiem,
    mucKiemTra: muc.map((m) => ({ id: m.id, nhan: m.label, batBuoc: m.required, daTich: !!m.doneAt, tichLuc: m.doneAt, nguoiTich: m.doneUser?.fullName ?? null })),
    kiemTra,
    hoSoKhach,
    quyen: { sua: duocSua, giaoLai: duocSua, taoViec: coQuyen(nc.hoSo, "task.create") },
  };
}

// ---------------------------------------------------------------------------
// Danh sách kiểm tra (CV-07)
// ---------------------------------------------------------------------------

export const LuocDoThemMuc = LuocDoMucKiemTra;
export const LuocDoTichMuc = z.object({ daTich: z.boolean() });

/** Danh sách kiểm tra khóa khi việc đã xong hoặc đã hủy — mở lại việc để sửa. */
async function viecSuaDuocDanhSach(nc: NguCanh, taskId: string) {
  batBuocQuyen(nc.hoSo, "task.update", { objectType: "task", objectId: taskId });
  const v = await docViecTrongPhamVi(nc, taskId);
  await batBuocSuaDuoc(nc, v);
  if (!CHUA_XONG.includes(v.status)) {
    throw new LoiNghiepVu("Việc đã xong hoặc đã hủy nên danh sách kiểm tra đã khóa. Mở lại việc nếu cần sửa.", 409, "viec-da-khoa");
  }
  return v;
}

export async function themMucKiemTra(nc: NguCanh, taskId: string, d: z.input<typeof LuocDoThemMuc>) {
  const m = LuocDoThemMuc.parse(d);
  await viecSuaDuocDanhSach(nc, taskId);
  const soMuc = await nc.tx.taskChecklistItem.count({ where: { taskId, removedAt: null } });
  if (soMuc >= TOI_DA_MUC_KIEM_TRA) throw new LoiNghiepVu(`Tối đa ${TOI_DA_MUC_KIEM_TRA} mục kiểm tra mỗi việc.`, 422, "qua-nhieu-muc");
  const moi = await nc.tx.taskChecklistItem.create({
    data: { tenantId: nc.tenantId, taskId, label: m.nhan, required: m.batBuoc, position: soMuc, createdBy: nc.hoSo.userId },
    select: { id: true },
  });
  await nc.kiemToan({ action: "them-muc-kiem-tra", objectType: "task", objectId: taskId, after: { mucId: moi.id, nhan: m.nhan, batBuoc: m.batBuoc } });
  return { id: moi.id };
}

async function docMuc(nc: NguCanh, mucId: string) {
  const m = await nc.tx.taskChecklistItem.findFirst({
    where: { id: mucId, removedAt: null },
    select: { id: true, taskId: true, label: true, required: true, doneAt: true },
  });
  if (!m) throw new LoiKhongTimThay("Mục kiểm tra");
  return m;
}

export async function tichMucKiemTra(nc: NguCanh, mucId: string, d: z.input<typeof LuocDoTichMuc>) {
  const { daTich } = LuocDoTichMuc.parse(d);
  const m = await docMuc(nc, mucId);
  await viecSuaDuocDanhSach(nc, m.taskId);
  if (!!m.doneAt === daTich) return { id: m.id, daTich };
  await nc.tx.taskChecklistItem.update({
    where: { id: m.id },
    data: daTich ? { doneAt: new Date(), doneBy: nc.hoSo.userId } : { doneAt: null, doneBy: null },
  });
  await nc.kiemToan({ action: daTich ? "tich-muc-kiem-tra" : "bo-tich-muc-kiem-tra", objectType: "task", objectId: m.taskId, after: { mucId: m.id, nhan: m.label } });
  return { id: m.id, daTich };
}

export async function goMucKiemTra(nc: NguCanh, mucId: string) {
  const m = await docMuc(nc, mucId);
  await viecSuaDuocDanhSach(nc, m.taskId);
  await nc.tx.taskChecklistItem.update({ where: { id: m.id }, data: { removedAt: new Date(), removedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "go-muc-kiem-tra", objectType: "task", objectId: m.taskId, before: { mucId: m.id, nhan: m.label, batBuoc: m.required } });
  return { id: m.id, daGo: true };
}
