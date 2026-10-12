-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "birth_date" DATE;

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "journey_stage_changed_at" TIMESTAMPTZ(6),
ADD COLUMN     "journey_stage_id" UUID,
ADD COLUMN     "lead_score" SMALLINT,
ADD COLUMN     "lead_score_at" TIMESTAMPTZ(6),
ADD COLUMN     "merged_at" TIMESTAMPTZ(6),
ADD COLUMN     "merged_by" UUID,
ADD COLUMN     "merged_into_id" UUID;

-- CreateTable
CREATE TABLE "customer_journey_stages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'mo',
    "stale_days" INTEGER,
    "auto_milestone" VARCHAR(30),
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "customer_journey_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_journey_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "from_stage_id" UUID,
    "to_stage_id" UUID,
    "is_auto" BOOLEAN NOT NULL DEFAULT false,
    "milestone" VARCHAR(30),
    "note" TEXT,
    "changed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_journey_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_groups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(7) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_group_members" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "customer_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_views" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "screen" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "is_shared" BOOLEAN NOT NULL DEFAULT false,
    "filters" JSONB NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_list_preferences" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "screen" VARCHAR(30) NOT NULL,
    "columns" JSONB,
    "default_view_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "user_list_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_journey_stages_tenant_id_sort_order_idx" ON "customer_journey_stages"("tenant_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "customer_journey_stages_tenant_id_code_key" ON "customer_journey_stages"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "customer_journey_stages_tenant_id_auto_milestone_key" ON "customer_journey_stages"("tenant_id", "auto_milestone");

-- CreateIndex
CREATE INDEX "customer_journey_history_tenant_id_customer_id_created_at_idx" ON "customer_journey_history"("tenant_id", "customer_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_journey_history_tenant_id_created_at_idx" ON "customer_journey_history"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_groups_tenant_id_status_idx" ON "customer_groups"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "customer_group_members_tenant_id_customer_id_idx" ON "customer_group_members"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_group_members_group_id_customer_id_key" ON "customer_group_members"("group_id", "customer_id");

-- CreateIndex
CREATE INDEX "saved_views_tenant_id_screen_owner_id_idx" ON "saved_views"("tenant_id", "screen", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_list_preferences_user_id_screen_key" ON "user_list_preferences"("user_id", "screen");

-- CreateIndex
CREATE INDEX "customers_tenant_id_journey_stage_id_idx" ON "customers"("tenant_id", "journey_stage_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_lead_score_idx" ON "customers"("tenant_id", "lead_score");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_journey_stage_id_fkey" FOREIGN KEY ("journey_stage_id") REFERENCES "customer_journey_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_journey_stages" ADD CONSTRAINT "customer_journey_stages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_journey_history" ADD CONSTRAINT "customer_journey_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_journey_history" ADD CONSTRAINT "customer_journey_history_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_journey_history" ADD CONSTRAINT "customer_journey_history_from_stage_id_fkey" FOREIGN KEY ("from_stage_id") REFERENCES "customer_journey_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_journey_history" ADD CONSTRAINT "customer_journey_history_to_stage_id_fkey" FOREIGN KEY ("to_stage_id") REFERENCES "customer_journey_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "customer_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_list_preferences" ADD CONSTRAINT "user_list_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_list_preferences" ADD CONSTRAINT "user_list_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ "Khách hàng nâng cao" (0.16.0) — luật ở BUSINESS_RULES.md mục 21 (KHN).
-- ---------------------------------------------------------------------------

-- KHN-01: trạng thái hành trình là danh mục riêng, KHÔNG đụng `customers.status`.
ALTER TABLE "customer_journey_stages" ADD CONSTRAINT "customer_journey_stages_mau_check"
    CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');
ALTER TABLE "customer_journey_stages" ADD CONSTRAINT "customer_journey_stages_loai_check"
    CHECK ("kind" IN ('mo', 'thanh-cong', 'that-bai'));
ALTER TABLE "customer_journey_stages" ADD CONSTRAINT "customer_journey_stages_trang_thai_check"
    CHECK ("status" IN ('hoat-dong', 'ngung-hoat-dong'));
ALTER TABLE "customer_journey_stages" ADD CONSTRAINT "customer_journey_stages_ten_check"
    CHECK (length(btrim("name")) >= 1 AND "code" ~ '^[a-z0-9-]{1,50}$');
-- KHN-14: số ngày "đứng lâu" là tuỳ chọn; trạng thái thất bại không nhắc.
ALTER TABLE "customer_journey_stages" ADD CONSTRAINT "customer_journey_stages_dung_lau_check"
    CHECK ("stale_days" IS NULL OR ("stale_days" BETWEEN 1 AND 365 AND "kind" <> 'that-bai'));
-- KHN-03: mốc tự chuyển là MÃ (src/modules/hanh-trinh/moc.ts), mỗi mốc gắn tối đa một trạng thái
-- (khóa duy nhất ở trên); trạng thái thất bại không nhận mốc tự chuyển.
ALTER TABLE "customer_journey_stages" ADD CONSTRAINT "customer_journey_stages_moc_check"
    CHECK ("auto_milestone" IS NULL OR ("auto_milestone" IN ('tao-khach', 'co-hoi-mo', 'bao-gia-da-gui', 'co-hoi-thang', 'don-xac-nhan') AND "kind" <> 'that-bai'));

-- KHN-02: lịch sử hành trình chỉ ghi thêm; mỗi dòng là một lần ĐỔI thật.
ALTER TABLE "customer_journey_history" ADD CONSTRAINT "customer_journey_history_doi_that_check"
    CHECK ("from_stage_id" IS DISTINCT FROM "to_stage_id");
ALTER TABLE "customer_journey_history" ADD CONSTRAINT "customer_journey_history_tu_dong_check"
    CHECK ("is_auto" = false OR "milestone" IS NOT NULL);
CREATE TRIGGER "chan_sua_customer_journey_history"
    BEFORE UPDATE OR DELETE ON "customer_journey_history"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();

-- KHN-12: khách đã gộp không bị xóa — đổi trạng thái `da-gop` và trỏ sang khách giữ lại.
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_status_check";
ALTER TABLE "customers" ADD CONSTRAINT "customers_status_check"
    CHECK ("status" IN ('tiem-nang', 'dang-giao-dich', 'ngung-giao-dich', 'da-gop'));
ALTER TABLE "customers" ADD CONSTRAINT "customers_da_gop_check"
    CHECK ((("status" = 'da-gop') = ("merged_into_id" IS NOT NULL))
           AND ("merged_into_id" IS NULL OR ("merged_at" IS NOT NULL AND "merged_by" IS NOT NULL AND "merged_into_id" <> "id")));
-- KHN-08: điểm 0–100.
ALTER TABLE "customers" ADD CONSTRAINT "customers_diem_check"
    CHECK ("lead_score" IS NULL OR ("lead_score" BETWEEN 0 AND 100 AND "lead_score_at" IS NOT NULL));

-- KHN-05: tên nhóm khách không trùng trong doanh nghiệp (không phân biệt hoa thường).
CREATE UNIQUE INDEX "customer_groups_tenant_ten_key" ON "customer_groups" ("tenant_id", lower(btrim("name")));
ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_mau_check"
    CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$' AND length(btrim("name")) >= 1);
ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_trang_thai_check"
    CHECK ("status" IN ('hoat-dong', 'ngung-hoat-dong'));

-- KHN-07: bộ lọc đã lưu chỉ cho màn hình đã biết.
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_man_hinh_check"
    CHECK ("screen" IN ('khach-hang') AND length(btrim("name")) >= 1);
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_trang_thai_check"
    CHECK ("status" IN ('hoat-dong', 'ngung-hoat-dong'));
ALTER TABLE "user_list_preferences" ADD CONSTRAINT "user_list_preferences_man_hinh_check"
    CHECK ("screen" IN ('khach-hang'));

-- ---------------------------------------------------------------------------
-- Danh mục trạng thái hành trình khởi tạo cho doanh nghiệp đang có (chỉ khi chưa có trạng thái nào).
-- Đây là TÊN bước, không phải con số: số ngày "đứng lâu" để trống — Giám đốc tự đặt.
-- Khách hiện có giữ "chưa có trạng thái"; không đoán ngược hành trình cho khách cũ.
-- ---------------------------------------------------------------------------
INSERT INTO "customer_journey_stages" ("id", "tenant_id", "code", "name", "color", "sort_order", "kind", "auto_milestone", "created_at", "updated_at")
SELECT gen_random_uuid(), t."id", s.code, s.name, s.color, s.sort_order, s.kind, s.moc, now(), now()
FROM "tenants" t
CROSS JOIN (VALUES
    ('khach-moi', 'Khách mới', '#64748B', 1, 'mo', 'tao-khach'),
    ('dang-tu-van', 'Đang tư vấn', '#2563EB', 2, 'mo', 'co-hoi-mo'),
    ('da-bao-gia', 'Đã báo giá', '#D97706', 3, 'mo', 'bao-gia-da-gui'),
    ('da-chot-don', 'Đã chốt đơn', '#16A34A', 4, 'thanh-cong', 'don-xac-nhan'),
    ('ngung-quan-tam', 'Ngừng quan tâm', '#DC2626', 5, 'that-bai', NULL)
) AS s(code, name, color, sort_order, kind, moc)
WHERE NOT EXISTS (SELECT 1 FROM "customer_journey_stages" x WHERE x."tenant_id" = t."id");

-- Cấp bù `customer.approve` (quản lý hành trình, gộp khách, bộ lọc dùng chung, tính lại điểm)
-- cho Trưởng phòng Kinh doanh — khớp `src/lib/vai-tro.ts` (QĐ-37). Phạm vi "team".
INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), r."tenant_id", r."id", p."id", 'team', 'hoat-dong', now(), now()
FROM "roles" r
JOIN "permissions" p ON p."code" = 'customer.approve'
WHERE r."code" = 'sales-manager' AND r."is_built_in"
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
