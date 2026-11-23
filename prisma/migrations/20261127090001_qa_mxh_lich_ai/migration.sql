-- QA 0.25.0 — Mạng xã hội giai đoạn 3 (QĐ-245 → QĐ-247). Chỉ THÊM; không sửa migration cũ.

-- ---------------------------------------------------------------------------
-- 1. Khóa lặp lại của lượt AI (QĐ-245). Trước đây khóa `Idempotency-Key` chỉ được kiểm trên BÀI (tạo ở bước cuối) → bấm đúp
--    khi lượt đầu còn đang gọi mô hình: lượt hai không thấy bài nào, giữ chỗ ngân sách và GỌI AI LẦN HAI (tốn tiền hai lần),
--    rồi ghi đè mã lượt AI của bài lượt đầu. Nay lượt AI ghi khóa; lượt mới cùng khóa kiểm (dưới khóa tư vấn ngân sách theo
--    doanh nghiệp) xem có lượt "dang-goi" cùng khóa không → 409 "đang viết". Lượt "loi" cùng khóa không chặn (thử lại được).
-- ---------------------------------------------------------------------------
ALTER TABLE "ai_usage_logs" ADD COLUMN "idempotency_key" VARCHAR(100);
CREATE INDEX "ai_usage_logs_khoa_lap_lai_idx" ON "ai_usage_logs"("tenant_id", "feature", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;

-- Khóa lặp lại cũng bất biến sau khi ghi (cùng luật "chỉ ghi kết quả một lần" của 0.25.0).
CREATE OR REPLACE FUNCTION public.kiem_ai_usage_log() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'ai_usage_logs: khong xoa luot dung AI' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status <> 'dang-goi' OR NEW.status = 'dang-goi'
       OR NEW.tenant_id <> OLD.tenant_id OR NEW.user_id <> OLD.user_id OR NEW.feature <> OLD.feature OR NEW.month <> OLD.month
       OR NEW.created_at <> OLD.created_at OR NEW.tokens_reserved <> OLD.tokens_reserved
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
        RAISE EXCEPTION 'ai_usage_logs: chi ghi ket qua mot lan cho luot dang goi' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
