-- 0.21.0 — Nhân sự giai đoạn 3: TÍNH LƯƠNG (BUSINESS_RULES mục 32, LU-01 → LU-62; QĐ-141 → QĐ-153).
--
-- Bảng mới: danh mục phụ cấp, hồ sơ lương (phiên bản theo ngày hiệu lực, chỉ ghi thêm), người phụ thuộc, bộ tham số
-- lương có hiệu lực theo ngày (chỉ ghi thêm, chỉ đặt xác nhận một lần), kỳ lương, dòng lương (ảnh chụp đầu vào),
-- khoản cộng / trừ / điều chỉnh, hoa hồng theo từng phân bổ phiếu thu. Kỳ lương từ "đã khóa" BẤT BIẾN (trigger, kể cả
-- vai chủ sở hữu). Quyền + tham số mặc định cho mọi doanh nghiệp: migration 20261104090002 (một khối DO).
-- RLS + quyền bảng: prisma/rls.sql (chạy sau migration).

-- CreateTable
CREATE TABLE "salary_allowance_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "insurable" BOOLEAN NOT NULL DEFAULT false,
    "basis" VARCHAR(20) NOT NULL DEFAULT 'thang',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "salary_allowance_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "contract_type" VARCHAR(20) NOT NULL,
    "probation_percent" DECIMAL(5,2),
    "pay_basis" VARCHAR(10) NOT NULL DEFAULT 'thang',
    "base_salary" BIGINT NOT NULL,
    "insurance_salary" BIGINT NOT NULL DEFAULT 0,
    "kpi_bonus" BIGINT NOT NULL DEFAULT 0,
    "commission_enabled" BOOLEAN NOT NULL DEFAULT false,
    "tax_method" VARCHAR(20) NOT NULL,
    "allowances" JSONB NOT NULL DEFAULT '[]',
    "bank_account" VARCHAR(50),
    "bank_name" VARCHAR(255),
    "account_holder" VARCHAR(255),
    "tax_code" VARCHAR(20),
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_dependents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "relationship" VARCHAR(50) NOT NULL,
    "id_number" VARCHAR(30),
    "from_month" DATE NOT NULL,
    "to_month" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "salary_dependents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_param_sets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "effective_from" DATE NOT NULL,
    "values" JSONB NOT NULL,
    "note" TEXT,
    "source" VARCHAR(20) NOT NULL DEFAULT 'nhap-tay',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_by" UUID,
    "confirmed_at" TIMESTAMPTZ(6),

    CONSTRAINT "payroll_param_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'nhap',
    "timesheet_id" UUID,
    "dirty" BOOLEAN NOT NULL DEFAULT true,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "calculated_at" TIMESTAMPTZ(6),
    "calculated_by" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "submitted_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" UUID,
    "paid_at" TIMESTAMPTZ(6),
    "paid_by" UUID,
    "return_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "profile_id" UUID,
    "gross_income" BIGINT NOT NULL,
    "taxable_income" BIGINT NOT NULL,
    "employee_insurance" BIGINT NOT NULL,
    "personal_income_tax" BIGINT NOT NULL,
    "other_deductions" BIGINT NOT NULL,
    "net_pay" BIGINT NOT NULL,
    "employer_insurance" BIGINT NOT NULL,
    "inputs" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "has_error" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "amount" BIGINT NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL,
    "adjusts_run_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_commission_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "payment_id" UUID NOT NULL,
    "allocation_id" UUID NOT NULL,
    "payment_no" VARCHAR(30) NOT NULL,
    "received_at" DATE NOT NULL,
    "amount" BIGINT NOT NULL,
    "rate_bp" INTEGER NOT NULL,
    "commission" BIGINT NOT NULL,
    "source_run_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_commission_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "salary_allowance_types_tenant_id_code_key" ON "salary_allowance_types"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "salary_profiles_tenant_id_user_id_effective_from_idx" ON "salary_profiles"("tenant_id", "user_id", "effective_from");

-- CreateIndex
CREATE INDEX "salary_dependents_tenant_id_user_id_idx" ON "salary_dependents"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "payroll_param_sets_tenant_id_kind_effective_from_idx" ON "payroll_param_sets"("tenant_id", "kind", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_tenant_id_year_month_key" ON "payroll_runs"("tenant_id", "year", "month");

-- CreateIndex
CREATE INDEX "payroll_lines_tenant_id_user_id_idx" ON "payroll_lines"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_lines_run_id_user_id_key" ON "payroll_lines"("run_id", "user_id");

-- CreateIndex
CREATE INDEX "payroll_items_tenant_id_run_id_user_id_idx" ON "payroll_items"("tenant_id", "run_id", "user_id");

-- CreateIndex
CREATE INDEX "payroll_commission_items_tenant_id_run_id_user_id_idx" ON "payroll_commission_items"("tenant_id", "run_id", "user_id");

-- AddForeignKey
ALTER TABLE "salary_allowance_types" ADD CONSTRAINT "salary_allowance_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_dependents" ADD CONSTRAINT "salary_dependents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_param_sets" ADD CONSTRAINT "payroll_param_sets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_commission_items" ADD CONSTRAINT "payroll_commission_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_commission_items" ADD CONSTRAINT "payroll_commission_items_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Khóa chính sinh ở CSDL như các bảng trước (migration / seed SQL không phải tự sinh id).
ALTER TABLE "salary_allowance_types" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "salary_profiles" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "salary_dependents" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "payroll_param_sets" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "payroll_runs" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "payroll_lines" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "payroll_items" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "payroll_commission_items" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

-- ---------------------------------------------------------------------------
-- Khóa ngoại tới người dùng / chứng từ (QĐ-119: khai bằng SQL, không khai quan hệ Prisma).
-- ---------------------------------------------------------------------------
ALTER TABLE "salary_allowance_types" ADD CONSTRAINT "salary_allowance_types_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_dependents" ADD CONSTRAINT "salary_dependents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "salary_dependents" ADD CONSTRAINT "salary_dependents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_param_sets" ADD CONSTRAINT "payroll_param_sets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_param_sets" ADD CONSTRAINT "payroll_param_sets_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_calculated_by_fkey" FOREIGN KEY ("calculated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_locked_by_fkey" FOREIGN KEY ("locked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_paid_by_fkey" FOREIGN KEY ("paid_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "salary_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_adjusts_run_id_fkey" FOREIGN KEY ("adjusts_run_id") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_commission_items" ADD CONSTRAINT "payroll_commission_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_commission_items" ADD CONSTRAINT "payroll_commission_items_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_commission_items" ADD CONSTRAINT "payroll_commission_items_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "payment_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_commission_items" ADD CONSTRAINT "payroll_commission_items_source_run_id_fkey" FOREIGN KEY ("source_run_id") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECK
-- ---------------------------------------------------------------------------
ALTER TABLE "salary_allowance_types" ADD CONSTRAINT "salary_allowance_types_basis_check" CHECK ("basis" IN ('thang', 'ngay-cong'));
ALTER TABLE "salary_allowance_types" ADD CONSTRAINT "salary_allowance_types_status_check" CHECK ("status" IN ('hoat-dong', 'ngung'));
ALTER TABLE "salary_allowance_types" ADD CONSTRAINT "salary_allowance_types_ma_check" CHECK ("code" ~ '^[a-z0-9-]{1,50}$');

ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_loai_check" CHECK ("contract_type" IN ('chinh-thuc', 'thu-viec', 'thoi-vu', 'thuc-tap'));
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_cach_tra_check" CHECK ("pay_basis" IN ('thang', 'ngay', 'gio'));
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_thue_check" CHECK ("tax_method" IN ('luy-tien', 'khau-tru-10', 'khong'));
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_tien_check" CHECK ("base_salary" >= 0 AND "insurance_salary" >= 0 AND "kpi_bonus" >= 0);
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_thu_viec_check"
    CHECK (("contract_type" = 'thu-viec') = ("probation_percent" IS NOT NULL)
           AND ("probation_percent" IS NULL OR ("probation_percent" > 0 AND "probation_percent" <= 100)));
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_phu_cap_check" CHECK (jsonb_typeof("allowances") = 'array');

ALTER TABLE "salary_dependents" ADD CONSTRAINT "salary_dependents_thang_check"
    CHECK (EXTRACT(DAY FROM "from_month") = 1 AND ("to_month" IS NULL OR (EXTRACT(DAY FROM "to_month") = 1 AND "to_month" >= "from_month")));
ALTER TABLE "salary_dependents" ADD CONSTRAINT "salary_dependents_ten_check" CHECK (length(btrim("full_name")) >= 2);

ALTER TABLE "payroll_param_sets" ADD CONSTRAINT "payroll_param_sets_loai_check"
    CHECK ("kind" IN ('bao-hiem', 'luong-toi-thieu-vung', 'giam-tru', 'bieu-thue', 'khau-tru-10', 'thu-viec', 'tang-ca', 'hoa-hong'));
ALTER TABLE "payroll_param_sets" ADD CONSTRAINT "payroll_param_sets_gia_tri_check" CHECK (jsonb_typeof("values") = 'object');
ALTER TABLE "payroll_param_sets" ADD CONSTRAINT "payroll_param_sets_nguon_check" CHECK ("source" IN ('mac-dinh', 'nhap-tay'));
ALTER TABLE "payroll_param_sets" ADD CONSTRAINT "payroll_param_sets_xac_nhan_check" CHECK (("confirmed_by" IS NULL) = ("confirmed_at" IS NULL));

ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_trang_thai_check" CHECK ("status" IN ('nhap', 'cho-duyet', 'da-duyet', 'da-khoa', 'da-chi'));
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_thang_check" CHECK ("month" BETWEEN 1 AND 12 AND "year" BETWEEN 2000 AND 2100);
-- LU-41: người tính không được là người duyệt / người khóa.
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_khong_tu_duyet_check"
    CHECK (("approved_by" IS NULL OR "approved_by" IS DISTINCT FROM "calculated_by")
       AND ("locked_by" IS NULL OR "locked_by" IS DISTINCT FROM "calculated_by"));
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_buoc_check"
    CHECK (("status" NOT IN ('cho-duyet', 'da-duyet', 'da-khoa', 'da-chi') OR ("calculated_at" IS NOT NULL AND "submitted_at" IS NOT NULL))
       AND ("status" NOT IN ('da-duyet', 'da-khoa', 'da-chi') OR ("approved_at" IS NOT NULL AND "approved_by" IS NOT NULL))
       AND ("status" NOT IN ('da-khoa', 'da-chi') OR ("locked_at" IS NOT NULL AND "locked_by" IS NOT NULL AND "timesheet_id" IS NOT NULL))
       AND ("status" <> 'da-chi' OR ("paid_at" IS NOT NULL AND "paid_by" IS NOT NULL)));

ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_chieu_check" CHECK ("direction" IN ('cong', 'tru'));
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_loai_check" CHECK ("category" IN ('thuong', 'phu-cap-khac', 'tam-ung', 'phat', 'dieu-chinh', 'khac'));
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_tien_check" CHECK ("amount" > 0);
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_ly_do_check" CHECK (length(btrim("reason")) >= 5);
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_dieu_chinh_check"
    CHECK (("category" = 'dieu-chinh') = ("adjusts_run_id" IS NOT NULL)
       AND ("category" <> 'dieu-chinh' OR length(btrim("reason")) >= 10)
       AND ("adjusts_run_id" IS NULL OR "adjusts_run_id" <> "run_id"));

ALTER TABLE "payroll_commission_items" ADD CONSTRAINT "payroll_commission_items_loai_check"
    CHECK ("kind" IN ('thu', 'truy-thu') AND ("kind" = 'truy-thu') = ("source_run_id" IS NOT NULL));
ALTER TABLE "payroll_commission_items" ADD CONSTRAINT "payroll_commission_items_tien_check"
    CHECK ("amount" > 0 AND "rate_bp" >= 0 AND (("kind" = 'thu' AND "commission" >= 0) OR ("kind" = 'truy-thu' AND "commission" <= 0)));
-- LU-23 / LU-24: một phân bổ phiếu thu chỉ được tính hoa hồng một lần và truy thu một lần, trên MỌI kỳ.
CREATE UNIQUE INDEX "payroll_commission_items_thu_mot_lan" ON "payroll_commission_items" ("allocation_id") WHERE "kind" = 'thu';
CREATE UNIQUE INDEX "payroll_commission_items_truy_thu_mot_lan" ON "payroll_commission_items" ("allocation_id") WHERE "kind" = 'truy-thu';

-- ---------------------------------------------------------------------------
-- LU-02: hồ sơ lương chỉ ghi thêm (sửa = phiên bản mới). Trùng prisma/rls.sql mục 3.
-- ---------------------------------------------------------------------------
CREATE TRIGGER chan_sua_xoa_salary_profiles BEFORE UPDATE OR DELETE ON "salary_profiles"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();

-- LU-10: bộ tham số chỉ ghi thêm; được UPDATE đúng một việc — đặt người + lúc xác nhận (từ trống sang có).
CREATE OR REPLACE FUNCTION public.chan_sua_tham_so_luong() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Bo tham so luong chi duoc ghi them, khong duoc xoa.' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.confirmed_at IS NOT NULL OR NEW.confirmed_at IS NULL
       OR NEW.id <> OLD.id OR NEW.tenant_id <> OLD.tenant_id OR NEW.kind <> OLD.kind
       OR NEW.effective_from <> OLD.effective_from OR NEW.values <> OLD.values
       OR NEW.note IS DISTINCT FROM OLD.note OR NEW.source <> OLD.source
       OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'Bo tham so luong chi duoc ghi them; chi dat xac nhan mot lan.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER payroll_param_sets_chi_ghi_them
    BEFORE UPDATE OR DELETE ON "payroll_param_sets"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_tham_so_luong();

-- LU-40: kỳ lương ĐÃ KHÓA / ĐÃ CHI bất biến — kể cả vai chủ sở hữu. Ngoại lệ duy nhất: đã khóa → đã chi
-- (chỉ đổi trạng thái, người + lúc chi). Dòng lương, khoản cộng / trừ, hoa hồng của kỳ đã khóa: không thêm / sửa / xóa.
CREATE OR REPLACE FUNCTION public.chan_sua_ky_luong_da_khoa() RETURNS trigger AS $$
DECLARE
    trang_thai text;
BEGIN
    IF TG_TABLE_NAME = 'payroll_runs' THEN
        IF OLD.status IN ('da-khoa', 'da-chi') THEN
            IF TG_OP = 'UPDATE' AND OLD.status = 'da-khoa' AND NEW.status = 'da-chi'
               AND NEW.id = OLD.id AND NEW.tenant_id = OLD.tenant_id AND NEW.year = OLD.year AND NEW.month = OLD.month
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
CREATE TRIGGER payroll_runs_khoa
    BEFORE UPDATE OR DELETE ON "payroll_runs"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_ky_luong_da_khoa();
CREATE TRIGGER payroll_lines_khoa
    BEFORE INSERT OR UPDATE OR DELETE ON "payroll_lines"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_ky_luong_da_khoa();
CREATE TRIGGER payroll_items_khoa
    BEFORE INSERT OR UPDATE OR DELETE ON "payroll_items"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_ky_luong_da_khoa();
CREATE TRIGGER payroll_commission_items_khoa
    BEFORE INSERT OR UPDATE OR DELETE ON "payroll_commission_items"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_ky_luong_da_khoa();
