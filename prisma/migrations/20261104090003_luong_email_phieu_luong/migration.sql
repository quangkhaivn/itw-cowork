-- 0.21.0 (LU-44, QĐ-151): thư phiếu lương đi qua hàng chờ thư giao dịch sẵn có (`email_transactionals`) — thêm loại
-- `phieu-luong`. Hàng chờ chỉ giữ mã dòng lương (payload.dongId), KHÔNG giữ số tiền; worker dựng thư lúc gửi từ dòng
-- lương của kỳ đã khóa.
ALTER TABLE "email_transactionals" DROP CONSTRAINT "email_transactionals_loai_check";
ALTER TABLE "email_transactionals" ADD CONSTRAINT "email_transactionals_loai_check"
    CHECK ("kind" IN ('xac-nhan-tu-choi', 'phieu-luong'));
