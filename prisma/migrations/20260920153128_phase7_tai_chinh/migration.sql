-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "customer_id" UUID NOT NULL,
    "sales_order_id" UUID,
    "project_id" UUID,
    "owner_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "issue_date" DATE,
    "due_date" DATE,
    "payment_terms" VARCHAR(50),
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cost_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "issued_at" TIMESTAMPTZ(6),
    "issued_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "order_item_id" UUID,
    "product_id" UUID,
    "sku" VARCHAR(64),
    "name" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 1,
    "unit" VARCHAR(50),
    "unit_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_pct" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(7,4) NOT NULL DEFAULT 10,
    "unit_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "line_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "customer_id" UUID NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "received_at" DATE NOT NULL,
    "reference" VARCHAR(255),
    "note" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'hoat-dong',
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_tenant_id_status_due_date_idx" ON "invoices"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_customer_id_idx" ON "invoices"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_number_key" ON "invoices"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "invoice_items_tenant_id_product_id_idx" ON "invoice_items"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_items_invoice_id_line_no_key" ON "invoice_items"("invoice_id", "line_no");

-- CreateIndex
CREATE INDEX "payments_tenant_id_customer_id_received_at_idx" ON "payments"("tenant_id", "customer_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_number_key" ON "payments"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "payment_allocations_tenant_id_invoice_id_idx" ON "payment_allocations"("tenant_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_invoice_id_key" ON "payment_allocations"("payment_id", "invoice_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "sales_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ Phase 7 (BUSINESS_RULES.md mục 11). Viết tay.
-- ---------------------------------------------------------------------------

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_trang_thai_check"
    CHECK ("status" IN ('DRAFT', 'ISSUED', 'CANCELLED'));
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tien_khong_am_check"
    CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "vat_total" >= 0 AND "total" >= 0 AND "cost_total" >= 0);
-- TC-03: đã phát hành thì phải có ngày phát hành, người phát hành và hạn thanh toán.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_phat_hanh_check"
    CHECK ("status" <> 'ISSUED' OR ("issue_date" IS NOT NULL AND "issued_at" IS NOT NULL AND "issued_by" IS NOT NULL AND "due_date" IS NOT NULL));
-- TC-08: hủy hóa đơn phải có thời điểm và lý do.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_huy_check"
    CHECK ("status" <> 'CANCELLED' OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));
-- Hạn thanh toán không sớm hơn ngày phát hành.
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_han_check"
    CHECK ("issue_date" IS NULL OR "due_date" IS NULL OR "due_date" >= "issue_date");

ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_so_luong_check"
    CHECK ("quantity" > 0);
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_gia_check"
    CHECK ("unit_price" >= 0 AND "unit_cost" >= 0 AND "line_total" >= 0 AND "line_cost" >= 0);
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_ty_le_check"
    CHECK ("discount_pct" >= 0 AND "discount_pct" <= 100 AND "vat_rate" >= 0 AND "vat_rate" <= 100);
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_line_no_check"
    CHECK ("line_no" >= 1);

-- TC-04: phiếu thu luôn dương; phương thức nằm trong danh sách đã định.
ALTER TABLE "payments" ADD CONSTRAINT "payments_so_tien_check"
    CHECK ("amount" > 0);
ALTER TABLE "payments" ADD CONSTRAINT "payments_phuong_thuc_check"
    CHECK ("method" IN ('tien-mat', 'chuyen-khoan', 'the', 'bu-tru'));
ALTER TABLE "payments" ADD CONSTRAINT "payments_trang_thai_check"
    CHECK ("status" IN ('hoat-dong', 'huy'));
ALTER TABLE "payments" ADD CONSTRAINT "payments_huy_check"
    CHECK ("status" <> 'huy' OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));

-- TC-05: mỗi dòng phân bổ luôn dương.
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_so_tien_check"
    CHECK ("amount" > 0);

-- ---------------------------------------------------------------------------
-- Cấp bù quyền cho vai trò dựng sẵn ĐÃ CÓ trên máy thật (QĐ-10).
-- Phase 7 không thêm mã quyền mới (`finance.*` có từ Phase 1). Kế toán đã có đủ theo
-- định nghĩa vai trò; ở đây chỉ mở phần XEM cho Trưởng phòng Kinh doanh để họ theo được
-- công nợ của khách mình bán — không cấp quyền ghi.
-- ---------------------------------------------------------------------------
INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), r."tenant_id", r."id", p."id", 'team', 'hoat-dong', now(), now()
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('finance.view', 'finance.export')
WHERE r."code" = 'sales-manager' AND r."is_built_in"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
