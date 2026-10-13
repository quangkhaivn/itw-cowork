-- AlterTable
-- 0.16.0 (gộp): gói Marketing (20261012044827) đã thêm cột này — dùng chung MỘT cột.
ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "marketing_opt_out_at" TIMESTAMPTZ(6);

-- AlterTable
-- 0.16.0 (gộp): gói Marketing (20261012044827) đã thêm cột này — dùng chung MỘT cột.
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "marketing_opt_out_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "security_changed_at" TIMESTAMPTZ(6),
ADD COLUMN     "totp_enabled_at" TIMESTAMPTZ(6),
ADD COLUMN     "totp_last_step" BIGINT,
ADD COLUMN     "totp_pending_enc" TEXT,
ADD COLUMN     "totp_secret_enc" TEXT;

-- CreateTable
CREATE TABLE "email_settings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "host" VARCHAR(255) NOT NULL,
    "port" INTEGER NOT NULL,
    "security" VARCHAR(10) NOT NULL,
    "username" VARCHAR(255),
    "password_enc" TEXT,
    "from_name" VARCHAR(255) NOT NULL,
    "from_email" VARCHAR(255) NOT NULL,
    "reply_to" VARCHAR(255),
    "tracking_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_test_at" TIMESTAMPTZ(6),
    "last_test_ok" BOOLEAN,
    "last_test_error" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "email_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "template_id" UUID,
    "subject" VARCHAR(255) NOT NULL,
    "blocks" JSONB NOT NULL DEFAULT '[]',
    "source_code" VARCHAR(50) NOT NULL,
    "source_params" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMPTZ(6),
    "submitted_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "approved_by" UUID,
    "paused_at" TIMESTAMPTZ(6),
    "pause_reason" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "tracking_enabled" BOOLEAN NOT NULL DEFAULT false,
    "recipient_summary" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_recipients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "company_name" VARCHAR(255),
    "recipient_type" VARCHAR(20) NOT NULL,
    "lead_id" UUID,
    "contact_id" UUID,
    "customer_id" UUID,
    "status" VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    "reason" TEXT,
    "attempt_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "message_id" VARCHAR(255),
    "opened_at" TIMESTAMPTZ(6),
    "open_count" INTEGER NOT NULL DEFAULT 0,
    "clicked_at" TIMESTAMPTZ(6),
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "unsubscribed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "event_type" VARCHAR(20) NOT NULL,
    "link_index" INTEGER,
    "url" TEXT,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_suppressions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "reason" VARCHAR(30) NOT NULL,
    "recipient_id" UUID,
    "note" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "email_suppressions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_recovery_codes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_settings_tenant_id_key" ON "email_settings"("tenant_id");

-- CreateIndex
CREATE INDEX "email_templates_tenant_id_status_idx" ON "email_templates"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "email_campaigns_tenant_id_status_idx" ON "email_campaigns"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "email_campaigns_tenant_id_code_key" ON "email_campaigns"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "email_recipients_tenant_id_campaign_id_status_idx" ON "email_recipients"("tenant_id", "campaign_id", "status");

-- CreateIndex
CREATE INDEX "email_recipients_tenant_id_status_attempt_at_idx" ON "email_recipients"("tenant_id", "status", "attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_recipients_campaign_id_email_key" ON "email_recipients"("campaign_id", "email");

-- CreateIndex
CREATE INDEX "email_events_tenant_id_campaign_id_event_type_idx" ON "email_events"("tenant_id", "campaign_id", "event_type");

-- CreateIndex
CREATE UNIQUE INDEX "email_suppressions_tenant_id_email_key" ON "email_suppressions"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "user_recovery_codes_tenant_id_user_id_idx" ON "user_recovery_codes"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_recovery_codes_user_id_code_hash_key" ON "user_recovery_codes"("user_id", "code_hash");

-- AddForeignKey
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "email_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "email_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_recovery_codes" ADD CONSTRAINT "user_recovery_codes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_recovery_codes" ADD CONSTRAINT "user_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ email marketing — BUSINESS_RULES.md mục 21 (EM)
-- và xác thực 2 lớp — mục 22 (XT).
-- ---------------------------------------------------------------------------

-- EM-01: kết nối SMTP. Cổng hợp lệ; chế độ bảo mật trong danh sách; địa chỉ gửi có dạng email.
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_cong_check"
    CHECK ("port" BETWEEN 1 AND 65535);
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_bao_mat_check"
    CHECK ("security" IN ('tls', 'starttls', 'none'));
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_dia_chi_gui_check"
    CHECK ("from_email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
-- EM-02: mật khẩu không bao giờ nằm dạng thuần — chỉ nhận chuỗi đã mã hóa có tiền tố phiên bản.
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_mat_khau_ma_hoa_check"
    CHECK ("password_enc" IS NULL OR "password_enc" LIKE 'v1:%');

-- XT-02: khóa bí mật TOTP cũng chỉ nhận dạng đã mã hóa; đã bật thì phải có khóa.
ALTER TABLE "users" ADD CONSTRAINT "users_totp_ma_hoa_check"
    CHECK (("totp_secret_enc" IS NULL OR "totp_secret_enc" LIKE 'v1:%')
       AND ("totp_pending_enc" IS NULL OR "totp_pending_enc" LIKE 'v1:%'));
ALTER TABLE "users" ADD CONSTRAINT "users_totp_bat_check"
    CHECK (("totp_enabled_at" IS NULL) = ("totp_secret_enc" IS NULL));

ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_trang_thai_check"
    CHECK ("status" IN ('hoat-dong', 'luu-tru'));
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_khoi_check"
    CHECK (jsonb_typeof("blocks") = 'array');

-- EM-05: vòng đời chiến dịch.
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_trang_thai_check"
    CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'SENDING', 'PAUSED', 'COMPLETED', 'CANCELLED'));
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_khoi_check"
    CHECK (jsonb_typeof("blocks") = 'array');
-- EM-06: đã vào hàng gửi thì phải có người duyệt và lúc duyệt.
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_da_duyet_check"
    CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL') OR "status" = 'CANCELLED'
           OR ("approved_at" IS NOT NULL AND "approved_by" IS NOT NULL));
-- Hủy phải có lý do.
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_huy_check"
    CHECK ("status" <> 'CANCELLED'
           OR ("cancelled_at" IS NOT NULL AND length(btrim(coalesce("cancel_reason", ''))) >= 2));

-- EM-08: mỗi người nhận một dòng trạng thái; lỗi / bị loại phải có lý do.
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_trang_thai_check"
    CHECK ("status" IN ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'SKIPPED'));
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_ly_do_check"
    CHECK ("status" NOT IN ('FAILED', 'SKIPPED') OR length(btrim(coalesce("reason", ''))) >= 2);
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_da_gui_check"
    CHECK ("status" <> 'SENT' OR "sent_at" IS NOT NULL);
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_loai_check"
    CHECK (("recipient_type" = 'lead' AND "lead_id" IS NOT NULL)
        OR ("recipient_type" = 'contact' AND "contact_id" IS NOT NULL));
-- EM-07: email lưu chữ thường — khóa duy nhất (chiến dịch, email) mới chống trùng được thật.
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_email_check"
    CHECK ("email" = lower("email") AND "email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_dem_check"
    CHECK ("open_count" >= 0 AND "click_count" >= 0);

ALTER TABLE "email_events" ADD CONSTRAINT "email_events_loai_check"
    CHECK ("event_type" IN ('open', 'click', 'unsubscribe'));

ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_ly_do_check"
    CHECK ("reason" IN ('huy-nhan-tin', 'email-hong'));
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_email_check"
    CHECK ("email" = lower("email"));

ALTER TABLE "user_recovery_codes" ADD CONSTRAINT "user_recovery_codes_bam_check"
    CHECK (char_length("code_hash") = 64 AND "code_hash" ~ '^[0-9a-f]+$');

-- Nhật ký mở / bấm / huỷ nhận tin chỉ ghi thêm. Dùng lại hàm chan_sua_xoa() như sổ kho.
CREATE OR REPLACE FUNCTION public.chan_sua_xoa() RETURNS trigger AS $CHAN$
BEGIN
    RAISE EXCEPTION 'Bang % chi duoc ghi them. Khong duoc sua hoac xoa.', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
END;
$CHAN$ LANGUAGE plpgsql;

CREATE TRIGGER email_events_chi_ghi_them
    BEFORE UPDATE OR DELETE ON "email_events"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();

-- ---------------------------------------------------------------------------
-- Không thêm mã quyền mới: email marketing dùng phân hệ `marketing` có sẵn
-- (gửi chiến dịch cần `marketing.approve`), kết nối SMTP dùng `integration.*`,
-- đặt lại 2 lớp cho người khác dùng `user.update`. Không cấp bù cho ai (QĐ-37).
-- ---------------------------------------------------------------------------
