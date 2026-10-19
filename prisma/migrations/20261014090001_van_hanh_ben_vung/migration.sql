-- 0.16.1 — Vận hành bền vững (QĐ-86 → QĐ-90). Chỉ thêm bảng và thay một chỉ mục; không sửa dữ liệu cũ.

-- ---------------------------------------------------------------------------
-- 1. Nhịp sống của tiến trình hệ thống: worker (mỗi phút) và sao lưu (mỗi đêm).
--    Bảng TOÀN HỆ THỐNG — không có tenant_id, không chứa dữ liệu nghiệp vụ.
--    Quyền của cowork_app cấp ở prisma/rls.sql mục 5b: đọc mọi dòng, chỉ ghi dòng 'worker…'.
--    Dòng 'sao-luu' do scripts/sao-luu.sh ghi bằng vai chủ sở hữu.
-- ---------------------------------------------------------------------------
CREATE TABLE "system_heartbeats" (
    "name" VARCHAR(50) NOT NULL,
    "last_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "last_ok_at" TIMESTAMPTZ(6),
    "info" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "system_heartbeats_pkey" PRIMARY KEY ("name")
);

ALTER TABLE "system_heartbeats" ADD CONSTRAINT "system_heartbeats_ten_check"
    CHECK ("name" ~ '^[a-z0-9-]{1,50}$');
-- Lần ghi thành công thì mốc "thành công cuối" phải có.
ALTER TABLE "system_heartbeats" ADD CONSTRAINT "system_heartbeats_ok_check"
    CHECK (NOT "ok" OR "last_ok_at" IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 2. TD-02 sửa lại: lần chạy theo lịch HỎNG không chiếm chỗ "một lần mỗi ngày".
--    Trước đây dòng 'hong' bị ghi trong chính giao dịch đã cuộn ngược nên không bao giờ
--    tồn tại; nay ghi bằng giao dịch riêng (QĐ-86), mỗi lần thử lại là một dòng lịch sử.
--    Vẫn chỉ có tối đa MỘT lần chạy theo lịch thành công (hoặc đang chạy) mỗi ngày.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "job_runs_lich_moi_ngay";
CREATE UNIQUE INDEX "job_runs_lich_moi_ngay"
    ON "job_runs" ("tenant_id", "job_code", "for_date")
    WHERE "trigger" = 'lich' AND "status" <> 'hong';
