-- 0.22.0 (QĐ-175): trần ghi máy lạ đặt ngay trong CSDL — một SN chỉ được cập nhật tối đa một lần / 30 giây, kể cả khi bộ
-- đếm Redis của ứng dụng tạm lỗi (đếm trong bộ nhớ từng tiến trình không chặn được nhiều tiến trình). Chỉ thay thân hàm.
CREATE OR REPLACE FUNCTION public.ghi_may_la(p_sn text, p_ip text, p_model text, p_tran integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    sn text := upper(p_sn);
BEGIN
    IF sn !~ '^[A-Z0-9_-]{4,64}$' THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM attendance_devices d WHERE upper(d.serial_number) = sn) THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM attendance_unknown_devices u WHERE u.serial_number = sn) THEN
        UPDATE attendance_unknown_devices
           SET last_ip = left(p_ip, 45), last_seen_at = now(), hit_count = LEAST(hit_count + 1, 2000000000),
               model = COALESCE(left(p_model, 100), model)
         WHERE serial_number = sn AND last_seen_at < now() - interval '30 seconds';
        RETURN FOUND;
    END IF;
    DELETE FROM attendance_unknown_devices WHERE last_seen_at < now() - interval '30 days';
    IF (SELECT count(*) FROM attendance_unknown_devices) >= p_tran THEN RETURN false; END IF;
    INSERT INTO attendance_unknown_devices (serial_number, last_ip, model) VALUES (sn, left(p_ip, 45), left(p_model, 100))
    ON CONFLICT (serial_number) DO NOTHING;
    RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ghi_may_la(text, text, text, integer) FROM PUBLIC;
-- Quyền EXECUTE cho cowork_app cấp lại ở prisma/rls.sql (CREATE OR REPLACE giữ quyền đã cấp).
