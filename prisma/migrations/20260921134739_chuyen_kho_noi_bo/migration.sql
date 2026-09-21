-- AlterTable
ALTER TABLE "serial_numbers" ADD COLUMN     "stock_transfer_item_id" UUID;

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "from_warehouse_id" UUID NOT NULL,
    "to_warehouse_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "transfer_date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "shipped_at" TIMESTAMPTZ(6),
    "shipped_by" UUID,
    "received_at" TIMESTAMPTZ(6),
    "received_by" UUID,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "line_no" INTEGER NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(64),
    "name" VARCHAR(500) NOT NULL,
    "quantity" DECIMAL(18,3) NOT NULL,
    "received_qty" DECIMAL(18,3) NOT NULL DEFAULT 0,
    "unit" VARCHAR(50),
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_transfers_tenant_id_status_transfer_date_idx" ON "stock_transfers"("tenant_id", "status", "transfer_date");

-- CreateIndex
CREATE INDEX "stock_transfers_tenant_id_from_warehouse_id_idx" ON "stock_transfers"("tenant_id", "from_warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_tenant_id_number_key" ON "stock_transfers"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "stock_transfer_items_tenant_id_product_id_idx" ON "stock_transfer_items"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfer_items_transfer_id_line_no_key" ON "stock_transfer_items"("transfer_id", "line_no");

-- AddForeignKey
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_stock_transfer_item_id_fkey" FOREIGN KEY ("stock_transfer_item_id") REFERENCES "stock_transfer_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ chuyển kho nội bộ — luật ở BUSINESS_RULES.md mục 19 (CK).
-- ---------------------------------------------------------------------------

ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_trang_thai_check"
    CHECK ("status" IN ('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'));
-- CK-02: chuyển kho phải nói rõ vì sao. Không có lý do thì không có phiếu.
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_ly_do_check"
    CHECK (length(btrim("reason")) >= 2);
-- CK-01: chuyển từ kho này sang chính nó là vô nghĩa, và sẽ làm sổ kho ghi hai
-- bút toán triệt tiêu nhau mà không ai hiểu vì sao.
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_khac_kho_check"
    CHECK ("from_warehouse_id" <> "to_warehouse_id");
-- CK-03: xuất là lúc hàng thật sự rời kho nguồn, phải biết ai xuất và lúc nào.
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_xuat_check"
    CHECK ("status" NOT IN ('IN_TRANSIT', 'RECEIVED')
           OR ("shipped_at" IS NOT NULL AND "shipped_by" IS NOT NULL));
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_nhan_check"
    CHECK ("status" <> 'RECEIVED' OR ("received_at" IS NOT NULL AND "received_by" IS NOT NULL));
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_huy_check"
    CHECK ("status" <> 'CANCELLED' OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));

ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_so_luong_check"
    CHECK ("quantity" > 0);
-- CK-04: nhận không quá số đã xuất; thiếu thì phải ghi rõ vì sao, không để hàng
-- biến mất lặng lẽ giữa hai kho.
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_nhan_check"
    CHECK ("received_qty" >= 0 AND "received_qty" <= "quantity");
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_thieu_phai_co_ly_do_check"
    CHECK ("received_qty" = "quantity" OR "received_qty" = 0 OR length(btrim(coalesce("note", ''))) >= 2);

-- ---------------------------------------------------------------------------
-- CK-05: sê-ri có thêm trạng thái `dang-chuyen`.
-- Hàng đang trên đường giữa hai kho thì KHÔNG thuộc kho nào — nói nó còn ở kho
-- nguồn hay đã ở kho đích đều là nói sai. Nới CHECK cũ thay vì lách bằng cách
-- gán sẵn kho đích lúc xuất.
-- ---------------------------------------------------------------------------
ALTER TABLE "serial_numbers" DROP CONSTRAINT IF EXISTS "serial_numbers_trang_thai_check";
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_trang_thai_check"
    CHECK ("status" IN ('trong-kho', 'da-ban', 'tra-lai', 'dang-chuyen'));
ALTER TABLE "serial_numbers" DROP CONSTRAINT IF EXISTS "serial_numbers_vi_tri_check";
ALTER TABLE "serial_numbers" ADD CONSTRAINT "serial_numbers_vi_tri_check"
    CHECK (("status" = 'trong-kho' AND "warehouse_id" IS NOT NULL)
           OR ("status" = 'dang-chuyen' AND "warehouse_id" IS NULL)
           OR "status" NOT IN ('trong-kho', 'dang-chuyen'));

-- ---------------------------------------------------------------------------
-- Không thêm mã quyền mới: chuyển kho dùng `inventory.create` để lập phiếu và
-- `inventory.update` để xuất/nhận — vai trò Kho đã cầm đủ từ Phase 1.
-- Không cấp bù cho ai; mọi thay đổi quyền phải khớp `src/lib/vai-tro.ts` (QĐ-37).
-- ---------------------------------------------------------------------------
