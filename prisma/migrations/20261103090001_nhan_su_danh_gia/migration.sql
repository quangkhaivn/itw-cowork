-- 0.20.0 — Nhân sự giai đoạn 2: giao việc mở rộng, tiến độ, báo cáo ngày / tuần, duyệt + chấm điểm
-- công việc, KPI, đánh giá định kỳ, sinh viên thực tập (nhật ký tuần + phiếu đánh giá theo mẫu).
-- Luật nghiệp vụ: BUSINESS_RULES.md mục 31 (DG-01 → DG-82). Quyết định: QĐ-113 → QĐ-124.
-- Phần đầu do `prisma migrate diff` sinh từ schema.prisma; phần sau (CHECK, khóa ngoại cột người,
-- chỉ mục riêng phần, trigger bất biến, quyền) viết tay.

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "daily_report" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "accept_status" VARCHAR(20),
ADD COLUMN     "accepted_at" TIMESTAMPTZ(6),
ADD COLUMN     "approval_level" SMALLINT,
ADD COLUMN     "approval_round" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "decline_reason" TEXT,
ADD COLUMN     "declined_at" TIMESTAMPTZ(6),
ADD COLUMN     "difficulty" SMALLINT NOT NULL DEFAULT 3,
ADD COLUMN     "group_id" UUID,
ADD COLUMN     "needs_approval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "on_time_factor" DECIMAL(4,2),
ADD COLUMN     "original_due_at" TIMESTAMPTZ(6),
ADD COLUMN     "progress" SMALLINT NOT NULL DEFAULT 0,
ADD COLUMN     "quality_score" SMALLINT,
ADD COLUMN     "recurrence_assignee_id" UUID,
ADD COLUMN     "recurrence_date" DATE,
ADD COLUMN     "recurrence_id" UUID,
ADD COLUMN     "source_report_id" UUID,
ADD COLUMN     "submitted_at" TIMESTAMPTZ(6),
ADD COLUMN     "task_score" DECIMAL(6,2),
ADD COLUMN     "template_id" UUID;

-- CreateTable
CREATE TABLE "task_approvers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "level" SMALLINT NOT NULL,
    "approver_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "task_approvers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_approval_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "round" INTEGER NOT NULL,
    "level" SMALLINT,
    "action" VARCHAR(20) NOT NULL,
    "actor_id" UUID NOT NULL,
    "reason" TEXT,
    "quality" SMALLINT,
    "due_at" TIMESTAMPTZ(6),
    "on_time_factor" DECIMAL(4,2),
    "score" DECIMAL(6,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_approval_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_score_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "old_score" DECIMAL(6,2),
    "new_score" DECIMAL(6,2) NOT NULL,
    "old_quality" SMALLINT,
    "new_quality" SMALLINT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_score_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_extensions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "old_due_at" TIMESTAMPTZ(6),
    "new_due_at" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'cho-duyet',
    "decided_by" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_progress_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "percent" SMALLINT NOT NULL,
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_progress_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "difficulty" SMALLINT NOT NULL DEFAULT 3,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'trung-binh',
    "needs_approval" BOOLEAN NOT NULL DEFAULT true,
    "due_days" INTEGER,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "approval_chain" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_recurrences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "template_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "difficulty" SMALLINT NOT NULL DEFAULT 3,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'trung-binh',
    "needs_approval" BOOLEAN NOT NULL DEFAULT false,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "approval_chain" JSONB NOT NULL DEFAULT '[]',
    "frequency" VARCHAR(10) NOT NULL,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "month_day" SMALLINT,
    "due_minute" SMALLINT NOT NULL DEFAULT 1020,
    "assignee_ids" UUID[],
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "last_run_date" DATE,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "task_recurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "done" TEXT,
    "plan" TEXT,
    "blockers" TEXT,
    "auto_data" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(10) NOT NULL DEFAULT 'nhap',
    "deadline_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_report_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_task_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_report_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "job_title" VARCHAR(255),
    "role_code" VARCHAR(50),
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "kpi_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kpi_set_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "metric" VARCHAR(40),
    "direction" VARCHAR(10) NOT NULL DEFAULT 'cao-tot',
    "target_month" DECIMAL(18,2),
    "target_quarter" DECIMAL(18,2),
    "position" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kpi_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "year" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'mo',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "evaluation_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kpi_set_id" UUID,
    "kpi_set_name" VARCHAR(255),
    "manager_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'nhan-vien',
    "self_note" TEXT,
    "self_submitted_at" TIMESTAMPTZ(6),
    "manager_comment" TEXT,
    "scored_by" UUID,
    "scored_at" TIMESTAMPTZ(6),
    "total_score" DECIMAL(6,2),
    "grade" VARCHAR(2),
    "bonus_coef" DECIMAL(4,2),
    "finalized_by" UUID,
    "finalized_at" TIMESTAMPTZ(6),
    "finalize_note" TEXT,
    "context" JSONB NOT NULL DEFAULT '{}',
    "metrics_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "kpi_item_id" UUID,
    "position" INTEGER NOT NULL DEFAULT 0,
    "name" VARCHAR(255) NOT NULL,
    "weight" DECIMAL(5,2) NOT NULL,
    "source" VARCHAR(10) NOT NULL,
    "metric" VARCHAR(40),
    "direction" VARCHAR(10) NOT NULL DEFAULT 'cao-tot',
    "target" DECIMAL(18,2),
    "actual" DECIMAL(18,2),
    "achievement" DECIMAL(7,2),
    "self_score" DECIMAL(6,2),
    "self_note" TEXT,
    "manager_score" DECIMAL(6,2),
    "manager_note" TEXT,

    CONSTRAINT "evaluation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluation_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "old_total" DECIMAL(6,2),
    "new_total" DECIMAL(6,2) NOT NULL,
    "old_grade" VARCHAR(2),
    "new_grade" VARCHAR(2) NOT NULL,
    "new_bonus_coef" DECIMAL(4,2) NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intern_journals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "did" TEXT,
    "learned" TEXT,
    "blockers" TEXT,
    "status" VARCHAR(10) NOT NULL DEFAULT 'nhap',
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "intern_journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intern_journal_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intern_journal_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intern_eval_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "school" VARCHAR(255),
    "layout" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "intern_eval_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intern_evaluations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "template_snapshot" JSONB NOT NULL,
    "header" JSONB NOT NULL DEFAULT '{}',
    "scores" JSONB NOT NULL DEFAULT '{}',
    "comments" JSONB NOT NULL DEFAULT '{}',
    "auto_values" JSONB NOT NULL DEFAULT '{}',
    "total_score" DECIMAL(5,2),
    "total_letter" VARCHAR(5),
    "status" VARCHAR(10) NOT NULL DEFAULT 'nhap',
    "mentor_id" UUID,
    "period_from" DATE,
    "period_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "finalized_by" UUID,
    "finalized_at" TIMESTAMPTZ(6),

    CONSTRAINT "intern_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_approvers_tenant_id_approver_id_idx" ON "task_approvers"("tenant_id", "approver_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_approvers_task_id_level_key" ON "task_approvers"("task_id", "level");

-- CreateIndex
CREATE INDEX "task_approval_logs_tenant_id_task_id_created_at_idx" ON "task_approval_logs"("tenant_id", "task_id", "created_at");

-- CreateIndex
CREATE INDEX "task_approval_logs_tenant_id_action_created_at_idx" ON "task_approval_logs"("tenant_id", "action", "created_at");

-- CreateIndex
CREATE INDEX "task_score_adjustments_tenant_id_task_id_idx" ON "task_score_adjustments"("tenant_id", "task_id");

-- CreateIndex
CREATE INDEX "task_extensions_tenant_id_task_id_idx" ON "task_extensions"("tenant_id", "task_id");

-- CreateIndex
CREATE INDEX "task_progress_logs_tenant_id_task_id_created_at_idx" ON "task_progress_logs"("tenant_id", "task_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_templates_tenant_id_name_key" ON "task_templates"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "task_recurrences_tenant_id_status_idx" ON "task_recurrences"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "work_reports_tenant_id_kind_period_start_idx" ON "work_reports"("tenant_id", "kind", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "work_reports_tenant_id_user_id_kind_period_start_key" ON "work_reports"("tenant_id", "user_id", "kind", "period_start");

-- CreateIndex
CREATE INDEX "work_report_comments_tenant_id_report_id_idx" ON "work_report_comments"("tenant_id", "report_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_sets_tenant_id_code_key" ON "kpi_sets"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "kpi_items_tenant_id_kpi_set_id_idx" ON "kpi_items"("tenant_id", "kpi_set_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluation_periods_tenant_id_kind_year_number_key" ON "evaluation_periods"("tenant_id", "kind", "year", "number");

-- CreateIndex
CREATE INDEX "evaluations_tenant_id_user_id_idx" ON "evaluations"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "evaluations_period_id_user_id_key" ON "evaluations"("period_id", "user_id");

-- CreateIndex
CREATE INDEX "evaluation_items_tenant_id_evaluation_id_idx" ON "evaluation_items"("tenant_id", "evaluation_id");

-- CreateIndex
CREATE INDEX "evaluation_adjustments_tenant_id_evaluation_id_idx" ON "evaluation_adjustments"("tenant_id", "evaluation_id");

-- CreateIndex
CREATE UNIQUE INDEX "intern_journals_tenant_id_user_id_week_start_key" ON "intern_journals"("tenant_id", "user_id", "week_start");

-- CreateIndex
CREATE INDEX "intern_journal_comments_tenant_id_journal_id_idx" ON "intern_journal_comments"("tenant_id", "journal_id");

-- CreateIndex
CREATE UNIQUE INDEX "intern_eval_templates_tenant_id_code_key" ON "intern_eval_templates"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "intern_evaluations_tenant_id_user_id_idx" ON "intern_evaluations"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "tasks_tenant_id_group_id_idx" ON "tasks"("tenant_id", "group_id");

-- CreateIndex
CREATE INDEX "tasks_tenant_id_status_approval_level_idx" ON "tasks"("tenant_id", "status", "approval_level");

-- CreateIndex
CREATE INDEX "tasks_tenant_id_owner_id_approved_at_idx" ON "tasks"("tenant_id", "owner_id", "approved_at");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurrence_id_fkey" FOREIGN KEY ("recurrence_id") REFERENCES "task_recurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_approvers" ADD CONSTRAINT "task_approvers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_approvers" ADD CONSTRAINT "task_approvers_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_approval_logs" ADD CONSTRAINT "task_approval_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_approval_logs" ADD CONSTRAINT "task_approval_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_score_adjustments" ADD CONSTRAINT "task_score_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_score_adjustments" ADD CONSTRAINT "task_score_adjustments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_extensions" ADD CONSTRAINT "task_extensions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_extensions" ADD CONSTRAINT "task_extensions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_progress_logs" ADD CONSTRAINT "task_progress_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_progress_logs" ADD CONSTRAINT "task_progress_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_recurrences" ADD CONSTRAINT "task_recurrences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_recurrences" ADD CONSTRAINT "task_recurrences_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "task_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_report_comments" ADD CONSTRAINT "work_report_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_report_comments" ADD CONSTRAINT "work_report_comments_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "work_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_sets" ADD CONSTRAINT "kpi_sets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_items" ADD CONSTRAINT "kpi_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_items" ADD CONSTRAINT "kpi_items_kpi_set_id_fkey" FOREIGN KEY ("kpi_set_id") REFERENCES "kpi_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_periods" ADD CONSTRAINT "evaluation_periods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "evaluation_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_items" ADD CONSTRAINT "evaluation_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_items" ADD CONSTRAINT "evaluation_items_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_adjustments" ADD CONSTRAINT "evaluation_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluation_adjustments" ADD CONSTRAINT "evaluation_adjustments_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "evaluations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intern_journals" ADD CONSTRAINT "intern_journals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intern_journal_comments" ADD CONSTRAINT "intern_journal_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intern_journal_comments" ADD CONSTRAINT "intern_journal_comments_journal_id_fkey" FOREIGN KEY ("journal_id") REFERENCES "intern_journals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intern_eval_templates" ADD CONSTRAINT "intern_eval_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intern_evaluations" ADD CONSTRAINT "intern_evaluations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intern_evaluations" ADD CONSTRAINT "intern_evaluations_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "intern_eval_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ===========================================================================
-- Phần viết tay
-- ===========================================================================

-- Khóa ngoại cột người (không khai quan hệ Prisma — QĐ-113).
ALTER TABLE "task_approvers" ADD CONSTRAINT "task_approvers_approver_id_fkey"
    FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_approval_logs" ADD CONSTRAINT "task_approval_logs_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_score_adjustments" ADD CONSTRAINT "task_score_adjustments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_extensions" ADD CONSTRAINT "task_extensions_requested_by_fkey"
    FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_progress_logs" ADD CONSTRAINT "task_progress_logs_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_recurrences" ADD CONSTRAINT "task_recurrences_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "work_report_comments" ADD CONSTRAINT "work_report_comments_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "evaluation_adjustments" ADD CONSTRAINT "evaluation_adjustments_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "intern_journals" ADD CONSTRAINT "intern_journals_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "intern_journal_comments" ADD CONSTRAINT "intern_journal_comments_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "intern_evaluations" ADD CONSTRAINT "intern_evaluations_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Công việc (DG-01 → DG-32)
-- ---------------------------------------------------------------------------
-- DG-20: thêm trạng thái "chờ duyệt".
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_status_check";
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_check"
    CHECK ("status" IN ('mo', 'dang-lam', 'cho-duyet', 'xong', 'huy'));
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_do_kho_check" CHECK ("difficulty" BETWEEN 1 AND 5);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tien_do_check" CHECK ("progress" BETWEEN 0 AND 100);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_nhan_viec_check"
    CHECK ("accept_status" IS NULL OR "accept_status" IN ('cho-nhan', 'da-nhan', 'tu-choi'));
-- Từ chối phải có lý do (DG-03).
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tu_choi_check"
    CHECK ("accept_status" IS DISTINCT FROM 'tu-choi' OR length(btrim(coalesce("decline_reason", ''))) >= 5);
-- Chờ duyệt thì phải biết gửi lúc nào và đang chờ cấp nào; việc không cần duyệt không vào chờ duyệt.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_cho_duyet_check"
    CHECK ("status" <> 'cho-duyet' OR ("needs_approval" AND "submitted_at" IS NOT NULL AND "approval_level" IS NOT NULL));
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_chat_luong_check" CHECK ("quality_score" IS NULL OR "quality_score" BETWEEN 1 AND 5);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_diem_check" CHECK ("task_score" IS NULL OR "task_score" >= 0);
-- DG-07: việc định kỳ không sinh hai lần cho cùng (lịch, ngày, người được lịch giao).
CREATE UNIQUE INDEX "tasks_lap_chong_trung" ON "tasks"("recurrence_id", "recurrence_date", "recurrence_assignee_id")
    WHERE "recurrence_id" IS NOT NULL;
-- Việc cũ: hạn ban đầu = hạn hiện tại.
UPDATE "tasks" SET "original_due_at" = "due_at" WHERE "due_at" IS NOT NULL AND "original_due_at" IS NULL;

ALTER TABLE "task_approvers" ADD CONSTRAINT "task_approvers_cap_check" CHECK ("level" BETWEEN 1 AND 5);
-- Một người không đứng hai cấp trong cùng một chuỗi.
CREATE UNIQUE INDEX "task_approvers_khong_lap_nguoi" ON "task_approvers"("task_id", "approver_id");

ALTER TABLE "task_approval_logs" ADD CONSTRAINT "task_approval_logs_hanh_dong_check"
    CHECK ("action" IN ('gui-duyet', 'duyet', 'tra-lai'));
ALTER TABLE "task_approval_logs" ADD CONSTRAINT "task_approval_logs_tra_lai_check"
    CHECK ("action" <> 'tra-lai' OR length(btrim(coalesce("reason", ''))) >= 5);
ALTER TABLE "task_approval_logs" ADD CONSTRAINT "task_approval_logs_duyet_check"
    CHECK ("action" <> 'duyet' OR "quality" BETWEEN 1 AND 5);

ALTER TABLE "task_score_adjustments" ADD CONSTRAINT "task_score_adjustments_ly_do_check"
    CHECK (length(btrim("reason")) >= 10);
ALTER TABLE "task_score_adjustments" ADD CONSTRAINT "task_score_adjustments_diem_check"
    CHECK ("new_score" >= 0 AND "new_quality" BETWEEN 1 AND 5);

ALTER TABLE "task_extensions" ADD CONSTRAINT "task_extensions_trang_thai_check"
    CHECK ("status" IN ('cho-duyet', 'da-duyet', 'tu-choi'));
ALTER TABLE "task_extensions" ADD CONSTRAINT "task_extensions_ly_do_check" CHECK (length(btrim("reason")) >= 5);
ALTER TABLE "task_extensions" ADD CONSTRAINT "task_extensions_quyet_dinh_check"
    CHECK (("status" = 'cho-duyet') = ("decided_at" IS NULL) AND ("decided_at" IS NULL) = ("decided_by" IS NULL));
ALTER TABLE "task_extensions" ADD CONSTRAINT "task_extensions_decided_by_fkey"
    FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Mỗi việc tối đa một đề nghị gia hạn đang chờ.
CREATE UNIQUE INDEX "task_extensions_mot_de_nghi_cho" ON "task_extensions"("task_id") WHERE "status" = 'cho-duyet';

ALTER TABLE "task_progress_logs" ADD CONSTRAINT "task_progress_logs_phan_tram_check" CHECK ("percent" BETWEEN 0 AND 100);

ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_do_kho_check" CHECK ("difficulty" BETWEEN 1 AND 5);
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_han_check" CHECK ("due_days" IS NULL OR "due_days" BETWEEN 0 AND 365);
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_uu_tien_check" CHECK ("priority" IN ('thap', 'trung-binh', 'cao', 'khan'));

ALTER TABLE "task_recurrences" ADD CONSTRAINT "task_recurrences_tan_suat_check" CHECK ("frequency" IN ('ngay', 'tuan', 'thang'));
ALTER TABLE "task_recurrences" ADD CONSTRAINT "task_recurrences_thu_check"
    CHECK ("weekdays" <@ ARRAY[1, 2, 3, 4, 5, 6, 7] AND ("frequency" <> 'tuan' OR cardinality("weekdays") > 0));
ALTER TABLE "task_recurrences" ADD CONSTRAINT "task_recurrences_ngay_thang_check"
    CHECK (("frequency" <> 'thang' OR "month_day" BETWEEN 1 AND 31));
ALTER TABLE "task_recurrences" ADD CONSTRAINT "task_recurrences_gio_check" CHECK ("due_minute" BETWEEN 0 AND 1439);
ALTER TABLE "task_recurrences" ADD CONSTRAINT "task_recurrences_nguoi_check" CHECK (cardinality("assignee_ids") BETWEEN 1 AND 50);
ALTER TABLE "task_recurrences" ADD CONSTRAINT "task_recurrences_khoang_check" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "task_recurrences" ADD CONSTRAINT "task_recurrences_do_kho_check" CHECK ("difficulty" BETWEEN 1 AND 5);

-- DG-10: đính kèm vào dòng tiến độ (ảnh, tệp) — nhánh 'task_progress' trong src/modules/dinh-kem/quyen.ts.
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_loai_doi_tuong_check";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_loai_doi_tuong_check"
    CHECK ("object_type" IN ('supplier_bill', 'sales_return', 'purchase_return',
                             'stock_transfer', 'sales_order', 'support_ticket', 'task',
                             'employment_contract', 'task_progress'));

-- ---------------------------------------------------------------------------
-- Báo cáo ngày / tuần (DG-40 → DG-45)
-- ---------------------------------------------------------------------------
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_loai_check" CHECK ("kind" IN ('ngay', 'tuan'));
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_trang_thai_check" CHECK ("status" IN ('nhap', 'da-nop'));
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_nop_check"
    CHECK (("status" = 'da-nop') = ("submitted_at" IS NOT NULL));
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_khoang_check" CHECK ("period_end" >= "period_start");
ALTER TABLE "work_report_comments" ADD CONSTRAINT "work_report_comments_noi_dung_check" CHECK (length(btrim("body")) >= 2);
ALTER TABLE "work_report_comments" ADD CONSTRAINT "work_report_comments_created_task_id_fkey"
    FOREIGN KEY ("created_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_source_report_id_fkey"
    FOREIGN KEY ("source_report_id") REFERENCES "work_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Báo cáo đã nộp bất biến (trễ / thiếu được ghi để đánh giá tháng, DG-43).
CREATE OR REPLACE FUNCTION public.chan_sua_bao_cao_da_nop() RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'da-nop' THEN
        RAISE EXCEPTION 'Bao cao da nop, khong duoc sua hoac xoa.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER work_reports_da_nop
    BEFORE UPDATE OR DELETE ON "work_reports"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_bao_cao_da_nop();
CREATE TRIGGER intern_journals_da_nop
    BEFORE UPDATE OR DELETE ON "intern_journals"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_bao_cao_da_nop();
ALTER TABLE "intern_journals" ADD CONSTRAINT "intern_journals_trang_thai_check" CHECK ("status" IN ('nhap', 'da-nop'));
ALTER TABLE "intern_journals" ADD CONSTRAINT "intern_journals_nop_check" CHECK (("status" = 'da-nop') = ("submitted_at" IS NOT NULL));

-- Đề nghị gia hạn đã quyết định thì không sửa; không bao giờ xóa (DG-05).
CREATE OR REPLACE FUNCTION public.chan_sua_gia_han_da_quyet() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' OR OLD.status <> 'cho-duyet' THEN
        RAISE EXCEPTION 'De nghi gia han da quyet dinh, khong duoc sua hoac xoa.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER task_extensions_da_quyet
    BEFORE UPDATE OR DELETE ON "task_extensions"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_gia_han_da_quyet();

-- ---------------------------------------------------------------------------
-- Bật báo cáo ngày cho Kinh doanh và Kỹ thuật (quyết định số 8 trong phương án Nhân sự, 01/11/2026).
-- ---------------------------------------------------------------------------
UPDATE "departments" SET "daily_report" = true WHERE "code" IN ('kinh-doanh', 'ky-thuat');

-- ---------------------------------------------------------------------------
-- KPI và đánh giá định kỳ (DG-50 → DG-68)
-- ---------------------------------------------------------------------------
ALTER TABLE "kpi_items" ADD CONSTRAINT "kpi_items_trong_so_check" CHECK ("weight" > 0 AND "weight" <= 100);
ALTER TABLE "kpi_items" ADD CONSTRAINT "kpi_items_nguon_check"
    CHECK (("source" = 'tu-dong' AND "metric" IS NOT NULL) OR ("source" = 'thu-cong' AND "metric" IS NULL));
ALTER TABLE "kpi_items" ADD CONSTRAINT "kpi_items_chieu_check" CHECK ("direction" IN ('cao-tot', 'thap-tot'));

ALTER TABLE "evaluation_periods" ADD CONSTRAINT "evaluation_periods_loai_check"
    CHECK (("kind" = 'thang' AND "number" BETWEEN 1 AND 12) OR ("kind" = 'quy' AND "number" BETWEEN 1 AND 4));
ALTER TABLE "evaluation_periods" ADD CONSTRAINT "evaluation_periods_trang_thai_check" CHECK ("status" IN ('mo', 'dong'));

ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_trang_thai_check"
    CHECK ("status" IN ('nhan-vien', 'quan-ly', 'cho-chot', 'da-chot'));
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_chot_check"
    CHECK ("status" <> 'da-chot' OR ("finalized_at" IS NOT NULL AND "finalized_by" IS NOT NULL
                                      AND "total_score" IS NOT NULL AND "grade" IS NOT NULL AND "bonus_coef" IS NOT NULL));
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_xep_loai_check" CHECK ("grade" IS NULL OR "grade" IN ('A', 'B', 'C', 'D'));
ALTER TABLE "evaluation_items" ADD CONSTRAINT "evaluation_items_nguon_check" CHECK ("source" IN ('tu-dong', 'thu-cong'));
ALTER TABLE "evaluation_items" ADD CONSTRAINT "evaluation_items_diem_check"
    CHECK (("self_score" IS NULL OR "self_score" BETWEEN 0 AND 200) AND ("manager_score" IS NULL OR "manager_score" BETWEEN 0 AND 200));
ALTER TABLE "evaluation_adjustments" ADD CONSTRAINT "evaluation_adjustments_ly_do_check" CHECK (length(btrim("reason")) >= 10);
ALTER TABLE "evaluation_adjustments" ADD CONSTRAINT "evaluation_adjustments_xep_loai_check" CHECK ("new_grade" IN ('A', 'B', 'C', 'D'));

-- DG-66: phiếu đã chốt bất biến — kể cả vai chủ sở hữu. Sai thì mở phiên điều chỉnh (ghi thêm).
CREATE OR REPLACE FUNCTION public.chan_sua_danh_gia_da_chot() RETURNS trigger AS $$
DECLARE
    trang_thai text;
BEGIN
    IF TG_TABLE_NAME = 'evaluations' THEN
        IF OLD.status = 'da-chot' THEN
            RAISE EXCEPTION 'Phieu danh gia da chot, khong duoc sua hoac xoa.' USING ERRCODE = 'check_violation';
        END IF;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    IF TG_TABLE_NAME = 'intern_evaluations' THEN
        IF OLD.status = 'da-chot' THEN
            RAISE EXCEPTION 'Phieu danh gia thuc tap da chot, khong duoc sua hoac xoa.' USING ERRCODE = 'check_violation';
        END IF;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    END IF;
    SELECT status INTO trang_thai FROM evaluations
     WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.evaluation_id ELSE NEW.evaluation_id END;
    IF trang_thai = 'da-chot' THEN
        RAISE EXCEPTION 'Phieu danh gia da chot, khong duoc sua hoac xoa.' USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.evaluation_id <> NEW.evaluation_id THEN
        RAISE EXCEPTION 'Khong chuyen dong chi tieu sang phieu khac.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER evaluations_da_chot
    BEFORE UPDATE OR DELETE ON "evaluations"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_danh_gia_da_chot();
CREATE TRIGGER evaluation_items_da_chot
    BEFORE INSERT OR UPDATE OR DELETE ON "evaluation_items"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_danh_gia_da_chot();
CREATE TRIGGER intern_evaluations_da_chot
    BEFORE UPDATE OR DELETE ON "intern_evaluations"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_danh_gia_da_chot();

-- ---------------------------------------------------------------------------
-- Thực tập (DG-70 → DG-76)
-- ---------------------------------------------------------------------------
ALTER TABLE "intern_journal_comments" ADD CONSTRAINT "intern_journal_comments_noi_dung_check" CHECK (length(btrim("body")) >= 2);
ALTER TABLE "intern_evaluations" ADD CONSTRAINT "intern_evaluations_trang_thai_check" CHECK ("status" IN ('nhap', 'da-chot'));
ALTER TABLE "intern_evaluations" ADD CONSTRAINT "intern_evaluations_chot_check"
    CHECK ("status" <> 'da-chot' OR ("finalized_at" IS NOT NULL AND "finalized_by" IS NOT NULL AND "total_score" IS NOT NULL));
ALTER TABLE "intern_evaluations" ADD CONSTRAINT "intern_evaluations_mentor_id_fkey"
    FOREIGN KEY ("mentor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Bảng chỉ ghi thêm (trùng prisma/rls.sql mục 3 — chạy migration trước rls.sql cũng đã an toàn).
-- ---------------------------------------------------------------------------
CREATE TRIGGER chan_sua_xoa_task_approval_logs BEFORE UPDATE OR DELETE ON "task_approval_logs"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();
CREATE TRIGGER chan_sua_xoa_task_score_adjustments BEFORE UPDATE OR DELETE ON "task_score_adjustments"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();
CREATE TRIGGER chan_sua_xoa_task_progress_logs BEFORE UPDATE OR DELETE ON "task_progress_logs"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();
CREATE TRIGGER chan_sua_xoa_work_report_comments BEFORE UPDATE OR DELETE ON "work_report_comments"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();
CREATE TRIGGER chan_sua_xoa_evaluation_adjustments BEFORE UPDATE OR DELETE ON "evaluation_adjustments"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();
CREATE TRIGGER chan_sua_xoa_intern_journal_comments BEFORE UPDATE OR DELETE ON "intern_journal_comments"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();

-- ---------------------------------------------------------------------------
-- Quyền `danh_gia.*` (QĐ-115) — cấp đúng như src/lib/vai-tro.ts cho vai trò dựng sẵn đã có.
-- Trợ lý AI KHÔNG BAO GIỜ có `danh_gia.*` (DG-80).
-- ---------------------------------------------------------------------------
INSERT INTO "permissions" ("id", "code", "module", "action", "description", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), 'danh_gia.' || a, 'danh_gia', a,
       (CASE a WHEN 'view' THEN 'Xem' WHEN 'create' THEN 'Tạo' WHEN 'update' THEN 'Sửa' WHEN 'delete' THEN 'Xóa'
               WHEN 'approve' THEN 'Duyệt' ELSE 'Xuất dữ liệu' END) || ' phân hệ Đánh giá nhân sự',
       'hoat-dong', now(), now()
FROM unnest(ARRAY['view', 'create', 'update', 'delete', 'approve', 'export']) AS a
ON CONFLICT ("code") DO NOTHING;

-- Nhân viên, thực tập sinh: xem + tự đánh giá / viết báo cáo / nhật ký của mình.
INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), r."tenant_id", r."id", p."id", 'own', 'hoat-dong', now(), now()
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('danh_gia.view', 'danh_gia.create')
WHERE r."is_built_in"
  AND r."code" IN ('sales', 'marketing', 'technical', 'purchasing', 'warehouse', 'finance', 'customer-service',
                   'marketing-intern', 'sinh-vien-thuc-tap')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Trưởng phòng: xem / chấm / chốt trong phạm vi của vai trò.
INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), r."tenant_id", r."id", p."id",
       CASE r."code" WHEN 'technical-manager' THEN 'department' ELSE 'team' END,
       'hoat-dong', now(), now()
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('danh_gia.view', 'danh_gia.create', 'danh_gia.update', 'danh_gia.approve', 'danh_gia.export')
WHERE r."is_built_in"
  AND r."code" IN ('sales-manager', 'marketing-manager', 'technical-manager', 'project-manager')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Nhân sự: xem / xuất toàn công ty (quản lý bộ KPI, kỳ, mẫu phiếu bằng `nhan_su.update`), không chốt.
INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), r."tenant_id", r."id", p."id", 'all', 'hoat-dong', now(), now()
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('danh_gia.view', 'danh_gia.create', 'danh_gia.export')
WHERE r."is_built_in" AND r."code" = 'nhan-su-hr'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Bất biến: gỡ `danh_gia.*` khỏi vai trò trợ lý AI nếu lỡ có.
DELETE FROM "role_permissions" rp USING "roles" r, "permissions" p
WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id"
  AND r."code" = 'ai-assistant' AND p."module" = 'danh_gia';
