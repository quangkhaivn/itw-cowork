import type { ClientTenant } from "./db";

/**
 * Audit Log — truy vết ai đã đổi cái gì (mục 27 đặc tả: "Audit Log phải truy vết
 * được người thực hiện").
 *
 * Khác với Business Events thế nào:
 *   - Business Event trả lời "chuyện gì đã xảy ra trong nghiệp vụ".
 *   - Audit Log trả lời "ai đã sửa bản ghi nào, từ giá trị gì sang giá trị gì".
 * Một hành động có thể sinh cả hai. Đừng gộp.
 *
 * Cũng chỉ ghi thêm — migration 0002 chặn UPDATE/DELETE ở tầng cơ sở dữ liệu.
 */

export type HanhDong =
  | "tao"
  | "sua"
  | "xoa"
  | "dang-nhap"
  | "dang-xuat"
  | "dang-nhap-that-bai"
  | "tu-choi-quyen";

export interface ThamSoGhiKiemToan {
  actorId?: string | null;
  actorEmail?: string | null;
  action: HanhDong;
  objectType: string;
  objectId?: string | null;
  /** Giá trị trước khi đổi. Bỏ trống khi tạo mới. */
  before?: Record<string, unknown> | null;
  /** Giá trị sau khi đổi. Bỏ trống khi xóa. */
  after?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Những khóa không bao giờ được ghi vào nhật ký kiểm toán. */
const KHOA_NHAY_CAM = new Set([
  "password",
  "passwordHash",
  "password_hash",
  "matKhau",
  "token",
  "secret",
  "apiKey",
  "api_key",
  "authorization",
]);

/** Che giá trị nhạy cảm trước khi ghi. Không đưa mật khẩu hay khóa API vào nhật ký. */
function che(obj: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!obj) return null;
  const ketQua: Record<string, unknown> = {};
  for (const [khoa, giaTri] of Object.entries(obj)) {
    ketQua[khoa] = KHOA_NHAY_CAM.has(khoa) ? "***da-che***" : giaTri;
  }
  return ketQua;
}

/** Ghi một dòng kiểm toán. Phải gọi bên trong `voiTenant()`. */
export async function ghiKiemToan(tx: ClientTenant, thamSo: ThamSoGhiKiemToan): Promise<void> {
  const [{ tenant_id }] = await tx.$queryRaw<{ tenant_id: string }[]>`
    SELECT current_setting('app.tenant_id')::uuid AS tenant_id
  `;

  await tx.auditLog.create({
    data: {
      tenantId: tenant_id,
      actorId: thamSo.actorId ?? null,
      actorEmail: thamSo.actorEmail ?? null,
      action: thamSo.action,
      objectType: thamSo.objectType,
      objectId: thamSo.objectId ?? null,
      before: che(thamSo.before) as never,
      after: che(thamSo.after) as never,
      ipAddress: thamSo.ipAddress ?? null,
      userAgent: thamSo.userAgent ?? null,
    },
  });
}
