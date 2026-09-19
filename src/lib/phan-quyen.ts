import type { ClientTenant } from "./db";
import { ghiSuKien, SU_KIEN } from "./su-kien";
import { ghiKiemToan } from "./kiem-toan";

/**
 * RBAC — kiểm tra quyền (mục 19 đặc tả).
 *
 * Mọi hành động quan trọng phải kiểm đủ chuỗi: Tenant + User + Role + Permission.
 * Tenant đã được `voiTenant()` và RLS lo. Ở đây lo ba phần còn lại.
 *
 * Mỗi lần từ chối quyền đều ghi lại — cả Business Event lẫn Audit Log — vì một
 * chuỗi từ chối liên tiếp là dấu hiệu có người đang dò quyền.
 */

export interface HoSoQuyen {
  userId: string;
  email: string;
  vaiTro: { code: string; name: string }[];
  quyen: Set<string>;
}

/** Đọc toàn bộ vai trò và quyền của một người dùng. Gọi bên trong `voiTenant()`. */
export async function layHoSoQuyen(tx: ClientTenant, userId: string): Promise<HoSoQuyen | null> {
  const nguoiDung = await tx.user.findFirst({
    where: { id: userId, status: "hoat-dong" },
    select: {
      id: true,
      email: true,
      userRoles: {
        where: { status: "hoat-dong" },
        select: {
          role: {
            select: {
              code: true,
              name: true,
              status: true,
              rolePermissions: {
                where: { status: "hoat-dong" },
                select: { permission: { select: { code: true, status: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!nguoiDung) return null;

  const vaiTro: { code: string; name: string }[] = [];
  const quyen = new Set<string>();

  for (const ur of nguoiDung.userRoles) {
    if (ur.role.status !== "hoat-dong") continue;
    vaiTro.push({ code: ur.role.code, name: ur.role.name });
    for (const rp of ur.role.rolePermissions) {
      if (rp.permission.status === "hoat-dong") quyen.add(rp.permission.code);
    }
  }

  return { userId: nguoiDung.id, email: nguoiDung.email, vaiTro, quyen };
}

export function coQuyen(hoSo: HoSoQuyen, maQuyen: string): boolean {
  return hoSo.quyen.has(maQuyen);
}

/** Có ít nhất một trong các quyền liệt kê. */
export function coMotTrongCacQuyen(hoSo: HoSoQuyen, maQuyens: string[]): boolean {
  return maQuyens.some((m) => hoSo.quyen.has(m));
}

export class LoiThieuQuyen extends Error {
  constructor(public readonly maQuyen: string) {
    super(`Không đủ quyền: ${maQuyen}`);
    this.name = "LoiThieuQuyen";
  }
}

/**
 * Bắt buộc có quyền, nếu không thì ném lỗi và ghi vết.
 * Dùng ở đầu mọi hành động thay đổi dữ liệu.
 */
export async function batBuocQuyen(
  tx: ClientTenant,
  hoSo: HoSoQuyen,
  maQuyen: string,
  doiTuong: { objectType: string; objectId?: string | null } = { objectType: "he-thong" },
): Promise<void> {
  if (coQuyen(hoSo, maQuyen)) return;

  await ghiSuKien(tx, {
    eventType: SU_KIEN.PERMISSION_DENIED,
    actorType: "user",
    actorId: hoSo.userId,
    objectType: doiTuong.objectType,
    objectId: doiTuong.objectId ?? null,
    payload: { quyenThieu: maQuyen, vaiTro: hoSo.vaiTro.map((v) => v.code) },
  });

  await ghiKiemToan(tx, {
    actorId: hoSo.userId,
    actorEmail: hoSo.email,
    action: "tu-choi-quyen",
    objectType: doiTuong.objectType,
    objectId: doiTuong.objectId ?? null,
    after: { quyenThieu: maQuyen },
  });

  throw new LoiThieuQuyen(maQuyen);
}
