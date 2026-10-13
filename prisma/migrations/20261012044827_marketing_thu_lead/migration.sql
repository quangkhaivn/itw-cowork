-- AlterTable
ALTER TABLE "contacts" ADD COLUMN     "marketing_consent_source" VARCHAR(100),
ADD COLUMN     "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketing_opt_in_at" TIMESTAMPTZ(6),
ADD COLUMN     "marketing_opt_out_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "campaign_id" UUID;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "campaign_id" UUID,
ADD COLUMN     "capture_channel" VARCHAR(20),
ADD COLUMN     "marketing_consent_source" VARCHAR(100),
ADD COLUMN     "marketing_opt_in" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marketing_opt_in_at" TIMESTAMPTZ(6),
ADD COLUMN     "marketing_opt_out_at" TIMESTAMPTZ(6),
ADD COLUMN     "matched_customer_id" UUID,
ADD COLUMN     "utm_campaign" VARCHAR(120),
ADD COLUMN     "utm_content" VARCHAR(120),
ADD COLUMN     "utm_medium" VARCHAR(120),
ADD COLUMN     "utm_source" VARCHAR(120),
ADD COLUMN     "utm_term" VARCHAR(120);

-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN     "campaign_id" UUID;

-- CreateTable
CREATE TABLE "marketing_campaigns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "channel" VARCHAR(30) NOT NULL,
    "utm_campaign" VARCHAR(120),
    "start_date" DATE,
    "end_date" DATE,
    "budget" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "target_leads" INTEGER,
    "owner_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ke-hoach',
    "approved_budget" DECIMAL(18,2),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "marketing_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_costs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "cost_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "category" VARCHAR(30) NOT NULL DEFAULT 'quang-cao',
    "note" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'hoat-dong',
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "marketing_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_lead_assignees" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "marketing_lead_assignees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_forms" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "intro" TEXT,
    "fields" JSONB NOT NULL,
    "button_text" VARCHAR(60),
    "success_message" TEXT,
    "consent_text" TEXT,
    "campaign_id" UUID,
    "source" VARCHAR(50),
    "owner_id" UUID NOT NULL,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "marketing_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_webhook_sources" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "key_hash" VARCHAR(64) NOT NULL,
    "key_hint" VARCHAR(8) NOT NULL,
    "campaign_id" UUID,
    "source" VARCHAR(50),
    "owner_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'hoat-dong',
    "revoked_at" TIMESTAMPTZ(6),
    "revoked_by" UUID,
    "last_received_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "marketing_webhook_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_captures" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "result" VARCHAR(20) NOT NULL,
    "reason" TEXT,
    "lead_id" UUID,
    "campaign_id" UUID,
    "form_id" UUID,
    "webhook_source_id" UUID,
    "landing_page_id" UUID,
    "landing_variant" VARCHAR(1),
    "assigned_to" UUID,
    "utm_source" VARCHAR(120),
    "utm_medium" VARCHAR(120),
    "utm_campaign" VARCHAR(120),
    "utm_content" VARCHAR(120),
    "utm_term" VARCHAR(120),
    "payload" JSONB,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "lead_captures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_segments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "target" VARCHAR(20) NOT NULL,
    "conditions" JSONB NOT NULL,
    "note" TEXT,
    "owner_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'hoat-dong',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "marketing_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landing_pages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500),
    "blocks" JSONB NOT NULL,
    "blocks_b" JSONB,
    "form_id" UUID,
    "campaign_id" UUID,
    "owner_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'nhap',
    "published_at" TIMESTAMPTZ(6),
    "views_a" INTEGER NOT NULL DEFAULT 0,
    "views_b" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "landing_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketing_campaigns_tenant_id_status_idx" ON "marketing_campaigns"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "marketing_campaigns_tenant_id_owner_id_idx" ON "marketing_campaigns"("tenant_id", "owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_campaigns_tenant_id_code_key" ON "marketing_campaigns"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_campaigns_tenant_id_utm_campaign_key" ON "marketing_campaigns"("tenant_id", "utm_campaign");

-- CreateIndex
CREATE INDEX "marketing_costs_tenant_id_campaign_id_cost_date_idx" ON "marketing_costs"("tenant_id", "campaign_id", "cost_date");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_lead_assignees_tenant_id_user_id_key" ON "marketing_lead_assignees"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_forms_tenant_id_slug_key" ON "marketing_forms"("tenant_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_webhook_sources_tenant_id_code_key" ON "marketing_webhook_sources"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "lead_captures_tenant_id_created_at_idx" ON "lead_captures"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "lead_captures_tenant_id_campaign_id_created_at_idx" ON "lead_captures"("tenant_id", "campaign_id", "created_at");

-- CreateIndex
CREATE INDEX "lead_captures_tenant_id_form_id_idx" ON "lead_captures"("tenant_id", "form_id");

-- CreateIndex
CREATE INDEX "lead_captures_tenant_id_webhook_source_id_created_at_idx" ON "lead_captures"("tenant_id", "webhook_source_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "lead_captures_tenant_id_landing_page_id_idx" ON "lead_captures"("tenant_id", "landing_page_id");

-- CreateIndex
CREATE INDEX "marketing_segments_tenant_id_status_idx" ON "marketing_segments"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "landing_pages_tenant_id_slug_key" ON "landing_pages"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "customers_tenant_id_campaign_id_idx" ON "customers"("tenant_id", "campaign_id");

-- CreateIndex
CREATE INDEX "leads_tenant_id_campaign_id_idx" ON "leads"("tenant_id", "campaign_id");

-- CreateIndex
CREATE INDEX "opportunities_tenant_id_campaign_id_idx" ON "opportunities"("tenant_id", "campaign_id");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_matched_customer_id_fkey" FOREIGN KEY ("matched_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_costs" ADD CONSTRAINT "marketing_costs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_costs" ADD CONSTRAINT "marketing_costs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_lead_assignees" ADD CONSTRAINT "marketing_lead_assignees_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_lead_assignees" ADD CONSTRAINT "marketing_lead_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_forms" ADD CONSTRAINT "marketing_forms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_forms" ADD CONSTRAINT "marketing_forms_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_forms" ADD CONSTRAINT "marketing_forms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_webhook_sources" ADD CONSTRAINT "marketing_webhook_sources_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_webhook_sources" ADD CONSTRAINT "marketing_webhook_sources_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_webhook_sources" ADD CONSTRAINT "marketing_webhook_sources_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "marketing_forms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_webhook_source_id_fkey" FOREIGN KEY ("webhook_source_id") REFERENCES "marketing_webhook_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_landing_page_id_fkey" FOREIGN KEY ("landing_page_id") REFERENCES "landing_pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_segments" ADD CONSTRAINT "marketing_segments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_segments" ADD CONSTRAINT "marketing_segments_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "marketing_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ Marketing và thu lead — luật ở BUSINESS_RULES.md mục 21 (MK).
-- Chỉ thêm bảng / cột / ràng buộc, không đụng dữ liệu cũ. Không thêm mã quyền:
-- phân hệ `marketing.*` và ba vai trò Marketing đã có từ Phase 1. Không cấp bù quyền nào.
-- ---------------------------------------------------------------------------

-- MK-02: trạng thái, ngân sách, mốc ngày.
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_status_check"
    CHECK ("status" IN ('ke-hoach', 'cho-duyet', 'dang-chay', 'tam-dung', 'ket-thuc', 'huy'));
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_kenh_check"
    CHECK ("channel" IN ('facebook', 'google', 'zalo', 'tiktok', 'website', 'email', 'su-kien', 'offline', 'khac'));
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_tien_check"
    CHECK ("budget" >= 0 AND ("approved_budget" IS NULL OR "approved_budget" >= 0)
           AND ("target_leads" IS NULL OR "target_leads" >= 0));
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_ngay_check"
    CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_utm_check"
    CHECK ("utm_campaign" IS NULL OR "utm_campaign" ~ '^[a-z0-9][a-z0-9_-]{0,119}$');
-- MK-03: chiến dịch có ngân sách thì chỉ được chạy (và đã từng chạy) khi ngân sách
-- đã được duyệt đủ — chốt ở CSDL để một lỗi lập trình cũng không bỏ qua được bước duyệt.
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_duyet_check"
    CHECK ("status" NOT IN ('dang-chay', 'tam-dung', 'ket-thuc') OR "budget" = 0
           OR ("approved_budget" IS NOT NULL AND "approved_budget" >= "budget"
               AND "approved_by" IS NOT NULL AND "approved_at" IS NOT NULL));
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_nguoi_duyet_check"
    CHECK (("approved_budget" IS NULL AND "approved_by" IS NULL AND "approved_at" IS NULL)
           OR ("approved_budget" IS NOT NULL AND "approved_by" IS NOT NULL AND "approved_at" IS NOT NULL));
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_huy_check"
    CHECK ("status" <> 'huy' OR length(btrim(coalesce("cancel_reason", ''))) >= 3);

-- MK-04: chi phí dương; hủy (không xóa) phải có người, thời điểm, lý do.
ALTER TABLE "marketing_costs" ADD CONSTRAINT "marketing_costs_so_tien_check" CHECK ("amount" > 0);
ALTER TABLE "marketing_costs" ADD CONSTRAINT "marketing_costs_loai_check"
    CHECK ("category" IN ('quang-cao', 'noi-dung', 'in-an', 'su-kien', 'qua-tang', 'khac'));
ALTER TABLE "marketing_costs" ADD CONSTRAINT "marketing_costs_status_check" CHECK ("status" IN ('hoat-dong', 'huy'));
ALTER TABLE "marketing_costs" ADD CONSTRAINT "marketing_costs_huy_check"
    CHECK (("status" = 'hoat-dong' AND "cancelled_at" IS NULL AND "cancelled_by" IS NULL AND "cancel_reason" IS NULL)
           OR ("status" = 'huy' AND "cancelled_at" IS NOT NULL AND "cancelled_by" IS NOT NULL
               AND length(btrim(coalesce("cancel_reason", ''))) >= 3));

ALTER TABLE "marketing_lead_assignees" ADD CONSTRAINT "marketing_lead_assignees_status_check"
    CHECK ("status" IN ('hoat-dong', 'tam-dung'));

-- MK-11: đường dẫn công khai chỉ gồm chữ thường không dấu, số, gạch nối.
ALTER TABLE "marketing_forms" ADD CONSTRAINT "marketing_forms_slug_check"
    CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$');
ALTER TABLE "marketing_forms" ADD CONSTRAINT "marketing_forms_status_check" CHECK ("status" IN ('hoat-dong', 'tat'));
ALTER TABLE "marketing_forms" ADD CONSTRAINT "marketing_forms_truong_check" CHECK (jsonb_typeof("fields") = 'array');
ALTER TABLE "marketing_forms" ADD CONSTRAINT "marketing_forms_luot_xem_check" CHECK ("view_count" >= 0);

-- MK-12: khóa chỉ lưu bản băm SHA-256 (64 ký tự hex); thu hồi phải có người và thời điểm.
ALTER TABLE "marketing_webhook_sources" ADD CONSTRAINT "marketing_webhook_sources_ma_check"
    CHECK ("code" ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$');
ALTER TABLE "marketing_webhook_sources" ADD CONSTRAINT "marketing_webhook_sources_bam_check"
    CHECK (char_length("key_hash") = 64 AND "key_hash" ~ '^[0-9a-f]+$');
ALTER TABLE "marketing_webhook_sources" ADD CONSTRAINT "marketing_webhook_sources_status_check"
    CHECK (("status" = 'hoat-dong' AND "revoked_at" IS NULL AND "revoked_by" IS NULL)
           OR ("status" = 'thu-hoi' AND "revoked_at" IS NOT NULL AND "revoked_by" IS NOT NULL));

-- Nhật ký nhận lead: kênh, kết quả; nhận được (tạo mới / ghi thêm) thì phải trỏ tới lead.
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_kenh_check"
    CHECK ("channel" IN ('form', 'landing', 'webhook', 'nhap-tay'));
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_ket_qua_check"
    CHECK ("result" IN ('tao-moi', 'ghi-them', 'tu-choi', 'spam'));
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_lead_check"
    CHECK ("result" NOT IN ('tao-moi', 'ghi-them') OR "lead_id" IS NOT NULL);
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_tu_choi_check"
    CHECK ("result" <> 'tu-choi' OR length(btrim(coalesce("reason", ''))) >= 2);
ALTER TABLE "lead_captures" ADD CONSTRAINT "lead_captures_bien_the_check"
    CHECK ("landing_variant" IS NULL OR "landing_variant" IN ('A', 'B'));

-- Nhật ký nhận lead chỉ ghi thêm — đây là bằng chứng "lead đến từ đâu, lúc nào", kể cả
-- khi tranh chấp ai được giao lead nào. Khai lại hàm như migration Phase 3 (xem chú thích ở đó).
CREATE OR REPLACE FUNCTION public.chan_sua_xoa() RETURNS trigger AS $CHAN$
BEGIN
    RAISE EXCEPTION $tb$Bang % chi duoc ghi them. Khong duoc sua hoac xoa.$tb$, TG_TABLE_NAME
        USING ERRCODE = $ec$check_violation$ec$;
END;
$CHAN$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS chan_sua_lead_captures ON "lead_captures";
CREATE TRIGGER chan_sua_lead_captures
    BEFORE UPDATE OR DELETE ON "lead_captures"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();

-- MK-14: phân khúc nhắm lead hoặc liên hệ; điều kiện là object JSON.
ALTER TABLE "marketing_segments" ADD CONSTRAINT "marketing_segments_doi_tuong_check" CHECK ("target" IN ('lead', 'lien-he'));
ALTER TABLE "marketing_segments" ADD CONSTRAINT "marketing_segments_status_check" CHECK ("status" IN ('hoat-dong', 'luu-tru'));
ALTER TABLE "marketing_segments" ADD CONSTRAINT "marketing_segments_dieu_kien_check" CHECK (jsonb_typeof("conditions") = 'object');

-- MK-16: landing page.
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_slug_check"
    CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$');
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_status_check" CHECK ("status" IN ('nhap', 'xuat-ban', 'an'));
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_xuat_ban_check" CHECK ("status" <> 'xuat-ban' OR "published_at" IS NOT NULL);
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_khoi_check"
    CHECK (jsonb_typeof("blocks") = 'array' AND ("blocks_b" IS NULL OR jsonb_typeof("blocks_b") = 'array'));
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_luot_xem_check" CHECK ("views_a" >= 0 AND "views_b" >= 0);

-- MK-13: đồng ý nhận tin và từ chối nhận tin không bao giờ cùng bật; đồng ý phải có thời điểm.
ALTER TABLE "leads" ADD CONSTRAINT "leads_dong_y_nhan_tin_check"
    CHECK ((NOT "marketing_opt_in" OR ("marketing_opt_in_at" IS NOT NULL AND "marketing_opt_out_at" IS NULL)));
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_dong_y_nhan_tin_check"
    CHECK ((NOT "marketing_opt_in" OR ("marketing_opt_in_at" IS NOT NULL AND "marketing_opt_out_at" IS NULL)));
ALTER TABLE "leads" ADD CONSTRAINT "leads_kenh_nhan_check"
    CHECK ("capture_channel" IS NULL OR "capture_channel" IN ('form', 'landing', 'webhook', 'nhap-tay'));
