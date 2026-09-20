import type { ClientTenant } from "@/lib/db";
import type { NguCanh } from "@/lib/api";
import { LoiKhongTimThay } from "@/lib/loi";
import type { MucDo } from "@/modules/nhac-viec/quy-tac";

/**
 * Thông báo trong ứng dụng — cái chuông trên thanh trên. Mục 22 prompt 20/09.
 *
 * Ba luật giữ cho chuông không thành rác:
 *  1. **Chỉ báo việc của chính người đó.** Không có "thông báo toàn công ty".
 *  2. **Chống trùng bằng `dedupeKey`.** Bản quét chạy lại trong ngày không nhân đôi chuông.
 *  3. **Không báo khi không có gì.** Không sinh thông báo "bạn có 0 việc".
 *
 * Phase này chỉ báo trong ứng dụng. Gửi email/Zalo cần dịch vụ gửi và mẫu thư được
 * duyệt — chưa có, nên không làm nửa vời.
 */

export interface DuLieuThongBao {
  nguoiNhanId: string;
  loai: string;
  mucDo?: MucDo;
  tieuDe: string;
  noiDung?: string | null;
  duongDan?: string | null;
  doiTuong?: string | null;
  doiTuongId?: string | null;
  /** Cùng người + cùng khóa thì chỉ có một thông báo. Bỏ trống = luôn tạo mới. */
  khoaChongTrung?: string | null;
}

/**
 * Tạo một thông báo. Trả `true` nếu thật sự tạo mới, `false` nếu đã có (chống trùng) —
 * để bên gọi đếm đúng số chuông đã rung.
 *
 * Nhận `tx` chứ không nhận `NguCanh` vì worker nền cũng gọi hàm này, mà worker không
 * có người dùng nào đứng sau.
 */
export async function taoThongBao(tx: ClientTenant, tenantId: string, d: DuLieuThongBao): Promise<boolean> {
  if (d.khoaChongTrung) {
    const daCo = await tx.notification.findFirst({
      where: { userId: d.nguoiNhanId, dedupeKey: d.khoaChongTrung },
      select: { id: true },
    });
    if (daCo) return false;
  }
  await tx.notification.create({
    data: {
      tenantId,
      userId: d.nguoiNhanId,
      type: d.loai,
      severity: d.mucDo ?? "thong-tin",
      title: d.tieuDe,
      body: d.noiDung ?? null,
      link: d.duongDan ?? null,
      objectType: d.doiTuong ?? null,
      objectId: d.doiTuongId ?? null,
      dedupeKey: d.khoaChongTrung ?? null,
    },
  });
  return true;
}

/**
 * Báo cho người đang giữ một quyền nào đó (ví dụ: báo giá chờ duyệt → những người
 * có `quotation.approve`). Bỏ qua chính người gây ra việc — không ai cần tự báo mình.
 */
export async function baoChoNguoiCoQuyen(
  tx: ClientTenant,
  tenantId: string,
  maQuyen: string,
  d: Omit<DuLieuThongBao, "nguoiNhanId">,
  boQuaNguoiId?: string | null,
): Promise<number> {
  const nguoi = await tx.user.findMany({
    where: {
      status: "hoat-dong",
      isSystem: false,
      ...(boQuaNguoiId ? { id: { not: boQuaNguoiId } } : {}),
      userRoles: { some: { role: { rolePermissions: { some: { status: "hoat-dong", permission: { code: maQuyen } } } } } },
    },
    select: { id: true },
  });
  let dem = 0;
  for (const n of nguoi) {
    if (await taoThongBao(tx, tenantId, { ...d, nguoiNhanId: n.id })) dem += 1;
  }
  return dem;
}

// ---------------------------------------------------------------------------
// Đọc — luôn chỉ của chính người đang đăng nhập
// ---------------------------------------------------------------------------

export async function danhSachThongBao(nc: NguCanh, chiChuaDoc = false, gioiHan = 30) {
  const ds = await nc.tx.notification.findMany({
    where: { userId: nc.hoSo.userId, ...(chiChuaDoc ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(gioiHan, 1), 100),
    select: {
      id: true, type: true, severity: true, title: true, body: true, link: true,
      objectType: true, objectId: true, readAt: true, createdAt: true,
    },
  });
  const soChuaDoc = await nc.tx.notification.count({ where: { userId: nc.hoSo.userId, readAt: null } });
  return {
    soChuaDoc,
    dong: ds.map((t) => ({
      id: t.id,
      loai: t.type,
      mucDo: t.severity,
      tieuDe: t.title,
      noiDung: t.body,
      duongDan: t.link,
      doiTuong: t.objectType,
      doiTuongId: t.objectId,
      daDoc: t.readAt !== null,
      luc: t.createdAt,
    })),
  };
}

export async function demChuaDoc(nc: NguCanh): Promise<number> {
  return nc.tx.notification.count({ where: { userId: nc.hoSo.userId, readAt: null } });
}

// ---------------------------------------------------------------------------
// Ghi
// ---------------------------------------------------------------------------

export async function danhDauDaDoc(nc: NguCanh, id: string) {
  const tb = await nc.tx.notification.findFirst({ where: { id, userId: nc.hoSo.userId }, select: { id: true, readAt: true } });
  if (!tb) throw new LoiKhongTimThay("Thông báo");
  if (tb.readAt) return { id, daDoc: true };
  await nc.tx.notification.update({ where: { id }, data: { readAt: new Date() } });
  return { id, daDoc: true };
}

export async function danhDauDocHet(nc: NguCanh) {
  const kq = await nc.tx.notification.updateMany({
    where: { userId: nc.hoSo.userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { soDaDanhDau: kq.count };
}
