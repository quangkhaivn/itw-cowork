-- 0.19.0 — Nhân sự, giai đoạn 1: chấm công (vân tay ADMS + GPS), nghỉ phép, tăng ca, bảng công tháng.
-- Luật: BUSINESS_RULES.md mục 30 (NS). Quyết định QĐ-100 → QĐ-109. Không sửa migration cũ.
-- AlterTable
ALTER TABLE "staff_profiles" ADD COLUMN     "attendance_pin" VARCHAR(20),
ADD COLUMN     "default_location_id" UUID,
ADD COLUMN     "staff_type" VARCHAR(20) NOT NULL DEFAULT 'chinh-thuc';

-- CreateTable
CREATE TABLE "work_locations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radius_m" INTEGER,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "work_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_shifts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "break_start_minute" INTEGER,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "overnight" BOOLEAN NOT NULL DEFAULT false,
    "late_grace_minutes" INTEGER,
    "early_grace_minutes" INTEGER,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "work_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "shift_id" UUID NOT NULL,
    "days" JSONB NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "schedule_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intern_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "school" VARCHAR(255),
    "faculty" VARCHAR(255),
    "student_code" VARCHAR(50),
    "academic_supervisor" VARCHAR(255),
    "mentor_id" UUID,
    "start_date" DATE,
    "end_date" DATE,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "intern_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employment_contracts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "contract_type" VARCHAR(30) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "note" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hieu-luc',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "employment_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_devices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "serial_number" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "location_id" UUID NOT NULL,
    "ip_allowlist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "last_seen_at" TIMESTAMPTZ(6),
    "last_ip" VARCHAR(45),
    "info" JSONB,
    "attlog_stamp" VARCHAR(30),
    "operlog_stamp" VARCHAR(30),
    "offline_alerted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "attendance_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_punches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "pin" VARCHAR(20),
    "punched_at" TIMESTAMPTZ(6) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "direction" VARCHAR(5),
    "device_id" UUID,
    "location_id" UUID,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_m" DOUBLE PRECISION,
    "distance_m" DOUBLE PRECISION,
    "gps_result" VARCHAR(20),
    "ticket_id" UUID,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "client_time" TIMESTAMPTZ(6),
    "device_status" INTEGER,
    "verify_code" INTEGER,
    "work_code" VARCHAR(20),
    "raw_line" VARCHAR(500),
    "correction_id" UUID,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "matched_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "attendance_punches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_punch_reviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "punch_id" UUID NOT NULL,
    "decision" VARCHAR(20) NOT NULL,
    "note" TEXT,
    "reviewed_by" UUID NOT NULL,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_punch_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_consents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "notice_version" VARCHAR(20) NOT NULL,
    "acknowledged_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),

    CONSTRAINT "attendance_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "punch_at" TIMESTAMPTZ(6) NOT NULL,
    "direction" VARCHAR(5) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'cho-duyet',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "punch_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "uses_balance" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_adjustments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "days" DECIMAL(5,1) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "leave_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "portion" VARCHAR(10) NOT NULL DEFAULT 'ca-ngay',
    "days" DECIMAL(5,1) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'cho-duyet',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overtime_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "expected_hours" DECIMAL(4,2) NOT NULL,
    "approved_hours" DECIMAL(4,2),
    "reason" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'cho-duyet',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'nhap',
    "generated_at" TIMESTAMPTZ(6) NOT NULL,
    "generated_by" UUID,
    "feedback_deadline" TIMESTAMPTZ(6) NOT NULL,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_rows" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "timesheet_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "is_adjustment" BOOLEAN NOT NULL DEFAULT false,
    "day_type" VARCHAR(20) NOT NULL,
    "expected_value" DECIMAL(3,1) NOT NULL DEFAULT 0,
    "first_in" TIMESTAMPTZ(6),
    "last_out" TIMESTAMPTZ(6),
    "sources" JSONB NOT NULL DEFAULT '[]',
    "work_value" DECIMAL(3,1) NOT NULL DEFAULT 0,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "early_minutes" INTEGER NOT NULL DEFAULT 0,
    "leave_type_code" VARCHAR(30),
    "leave_days" DECIMAL(3,1) NOT NULL DEFAULT 0,
    "leave_paid" BOOLEAN NOT NULL DEFAULT false,
    "ot_minutes" INTEGER NOT NULL DEFAULT 0,
    "ot_night_minutes" INTEGER NOT NULL DEFAULT 0,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timesheet_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_feedback" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "timesheet_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "work_date" DATE,
    "content" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'mo',
    "resolution" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "timesheet_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_locations_tenant_id_idx" ON "work_locations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_locations_tenant_id_name_key" ON "work_locations"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "work_shifts_tenant_id_idx" ON "work_shifts"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_shifts_tenant_id_code_key" ON "work_shifts"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "work_schedules_tenant_id_idx" ON "work_schedules"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedules_tenant_id_code_key" ON "work_schedules"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "schedule_assignments_tenant_id_user_id_idx" ON "schedule_assignments"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_assignments_tenant_id_user_id_effective_from_key" ON "schedule_assignments"("tenant_id", "user_id", "effective_from");

-- CreateIndex
CREATE INDEX "holidays_tenant_id_idx" ON "holidays"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_tenant_id_date_key" ON "holidays"("tenant_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "intern_profiles_user_id_key" ON "intern_profiles"("user_id");

-- CreateIndex
CREATE INDEX "intern_profiles_tenant_id_idx" ON "intern_profiles"("tenant_id");

-- CreateIndex
CREATE INDEX "employment_contracts_tenant_id_user_id_idx" ON "employment_contracts"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_devices_serial_number_key" ON "attendance_devices"("serial_number");

-- CreateIndex
CREATE INDEX "attendance_devices_tenant_id_idx" ON "attendance_devices"("tenant_id");

-- CreateIndex
CREATE INDEX "attendance_punches_tenant_id_user_id_punched_at_idx" ON "attendance_punches"("tenant_id", "user_id", "punched_at");

-- CreateIndex
CREATE INDEX "attendance_punches_tenant_id_punched_at_idx" ON "attendance_punches"("tenant_id", "punched_at");

-- CreateIndex
CREATE INDEX "attendance_punches_tenant_id_pin_idx" ON "attendance_punches"("tenant_id", "pin");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_punches_tenant_id_device_id_pin_punched_at_key" ON "attendance_punches"("tenant_id", "device_id", "pin", "punched_at");

-- CreateIndex
CREATE INDEX "attendance_punch_reviews_tenant_id_punch_id_reviewed_at_idx" ON "attendance_punch_reviews"("tenant_id", "punch_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "attendance_consents_tenant_id_user_id_notice_version_idx" ON "attendance_consents"("tenant_id", "user_id", "notice_version");

-- CreateIndex
CREATE INDEX "attendance_corrections_tenant_id_user_id_work_date_idx" ON "attendance_corrections"("tenant_id", "user_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_corrections_tenant_id_status_idx" ON "attendance_corrections"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "leave_types_tenant_id_idx" ON "leave_types"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_tenant_id_code_key" ON "leave_types"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_tenant_id_user_id_year_key" ON "leave_balances"("tenant_id", "user_id", "year");

-- CreateIndex
CREATE INDEX "leave_adjustments_tenant_id_user_id_year_idx" ON "leave_adjustments"("tenant_id", "user_id", "year");

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_user_id_start_date_idx" ON "leave_requests"("tenant_id", "user_id", "start_date");

-- CreateIndex
CREATE INDEX "leave_requests_tenant_id_status_idx" ON "leave_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "overtime_requests_tenant_id_user_id_work_date_idx" ON "overtime_requests"("tenant_id", "user_id", "work_date");

-- CreateIndex
CREATE INDEX "overtime_requests_tenant_id_status_idx" ON "overtime_requests"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "timesheets_tenant_id_year_month_key" ON "timesheets"("tenant_id", "year", "month");

-- CreateIndex
CREATE INDEX "timesheet_rows_tenant_id_user_id_work_date_idx" ON "timesheet_rows"("tenant_id", "user_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_rows_timesheet_id_user_id_work_date_is_adjustment_key" ON "timesheet_rows"("timesheet_id", "user_id", "work_date", "is_adjustment");

-- CreateIndex
CREATE INDEX "timesheet_feedback_tenant_id_timesheet_id_status_idx" ON "timesheet_feedback"("tenant_id", "timesheet_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_tenant_id_attendance_pin_key" ON "staff_profiles"("tenant_id", "attendance_pin");

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_default_location_id_fkey" FOREIGN KEY ("default_location_id") REFERENCES "work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_locations" ADD CONSTRAINT "work_locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_shifts" ADD CONSTRAINT "work_shifts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "work_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intern_profiles" ADD CONSTRAINT "intern_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intern_profiles" ADD CONSTRAINT "intern_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intern_profiles" ADD CONSTRAINT "intern_profiles_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "work_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "attendance_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "work_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punch_reviews" ADD CONSTRAINT "attendance_punch_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_punch_reviews" ADD CONSTRAINT "attendance_punch_reviews_punch_id_fkey" FOREIGN KEY ("punch_id") REFERENCES "attendance_punches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_consents" ADD CONSTRAINT "attendance_consents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_fkey" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_feedback" ADD CONSTRAINT "timesheet_feedback_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_feedback" ADD CONSTRAINT "timesheet_feedback_timesheet_id_fkey" FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_feedback" ADD CONSTRAINT "timesheet_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ — BUSINESS_RULES.md mục 30 (NS)
-- ---------------------------------------------------------------------------

-- NS-01, NS-02: loại nhân sự và mã chấm công (PIN trên máy vân tay; chữ số / chữ cái, tối đa 20).
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_loai_nhan_su_check"
    CHECK ("staff_type" IN ('chinh-thuc', 'thu-viec', 'thuc-tap', 'cong-tac-vien'));
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_ma_cham_cong_check"
    CHECK ("attendance_pin" IS NULL OR "attendance_pin" ~ '^[0-9A-Za-z]{1,20}$');

ALTER TABLE "intern_profiles" ADD CONSTRAINT "intern_profiles_thoi_gian_check"
    CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "end_date" >= "start_date");

ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_loai_check"
    CHECK ("contract_type" IN ('thu-viec', 'xac-dinh-thoi-han', 'khong-xac-dinh-thoi-han', 'thuc-tap', 'cong-tac-vien', 'khac'));
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_trang_thai_check"
    CHECK ("status" IN ('hieu-luc', 'het-hieu-luc', 'huy'));
ALTER TABLE "employment_contracts" ADD CONSTRAINT "employment_contracts_thoi_gian_check"
    CHECK ("end_date" IS NULL OR "end_date" >= "start_date");

-- NS-05: địa điểm — toạ độ hợp lệ, bán kính 10 m – 5 km (trống = mặc định Cấu hình).
ALTER TABLE "work_locations" ADD CONSTRAINT "work_locations_toa_do_check"
    CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
ALTER TABLE "work_locations" ADD CONSTRAINT "work_locations_ban_kinh_check"
    CHECK ("radius_m" IS NULL OR "radius_m" BETWEEN 10 AND 5000);

-- NS-06: ca làm — phút trong ngày, ca qua đêm khi giờ kết thúc ≤ giờ bắt đầu.
ALTER TABLE "work_shifts" ADD CONSTRAINT "work_shifts_gio_check"
    CHECK ("start_minute" BETWEEN 0 AND 1439 AND "end_minute" BETWEEN 0 AND 1439
           AND "start_minute" <> "end_minute"
           AND "overnight" = ("end_minute" < "start_minute"));
ALTER TABLE "work_shifts" ADD CONSTRAINT "work_shifts_nghi_check"
    CHECK ("break_minutes" BETWEEN 0 AND 480
           AND ("break_start_minute" IS NULL OR "break_start_minute" BETWEEN 0 AND 1439));
ALTER TABLE "work_shifts" ADD CONSTRAINT "work_shifts_cho_phep_check"
    CHECK (("late_grace_minutes" IS NULL OR "late_grace_minutes" BETWEEN 0 AND 240)
       AND ("early_grace_minutes" IS NULL OR "early_grace_minutes" BETWEEN 0 AND 240));

-- NS-07: lịch tuần đúng 7 ô, mỗi ô một trong bốn giá trị.
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_ngay_check"
    CHECK (jsonb_typeof("days") = 'array' AND jsonb_array_length("days") = 7
           AND "days" <@ '["ca", "sang", "chieu", "nghi"]'::jsonb);

-- NS-10 → NS-13: lần chấm công.
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_nguon_check"
    CHECK ("source" IN ('van-tay', 'gps', 'bo-sung', 'nhap-csv'));
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_huong_check"
    CHECK ("direction" IS NULL OR "direction" IN ('vao', 'ra'));
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_ket_qua_gps_check"
    CHECK (("source" = 'gps') = ("gps_result" IS NOT NULL)
           AND ("gps_result" IS NULL OR "gps_result" IN ('hop-le', 'hien-truong', 'ngoai-vung')));
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_hien_truong_check"
    CHECK ("gps_result" IS DISTINCT FROM 'hien-truong' OR "ticket_id" IS NOT NULL);
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_may_check"
    CHECK ("source" <> 'van-tay' OR ("device_id" IS NOT NULL AND "pin" IS NOT NULL));
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_bo_sung_check"
    CHECK ("source" <> 'bo-sung' OR ("correction_id" IS NOT NULL AND "user_id" IS NOT NULL));
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_nguoi_check"
    CHECK ("user_id" IS NOT NULL OR "pin" IS NOT NULL);
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_co_check"
    CHECK (jsonb_typeof("flags") = 'array');
ALTER TABLE "attendance_punches" ADD CONSTRAINT "attendance_punches_toa_do_check"
    CHECK (("latitude" IS NULL) = ("longitude" IS NULL)
           AND ("latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180))
           AND ("accuracy_m" IS NULL OR "accuracy_m" >= 0));
-- Nhập CSV dự phòng: cùng PIN + cùng giờ chỉ một dòng (máy vân tay đã có khóa duy nhất theo máy).
CREATE UNIQUE INDEX "attendance_punches_nhap_csv_key"
    ON "attendance_punches" ("tenant_id", "pin", "punched_at") WHERE "source" = 'nhap-csv';
-- Một lần chấm bù cho mỗi giải trình.
CREATE UNIQUE INDEX "attendance_punches_giai_trinh_key"
    ON "attendance_punches" ("correction_id") WHERE "correction_id" IS NOT NULL;
-- Dòng PIN chưa khớp người (để HR gán sau).
CREATE INDEX "attendance_punches_chua_khop_idx"
    ON "attendance_punches" ("tenant_id", "pin") WHERE "user_id" IS NULL;

-- NS-10: lần chấm CHỈ GHI THÊM. Không xóa; sửa duy nhất được phép là gán người cho dòng chưa khớp PIN
-- (user_id NULL → có giá trị, kèm matched_at), mọi cột khác phải giữ nguyên.
CREATE OR REPLACE FUNCTION public.chan_sua_lan_cham() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Lan cham cong chi duoc ghi them. Khong duoc xoa.' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.user_id IS NULL AND NEW.user_id IS NOT NULL
       AND (to_jsonb(NEW) - 'user_id' - 'matched_at') = (to_jsonb(OLD) - 'user_id' - 'matched_at') THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Lan cham cong chi duoc ghi them. Chi gan nguoi cho dong chua khop PIN.' USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER attendance_punches_chi_ghi_them
    BEFORE UPDATE OR DELETE ON "attendance_punches"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_lan_cham();

ALTER TABLE "attendance_punch_reviews" ADD CONSTRAINT "attendance_punch_reviews_quyet_dinh_check"
    CHECK ("decision" IN ('chap-nhan', 'tu-choi'));
ALTER TABLE "attendance_consents" ADD CONSTRAINT "attendance_consents_phien_ban_check"
    CHECK (length(btrim("notice_version")) >= 1);
ALTER TABLE "leave_adjustments" ADD CONSTRAINT "leave_adjustments_so_ngay_check"
    CHECK ("days" <> 0 AND "days" BETWEEN -365 AND 365 AND length(btrim("reason")) >= 5);

CREATE TRIGGER attendance_punch_reviews_chi_ghi_them
    BEFORE UPDATE OR DELETE ON "attendance_punch_reviews"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();
CREATE TRIGGER attendance_consents_chi_ghi_them
    BEFORE UPDATE OR DELETE ON "attendance_consents"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();
CREATE TRIGGER leave_adjustments_chi_ghi_them
    BEFORE UPDATE OR DELETE ON "leave_adjustments"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();

-- NS-20: giải trình / chấm bù.
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_trang_thai_check"
    CHECK ("status" IN ('cho-duyet', 'da-duyet', 'tu-choi', 'da-huy'));
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_huong_check"
    CHECK ("direction" IN ('vao', 'ra'));
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_ly_do_check"
    CHECK (length(btrim("reason")) >= 5);
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_quyet_dinh_check"
    CHECK ("status" NOT IN ('da-duyet', 'tu-choi') OR ("decided_by" IS NOT NULL AND "decided_at" IS NOT NULL));
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_da_duyet_check"
    CHECK ("status" <> 'da-duyet' OR "punch_id" IS NOT NULL);

-- NS-30 → NS-35: nghỉ phép.
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_trang_thai_check"
    CHECK ("status" IN ('cho-duyet', 'da-duyet', 'tu-choi', 'da-huy'));
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_phan_check"
    CHECK ("portion" IN ('ca-ngay', 'sang', 'chieu') AND ("portion" = 'ca-ngay' OR "start_date" = "end_date"));
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_thoi_gian_check"
    CHECK ("end_date" >= "start_date" AND "days" > 0);
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_ly_do_check"
    CHECK (length(btrim("reason")) >= 2);
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_quyet_dinh_check"
    CHECK ("status" NOT IN ('da-duyet', 'tu-choi') OR ("decided_by" IS NOT NULL AND "decided_at" IS NOT NULL));
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_huy_check"
    CHECK ("status" <> 'da-huy' OR ("cancelled_at" IS NOT NULL AND length(btrim(coalesce("cancel_reason", ''))) >= 2));

-- NS-40 → NS-43: tăng ca.
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_trang_thai_check"
    CHECK ("status" IN ('cho-duyet', 'da-duyet', 'tu-choi', 'da-huy'));
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_gio_check"
    CHECK ("expected_hours" > 0 AND "expected_hours" <= 24
           AND ("approved_hours" IS NULL OR ("approved_hours" > 0 AND "approved_hours" <= 24)));
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_duyet_check"
    CHECK ("status" <> 'da-duyet' OR ("approved_hours" IS NOT NULL AND "decided_by" IS NOT NULL AND "decided_at" IS NOT NULL));
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_ly_do_check"
    CHECK (length(btrim("reason")) >= 2);

-- NS-50 → NS-54: bảng công tháng.
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_ky_check"
    CHECK ("month" BETWEEN 1 AND 12 AND "year" BETWEEN 2020 AND 2100);
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_trang_thai_check"
    CHECK ("status" IN ('nhap', 'da-khoa'));
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_khoa_check"
    CHECK ("status" <> 'da-khoa' OR ("locked_at" IS NOT NULL AND "locked_by" IS NOT NULL));
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_loai_ngay_check"
    CHECK ("day_type" IN ('thuong', 'nghi-tuan', 'le'));
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_so_check"
    CHECK ("is_adjustment" OR ("late_minutes" >= 0 AND "early_minutes" >= 0 AND "ot_minutes" >= 0
           AND "ot_night_minutes" >= 0 AND "work_value" >= 0 AND "leave_days" >= 0));
ALTER TABLE "timesheet_rows" ADD CONSTRAINT "timesheet_rows_co_check"
    CHECK (jsonb_typeof("flags") = 'array' AND jsonb_typeof("sources") = 'array');
ALTER TABLE "timesheet_feedback" ADD CONSTRAINT "timesheet_feedback_trang_thai_check"
    CHECK ("status" IN ('mo', 'da-giai-quyet')
           AND ("status" = 'mo' OR ("resolved_at" IS NOT NULL AND length(btrim(coalesce("resolution", ''))) >= 2)));
ALTER TABLE "timesheet_feedback" ADD CONSTRAINT "timesheet_feedback_noi_dung_check"
    CHECK (length(btrim("content")) >= 5);

-- NS-52: bảng công đã khóa là bất biến — kể cả với vai chủ sở hữu. Sửa sau khóa = dòng điều chỉnh ở kỳ sau.
CREATE OR REPLACE FUNCTION public.chan_sua_bang_cong_da_khoa() RETURNS trigger AS $$
DECLARE
    trang_thai text;
BEGIN
    IF TG_TABLE_NAME = 'timesheets' THEN
        IF OLD.status = 'da-khoa' THEN
            RAISE EXCEPTION 'Bang cong da khoa, khong duoc sua hoac xoa.' USING ERRCODE = 'check_violation';
        END IF;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    SELECT status INTO trang_thai FROM timesheets
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.timesheet_id ELSE NEW.timesheet_id END;
    IF trang_thai = 'da-khoa' THEN
        RAISE EXCEPTION 'Bang cong da khoa, khong duoc sua hoac xoa.' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.timesheet_id <> NEW.timesheet_id THEN
        SELECT status INTO trang_thai FROM timesheets WHERE id = OLD.timesheet_id;
        IF trang_thai = 'da-khoa' THEN
            RAISE EXCEPTION 'Bang cong da khoa, khong duoc sua hoac xoa.' USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER timesheets_khoa
    BEFORE UPDATE OR DELETE ON "timesheets"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_bang_cong_da_khoa();
CREATE TRIGGER timesheet_rows_khoa
    BEFORE INSERT OR UPDATE OR DELETE ON "timesheet_rows"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_bang_cong_da_khoa();
CREATE TRIGGER timesheet_feedback_khoa
    BEFORE INSERT OR UPDATE OR DELETE ON "timesheet_feedback"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_bang_cong_da_khoa();

-- NS-03: tệp hợp đồng lao động đính kèm theo luật mục 20. Cùng lúc thêm nhánh kiểm quyền
-- 'employment_contract' trong src/modules/dinh-kem/quyen.ts (DK-01).
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_loai_doi_tuong_check";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_loai_doi_tuong_check"
    CHECK ("object_type" IN ('supplier_bill', 'sales_return', 'purchase_return',
                             'stock_transfer', 'sales_order', 'support_ticket', 'task',
                             'employment_contract'));

-- NS-14 (QĐ-101): máy chấm công gọi vào KHÔNG kèm doanh nghiệp. Tra doanh nghiệp từ số sê-ri bằng
-- hàm SECURITY DEFINER (chạy bằng quyền chủ sở hữu, bỏ qua RLS) — chỉ trả đúng (doanh nghiệp, máy)
-- của MỘT số sê-ri đang hoạt động, không liệt kê được gì khác. Quyền EXECUTE cấp ở prisma/rls.sql.
CREATE OR REPLACE FUNCTION public.tra_may_cham_cong(p_sn text)
RETURNS TABLE (tenant_id uuid, device_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT d.tenant_id, d.id
      FROM attendance_devices d
      JOIN tenants t ON t.id = d.tenant_id
     WHERE d.serial_number = p_sn AND d.status = 'hoat-dong' AND t.status = 'hoat-dong'
     LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.tra_may_cham_cong(text) FROM PUBLIC;
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_so_seri_check"
    CHECK ("serial_number" ~ '^[A-Za-z0-9_-]{4,64}$');
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_trang_thai_check"
    CHECK ("status" IN ('hoat-dong', 'ngung-hoat-dong'));
