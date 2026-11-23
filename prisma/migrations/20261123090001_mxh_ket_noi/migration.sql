-- 0.24.0 — Mạng xã hội: kết nối Facebook Page, Instagram, YouTube bằng OAuth; Google Drive làm kho media
-- (BUSINESS_RULES mục 34 MXH-50 →, QĐ-203 →).
--
-- Bảng mới: social_oauth_requests (một lần kết nối OAuth: state băm, dùng một lần, hạn 10 phút, mã code niêm phong),
-- social_oauth_candidates (kênh tìm thấy chờ chọn — token niêm phong theo AAD kênh sẽ tạo), social_quota_usages (đếm
-- upload YouTube / ngày), social_data_deletion_requests (Data Deletion Callback của Meta), legal_pages (Điều khoản,
-- Quyền riêng tư, Xóa dữ liệu). Cột mới: social_connections.auth_type / oauth_provider / oauth_subject,
-- social_credentials.token_expires_at / refreshed_at, social_app_configs.picker_key_enc / picker_key_last4,
-- social_posts.options, social_post_targets.content_kind. RLS: prisma/rls.sql (quét tự động mọi bảng có tenant_id).

ALTER TABLE "social_connections" ADD COLUMN "auth_type" VARCHAR(20) NOT NULL DEFAULT 'app_password';
ALTER TABLE "social_connections" ADD COLUMN "oauth_provider" VARCHAR(20);
ALTER TABLE "social_connections" ADD COLUMN "oauth_subject" VARCHAR(100);
ALTER TABLE "social_connections" ADD CONSTRAINT "social_connections_auth_type_check"
    CHECK ("auth_type" IN ('app_password', 'oauth')
       AND ("auth_type" = 'app_password' OR "oauth_provider" IN ('META', 'GOOGLE')));
CREATE INDEX "social_connections_tenant_id_oauth_subject_idx" ON "social_connections" ("tenant_id", "oauth_provider", "oauth_subject");

ALTER TABLE "social_credentials" ADD COLUMN "token_expires_at" TIMESTAMPTZ(6);
ALTER TABLE "social_credentials" ADD COLUMN "refreshed_at" TIMESTAMPTZ(6);
CREATE INDEX "social_credentials_token_expires_at_idx" ON "social_credentials" ("tenant_id", "token_expires_at");

ALTER TABLE "social_app_configs" ADD COLUMN "picker_key_enc" TEXT;
ALTER TABLE "social_app_configs" ADD COLUMN "picker_key_last4" VARCHAR(4);
ALTER TABLE "social_app_configs" ADD CONSTRAINT "social_app_configs_picker_check"
    CHECK (("picker_key_enc" IS NULL AND "picker_key_last4" IS NULL) OR ("provider" = 'GOOGLE' AND "picker_key_enc" IS NOT NULL AND "picker_key_last4" IS NOT NULL));

ALTER TABLE "social_posts" ADD COLUMN "options" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "social_post_targets" ADD COLUMN "content_kind" VARCHAR(20);
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_content_kind_check"
    CHECK ("content_kind" IS NULL OR "content_kind" IN ('wp-bai', 'fb-chu', 'fb-anh', 'fb-nhieu-anh', 'fb-video', 'fb-reels',
                                                      'ig-anh', 'ig-carousel', 'ig-reels', 'yt-video'));
-- Đếm Reels đã đăng / đang chạy theo kênh trong 24 giờ (hạn mức 30 reel / 24 giờ của Facebook).
CREATE INDEX "social_post_targets_reels_idx" ON "social_post_targets" ("tenant_id", "connection_id", "content_kind", "published_at");

-- Nhật ký gọi nền tảng: thêm bước "oauth" (đổi mã, làm mới token) — không dùng ở 0.24 cho bảng này, giữ kind cũ.

-- CreateTable
CREATE TABLE "social_oauth_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "session_ref" VARCHAR(64) NOT NULL,
    "state_hash" VARCHAR(64) NOT NULL,
    "redirect_uri" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reconnect_connection_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'CHO_DONG_Y',
    "ciphertext" BYTEA,
    "iv" BYTEA,
    "auth_tag" BYTEA,
    "wrapped_key" BYTEA,
    "key_version" INTEGER,
    "oauth_subject" VARCHAR(100),
    "account_name" VARCHAR(200),
    "missing_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error_message" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "callback_at" TIMESTAMPTZ(6),
    "exchanged_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_oauth_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "social_oauth_requests_state_hash_key" ON "social_oauth_requests"("state_hash");
CREATE INDEX "social_oauth_requests_tenant_id_status_idx" ON "social_oauth_requests"("tenant_id", "status");
ALTER TABLE "social_oauth_requests" ADD CONSTRAINT "social_oauth_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_oauth_requests" ADD CONSTRAINT "social_oauth_requests_provider_check" CHECK ("provider" IN ('META', 'GOOGLE'));
ALTER TABLE "social_oauth_requests" ADD CONSTRAINT "social_oauth_requests_status_check"
    CHECK ("status" IN ('CHO_DONG_Y', 'CHO_DOI_MA', 'DA_SAN_SANG', 'HOAN_TAT', 'LOI', 'HET_HAN'));
-- Mã code: hoặc đủ bộ niêm phong, hoặc không có gì (không bao giờ có cột bản rõ).
ALTER TABLE "social_oauth_requests" ADD CONSTRAINT "social_oauth_requests_niem_phong_check"
    CHECK (("ciphertext" IS NULL AND "iv" IS NULL AND "auth_tag" IS NULL AND "wrapped_key" IS NULL AND "key_version" IS NULL)
        OR ("ciphertext" IS NOT NULL AND octet_length("iv") = 12 AND octet_length("auth_tag") = 16 AND octet_length("wrapped_key") = 60 AND "key_version" > 0));
-- state hạn tối đa 10 phút kể từ lúc tạo (SEC-03).
ALTER TABLE "social_oauth_requests" ADD CONSTRAINT "social_oauth_requests_han_check"
    CHECK ("expires_at" <= "created_at" + interval '10 minutes' + interval '5 seconds');

-- CreateTable
CREATE TABLE "social_oauth_candidates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "platform" VARCHAR(30) NOT NULL,
    "external_id" VARCHAR(500) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "connection_id" UUID NOT NULL,
    "existing" BOOLEAN NOT NULL DEFAULT false,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "auth_tag" BYTEA NOT NULL,
    "wrapped_key" BYTEA NOT NULL,
    "key_version" INTEGER NOT NULL,
    "token_expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_oauth_candidates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "social_oauth_candidates_tenant_id_request_id_idx" ON "social_oauth_candidates"("tenant_id", "request_id");
ALTER TABLE "social_oauth_candidates" ADD CONSTRAINT "social_oauth_candidates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_oauth_candidates" ADD CONSTRAINT "social_oauth_candidates_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "social_oauth_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_oauth_candidates" ADD CONSTRAINT "social_oauth_candidates_platform_check" CHECK ("platform" IN ('FACEBOOK_PAGE', 'INSTAGRAM', 'YOUTUBE'));
ALTER TABLE "social_oauth_candidates" ADD CONSTRAINT "social_oauth_candidates_niem_phong_check"
    CHECK ("key_version" > 0 AND octet_length("iv") = 12 AND octet_length("auth_tag") = 16 AND octet_length("wrapped_key") = 60);

-- CreateTable
CREATE TABLE "social_quota_usages" (
    "tenant_id" UUID NOT NULL,
    "quota_key" VARCHAR(50) NOT NULL,
    "quota_day" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_quota_usages_pkey" PRIMARY KEY ("tenant_id", "quota_key", "quota_day")
);
ALTER TABLE "social_quota_usages" ADD CONSTRAINT "social_quota_usages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_quota_usages" ADD CONSTRAINT "social_quota_usages_used_check" CHECK ("used" >= 0);

-- CreateTable
CREATE TABLE "social_data_deletion_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" VARCHAR(20) NOT NULL DEFAULT 'META',
    "confirmation_code" VARCHAR(32) NOT NULL,
    "signed_request" TEXT NOT NULL,
    "platform_user_id" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'CHO_KIEM',
    "result_message" TEXT,
    "deleted_count" INTEGER NOT NULL DEFAULT 0,
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "social_data_deletion_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "social_data_deletion_requests_confirmation_code_key" ON "social_data_deletion_requests"("confirmation_code");
CREATE INDEX "social_data_deletion_requests_tenant_id_status_idx" ON "social_data_deletion_requests"("tenant_id", "status");
ALTER TABLE "social_data_deletion_requests" ADD CONSTRAINT "social_data_deletion_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_data_deletion_requests" ADD CONSTRAINT "social_data_deletion_requests_status_check" CHECK ("status" IN ('CHO_KIEM', 'DA_XOA', 'CHU_KY_SAI', 'LOI'));
ALTER TABLE "social_data_deletion_requests" ADD CONSTRAINT "social_data_deletion_requests_size_check" CHECK (length("signed_request") <= 8192);

-- CreateTable
CREATE TABLE "legal_pages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slug" VARCHAR(30) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "body" TEXT NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_pages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "legal_pages_tenant_id_slug_key" ON "legal_pages"("tenant_id", "slug");
ALTER TABLE "legal_pages" ADD CONSTRAINT "legal_pages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "legal_pages" ADD CONSTRAINT "legal_pages_slug_check" CHECK ("slug" IN ('dieu-khoan', 'quyen-rieng-tu', 'xoa-du-lieu'));
ALTER TABLE "legal_pages" ADD CONSTRAINT "legal_pages_body_check" CHECK (length("body") <= 100000);

-- ---------------------------------------------------------------------------
-- Tệp đính kèm của bài: thêm video (MP4 / MOV) — chỉ loại social_post nhận (kiểm ở service).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Danh mục nền tảng (ADR-04): Facebook Page, Instagram, YouTube có code từ 0.24.0 → AVAILABLE + bật. Meta: app ở chế độ
-- phát triển chỉ dùng được cho tài khoản có vai trò trong app (quản trị Page của ITW) tới khi qua App Review.
-- ---------------------------------------------------------------------------
UPDATE "social_connector_settings" SET "availability" = 'AVAILABLE', "enabled" = true, "updated_at" = now(),
    "note" = 'OAuth Facebook Login for Business. App ở chế độ phát triển: chỉ tài khoản có vai trò trong app; mở cho người ngoài cần Meta App Review + xác minh doanh nghiệp.'
WHERE "platform" = 'FACEBOOK_PAGE';
UPDATE "social_connector_settings" SET "availability" = 'AVAILABLE', "enabled" = true, "updated_at" = now(),
    "note" = 'Qua Facebook Login (tài khoản Instagram chuyên nghiệp gắn Page). Ảnh / video kéo từ link ký trên tên miền Cowork — Cowork phải chạy HTTPS công khai.'
WHERE "platform" = 'INSTAGRAM';
UPDATE "social_connector_settings" SET "availability" = 'AVAILABLE', "enabled" = true, "updated_at" = now(),
    "note" = 'OAuth Google (youtube.upload, youtube.readonly, drive.file). Hạn mức upload / ngày đặt ở Cấu hình.'
WHERE "platform" = 'YOUTUBE';
