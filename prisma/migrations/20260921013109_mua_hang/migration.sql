-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "sales_order_id" UUID,
    "requester_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "need_by_date" DATE,
    "reason" TEXT,
    "note" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "decision_note" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_id" UUID,
    "name" VARCHAR(500) NOT NULL,
    "sku" VARCHAR(64),
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" VARCHAR(50),
    "estimated_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "supplier_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "supplier_id" UUID NOT NULL,
    "request_id" UUID,
    "owner_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "order_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expected_date" DATE,
    "payment_terms" VARCHAR(50),
    "notes" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vat_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "request_item_id" UUID,
    "product_id" UUID,
    "sku" VARCHAR(64),
    "name" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" VARCHAR(50),
    "unit_price" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "discount_pct" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(7,4) NOT NULL DEFAULT 10,
    "line_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "received_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "received_at" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supplier_doc_no" VARCHAR(100),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_receipt_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "receipt_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchase_requests_tenant_id_status_idx" ON "purchase_requests"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_tenant_id_number_key" ON "purchase_requests"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "purchase_request_items_tenant_id_product_id_idx" ON "purchase_request_items"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_request_items_request_id_line_no_key" ON "purchase_request_items"("request_id", "line_no");

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_status_expected_date_idx" ON "purchase_orders"("tenant_id", "status", "expected_date");

-- CreateIndex
CREATE INDEX "purchase_orders_tenant_id_supplier_id_idx" ON "purchase_orders"("tenant_id", "supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_number_key" ON "purchase_orders"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "purchase_order_items_tenant_id_product_id_idx" ON "purchase_order_items"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_items_purchase_order_id_line_no_key" ON "purchase_order_items"("purchase_order_id", "line_no");

-- CreateIndex
CREATE INDEX "goods_receipts_tenant_id_purchase_order_id_idx" ON "goods_receipts"("tenant_id", "purchase_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_receipts_tenant_id_number_key" ON "goods_receipts"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "goods_receipt_items_tenant_id_order_item_id_idx" ON "goods_receipt_items"("tenant_id", "order_item_id");

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_request_item_id_fkey" FOREIGN KEY ("request_item_id") REFERENCES "purchase_request_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_purchase_order_id_fkey" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipts" ADD CONSTRAINT "goods_receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ Mua hàng — luật ở BUSINESS_RULES.md mục 16 (MH).
-- ---------------------------------------------------------------------------

-- MH-02: vòng đời đề nghị mua. Duyệt và từ chối đều phải biết ai, lúc nào.
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_trang_thai_check"
    CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ORDERED', 'REJECTED', 'CANCELLED'));
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_duyet_check"
    CHECK ("status" NOT IN ('APPROVED', 'ORDERED', 'REJECTED')
           OR ("approved_by" IS NOT NULL AND "approved_at" IS NOT NULL));
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_tu_choi_check"
    CHECK ("status" <> 'REJECTED' OR "decision_note" IS NOT NULL);
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_huy_check"
    CHECK ("status" <> 'CANCELLED' OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));

ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_so_luong_check"
    CHECK ("quantity" > 0);
ALTER TABLE "purchase_request_items" ADD CONSTRAINT "purchase_request_items_gia_check"
    CHECK ("estimated_price" >= 0);

-- MH-04, MH-07: vòng đời đơn mua.
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_trang_thai_check"
    CHECK ("status" IN ('DRAFT', 'SENT', 'CONFIRMED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'));
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_gui_check"
    CHECK ("status" IN ('DRAFT', 'CANCELLED') OR "sent_at" IS NOT NULL);
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_nhan_xong_check"
    CHECK ("status" <> 'RECEIVED' OR "completed_at" IS NOT NULL);
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_huy_check"
    CHECK ("status" <> 'CANCELLED' OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tien_check"
    CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "vat_total" >= 0 AND "total" >= 0);
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_ngay_check"
    CHECK ("expected_date" IS NULL OR "expected_date" >= "order_date");

ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_so_luong_check"
    CHECK ("quantity" > 0);
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_gia_check"
    CHECK ("unit_price" >= 0 AND "line_total" >= 0);
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_ty_le_check"
    CHECK ("discount_pct" BETWEEN 0 AND 100 AND "vat_rate" BETWEEN 0 AND 100);
-- MH-05: đã nhận không âm và KHÔNG vượt số đặt. Chốt cuối ở tầng CSDL.
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_da_nhan_check"
    CHECK ("received_qty" >= 0 AND "received_qty" <= "quantity");

ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_so_luong_check"
    CHECK ("quantity" > 0);
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_gia_von_check"
    CHECK ("unit_cost" >= 0);

-- ---------------------------------------------------------------------------
-- Mua hàng không thêm mã quyền mới: `purchasing.*` có từ Phase 1 và vai trò Mua hàng
-- đã cầm đủ (`view`, `create`, `update`, `export`). Ở đây chỉ cấp bù quyền DUYỆT đề
-- nghị mua cho **Kế toán – Tài chính**: duyệt chi tiền là việc của tài chính, và vai trò
-- đó vốn đã có `purchasing.view` nên cấp thêm `approve` mới thành một bộ dùng được.
-- Vai trò Mua hàng cố ý KHÔNG tự duyệt đề nghị của chính mình (MH-02); Giám đốc và Quản
-- trị vốn có toàn quyền nên không cần cấp bù.
-- Câu này phải khớp với định nghĩa vai trò trong `src/lib/vai-tro.ts`: cấp bù chỉ chạm
-- doanh nghiệp ĐANG CÓ, doanh nghiệp tạo mới lấy quyền từ định nghĩa.
-- ---------------------------------------------------------------------------
INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), r."tenant_id", r."id", p."id", 'all', 'hoat-dong', now(), now()
FROM "roles" r
JOIN "permissions" p ON p."code" = 'purchasing.approve'
WHERE r."code" = 'finance' AND r."is_built_in"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
