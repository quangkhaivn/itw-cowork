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
  laGiamDoc(userId: string): boolean;
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
    laGiamDoc: (id) => d.giamDoc.includes(id),
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
export function laGiamDocHoacQuanTri(hoSo: HoSoQuyen): boolean {
  return hoSo.vaiTro.some((v) => v.code === MA_VAI_TRO_GIAM_DOC || v.code === MA_VAI_TRO_QUAN_TRI);
}
