-- QA 0.22.0 — "Mở dần" (QĐ-172): kỳ lương tính KHÔNG cần bảng công khóa (công nhập tay / mặc định) thì `timesheet_id` trống.
-- CHECK cũ `payroll_runs_buoc_check` (0.21.0) bắt buộc `timesheet_id` khi đã khóa → khóa kỳ lỗi 500 (vi phạm CHECK) với đúng
-- trường hợp 0.22.0 hứa hỗ trợ. Bỏ riêng điều kiện đó; các bước khác giữ nguyên (đã tính + đã gửi, đã duyệt, đã khóa, đã chi).
-- Nguồn công từng dòng vẫn ghi trong ảnh chụp `payroll_lines.inputs.nguon` (bangCongId khi nguồn là bảng công).
ALTER TABLE "payroll_runs" DROP CONSTRAINT "payroll_runs_buoc_check";
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_buoc_check"
    CHECK (("status" NOT IN ('cho-duyet', 'da-duyet', 'da-khoa', 'da-chi') OR ("calculated_at" IS NOT NULL AND "submitted_at" IS NOT NULL))
       AND ("status" NOT IN ('da-duyet', 'da-khoa', 'da-chi') OR ("approved_at" IS NOT NULL AND "approved_by" IS NOT NULL))
       AND ("status" NOT IN ('da-khoa', 'da-chi') OR ("locked_at" IS NOT NULL AND "locked_by" IS NOT NULL))
       AND ("status" <> 'da-chi' OR ("paid_at" IS NOT NULL AND "paid_by" IS NOT NULL)));

-- QA 0.22.0 — hàm SECURITY DEFINER của máy chấm công / máy lạ (QĐ-175): `SET search_path = public` vẫn để pg_temp được tìm
-- TRƯỚC với bảng → một phiên `cowork_app` tạo bảng tạm `attendance_devices` (GRANT cho PUBLIC) là che được bảng thật bên
-- trong hàm: `ds_may_la` trả máy lạ gọi từ bất kỳ IP nào (lộ SN / IP văn phòng doanh nghiệp khác), `xoa_may_la` xóa được
-- dòng máy lạ chưa đăng ký. Đưa pg_temp xuống CUỐI đường tìm (khuyến cáo của PostgreSQL cho SECURITY DEFINER).
ALTER FUNCTION public.ghi_may_la(text, text, text, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.ds_may_la(text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.xoa_may_la(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.tra_may_cham_cong(text) SET search_path = public, pg_temp;

-- Trần 500 dòng máy lạ đặt CỨNG trong hàm (tham số p_tran chỉ được hạ trần, không nâng) — trần không phụ thuộc giá trị
-- ứng dụng truyền vào. Thân hàm giữ nguyên bản 20261109090003, chỉ thêm LEAST(...).
CREATE OR REPLACE FUNCTION public.ghi_may_la(p_sn text, p_ip text, p_model text, p_tran integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    sn text := upper(p_sn);
    tran integer := LEAST(GREATEST(COALESCE(p_tran, 0), 0), 500);
BEGIN
    IF sn !~ '^[A-Z0-9_-]{4,64}$' THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM public.attendance_devices d WHERE upper(d.serial_number) = sn) THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM public.attendance_unknown_devices u WHERE u.serial_number = sn) THEN
        UPDATE public.attendance_unknown_devices
           SET last_ip = left(p_ip, 45), last_seen_at = now(), hit_count = LEAST(hit_count + 1, 2000000000),
               model = COALESCE(left(p_model, 100), model)
         WHERE serial_number = sn AND last_seen_at < now() - interval '30 seconds';
        RETURN FOUND;
    END IF;
    DELETE FROM public.attendance_unknown_devices WHERE last_seen_at < now() - interval '30 days';
    IF (SELECT count(*) FROM public.attendance_unknown_devices) >= tran THEN RETURN false; END IF;
    INSERT INTO public.attendance_unknown_devices (serial_number, last_ip, model) VALUES (sn, left(p_ip, 45), left(p_model, 100))
    ON CONFLICT (serial_number) DO NOTHING;
    RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ghi_may_la(text, text, text, integer) FROM PUBLIC;
-- Quyền EXECUTE cho cowork_app: CREATE OR REPLACE giữ quyền đã cấp; prisma/rls.sql cấp lại khi chạy.
