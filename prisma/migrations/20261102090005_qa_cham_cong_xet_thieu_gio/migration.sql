-- 0.19.0 QA — QĐ-116: quản lý xét ngày công "thiếu giờ" (có mặt dưới ngưỡng Cấu hình): tính đủ / nửa / không
-- công. Chỉ ghi thêm (như attendance_punch_reviews): quyết định mới nhất có hiệu lực, lịch sử không sửa được.
-- RLS + quyền SELECT, INSERT cho cowork_app: prisma/rls.sql (mục 3, bảng chỉ ghi thêm).

CREATE TABLE "attendance_day_reviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "decision" VARCHAR(20) NOT NULL,
    "note" TEXT,
    "reviewed_by" UUID NOT NULL,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_day_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "attendance_day_reviews_tenant_id_user_id_work_date_reviewed_idx"
    ON "attendance_day_reviews"("tenant_id", "user_id", "work_date", "reviewed_at");

ALTER TABLE "attendance_day_reviews" ADD CONSTRAINT "attendance_day_reviews_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_day_reviews" ADD CONSTRAINT "attendance_day_reviews_quyet_dinh_check"
    CHECK ("decision" IN ('du', 'nua', 'khong'));
-- Không tự xét ngày công của chính mình (cũng kiểm ở ứng dụng).
ALTER TABLE "attendance_day_reviews" ADD CONSTRAINT "attendance_day_reviews_khong_tu_xet_check"
    CHECK ("reviewed_by" <> "user_id");

CREATE TRIGGER attendance_day_reviews_chi_ghi_them
    BEFORE UPDATE OR DELETE ON "attendance_day_reviews"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa();
