import { Prisma } from "@/generated/prisma/client";
import type { ClientTenant } from "@/lib/db";

/**
 * Khóa dòng chứng từ đến hết giao dịch (`SELECT … FOR UPDATE`) — QĐ-77.
 *
 * Mọi hàm đổi trạng thái chứng từ (xác nhận đơn, xuất kho, thu tiền, hủy hóa đơn…) gọi hàm
 * này TRƯỚC khi đọc trạng thái và kiểm điều kiện. Ở mức READ COMMITTED, hai yêu cầu chạy
 * đồng thời đều thấy trạng thái cũ và cùng qua kiểm tra (thu vượt nợ, giữ chỗ gấp đôi, hai
 * hóa đơn cho một đơn). Khóa dòng bắt yêu cầu thứ hai chờ yêu cầu thứ nhất commit, rồi mới
 * đọc trạng thái mới.
 *
 * Khi khóa nhiều dòng (một phiếu thu phân bổ cho nhiều hóa đơn), khóa theo thứ tự id tăng dần
 * để hai giao dịch không khóa chéo nhau (deadlock).
 *
 * Tên bảng lấy từ danh sách trắng bên dưới — không bao giờ nối chuỗi từ dữ liệu người dùng.
 * RLS vẫn áp dụng: khóa dòng của doanh nghiệp khác trả về 0 dòng.
 */
const BANG_KHOA = [
  "leads",
  "quotations",
  "sales_orders",
  "sales_order_items",
  "deliveries",
  "invoices",
  "payments",
  "purchase_requests",
  "purchase_orders",
  "goods_receipts",
  "supplier_bills",
  "supplier_payments",
  "sales_returns",
  "purchase_returns",
  "stock_transfers",
  "warranties",
  "serial_numbers",
  "support_tickets",
  "maintenance_contracts",
  "projects",
  "tasks",
] as const;

export type BangKhoa = (typeof BANG_KHOA)[number];

/** Khóa một hoặc nhiều dòng; trả về các id thật sự khóa được (đã sắp tăng dần). */
export async function khoaChungTu(tx: ClientTenant, bang: BangKhoa, ids: string | string[]): Promise<string[]> {
  if (!(BANG_KHOA as readonly string[]).includes(bang)) throw new Error(`Bảng không được phép khóa: ${bang}`);
  const ds = [...new Set(Array.isArray(ids) ? ids : [ids])].sort();
  if (ds.length === 0) return [];
  const dong = await tx.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT id::text AS id FROM ${Prisma.raw(`"${bang}"`)} WHERE id = ANY(${ds}::uuid[]) ORDER BY id FOR UPDATE`,
  );
  return dong.map((d) => d.id);
}
