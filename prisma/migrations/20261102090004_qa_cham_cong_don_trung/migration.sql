-- 0.19.0 QA — "một đơn" của NS-20 / NS-40 chỉ được kiểm ở tầng ứng dụng (đọc rồi ghi, không khóa): bấm gửi
-- hai lần cùng lúc tạo HAI đơn tăng ca cùng ngày (cả hai duyệt được → tổng giờ tháng / năm tính đôi, bảng công
-- chỉ lấy một) hoặc hai đơn giải trình chờ cùng (ngày, chiều) — duyệt cả hai sinh hai lần chấm bù.
-- Chặn ở CSDL bằng chỉ mục duy nhất RIÊNG PHẦN; ứng dụng đổi lỗi trùng thành 409 "trung-don".

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM overtime_requests WHERE status IN ('cho-duyet', 'da-duyet')
               GROUP BY tenant_id, user_id, work_date HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Co nguoi co hon mot don tang ca cho / da duyet cung mot ngay. Huy don thua truoc khi chay migration nay.';
    END IF;
    IF EXISTS (SELECT 1 FROM attendance_corrections WHERE status = 'cho-duyet'
               GROUP BY tenant_id, user_id, work_date, direction HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'Co nguoi co hon mot don giai trinh dang cho cung (ngay, chieu). Xu ly don thua truoc khi chay migration nay.';
    END IF;
END $$;

-- NS-40: một đơn tăng ca chờ / đã duyệt mỗi người mỗi ngày.
CREATE UNIQUE INDEX "overtime_requests_mot_don_moi_ngay_key"
    ON "overtime_requests" ("tenant_id", "user_id", "work_date") WHERE "status" IN ('cho-duyet', 'da-duyet');

-- NS-20: một đơn giải trình CHỜ cho mỗi (người, ngày công, chiều).
CREATE UNIQUE INDEX "attendance_corrections_mot_don_cho_key"
    ON "attendance_corrections" ("tenant_id", "user_id", "work_date", "direction") WHERE "status" = 'cho-duyet';
