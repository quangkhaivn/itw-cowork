-- 0.18.0 — Email marketing, giai đoạn 1: gửi số lượng lớn (BUSINESS_RULES.md mục 29, EG).
-- Không sửa migration cũ; mọi thay đổi ràng buộc cũ làm bằng DROP/ADD CONSTRAINT ở đây.
-- AlterTable
ALTER TABLE "email_campaigns" ADD COLUMN     "pause_code" VARCHAR(30),
ADD COLUMN     "rate_base_bounced" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rate_base_complained" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rate_base_sample" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "email_events" ADD COLUMN     "detail" JSONB;

-- AlterTable
ALTER TABLE "email_recipients" ADD COLUMN     "bounce_type" VARCHAR(20),
ADD COLUMN     "bounced_at" TIMESTAMPTZ(6),
ADD COLUMN     "complained_at" TIMESTAMPTZ(6),
ADD COLUMN     "defer_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deferred_until" TIMESTAMPTZ(6),
ADD COLUMN     "delivered_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "email_settings" ADD COLUMN     "dkim_tokens" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "dmarc_rua" VARCHAR(255),
ADD COLUMN     "dns_check" JSONB,
ADD COLUMN     "dns_checked_at" TIMESTAMPTZ(6),
ADD COLUMN     "mail_from_domain" VARCHAR(255),
ADD COLUMN     "provider" VARCHAR(10) NOT NULL DEFAULT 'smtp',
ADD COLUMN     "sending_domain" VARCHAR(255),
ADD COLUMN     "ses_configuration_set" VARCHAR(64),
ADD COLUMN     "ses_last_event_at" TIMESTAMPTZ(6),
ADD COLUMN     "ses_region" VARCHAR(30),
ADD COLUMN     "ses_subscribed_at" TIMESTAMPTZ(6),
ADD COLUMN     "ses_topic_arn" VARCHAR(300),
ADD COLUMN     "ses_webhook_hash" VARCHAR(64),
ADD COLUMN     "ses_webhook_hint" VARCHAR(8),
ADD COLUMN     "ses_webhook_rotated_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "email_consents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "purpose" VARCHAR(30) NOT NULL DEFAULT 'quang-cao-email',
    "action" VARCHAR(20) NOT NULL,
    "source" VARCHAR(30) NOT NULL,
    "evidence" TEXT NOT NULL,
    "evidence_ref" VARCHAR(255),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" UUID,
    "actor_email" VARCHAR(255),
    "ip_address" VARCHAR(45),
    "lead_id" UUID,
    "contact_id" UUID,

    CONSTRAINT "email_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_sns_messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sns_message_id" VARCHAR(100) NOT NULL,
    "message_type" VARCHAR(40) NOT NULL,
    "event_type" VARCHAR(40),
    "ses_message_id" VARCHAR(255),
    "recipient_id" UUID,
    "result" VARCHAR(30) NOT NULL,
    "note" TEXT,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_sns_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_transactionals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "recipient_id" UUID,
    "dedupe_key" VARCHAR(150) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'QUEUED',
    "attempt_at" TIMESTAMPTZ(6),
    "sent_at" TIMESTAMPTZ(6),
    "message_id" VARCHAR(255),
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "email_transactionals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_consents_tenant_id_email_purpose_occurred_at_idx" ON "email_consents"("tenant_id", "email", "purpose", "occurred_at");

-- CreateIndex
CREATE INDEX "email_consents_tenant_id_recorded_at_idx" ON "email_consents"("tenant_id", "recorded_at");

-- CreateIndex
CREATE INDEX "email_sns_messages_tenant_id_received_at_idx" ON "email_sns_messages"("tenant_id", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_sns_messages_tenant_id_sns_message_id_key" ON "email_sns_messages"("tenant_id", "sns_message_id");

-- CreateIndex
CREATE INDEX "email_transactionals_tenant_id_status_created_at_idx" ON "email_transactionals"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "email_transactionals_tenant_id_dedupe_key_key" ON "email_transactionals"("tenant_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "email_recipients_tenant_id_email_attempt_at_idx" ON "email_recipients"("tenant_id", "email", "attempt_at");

-- CreateIndex
CREATE INDEX "email_recipients_tenant_id_message_id_idx" ON "email_recipients"("tenant_id", "message_id");

-- AddForeignKey
ALTER TABLE "email_consents" ADD CONSTRAINT "email_consents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_sns_messages" ADD CONSTRAINT "email_sns_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_transactionals" ADD CONSTRAINT "email_transactionals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ — BUSINESS_RULES.md mục 29 (EG)
-- ---------------------------------------------------------------------------

-- EG-01: kênh gửi. SES cần vùng + tên miền gửi, và địa chỉ gửi phải thuộc đúng tên miền gửi.
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_kenh_check"
    CHECK ("provider" IN ('smtp', 'ses'));
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_ses_check"
    CHECK ("provider" <> 'ses'
           OR ("ses_region" IS NOT NULL AND "sending_domain" IS NOT NULL
               AND lower(split_part("from_email", '@', 2)) = "sending_domain"));
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_vung_check"
    CHECK ("ses_region" IS NULL OR "ses_region" ~ '^[a-z]{2}(-[a-z]+)+-[0-9]$');
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_configuration_set_check"
    CHECK ("ses_configuration_set" IS NULL OR "ses_configuration_set" ~ '^[A-Za-z0-9_-]{1,64}$');
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_ten_mien_check"
    CHECK (("sending_domain" IS NULL OR ("sending_domain" = lower("sending_domain") AND "sending_domain" ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$'))
       AND ("mail_from_domain" IS NULL OR ("mail_from_domain" = lower("mail_from_domain") AND "mail_from_domain" ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$')));
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_dkim_check"
    CHECK (jsonb_typeof("dkim_tokens") = 'array' AND jsonb_array_length("dkim_tokens") <= 3);
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_topic_check"
    CHECK ("ses_topic_arn" IS NULL OR "ses_topic_arn" ~ '^arn:aws(-[a-z]+)?:sns:[a-z]{2}(-[a-z]+)+-[0-9]:[0-9]{12}:[A-Za-z0-9_-]+$');
-- EG-02: mã webhook chỉ giữ băm SHA-256.
ALTER TABLE "email_settings" ADD CONSTRAINT "email_settings_webhook_bam_check"
    CHECK ("ses_webhook_hash" IS NULL OR "ses_webhook_hash" ~ '^[0-9a-f]{64}$');

-- EG-05: lý do tạm dừng trong danh mục.
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_ma_dung_check"
    CHECK ("pause_code" IS NULL OR "pause_code" IN ('tay', 'ket-noi', 'ty-le-hong', 'ty-le-bao-rac', 'khac'));
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_moc_ty_le_check"
    CHECK ("rate_base_sample" >= 0 AND "rate_base_bounced" >= 0 AND "rate_base_complained" >= 0);

ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_loai_tra_lai_check"
    CHECK ("bounce_type" IS NULL OR "bounce_type" IN ('Permanent', 'Transient', 'Undetermined'));
ALTER TABLE "email_recipients" ADD CONSTRAINT "email_recipients_hoan_check"
    CHECK ("defer_count" >= 0);

-- Sự kiện SES đi vào cùng nhật ký chỉ-ghi-thêm email_events.
ALTER TABLE "email_events" DROP CONSTRAINT "email_events_loai_check";
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_loai_check"
    CHECK ("event_type" IN ('open', 'click', 'unsubscribe', 'send', 'delivery', 'bounce', 'complaint',
                            'reject', 'delivery-delay', 'rendering-failure'));

-- Danh sách chặn thêm lý do "bao-rac" (người nhận bấm Báo thư rác — sự kiện Complaint của SES).
ALTER TABLE "email_suppressions" DROP CONSTRAINT "email_suppressions_ly_do_check";
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_ly_do_check"
    CHECK ("reason" IN ('huy-nhan-tin', 'email-hong', 'bao-rac'));

-- EG-08: sổ đồng ý.
ALTER TABLE "email_consents" ADD CONSTRAINT "email_consents_email_check"
    CHECK ("email" = lower("email") AND "email" ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
ALTER TABLE "email_consents" ADD CONSTRAINT "email_consents_muc_dich_check"
    CHECK ("purpose" IN ('quang-cao-email'));
ALTER TABLE "email_consents" ADD CONSTRAINT "email_consents_hanh_dong_check"
    CHECK ("action" IN ('dong-y', 'rut', 'phan-doi'));
ALTER TABLE "email_consents" ADD CONSTRAINT "email_consents_nguon_check"
    CHECK ("source" IN ('form', 'landing', 'webhook', 'nhap-csv', 'nhap-tay', 'huy-nhan-tin', 'bao-rac', 'chuyen-doi'));
-- Đồng ý bắt buộc có căn cứ (tối thiểu 10 ký tự); mọi dòng có căn cứ không rỗng.
ALTER TABLE "email_consents" ADD CONSTRAINT "email_consents_can_cu_check"
    CHECK (length(btrim("evidence")) >= 2 AND ("action" <> 'dong-y' OR length(btrim("evidence")) >= 10));

ALTER TABLE "email_sns_messages" ADD CONSTRAINT "email_sns_messages_loai_check"
    CHECK ("message_type" IN ('Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation'));
ALTER TABLE "email_sns_messages" ADD CONSTRAINT "email_sns_messages_ket_qua_check"
    CHECK ("result" IN ('da-xu-ly', 'bo-qua', 'da-xac-nhan'));

ALTER TABLE "email_transactionals" ADD CONSTRAINT "email_transactionals_loai_check"
    CHECK ("kind" IN ('xac-nhan-tu-choi'));
ALTER TABLE "email_transactionals" ADD CONSTRAINT "email_transactionals_trang_thai_check"
    CHECK ("status" IN ('QUEUED', 'SENDING', 'SENT', 'FAILED'));
ALTER TABLE "email_transactionals" ADD CONSTRAINT "email_transactionals_ly_do_check"
    CHECK ("status" <> 'FAILED' OR length(btrim(coalesce("reason", ''))) >= 2);
ALTER TABLE "email_transactionals" ADD CONSTRAINT "email_transactionals_da_gui_check"
    CHECK ("status" <> 'SENT' OR "sent_at" IS NOT NULL);
ALTER TABLE "email_transactionals" ADD CONSTRAINT "email_transactionals_email_check"
    CHECK ("email" = lower("email"));

-- Sổ đồng ý và nhật ký SNS chỉ ghi thêm (cùng hàm chan_sua_xoa() của audit_logs / email_events).
CREATE TRIGGER email_consents_chi_ghi_them
    BEFORE UPDATE OR DELETE ON "email_consents"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();
CREATE TRIGGER email_sns_messages_chi_ghi_them
    BEFORE UPDATE OR DELETE ON "email_sns_messages"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();

-- Trạng thái đồng ý hiện hành = dòng mới nhất theo (email, mục đích).
CREATE INDEX "email_consents_moi_nhat_idx"
    ON "email_consents" ("tenant_id", "email", "purpose", "occurred_at" DESC, "recorded_at" DESC);

-- ---------------------------------------------------------------------------
-- Chuyển dữ liệu cũ vào sổ đồng ý (QĐ-97). Từ chối luôn thắng (MK-13): email nào đã từng từ chối
-- (lead / liên hệ có marketing_opt_out_at, hoặc nằm trong danh sách chặn "huy-nhan-tin") chỉ nhận
-- dòng "rut"; chỉ email chưa từng từ chối mà có cờ đồng ý mới nhận dòng "dong-y" nguồn "chuyen-doi".
-- ---------------------------------------------------------------------------
WITH tu_choi AS (
    SELECT tenant_id, email_normalized AS email, max(marketing_opt_out_at) AS luc FROM leads
     WHERE marketing_opt_out_at IS NOT NULL AND email_normalized IS NOT NULL GROUP BY 1, 2
    UNION ALL
    SELECT tenant_id, email_normalized, max(marketing_opt_out_at) FROM contacts
     WHERE marketing_opt_out_at IS NOT NULL AND email_normalized IS NOT NULL GROUP BY 1, 2
    UNION ALL
    SELECT tenant_id, email, max(created_at) FROM email_suppressions
     WHERE reason = 'huy-nhan-tin' AND status = 'hoat-dong' GROUP BY 1, 2
), gop AS (
    SELECT tenant_id, lower(email) AS email, max(luc) AS luc FROM tu_choi GROUP BY 1, 2
)
INSERT INTO "email_consents" ("id", "tenant_id", "email", "action", "source", "evidence", "occurred_at")
SELECT gen_random_uuid(), tenant_id, email, 'rut', 'chuyen-doi',
       'Chuyển từ dữ liệu trước 0.18.0: đã từ chối nhận tin / huỷ nhận tin email', luc
  FROM gop
 WHERE email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';

WITH dong_y AS (
    SELECT tenant_id, email_normalized AS email, coalesce(marketing_opt_in_at, updated_at) AS luc, marketing_consent_source AS nguon
      FROM leads WHERE marketing_opt_in AND marketing_opt_out_at IS NULL AND email_normalized IS NOT NULL
    UNION ALL
    SELECT tenant_id, email_normalized, coalesce(marketing_opt_in_at, updated_at), marketing_consent_source
      FROM contacts WHERE marketing_opt_in AND marketing_opt_out_at IS NULL AND email_normalized IS NOT NULL
), gop AS (
    SELECT DISTINCT ON (tenant_id, lower(email)) tenant_id, lower(email) AS email, luc, nguon
      FROM dong_y ORDER BY tenant_id, lower(email), luc DESC
)
INSERT INTO "email_consents" ("id", "tenant_id", "email", "action", "source", "evidence", "occurred_at")
SELECT gen_random_uuid(), g.tenant_id, g.email, 'dong-y', 'chuyen-doi',
       'Chuyển từ cờ đồng ý nhận tin trước 0.18.0 (nguồn ghi nhận: ' || coalesce(g.nguon, 'không rõ') || ')', g.luc
  FROM gop g
 WHERE g.email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
   AND NOT EXISTS (SELECT 1 FROM "email_consents" c WHERE c.tenant_id = g.tenant_id AND c.email = g.email);
