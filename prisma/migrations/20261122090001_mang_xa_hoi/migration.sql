-- 0.23.0 — Mạng xã hội: nền tảng + WordPress (BUSINESS_RULES mục 34 MXH, QĐ-193 →).
--
-- Bảng mới: social_connector_settings (toàn hệ thống, không tenant — ứng dụng chỉ đọc), social_connections,
-- social_credentials (niêm phong envelope), social_app_configs (thông tin app nền tảng theo doanh nghiệp),
-- social_posts, social_post_variants, social_post_media (→ attachments), social_post_targets (bài × kênh, trạng thái
-- thật), social_publish_attempts + social_post_reviews (chỉ ghi thêm), brand_profiles (để sẵn cho 0.25).
-- RLS + quyền bảng: prisma/rls.sql (chạy lại sau migration). Quyền mxh.* cấp cho mọi doanh nghiệp ở cuối tệp (mẫu QĐ-117).

-- CreateTable
CREATE TABLE "social_connector_settings" (
    "platform" VARCHAR(30) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "availability" VARCHAR(20) NOT NULL DEFAULT 'DISABLED',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_connector_settings_pkey" PRIMARY KEY ("platform")
);

-- CreateTable
CREATE TABLE "social_connections" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "platform" VARCHAR(30) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "external_id" VARCHAR(500) NOT NULL,
    "account_name" VARCHAR(200),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "last_checked_at" TIMESTAMPTZ(6),
    "last_check_ok" BOOLEAN,
    "last_check_message" TEXT,
    "check_requested_at" TIMESTAMPTZ(6),
    "disconnected_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_credentials" (
    "connection_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "auth_tag" BYTEA NOT NULL,
    "wrapped_key" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_credentials_pkey" PRIMARY KEY ("connection_id")
);

-- CreateTable
CREATE TABLE "social_app_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "public_config" JSONB NOT NULL DEFAULT '{}',
    "ciphertext" BYTEA,
    "iv" BYTEA,
    "auth_tag" BYTEA,
    "wrapped_key" BYTEA,
    "key_version" INTEGER,
    "secret_last4" VARCHAR(4),
    "secret_updated_at" TIMESTAMPTZ(6),
    "secret_updated_by" UUID,
    "check_status" VARCHAR(20),
    "check_message" TEXT,
    "checked_at" TIMESTAMPTZ(6),
    "check_requested_at" TIMESTAMPTZ(6),
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_app_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_posts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "title" VARCHAR(300),
    "body" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMPTZ(6),
    "publish_mode" VARCHAR(10),
    "created_by_type" VARCHAR(10) NOT NULL DEFAULT 'user',
    "submitted_by" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "idempotency_key" VARCHAR(100),
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,

    CONSTRAINT "social_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_post_variants" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "platform" VARCHAR(30) NOT NULL,
    "title" VARCHAR(300),
    "body" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_post_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_post_media" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "role" VARCHAR(20) NOT NULL DEFAULT 'featured',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_post_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_post_targets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "external_post_id" VARCHAR(200),
    "external_url" TEXT,
    "verified_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "error_class" VARCHAR(20),
    "error_code" VARCHAR(100),
    "error_message" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6),
    "locked_by" VARCHAR(100),
    "locked_at" TIMESTAMPTZ(6),
    "reconcile_key" VARCHAR(200) NOT NULL,
    "media_external" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_post_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_publish_attempts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "outcome" VARCHAR(20) NOT NULL,
    "error_class" VARCHAR(20),
    "http_status" INTEGER,
    "message" TEXT,
    "response_excerpt" JSONB,
    "worker_id" VARCHAR(100),
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_publish_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_post_reviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "actor_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_post_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brand_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "voice" TEXT,
    "banned_words" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "default_hashtags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cta_templates" JSONB NOT NULL DEFAULT '[]',
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_connections_tenant_id_status_idx" ON "social_connections"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "social_credentials_tenant_id_idx" ON "social_credentials"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_app_configs_tenant_id_provider_key" ON "social_app_configs"("tenant_id", "provider");

-- CreateIndex
CREATE INDEX "social_posts_tenant_id_status_scheduled_at_idx" ON "social_posts"("tenant_id", "status", "scheduled_at");

-- CreateIndex
CREATE INDEX "social_posts_tenant_id_created_by_idx" ON "social_posts"("tenant_id", "created_by");

-- CreateIndex
CREATE UNIQUE INDEX "social_posts_tenant_id_idempotency_key_key" ON "social_posts"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "social_post_variants_tenant_id_idx" ON "social_post_variants"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_post_variants_post_id_platform_key" ON "social_post_variants"("post_id", "platform");

-- CreateIndex
CREATE INDEX "social_post_media_tenant_id_attachment_id_idx" ON "social_post_media"("tenant_id", "attachment_id");

-- CreateIndex
CREATE UNIQUE INDEX "social_post_media_post_id_attachment_id_key" ON "social_post_media"("post_id", "attachment_id");

-- CreateIndex
CREATE INDEX "social_post_targets_status_next_attempt_at_idx" ON "social_post_targets"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "social_post_targets_tenant_id_status_next_attempt_at_idx" ON "social_post_targets"("tenant_id", "status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "social_post_targets_post_id_connection_id_key" ON "social_post_targets"("post_id", "connection_id");

-- CreateIndex
CREATE INDEX "social_publish_attempts_tenant_id_target_id_started_at_idx" ON "social_publish_attempts"("tenant_id", "target_id", "started_at");

-- CreateIndex
CREATE INDEX "social_post_reviews_tenant_id_post_id_created_at_idx" ON "social_post_reviews"("tenant_id", "post_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "brand_profiles_tenant_id_key" ON "brand_profiles"("tenant_id");

-- AddForeignKey
ALTER TABLE "social_connections" ADD CONSTRAINT "social_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_credentials" ADD CONSTRAINT "social_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_credentials" ADD CONSTRAINT "social_credentials_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "social_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_app_configs" ADD CONSTRAINT "social_app_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_variants" ADD CONSTRAINT "social_post_variants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_variants" ADD CONSTRAINT "social_post_variants_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_media" ADD CONSTRAINT "social_post_media_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_media" ADD CONSTRAINT "social_post_media_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_media" ADD CONSTRAINT "social_post_media_attachment_id_fkey" FOREIGN KEY ("attachment_id") REFERENCES "attachments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "social_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_publish_attempts" ADD CONSTRAINT "social_publish_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_publish_attempts" ADD CONSTRAINT "social_publish_attempts_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "social_post_targets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_reviews" ADD CONSTRAINT "social_post_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_post_reviews" ADD CONSTRAINT "social_post_reviews_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "social_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ràng buộc giá trị
-- ---------------------------------------------------------------------------
ALTER TABLE "social_connector_settings" ADD CONSTRAINT "social_connector_settings_availability_check"
    CHECK ("availability" IN ('AVAILABLE', 'PENDING_APPROVAL', 'DISABLED'));
ALTER TABLE "social_connections" ADD CONSTRAINT "social_connections_status_check"
    CHECK ("status" IN ('ACTIVE', 'NEEDS_REAUTH', 'ERROR', 'DISCONNECTED'));
-- Một site chỉ nối một lần cho mỗi doanh nghiệp (kênh đã ngắt không tính).
CREATE UNIQUE INDEX "social_connections_dang_noi_key" ON "social_connections" ("tenant_id", "platform", "external_id")
    WHERE "disconnected_at" IS NULL;
ALTER TABLE "social_credentials" ADD CONSTRAINT "social_credentials_niem_phong_check"
    CHECK ("key_version" > 0 AND octet_length("iv") = 12 AND octet_length("auth_tag") = 16 AND octet_length("wrapped_key") = 60);
ALTER TABLE "social_app_configs" ADD CONSTRAINT "social_app_configs_provider_check"
    CHECK ("provider" IN ('META', 'GOOGLE', 'ZALO'));
-- Bí mật app: hoặc đủ cả bộ niêm phong, hoặc không có gì (không bao giờ có cột bản rõ).
ALTER TABLE "social_app_configs" ADD CONSTRAINT "social_app_configs_niem_phong_check"
    CHECK (("ciphertext" IS NULL AND "iv" IS NULL AND "auth_tag" IS NULL AND "wrapped_key" IS NULL AND "key_version" IS NULL AND "secret_last4" IS NULL)
        OR ("ciphertext" IS NOT NULL AND octet_length("iv") = 12 AND octet_length("auth_tag") = 16 AND octet_length("wrapped_key") = 60
            AND "key_version" > 0 AND "secret_last4" IS NOT NULL));
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_status_check"
    CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PARTIALLY_FAILED', 'FAILED', 'CANCELED'));
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_created_by_type_check" CHECK ("created_by_type" IN ('user', 'ai'));
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_publish_mode_check" CHECK ("publish_mode" IS NULL OR "publish_mode" IN ('ngay', 'hen-gio'));
-- Không tự duyệt (MXH-20): người duyệt khác người soạn và người gửi duyệt.
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_khong_tu_duyet_check"
    CHECK ("approved_by" IS NULL OR ("approved_by" <> "created_by" AND "approved_by" IS DISTINCT FROM "submitted_by"));
ALTER TABLE "social_post_media" ADD CONSTRAINT "social_post_media_role_check" CHECK ("role" IN ('featured', 'inline'));
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_status_check"
    CHECK ("status" IN ('PENDING', 'QUEUED', 'PUBLISHING', 'VERIFYING', 'PUBLISHED', 'FAILED', 'SKIPPED', 'CANCELED'));
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_error_class_check"
    CHECK ("error_class" IS NULL OR "error_class" IN ('RETRYABLE', 'PERMANENT', 'NEEDS_REAUTH', 'UNKNOWN'));
-- ADR-05 / INV-1: "Đã đăng" ⇒ có mã bài nền tảng trả về, permalink, mốc xác minh đọc lại.
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_da_dang_check"
    CHECK ("status" <> 'PUBLISHED' OR ("external_post_id" IS NOT NULL AND "external_url" IS NOT NULL AND "verified_at" IS NOT NULL));
ALTER TABLE "social_publish_attempts" ADD CONSTRAINT "social_publish_attempts_kind_check" CHECK ("kind" IN ('media', 'publish', 'verify', 'reconcile', 'check'));
ALTER TABLE "social_post_reviews" ADD CONSTRAINT "social_post_reviews_action_check" CHECK ("action" IN ('gui-duyet', 'rut', 'duyet', 'tra-lai'));

-- ---------------------------------------------------------------------------
-- Trigger: chỉ sang PUBLISHED khi có external_post_id + verified_at (kể cả vai chủ sở hữu), và đã PUBLISHED thì không
-- lùi trạng thái / đổi mã bài nền tảng (bài đã lên mạng là sự thật, không "xóa dấu").
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.kiem_target_da_dang() RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'PUBLISHED' AND (NEW.external_post_id IS NULL OR NEW.verified_at IS NULL OR NEW.external_url IS NULL) THEN
        RAISE EXCEPTION 'social_post_targets: chi danh dau PUBLISHED khi co external_post_id, external_url va verified_at (ADR-05)'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'PUBLISHED'
       AND (NEW.status <> 'PUBLISHED' OR NEW.external_post_id IS DISTINCT FROM OLD.external_post_id) THEN
        RAISE EXCEPTION 'social_post_targets: kenh da dang khong duoc doi trang thai hay ma bai nen tang'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER kiem_target_da_dang BEFORE INSERT OR UPDATE ON "social_post_targets"
    FOR EACH ROW EXECUTE FUNCTION public.kiem_target_da_dang();

-- Bảng chỉ ghi thêm (trigger chan_sua_xoa có từ Phase 1; rls.sql chỉ cấp SELECT, INSERT).
CREATE TRIGGER chan_sua_xoa_social_publish_attempts BEFORE UPDATE OR DELETE ON "social_publish_attempts"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();
CREATE TRIGGER chan_sua_xoa_social_post_reviews BEFORE UPDATE OR DELETE ON "social_post_reviews"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();

-- ---------------------------------------------------------------------------
-- Tệp đính kèm: thêm loại "social_post" (ảnh của bài).
-- ---------------------------------------------------------------------------
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_loai_doi_tuong_check";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_loai_doi_tuong_check"
    CHECK ("object_type" IN ('supplier_bill', 'sales_return', 'purchase_return',
                             'stock_transfer', 'sales_order', 'support_ticket', 'task',
                             'employment_contract', 'task_progress', 'social_post'));

-- ---------------------------------------------------------------------------
-- Danh mục nền tảng (ADR-04). Chỉ WordPress chạy thật ở 0.23.0; các nền tảng khác có mục, chưa có code.
-- ---------------------------------------------------------------------------
INSERT INTO "social_connector_settings" ("platform", "name", "availability", "enabled", "note") VALUES
    ('WORDPRESS', 'WordPress', 'AVAILABLE', true, 'REST API + Application Password, chỉ HTTPS.'),
    ('FACEBOOK_PAGE', 'Facebook Page', 'PENDING_APPROVAL', false, 'Cần Meta App Review + xác minh doanh nghiệp. Dự kiến 0.24.'),
    ('INSTAGRAM', 'Instagram', 'PENDING_APPROVAL', false, 'Cần Meta App Review; ảnh phải có URL công khai (link ký). Dự kiến 0.24.'),
    ('YOUTUBE', 'YouTube', 'DISABLED', false, 'Dự kiến 0.24 cùng kết nối Google Drive (chung OAuth Google).'),
    ('ZALO_OA', 'Zalo OA', 'DISABLED', false, 'Cần OA đã xác thực, gói Tăng trưởng trở lên; chờ thử bằng OA của ITW.')
ON CONFLICT ("platform") DO NOTHING;

-- ---------------------------------------------------------------------------
-- Quyền mxh.* cho MỌI doanh nghiệp đang có (mẫu QĐ-117). IDEMPOTENT; khớp src/lib/vai-tro.ts + prisma/seed.
-- Giám đốc / Quản trị: mọi mã (all). Trưởng phòng Marketing: 6 mã (all). Nhân viên Marketing: trừ approve (all).
-- Thực tập sinh Marketing: view + create (own). Trợ lý AI: KHÔNG có (gỡ nếu lỡ có). Vai trò tự tạo không bị đụng tới.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t record;
BEGIN
    INSERT INTO "permissions" ("id", "code", "module", "action", "description", "status", "created_at", "updated_at")
    SELECT gen_random_uuid(), 'mxh.' || a, 'mxh', a,
           (CASE a WHEN 'view' THEN 'Xem' WHEN 'create' THEN 'Tạo' WHEN 'update' THEN 'Sửa' WHEN 'delete' THEN 'Xóa'
                   WHEN 'approve' THEN 'Duyệt' ELSE 'Xuất dữ liệu' END) || ' phân hệ Mạng xã hội',
           'hoat-dong', now(), now()
    FROM unnest(ARRAY['view', 'create', 'update', 'delete', 'approve', 'export']) AS a
    ON CONFLICT ("code") DO NOTHING;

    FOR t IN SELECT "id" FROM "tenants" ORDER BY "code" LOOP
        INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
        SELECT gen_random_uuid(), t."id", r."id", p."id", 'all', 'hoat-dong', now(), now()
        FROM "roles" r JOIN "permissions" p ON p."module" = 'mxh'
        WHERE r."tenant_id" = t."id" AND (r."code" IN ('ceo', 'admin') OR (r."is_built_in" AND r."code" = 'marketing-manager'))
        ON CONFLICT ("role_id", "permission_id") DO NOTHING;

        INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
        SELECT gen_random_uuid(), t."id", r."id", p."id", 'all', 'hoat-dong', now(), now()
        FROM "roles" r JOIN "permissions" p ON p."code" IN ('mxh.view', 'mxh.create', 'mxh.update', 'mxh.delete', 'mxh.export')
        WHERE r."tenant_id" = t."id" AND r."is_built_in" AND r."code" = 'marketing'
        ON CONFLICT ("role_id", "permission_id") DO NOTHING;

        INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
        SELECT gen_random_uuid(), t."id", r."id", p."id", 'own', 'hoat-dong', now(), now()
        FROM "roles" r JOIN "permissions" p ON p."code" IN ('mxh.view', 'mxh.create')
        WHERE r."tenant_id" = t."id" AND r."is_built_in" AND r."code" = 'marketing-intern'
        ON CONFLICT ("role_id", "permission_id") DO NOTHING;

        DELETE FROM "role_permissions" rp USING "roles" r, "permissions" p
        WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id"
          AND r."tenant_id" = t."id" AND r."code" = 'ai-assistant' AND p."module" = 'mxh';
    END LOOP;
END $$;
