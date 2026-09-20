-- CreateTable
CREATE TABLE "quotations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "customer_id" UUID NOT NULL,
    "contact_id" UUID,
    "opportunity_id" UUID,
    "owner_id" UUID NOT NULL,
    "current_version_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_versions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "payment_terms" VARCHAR(50),
    "delivery_terms" VARCHAR(50),
    "warranty_terms" TEXT,
    "valid_until" DATE,
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cost_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gross_profit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gross_margin" DECIMAL(7,4),
    "sent_at" TIMESTAMPTZ(6),
    "decided_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "quotation_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_id" UUID,
    "sku" VARCHAR(64),
    "name" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 1,
    "unit" VARCHAR(50),
    "unit_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_pct" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(7,4) NOT NULL DEFAULT 10,
    "unit_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "supplier_id" UUID,
    "line_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "line_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_approvals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "required_reason" VARCHAR(40) NOT NULL,
    "margin_at_request" DECIMAL(7,4),
    "threshold_at_request" DECIMAL(7,4),
    "requested_by" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by" UUID,
    "decision" VARCHAR(20),
    "decided_at" TIMESTAMPTZ(6),
    "comment" TEXT,

    CONSTRAINT "quotation_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotations_current_version_id_key" ON "quotations"("current_version_id");

-- CreateIndex
CREATE INDEX "quotations_tenant_id_owner_id_status_idx" ON "quotations"("tenant_id", "owner_id", "status");

-- CreateIndex
CREATE INDEX "quotations_tenant_id_customer_id_idx" ON "quotations"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "quotations_tenant_id_status_idx" ON "quotations"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_tenant_id_number_key" ON "quotations"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "quotation_versions_tenant_id_status_idx" ON "quotation_versions"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_versions_quotation_id_version_no_key" ON "quotation_versions"("quotation_id", "version_no");

-- CreateIndex
CREATE INDEX "quotation_items_tenant_id_product_id_idx" ON "quotation_items"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotation_items_version_id_line_no_key" ON "quotation_items"("version_id", "line_no");

-- CreateIndex
CREATE INDEX "quotation_approvals_tenant_id_decision_idx" ON "quotation_approvals"("tenant_id", "decision");

-- CreateIndex
CREATE INDEX "quotation_approvals_version_id_idx" ON "quotation_approvals"("version_id");

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "quotation_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "quotation_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_approvals" ADD CONSTRAINT "quotation_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_approvals" ADD CONSTRAINT "quotation_approvals_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "quotation_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Viết tay: luật nghiệp vụ báo giá (BUSINESS_RULES.md mục 5).
-- ===========================================================================

ALTER TABLE "quotations" ADD CONSTRAINT "quotations_status_check"
    CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'VIEWED', 'NEGOTIATING', 'ACCEPTED', 'REJECTED', 'EXPIRED'));

ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_status_check"
    CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'VIEWED', 'NEGOTIATING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'SUPERSEDED'));
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_version_no_check"
    CHECK ("version_no" >= 1);
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_tien_khong_am_check"
    CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "vat_total" >= 0 AND "total" >= 0 AND "cost_total" >= 0);
-- BG-04: đã gửi thì phải có thời điểm gửi.
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_da_gui_co_thoi_diem_check"
    CHECK ("status" NOT IN ('SENT', 'VIEWED', 'NEGOTIATING', 'ACCEPTED', 'REJECTED') OR "sent_at" IS NOT NULL);
-- BG-06: chốt (khách nhận hoặc từ chối) thì phải có thời điểm chốt.
ALTER TABLE "quotation_versions" ADD CONSTRAINT "quotation_versions_chot_co_thoi_diem_check"
    CHECK ("status" NOT IN ('ACCEPTED', 'REJECTED') OR "decided_at" IS NOT NULL);

ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_so_luong_check"
    CHECK ("quantity" > 0);
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_gia_check"
    CHECK ("unit_price" >= 0 AND "unit_cost" >= 0 AND "line_total" >= 0 AND "line_cost" >= 0);
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_ty_le_check"
    CHECK ("discount_pct" >= 0 AND "discount_pct" <= 100 AND "vat_rate" >= 0 AND "vat_rate" <= 100);
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_line_no_check"
    CHECK ("line_no" >= 1);

ALTER TABLE "quotation_approvals" ADD CONSTRAINT "quotation_approvals_reason_check"
    CHECK ("required_reason" IN ('margin_below_threshold', 'threshold_not_set', 'manual'));
ALTER TABLE "quotation_approvals" ADD CONSTRAINT "quotation_approvals_decision_check"
    CHECK ("decision" IS NULL OR "decision" IN ('cho-duyet', 'tu-choi'));
-- Đã quyết thì phải biết ai quyết và lúc nào.
ALTER TABLE "quotation_approvals" ADD CONSTRAINT "quotation_approvals_da_quyet_check"
    CHECK ("decision" IS NULL OR ("decided_by" IS NOT NULL AND "decided_at" IS NOT NULL));
