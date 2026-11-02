import type { ClientTenant } from "@/lib/db";
import { congNgay, ngayVNCua } from "@/modules/cham-cong/tinh-toan";
import { tyLe, type MaChiSo } from "./tinh-toan";

/**
 * Chỉ số tự tính từ dữ liệu Cowork cho KPI và báo cáo (DG-52). Mỗi chỉ số đọc trong khoảng
 * [batDau, ketThuc) — hai mốc UTC của 00:00 giờ VN (xem `kyDanhGia`). Cột kiểu ngày (ngày thu tiền,
 * hạn hóa đơn) so bằng ngày VN tương ứng. Hàm tỷ lệ trả null khi mẫu bằng 0 (không có gì để xét).
 * Không bao giờ đọc giá vốn.
 */

type Khoang = { batDau: Date; ketThuc: Date };

async function mot(q: Promise<{ v: unknown }[]>): Promise<number> {
  const r = await q;
  return Number(r[0]?.v ?? 0);
}

export async function tinhChiSo(tx: ClientTenant, userId: string, ma: MaChiSo, k: Khoang): Promise<number | null> {
  const tuNgay = ngayVNCua(k.batDau);
  const denNgay = congNgay(ngayVNCua(k.ketThuc), -1);
  switch (ma) {
    case "doanh-thu-da-thu":
      // Tiền đã phân bổ vào hóa đơn của đơn mình phụ trách (không có đơn: hóa đơn mình phụ trách), phiếu thu còn hiệu lực.
      return mot(tx.$queryRaw<{ v: unknown }[]>`
        SELECT COALESCE(SUM(pa.amount), 0) AS v
        FROM payment_allocations pa
        JOIN payments p ON p.id = pa.payment_id
        JOIN invoices i ON i.id = pa.invoice_id
        LEFT JOIN sales_orders so ON so.id = i.sales_order_id
        WHERE p.status = 'hoat-dong' AND p.received_at BETWEEN ${tuNgay}::date AND ${denNgay}::date
          AND COALESCE(so.owner_id, i.owner_id) = ${userId}::uuid`);
    case "lead-xu-ly":
      return mot(tx.$queryRaw<{ v: unknown }[]>`
        SELECT COUNT(*) AS v FROM leads
        WHERE owner_id = ${userId}::uuid AND stage <> 'NEW_LEAD' AND updated_at >= ${k.batDau} AND updated_at < ${k.ketThuc}`);
    case "ty-le-chuyen-doi": {
      const r = await tx.$queryRaw<{ tong: unknown; chuyen: unknown }[]>`
        SELECT COUNT(*) AS tong, COUNT(*) FILTER (WHERE stage = 'CONVERTED') AS chuyen FROM leads
        WHERE owner_id = ${userId}::uuid AND created_at >= ${k.batDau} AND created_at < ${k.ketThuc}`;
      return tyLe(Number(r[0]?.chuyen ?? 0), Number(r[0]?.tong ?? 0));
    }
    case "cong-no-qua-han":
      // Số còn nợ tại cuối kỳ của hóa đơn đã phát hành, quá hạn trước cuối kỳ, khách mình phụ trách.
      return mot(tx.$queryRaw<{ v: unknown }[]>`
        SELECT COALESCE(SUM(GREATEST(i.total - COALESCE(da.thu, 0), 0)), 0) AS v
        FROM invoices i
        JOIN customers c ON c.id = i.customer_id
        LEFT JOIN LATERAL (
          SELECT SUM(pa.amount) AS thu FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
          WHERE pa.invoice_id = i.id AND p.status = 'hoat-dong' AND p.received_at <= ${denNgay}::date
        ) da ON true
        WHERE i.status = 'ISSUED' AND i.due_date < ${denNgay}::date AND c.owner_id = ${userId}::uuid`);
    case "phieu-ho-tro-xong":
      return mot(tx.$queryRaw<{ v: unknown }[]>`
        SELECT COUNT(*) AS v FROM support_tickets
        WHERE COALESCE(assignee_id, owner_id) = ${userId}::uuid AND first_resolved_at >= ${k.batDau} AND first_resolved_at < ${k.ketThuc}`);
    case "ty-le-dung-sla": {
      const r = await tx.$queryRaw<{ tong: unknown; dung: unknown }[]>`
        SELECT COUNT(*) AS tong, COUNT(*) FILTER (WHERE resolve_due_at IS NULL OR first_resolved_at <= resolve_due_at) AS dung
        FROM support_tickets
        WHERE COALESCE(assignee_id, owner_id) = ${userId}::uuid AND first_resolved_at >= ${k.batDau} AND first_resolved_at < ${k.ketThuc}`;
      return tyLe(Number(r[0]?.dung ?? 0), Number(r[0]?.tong ?? 0));
    }
    case "phieu-mo-lai":
      return mot(tx.$queryRaw<{ v: unknown }[]>`
        SELECT COUNT(*) AS v FROM support_ticket_events e JOIN support_tickets t ON t.id = e.ticket_id
        WHERE e.type = 'mo-lai' AND COALESCE(t.assignee_id, t.owner_id) = ${userId}::uuid
          AND e.created_at >= ${k.batDau} AND e.created_at < ${k.ketThuc}`);
    case "lead-marketing":
      return mot(tx.$queryRaw<{ v: unknown }[]>`
        SELECT COUNT(*) AS v FROM leads l JOIN marketing_campaigns c ON c.id = l.campaign_id
        WHERE c.owner_id = ${userId}::uuid AND l.created_at >= ${k.batDau} AND l.created_at < ${k.ketThuc}`);
    case "tong-diem-viec":
      return mot(tx.$queryRaw<{ v: unknown }[]>`
        SELECT COALESCE(SUM(task_score), 0) AS v FROM tasks
        WHERE owner_id = ${userId}::uuid AND approved_at >= ${k.batDau} AND approved_at < ${k.ketThuc}`);
    case "ty-le-tra-lai": {
      // Việc của mình có gửi duyệt trong kỳ: bao nhiêu việc bị trả lại ít nhất một lần trong kỳ.
      const r = await tx.$queryRaw<{ tong: unknown; tra: unknown }[]>`
        SELECT COUNT(DISTINCT l.task_id) FILTER (WHERE l.action = 'gui-duyet') AS tong,
               COUNT(DISTINCT l.task_id) FILTER (WHERE l.action = 'tra-lai') AS tra
        FROM task_approval_logs l JOIN tasks t ON t.id = l.task_id
        WHERE t.owner_id = ${userId}::uuid AND l.created_at >= ${k.batDau} AND l.created_at < ${k.ketThuc}`;
      return tyLe(Number(r[0]?.tra ?? 0), Number(r[0]?.tong ?? 0));
    }
    case "ty-le-dung-han": {
      // Việc xong trong kỳ có hạn: xong (lần gửi duyệt cuối, hoặc lúc xong) không muộn hơn hạn cuối cùng.
      const r = await tx.$queryRaw<{ tong: unknown; dung: unknown }[]>`
        SELECT COUNT(*) AS tong, COUNT(*) FILTER (WHERE COALESCE(submitted_at, completed_at) <= due_at) AS dung
        FROM tasks
        WHERE owner_id = ${userId}::uuid AND status = 'xong' AND due_at IS NOT NULL
          AND completed_at >= ${k.batDau} AND completed_at < ${k.ketThuc}`;
      return tyLe(Number(r[0]?.dung ?? 0), Number(r[0]?.tong ?? 0));
    }
  }
}

/** Tỷ lệ việc được duyệt / đánh giá Đạt và chất lượng trung bình — nguồn tự động của phiếu thực tập (DG-74). */
export async function soLieuViecThucTap(tx: ClientTenant, userId: string, k: Khoang): Promise<{ tyLeDat: number | null; chatLuongTb: number | null }> {
  const r = await tx.$queryRaw<{ tong: unknown; dat: unknown; cl: unknown }[]>`
    SELECT COUNT(*) AS tong,
           COUNT(*) FILTER (WHERE approved_at IS NOT NULL OR outcome = 'dat') AS dat,
           AVG(quality_score) AS cl
    FROM tasks
    WHERE owner_id = ${userId}::uuid AND status = 'xong' AND completed_at >= ${k.batDau} AND completed_at < ${k.ketThuc}`;
  const cl = r[0]?.cl;
  return { tyLeDat: tyLe(Number(r[0]?.dat ?? 0), Number(r[0]?.tong ?? 0)), chatLuongTb: cl === null || cl === undefined ? null : Math.round(Number(cl) * 100) / 100 };
}

/**
 * Tóm tắt công từ bảng công tháng 0.19.0 (dòng thường + dòng điều chỉnh) trong [tu, den]: công dự kiến,
 * công thực tế, phút đi muộn / về sớm, số ngày vắng (có công dự kiến mà 0 công, không nghỉ phép).
 * Không có bảng công → null (chưa sinh).
 */
export async function tomTatCong(tx: ClientTenant, userId: string, tu: string, den: string) {
  const r = await tx.$queryRaw<{ so_dong: unknown; du_kien: unknown; thuc_te: unknown; muon: unknown; som: unknown; nghi: unknown; vang: unknown }[]>`
    SELECT COUNT(*) AS so_dong,
           COALESCE(SUM(expected_value), 0) AS du_kien, COALESCE(SUM(work_value), 0) AS thuc_te,
           COALESCE(SUM(late_minutes), 0) AS muon, COALESCE(SUM(early_minutes), 0) AS som,
           COALESCE(SUM(leave_days), 0) AS nghi,
           COUNT(*) FILTER (WHERE NOT is_adjustment AND expected_value > 0 AND work_value = 0 AND leave_days = 0) AS vang
    FROM timesheet_rows WHERE user_id = ${userId}::uuid AND work_date BETWEEN ${tu}::date AND ${den}::date`;
  const x = r[0];
  if (!x || Number(x.so_dong) === 0) return null;
  const duKien = Number(x.du_kien);
  const thucTe = Number(x.thuc_te);
  const nghi = Number(x.nghi);
  return {
    congDuKien: duKien,
    congThucTe: thucTe,
    ngayNghiPhep: nghi,
    phutDiMuon: Number(x.muon),
    phutVeSom: Number(x.som),
    ngayVang: Number(x.vang),
    /** Chuyên cần = (công thực tế + nghỉ phép) / công dự kiến. */
    tyLeChuyenCan: tyLe(thucTe + nghi, duKien),
  };
}
