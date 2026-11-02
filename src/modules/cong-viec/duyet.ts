import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { taoThongBao } from "@/modules/thong-bao/service";
import { dungChuoiDuyet, LuocDoChuoiDuyet, TOI_DA_CAP_DUYET, type CapDuyet } from "@/modules/danh-gia/tinh-toan";
import { chuanHoaChuoiDuyetKhiGiao, loiChuoiDuyetKhiGiao, napBanDoCapTren } from "@/modules/danh-gia/cap-tren";

/**
 * Phần lõi của chuỗi duyệt công việc (0.20.0, DG-20 → DG-24), tách khỏi `service.ts` để `giao-viec.ts`
 * và `service.ts` cùng dùng mà không vòng import.
 */

export interface MauViecDung {
  id: string;
  moTa: string | null;
  doKho: number;
  canDuyet: boolean;
  soNgayHan: number | null;
  mucKiemTra: { nhan: string; batBuoc: boolean }[];
  chuoiDuyet: CapDuyet[];
}

function docDanhSachKiemTra(x: unknown): { nhan: string; batBuoc: boolean }[] {
  if (!Array.isArray(x)) return [];
  return x
    .filter((m): m is { nhan: string; batBuoc?: boolean } => !!m && typeof m === "object" && typeof (m as { nhan?: unknown }).nhan === "string")
    .map((m) => ({ nhan: m.nhan, batBuoc: m.batBuoc !== false }));
}

export function docChuoiDuyet(x: unknown): CapDuyet[] {
  const r = LuocDoChuoiDuyet.safeParse(x);
  return r.success ? r.data : [];
}

/** Mẫu việc đang dùng (DG-06). Mẫu ngừng dùng → 422. */
export async function mauViecDung(nc: NguCanh, id: string): Promise<MauViecDung> {
  const m = await nc.tx.taskTemplate.findFirst({ where: { id }, select: { id: true, description: true, difficulty: true, needsApproval: true, dueDays: true, checklist: true, approvalChain: true, status: true } });
  if (!m) throw new LoiKhongTimThay("Mẫu việc");
  if (m.status !== "hoat-dong") throw new LoiNghiepVu("Mẫu việc đã ngừng dùng.", 422, "mau-ngung");
  return {
    id: m.id,
    moTa: m.description,
    doKho: m.difficulty,
    canDuyet: m.needsApproval,
    soNgayHan: m.dueDays,
    mucKiemTra: docDanhSachKiemTra(m.checklist),
    chuoiDuyet: docChuoiDuyet(m.approvalChain),
  };
}

/**
 * Dựng chuỗi người duyệt thật từ chuỗi khai. "Quản lý trực tiếp" = quản lý còn hoạt động gần nhất trong chuỗi
 * quản lý của người làm (quản lý đã nghỉ → cấp trên — QĐ-135).
 */
export async function dungChuoiDuyetChoViec(nc: NguCanh, d: { chuoi: CapDuyet[]; nguoiLamId: string; nguoiGiaoId: string }): Promise<string[]> {
  const bd = await napBanDoCapTren(nc.tx);
  return dungChuoiDuyet(d.chuoi, { nguoiLamId: d.nguoiLamId, nguoiGiaoId: d.nguoiGiaoId, quanLyTrucTiepId: bd.chuoiQuanLy(d.nguoiLamId)[0] ?? null });
}

/**
 * QĐ-154: chuỗi duyệt DỰNG TỰ ĐỘNG (không ai gửi danh sách người duyệt — mặc định, theo mẫu việc) cho việc
 * giao cho người khác: đồng nghiệp ngang cấp không tự đứng duyệt; cấp cuối luôn là quản lý / cấp trên của
 * người làm, hoặc Giám đốc / Quản trị (mặc định: người giao nếu họ là cấp trên, không thì quản lý trực tiếp
 * của người làm, không có quản lý thì Giám đốc).
 */
export async function chuoiDuyetTuDong(nc: NguCanh, d: { chuoi: CapDuyet[]; nguoiLamId: string; nguoiGiaoId: string }): Promise<string[]> {
  const dung = await dungChuoiDuyetChoViec(nc, d);
  if (d.nguoiLamId === d.nguoiGiaoId) return dung;
  const bd = await napBanDoCapTren(nc.tx);
  // Chuỗi khai rỗng → dungChuoiDuyet trả [người giao]; chuẩn hóa bỏ người giao nếu họ là đồng nghiệp ngang cấp.
  return chuanHoaChuoiDuyetKhiGiao(dung, {
    nguoiLamId: d.nguoiLamId, nguoiGiaoId: d.nguoiGiaoId, quanLyCuaNguoiLam: bd.chuoiQuanLy(d.nguoiLamId),
    laGiamDocHoacQuanTri: bd.laGiamDocHoacQuanTri, capTrenCuaNguoiLam: bd.chuoiCapTren(d.nguoiLamId),
  });
}

/**
 * QĐ-154: kiểm chuỗi duyệt NGƯỜI GỌI GỬI LÊN (API, form, lịch định kỳ khai người cụ thể / người giao) cho việc
 * giao cho người khác — vi phạm thì 403 kèm lời giải thích, không tự sửa.
 */
export async function kiemChuoiDuyetKhiGiao(nc: NguCanh, ids: string[], nguoiLamId: string, nguoiGiaoId: string): Promise<void> {
  if (nguoiLamId === nguoiGiaoId || ids.length === 0) return;
  const bd = await napBanDoCapTren(nc.tx);
  const loi = loiChuoiDuyetKhiGiao(ids, { nguoiLamId, nguoiGiaoId, quanLyCuaNguoiLam: bd.chuoiQuanLy(nguoiLamId), laGiamDocHoacQuanTri: bd.laGiamDocHoacQuanTri });
  if (loi === "tu-dat-nguoi-duyet") {
    throw new LoiNghiepVu(
      "Bạn giao việc cho người không thuộc nhóm mình quản lý nên không được tự đứng trong chuỗi duyệt. Bỏ bạn khỏi danh sách người duyệt — để trống thì người duyệt là quản lý trực tiếp của người làm (không có thì Giám đốc).",
      403,
      "tu-dat-nguoi-duyet",
    );
  }
  if (loi === "nguoi-duyet-cuoi") {
    throw new LoiNghiepVu(
      "Người duyệt cấp cuối (người chấm điểm) phải là quản lý trực tiếp hoặc cấp trên của người làm, hoặc Giám đốc / Quản trị. Để trống danh sách người duyệt để dùng mặc định.",
      403,
      "nguoi-duyet-cuoi",
    );
  }
}

/**
 * Chuỗi người duyệt hợp lệ (DG-21): ít nhất một người, tối đa 5, không trùng, đều là người thật đang hoạt
 * động, và **không ai là người làm** — không ai duyệt việc của chính mình.
 */
export async function kiemNguoiDuyet(nc: NguCanh, ids: string[], nguoiLamId: string): Promise<void> {
  if (ids.length === 0) {
    throw new LoiNghiepVu("Việc cần duyệt phải có người duyệt khác người làm. Chọn người duyệt, hoặc tắt \"cần duyệt\".", 422, "thieu-nguoi-duyet");
  }
  if (ids.length > TOI_DA_CAP_DUYET) throw new LoiNghiepVu(`Tối đa ${TOI_DA_CAP_DUYET} cấp duyệt.`, 422, "qua-nhieu-cap");
  if (new Set(ids).size !== ids.length) throw new LoiNghiepVu("Một người không đứng hai cấp duyệt.", 422, "trung-nguoi-duyet");
  if (ids.includes(nguoiLamId)) {
    throw new LoiNghiepVu("Người làm không được là người duyệt việc của chính mình.", 422, "tu-duyet");
  }
  const n = await nc.tx.user.count({ where: { id: { in: ids }, status: "hoat-dong", isSystem: false } });
  if (n !== ids.length) throw new LoiNghiepVu("Người duyệt không tồn tại hoặc đã ngừng hoạt động.", 422, "nguoi-duyet");
}

export async function chuoiDuyetCuaViec(tx: ClientTenant, taskId: string): Promise<string[]> {
  const ds = await tx.taskApprover.findMany({ where: { taskId }, orderBy: { level: "asc" }, select: { approverId: true } });
  return ds.map((x) => x.approverId);
}

/** Thay toàn bộ chuỗi duyệt (chỉ khi việc không ở `cho-duyet`; lịch sử đổi nằm ở nhật ký kiểm toán). */
export async function ghiChuoiDuyet(nc: NguCanh, taskId: string, ids: string[]): Promise<void> {
  await nc.tx.taskApprover.deleteMany({ where: { taskId } });
  if (ids.length === 0) return;
  await nc.tx.taskApprover.createMany({
    data: ids.map((approverId, i) => ({ tenantId: nc.tenantId, taskId, level: i + 1, approverId, createdBy: nc.hoSo.userId })),
  });
}

export async function ghiNhatKyDuyet(
  nc: NguCanh,
  d: { taskId: string; vong: number; cap: number | null; hanhDong: "gui-duyet" | "duyet" | "tra-lai"; lyDo?: string | null; chatLuong?: number | null; han?: Date | null; heSo?: number | null; diem?: number | null },
): Promise<void> {
  await nc.tx.taskApprovalLog.create({
    data: {
      tenantId: nc.tenantId,
      taskId: d.taskId,
      round: d.vong,
      level: d.cap,
      action: d.hanhDong,
      actorId: nc.hoSo.userId,
      reason: d.lyDo ?? null,
      quality: d.chatLuong ?? null,
      dueAt: d.han ?? null,
      onTimeFactor: d.heSo ?? null,
      score: d.diem ?? null,
    },
  });
}

/** Báo người duyệt của cấp `cap` (một lần cho mỗi lần gửi duyệt, mỗi cấp). */
export async function baoChoDuyet(nc: NguCanh, v: { id: string; tieuDe: string; nguoiPhuTrach: { hoTen: string }; lanGuiDuyet: number }, cap: number): Promise<void> {
  const nd = await nc.tx.taskApprover.findFirst({ where: { taskId: v.id, level: cap }, select: { approverId: true } });
  if (!nd || nd.approverId === nc.hoSo.userId) return;
  await taoThongBao(nc.tx, nc.tenantId, {
    nguoiNhanId: nd.approverId,
    loai: "viec-cho-duyet",
    mucDo: "canh-bao",
    tieuDe: `Chờ bạn duyệt${cap > 1 ? ` (cấp ${cap})` : ""}: ${v.tieuDe}`.slice(0, 300),
    noiDung: `${v.nguoiPhuTrach.hoTen} đã làm xong và gửi duyệt. Duyệt kèm chấm chất lượng 1–5, hoặc trả lại kèm lý do.`,
    duongDan: `/cong-viec/${v.id}`,
    doiTuong: "task",
    doiTuongId: v.id,
    khoaChongTrung: `viec-cho-duyet:${v.id}:${v.lanGuiDuyet}:${cap}`,
  });
}
