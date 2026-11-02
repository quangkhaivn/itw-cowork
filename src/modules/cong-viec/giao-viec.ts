import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen, coQuyen, idNguoiTrongPhamVi, layHoSoQuyen } from "@/lib/phan-quyen";
import type { ClientTenant } from "@/lib/db";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { dinhDangNgayGio } from "@/lib/dinh-dang";
import { thoiDiemTuyChon } from "@/modules/crm/chung";
import { taoThongBao } from "@/modules/thong-bao/service";
import { banDoTen } from "@/modules/cham-cong/chung";
import { capDuoi, dieuChinhDiemViecDuoc, docCauHinhDanhGia, dungHanTu, nguoiXemDuocDanhGia, nguoiXemDuocDanhGiaCua, xemDuocDanhGiaCua } from "@/modules/danh-gia/chung";
import { napBanDoCapTren } from "@/modules/danh-gia/cap-tren";
import { chuyenViecCuaNguoiLamDaNghi } from "@/modules/danh-gia/chuyen-buoc";
import { mocVN, ngayVNCua } from "@/modules/cham-cong/tinh-toan";
import { dauTuan, diemViec, heSoDungHan, NHAN_CHAT_LUONG, NHAN_LOAI_DUNG_HAN } from "@/modules/danh-gia/tinh-toan";
import { baoChoDuyet, ghiNhatKyDuyet } from "./duyet";
import {
  anDiem,
  batBuocSuaDuoc,
  CHON_VIEC,
  chuyenDoi,
  docViecTrongPhamVi,
  duocDoiThuocTinhChamDiem,
  duongDanViec,
  taoViec,
  type DuLieuTaoViec,
  type CongViec,
} from "./service";

/**
 * Giao việc mở rộng (0.20.0, BUSINESS_RULES mục 31):
 *  - Nhận / Từ chối kèm lý do (DG-03); giao nhiều người (DG-08);
 *  - Nhật ký tiến độ chỉ ghi thêm (DG-13);
 *  - Xin gia hạn → người giao duyệt (DG-05);
 *  - Duyệt nhiều cấp, trả lại kèm lý do, chấm chất lượng 1–5 → điểm việc (DG-20 → DG-31);
 *  - Điều chỉnh điểm có lý do (DG-32).
 * Mọi chuyển trạng thái khóa dòng việc trước khi đọc (QĐ-77): hai người duyệt cùng lúc → người sau 409.
 */

async function khoaVaDoc(nc: NguCanh, id: string) {
  await khoaChungTu(nc.tx, "tasks", id);
  return docViecTrongPhamVi(nc, id);
}

async function docLai(nc: NguCanh, id: string) {
  return chuyenDoi(await nc.tx.task.findUniqueOrThrow({ where: { id }, select: CHON_VIEC }));
}

/** Người nhận đề nghị của người làm: người giao; không có thì người tạo. */
function nguoiGiaoCua(v: { assignedBy: string | null; createdBy: string | null }): string | null {
  return v.assignedBy ?? v.createdBy;
}

/**
 * Người quyết định một đề nghị gia hạn mới (QĐ-135): người giao nếu còn hoạt động và không phải người làm;
 * người giao đã nghỉ / bị khóa → cấp trên của người đó (quản lý trực tiếp → … → Giám đốc), bỏ người làm.
 */
async function nguoiQuyetDinhGiaHan(tx: ClientTenant, v: { assignedBy: string | null; createdBy: string | null; ownerId: string }): Promise<string | null> {
  const giao = nguoiGiaoCua(v);
  if (!giao || giao === v.ownerId) return giao;
  const bd = await napBanDoCapTren(tx);
  if (bd.hoatDong.has(giao)) return giao;
  return bd.chuoiCapTren(giao).find((x) => x !== v.ownerId) ?? null;
}

/** Người quyết định hiện hành của một đề nghị (cột `approver_id`; đề nghị cũ chưa có cột → người giao). */
function nguoiQuyetDinhCua(g: { approverId: string | null }, v: { assignedBy: string | null; createdBy: string | null }): string | null {
  return g.approverId ?? nguoiGiaoCua(v);
}

/**
 * QĐ-139: người nhận thông báo có được thấy ĐIỂM việc của `nguoiLamId` không — có `danh_gia.view` mà người
 * làm nằm trong phạm vi (như màn hình chi tiết việc). Không có thì thông báo không kèm điểm.
 */
export async function nhanDuocDiem(tx: ClientTenant, nguoiNhanId: string, nguoiLamId: string): Promise<boolean> {
  const hs = await layHoSoQuyen(tx, nguoiNhanId);
  if (!hs) return false;
  const pv = await nguoiXemDuocDanhGiaCua(tx, hs);
  return pv === "tat-ca" || pv.includes(nguoiLamId);
}

async function bao(nc: NguCanh, nguoiNhanId: string | null, d: { loai: string; tieuDe: string; noiDung?: string; mucDo?: "thong-tin" | "canh-bao" | "khan"; taskId: string; khoa?: string }) {
  if (!nguoiNhanId || nguoiNhanId === nc.hoSo.userId) return;
  const conHoatDong = await nc.tx.user.count({ where: { id: nguoiNhanId, status: "hoat-dong" } });
  if (!conHoatDong) return;
  await taoThongBao(nc.tx, nc.tenantId, {
    nguoiNhanId,
    loai: d.loai,
    mucDo: d.mucDo ?? "thong-tin",
    tieuDe: d.tieuDe.slice(0, 300),
    noiDung: d.noiDung ?? null,
    duongDan: duongDanViec(d.taskId),
    doiTuong: "task",
    doiTuongId: d.taskId,
    khoaChongTrung: d.khoa ?? null,
  });
}

// ---------------------------------------------------------------------------
// DG-03: Nhận / Từ chối
// ---------------------------------------------------------------------------

export const LuocDoTuChoi = z.object({ lyDo: z.string().trim().min(5, "Ghi lý do từ chối (tối thiểu 5 ký tự).").max(2000) });

function batBuocLaNguoiLam(nc: NguCanh, v: { ownerId: string }) {
  if (v.ownerId !== nc.hoSo.userId) throw new LoiNghiepVu("Chỉ người được giao việc mới nhận / từ chối / báo tiến độ được.", 403, "khong-phai-nguoi-lam");
}

export async function nhanViec(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "task.update", { objectType: "task", objectId: id });
  const v = await khoaVaDoc(nc, id);
  batBuocLaNguoiLam(nc, v);
  if (v.acceptStatus !== "cho-nhan") throw new LoiNghiepVu("Việc không ở trạng thái chờ nhận.", 409, "khong-cho-nhan");
  if (!["mo", "dang-lam"].includes(v.status)) throw new LoiNghiepVu("Việc đã xong hoặc đã hủy.", 409, "viec-da-khoa");
  await nc.tx.task.update({ where: { id }, data: { acceptStatus: "da-nhan", acceptedAt: new Date(), updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "nhan-viec", objectType: "task", objectId: id });
  await nc.suKien({ eventType: SU_KIEN.TASK_ACCEPTED, objectType: "task", objectId: id });
  await bao(nc, nguoiGiaoCua(v), { loai: "viec-da-nhan", tieuDe: `${nc.hoSo.hoTen} đã nhận việc: ${v.title}`, taskId: id, khoa: `viec-da-nhan:${id}:${v.assignedAt?.getTime() ?? 0}` });
  return docLai(nc, id);
}

export async function tuChoiViec(nc: NguCanh, id: string, d: z.infer<typeof LuocDoTuChoi>) {
  batBuocQuyen(nc.hoSo, "task.update", { objectType: "task", objectId: id });
  const v = await khoaVaDoc(nc, id);
  batBuocLaNguoiLam(nc, v);
  if (v.acceptStatus !== "cho-nhan") throw new LoiNghiepVu("Chỉ từ chối được việc đang chờ nhận. Đã nhận thì trao đổi với người giao.", 409, "khong-cho-nhan");
  // QA 0.20.0: việc người giao đã hủy không còn gì để nhận / từ chối (trước đây vẫn ghi và báo người giao).
  if (!["mo", "dang-lam"].includes(v.status)) throw new LoiNghiepVu("Việc đã xong hoặc đã hủy.", 409, "viec-da-khoa");
  await nc.tx.task.update({ where: { id }, data: { acceptStatus: "tu-choi", declinedAt: new Date(), declineReason: d.lyDo, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "tu-choi-viec", objectType: "task", objectId: id, after: { lyDo: d.lyDo } });
  await nc.suKien({ eventType: SU_KIEN.TASK_DECLINED, objectType: "task", objectId: id, payload: { lyDo: d.lyDo } });
  await bao(nc, nguoiGiaoCua(v), {
    loai: "viec-bi-tu-choi",
    mucDo: "canh-bao",
    tieuDe: `${nc.hoSo.hoTen} từ chối việc: ${v.title}`,
    noiDung: `Lý do: ${d.lyDo.slice(0, 500)}. Giao lại cho người khác, hoặc sửa việc rồi gửi lại.`,
    taskId: id,
    khoa: `viec-tu-choi:${id}:${v.assignedAt?.getTime() ?? 0}`,
  });
  return docLai(nc, id);
}

// ---------------------------------------------------------------------------
// DG-08: giao nhiều người
// ---------------------------------------------------------------------------

/** Mỗi người một việc riêng, chung `group_id`. Một người ngoài phạm vi → cả lần giao hủy (một giao dịch). */
export async function giaoNhieuNguoi(nc: NguCanh, d: DuLieuTaoViec): Promise<{ nhomId: string; viec: CongViec[] }> {
  const ds = [...new Set(d.nguoiPhuTrachIds ?? [])];
  if (ds.length < 2) throw new LoiNghiepVu("Giao nhiều người cần ít nhất 2 người.", 422, "it-nguoi");
  const nhomId = crypto.randomUUID();
  const viec: CongViec[] = [];
  for (const nguoi of ds) {
    viec.push(await taoViec(nc, { ...d, nguoiPhuTrachId: nguoi, nguoiPhuTrachIds: undefined }, { nhomId }));
  }
  await nc.kiemToan({ action: "giao-nhieu-nguoi", objectType: "task", objectId: viec[0].id, after: { nhomId, soNguoi: ds.length } });
  return { nhomId, viec };
}

// ---------------------------------------------------------------------------
// DG-13: tiến độ
// ---------------------------------------------------------------------------

export const LuocDoTienDo = z.object({
  phanTram: z.coerce.number().int().min(0, "Từ 0 đến 100%.").max(100, "Từ 0 đến 100%."),
  ghiChu: z.string().trim().max(5000).optional().default(""),
});

export async function capNhatTienDo(nc: NguCanh, id: string, d: z.infer<typeof LuocDoTienDo>) {
  batBuocQuyen(nc.hoSo, "task.update", { objectType: "task", objectId: id });
  const v = await khoaVaDoc(nc, id);
  batBuocLaNguoiLam(nc, v);
  if (!["mo", "dang-lam"].includes(v.status)) throw new LoiNghiepVu("Chỉ báo tiến độ khi việc còn đang làm.", 409, "viec-da-khoa");
  if (v.acceptStatus === "tu-choi") throw new LoiNghiepVu("Bạn đã từ chối việc này.", 409, "viec-da-tu-choi");
  if (!d.ghiChu && d.phanTram === v.progress) throw new LoiNghiepVu("Ghi chú hoặc đổi % hoàn thành.", 422, "khong-co-gi");
  const dong = await nc.tx.taskProgressLog.create({
    data: { tenantId: nc.tenantId, taskId: id, percent: d.phanTram, note: d.ghiChu || null, createdBy: nc.hoSo.userId },
    select: { id: true },
  });
  const bayGio = new Date();
  await nc.tx.task.update({
    where: { id },
    data: {
      progress: d.phanTram,
      ...(v.status === "mo" && d.phanTram > 0 && { status: "dang-lam" }),
      ...(v.acceptStatus === "cho-nhan" && { acceptStatus: "da-nhan", acceptedAt: bayGio }),
      updatedBy: nc.hoSo.userId,
    },
  });
  await nc.suKien({ eventType: SU_KIEN.TASK_PROGRESS, objectType: "task", objectId: id, payload: { phanTram: d.phanTram } });
  // Người giao thấy ngay (chuông gộp theo ngày để không thành rác).
  await bao(nc, nguoiGiaoCua(v), {
    loai: "viec-tien-do",
    tieuDe: `${nc.hoSo.hoTen} cập nhật tiến độ ${d.phanTram}%: ${v.title}`,
    noiDung: d.ghiChu ? d.ghiChu.slice(0, 400) : undefined,
    taskId: id,
    khoa: `viec-tien-do:${id}:${dong.id}`,
  });
  return { id: dong.id, phanTram: d.phanTram };
}

// ---------------------------------------------------------------------------
// DG-05: gia hạn
// ---------------------------------------------------------------------------

export const LuocDoXinGiaHan = z.object({
  hanMoi: thoiDiemTuyChon.refine((x) => x instanceof Date, "Chọn hạn mới."),
  lyDo: z.string().trim().min(5, "Ghi lý do (tối thiểu 5 ký tự).").max(2000),
});
export const LuocDoQuyetDinhGiaHan = z.object({ dongY: z.boolean(), ghiChu: z.string().trim().max(2000).optional().default("") });

export async function xinGiaHan(nc: NguCanh, id: string, d: z.infer<typeof LuocDoXinGiaHan>) {
  batBuocQuyen(nc.hoSo, "task.update", { objectType: "task", objectId: id });
  const v = await khoaVaDoc(nc, id);
  batBuocLaNguoiLam(nc, v);
  const giaoGoc = nguoiGiaoCua(v);
  if (!giaoGoc || giaoGoc === nc.hoSo.userId) throw new LoiNghiepVu("Việc tự giao cho mình: sửa hạn trực tiếp, không cần xin gia hạn.", 422, "tu-giao");
  const giao = await nguoiQuyetDinhGiaHan(nc.tx, v);
  if (!giao) throw new LoiNghiepVu("Không còn ai đang hoạt động để duyệt gia hạn (người giao đã nghỉ, không có cấp trên). Báo Giám đốc.", 422, "khong-co-nguoi-duyet");
  if (!["mo", "dang-lam"].includes(v.status)) throw new LoiNghiepVu("Chỉ xin gia hạn khi việc còn đang làm.", 409, "viec-da-khoa");
  const hanMoi = d.hanMoi as Date;
  if (hanMoi.getTime() <= Date.now()) throw new LoiNghiepVu("Hạn mới phải ở tương lai.", 422, "han-qua-khu");
  if (v.dueAt && hanMoi.getTime() <= v.dueAt.getTime()) throw new LoiNghiepVu("Hạn mới phải sau hạn hiện tại.", 422, "han-khong-lui");
  const dangCho = await nc.tx.taskExtension.count({ where: { taskId: id, status: "cho-duyet" } });
  if (dangCho) throw new LoiNghiepVu("Đã có một đề nghị gia hạn đang chờ người giao.", 409, "dang-cho-gia-han");
  const g = await nc.tx.taskExtension.create({
    data: { tenantId: nc.tenantId, taskId: id, requestedBy: nc.hoSo.userId, oldDueAt: v.dueAt, newDueAt: hanMoi, reason: d.lyDo, approverId: giao },
    select: { id: true },
  });
  await nc.kiemToan({ action: "xin-gia-han", objectType: "task", objectId: id, after: { giaHanId: g.id, hanCu: v.dueAt, hanMoi, lyDo: d.lyDo } });
  await nc.suKien({ eventType: SU_KIEN.TASK_EXTENSION_REQUESTED, objectType: "task", objectId: id, payload: { giaHanId: g.id } });
  await bao(nc, giao, {
    loai: "viec-xin-gia-han",
    mucDo: "canh-bao",
    tieuDe: `${nc.hoSo.hoTen} xin gia hạn: ${v.title}`,
    noiDung: `Hạn ${v.dueAt ? dinhDangNgayGio(v.dueAt) : "chưa có"} → ${dinhDangNgayGio(hanMoi)}. Lý do: ${d.lyDo.slice(0, 400)}`,
    taskId: id,
    khoa: `viec-gia-han:${g.id}`,
  });
  return { id: g.id };
}

/** Người giao (hoặc người tạo khi việc không ghi người giao) duyệt / từ chối gia hạn. Khóa dòng đề nghị trước. */
export async function quyetDinhGiaHan(nc: NguCanh, giaHanId: string, d: z.infer<typeof LuocDoQuyetDinhGiaHan>) {
  batBuocQuyen(nc.hoSo, "task.update", { objectType: "task_extension", objectId: giaHanId });
  const g0 = await nc.tx.taskExtension.findFirst({ where: { id: giaHanId }, select: { taskId: true } });
  if (!g0) throw new LoiKhongTimThay("Đề nghị gia hạn");
  const v = await khoaVaDoc(nc, g0.taskId);
  await khoaChungTu(nc.tx, "task_extensions", giaHanId);
  const g = await nc.tx.taskExtension.findUniqueOrThrow({ where: { id: giaHanId } });
  if (g.status !== "cho-duyet") throw new LoiNghiepVu("Đề nghị này đã được quyết định.", 409, "da-quyet-dinh");
  if (nguoiQuyetDinhCua(g, v) !== nc.hoSo.userId) throw new LoiNghiepVu("Chỉ người giao việc (hoặc người nhận bàn giao bước duyệt) duyệt gia hạn.", 403, "khong-phai-nguoi-giao");
  if (!d.dongY && d.ghiChu.length < 5) throw new LoiNghiepVu("Từ chối gia hạn phải ghi lý do (tối thiểu 5 ký tự).", 422, "thieu-ly-do");
  // DG-31 (QA 0.20.0): việc đã xong / đã chấm điểm / đã hủy thì hạn đã khép lại — đổi hạn lúc này làm lệch
  // tỷ lệ đúng hạn KPI so với hệ số đúng hạn đã chấm. Vẫn cho từ chối để khép đề nghị còn treo.
  if (d.dongY && (v.approvedAt || !["mo", "dang-lam", "cho-duyet"].includes(v.status))) {
    throw new LoiNghiepVu("Việc đã xong hoặc đã hủy nên không gia hạn được nữa. Từ chối đề nghị để khép lại.", 409, "viec-da-khoa");
  }
  const bayGio = new Date();
  await nc.tx.taskExtension.update({
    where: { id: giaHanId },
    data: { status: d.dongY ? "da-duyet" : "tu-choi", decidedBy: nc.hoSo.userId, decidedAt: bayGio, decisionNote: d.ghiChu || null },
  });
  if (d.dongY) {
    // Hạn cuối cùng dùng để tính đúng hạn (DG-05, DG-30); hạn ban đầu giữ ở original_due_at.
    await nc.tx.task.update({ where: { id: v.id }, data: { dueAt: g.newDueAt, ...(v.originalDueAt === null && { originalDueAt: v.dueAt }), updatedBy: nc.hoSo.userId } });
  }
  await nc.kiemToan({ action: d.dongY ? "duyet-gia-han" : "tu-choi-gia-han", objectType: "task", objectId: v.id, before: { han: v.dueAt }, after: { han: d.dongY ? g.newDueAt : v.dueAt, ghiChu: d.ghiChu } });
  await nc.suKien({ eventType: SU_KIEN.TASK_EXTENSION_DECIDED, objectType: "task", objectId: v.id, payload: { giaHanId, dongY: d.dongY } });
  await bao(nc, g.requestedBy, {
    loai: "viec-gia-han-quyet-dinh",
    mucDo: d.dongY ? "thong-tin" : "canh-bao",
    tieuDe: `${d.dongY ? "Được gia hạn" : "Không được gia hạn"}: ${v.title}`,
    noiDung: d.dongY ? `Hạn mới: ${dinhDangNgayGio(g.newDueAt)}.` : `Lý do: ${d.ghiChu.slice(0, 400)}`,
    taskId: v.id,
    khoa: `viec-gia-han-qd:${giaHanId}`,
  });
  return { id: giaHanId, dongY: d.dongY };
}

// ---------------------------------------------------------------------------
// DG-20 → DG-31: duyệt, trả lại, chấm điểm
// ---------------------------------------------------------------------------

export const LuocDoDuyetViec = z.object({
  chatLuong: z.coerce.number().int().min(1, "Chấm chất lượng 1–5.").max(5, "Chấm chất lượng 1–5."),
  nhanXet: z.string().trim().max(2000).optional().default(""),
});
export const LuocDoTraLai = z.object({ lyDo: z.string().trim().min(5, "Ghi lý do trả lại (tối thiểu 5 ký tự).").max(2000) });

async function batBuocLuotDuyet(nc: NguCanh, v: { id: string; status: string; approvalLevel: number | null; ownerId: string }) {
  if (v.status !== "cho-duyet" || v.approvalLevel === null) throw new LoiNghiepVu("Việc không còn chờ duyệt (có thể người khác vừa duyệt / trả lại).", 409, "khong-cho-duyet");
  if (v.ownerId === nc.hoSo.userId) throw new LoiNghiepVu("Không ai duyệt việc của chính mình.", 403, "tu-duyet");
  const cap = await nc.tx.taskApprover.findFirst({ where: { taskId: v.id, level: v.approvalLevel }, select: { approverId: true } });
  if (cap?.approverId !== nc.hoSo.userId) throw new LoiNghiepVu("Chưa tới lượt bạn duyệt việc này.", 403, "khong-phai-luot");
  return v.approvalLevel;
}

/** Duyệt cấp hiện tại. Cấp cuối → `xong` + chấm điểm (độ khó × chất lượng × hệ số đúng hạn). */
export async function duyetViec(nc: NguCanh, id: string, d: z.infer<typeof LuocDoDuyetViec>) {
  const v = await khoaVaDoc(nc, id);
  const cap = await batBuocLuotDuyet(nc, v);
  const soCap = await nc.tx.taskApprover.count({ where: { taskId: id } });
  const capCuoi = cap >= soCap;
  const bayGio = new Date();
  const ch = await docCauHinhDanhGia(nc.tx);
  const dh = heSoDungHan(v.dueAt, v.submittedAt ?? bayGio, dungHanTu(ch));
  const diem = diemViec(v.difficulty, d.chatLuong, dh.heSo);
  await ghiNhatKyDuyet(nc, { taskId: id, vong: v.approvalRound, cap, hanhDong: "duyet", lyDo: d.nhanXet || null, chatLuong: d.chatLuong, han: v.dueAt, heSo: dh.heSo, diem: capCuoi ? diem : null });
  if (capCuoi) {
    await nc.tx.task.update({
      where: { id },
      data: {
        status: "xong",
        completedAt: bayGio,
        approvalLevel: null,
        approvedAt: bayGio,
        qualityScore: d.chatLuong,
        onTimeFactor: dh.heSo,
        taskScore: diem,
        progress: 100,
        updatedBy: nc.hoSo.userId,
      },
    });
  } else {
    await nc.tx.task.update({ where: { id }, data: { approvalLevel: cap + 1, updatedBy: nc.hoSo.userId } });
  }
  await nc.kiemToan({ action: "duyet-viec", objectType: "task", objectId: id, after: { cap, capCuoi, chatLuong: d.chatLuong, heSoDungHan: dh.heSo, diem: capCuoi ? diem : null } });
  await nc.suKien({ eventType: capCuoi ? SU_KIEN.TASK_APPROVED : SU_KIEN.TASK_UPDATED, objectType: "task", objectId: id, payload: { cap, capCuoi } });
  const sau = await docLai(nc, id);
  if (capCuoi) {
    // QĐ-139: điểm chỉ kèm trong thông báo khi người nhận được xem đánh giá của người làm.
    const noiDungDiem = `Chất lượng ${d.chatLuong}/5 (${NHAN_CHAT_LUONG[d.chatLuong]}), ${NHAN_LOAI_DUNG_HAN[dh.loai].toLowerCase()} — điểm ${diem}.${d.nhanXet ? ` Nhận xét: ${d.nhanXet.slice(0, 300)}` : ""}`;
    const noiDungKhongDiem = `Đã duyệt xong (${NHAN_LOAI_DUNG_HAN[dh.loai].toLowerCase()}).${d.nhanXet ? ` Nhận xét: ${d.nhanXet.slice(0, 300)}` : ""}`;
    const noiDungCho = async (nguoiNhan: string) => ((await nhanDuocDiem(nc.tx, nguoiNhan, v.ownerId)) ? noiDungDiem : noiDungKhongDiem);
    await bao(nc, v.ownerId, { loai: "viec-da-duyet", tieuDe: `Việc đã được duyệt: ${v.title}`, noiDung: await noiDungCho(v.ownerId), taskId: id, khoa: `viec-duyet:${id}:${v.approvalRound}` });
    const giao = nguoiGiaoCua(v);
    if (giao && giao !== v.ownerId) await bao(nc, giao, { loai: "viec-da-xong", tieuDe: `${sau.nguoiPhuTrach.hoTen} đã xong (đã duyệt): ${v.title}`, noiDung: await noiDungCho(giao), taskId: id, khoa: `viec-xong:${id}:${bayGio.getTime()}` });
  } else {
    await baoChoDuyet(nc, sau, cap + 1);
  }
  return sau;
}

export async function traLaiViec(nc: NguCanh, id: string, d: z.infer<typeof LuocDoTraLai>) {
  const v = await khoaVaDoc(nc, id);
  const cap = await batBuocLuotDuyet(nc, v);
  await ghiNhatKyDuyet(nc, { taskId: id, vong: v.approvalRound, cap, hanhDong: "tra-lai", lyDo: d.lyDo, han: v.dueAt });
  await nc.tx.task.update({ where: { id }, data: { status: "dang-lam", approvalLevel: null, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "tra-lai-viec", objectType: "task", objectId: id, after: { cap, lyDo: d.lyDo } });
  // QĐ-155: người làm đã nghỉ → việc chuyển cho người nhận bàn giao / cấp trên của họ (người giao giữ nguyên).
  await chuyenViecCuaNguoiLamDaNghi(nc, id);
  await nc.suKien({ eventType: SU_KIEN.TASK_RETURNED, objectType: "task", objectId: id, payload: { cap } });
  await bao(nc, v.ownerId, {
    loai: "viec-bi-tra-lai",
    mucDo: "canh-bao",
    tieuDe: `Việc bị trả lại: ${v.title}`,
    noiDung: `${nc.hoSo.hoTen}${cap > 1 ? ` (cấp ${cap})` : ""}: ${d.lyDo.slice(0, 500)}`,
    taskId: id,
    khoa: `viec-tra-lai:${id}:${v.approvalRound}`,
  });
  return docLai(nc, id);
}

// ---------------------------------------------------------------------------
// DG-32: điều chỉnh điểm
// ---------------------------------------------------------------------------

export const LuocDoDieuChinhDiem = z.object({
  chatLuong: z.coerce.number().int().min(1).max(5),
  lyDo: z.string().trim().min(10, "Ghi lý do điều chỉnh (tối thiểu 10 ký tự).").max(2000),
});

/**
 * Điểm đã chấm chỉ đổi qua điều chỉnh có lý do, chỉ ghi thêm. Người được điều chỉnh: người duyệt cấp cuối
 * của việc, hoặc người có `danh_gia.approve` mà người làm nằm trong phạm vi. Không ai tự chỉnh điểm mình.
 */
export async function dieuChinhDiem(nc: NguCanh, id: string, d: z.infer<typeof LuocDoDieuChinhDiem>) {
  const v = await khoaVaDoc(nc, id);
  if (!v.approvedAt || v.taskScore === null || v.onTimeFactor === null) throw new LoiNghiepVu("Việc chưa được duyệt nên chưa có điểm để điều chỉnh.", 409, "chua-co-diem");
  if (v.ownerId === nc.hoSo.userId) throw new LoiNghiepVu("Không tự điều chỉnh điểm việc của mình.", 403, "tu-duyet");
  const capCuoi = await nc.tx.taskApprover.findFirst({ where: { taskId: id }, orderBy: { level: "desc" }, select: { approverId: true } });
  if (capCuoi?.approverId !== nc.hoSo.userId && !(await dieuChinhDiemViecDuoc(nc, v.ownerId))) {
    throw new LoiNghiepVu("Chỉ người duyệt cấp cuối hoặc người chốt đánh giá của người này điều chỉnh được điểm.", 403, "khong-duoc-dieu-chinh");
  }
  const diemMoi = diemViec(v.difficulty, d.chatLuong, Number(v.onTimeFactor));
  await nc.tx.taskScoreAdjustment.create({
    data: {
      tenantId: nc.tenantId, taskId: id, oldScore: v.taskScore, newScore: diemMoi, oldQuality: v.qualityScore,
      newQuality: d.chatLuong, reason: d.lyDo, createdBy: nc.hoSo.userId,
    },
  });
  await nc.tx.task.update({ where: { id }, data: { qualityScore: d.chatLuong, taskScore: diemMoi, updatedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "dieu-chinh-diem-viec", objectType: "task", objectId: id, before: { chatLuong: v.qualityScore, diem: Number(v.taskScore) }, after: { chatLuong: d.chatLuong, diem: diemMoi, lyDo: d.lyDo } });
  await nc.suKien({ eventType: SU_KIEN.TASK_SCORE_ADJUSTED, objectType: "task", objectId: id });
  const nhanDiem = await nhanDuocDiem(nc.tx, v.ownerId, v.ownerId);
  await bao(nc, v.ownerId, { loai: "viec-dieu-chinh-diem", tieuDe: `Điểm việc được điều chỉnh: ${v.title}`, noiDung: `${nhanDiem ? `${Number(v.taskScore)} → ${diemMoi}. ` : ""}Lý do: ${d.lyDo.slice(0, 400)}`, taskId: id });
  return docLai(nc, id);
}

// ---------------------------------------------------------------------------
// Lịch sử trên một việc
// ---------------------------------------------------------------------------

export async function lichSuGiaoViec(nc: NguCanh, id: string) {
  batBuocQuyen(nc.hoSo, "task.view", { objectType: "task", objectId: id });
  const v = await docViecTrongPhamVi(nc, id);
  const toi = nc.hoSo.userId;
  const nguoiDuyet = await nc.tx.taskApprover.findMany({ where: { taskId: id }, orderBy: { level: "asc" }, select: { level: true, approverId: true } });
  const nhatKy = await nc.tx.taskApprovalLog.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" } });
  const giaHan = await nc.tx.taskExtension.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" } });
  const tienDo = await nc.tx.taskProgressLog.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" } });
  const dieuChinh = await nc.tx.taskScoreAdjustment.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" } });
  const chuyenBuoc = await nc.tx.approvalTransfer.findMany({ where: { taskId: id }, orderBy: { createdAt: "asc" } });
  const tepTienDo = tienDo.length
    ? await nc.tx.attachment.findMany({ where: { objectType: "task_progress", objectId: { in: tienDo.map((t) => t.id) }, deletedAt: null }, select: { id: true, objectId: true, fileName: true } })
    : [];
  const ten = await banDoTen(nc.tx, [
    ...nguoiDuyet.map((x) => x.approverId), ...nhatKy.map((x) => x.actorId), ...giaHan.flatMap((x) => [x.requestedBy, x.decidedBy]),
    ...tienDo.map((x) => x.createdBy), ...dieuChinh.map((x) => x.createdBy), ...chuyenBuoc.flatMap((x) => [x.fromUserId, x.toUserId]),
  ]);
  const xemDiem = (await xemDuocDanhGiaCua(nc, v.ownerId)) || nguoiDuyet.some((x) => x.approverId === toi);
  const coDuyet = await nc.tx.taskApprover.findFirst({ where: { taskId: id, level: v.approvalLevel ?? -1 }, select: { approverId: true } });
  const capCuoi = nguoiDuyet[nguoiDuyet.length - 1]?.approverId ?? null;
  const giao = nguoiGiaoCua(v);
  return {
    nguoiDuyet: nguoiDuyet.map((x) => ({ cap: x.level, id: x.approverId, hoTen: ten.get(x.approverId) ?? "—" })),
    nhatKyDuyet: nhatKy.map((x) => ({
      id: x.id, vong: x.round, cap: x.level, hanhDong: x.action, nguoi: ten.get(x.actorId) ?? "—", lyDo: x.reason,
      chatLuong: xemDiem ? x.quality : null, heSo: xemDiem && x.onTimeFactor !== null ? Number(x.onTimeFactor) : null,
      diem: xemDiem && x.score !== null ? Number(x.score) : null, luc: x.createdAt,
    })),
    giaHan: giaHan.map((x) => ({
      id: x.id, nguoiXin: ten.get(x.requestedBy) ?? "—", hanCu: x.oldDueAt, hanMoi: x.newDueAt, lyDo: x.reason, trangThai: x.status,
      nguoiQuyetDinh: x.decidedBy ? (ten.get(x.decidedBy) ?? "—") : null, quyetDinhLuc: x.decidedAt, ghiChu: x.decisionNote, luc: x.createdAt,
    })),
    tienDo: tienDo.map((x) => ({
      id: x.id, phanTram: x.percent, ghiChu: x.note, nguoi: ten.get(x.createdBy) ?? "—", luc: x.createdAt,
      tep: tepTienDo.filter((t) => t.objectId === x.id).map((t) => ({ id: t.id, ten: t.fileName })),
    })),
    dieuChinhDiem: xemDiem
      ? dieuChinh.map((x) => ({ id: x.id, diemCu: x.oldScore === null ? null : Number(x.oldScore), diemMoi: Number(x.newScore), chatLuongCu: x.oldQuality, chatLuongMoi: x.newQuality, lyDo: x.reason, nguoi: ten.get(x.createdBy) ?? "—", luc: x.createdAt }))
      : [],
    /** QĐ-135: bước duyệt việc / gia hạn đã chuyển vì người giữ bước nghỉ việc, bị khóa, bàn giao. */
    chuyenBuoc: chuyenBuoc.map((x) => ({
      id: x.id, loai: x.objectType, cap: x.level, tu: ten.get(x.fromUserId) ?? "—", sang: ten.get(x.toUserId) ?? "—", lyDo: x.reason, ghiChu: x.note, luc: x.createdAt,
    })),
    xemDiem,
    quyen: {
      nhan: v.ownerId === toi && v.acceptStatus === "cho-nhan",
      baoTienDo: v.ownerId === toi && ["mo", "dang-lam"].includes(v.status) && v.acceptStatus !== "tu-choi",
      xinGiaHan: v.ownerId === toi && !!giao && giao !== toi && ["mo", "dang-lam"].includes(v.status) && !giaHan.some((g) => g.status === "cho-duyet"),
      quyetDinhGiaHan: giaHan.some((g) => g.status === "cho-duyet" && nguoiQuyetDinhCua(g, v) === toi),
      duyet: v.status === "cho-duyet" && coDuyet?.approverId === toi && v.ownerId !== toi,
      dieuChinhDiem: !!v.approvedAt && v.ownerId !== toi && (capCuoi === toi || (await dieuChinhDiemViecDuoc(nc, v.ownerId))),
      // QĐ-137: chỉ người giao / quản lý trực tiếp của người làm / Giám đốc / Quản trị (trong phạm vi task.update).
      suaCauHinhDuyet: coQuyen(nc.hoSo, "task.update") && !(v.ownerId === toi && !!v.assignedBy && v.assignedBy !== toi) && v.status !== "cho-duyet" && !v.approvedAt
        && (await batBuocSuaDuoc(nc, v).then(() => true, () => false)) && (await duocDoiThuocTinhChamDiem(nc, v)),
    },
  };
}

export { anDiem, batBuocSuaDuoc };

// ---------------------------------------------------------------------------
// "Việc của nhóm" — ai đang làm gì, quá hạn, khối lượng tuần, điểm tháng
// ---------------------------------------------------------------------------

/**
 * Trang tổng hợp cho quản lý: mỗi người trong phạm vi `task.view` (+ cấp dưới trực tiếp) — việc đang mở,
 * quá hạn, chờ nhận, chờ duyệt, xong trong tuần (giờ VN), điểm việc tháng này (chỉ khi xem được đánh giá).
 */
export async function viecCuaNhom(nc: NguCanh, bayGio = new Date()) {
  batBuocQuyen(nc.hoSo, "task.view");
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "task.view");
  const ds = pv === "tat-ca"
    ? (await nc.tx.user.findMany({ where: { status: "hoat-dong", isSystem: false }, select: { id: true } })).map((u) => u.id)
    : [...new Set([...pv, ...(await capDuoi(nc.tx, nc.hoSo.userId))])];
  const homNay = ngayVNCua(bayGio);
  const dauT = mocVN(dauTuan(homNay), 0);
  const dauThang = mocVN(`${homNay.slice(0, 7)}-01`, 0);
  const nhom = async (where: Record<string, unknown>) =>
    new Map((await nc.tx.task.groupBy({ by: ["ownerId"], where: { ownerId: { in: ds }, ...where }, _count: { _all: true } })).map((x) => [x.ownerId, x._count._all]));
  const mo = await nhom({ status: { in: ["mo", "dang-lam"] } });
  const quaHan = await nhom({ status: { in: ["mo", "dang-lam"] }, dueAt: { lt: bayGio } });
  const choNhan = await nhom({ status: { in: ["mo", "dang-lam"] }, acceptStatus: "cho-nhan" });
  const choDuyet = await nhom({ status: "cho-duyet" });
  const xongTuan = await nhom({ status: "xong", completedAt: { gte: dauT } });
  const diem = new Map(
    (await nc.tx.task.groupBy({ by: ["ownerId"], where: { ownerId: { in: ds }, approvedAt: { gte: dauThang } }, _sum: { taskScore: true } })).map((x) => [x.ownerId, Number(x._sum.taskScore ?? 0)]),
  );
  const pvDiem = await nguoiXemDuocDanhGia(nc);
  const ten = await banDoTen(nc.tx, ds);
  return ds
    .map((id) => ({
      id, hoTen: ten.get(id) ?? "—", dangMo: mo.get(id) ?? 0, quaHan: quaHan.get(id) ?? 0, choNhan: choNhan.get(id) ?? 0,
      choDuyet: choDuyet.get(id) ?? 0, xongTuan: xongTuan.get(id) ?? 0,
      diemThang: pvDiem === "tat-ca" || pvDiem.includes(id) ? (diem.get(id) ?? 0) : null,
    }))
    .sort((a, b) => b.quaHan - a.quaHan || b.dangMo - a.dangMo || a.hoTen.localeCompare(b.hoTen, "vi"));
}
