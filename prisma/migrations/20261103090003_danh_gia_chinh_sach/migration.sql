-- 0.20.0 — 10 quyết định chính sách sau QA (QĐ-131 → QĐ-140). Chỉ thêm mới.

-- ---------------------------------------------------------------------------
-- QĐ-135: người quyết định đề nghị gia hạn ghi trên chính đề nghị (chuyển được khi người đó nghỉ việc /
-- bị khóa — người giao việc `tasks.assigned_by` ghi một lần nên không dùng nó để chuyển).
-- ---------------------------------------------------------------------------
ALTER TABLE "task_extensions" ADD COLUMN "approver_id" UUID;
ALTER TABLE "task_extensions" ADD CONSTRAINT "task_extensions_approver_id_fkey"
    FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "task_extensions_tenant_id_approver_id_idx" ON "task_extensions"("tenant_id", "approver_id");
-- Đề nghị đang chờ: điền người quyết định như luật cũ (người giao, không có thì người tạo).
UPDATE "task_extensions" e
   SET "approver_id" = COALESCE(t."assigned_by", t."created_by")
  FROM "tasks" t
 WHERE t."id" = e."task_id" AND e."status" = 'cho-duyet' AND e."approver_id" IS NULL;

-- ---------------------------------------------------------------------------
-- QĐ-135: lịch sử chuyển bước đang chờ — chỉ ghi thêm (RLS + chặn sửa / xóa ở rls.sql mục 3).
-- ---------------------------------------------------------------------------
CREATE TABLE "approval_transfers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "object_type" VARCHAR(30) NOT NULL,
    "object_id" UUID NOT NULL,
    "task_id" UUID,
    "level" SMALLINT,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "reason" VARCHAR(30) NOT NULL,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "approval_transfers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_transfers_tenant_id_object_type_object_id_idx" ON "approval_transfers"("tenant_id", "object_type", "object_id");
CREATE INDEX "approval_transfers_tenant_id_task_id_idx" ON "approval_transfers"("tenant_id", "task_id");
CREATE INDEX "approval_transfers_tenant_id_to_user_id_idx" ON "approval_transfers"("tenant_id", "to_user_id");
ALTER TABLE "approval_transfers" ADD CONSTRAINT "approval_transfers_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_transfers" ADD CONSTRAINT "approval_transfers_from_user_id_fkey"
    FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_transfers" ADD CONSTRAINT "approval_transfers_to_user_id_fkey"
    FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_transfers" ADD CONSTRAINT "approval_transfers_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_transfers" ADD CONSTRAINT "approval_transfers_loai_check"
    CHECK ("object_type" IN ('task', 'task_extension', 'work_report', 'evaluation'));
ALTER TABLE "approval_transfers" ADD CONSTRAINT "approval_transfers_ly_do_check"
    CHECK ("reason" IN ('ngung-hoat-dong', 'ban-giao', 'tu-duyet'));
ALTER TABLE "approval_transfers" ADD CONSTRAINT "approval_transfers_khac_nguoi_check" CHECK ("from_user_id" <> "to_user_id");
CREATE TRIGGER chan_sua_xoa_approval_transfers BEFORE UPDATE OR DELETE ON "approval_transfers"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();

-- ---------------------------------------------------------------------------
-- QĐ-137: người giao việc ghi MỘT LẦN — chuyển người làm không đổi người giao, nên không còn đường
-- "chuyển đi rồi chuyển lại cho mình" để thành người giao (rồi tự đặt mình duyệt / chấm điểm).
-- Ngoại lệ duy nhất: người giao bị xóa hẳn khỏi CSDL (khóa ngoại ON DELETE SET NULL).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chan_doi_nguoi_giao_viec() RETURNS trigger AS $$
BEGIN
    IF OLD.assigned_by IS NOT NULL AND NEW.assigned_by IS DISTINCT FROM OLD.assigned_by THEN
        IF NEW.assigned_by IS NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = OLD.assigned_by) THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Nguoi giao viec chi ghi mot lan, khong doi duoc.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER tasks_nguoi_giao_ghi_mot_lan
    BEFORE UPDATE OF "assigned_by" ON "tasks"
    FOR EACH ROW EXECUTE FUNCTION public.chan_doi_nguoi_giao_viec();

-- ---------------------------------------------------------------------------
-- QĐ-140: kỳ đánh giá đã có ít nhất một phiếu CHỐT thì không đổi loại kỳ, năm / số kỳ, ngày bắt đầu,
-- ngày kết thúc — kể cả qua SQL vai cowork_app. (Phiếu đã chốt tính trên đúng khoảng ngày đó.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chan_doi_ky_danh_gia_da_chot() RETURNS trigger AS $$
BEGIN
    IF (NEW.kind, NEW.year, NEW.number, NEW.start_date, NEW.end_date)
       IS DISTINCT FROM (OLD.kind, OLD.year, OLD.number, OLD.start_date, OLD.end_date)
       AND EXISTS (SELECT 1 FROM evaluations e WHERE e.period_id = OLD.id AND e.status = 'da-chot') THEN
        RAISE EXCEPTION 'Ky danh gia da co phieu chot, khong doi loai ky / ngay bat dau / ngay ket thuc.'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER evaluation_periods_da_chot
    BEFORE UPDATE ON "evaluation_periods"
    FOR EACH ROW EXECUTE FUNCTION public.chan_doi_ky_danh_gia_da_chot();
