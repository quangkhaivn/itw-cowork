-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "severity" VARCHAR(20) NOT NULL DEFAULT 'thong-tin',
    "title" VARCHAR(300) NOT NULL,
    "body" TEXT,
    "link" VARCHAR(500),
    "object_type" VARCHAR(50),
    "object_id" UUID,
    "dedupe_key" VARCHAR(200),
    "read_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "last_run_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "job_code" VARCHAR(50) NOT NULL,
    "for_date" DATE NOT NULL,
    "trigger" VARCHAR(10) NOT NULL DEFAULT 'lich',
    "status" VARCHAR(20) NOT NULL DEFAULT 'dang-chay',
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "rules_run" INTEGER NOT NULL DEFAULT 0,
    "rules_skipped" INTEGER NOT NULL DEFAULT 0,
    "items_created" INTEGER NOT NULL DEFAULT 0,
    "notifs_created" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "started_by" UUID,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_action_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "for_date" DATE NOT NULL,
    "rule_code" VARCHAR(50) NOT NULL,
    "severity" VARCHAR(20) NOT NULL DEFAULT 'thong-tin',
    "title" VARCHAR(300) NOT NULL,
    "reason" TEXT NOT NULL,
    "link" VARCHAR(500),
    "object_type" VARCHAR(50) NOT NULL,
    "object_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'mo',
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "skip_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_contracts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "customer_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "scope" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "cycle_months" INTEGER NOT NULL,
    "last_service_date" DATE,
    "next_service_date" DATE,
    "amount" DECIMAL(18,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'hieu-luc',
    "note" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "maintenance_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renewals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "source_type" VARCHAR(20) NOT NULL,
    "warranty_id" UUID,
    "maintenance_contract_id" UUID,
    "customer_id" UUID NOT NULL,
    "owner_id" UUID,
    "title" VARCHAR(300) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'moi',
    "opportunity_id" UUID,
    "note" TEXT,
    "skip_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "renewals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_read_at_created_at_idx" ON "notifications"("tenant_id", "user_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_user_id_dedupe_key_key" ON "notifications"("tenant_id", "user_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "automation_rules_tenant_id_code_key" ON "automation_rules"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "job_runs_tenant_id_job_code_for_date_idx" ON "job_runs"("tenant_id", "job_code", "for_date");

-- CreateIndex
CREATE INDEX "daily_action_items_tenant_id_user_id_for_date_status_idx" ON "daily_action_items"("tenant_id", "user_id", "for_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "daily_action_items_tenant_id_user_id_for_date_rule_code_obj_key" ON "daily_action_items"("tenant_id", "user_id", "for_date", "rule_code", "object_type", "object_id");

-- CreateIndex
CREATE INDEX "maintenance_contracts_tenant_id_next_service_date_idx" ON "maintenance_contracts"("tenant_id", "next_service_date");

-- CreateIndex
CREATE INDEX "maintenance_contracts_tenant_id_customer_id_idx" ON "maintenance_contracts"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_contracts_tenant_id_code_key" ON "maintenance_contracts"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "renewals_tenant_id_status_due_date_idx" ON "renewals"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "renewals_tenant_id_warranty_id_due_date_key" ON "renewals"("tenant_id", "warranty_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "renewals_tenant_id_maintenance_contract_id_due_date_key" ON "renewals"("tenant_id", "maintenance_contract_id", "due_date");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_action_items" ADD CONSTRAINT "daily_action_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_action_items" ADD CONSTRAINT "daily_action_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_warranty_id_fkey" FOREIGN KEY ("warranty_id") REFERENCES "warranties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_maintenance_contract_id_fkey" FOREIGN KEY ("maintenance_contract_id") REFERENCES "maintenance_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ Phase 8 — luật ở BUSINESS_RULES.md mục 13 (TD) và 14 (BT/GH).
-- Viết ở tầng CSDL để một lỗi lập trình cũng không ghi được dữ liệu vô nghĩa.
-- ---------------------------------------------------------------------------

-- TD-02: mỗi ngày chỉ có MỘT lần chạy theo lịch cho mỗi loại tác vụ.
-- Chạy tay không giới hạn, nên chỉ mục chỉ phủ phần trigger = 'lich'.
CREATE UNIQUE INDEX "job_runs_lich_moi_ngay"
    ON "job_runs" ("tenant_id", "job_code", "for_date")
    WHERE "trigger" = 'lich';

ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_trigger_check"
    CHECK ("trigger" IN ('lich', 'tay'));
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_trang_thai_check"
    CHECK ("status" IN ('dang-chay', 'xong', 'hong'));
-- Chạy xong hay hỏng đều phải có thời điểm kết thúc; hỏng phải ghi lỗi.
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_ket_thuc_check"
    CHECK ("status" = 'dang-chay' OR "finished_at" IS NOT NULL);
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_loi_check"
    CHECK ("status" <> 'hong' OR "error" IS NOT NULL);
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_so_dem_check"
    CHECK ("rules_run" >= 0 AND "rules_skipped" >= 0 AND "items_created" >= 0 AND "notifs_created" >= 0);

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_muc_do_check"
    CHECK ("severity" IN ('thong-tin', 'canh-bao', 'khan'));

-- TD-05: việc hôm nay đã đóng thì phải biết ai đóng, lúc nào; bỏ qua phải có lý do.
ALTER TABLE "daily_action_items" ADD CONSTRAINT "daily_action_items_muc_do_check"
    CHECK ("severity" IN ('thong-tin', 'canh-bao', 'khan'));
ALTER TABLE "daily_action_items" ADD CONSTRAINT "daily_action_items_trang_thai_check"
    CHECK ("status" IN ('mo', 'xong', 'bo-qua'));
ALTER TABLE "daily_action_items" ADD CONSTRAINT "daily_action_items_dong_check"
    CHECK ("status" = 'mo' OR ("resolved_at" IS NOT NULL AND "resolved_by" IS NOT NULL));
ALTER TABLE "daily_action_items" ADD CONSTRAINT "daily_action_items_bo_qua_check"
    CHECK ("status" <> 'bo-qua' OR "skip_reason" IS NOT NULL);

-- BT-01 → BT-04: hợp đồng bảo trì.
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_trang_thai_check"
    CHECK ("status" IN ('hieu-luc', 'tam-dung', 'het-han', 'huy'));
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_ky_han_check"
    CHECK ("end_date" >= "start_date");
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_chu_ky_check"
    CHECK ("cycle_months" BETWEEN 1 AND 60);
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_huy_check"
    CHECK ("status" <> 'huy' OR ("cancelled_at" IS NOT NULL AND "cancel_reason" IS NOT NULL));
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_so_tien_check"
    CHECK ("amount" IS NULL OR "amount" >= 0);
-- Lần bảo trì gần nhất không thể nằm ngoài kỳ hạn hợp đồng.
ALTER TABLE "maintenance_contracts" ADD CONSTRAINT "maintenance_contracts_lan_gan_nhat_check"
    CHECK ("last_service_date" IS NULL OR "last_service_date" >= "start_date");

-- GH-01 → GH-04: gia hạn.
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_nguon_check"
    CHECK ("source_type" IN ('bao-hanh', 'bao-tri'));
-- Đúng một nguồn, khớp với loại đã khai.
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_dung_mot_nguon_check"
    CHECK (
        ("source_type" = 'bao-hanh' AND "warranty_id" IS NOT NULL AND "maintenance_contract_id" IS NULL)
     OR ("source_type" = 'bao-tri' AND "maintenance_contract_id" IS NOT NULL AND "warranty_id" IS NULL)
    );
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_trang_thai_check"
    CHECK ("status" IN ('moi', 'da-tao-co-hoi', 'bo-qua'));
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_co_hoi_check"
    CHECK ("status" <> 'da-tao-co-hoi' OR "opportunity_id" IS NOT NULL);
ALTER TABLE "renewals" ADD CONSTRAINT "renewals_bo_qua_check"
    CHECK ("status" <> 'bo-qua' OR "skip_reason" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- Phase 8 KHÔNG cấp bù quyền nào, và cũng không thêm mã quyền mới.
--
-- Bảo trì dùng `service_desk.*` (cùng nhóm người đang lo bảo hành). Quy tắc nhắc việc
-- dùng `setting.*`. "Việc hôm nay" và chuông thông báo là của riêng mỗi người nên không
-- gắn quyền nào cả.
--
-- Lịch gia hạn cố ý nhận `service_desk.view` HOẶC `sales.view` ngay trong service, thay
-- vì cấp `service_desk.view` cho vai trò Kinh doanh: cấp như thế sẽ mở luôn cả hàng đợi
-- phiếu hỗ trợ cho phòng kinh doanh, rộng hơn nhiều so với việc họ cần làm (bán gia hạn).
-- ---------------------------------------------------------------------------
