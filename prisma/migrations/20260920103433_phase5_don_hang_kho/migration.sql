-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" TEXT,
    "note" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "customer_id" UUID NOT NULL,
    "contact_id" UUID,
    "quotation_id" UUID,
    "quotation_version_id" UUID,
    "opportunity_id" UUID,
    "owner_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "order_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_date" DATE,
    "delivery_address" TEXT,
    "payment_terms" VARCHAR(50),
    "delivery_terms" VARCHAR(50),
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cost_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gross_profit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gross_margin" DECIMAL(7,4),
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_by" UUID,
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "sales_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_order_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_id" UUID,
    "quotation_item_id" UUID,
    "sku" VARCHAR(64),
    "name" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 1,
    "delivered_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unit" VARCHAR(50),
    "unit_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_pct" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(7,4) NOT NULL DEFAULT 10,
    "unit_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "line_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sales_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_balances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "on_hand" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "on_hand_delta" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "reserved_delta" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "on_hand_after" DECIMAL(18,3) NOT NULL,
    "reserved_after" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,2),
    "ref_type" VARCHAR(30),
    "ref_id" UUID,
    "ref_number" VARCHAR(30),
    "reason" VARCHAR(100),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "order_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "delivered_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receiver_name" VARCHAR(255),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "product_id" UUID,
    "quantity" DECIMAL(18,3) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "serial_numbers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "serial" VARCHAR(100) NOT NULL,
    "warehouse_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'trong-kho',
    "sales_order_item_id" UUID,
    "delivery_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "serial_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "warehouses_tenant_id_status_idx" ON "warehouses"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenant_id_code_key" ON "warehouses"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "sales_orders_tenant_id_owner_id_status_idx" ON "sales_orders"("tenant_id", "owner_id", "status");

-- CreateIndex
CREATE INDEX "sales_orders_tenant_id_customer_id_idx" ON "sales_orders"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "sales_orders_tenant_id_status_idx" ON "sales_orders"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sales_orders_tenant_id_number_key" ON "sales_orders"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "sales_order_items_tenant_id_product_id_idx" ON "sales_order_items"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_order_items_order_id_line_no_key" ON "sales_order_items"("order_id", "line_no");

-- CreateIndex
CREATE INDEX "inventory_balances_tenant_id_product_id_idx" ON "inventory_balances"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_balances_tenant_id_warehouse_id_product_id_key" ON "inventory_balances"("tenant_id", "warehouse_id", "product_id");

-- CreateIndex
CREATE INDEX "inventory_transactions_tenant_id_product_id_created_at_idx" ON "inventory_transactions"("tenant_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transactions_tenant_id_warehouse_id_created_at_idx" ON "inventory_transactions"("tenant_id", "warehouse_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_transactions_tenant_id_ref_type_ref_id_idx" ON "inventory_transactions"("tenant_id", "ref_type", "ref_id");

-- CreateIndex
CREATE INDEX "deliveries_tenant_id_order_id_idx" ON "deliveries"("tenant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_tenant_id_number_key" ON "deliveries"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "delivery_items_tenant_id_delivery_id_idx" ON "delivery_items"("tenant_id", "delivery_id");

-- CreateIndex
CREATE INDEX "serial_numbers_tenant_id_status_idx" ON "serial_numbers"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "serial_numbers_tenant_id_warehouse_id_idx" ON "serial_numbers"("tenant_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "serial_numbers_tenant_id_product_id_serial_key" ON "serial_numbers"("tenant_id", "product_id", "serial");

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_quotation_version_id_fkey" FOREIGN KEY ("quotation_version_id") REFERENCES "quotation_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_quotation_item_id_fkey" FOREIGN KEY ("quotation_item_id") REFERENCES "quotation_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "sales_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "sales_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_sales_order_item_id_fkey" FOREIGN KEY ("sales_order_item_id") REFERENCES "sales_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hàng có theo dõi tồn kho không. Dịch vụ / công lắp đặt thì không — đặt theo nhóm hàng.
ALTER TABLE "products" ADD COLUMN "quan_ly_ton" BOOLEAN NOT NULL DEFAULT true;
UPDATE "products" SET "quan_ly_ton" = false
WHERE "category_id" IN (SELECT "id" FROM "product_categories" WHERE "code" = 'dich-vu');

-- Mức tồn tối thiểu để cảnh báo sắp hết hàng (Phase 5). Chỉ thêm cột, mặc định NULL.
ALTER TABLE "products" ADD COLUMN "min_stock" DECIMAL(18,3);
ALTER TABLE "products" ADD CONSTRAINT "products_min_stock_check"
    CHECK ("min_stock" IS NULL OR "min_stock" >= 0);

-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ Phase 5 (BUSINESS_RULES.md mục 6). Viết tay, không do Prisma sinh.
-- Luật quan trọng phải nằm ở CSDL: mã ứng dụng có thể quên, CSDL thì không.
-- ---------------------------------------------------------------------------

-- DH-02: trạng thái đơn nằm trong danh sách đã định.
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_trang_thai_check"
    CHECK ("status" IN ('DRAFT', 'CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'));
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_tien_khong_am_check"
    CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "vat_total" >= 0 AND "total" >= 0 AND "cost_total" >= 0);
-- DH-03: đã xác nhận thì phải biết ai xác nhận và lúc nào.
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_xac_nhan_check"
    CHECK ("status" = 'DRAFT' OR "status" = 'CANCELLED' OR ("confirmed_at" IS NOT NULL AND "confirmed_by" IS NOT NULL));
-- DH-07: đã hủy thì phải có thời điểm và lý do.
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_huy_check"
    CHECK ("status" <> 'CANCELLED' OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));

ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_so_luong_check"
    CHECK ("quantity" > 0);
-- DH-05: không giao quá số lượng đặt, và số đã giao không âm.
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_da_giao_check"
    CHECK ("delivered_qty" >= 0 AND "delivered_qty" <= "quantity");
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_gia_check"
    CHECK ("unit_price" >= 0 AND "unit_cost" >= 0 AND "line_total" >= 0 AND "line_cost" >= 0);
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_ty_le_check"
    CHECK ("discount_pct" >= 0 AND "discount_pct" <= 100 AND "vat_rate" >= 0 AND "vat_rate" <= 100);
ALTER TABLE "sales_order_items" ADD CONSTRAINT "sales_order_items_line_no_check"
    CHECK ("line_no" >= 1);

-- KHO-02: tồn kho và hàng giữ chỗ không bao giờ âm; không giữ chỗ nhiều hơn hàng đang có.
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_khong_am_check"
    CHECK ("on_hand" >= 0 AND "reserved" >= 0);
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_giu_cho_check"
    CHECK ("reserved" <= "on_hand");

ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_loai_check"
    CHECK ("type" IN ('nhap', 'xuat', 'giu-cho', 'nha-giu-cho', 'dieu-chinh'));
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_so_luong_check"
    CHECK ("quantity" > 0);
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_so_du_sau_check"
    CHECK ("on_hand_after" >= 0 AND "reserved_after" >= 0);

ALTER TABLE "delivery_items" ADD CONSTRAINT "delivery_items_so_luong_check"
    CHECK ("quantity" > 0);

ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_trang_thai_check"
    CHECK ("status" IN ('trong-kho', 'da-ban', 'tra-lai'));
-- KHO-05: sê-ri còn trong kho thì phải biết nằm ở kho nào; đã bán thì phải gắn với dòng đơn.
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_vi_tri_check"
    CHECK (("status" = 'trong-kho' AND "warehouse_id" IS NOT NULL) OR "status" <> 'trong-kho');
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_da_ban_check"
    CHECK ("status" <> 'da-ban' OR "sales_order_item_id" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- KHO-01: `inventory_transactions` là sổ cái CHỈ GHI THÊM.
-- Dùng lại hàm chan_sua_xoa() đã có từ Phase 3 (price_history).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chan_sua_xoa() RETURNS trigger AS $CHAN$
BEGIN
    RAISE EXCEPTION 'Bang % chi duoc ghi them, khong duoc sua hay xoa', TG_TABLE_NAME;
END;
$CHAN$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chan_sua_inventory_transactions ON public.inventory_transactions;
CREATE TRIGGER chan_sua_inventory_transactions
    BEFORE UPDATE OR DELETE ON public.inventory_transactions
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();

-- ---------------------------------------------------------------------------
-- Cấp bù quyền cho vai trò dựng sẵn ĐÃ CÓ trên máy thật (QĐ-10: seed chỉ cấp mã quyền MỚI).
-- Phase 5 không thêm mã quyền mới — `order.*` và `inventory.*` đã có từ Phase 1 — nên các
-- vai trò đã tồn tại sẽ không tự có quyền Phase 5 cần. Cấp đúng phần cần, không cấp lại
-- nếu Giám đốc đã gỡ (ON CONFLICT DO NOTHING chỉ chặn trùng, nên chỉ chạy đúng một lần).
--   · Thủ kho: inventory.create/update/export + order.view — người thật làm nhập, xuất kho.
--   · Trưởng phòng Kinh doanh: đã có order.* theo định nghĩa vai trò; không cần cấp bù.
-- ---------------------------------------------------------------------------
INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), r."tenant_id", r."id", p."id", 'all', 'hoat-dong', now(), now()
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('inventory.create', 'inventory.update', 'inventory.export', 'order.view')
WHERE r."code" = 'warehouse' AND r."is_built_in"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
