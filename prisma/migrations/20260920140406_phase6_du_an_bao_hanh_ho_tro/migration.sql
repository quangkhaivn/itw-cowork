-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "project_id" UUID;

-- CreateTable
CREATE TABLE "warranties" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_id" UUID,
    "serial_number_id" UUID,
    "serial" VARCHAR(100),
    "product_name" VARCHAR(500) NOT NULL,
    "sales_order_id" UUID,
    "sales_order_item_id" UUID,
    "delivery_id" UUID,
    "months" INTEGER NOT NULL DEFAULT 0,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'hieu-luc',
    "note" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "warranties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "customer_id" UUID NOT NULL,
    "sales_order_id" UUID,
    "manager_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PLANNING',
    "description" TEXT,
    "start_date" DATE,
    "due_date" DATE,
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_by" UUID,
    "acceptance_note" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_milestones" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'chua-lam',
    "due_date" DATE,
    "done_at" TIMESTAMPTZ(6),
    "note" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(30) NOT NULL,
    "customer_id" UUID NOT NULL,
    "contact_id" UUID,
    "warranty_id" UUID,
    "serial_number_id" UUID,
    "sales_order_id" UUID,
    "project_id" UUID,
    "type" VARCHAR(20) NOT NULL,
    "priority" VARCHAR(20) NOT NULL DEFAULT 'trung-binh',
    "status" VARCHAR(20) NOT NULL DEFAULT 'MOI',
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "owner_id" UUID NOT NULL,
    "assignee_id" UUID,
    "response_due_at" TIMESTAMPTZ(6),
    "resolve_due_at" TIMESTAMPTZ(6),
    "first_response_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "resolution" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_ticket_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "content" TEXT,
    "from_status" VARCHAR(20),
    "to_status" VARCHAR(20),
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_ticket_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "warranties_serial_number_id_key" ON "warranties"("serial_number_id");

-- CreateIndex
CREATE INDEX "warranties_tenant_id_customer_id_idx" ON "warranties"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "warranties_tenant_id_end_date_idx" ON "warranties"("tenant_id", "end_date");

-- CreateIndex
CREATE INDEX "warranties_tenant_id_serial_idx" ON "warranties"("tenant_id", "serial");

-- CreateIndex
CREATE INDEX "projects_tenant_id_manager_id_status_idx" ON "projects"("tenant_id", "manager_id", "status");

-- CreateIndex
CREATE INDEX "projects_tenant_id_customer_id_idx" ON "projects"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "projects_tenant_id_code_key" ON "projects"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "project_milestones_tenant_id_project_id_idx" ON "project_milestones"("tenant_id", "project_id");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_status_priority_idx" ON "support_tickets"("tenant_id", "status", "priority");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_assignee_id_status_idx" ON "support_tickets"("tenant_id", "assignee_id", "status");

-- CreateIndex
CREATE INDEX "support_tickets_tenant_id_customer_id_idx" ON "support_tickets"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_tenant_id_number_key" ON "support_tickets"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "support_ticket_events_tenant_id_ticket_id_created_at_idx" ON "support_ticket_events"("tenant_id", "ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "tasks_tenant_id_project_id_idx" ON "tasks"("tenant_id", "project_id");

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_sales_order_item_id_fkey" FOREIGN KEY ("sales_order_item_id") REFERENCES "sales_order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_warranty_id_fkey" FOREIGN KEY ("warranty_id") REFERENCES "warranties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_serial_number_id_fkey" FOREIGN KEY ("serial_number_id") REFERENCES "serial_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_sales_order_id_fkey" FOREIGN KEY ("sales_order_id") REFERENCES "sales_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ Phase 6 (BUSINESS_RULES.md mục 8, 9, 10). Viết tay, không do Prisma sinh.
-- ---------------------------------------------------------------------------

-- BH-02: bảo hành không bao giờ hết hạn trước ngày bắt đầu; số tháng không âm.
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_thoi_han_check"
    CHECK ("end_date" >= "start_date" AND "months" >= 0);
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_trang_thai_check"
    CHECK ("status" IN ('hieu-luc', 'het-han', 'huy'));
-- BH-05: đã hủy thì phải biết hủy lúc nào.
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_huy_check"
    CHECK ("status" <> 'huy' OR "cancelled_at" IS NOT NULL);

-- DU-02: trạng thái dự án nằm trong danh sách đã định.
ALTER TABLE "projects" ADD CONSTRAINT "projects_trang_thai_check"
    CHECK ("status" IN ('PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'ACCEPTED', 'CANCELLED'));
-- DU-05: đã nghiệm thu thì phải biết ai nghiệm thu và lúc nào.
ALTER TABLE "projects" ADD CONSTRAINT "projects_nghiem_thu_check"
    CHECK ("status" <> 'ACCEPTED' OR ("accepted_at" IS NOT NULL AND "accepted_by" IS NOT NULL));
-- DU-06: hủy dự án phải có lý do.
ALTER TABLE "projects" ADD CONSTRAINT "projects_huy_check"
    CHECK ("status" <> 'CANCELLED' OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));
-- Ngày kết thúc dự kiến không được trước ngày bắt đầu.
ALTER TABLE "projects" ADD CONSTRAINT "projects_ngay_check"
    CHECK ("start_date" IS NULL OR "due_date" IS NULL OR "due_date" >= "start_date");

ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_trang_thai_check"
    CHECK ("status" IN ('chua-lam', 'dang-lam', 'xong'));
-- DU-04: hạng mục xong thì phải có thời điểm xong.
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_xong_check"
    CHECK ("status" <> 'xong' OR "done_at" IS NOT NULL);

-- HT-01, HT-02: loại, mức ưu tiên và trạng thái phiếu nằm trong danh sách đã định.
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_loai_check"
    CHECK ("type" IN ('bao-hanh', 'su-co', 'yeu-cau', 'bao-tri'));
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_uu_tien_check"
    CHECK ("priority" IN ('khan', 'cao', 'trung-binh', 'thap'));
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_trang_thai_check"
    CHECK ("status" IN ('MOI', 'DANG_XU_LY', 'CHO_KHACH', 'HOAN_THANH', 'DONG', 'HUY'));
-- HT-05: hoàn thành thì phải ghi cách xử lý và thời điểm — không có phiếu "xong" mà trống trơn.
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_hoan_thanh_check"
    CHECK ("status" NOT IN ('HOAN_THANH', 'DONG') OR ("resolved_at" IS NOT NULL AND "resolution" IS NOT NULL));
-- HT-06: đã đóng thì phải biết đóng lúc nào.
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_dong_check"
    CHECK ("status" <> 'DONG' OR "closed_at" IS NOT NULL);
-- Hạn xử lý không sớm hơn hạn phản hồi.
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_han_check"
    CHECK ("response_due_at" IS NULL OR "resolve_due_at" IS NULL OR "resolve_due_at" >= "response_due_at");

ALTER TABLE "support_ticket_events" ADD CONSTRAINT "support_ticket_events_loai_check"
    CHECK ("type" IN ('tiep-nhan', 'ghi-chu', 'giao-viec', 'doi-trang-thai', 'phan-hoi-khach', 'hoan-thanh', 'dong'));

-- ---------------------------------------------------------------------------
-- HT-07: diễn biến phiếu hỗ trợ là bằng chứng đã làm gì cho khách → CHỈ GHI THÊM.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS chan_sua_support_ticket_events ON public.support_ticket_events;
CREATE TRIGGER chan_sua_support_ticket_events
    BEFORE UPDATE OR DELETE ON public.support_ticket_events
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();

-- ---------------------------------------------------------------------------
-- Cấp bù quyền cho vai trò dựng sẵn ĐÃ CÓ trên máy thật (QĐ-10: seed chỉ cấp mã quyền MỚI).
-- Phase 6 không thêm mã quyền mới — `project.*`, `service_desk.*`, `technical.*` đã có từ
-- Phase 1 — nên các vai trò đã tồn tại sẵn có đủ quyền theo định nghĩa vai trò.
-- Riêng Chăm sóc khách hàng và Kỹ thuật cần xem được đơn hàng để tra máy đã bán cho khách.
-- ---------------------------------------------------------------------------
INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), r."tenant_id", r."id", p."id", 'all', 'hoat-dong', now(), now()
FROM "roles" r
JOIN "permissions" p ON p."code" = 'order.view'
WHERE r."code" IN ('customer-service', 'technical', 'technical-manager') AND r."is_built_in"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
