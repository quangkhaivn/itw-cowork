-- CreateTable
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "parent_id" UUID,
    "requires_serial" BOOLEAN NOT NULL DEFAULT false,
    "default_warranty_months" INTEGER,
    "default_vat_rate" DECIMAL(7,4),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "website" VARCHAR(255),
    "note" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "name_normalized" VARCHAR(255) NOT NULL,
    "tax_code" VARCHAR(30),
    "tax_code_normalized" VARCHAR(20),
    "contact_name" VARCHAR(255),
    "phone" VARCHAR(30),
    "phone_normalized" VARCHAR(20),
    "email" VARCHAR(255),
    "email_normalized" VARCHAR(255),
    "address" TEXT,
    "website" VARCHAR(255),
    "payment_terms" VARCHAR(50),
    "lead_time_days" INTEGER,
    "note" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sku" VARCHAR(64) NOT NULL,
    "sku_normalized" VARCHAR(64) NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "name_normalized" VARCHAR(500) NOT NULL,
    "category_id" UUID,
    "brand_id" UUID,
    "model" VARCHAR(255),
    "description" TEXT,
    "specifications" JSONB,
    "unit" VARCHAR(50),
    "cost_price" DECIMAL(18,2),
    "selling_price" DECIMAL(18,2),
    "vat_rate" DECIMAL(7,4) NOT NULL DEFAULT 10,
    "warranty_months" INTEGER,
    "requires_serial" BOOLEAN NOT NULL DEFAULT false,
    "default_supplier_id" UUID,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_product_prices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "purchase_price" DECIMAL(18,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "availability" VARCHAR(20) NOT NULL DEFAULT 'khong-ro',
    "lead_time_days" INTEGER,
    "reference" VARCHAR(255),
    "note" TEXT,
    "valid_from" DATE,
    "valid_to" DATE,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "supplier_product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "price_type" VARCHAR(20) NOT NULL,
    "supplier_id" UUID,
    "old_price" DECIMAL(18,2),
    "new_price" DECIMAL(18,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
    "reason" VARCHAR(255),
    "source" VARCHAR(20) NOT NULL DEFAULT 'thu-cong',
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'xem-truoc',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "ok_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "created_rows" INTEGER NOT NULL DEFAULT 0,
    "updated_rows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_categories_tenant_id_status_idx" ON "product_categories"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_tenant_id_code_key" ON "product_categories"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "brands_tenant_id_code_key" ON "brands"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_status_idx" ON "suppliers"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "suppliers_name_normalized_trgm_idx" ON "suppliers" USING GIN ("name_normalized" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_code_key" ON "suppliers"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_tax_code_normalized_key" ON "suppliers"("tenant_id", "tax_code_normalized");

-- CreateIndex
CREATE INDEX "products_tenant_id_status_idx" ON "products"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "products_tenant_id_category_id_idx" ON "products"("tenant_id", "category_id");

-- CreateIndex
CREATE INDEX "products_tenant_id_brand_id_idx" ON "products"("tenant_id", "brand_id");

-- CreateIndex
CREATE INDEX "products_name_normalized_trgm_idx" ON "products" USING GIN ("name_normalized" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "products_sku_normalized_trgm_idx" ON "products" USING GIN ("sku_normalized" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_normalized_key" ON "products"("tenant_id", "sku_normalized");

-- CreateIndex
CREATE INDEX "supplier_product_prices_tenant_id_supplier_id_idx" ON "supplier_product_prices"("tenant_id", "supplier_id");

-- CreateIndex
CREATE INDEX "supplier_product_prices_tenant_id_product_id_purchase_price_idx" ON "supplier_product_prices"("tenant_id", "product_id", "purchase_price");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_product_prices_tenant_id_product_id_supplier_id_key" ON "supplier_product_prices"("tenant_id", "product_id", "supplier_id");

-- CreateIndex
CREATE INDEX "price_history_tenant_id_product_id_changed_at_idx" ON "price_history"("tenant_id", "product_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "price_history_tenant_id_supplier_id_changed_at_idx" ON "price_history"("tenant_id", "supplier_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "import_jobs_tenant_id_created_at_idx" ON "import_jobs"("tenant_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brands" ADD CONSTRAINT "brands_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_fkey" FOREIGN KEY ("brand_id") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_default_supplier_id_fkey" FOREIGN KEY ("default_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_prices" ADD CONSTRAINT "supplier_product_prices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_prices" ADD CONSTRAINT "supplier_product_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_product_prices" ADD CONSTRAINT "supplier_product_prices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Viết tay: ràng buộc nghiệp vụ và lịch sử giá chỉ-ghi-thêm.
-- Luật ở BUSINESS_RULES.md mục 5.
-- ===========================================================================

ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_status_check"
    CHECK ("status" IN ('hoat-dong', 'ngung-hoat-dong'));
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_parent_khac_ban_than_check"
    CHECK ("parent_id" IS NULL OR "parent_id" <> "id");
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_vat_check"
    CHECK ("default_vat_rate" IS NULL OR ("default_vat_rate" >= 0 AND "default_vat_rate" <= 100));
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_bao_hanh_check"
    CHECK ("default_warranty_months" IS NULL OR "default_warranty_months" >= 0);

ALTER TABLE "brands" ADD CONSTRAINT "brands_status_check"
    CHECK ("status" IN ('hoat-dong', 'ngung-hoat-dong'));

ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_status_check"
    CHECK ("status" IN ('hoat-dong', 'ngung-hoat-dong'));
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tax_code_normalized_check"
    CHECK ("tax_code_normalized" IS NULL OR "tax_code_normalized" ~ '^([0-9]{10}|[0-9]{13})$');
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_lead_time_check"
    CHECK ("lead_time_days" IS NULL OR "lead_time_days" >= 0);

-- SP-01..SP-04: giá không âm, VAT 0–100, bảo hành không âm, SKU chuẩn hóa không rỗng.
ALTER TABLE "products" ADD CONSTRAINT "products_status_check"
    CHECK ("status" IN ('hoat-dong', 'ngung-kinh-doanh'));
ALTER TABLE "products" ADD CONSTRAINT "products_gia_khong_am_check"
    CHECK (("cost_price" IS NULL OR "cost_price" >= 0) AND ("selling_price" IS NULL OR "selling_price" >= 0));
ALTER TABLE "products" ADD CONSTRAINT "products_vat_check"
    CHECK ("vat_rate" >= 0 AND "vat_rate" <= 100);
ALTER TABLE "products" ADD CONSTRAINT "products_bao_hanh_check"
    CHECK ("warranty_months" IS NULL OR "warranty_months" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_sku_khong_rong_check"
    CHECK (btrim("sku_normalized") <> '');

ALTER TABLE "supplier_product_prices" ADD CONSTRAINT "supplier_product_prices_gia_check"
    CHECK ("purchase_price" >= 0);
ALTER TABLE "supplier_product_prices" ADD CONSTRAINT "supplier_product_prices_availability_check"
    CHECK ("availability" IN ('con-hang', 'het-hang', 'dat-truoc', 'khong-ro'));
ALTER TABLE "supplier_product_prices" ADD CONSTRAINT "supplier_product_prices_lead_time_check"
    CHECK ("lead_time_days" IS NULL OR "lead_time_days" >= 0);
ALTER TABLE "supplier_product_prices" ADD CONSTRAINT "supplier_product_prices_hieu_luc_check"
    CHECK ("valid_from" IS NULL OR "valid_to" IS NULL OR "valid_to" >= "valid_from");

ALTER TABLE "price_history" ADD CONSTRAINT "price_history_price_type_check"
    CHECK ("price_type" IN ('cost', 'selling', 'supplier'));
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_gia_khong_am_check"
    CHECK (("old_price" IS NULL OR "old_price" >= 0) AND ("new_price" IS NULL OR "new_price" >= 0));
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_co_thay_doi_check"
    CHECK ("old_price" IS DISTINCT FROM "new_price");
-- Giá nhà cung cấp phải nói rõ của nhà cung cấp nào.
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_supplier_check"
    CHECK ("price_type" <> 'supplier' OR "supplier_id" IS NOT NULL);

ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_status_check"
    CHECK ("status" IN ('xem-truoc', 'da-nhap', 'that-bai'));
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_so_dong_check"
    CHECK ("total_rows" >= 0 AND "ok_rows" >= 0 AND "error_rows" >= 0 AND "created_rows" >= 0 AND "updated_rows" >= 0);

-- SP-08: lịch sử giá chỉ ghi thêm. Dùng lại hàm chan_sua_xoa() của migration nền móng,
-- nên kể cả vai chủ sở hữu cũng không sửa được lịch sử giá.
DROP TRIGGER IF EXISTS chan_sua_price_history ON "price_history";
CREATE TRIGGER chan_sua_price_history
    BEFORE UPDATE OR DELETE ON "price_history"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();
