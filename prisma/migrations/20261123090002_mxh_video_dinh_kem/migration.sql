-- 0.24.0 — Video của bài mạng xã hội (QĐ-205, QĐ-206): tệp đính kèm nhận thêm video/mp4, video/quicktime CHỈ cho loại
-- social_post; trần dung lượng 20 MB giữ nguyên cho mọi tệp khác, video bài mạng xã hội tới 200 MB (lấy từ Google Drive —
-- máy chủ tự tải; tải thẳng từ trình duyệt vẫn 20 MB ở service).
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_kieu_tep_check";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_kieu_tep_check"
    CHECK ("mime_type" IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
                           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                           'text/csv', 'text/plain')
        OR ("object_type" = 'social_post' AND "mime_type" IN ('video/mp4', 'video/quicktime')));

ALTER TABLE "attachments" DROP CONSTRAINT "attachments_dung_luong_check";
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_dung_luong_check"
    CHECK ("size_bytes" > 0 AND ("size_bytes" <= 20971520
        OR ("object_type" = 'social_post' AND "mime_type" IN ('video/mp4', 'video/quicktime') AND "size_bytes" <= 209715200)));
