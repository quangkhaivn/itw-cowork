-- AlterTable
ALTER TABLE "serial_numbers" ADD COLUMN     "sales_return_item_id" UUID;

-- CreateTable
CREATE TABLE "sales_returns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "customer_id" UUID NOT NULL,
    "sales_order_id" UUID,
    "delivery_id" UUID,
    "warehouse_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'tra-hang',
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "return_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_by" UUID,
    "settled_at" TIMESTAMPTZ(6),
    "settled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "sales_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "order_item_id" UUID,
    "product_id" UUID,
    "sku" VARCHAR(64),
    "name" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 1,
    "unit" VARCHAR(50),
    "unit_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(7,4) NOT NULL DEFAULT 10,
    "line_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "condition" VARCHAR(20) NOT NULL DEFAULT 'con-tot',
    "restock" BOOLEAN NOT NULL DEFAULT true,
    "replacement_product_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_return_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_return_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_returns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "supplier_id" UUID NOT NULL,
    "purchase_order_id" UUID,
    "warehouse_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "return_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "confirmed_at" TIMESTAMPTZ(6),
    "confirmed_by" UUID,
    "settled_at" TIMESTAMPTZ(6),
    "settled_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "order_item_id" UUID,
    "product_id" UUID,
    "sku" VARCHAR(64),
    "name" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL DEFAULT 1,
    "unit" VARCHAR(50),
    "unit_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(7,4) NOT NULL DEFAULT 10,
    "line_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_return_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_returns_tenant_id_status_return_date_idx" ON "sales_returns"("tenant_id", "status", "return_date");

-- CreateIndex
CREATE INDEX "sales_returns_tenant_id_customer_id_idx" ON "sales_returns"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_returns_tenant_id_number_key" ON "sales_returns"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "sales_return_items_tenant_id_product_id_idx" ON "sales_return_items"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "sales_return_items_tenant_id_order_item_id_idx" ON "sales_return_items"("tenant_id", "order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_return_items_return_id_line_no_key" ON "sales_return_items"("return_id", "line_no");

-- CreateIndex
CREATE INDEX "sales_return_allocations_tenant_id_invoice_id_idx" ON "sales_return_allocations"("tenant_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_return_allocations_return_id_invoice_id_key" ON "sales_return_allocations"("return_id", "invoice_id");

-- CreateIndex
CREATE INDEX "purchase_returns_tenant_id_status_return_date_idx" ON "purchase_returns"("tenant_id", "status", "return_date");

-- CreateIndex
CREATE INDEX "purchase_returns_tenant_id_supplier_id_idx" ON "purchase_returns"("tenant_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_returns_tenant_id_number_key" ON "purchase_returns"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "purchase_return_items_tenant_id_product_id_idx" ON "purchase_return_items"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "purchase_return_items_tenant_id_order_item_id_idx" ON "purchase_return_items"("tenant_id", "order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_return_items_return_id_line_no_key" ON "purchase_return_items"("return_id", "line_no");

-- CreateIndex
CREATE INDEX "purchase_return_allocations_tenant_id_bill_id_idx" ON "purchase_return_allocations"("tenant_id", "bill_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_return_allocations_return_id_bill_id_key" ON "purchase_return_allocations"("return_id", "bill_id");

-- AddForeignKey
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_sales_return_item_id_fkey" FOREIGN KEY ("sales_return_item_id") REFERENCES "sales_return_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "sales_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_replacement_product_id_fkey" FOREIGN KEY ("replacement_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_allocations" ADD CONSTRAINT "sales_return_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_allocations" ADD CONSTRAINT "sales_return_allocations_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "sales_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return_allocations" ADD CONSTRAINT "sales_return_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_allocations" ADD CONSTRAINT "purchase_return_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_allocations" ADD CONSTRAINT "purchase_return_allocations_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_allocations" ADD CONSTRAINT "purchase_return_allocations_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "supplier_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ trả hàng và đổi máy — luật ở BUSINESS_RULES.md mục 18 (TH).
-- Hai chiều đối xứng: khách trả cho mình, và mình trả nhà cung cấp.
-- ---------------------------------------------------------------------------

ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_loai_check"
    CHECK ("kind" IN ('tra-hang', 'doi-may'));
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_trang_thai_check"
    CHECK ("status" IN ('DRAFT', 'CONFIRMED', 'SETTLED', 'CANCELLED'));
-- TH-02: mọi phiếu trả hàng phải nói rõ vì sao trả. Không có lý do thì không có phiếu.
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_ly_do_check"
    CHECK (length(btrim("reason")) >= 2);
-- TH-04: xác nhận là lúc hàng thật sự đi qua kho, nên phải biết ai xác nhận và lúc nào.
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_xac_nhan_check"
    CHECK ("status" NOT IN ('CONFIRMED', 'SETTLED')
           OR ("confirmed_at" IS NOT NULL AND "confirmed_by" IS NOT NULL));
-- TH-07: chốt tiền là lúc giảm trừ công nợ, cũng phải có dấu vết người chốt.
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_chot_tien_check"
    CHECK ("status" <> 'SETTLED' OR ("settled_at" IS NOT NULL AND "settled_by" IS NOT NULL));
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_huy_check"
    CHECK ("status" <> 'CANCELLED' OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_tien_check"
    CHECK ("subtotal" >= 0 AND "vat_total" >= 0 AND "total" >= 0);
-- TH-08: đổi máy là đổi ngang, không phát sinh tiền. Chênh lệch giá phải đi bằng
-- chứng từ khác, không giấu trong phiếu đổi máy.
ALTER TABLE "sales_returns" ADD CONSTRAINT "sales_returns_doi_may_khong_tien_check"
    CHECK ("kind" <> 'doi-may' OR "total" = 0);

ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_so_luong_check"
    CHECK ("quantity" > 0);
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_gia_check"
    CHECK ("unit_price" >= 0 AND "line_total" >= 0);
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_ty_le_check"
    CHECK ("vat_rate" BETWEEN 0 AND 100);
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_tinh_trang_check"
    CHECK ("condition" IN ('con-tot', 'loi'));
-- TH-06: hàng lỗi mà vẫn nhập lại kho đang bán thì phải ghi rõ vì sao.
ALTER TABLE "sales_return_items" ADD CONSTRAINT "sales_return_items_hang_loi_check"
    CHECK ("condition" <> 'loi' OR "restock" = false OR length(btrim(coalesce("note", ''))) >= 2);

ALTER TABLE "sales_return_allocations" ADD CONSTRAINT "sales_return_allocations_so_tien_check"
    CHECK ("amount" > 0);

ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_trang_thai_check"
    CHECK ("status" IN ('DRAFT', 'CONFIRMED', 'SETTLED', 'CANCELLED'));
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_ly_do_check"
    CHECK (length(btrim("reason")) >= 2);
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_xac_nhan_check"
    CHECK ("status" NOT IN ('CONFIRMED', 'SETTLED')
           OR ("confirmed_at" IS NOT NULL AND "confirmed_by" IS NOT NULL));
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_chot_tien_check"
    CHECK ("status" <> 'SETTLED' OR ("settled_at" IS NOT NULL AND "settled_by" IS NOT NULL));
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_huy_check"
    CHECK ("status" <> 'CANCELLED' OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_tien_check"
    CHECK ("subtotal" >= 0 AND "vat_total" >= 0 AND "total" >= 0);

ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_so_luong_check"
    CHECK ("quantity" > 0);
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_gia_check"
    CHECK ("unit_price" >= 0 AND "line_total" >= 0);
ALTER TABLE "purchase_return_items" ADD CONSTRAINT "purchase_return_items_ty_le_check"
    CHECK ("vat_rate" BETWEEN 0 AND 100);

ALTER TABLE "purchase_return_allocations" ADD CONSTRAINT "purchase_return_allocations_so_tien_check"
    CHECK ("amount" > 0);

-- ---------------------------------------------------------------------------
-- Không thêm mã quyền mới. Trả hàng dùng lại đúng bộ quyền đang có:
--   `order.update` / `service_desk.update` để lập phiếu khách trả,
--   `purchasing.update` để lập phiếu trả nhà cung cấp,
--   `inventory.update` để xác nhận hàng đi qua kho,
--   `finance.approve` để chốt giảm trừ công nợ.
-- Không cấp bù cho ai — mọi thay đổi quyền ở đây phải khớp `src/lib/vai-tro.ts` (QĐ-37).
-- ---------------------------------------------------------------------------
