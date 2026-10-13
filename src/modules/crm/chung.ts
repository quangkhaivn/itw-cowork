import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { idNguoiTrongPhamVi } from "@/lib/phan-quyen";
import { LoiDinhDang, LoiNghiepVu } from "@/lib/loi";
import { MUI_GIO } from "@/lib/dinh-dang";

/**
 * Tiện ích dùng chung của các phân hệ CRM: phạm vi theo người phụ trách, kiểm người
 * được giao việc, lược đồ tiền và ngày.
 */

// ---------------------------------------------------------------------------
// Phạm vi dữ liệu theo cột owner_id
// ---------------------------------------------------------------------------

/**
 * Điều kiện Prisma giới hạn theo phạm vi của một quyền: `{}` khi phạm vi "all",
 * `{ ownerId: { in: [...] } }` còn lại. Không có quyền → danh sách rỗng → không thấy gì.
 */
export async function locTheoPhamVi(nc: NguCanh, maQuyen: string): Promise<{ ownerId?: { in: string[] } }> {
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, maQuyen);
  return pv === "tat-ca" ? {} : { ownerId: { in: pv } };
}

/** Người phụ trách `ownerId` có nằm trong phạm vi quyền `maQuyen` của người đang thao tác không. */
export async function trongPhamVi(nc: NguCanh, maQuyen: string, ownerId: string): Promise<boolean> {
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, maQuyen);
  return pv === "tat-ca" || pv.includes(ownerId);
}

/**
 * Kiểm người được giao phụ trách: phải là người thật đang hoạt động trong doanh nghiệp,
 * và nằm trong phạm vi `maQuyen` của người giao — nhân viên phạm vi "own" chỉ giao cho
 * chính mình, trưởng phòng "team" giao cho người trong nhóm (KH-05).
 */
export async function kiemTraNguoiPhuTrach(nc: NguCanh, maQuyen: string, ownerId: string): Promise<void> {
  const u = await nc.tx.user.findFirst({
    where: { id: ownerId, status: "hoat-dong", isSystem: false },
    select: { id: true },
  });
  if (!u) throw new LoiNghiepVu("Người phụ trách không tồn tại hoặc đã ngừng hoạt động.", 422, "nguoi-phu-trach");
  if (!(await trongPhamVi(nc, maQuyen, ownerId))) {
    throw new LoiNghiepVu("Bạn chỉ giao được cho người trong phạm vi mình quản lý.", 403, "ngoai-pham-vi");
  }
}

/** Danh sách người có thể được giao phụ trách, theo phạm vi của người đang thao tác. */
export async function danhSachNguoiPhuTrach(nc: NguCanh, maQuyen: string) {
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, maQuyen);
  return nc.tx.user.findMany({
    where: { status: "hoat-dong", isSystem: false, ...(pv !== "tat-ca" && { id: { in: pv } }) },
    select: { id: true, fullName: true, email: true },
    orderBy: { fullName: "asc" },
  });
}

/**
 * Mã dữ liệu gốc (phân khúc, nguồn lead, lý do thua…) phải tồn tại và đang dùng.
 * Mã đã tắt vẫn chấp nhận nếu bản ghi đang giữ đúng mã đó (`giuNguyen`) — tắt một nguồn
 * lead không được làm hỏng việc sửa các khách cũ mang nguồn đó.
 */
export async function kiemTraMaDuLieuGoc(
  nc: NguCanh,
  loai: string,
  ma: string | null | undefined,
  truong: string,
  giuNguyen?: string | null,
): Promise<void> {
  if (!ma || ma === giuNguyen) return;
  const muc = await nc.tx.masterDataItem.findFirst({ where: { type: loai, code: ma, status: "hoat-dong" }, select: { id: true } });
  if (!muc) throw new LoiDinhDang(truong, "Giá trị không có trong Dữ liệu gốc hoặc đã ngừng dùng.");
}

/** Danh sách chọn cho form: các mục dữ liệu gốc đang dùng của nhiều loại một lúc. */
export async function luaChonDuLieuGoc(nc: NguCanh, loais: string[]) {
  const ds = await nc.tx.masterDataItem.findMany({
    where: { type: { in: loais }, status: "hoat-dong" },
    select: { type: true, code: true, name: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const kq: Record<string, { ma: string; ten: string }[]> = Object.fromEntries(loais.map((l) => [l, []]));
  for (const m of ds) kq[m.type]?.push({ ma: m.code, ten: m.name });
  return kq;
}

/** Bản đồ mã → tên của dữ liệu gốc, để hiển thị (gồm cả mục đã tắt). */
export async function banDoTenDuLieuGoc(nc: NguCanh, loais: string[]) {
  const ds = await nc.tx.masterDataItem.findMany({ where: { type: { in: loais } }, select: { type: true, code: true, name: true } });
  const kq: Record<string, Record<string, string>> = Object.fromEntries(loais.map((l) => [l, {}]));
  for (const m of ds) if (kq[m.type]) kq[m.type][m.code] = m.name;
  return kq;
}

// ---------------------------------------------------------------------------
// Lược đồ dùng chung
// ---------------------------------------------------------------------------

export const chuoiTuyChon = (toiDa: number) =>
  z
    .string()
    .trim()
    .max(toiDa, `Tối đa ${toiDa} ký tự.`)
    .transform((s) => (s === "" ? null : s))
    .nullable()
    .optional();

export const uuidTuyChon = z
  .union([z.uuid(), z.literal(""), z.null()])
  .transform((s) => (s ? s : null))
  .optional();

/**
 * Số tiền VND: nhận số hoặc chuỗi ("12.000.000" hoặc "12000000"), ≥ 0, tối đa 2 số lẻ.
 * Trả chuỗi thập phân để Prisma ghi thẳng vào numeric(18,2) mà không qua số thực.
 */
export const soTien = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const s = typeof v === "number" ? String(v) : v.trim().replace(/\./g, "").replace(",", ".");
    if (s === "") return "0";
    if (!/^\d{1,16}(\.\d{1,2})?$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Số tiền không hợp lệ (số không âm, tối đa 2 số lẻ)." });
      return z.NEVER;
    }
    return s;
  });

/** Ngày "yyyy-mm-dd" từ ô chọn ngày. Chuỗi rỗng → null. */
export const ngayTuyChon = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ."), z.literal(""), z.null()])
  .transform((s) => (s ? s : null))
  .optional();

/** Thời điểm ISO hoặc "yyyy-mm-ddTHH:mm" (ô datetime-local, hiểu là giờ Việt Nam). */
export const thoiDiemTuyChon = z
  .union([z.string().max(40), z.literal(""), z.null()])
  .transform((s, ctx) => {
    if (!s) return null;
    const d = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) ? new Date(`${s}:00+07:00`) : new Date(s);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Thời điểm không hợp lệ." });
      return z.NEVER;
    }
    return d;
  })
  .optional();

// ---------------------------------------------------------------------------
// Ngày (cột @db.Date)
// ---------------------------------------------------------------------------

/** "yyyy-mm-dd" → Date nửa đêm UTC, đúng cách Prisma ghi cột kiểu date. */
export function ngayVeDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** Date của cột kiểu date → "yyyy-mm-dd" (cho ô chọn ngày). */
export function dateVeNgay(d: Date | null | undefined): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

/** Hôm nay theo giờ Việt Nam, dạng "yyyy-mm-dd". */
export function homNayVN(luc: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MUI_GIO, year: "numeric", month: "2-digit", day: "2-digit" }).format(luc);
}

/** Bản ghi có thể có Decimal → chuỗi, để trả JSON và ghi Audit Log không mất độ chính xác. */
export function tienVeChuoi(x: { toString(): string } | null | undefined): string | null {
  return x === null || x === undefined ? null : x.toString();
}

// ---------------------------------------------------------------------------
// Khóa dò trùng lead (MK-07, LD-03)
// ---------------------------------------------------------------------------

/**
 * Khóa tư vấn theo (tenant, SĐT / email / MST đã chuẩn hóa) trong suốt giao dịch, gọi TRƯỚC
 * bước dò trùng. Hai lần gửi cùng lúc cùng một số điện thoại thì lần sau phải chờ lần trước
 * commit rồi mới dò — và lúc đó thấy lead vừa tạo (READ COMMITTED chụp lại ảnh mỗi câu lệnh).
 * Khóa theo thứ tự cố định (sắp xếp chuỗi khóa) để hai giao dịch giữ chéo SĐT / email không
 * chờ nhau vòng tròn. Khóa tự nhả khi giao dịch kết thúc.
 */
export async function khoaDoTrungLead(
  tx: ClientTenant,
  tenantId: string,
  k: { dienThoai?: string | null; email?: string | null; maSoThue?: string | null },
): Promise<void> {
  const ds = [
    k.dienThoai && `lead-trung:${tenantId}:dt:${k.dienThoai}`,
    k.email && `lead-trung:${tenantId}:em:${k.email}`,
    k.maSoThue && `lead-trung:${tenantId}:mst:${k.maSoThue}`,
  ]
    .filter((x): x is string => Boolean(x))
    .sort();
  for (const khoa of ds) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${khoa}, 0))`;
  }
}
