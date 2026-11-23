-- QA 0.23.0 — chính sách sau QA (QĐ-203 → QĐ-209).
--
-- 1. Đồng tác giả (QĐ-203): người SỬA NỘI DUNG bài (tiêu đề / nội dung / ảnh) sau khi bài đã gửi duyệt ít nhất một lần,
--    khác người soạn, là đồng tác giả → không được duyệt bài đó. Mảng chỉ thêm (trigger), CHECK chặn approved_by ∈ mảng.
-- 2. "Đã duyệt – cần hẹn lại giờ" (QĐ-206): duyệt khi giờ hẹn đã trễ quá `mxh.tre_hen_toi_da_phut`.
-- 3. Kênh-bài "Không rõ – cần kiểm tay" (NEEDS_CHECK, QĐ-207): kênh bị ngắt khi đang xác minh mà đối soát công khai không ra.

ALTER TABLE "social_posts"
    ADD COLUMN "co_author_ids" UUID[] NOT NULL DEFAULT '{}',
    ADD COLUMN "needs_reschedule" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_dong_tac_gia_check"
    CHECK ("approved_by" IS NULL OR NOT ("approved_by" = ANY ("co_author_ids")));

-- Đồng tác giả ghi ở CSDL (kể cả cập nhật không qua service): sửa tiêu đề / nội dung sau khi đã gửi duyệt, người sửa
-- (updated_by) khác người soạn → thêm vào mảng. Mảng không bao giờ bớt.
CREATE OR REPLACE FUNCTION public.ghi_dong_tac_gia_bai() RETURNS trigger AS $$
BEGIN
    IF NOT (OLD."co_author_ids" <@ NEW."co_author_ids") THEN
        RAISE EXCEPTION 'social_posts: danh sach dong tac gia chi duoc them, khong duoc bot'
            USING ERRCODE = 'check_violation';
    END IF;
    IF OLD."submitted_at" IS NOT NULL AND NEW."updated_by" IS NOT NULL AND NEW."updated_by" <> NEW."created_by"
       AND (NEW."title" IS DISTINCT FROM OLD."title" OR NEW."body" IS DISTINCT FROM OLD."body")
       AND NOT (NEW."updated_by" = ANY (NEW."co_author_ids")) THEN
        NEW."co_author_ids" := array_append(NEW."co_author_ids", NEW."updated_by");
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ghi_dong_tac_gia_bai BEFORE UPDATE ON "social_posts"
    FOR EACH ROW EXECUTE FUNCTION public.ghi_dong_tac_gia_bai();

ALTER TABLE "social_post_targets" DROP CONSTRAINT "social_post_targets_status_check";
ALTER TABLE "social_post_targets" ADD CONSTRAINT "social_post_targets_status_check"
    CHECK ("status" IN ('PENDING', 'QUEUED', 'PUBLISHING', 'VERIFYING', 'PUBLISHED', 'FAILED', 'SKIPPED', 'CANCELED', 'NEEDS_CHECK'));
