-- 0.16.1 — Toàn vẹn tài chính và mua hàng (BUSINESS_RULES.md mục 26, QĐ-83).
--
-- TC-02 / CT-02: một đơn hàng (đơn mua) chỉ có MỘT hóa đơn còn hiệu lực. Trước đây luật
-- này chỉ kiểm ở service bằng "tìm hóa đơn đã có rồi mới tạo" — hai yêu cầu đồng thời
-- cùng không thấy gì và cùng tạo. Service nay khóa dòng đơn trước (khoaChungTu); hai chỉ
-- mục riêng phần dưới đây là chốt cuối ở CSDL.
--
-- Hóa đơn đã hủy không tính, nên hủy rồi lập lại vẫn được.
-- Chỉ mục riêng phần (partial) không khai được trong schema.prisma — xem chú thích ở
-- model Invoice / SupplierBill (cùng cách với job_runs_lich_moi_ngay).

-- Dữ liệu cũ đã trùng thì dừng với thông báo rõ ràng, không để CREATE INDEX báo lỗi khó hiểu.
DO $$
DECLARE
  so_trung_ban integer;
  so_trung_mua integer;
BEGIN
  SELECT count(*) INTO so_trung_ban FROM (
    SELECT tenant_id, sales_order_id FROM invoices
    WHERE sales_order_id IS NOT NULL AND status <> 'CANCELLED'
    GROUP BY tenant_id, sales_order_id HAVING count(*) > 1
  ) t;
  SELECT count(*) INTO so_trung_mua FROM (
    SELECT tenant_id, purchase_order_id FROM supplier_bills
    WHERE purchase_order_id IS NOT NULL AND status <> 'CANCELLED'
    GROUP BY tenant_id, purchase_order_id HAVING count(*) > 1
  ) t;
  IF so_trung_ban > 0 OR so_trung_mua > 0 THEN
    RAISE EXCEPTION 'Có % đơn hàng và % đơn mua đang có hơn một hóa đơn còn hiệu lực. Hủy hóa đơn thừa (giữ lý do) rồi chạy lại migration — xem CHANGELOG 0.16.1.', so_trung_ban, so_trung_mua;
  END IF;
END $$;

CREATE UNIQUE INDEX "invoices_mot_hieu_luc_moi_don"
  ON "invoices" ("tenant_id", "sales_order_id")
  WHERE "sales_order_id" IS NOT NULL AND "status" <> 'CANCELLED';

CREATE UNIQUE INDEX "supplier_bills_mot_hieu_luc_moi_don"
  ON "supplier_bills" ("tenant_id", "purchase_order_id")
  WHERE "purchase_order_id" IS NOT NULL AND "status" <> 'CANCELLED';
