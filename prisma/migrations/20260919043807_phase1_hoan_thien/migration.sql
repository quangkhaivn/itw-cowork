-- AlterTable
ALTER TABLE "role_permissions" ADD COLUMN     "data_scope" VARCHAR(20) NOT NULL DEFAULT 'all';

-- AlterTable
ALTER TABLE "staff_profiles" ADD COLUMN     "manager_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_login_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMPTZ(6),
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_changed_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "master_data_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "master_data_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "master_data_items_tenant_id_type_status_idx" ON "master_data_items"("tenant_id", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "master_data_items_tenant_id_type_code_key" ON "master_data_items"("tenant_id", "type", "code");

-- CreateIndex
CREATE INDEX "staff_profiles_tenant_id_department_id_idx" ON "staff_profiles"("tenant_id", "department_id");

-- CreateIndex
CREATE INDEX "staff_profiles_tenant_id_manager_id_idx" ON "staff_profiles"("tenant_id", "manager_id");

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_data_items" ADD CONSTRAINT "master_data_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Viết tay: ràng buộc giá trị mà Prisma không biểu diễn được.
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_data_scope_check"
    CHECK ("data_scope" IN ('own', 'team', 'department', 'all'));
ALTER TABLE "users" ADD CONSTRAINT "users_failed_login_count_check"
    CHECK ("failed_login_count" >= 0);
-- Người không tự làm quản lý của chính mình.
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_manager_khac_ban_than_check"
    CHECK ("manager_id" IS NULL OR "manager_id" <> "user_id");
-- Phòng ban không tự làm cha của chính nó.
ALTER TABLE "departments" ADD CONSTRAINT "departments_parent_khac_ban_than_check"
    CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

-- Viết tay: gán phạm vi dữ liệu mặc định cho quyền ĐÃ CÓ của các vai trò dựng sẵn.
-- Cột mới mặc định 'all'; nếu để nguyên, nhân viên kinh doanh sẽ thấy khách của cả công ty.
-- Chạy đúng một lần cùng migration này. Giá trị khớp trường `phamVi` trong src/lib/vai-tro.ts.
UPDATE "role_permissions" rp
SET "data_scope" = CASE r."code"
        WHEN 'sales-manager'     THEN 'team'
        WHEN 'sales'             THEN 'own'
        WHEN 'technical-manager' THEN 'department'
        WHEN 'technical'         THEN 'own'
        WHEN 'project-manager'   THEN 'team'
        WHEN 'marketing-intern'  THEN 'own'
        ELSE 'all'
    END
FROM "roles" r
WHERE rp."role_id" = r."id" AND r."is_built_in" = true;

-- Viết tay: đổi tên hai vai trò dựng sẵn theo 10 vai trò của master prompt 19/09/2026
-- (Super Admin, Accountant). Chỉ đổi nếu tên vẫn là tên gốc — không đè tên đã sửa tay.
UPDATE "roles" SET "name" = 'Quản trị hệ thống (Super Admin)'
WHERE "code" = 'admin' AND "is_built_in" = true AND "name" = 'Quản trị hệ thống';
UPDATE "roles" SET "name" = 'Kế toán – Tài chính'
WHERE "code" = 'finance' AND "is_built_in" = true AND "name" = 'Tài chính';
