-- 0.25.0 — Mạng xã hội giai đoạn 3: lịch nội dung, biến thể theo kênh, chiến dịch, sửa riêng kênh lỗi, hồ sơ thương hiệu,
-- AI viết bài + ngân sách AI theo tháng (QĐ-230 →). Chỉ THÊM; không sửa migration cũ.

-- ---------------------------------------------------------------------------
-- 1. Chiến dịch nội dung (nhóm bài) — liên kết tùy chọn tới chiến dịch Marketing đã có (QĐ-232).
-- ---------------------------------------------------------------------------
CREATE TABLE "social_campaigns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "starts_on" DATE,
    "ends_on" DATE,
    "goal" TEXT,
    "marketing_campaign_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'hoat-dong',
    "created_by" UUID NOT NULL,
    "updated_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_campaigns_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "social_campaigns_tenant_id_status_idx" ON "social_campaigns"("tenant_id", "status");
CREATE UNIQUE INDEX "social_campaigns_tenant_id_name_key" ON "social_campaigns"("tenant_id", "name");
ALTER TABLE "social_campaigns" ADD CONSTRAINT "social_campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "social_campaigns" ADD CONSTRAINT "social_campaigns_marketing_campaign_id_fkey" FOREIGN KEY ("marketing_campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "social_campaigns" ADD CONSTRAINT "social_campaigns_status_check" CHECK ("status" IN ('hoat-dong', 'luu-tru'));
ALTER TABLE "social_campaigns" ADD CONSTRAINT "social_campaigns_ngay_check" CHECK ("starts_on" IS NULL OR "ends_on" IS NULL OR "ends_on" >= "starts_on");

-- ---------------------------------------------------------------------------
-- 2. Bài: chiến dịch, ngày dự kiến (lịch nội dung, bài chưa hẹn giờ), phạm vi duyệt lại "kênh lỗi", lượt AI tạo.
-- ---------------------------------------------------------------------------
ALTER TABLE "social_posts"
    ADD COLUMN "campaign_id" UUID,
    ADD COLUMN "planned_at" TIMESTAMPTZ(6),
    ADD COLUMN "review_scope" VARCHAR(20),
    ADD COLUMN "ai_usage_id" UUID;
CREATE INDEX "social_posts_tenant_id_campaign_id_idx" ON "social_posts"("tenant_id", "campaign_id");
CREATE INDEX "social_posts_tenant_id_planned_at_idx" ON "social_posts"("tenant_id", "planned_at");
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "social_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_review_scope_check" CHECK ("review_scope" IS NULL OR "review_scope" = 'kenh-loi');
-- Duyệt lại riêng kênh lỗi chỉ có nghĩa khi bài đang chờ duyệt (duyệt / trả lại / rút → xóa cờ).
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_review_scope_trang_thai_check"
    CHECK ("review_scope" IS NULL OR "status" = 'PENDING_APPROVAL');
-- Bài do AI tạo luôn ghi được lượt AI (bằng chứng).
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_ai_usage_check" CHECK ("ai_usage_id" IS NULL OR "created_by_type" = 'ai');

-- ---------------------------------------------------------------------------
-- 3. Kênh-bài: nội dung riêng theo kênh (ghi đè tiêu đề / nội dung, hashtag, tập ảnh con) + yêu cầu đăng lại riêng kênh lỗi.
-- ---------------------------------------------------------------------------
ALTER TABLE "social_post_targets"
    ADD COLUMN "title_override" VARCHAR(300),
    ADD COLUMN "body_override" TEXT,
    ADD COLUMN "hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "media_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    ADD COLUMN "media_subset" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "retry_requested" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "override_updated_by" UUID,
    ADD COLUMN "override_updated_at" TIMESTAMPTZ(6);
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_hashtags_check" CHECK (cardinality("hashtags") <= 30);
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_media_ids_check" CHECK (cardinality("media_ids") <= 20 AND ("media_subset" OR cardinality("media_ids") = 0));

-- Kênh đã vào lượt đăng / đã đăng / cần kiểm tay: nội dung riêng của kênh KHÔNG đổi được (thứ đã gửi là thứ đã gửi; đổi
-- nội dung làm đối soát theo nội dung của Facebook / Instagram không nhận ra bài cũ → có thể đăng trùng). Chặn cả vai chủ.
CREATE OR REPLACE FUNCTION public.chan_sua_bien_the_dang_chay() RETURNS trigger AS $$
BEGIN
    IF OLD.status IN ('QUEUED', 'PUBLISHING', 'VERIFYING', 'PUBLISHED', 'NEEDS_CHECK')
       AND (NEW.title_override IS DISTINCT FROM OLD.title_override OR NEW.body_override IS DISTINCT FROM OLD.body_override
            OR NEW.hashtags IS DISTINCT FROM OLD.hashtags OR NEW.media_ids IS DISTINCT FROM OLD.media_ids
            OR NEW.media_subset IS DISTINCT FROM OLD.media_subset) THEN
        RAISE EXCEPTION 'social_post_targets: khong sua noi dung rieng cua kenh dang dang / da dang / can kiem tay'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER chan_sua_bien_the_dang_chay BEFORE UPDATE ON "social_post_targets"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_bien_the_dang_chay();

-- ---------------------------------------------------------------------------
-- 4. Lịch sử duyệt: thêm đổi giờ khi đang chờ duyệt, sửa kênh lỗi, AI tạo bài.
-- ---------------------------------------------------------------------------
ALTER TABLE "social_post_reviews" DROP CONSTRAINT "social_post_reviews_action_check";
ALTER TABLE "social_post_reviews" ADD CONSTRAINT "social_post_reviews_action_check"
    CHECK ("action" IN ('gui-duyet', 'rut', 'duyet', 'tra-lai', 'doi-gio', 'sua-kenh', 'ai-tao'));

-- ---------------------------------------------------------------------------
-- 5. Hồ sơ thương hiệu: câu bắt buộc, bài mẫu (bảng có từ 0.23.0 — giọng văn, từ cấm, hashtag, CTA).
-- ---------------------------------------------------------------------------
ALTER TABLE "brand_profiles"
    ADD COLUMN "mandatory_phrases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "sample_posts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_gioi_han_check"
    CHECK (cardinality("banned_words") <= 200 AND cardinality("default_hashtags") <= 30
           AND cardinality("mandatory_phrases") <= 20 AND cardinality("sample_posts") <= 5);

-- ---------------------------------------------------------------------------
-- 6. Lượt dùng AI (ngân sách theo tháng, QĐ-236). Một dòng / lần gọi: giữ chỗ ước tính lúc bắt đầu (dang-goi), ghi số
-- thật lúc xong (xong / loi). KHÔNG xóa; chỉ sửa được dòng còn "dang-goi" (sang xong / loi) — trigger chặn cả vai chủ.
-- ---------------------------------------------------------------------------
CREATE TABLE "ai_usage_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "feature" VARCHAR(30) NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'dang-goi',
    "tokens_reserved" INTEGER NOT NULL DEFAULT 0,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "cost_vnd" BIGINT NOT NULL DEFAULT 0,
    "provider" VARCHAR(30),
    "model" VARCHAR(100),
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_usage_logs_tenant_id_month_idx" ON "ai_usage_logs"("tenant_id", "month");
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_status_check" CHECK ("status" IN ('dang-goi', 'xong', 'loi'));
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_month_check" CHECK ("month" ~ '^[0-9]{4}-[0-9]{2}$');
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_so_check"
    CHECK ("tokens_reserved" >= 0 AND COALESCE("tokens_in", 0) >= 0 AND COALESCE("tokens_out", 0) >= 0 AND "cost_vnd" >= 0);
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_ai_usage_id_fkey" FOREIGN KEY ("ai_usage_id") REFERENCES "ai_usage_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION public.kiem_ai_usage_log() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'ai_usage_logs: khong xoa luot dung AI' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status <> 'dang-goi' OR NEW.status = 'dang-goi'
       OR NEW.tenant_id <> OLD.tenant_id OR NEW.user_id <> OLD.user_id OR NEW.feature <> OLD.feature OR NEW.month <> OLD.month
       OR NEW.created_at <> OLD.created_at OR NEW.tokens_reserved <> OLD.tokens_reserved THEN
        RAISE EXCEPTION 'ai_usage_logs: chi ghi ket qua mot lan cho luot dang goi' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER kiem_ai_usage_log BEFORE UPDATE OR DELETE ON "ai_usage_logs"
    FOR EACH ROW EXECUTE FUNCTION public.kiem_ai_usage_log();
