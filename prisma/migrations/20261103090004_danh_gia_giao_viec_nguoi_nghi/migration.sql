-- 0.20.0 — QĐ-155: việc "chờ duyệt" của người đã nghỉ. Chỉ thêm mới.

-- Người nhận bàn giao của một việc đang chờ duyệt: bàn giao giữ người làm cũ (công đã làm, điểm thuộc về họ)
-- nhưng ghi người nhận để khi việc bị trả lại / mở lại mà người làm đã ngừng hoạt động thì chuyển cho người này.
ALTER TABLE "tasks" ADD COLUMN "handover_to_id" UUID;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_handover_to_id_fkey"
    FOREIGN KEY ("handover_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lịch sử chuyển: thêm lý do "người làm đã nghỉ" (chuyển NGƯỜI LÀM của việc bị trả lại / mở lại).
ALTER TABLE "approval_transfers" DROP CONSTRAINT "approval_transfers_ly_do_check";
ALTER TABLE "approval_transfers" ADD CONSTRAINT "approval_transfers_ly_do_check"
    CHECK ("reason" IN ('ngung-hoat-dong', 'ban-giao', 'tu-duyet', 'nguoi-lam-nghi'));
