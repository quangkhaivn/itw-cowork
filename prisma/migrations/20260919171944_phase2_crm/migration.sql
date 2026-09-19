-- Phase 2 — CRM (20/09/2026). Chỉ THÊM bảng; không sửa, không xóa dữ liệu Phase 1.

-- pg_trgm: dò tên khách gần giống và tăng tốc tìm kiếm chứa chuỗi. Là extension "trusted"
-- từ PostgreSQL 13, có sẵn trong ảnh postgres:16 chính thức.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "doc_type" VARCHAR(30) NOT NULL,
    "period" VARCHAR(10) NOT NULL DEFAULT '',
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "name_normalized" VARCHAR(255) NOT NULL,
    "tax_code" VARCHAR(30),
    "tax_code_normalized" VARCHAR(20),
    "customer_type" VARCHAR(50),
    "segment" VARCHAR(50),
    "industry" VARCHAR(50),
    "source" VARCHAR(50),
    "address" TEXT,
    "province" VARCHAR(100),
    "website" VARCHAR(255),
    "phone" VARCHAR(30),
    "phone_normalized" VARCHAR(20),
    "email" VARCHAR(255),
    "email_normalized" VARCHAR(255),
    "owner_id" UUID NOT NULL,
    "note" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'tiem-nang',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255),
    "department" VARCHAR(255),
    "phone" VARCHAR(30),
    "phone_normalized" VARCHAR(20),
    "email" VARCHAR(255),
    "email_normalized" VARCHAR(255),
    "zalo" VARCHAR(50),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "company_name" VARCHAR(255),
    "title" VARCHAR(255),
    "phone" VARCHAR(30),
    "phone_normalized" VARCHAR(20),
    "email" VARCHAR(255),
    "email_normalized" VARCHAR(255),
    "tax_code" VARCHAR(30),
    "tax_code_normalized" VARCHAR(20),
    "source" VARCHAR(50),
    "need" TEXT,
    "estimated_value" DECIMAL(18,2),
    "stage" VARCHAR(20) NOT NULL DEFAULT 'NEW_LEAD',
    "owner_id" UUID NOT NULL,
    "disqualified_reason" TEXT,
    "converted_customer_id" UUID,
    "converted_opportunity_id" UUID,
    "converted_at" TIMESTAMPTZ(6),
    "raw_payload" JSONB,
    "note" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "customer_id" UUID,
    "contact_id" UUID,
    "lead_id" UUID,
    "opportunity_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subject" VARCHAR(255) NOT NULL,
    "content" TEXT,
    "outcome" VARCHAR(255),
    "owner_id" UUID NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "customer_id" UUID NOT NULL,
    "contact_id" UUID,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "estimated_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 10,
    "expected_close_date" DATE,
    "owner_id" UUID NOT NULL,
    "source" VARCHAR(50),
    "stage" VARCHAR(20) NOT NULL DEFAULT 'OPPORTUNITY',
    "next_action" VARCHAR(255),
    "next_action_date" DATE,
    "lost_reason" VARCHAR(50),
    "lost_note" TEXT,
    "competitor" VARCHAR(255),
    "closed_at" TIMESTAMPTZ(6),
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "owner_id" UUID NOT NULL,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'trung-binh',
    "due_at" TIMESTAMPTZ(6),
    "status" VARCHAR(20) NOT NULL DEFAULT 'mo',
    "completed_at" TIMESTAMPTZ(6),
    "customer_id" UUID,
    "lead_id" UUID,
    "opportunity_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_tenant_id_doc_type_period_key" ON "document_sequences"("tenant_id", "doc_type", "period");

-- CreateIndex
CREATE INDEX "customers_tenant_id_owner_id_idx" ON "customers"("tenant_id", "owner_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_phone_normalized_idx" ON "customers"("tenant_id", "phone_normalized");

-- CreateIndex
CREATE INDEX "customers_tenant_id_email_normalized_idx" ON "customers"("tenant_id", "email_normalized");

-- CreateIndex
CREATE INDEX "customers_tenant_id_status_idx" ON "customers"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "customers_name_normalized_trgm_idx" ON "customers" USING GIN ("name_normalized" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_code_key" ON "customers"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_tax_code_normalized_key" ON "customers"("tenant_id", "tax_code_normalized");

-- CreateIndex
CREATE INDEX "contacts_tenant_id_customer_id_idx" ON "contacts"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "contacts_tenant_id_phone_normalized_idx" ON "contacts"("tenant_id", "phone_normalized");

-- CreateIndex
CREATE INDEX "contacts_tenant_id_email_normalized_idx" ON "contacts"("tenant_id", "email_normalized");

-- CreateIndex
CREATE INDEX "leads_tenant_id_owner_id_idx" ON "leads"("tenant_id", "owner_id");

-- CreateIndex
CREATE INDEX "leads_tenant_id_stage_idx" ON "leads"("tenant_id", "stage");

-- CreateIndex
CREATE INDEX "leads_tenant_id_phone_normalized_idx" ON "leads"("tenant_id", "phone_normalized");

-- CreateIndex
CREATE INDEX "leads_tenant_id_email_normalized_idx" ON "leads"("tenant_id", "email_normalized");

-- CreateIndex
CREATE INDEX "leads_tenant_id_tax_code_normalized_idx" ON "leads"("tenant_id", "tax_code_normalized");

-- CreateIndex
CREATE UNIQUE INDEX "leads_tenant_id_code_key" ON "leads"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "interactions_tenant_id_customer_id_occurred_at_idx" ON "interactions"("tenant_id", "customer_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "interactions_tenant_id_lead_id_occurred_at_idx" ON "interactions"("tenant_id", "lead_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "interactions_tenant_id_opportunity_id_occurred_at_idx" ON "interactions"("tenant_id", "opportunity_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "interactions_tenant_id_owner_id_occurred_at_idx" ON "interactions"("tenant_id", "owner_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "opportunities_tenant_id_owner_id_stage_idx" ON "opportunities"("tenant_id", "owner_id", "stage");

-- CreateIndex
CREATE INDEX "opportunities_tenant_id_customer_id_idx" ON "opportunities"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "opportunities_tenant_id_stage_next_action_date_idx" ON "opportunities"("tenant_id", "stage", "next_action_date");

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_tenant_id_code_key" ON "opportunities"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "tasks_tenant_id_owner_id_status_due_at_idx" ON "tasks"("tenant_id", "owner_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "tasks_tenant_id_customer_id_idx" ON "tasks"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "tasks_tenant_id_opportunity_id_idx" ON "tasks"("tenant_id", "opportunity_id");

-- CreateIndex
CREATE INDEX "tasks_tenant_id_lead_id_idx" ON "tasks"("tenant_id", "lead_id");

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_customer_id_fkey" FOREIGN KEY ("converted_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_converted_opportunity_id_fkey" FOREIGN KEY ("converted_opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===========================================================================
-- Viết tay: ràng buộc nghiệp vụ mà Prisma không biểu diễn được.
-- Luật tương ứng ở BUSINESS_RULES.md mục 3. Chặn ở CSDL để không đường nào
-- (giao diện, API, worker, AI, script) lách được.
-- ===========================================================================

ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_last_number_check"
    CHECK ("last_number" >= 0);

-- KH: trạng thái; MST chuẩn hóa chỉ gồm 10 hoặc 13 chữ số.
ALTER TABLE "customers" ADD CONSTRAINT "customers_status_check"
    CHECK ("status" IN ('tiem-nang', 'dang-giao-dich', 'ngung-giao-dich'));
ALTER TABLE "customers" ADD CONSTRAINT "customers_tax_code_normalized_check"
    CHECK ("tax_code_normalized" IS NULL OR "tax_code_normalized" ~ '^([0-9]{10}|[0-9]{13})$');

ALTER TABLE "contacts" ADD CONSTRAINT "contacts_status_check"
    CHECK ("status" IN ('hoat-dong', 'ngung-hoat-dong'));

-- LD-01, LD-02: giai đoạn hợp lệ; phải có ít nhất một cách liên lạc;
-- loại lead phải có lý do; lead đã chuyển đổi phải trỏ sang khách hàng.
ALTER TABLE "leads" ADD CONSTRAINT "leads_stage_check"
    CHECK ("stage" IN ('NEW_LEAD', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED'));
ALTER TABLE "leads" ADD CONSTRAINT "leads_co_lien_lac_check"
    CHECK ("phone_normalized" IS NOT NULL OR "email_normalized" IS NOT NULL);
ALTER TABLE "leads" ADD CONSTRAINT "leads_loai_co_ly_do_check"
    CHECK ("stage" <> 'DISQUALIFIED' OR "disqualified_reason" IS NOT NULL);
ALTER TABLE "leads" ADD CONSTRAINT "leads_chuyen_doi_co_khach_check"
    CHECK ("stage" <> 'CONVERTED' OR ("converted_customer_id" IS NOT NULL AND "converted_at" IS NOT NULL));
ALTER TABLE "leads" ADD CONSTRAINT "leads_estimated_value_check"
    CHECK ("estimated_value" IS NULL OR "estimated_value" >= 0);

-- TT-01, TT-02
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_type_check"
    CHECK ("type" IN ('call', 'email', 'zalo', 'meeting', 'visit', 'note'));
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_gan_khach_hoac_lead_check"
    CHECK ("customer_id" IS NOT NULL OR "lead_id" IS NOT NULL);

-- CH-01..CH-04. CH-02 là luật mục 7 prompt: cơ hội đang mở phải có
-- Owner + Next Action + Next Action Date (owner_id đã NOT NULL ở cột).
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stage_check"
    CHECK ("stage" IN ('OPPORTUNITY', 'QUOTATION', 'NEGOTIATION', 'WON', 'LOST'));
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_dang_mo_co_hanh_dong_check"
    CHECK ("stage" IN ('WON', 'LOST') OR (
        "next_action" IS NOT NULL AND btrim("next_action") <> '' AND "next_action_date" IS NOT NULL));
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_thua_co_ly_do_check"
    CHECK ("stage" <> 'LOST' OR "lost_reason" IS NOT NULL);
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_dong_co_thoi_diem_check"
    CHECK ("stage" NOT IN ('WON', 'LOST') OR "closed_at" IS NOT NULL);
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_probability_check"
    CHECK ("probability" BETWEEN 0 AND 100);
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_estimated_value_check"
    CHECK ("estimated_value" >= 0);

-- CV-01
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_check"
    CHECK ("status" IN ('mo', 'dang-lam', 'xong', 'huy'));
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_priority_check"
    CHECK ("priority" IN ('thap', 'trung-binh', 'cao', 'khan'));
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_xong_co_thoi_diem_check"
    CHECK ("status" <> 'xong' OR "completed_at" IS NOT NULL);

-- Cấp bù quyền mở lại cơ hội (CH-06) cho vai trò dựng sẵn "Trưởng phòng Kinh doanh".
-- Seed không cấp lại mã quyền đã có từ trước cho vai trò đã tồn tại (QĐ-10), nên phải làm ở đây.
-- Chạy đúng một lần cùng migration; Giám đốc gỡ trên giao diện thì không bị cấp lại.
INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), r."tenant_id", r."id", p."id", 'team', 'hoat-dong', now(), now()
FROM "roles" r
JOIN "permissions" p ON p."code" = 'sales.approve'
WHERE r."code" = 'sales-manager' AND r."is_built_in"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
