import type { ClientTenant } from "./db";
import { ghiSuKien, SU_KIEN } from "./su-kien";
import { ghiKiemToan } from "./kiem-toan";
import { gopPhamVi, type PhamVi } from "./pham-vi";

/**
 * RBAC — kiểm tra quyền.
 *
 * Mọi hành động quan trọng phải kiểm đủ chuỗi: Tenant + User + Role + Permission + Phạm vi.
 * Tenant đã được `voiTenant()` và RLS lo. Ở đây lo phần còn lại.
 *
 * Quyền đọc lại từ cơ sở dữ liệu ở MỖI yêu cầu — thu hồi quyền có hiệu lực ngay.
 */

export interface HoSoQuyen {
  userId: string;
  email: string;
  hoTen: string;
  phongBanId: string | null;
  vaiTro: { code: string; name: string }[];
  quyen: Set<string>;
  /** Mã quyền → phạm vi dữ liệu rộng nhất người này có. */
  phamVi: Map<string, PhamVi>;
  phaiDoiMatKhau: boolean;
  /** Mốc đổi mật khẩu gần nhất — phiên ký trước mốc này bị coi là hết hiệu lực. */
  doiMatKhauLuc: Date | null;
}

/** Đọc toàn bộ vai trò và quyền của một người dùng. Gọi bên trong `voiTenant()`. */
export async function layHoSoQuyen(tx: ClientTenant, userId: string): Promise<HoSoQuyen | null> {
  const nguoiDung = await tx.user.findFirst({
    where: { id: userId, status: "hoat-dong" },
    select: {
      id: true,
      email: true,
      fullName: true,
      mustChangePassword: true,
      passwordChangedAt: true,
      staffProfile: { select: { departmentId: true } },
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
                select: { dataScope: true, permission: { select: { code: true, status: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!nguoiDung) return null;

  const vaiTro: { code: string; name: string }[] = [];
  const cap: { ma: string; phamVi: string }[] = [];

  for (const ur of nguoiDung.userRoles) {
    if (ur.role.status !== "hoat-dong") continue;
    vaiTro.push({ code: ur.role.code, name: ur.role.name });
    for (const rp of ur.role.rolePermissions) {
      if (rp.permission.status === "hoat-dong") cap.push({ ma: rp.permission.code, phamVi: rp.dataScope });
    }
  }

  const phamVi = gopPhamVi(cap);

  return {
    userId: nguoiDung.id,
    email: nguoiDung.email,
    hoTen: nguoiDung.fullName,
    phongBanId: nguoiDung.staffProfile?.departmentId ?? null,
    vaiTro,
    quyen: new Set(phamVi.keys()),
    phamVi,
    phaiDoiMatKhau: nguoiDung.mustChangePassword,
    doiMatKhauLuc: nguoiDung.passwordChangedAt,
  };
}

export function coQuyen(hoSo: HoSoQuyen, maQuyen: string): boolean {
  return hoSo.quyen.has(maQuyen);
}

/** Có ít nhất một trong các quyền liệt kê. */
export function coMotTrongCacQuyen(hoSo: HoSoQuyen, maQuyens: string[]): boolean {
  return maQuyens.some((m) => hoSo.quyen.has(m));
}

export class LoiThieuQuyen extends Error {
  constructor(
    public readonly maQuyen: string,
    public readonly doiTuong: { objectType: string; objectId?: string | null } = { objectType: "he-thong" },
  ) {
    super(`Không đủ quyền: ${maQuyen}`);
    this.name = "LoiThieuQuyen";
  }
}

/**
 * Bắt buộc có quyền, nếu không thì ném `LoiThieuQuyen`.
 *
 * Hàm này KHÔNG tự ghi vết. Lý do: nó thường được gọi bên trong `voiTenant()`, và
 * khi ném lỗi thì cả giao dịch bị cuộn ngược — kéo theo luôn dòng nhật ký vừa ghi.
 * (Bản 12/09 ghi vết ngay tại đây và mất vết đúng như vậy; bài thử cũ phải lách.)
 * Việc ghi vết do lớp bọc API/trang làm, trong một giao dịch riêng, sau khi giao
 * dịch chính đã cuộn ngược — xem `ghiTuChoiQuyen()`.
 */
export function batBuocQuyen(
  hoSo: HoSoQuyen,
  maQuyen: string,
  doiTuong: { objectType: string; objectId?: string | null } = { objectType: "he-thong" },
): void {
  if (!coQuyen(hoSo, maQuyen)) throw new LoiThieuQuyen(maQuyen, doiTuong);
}

/**
 * Ghi vết một lần từ chối quyền — cả Business Event lẫn Audit Log, vì một chuỗi
 * từ chối liên tiếp là dấu hiệu có người đang dò quyền.
 * Gọi trong một `voiTenant()` RIÊNG, không phải giao dịch vừa bị từ chối.
 */
export async function ghiTuChoiQuyen(
  tx: ClientTenant,
  nguoi: { userId: string; email: string; vaiTro?: string[] },
  loi: LoiThieuQuyen,
  boiCanh: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  await ghiSuKien(tx, {
    eventType: SU_KIEN.PERMISSION_DENIED,
    actorType: "user",
    actorId: nguoi.userId,
    objectType: loi.doiTuong.objectType,
    objectId: loi.doiTuong.objectId ?? null,
    payload: { quyenThieu: loi.maQuyen, vaiTro: nguoi.vaiTro ?? [] },
  });
  await ghiKiemToan(tx, {
    actorId: nguoi.userId,
    actorEmail: nguoi.email,
    action: "tu-choi-quyen",
    objectType: loi.doiTuong.objectType,
    objectId: loi.doiTuong.objectId ?? null,
    after: { quyenThieu: loi.maQuyen },
    ipAddress: boiCanh.ipAddress ?? null,
    userAgent: boiCanh.userAgent ?? null,
  });
}

/**
 * Danh sách id người dùng mà `hoSo` được thấy dữ liệu của họ, theo phạm vi của `maQuyen`.
 *
 *   - `"all"` → trả về `"tat-ca"`: không cần lọc theo người phụ trách.
 *   - Không có quyền → mảng rỗng: không thấy gì.
 *   - Còn lại → mảng id, luôn gồm chính mình.
 *
 * Phase 2 trở đi dùng thế này:
 *   const pv = await idNguoiTrongPhamVi(tx, hoSo, "customer.view");
 *   where: pv === "tat-ca" ? {} : { ownerId: { in: pv } }
 */
export async function idNguoiTrongPhamVi(
  tx: ClientTenant,
  hoSo: HoSoQuyen,
  maQuyen: string,
): Promise<string[] | "tat-ca"> {
  const pv = hoSo.phamVi.get(maQuyen);
  if (!pv) return [];
  if (pv === "all") return "tat-ca";
  if (pv === "own") return [hoSo.userId];

  if (pv === "team") {
    // Mọi cấp dưới, trực tiếp và gián tiếp. Giới hạn độ sâu 20 để chuỗi quản lý lỗi
    // (vòng lặp lọt qua kiểm tra ở tầng ứng dụng) không làm truy vấn chạy mãi.
    const dong = await tx.$queryRaw<{ user_id: string }[]>`
      WITH RECURSIVE cap_duoi(user_id, do_sau) AS (
        SELECT sp.user_id, 1 FROM staff_profiles sp WHERE sp.manager_id = ${hoSo.userId}::uuid
        UNION
        SELECT sp.user_id, cd.do_sau + 1
        FROM staff_profiles sp JOIN cap_duoi cd ON sp.manager_id = cd.user_id
        WHERE cd.do_sau < 20
      )
      SELECT DISTINCT user_id::text AS user_id FROM cap_duoi
    `;
    return [hoSo.userId, ...dong.map((d) => d.user_id).filter((id) => id !== hoSo.userId)];
  }

  // department: phòng ban của mình và mọi phòng ban con.
  if (!hoSo.phongBanId) return [hoSo.userId];
  const dong = await tx.$queryRaw<{ user_id: string }[]>`
    WITH RECURSIVE cay(id, do_sau) AS (
      SELECT d.id, 1 FROM departments d WHERE d.id = ${hoSo.phongBanId}::uuid
      UNION
      SELECT d.id, c.do_sau + 1 FROM departments d JOIN cay c ON d.parent_id = c.id WHERE c.do_sau < 20
    )
    SELECT DISTINCT sp.user_id::text AS user_id
    FROM staff_profiles sp JOIN cay ON sp.department_id = cay.id
  `;
  const ds = new Set(dong.map((d) => d.user_id));
  ds.add(hoSo.userId);
  return [...ds];
}
