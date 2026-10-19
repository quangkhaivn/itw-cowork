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
import { DO_DAI_KET_QUA_TOI_THIEU, kiemTraTruocKhiXong, type KetQuaKiemTra } from "./kiem-tra";

/**
 * Công việc — việc SẮP làm, có hạn ("Activity" trong prompt). Luật CV-01 → CV-11.
 * Quyền `task.*`, phạm vi theo `tasks.owner_id`.
 *
 * 0.17.0 "Công việc thông suốt": việc xong phải có kết quả (CV-04, CV-05), máy kiểm tra trước
 * khi cho xong (CV-06), danh sách kiểm tra (CV-07), báo cho người nhận khi được giao và cho
 * người giao khi xong (CV-08), "Cần làm tiếp" phải hẹn việc tiếp theo (CV-09), đính kèm (CV-10).
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
});
/** Kết quả đã qua lược đồ; `mucKiemTra` tùy chọn để mọi chỗ gọi cũ (trợ lý AI, bài thử) giữ nguyên. */
export type DuLieuTaoViec = Omit<z.infer<typeof LuocDoTaoViec>, "mucKiemTra"> & { mucKiemTra?: z.infer<typeof LuocDoMucKiemTra>[] };

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
});
export type DuLieuSuaViec = z.infer<typeof LuocDoSuaViec>;

export const LuocDoKiemTraViec = z.object({
  ketQua: z.string().max(5000).optional(),
  danhGia: z.union([z.enum(DANH_GIA_KET_QUA), z.literal("")]).optional(),
  coViecTiepTheo: z.union([z.boolean(), z.enum(["1", "0", "true", "false"])]).optional(),
});

export const LuocDoLocViec = z.object({
  /** cua-toi | toi-giao | qua-han | tat-ca (trong phạm vi) */
  cheDo: z.enum(["cua-toi", "toi-giao", "qua-han", "tat-ca"]).optional().default("cua-toi"),
  /** "" = chưa xong (mo + dang-lam); "tat-ca"; hoặc một trạng thái */
  trangThai: z.enum(["", "tat-ca", ...TRANG_THAI_VIEC]).optional().default(""),
  nguoiPhuTrach: z.union([z.uuid(), z.literal("")]).optional().default(""),
  q: z.string().trim().max(100).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(30),
  /** Mở đúng một công việc (liên kết từ Customer 360, dòng thời gian). */
  id: z.union([z.uuid(), z.literal("")]).optional().default(""),
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
  createdBy: true,
  result: true,
  outcome: true,
  resultAt: true,
  assignedBy: true,
  assignedAt: true,
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
    kiemTra: {
      tong: v.checklist.length,
      daTich: v.checklist.filter((m) => m.doneAt).length,
      batBuocConThieu: batBuoc.filter((m) => !m.doneAt).length,
    },
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
    ketQua: v.ketQua,
    danhGia: v.danhGia,
  };
}

const duongDanViec = (id: string) => `/cong-viec/${id}`;

export async function danhSachViec(nc: NguCanh, boLoc: BoLocViec) {
  batBuocQuyen(nc.hoSo, "task.view");
  const dieuKien: Prisma.TaskWhereInput[] = [await locTheoPhamVi(nc, "task.view")];
  // Mở đúng một việc: bỏ qua chế độ và trạng thái, vẫn giữ phạm vi.
  if (boLoc.id) {
    dieuKien.push({ id: boLoc.id });
    boLoc = { ...boLoc, cheDo: "tat-ca", trangThai: "tat-ca" };
  }
  if (boLoc.cheDo === "cua-toi") dieuKien.push({ ownerId: nc.hoSo.userId });
  // "Tôi giao": việc mình giao cho NGƯỜI KHÁC — để người giao theo dõi được tới lúc xong (CV-08).
  if (boLoc.cheDo === "toi-giao") dieuKien.push({ assignedBy: nc.hoSo.userId, ownerId: { not: nc.hoSo.userId } });
  if (boLoc.cheDo === "qua-han") dieuKien.push({ status: { in: CHUA_XONG }, dueAt: { lt: new Date() } });
  if (boLoc.trangThai === "") dieuKien.push({ status: { in: CHUA_XONG } });
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
  const ketQua = [];
  for (const v of dong) ketQua.push({ ...chuyenDoi(v), duocSua: pvSua && (await trongPhamVi(nc, "task.update", v.ownerId)) });
  return { tong, trang: boLoc.trang, coTrang: boLoc.coTrang, dong: ketQua, soQuaHanCuaToi };
}

/** Điều kiện Prisma "người đang xem thấy được việc này" — tệp đính kèm mượn đúng điều kiện này (DK-02). */
export async function dieuKienXemViec(nc: NguCanh): Promise<Prisma.TaskWhereInput> {
  return locTheoPhamVi(nc, "task.view");
}

async function docViecTrongPhamVi(nc: NguCanh, id: string) {
  const v = await nc.tx.task.findFirst({ where: { id, ...(await locTheoPhamVi(nc, "task.view")) }, select: CHON_VIEC });
  if (!v) throw new LoiKhongTimThay("Công việc");
  return v;
}

async function batBuocSuaDuoc(nc: NguCanh, v: { ownerId: string }) {
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
    noiDung: `${nc.hoSo.hoTen} ${laChuyen ? "chuyển" : "giao"} cho bạn${gan}.${v.han ? ` Hạn: ${dinhDangNgayGio(v.han)}.` : " Không có hạn."}`,
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

export async function taoViec(nc: NguCanh, dauVao: DuLieuTaoViec) {
  const d = { ...dauVao, mucKiemTra: dauVao.mucKiemTra ?? [] };
  batBuocQuyen(nc.hoSo, "task.create", { objectType: "task" });
  const ownerId = d.nguoiPhuTrachId ?? nc.hoSo.userId;
  await kiemTraNguoiPhuTrach(nc, "task.create", ownerId);
  const khachId = await kiemTraGanKem(nc, d);
  const bayGio = new Date();

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
      assignedBy: nc.hoSo.userId,
      assignedAt: bayGio,
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
  const kq = chuyenDoi(v);
  await nc.kiemToan({ action: "tao", objectType: "task", objectId: v.id, after: { ...anhChup(kq), soMucKiemTra: d.mucKiemTra.length } });
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
  const goc = await docViecTrongPhamVi(nc, id);
  await batBuocSuaDuoc(nc, goc);
  const truoc = chuyenDoi(goc);
  const doiNguoi = !!d.nguoiPhuTrachId && d.nguoiPhuTrachId !== goc.ownerId;
  if (doiNguoi) await kiemTraNguoiPhuTrach(nc, "task.update", d.nguoiPhuTrachId!);

  const trangThaiMoi = d.trangThai ?? goc.status;
  const xongMoi = trangThaiMoi === "xong" && goc.status !== "xong";

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

  const bayGio = new Date();
  const v = await nc.tx.task.update({
    where: { id },
    data: {
      ...(d.tieuDe !== undefined && { title: d.tieuDe }),
      ...(d.moTa !== undefined && { description: d.moTa }),
      ...(doiNguoi && { ownerId: d.nguoiPhuTrachId!, assignedBy: nc.hoSo.userId, assignedAt: bayGio }),
      ...(d.uuTien !== undefined && { priority: d.uuTien }),
      ...(d.han !== undefined && { dueAt: d.han }),
      ...(d.trangThai !== undefined && {
        status: d.trangThai,
        completedAt: d.trangThai === "xong" ? (goc.completedAt ?? bayGio) : null,
      }),
      ...(doiKetQua && {
        result: ketQuaMoi ?? null,
        outcome: danhGiaMoi ?? null,
        resultAt: ketQuaMoi ? bayGio : null,
        resultBy: ketQuaMoi ? nc.hoSo.userId : null,
      }),
      updatedBy: nc.hoSo.userId,
    },
    select: CHON_VIEC,
  });
  const sau = chuyenDoi(v);
  await nc.kiemToan({ action: "sua", objectType: "task", objectId: id, before: anhChup(truoc), after: anhChup(sau) });
  await nc.suKien({ eventType: xongMoi ? SU_KIEN.TASK_COMPLETED : SU_KIEN.TASK_UPDATED, objectType: "task", objectId: id });

  if (doiNguoi) {
    await nc.suKien({ eventType: SU_KIEN.TASK_ASSIGNED, objectType: "task", objectId: id, payload: { tu: goc.ownerId, sang: sau.nguoiPhuTrach.id } });
    await baoDuocGiao(nc, sau, true);
    await baoChuyenDi(nc, sau, goc.ownerId);
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
    await baoDaXong(nc, sau, goc.createdBy);
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
  return {
    viec: chuyenDoi(v),
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
