-- 0.21.0 — chính sách lương Giám đốc quyết sau QA (QĐ-156 → QĐ-166).
--  - Phụ cấp cố định tháng chia theo công; cờ "trả đủ không chia theo công" (QĐ-157).
--  - Khoản điều chỉnh kỳ trước chọn tính TRƯỚC thuế (vào / giảm thu nhập chịu thuế + lương đóng BH) hay SAU thuế (QĐ-158).
--  - Tài khoản ngân hàng chụp vào dòng lương lúc khóa kỳ (QĐ-160).
--  - Kỳ lương riêng cho một nhóm người (tên + danh sách), một kỳ chung mỗi tháng (QĐ-165).

ALTER TABLE "salary_allowance_types" ADD COLUMN "full_month" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "payroll_items" ADD COLUMN "tax_stage" VARCHAR(10);
ALTER TABLE "payroll_items" ADD COLUMN "insurable" BOOLEAN NOT NULL DEFAULT false;
-- Khoản điều chỉnh đã có (máy phát triển / diễn tập; 0.21.0 chưa lên máy thật): giữ ĐÚNG cách đã tính — khoản cộng
-- trước đây vào tổng thu nhập (theo cờ chịu thuế) = trước thuế, khoản trừ trước đây trừ sau thuế = sau thuế. Chỉ điền
-- cột mới, không đổi số tiền; tạm tắt trigger bất biến cho đúng câu lệnh này (kỳ đã khóa).
ALTER TABLE "payroll_items" DISABLE TRIGGER "payroll_items_khoa";
UPDATE "payroll_items" SET "tax_stage" = CASE "direction" WHEN 'cong' THEN 'truoc-thue' ELSE 'sau-thue' END WHERE "category" = 'dieu-chinh';
ALTER TABLE "payroll_items" ENABLE TRIGGER "payroll_items_khoa";
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_tinh_thue_check"
    CHECK (("tax_stage" IS NULL OR "tax_stage" IN ('truoc-thue', 'sau-thue'))
       AND ("category" <> 'dieu-chinh' OR "tax_stage" IS NOT NULL)
       AND ("tax_stage" = 'truoc-thue' OR NOT "insurable"));

ALTER TABLE "payroll_lines" ADD COLUMN "bank_account" VARCHAR(50);
ALTER TABLE "payroll_lines" ADD COLUMN "bank_name" VARCHAR(255);
ALTER TABLE "payroll_lines" ADD COLUMN "account_holder" VARCHAR(255);
ALTER TABLE "payroll_lines" ADD COLUMN "bank_captured_at" TIMESTAMPTZ(6);

ALTER TABLE "payroll_runs" ADD COLUMN "name" VARCHAR(100);
ALTER TABLE "payroll_runs" ADD COLUMN "members" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_nhom_check"
    CHECK ((cardinality("members") = 0) = ("name" IS NULL) AND ("name" IS NULL OR length(btrim("name")) >= 2));
DROP INDEX "payroll_runs_tenant_id_year_month_key";
CREATE INDEX "payroll_runs_tenant_id_year_month_idx" ON "payroll_runs"("tenant_id", "year", "month");
-- Một kỳ CHUNG mỗi tháng; kỳ riêng (có danh sách người) thì nhiều kỳ — người trùng giữa các kỳ chặn ở máy chủ.
CREATE UNIQUE INDEX "payroll_runs_ky_chung_mot_lan" ON "payroll_runs"("tenant_id", "year", "month") WHERE cardinality("members") = 0;
-- Tên kỳ riêng không trùng trong tháng.
CREATE UNIQUE INDEX "payroll_runs_ten_ky_rieng" ON "payroll_runs"("tenant_id", "year", "month", "name") WHERE "name" IS NOT NULL;

-- Trigger bất biến: thêm hai cột mới vào danh sách phải giữ nguyên khi đã khóa → đã chi.
CREATE OR REPLACE FUNCTION public.chan_sua_ky_luong_da_khoa() RETURNS trigger AS $$
DECLARE
    trang_thai text;
BEGIN
    IF TG_TABLE_NAME = 'payroll_runs' THEN
        IF OLD.status IN ('da-khoa', 'da-chi') THEN
            IF TG_OP = 'UPDATE' AND OLD.status = 'da-khoa' AND NEW.status = 'da-chi'
               AND NEW.id = OLD.id AND NEW.tenant_id = OLD.tenant_id AND NEW.year = OLD.year AND NEW.month = OLD.month
               AND NEW.name IS NOT DISTINCT FROM OLD.name AND NEW.members = OLD.members
               AND NEW.timesheet_id IS NOT DISTINCT FROM OLD.timesheet_id AND NEW.dirty = OLD.dirty AND NEW.warnings = OLD.warnings
               AND NEW.calculated_at IS NOT DISTINCT FROM OLD.calculated_at AND NEW.calculated_by IS NOT DISTINCT FROM OLD.calculated_by
               AND NEW.submitted_at IS NOT DISTINCT FROM OLD.submitted_at AND NEW.submitted_by IS NOT DISTINCT FROM OLD.submitted_by
               AND NEW.approved_at IS NOT DISTINCT FROM OLD.approved_at AND NEW.approved_by IS NOT DISTINCT FROM OLD.approved_by
               AND NEW.locked_at IS NOT DISTINCT FROM OLD.locked_at AND NEW.locked_by IS NOT DISTINCT FROM OLD.locked_by
               AND NEW.return_reason IS NOT DISTINCT FROM OLD.return_reason AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
               AND NEW.created_at = OLD.created_at THEN
                RETURN NEW;
            END IF;
            RAISE EXCEPTION 'Ky luong da khoa, khong duoc sua hoac xoa.' USING ERRCODE = 'check_violation';
        END IF;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    SELECT status INTO trang_thai FROM payroll_runs
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.run_id ELSE NEW.run_id END;
    IF trang_thai IN ('da-khoa', 'da-chi') THEN
        RAISE EXCEPTION 'Ky luong da khoa, khong duoc sua hoac xoa.' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.run_id <> NEW.run_id THEN
        SELECT status INTO trang_thai FROM payroll_runs WHERE id = OLD.run_id;
        IF trang_thai IN ('da-khoa', 'da-chi') THEN
            RAISE EXCEPTION 'Ky luong da khoa, khong duoc sua hoac xoa.' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
