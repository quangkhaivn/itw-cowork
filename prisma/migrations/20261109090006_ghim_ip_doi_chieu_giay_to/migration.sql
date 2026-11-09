-- 0.22.0 — trước phát hành (QĐ-190 → QĐ-193). Chỉ thêm cột / bảng / hàm; đổi thân hàm của chính bản 0.22.0.

-- 1. GHIM IP khi xác minh máy (QĐ-190). Máy lạ nhớ tối đa 20 IP công khai đã gọi; máy chờ xác minh nhớ các IP được tin
--    (IP trước khi đăng ký + IP lần gọi đầu sau khi đăng ký nếu chưa có IP nào). Lần chấm mã xác minh và khu cách ly chỉ
--    nhận từ các IP đó.
ALTER TABLE "attendance_unknown_devices" ADD COLUMN "ips" varchar(45)[] NOT NULL DEFAULT '{}';
UPDATE "attendance_unknown_devices" SET "ips" = ARRAY["last_ip"] WHERE "last_ip" IS NOT NULL AND cardinality("ips") = 0;
ALTER TABLE "attendance_devices" ADD COLUMN "verify_ips" varchar(45)[] NOT NULL DEFAULT '{}';
ALTER TABLE "attendance_devices" ADD COLUMN "quarantine_full_at" timestamptz(6);

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
               model = COALESCE(left(p_model, 100), model),
               ips = CASE WHEN p_ip IS NULL OR left(p_ip, 45) = ANY(ips) OR cardinality(ips) >= 20 THEN ips ELSE ips || left(p_ip, 45)::varchar(45) END
         WHERE serial_number = sn AND last_seen_at < now() - interval '30 seconds';
        RETURN FOUND;
    END IF;
    DELETE FROM public.attendance_unknown_devices WHERE last_seen_at < now() - interval '30 days';
    IF (SELECT count(*) FROM public.attendance_unknown_devices) >= tran THEN RETURN false; END IF;
    INSERT INTO public.attendance_unknown_devices (serial_number, last_ip, model, ips)
    VALUES (sn, left(p_ip, 45), left(p_model, 100), CASE WHEN p_ip IS NULL THEN '{}'::varchar(45)[] ELSE ARRAY[left(p_ip, 45)::varchar(45)] END)
    ON CONFLICT (serial_number) DO NOTHING;
    RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ghi_may_la(text, text, text, integer) FROM PUBLIC;

-- IP máy lạ đã gọi TRƯỚC khi đăng ký — chỉ trả khi SN đã được đăng ký bởi CHÍNH doanh nghiệp của phiên.
CREATE OR REPLACE FUNCTION public.ip_may_la_truoc_dang_ky(p_sn text)
RETURNS varchar(45)[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT COALESCE((
        SELECT u.ips FROM public.attendance_unknown_devices u
         WHERE u.serial_number = upper(p_sn)
           AND EXISTS (SELECT 1 FROM public.attendance_devices d
                        WHERE upper(d.serial_number) = upper(p_sn)
                          AND d.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
    ), '{}'::varchar(45)[])
$$;
REVOKE ALL ON FUNCTION public.ip_may_la_truoc_dang_ky(text) FROM PUBLIC;

-- Khu cách ly chỉ nhận từ IP được tin, trần 50.000 dòng / máy (vượt → không ghi thêm, ứng dụng cảnh báo; không tự xóa).
CREATE OR REPLACE FUNCTION public.ghi_log_cach_ly(p_device uuid, p_dong jsonb, p_ip text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    n integer := 0;
    con integer;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.attendance_devices d
         WHERE d.id = p_device AND d.verify_status = 'cho-xac-minh'
           AND d.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
           AND p_ip IS NOT NULL AND left(p_ip, 45) = ANY(d.verify_ips)
    ) THEN
        RETURN 0;
    END IF;
    con := 50000 - (SELECT count(*) FROM public.attendance_quarantine_logs q WHERE q.device_id = p_device);
    IF con <= 0 THEN RETURN 0; END IF;
    INSERT INTO public.attendance_quarantine_logs (device_id, pin, punched_at, status, verify_code, work_code, raw_line)
    SELECT p_device, left(x.pin, 20), x.luc, x.trang_thai, x.xac_thuc, left(x.ma_cong_viec, 20), left(x.dong_goc, 500)
      FROM jsonb_to_recordset(p_dong) AS x(pin text, luc timestamptz, trang_thai integer, xac_thuc integer, ma_cong_viec text, dong_goc text)
     WHERE x.pin IS NOT NULL AND x.luc IS NOT NULL
     LIMIT con
    ON CONFLICT (device_id, pin, punched_at) DO NOTHING;
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.ghi_log_cach_ly(uuid, jsonb, text) FROM PUBLIC;
-- Bản 2 tham số (không kiểm IP) thôi dùng: luôn trả 0, rls.sql không cấp cho ứng dụng.
CREATE OR REPLACE FUNCTION public.ghi_log_cach_ly(p_device uuid, p_dong jsonb)
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$ SELECT 0 $$;
REVOKE ALL ON FUNCTION public.ghi_log_cach_ly(uuid, jsonb) FROM PUBLIC;

-- 2. Đối chiếu công sau khi khóa bảng công (QĐ-191): một dòng cho mỗi (kỳ lương đã khóa bằng công tạm, người) — chống trùng.
CREATE TABLE "payroll_attendance_reconciliations" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "source_run_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "timesheet_id" uuid NOT NULL,
    "old_source" varchar(20) NOT NULL,
    "old_work_days" decimal(6, 2) NOT NULL,
    "new_work_days" decimal(6, 2) NOT NULL,
    "gross_delta" bigint NOT NULL,
    "taxable_delta" bigint NOT NULL,
    "status" varchar(20) NOT NULL,
    "target_run_id" uuid,
    "applied_at" timestamptz(6),
    "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payroll_attendance_reconciliations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payroll_attendance_reconciliations_status_check" CHECK ("status" IN ('khong-chenh', 'cho-ky', 'da-tao-khoan'))
);
CREATE UNIQUE INDEX "payroll_attendance_reconciliations_source_run_id_user_id_key" ON "payroll_attendance_reconciliations" ("source_run_id", "user_id");
CREATE INDEX "payroll_attendance_reconciliations_tenant_id_status_idx" ON "payroll_attendance_reconciliations" ("tenant_id", "status");
ALTER TABLE "payroll_attendance_reconciliations" ADD CONSTRAINT "payroll_attendance_reconciliations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_attendance_reconciliations" ADD CONSTRAINT "payroll_attendance_reconciliations_source_run_id_fkey" FOREIGN KEY ("source_run_id") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_items" ADD COLUMN "reconciliation_id" uuid;

-- 3. Người phụ thuộc: giấy tờ hợp lệ (QĐ-192) — MST 10 số / 10 số-3 số, CCCD 12 số, giấy tờ khác ≥ 6 ký tự chữ-số. Thiếu họ
--    tên hoặc giấy tờ hợp lệ → "chưa đủ giấy tờ", không giảm trừ (kế toán thấy ở dòng lương + Thiết lập ban đầu).
UPDATE "salary_dependents" SET "info_pending" = true
 WHERE NOT "info_pending"
   AND (char_length(btrim("full_name")) < 2
        OR "id_number" IS NULL
        OR NOT (regexp_replace("id_number", '\s', '', 'g') ~ '^(\d{10}|\d{10}-\d{3}|\d{12}|[A-Za-z0-9]{6,30})$'));
