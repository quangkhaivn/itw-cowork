-- 0.17.0 — Công việc thông suốt (14/10/2026)
-- Kết quả công việc, người giao, danh sách kiểm tra trước khi xong, đính kèm vào công việc.
-- Luật nghiệp vụ: BUSINESS_RULES.md mục 25 (CV-04 → CV-11) và mục 26 (HS-01 → HS-04).

-- CV-04: kết quả công việc nằm ngay trên công việc. Không tách bảng: một việc có đúng một
-- kết quả cuối; các lần sửa kết quả đã có nhật ký kiểm toán giữ bản trước/sau.
ALTER TABLE "tasks"
    ADD COLUMN "result"       TEXT,
    ADD COLUMN "outcome"      VARCHAR(20),
    ADD COLUMN "result_at"    TIMESTAMPTZ(6),
    ADD COLUMN "result_by"    UUID,
    ADD COLUMN "assigned_by"  UUID,
    ADD COLUMN "assigned_at"  TIMESTAMPTZ(6);

-- dat = đạt mục tiêu · mot-phan = đạt một phần · khong-dat = không đạt · can-theo-doi = cần làm tiếp
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_outcome_check"
    CHECK ("outcome" IS NULL OR "outcome" IN ('dat', 'mot-phan', 'khong-dat', 'can-theo-doi'));

-- Kết quả và đánh giá đi cùng nhau: có chữ thì phải có đánh giá và ngược lại.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ket_qua_di_cung_check"
    CHECK (("result" IS NULL) = ("outcome" IS NULL) AND ("result" IS NULL) = ("result_at" IS NULL));

-- CV-05 (xong phải có kết quả) kiểm ở SERVICE, KHÔNG đặt CHECK: việc đã xong trước 0.17 không
-- có kết quả, mà chuyển đổi lead và gộp khách cập nhật hàng loạt cả việc đã xong (đổi customer_id).
-- Một CHECK, kể cả NOT VALID, sẽ làm hai thao tác đó vỡ trên dữ liệu thật (QĐ-78).

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_result_by_fkey"
    FOREIGN KEY ("result_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_by_fkey"
    FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Việc cũ: người giao = người tạo, lúc giao = lúc tạo. Đúng với mọi việc chưa từng đổi người.
UPDATE "tasks" SET "assigned_by" = "created_by", "assigned_at" = "created_at" WHERE "assigned_at" IS NULL;

-- CV-07: danh sách kiểm tra của một công việc. Mục bắt buộc chưa tích thì không được đánh dấu xong.
CREATE TABLE "task_checklist_items" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"  UUID NOT NULL,
    "task_id"    UUID NOT NULL,
    "label"      VARCHAR(300) NOT NULL,
    "required"   BOOLEAN NOT NULL DEFAULT true,
    "position"   INTEGER NOT NULL DEFAULT 0,
    "done_at"    TIMESTAMPTZ(6),
    "done_by"    UUID,
    "removed_at" TIMESTAMPTZ(6),
    "removed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "task_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "task_checklist_items_tenant_id_task_id_idx" ON "task_checklist_items"("tenant_id", "task_id");

ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_done_by_fkey"
    FOREIGN KEY ("done_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_nhan_check"
    CHECK (length(btrim("label")) >= 2);
-- Tích thì phải biết ai tích; bỏ tích thì xóa cả hai.
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_tich_check"
    CHECK (("done_at" IS NULL) = ("done_by" IS NULL));
ALTER TABLE "task_checklist_items" ADD CONSTRAINT "task_checklist_items_go_check"
    CHECK (("removed_at" IS NULL) = ("removed_by" IS NULL));

-- CV-10: đính kèm vào công việc (biên bản, ảnh hiện trường, file khách gửi). Cùng lúc phải
-- thêm nhánh kiểm quyền 'task' trong src/modules/dinh-kem/quyen.ts (DK-01).
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_loai_doi_tuong_check";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_loai_doi_tuong_check"
    CHECK ("object_type" IN ('supplier_bill', 'sales_return', 'purchase_return',
                             'stock_transfer', 'sales_order', 'support_ticket', 'task'));
