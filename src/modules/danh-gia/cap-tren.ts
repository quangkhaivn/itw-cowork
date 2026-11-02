import type { ClientTenant } from "@/lib/db";
import type { HoSoQuyen } from "@/lib/phan-quyen";

/**
 * Cấp trên hiệu lực (0.20.0, QĐ-132 / QĐ-135).
 *
 *  - **Quản lý hiệu lực** của một người = quản lý trực tiếp trên hồ sơ nhân sự nếu còn hoạt động; người đó
 *    đã nghỉ / bị khóa thì đi tiếp lên quản lý của người đó…; hết chuỗi mà không gặp ai đang hoạt động thì
 *    là **Giám đốc** (vai trò `ceo` đang hoạt động; nhiều người thì lấy người tạo sớm nhất). Bản thân Giám
 *    đốc (không khai quản lý) không có quản lý hiệu lực.
 *  - **Chuỗi cấp trên** (dùng khi chuyển bước đang chờ của người nghỉ việc): quản lý hiệu lực, rồi cấp trên
 *    của người đó…, rồi các Giám đốc, cuối cùng các Quản trị — người gọi bỏ những ai không nhận được (người
 *    làm việc đó, người đã đứng ở cấp khác) để **không ai tự duyệt**.
 *
 * Phần thuần (`chuoiCapTrenThuan`, `quanLyHieuLucThuan`) có bài thử đơn vị; `napBanDoCapTren` đọc CSDL một
 * lần cho cả doanh nghiệp (vài trăm người) để các vòng quét không truy vấn từng người.
 */

export const MA_VAI_TRO_GIAM_DOC = "ceo";
export const MA_VAI_TRO_QUAN_TRI = "admin";
/** Độ sâu tối đa khi đi lên chuỗi quản lý — chặn vòng lặp do dữ liệu lỗi. */
const DO_SAU_TOI_DA = 20;

export interface DuLieuCapTren {
  /** userId → quản lý trực tiếp trên hồ sơ (null = không khai). */
  quanLy: ReadonlyMap<string, string | null>;
  /** Người dùng thật đang hoạt động. */
  hoatDong: ReadonlySet<string>;
  /** Giám đốc đang hoạt động, theo ngày tạo tăng dần. */
  giamDoc: readonly string[];
  /** Quản trị đang hoạt động (không phải Giám đốc), theo ngày tạo tăng dần. */
  quanTri: readonly string[];
}

/** Các quản lý đang hoạt động khi đi dần lên từ `userId` (bỏ qua người đã nghỉ, dừng khi gặp vòng). */
export function chuoiQuanLyThuan(userId: string, d: DuLieuCapTren): string[] {
  return diLen(userId, d);
}
function diLen(userId: string, d: DuLieuCapTren): string[] {
  const kq: string[] = [];
  const daQua = new Set<string>([userId]);
  let cur: string | null | undefined = d.quanLy.get(userId);
  for (let i = 0; cur && i < DO_SAU_TOI_DA && !daQua.has(cur); i++) {
    daQua.add(cur);
    if (d.hoatDong.has(cur)) kq.push(cur);
    cur = d.quanLy.get(cur);
  }
  return kq;
}

/** Quản lý hiệu lực (xem đầu tệp). null = không ai (Giám đốc không khai quản lý, hoặc doanh nghiệp không có Giám đốc). */
export function quanLyHieuLucThuan(userId: string, d: DuLieuCapTren): string | null {
  const len = diLen(userId, d);
  if (len.length) return len[0];
  if (d.giamDoc.includes(userId)) return null;
  return d.giamDoc.find((g) => g !== userId) ?? null;
}

/** Chuỗi cấp trên để chuyển bước: các quản lý đang hoạt động đi lên → Giám đốc → Quản trị, không trùng, không gồm chính người đó. */
export function chuoiCapTrenThuan(userId: string, d: DuLieuCapTren): string[] {
  const kq: string[] = [];
  for (const x of [...diLen(userId, d), ...d.giamDoc, ...d.quanTri]) if (x !== userId && !kq.includes(x)) kq.push(x);
  return kq;
}

export interface BanDoCapTren extends DuLieuCapTren {
  quanLyHieuLuc(userId: string): string | null;
  chuoiCapTren(userId: string): string[];
  /** Quản lý trực tiếp và mọi cấp trên (đang hoạt động) trong chuỗi quản lý của `userId` (QĐ-154). */
  chuoiQuanLy(userId: string): string[];
  laGiamDoc(userId: string): boolean;
  laGiamDocHoacQuanTri(userId: string): boolean;
}

/** Đọc hồ sơ nhân sự + người đang hoạt động + Giám đốc / Quản trị của doanh nghiệp (theo RLS của giao dịch). */
export async function napBanDoCapTren(tx: ClientTenant): Promise<BanDoCapTren> {
  const hs = await tx.staffProfile.findMany({ select: { userId: true, managerId: true } });
  const nd = await tx.user.findMany({
    where: { status: "hoat-dong", isSystem: false },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, userRoles: { where: { status: "hoat-dong", role: { status: "hoat-dong", code: { in: [MA_VAI_TRO_GIAM_DOC, MA_VAI_TRO_QUAN_TRI] } } }, select: { role: { select: { code: true } } } } },
  });
  const giamDoc = nd.filter((u) => u.userRoles.some((r) => r.role.code === MA_VAI_TRO_GIAM_DOC)).map((u) => u.id);
  const d: DuLieuCapTren = {
    quanLy: new Map(hs.map((h) => [h.userId, h.managerId])),
    hoatDong: new Set(nd.map((u) => u.id)),
    giamDoc,
    quanTri: nd.filter((u) => !giamDoc.includes(u.id) && u.userRoles.some((r) => r.role.code === MA_VAI_TRO_QUAN_TRI)).map((u) => u.id),
  };
  return {
    ...d,
    quanLyHieuLuc: (id) => quanLyHieuLucThuan(id, d),
    chuoiCapTren: (id) => chuoiCapTrenThuan(id, d),
    chuoiQuanLy: (id) => diLen(id, d),
    laGiamDoc: (id) => d.giamDoc.includes(id),
    laGiamDocHoacQuanTri: (id) => d.giamDoc.includes(id) || d.quanTri.includes(id),
  };
}

/** Quản lý hiệu lực của một người (một lần đọc). */
export async function quanLyHieuLuc(tx: ClientTenant, userId: string): Promise<string | null> {
  return (await napBanDoCapTren(tx)).quanLyHieuLuc(userId);
}

/** Người đang thao tác giữ vai trò Giám đốc. */
export function laGiamDoc(hoSo: HoSoQuyen): boolean {
  return hoSo.vaiTro.some((v) => v.code === MA_VAI_TRO_GIAM_DOC);
}

/** Người đang thao tác giữ vai trò Giám đốc hoặc Quản trị. */
/**
 * QĐ-154 — kiểm chuỗi người duyệt của việc CẦN DUYỆT, kể cả việc tự tạo (người làm = người giao — chặn hai
 * đồng nghiệp tự tạo việc rồi chấm điểm chéo cho nhau). Thuần.
 *  - Người duyệt **cấp cuối** (quyết điểm) phải là quản lý trực tiếp / cấp trên trong chuỗi quản lý của người
 *    làm, hoặc Giám đốc / Quản trị. (Người giao chỉ đứng được cấp cuối khi chính họ nằm trong chuỗi đó.)
 *  - Người giao không nằm trong chuỗi quản lý của người làm và không phải Giám đốc / Quản trị (đồng nghiệp
 *    ngang cấp) thì không được đứng ở bất kỳ cấp nào.
 * Trả mã lỗi, hoặc null khi hợp lệ.
 */
export function loiChuoiDuyetKhiGiao(
  chuoi: readonly string[],
  d: { nguoiLamId: string; nguoiGiaoId: string; quanLyCuaNguoiLam: readonly string[]; laGiamDocHoacQuanTri: (id: string) => boolean },
): "tu-dat-nguoi-duyet" | "nguoi-duyet-cuoi" | null {
  if (chuoi.length === 0) return null;
  const hopLe = (id: string) => d.quanLyCuaNguoiLam.includes(id) || d.laGiamDocHoacQuanTri(id);
  // Việc tự tạo: người làm đứng trong chuỗi là lỗi "tự duyệt" (DG-21, kiểm riêng) — ở đây chỉ xét cấp cuối.
  if (d.nguoiLamId !== d.nguoiGiaoId && chuoi.includes(d.nguoiGiaoId) && !hopLe(d.nguoiGiaoId)) return "tu-dat-nguoi-duyet";
  if (!hopLe(chuoi[chuoi.length - 1])) return "nguoi-duyet-cuoi";
  return null;
}

/**
 * QĐ-154 — sửa chuỗi duyệt DỰNG TỰ ĐỘNG (mặc định / theo mẫu / theo lịch) cho việc giao cho người khác: bỏ người
 * giao nếu họ không được đứng duyệt; cấp cuối không hợp lệ thì thêm người duyệt mặc định ở cuối — người giao nếu
 * họ hợp lệ, không thì quản lý hiệu lực của người làm (không có quản lý → Giám đốc → Quản trị). Thuần.
 */
export function chuanHoaChuoiDuyetKhiGiao(
  chuoi: readonly string[],
  d: { nguoiLamId: string; nguoiGiaoId: string; quanLyCuaNguoiLam: readonly string[]; laGiamDocHoacQuanTri: (id: string) => boolean; capTrenCuaNguoiLam: readonly string[] },
): string[] {
  const hopLe = (id: string) => d.quanLyCuaNguoiLam.includes(id) || d.laGiamDocHoacQuanTri(id);
  let kq = chuoi.filter((x) => x !== d.nguoiLamId && (x !== d.nguoiGiaoId || hopLe(x)));
  if (kq.length && hopLe(kq[kq.length - 1])) return kq;
  const macDinh = hopLe(d.nguoiGiaoId) && d.nguoiGiaoId !== d.nguoiLamId ? d.nguoiGiaoId : d.capTrenCuaNguoiLam.find((x) => x !== d.nguoiLamId);
  if (!macDinh) return kq;
  kq = [...kq.filter((x) => x !== macDinh), macDinh];
  return kq.slice(-5);
}

export function laGiamDocHoacQuanTri(hoSo: HoSoQuyen): boolean {
  return hoSo.vaiTro.some((v) => v.code === MA_VAI_TRO_GIAM_DOC || v.code === MA_VAI_TRO_QUAN_TRI);
}
