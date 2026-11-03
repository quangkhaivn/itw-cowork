-- 0.20.0 — QĐ-154 (bổ sung): lịch định kỳ lập trước luật mà chuỗi duyệt vi phạm thì worker không sinh việc.
-- Ghi mốc phát hiện để hiện "Ngừng sinh — chuỗi duyệt không hợp lệ" và báo người lập + quản lý MỘT lần cho mỗi
-- lần phát hiện. Sửa lịch (chuỗi hợp lệ) xóa mốc. Chỉ thêm mới.
ALTER TABLE "task_recurrences" ADD COLUMN "invalid_chain_at" TIMESTAMPTZ(6);
ALTER TABLE "task_recurrences" ADD COLUMN "invalid_chain_reason" TEXT;
