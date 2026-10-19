-- 0.16.1 — Toàn vẹn chuỗi bán hàng – kho (BUSINESS_RULES.md mục 25, TV-BH-01 → TV-BH-12).
-- Chỉ thêm cột / chỉ mục / CHECK và sửa dữ liệu lỗi đã biết. Chạy lại prisma/rls.sql sau khi áp
-- (không thêm bảng mới, nhưng chạy lại vô hại và là thói quen triển khai).

-- ---------------------------------------------------------------------------
-- TV-BH-08 (QĐ-80): một báo giá chỉ có MỘT đơn hàng đang hoạt động (chưa hủy), bất kể phiên bản.
-- Lớp chặn cuối cho trường hợp hai yêu cầu cùng tạo đơn; service đã khóa dòng báo giá trước.
-- Dữ liệu cũ đã có báo giá mang 2 đơn chưa hủy thì dừng với thông báo rõ ràng: hủy đơn thừa
-- bằng nghiệp vụ (có lý do) rồi chạy lại migration.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  so_trung integer;
BEGIN
  SELECT count(*) INTO so_trung FROM (
    SELECT quotation_id FROM sales_orders
    WHERE quotation_id IS NOT NULL AND status <> 'CANCELLED'
    GROUP BY quotation_id HAVING count(*) > 1
  ) t;
  IF so_trung > 0 THEN
    RAISE EXCEPTION 'Có % báo giá đang có hơn một đơn hàng chưa hủy. Hủy đơn thừa (ghi lý do) rồi chạy lại migration — xem CHANGELOG 0.16.1.', so_trung;
  END IF;
END $$;

CREATE UNIQUE INDEX "sales_orders_bao_gia_dang_hoat_dong_key"
    ON "sales_orders" ("quotation_id")
    WHERE "quotation_id" IS NOT NULL AND "status" <> 'CANCELLED';

-- ---------------------------------------------------------------------------
-- TV-BH-06 (QĐ-81): bảo hành đã hủy không còn giữ sê-ri — sê-ri (UNIQUE trên warranties) phải
-- được nhả để máy khách trả về bán lại được. Số sê-ri dạng chữ vẫn nằm ở cột `serial`.
-- ---------------------------------------------------------------------------
-- Sửa dữ liệu cũ 1: máy đã quay về kho / đã nhận trả mà bảo hành của khách cũ vẫn hiệu lực.
UPDATE "warranties" w
SET "status" = 'huy',
    "cancelled_at" = COALESCE(w."cancelled_at", now()),
    "note" = concat_ws(' · ', NULLIF(w."note", ''), 'Kết thúc tự động (0.16.1): máy đã được khách trả về trước bản sửa lỗi'),
    "updated_at" = now()
FROM "serial_numbers" s
WHERE w."serial_number_id" = s."id"
  AND w."status" <> 'huy'
  AND s."status" IN ('trong-kho', 'tra-lai', 'dang-chuyen');

-- Sửa dữ liệu cũ 2: bảo hành đã hủy nhả sê-ri.
UPDATE "warranties"
SET "serial_number_id" = NULL, "updated_at" = now()
WHERE "status" = 'huy' AND "serial_number_id" IS NOT NULL;

ALTER TABLE "warranties" ADD CONSTRAINT "warranties_huy_nha_serial_check"
    CHECK ("status" <> 'huy' OR "serial_number_id" IS NULL);

-- ---------------------------------------------------------------------------
-- TV-BH-12: mở lại phiếu hỗ trợ đã xử lý xong. Giữ mốc xử lý xong LẦN ĐẦU để báo cáo SLA
-- không mất dấu; `resolved_at` được xóa khi mở lại để nhắc trễ hạn chạy lại.
-- ---------------------------------------------------------------------------
ALTER TABLE "support_tickets" ADD COLUMN "first_resolved_at" TIMESTAMPTZ(6);
UPDATE "support_tickets" SET "first_resolved_at" = "resolved_at" WHERE "resolved_at" IS NOT NULL;

ALTER TABLE "support_ticket_events" DROP CONSTRAINT "support_ticket_events_loai_check";
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_loai_check"
    CHECK ("type" IN ('tiep-nhan', 'ghi-chu', 'giao-viec', 'doi-trang-thai', 'phan-hoi-khach', 'hoan-thanh', 'dong', 'mo-lai'));
