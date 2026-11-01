-- 0.18.0 — quyết định của chủ doanh nghiệp trước khi phát hành (BUSINESS_RULES.md mục 29: EG-05, EG-08).

-- EG-08: lead qua webhook chỉ là "đồng ý nhận email quảng cáo" khi thân webhook có trường đồng ý đã khai
-- ở nguồn webhook, giá trị nằm trong danh sách chấp nhận. Mặc định trống = không bao giờ ghi đồng ý.
ALTER TABLE "marketing_webhook_sources" ADD COLUMN "consent_fields" VARCHAR(60)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(60)[],
ADD COLUMN "consent_values" VARCHAR(60)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(60)[];
ALTER TABLE "marketing_webhook_sources" ADD CONSTRAINT "marketing_webhook_sources_dong_y_check"
    CHECK (cardinality("consent_fields") <= 5 AND cardinality("consent_values") <= 10
           AND (cardinality("consent_fields") = 0 OR cardinality("consent_values") >= 1));

-- EG-05: mốc thời gian của cửa sổ đánh giá tỷ lệ sau "Tiếp tục".
ALTER TABLE "email_campaigns" ADD COLUMN "rate_base_at" TIMESTAMPTZ(6);
