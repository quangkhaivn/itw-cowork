-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "provider" VARCHAR(50),
    "model" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'dang-mo',
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "turns" INTEGER NOT NULL DEFAULT 0,
    "tokens_in" INTEGER,
    "tokens_out" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tool_calls" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "tool_name" VARCHAR(80) NOT NULL,
    "args" JSONB NOT NULL DEFAULT '{}',
    "result" TEXT,
    "outcome" VARCHAR(20) NOT NULL,
    "error" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_actions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "action_type" VARCHAR(50) NOT NULL,
    "summary" VARCHAR(500) NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" VARCHAR(20) NOT NULL DEFAULT 'de-xuat',
    "object_type" VARCHAR(50),
    "object_id" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "reject_reason" TEXT,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_conversations_tenant_id_user_id_last_message_at_idx" ON "ai_conversations"("tenant_id", "user_id", "last_message_at");

-- CreateIndex
CREATE INDEX "ai_messages_tenant_id_conversation_id_created_at_idx" ON "ai_messages"("tenant_id", "conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_tool_calls_tenant_id_tool_name_created_at_idx" ON "ai_tool_calls"("tenant_id", "tool_name", "created_at");

-- CreateIndex
CREATE INDEX "ai_actions_tenant_id_status_created_at_idx" ON "ai_actions"("tenant_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ai_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ Phase 9 — luật ở BUSINESS_RULES.md mục 15 (AI).
-- ---------------------------------------------------------------------------

ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_trang_thai_check"
    CHECK ("status" IN ('dang-mo', 'da-dong'));

ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_vai_tro_check"
    CHECK ("role" IN ('nguoi-dung', 'tro-ly', 'he-thong'));
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_so_vong_check"
    CHECK ("turns" >= 0);

ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_ket_qua_check"
    CHECK ("outcome" IN ('ok', 'thieu-quyen', 'tham-so-sai', 'loi'));
-- Gọi hỏng thì phải ghi lỗi, không im lặng.
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_loi_check"
    CHECK ("outcome" = 'ok' OR "error" IS NOT NULL);
ALTER TABLE "ai_tool_calls" ADD CONSTRAINT "ai_tool_calls_thoi_gian_check"
    CHECK ("duration_ms" >= 0);

-- AI-03: đề xuất chỉ chuyển sang "đã chạy" khi CÓ NGƯỜI DUYỆT và có thời điểm duyệt.
-- Đây là chốt cuối ở tầng CSDL: kể cả mã có lỗi cũng không ghi nổi một dòng
-- "trợ lý tự chạy hành động".
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_trang_thai_check"
    CHECK ("status" IN ('de-xuat', 'da-chay', 'tu-choi'));
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_duyet_check"
    CHECK ("status" <> 'da-chay' OR ("approved_by" IS NOT NULL AND "approved_at" IS NOT NULL));
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_tu_choi_check"
    CHECK ("status" <> 'tu-choi' OR ("approved_by" IS NOT NULL AND "reject_reason" IS NOT NULL));

-- Lịch sử hỏi đáp và lần gọi công cụ là BẰNG CHỨNG: chỉ ghi thêm, không sửa, không xóa.
CREATE TRIGGER chan_sua_ai_messages
    BEFORE UPDATE OR DELETE ON "ai_messages"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();

CREATE TRIGGER chan_sua_ai_tool_calls
    BEFORE UPDATE OR DELETE ON "ai_tool_calls"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();

-- ---------------------------------------------------------------------------
-- Phase 9 không thêm mã quyền mới và không cấp bù cho ai.
-- `ai.view` đã có từ Phase 1 và hầu hết vai trò đã được cấp. Vai trò `ai-assistant`
-- giữ nguyên giới hạn: không `*.approve`, không `*.delete` (có bài thử từ Phase 1).
-- ---------------------------------------------------------------------------
