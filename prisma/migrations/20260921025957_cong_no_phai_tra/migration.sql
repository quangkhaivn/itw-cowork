-- CreateTable
CREATE TABLE "supplier_bills" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "supplier_id" UUID NOT NULL,
    "purchase_order_id" UUID,
    "owner_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "supplier_doc_no" VARCHAR(100),
    "bill_date" DATE,
    "due_date" DATE,
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "recorded_at" TIMESTAMPTZ(6),
    "recorded_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "supplier_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_bill_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
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
    "line_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_bill_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "supplier_id" UUID NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "paid_at" DATE NOT NULL,
    "reference" VARCHAR(255),
    "note" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'hoat-dong',
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payment_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_bills_tenant_id_status_due_date_idx" ON "supplier_bills"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "supplier_bills_tenant_id_supplier_id_idx" ON "supplier_bills"("tenant_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_bills_tenant_id_number_key" ON "supplier_bills"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "supplier_bill_items_tenant_id_product_id_idx" ON "supplier_bill_items"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_bill_items_bill_id_line_no_key" ON "supplier_bill_items"("bill_id", "line_no");

-- CreateIndex
CREATE INDEX "supplier_payments_tenant_id_supplier_id_paid_at_idx" ON "supplier_payments"("tenant_id", "supplier_id", "paid_at");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_tenant_id_number_key" ON "supplier_payments"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "supplier_payment_allocations_tenant_id_bill_id_idx" ON "supplier_payment_allocations"("tenant_id", "bill_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payment_allocations_payment_id_bill_id_key" ON "supplier_payment_allocations"("payment_id", "bill_id");

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_items" ADD CONSTRAINT "supplier_bill_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_items" ADD CONSTRAINT "supplier_bill_items_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "supplier_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_items" ADD CONSTRAINT "supplier_bill_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bill_items" ADD CONSTRAINT "supplier_bill_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "supplier_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "supplier_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ công nợ phải trả — luật ở BUSINESS_RULES.md mục 17 (CT).
-- Đối xứng với mục 11 (hóa đơn bán ra và phiếu thu).
-- ---------------------------------------------------------------------------

ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_trang_thai_check"
    CHECK ("status" IN ('DRAFT', 'RECORDED', 'CANCELLED'));
-- CT-03: ghi nhận là lúc chốt số tiền và bắt đầu tính nợ phải trả, nên phải đủ
-- ngày hóa đơn, hạn thanh toán và người ghi nhận.
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_ghi_nhan_check"
    CHECK ("status" <> 'RECORDED'
           OR ("bill_date" IS NOT NULL AND "due_date" IS NOT NULL
               AND "recorded_at" IS NOT NULL AND "recorded_by" IS NOT NULL));
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_han_check"
    CHECK ("due_date" IS NULL OR "bill_date" IS NULL OR "due_date" >= "bill_date");
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_huy_check"
    CHECK ("status" <> 'CANCELLED' OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_tien_check"
    CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "vat_total" >= 0 AND "total" >= 0);

ALTER TABLE "supplier_bill_items" ADD CONSTRAINT "supplier_bill_items_so_luong_check"
    CHECK ("quantity" > 0);
ALTER TABLE "supplier_bill_items" ADD CONSTRAINT "supplier_bill_items_gia_check"
    CHECK ("unit_price" >= 0 AND "line_total" >= 0);
ALTER TABLE "supplier_bill_items" ADD CONSTRAINT "supplier_bill_items_ty_le_check"
    CHECK ("discount_pct" BETWEEN 0 AND 100 AND "vat_rate" BETWEEN 0 AND 100);

-- CT-05, CT-09: phiếu chi.
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_so_tien_check"
    CHECK ("amount" > 0);
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_phuong_thuc_check"
    CHECK ("method" IN ('tien-mat', 'chuyen-khoan', 'the', 'bu-tru'));
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_trang_thai_check"
    CHECK ("status" IN ('hoat-dong', 'huy'));
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_huy_check"
    CHECK ("status" <> 'huy' OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));

ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_so_tien_check"
    CHECK ("amount" > 0);

-- ---------------------------------------------------------------------------
-- Không thêm mã quyền mới: công nợ phải trả dùng `finance.*` như công nợ phải thu,
-- và vai trò Kế toán – Tài chính đã cầm đủ từ Phase 1.
-- Không cấp bù cho ai — mọi thay đổi quyền ở đây phải khớp `src/lib/vai-tro.ts` (QĐ-37).
-- ---------------------------------------------------------------------------
