-- 0.22.0 — chính sách sau QA (QĐ-181 → QĐ-188). Chỉ thêm: cột, bảng, hàm. Dữ liệu cũ: máy đã đăng ký coi như ĐÃ XÁC MINH.

-- 1. Xác minh sở hữu máy chấm công (QĐ-181).
--    Cột thêm với mặc định 'da-xac-minh' → mọi máy đăng ký trước bản này coi như đã xác minh; sau đó đổi mặc định sang
--    'cho-xac-minh' để máy tạo mới (kể cả tạo thẳng bằng SQL) không bao giờ mặc nhiên được tin.
ALTER TABLE "attendance_devices" ADD COLUMN "verify_status" varchar(20) NOT NULL DEFAULT 'da-xac-minh';
ALTER TABLE "attendance_devices" ALTER COLUMN "verify_status" SET DEFAULT 'cho-xac-minh';
ALTER TABLE "attendance_devices" ADD COLUMN "verify_pin" varchar(6);
ALTER TABLE "attendance_devices" ADD COLUMN "verify_expires_at" timestamptz(6);
ALTER TABLE "attendance_devices" ADD COLUMN "verified_at" timestamptz(6);
ALTER TABLE "attendance_devices" ADD CONSTRAINT "attendance_devices_xac_minh_check"
    CHECK ("verify_status" IN ('da-xac-minh', 'cho-xac-minh') AND ("verify_pin" IS NULL OR "verify_pin" ~ '^[1-9][0-9]{5}$'));

-- Khu cách ly: KHÔNG có tenant_id, ứng dụng không có quyền trên bảng (rls.sql REVOKE + RLS bật, không chính sách).
CREATE TABLE "attendance_quarantine_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "device_id" uuid NOT NULL,
    "pin" varchar(20) NOT NULL,
    "punched_at" timestamptz(6) NOT NULL,
    "status" integer,
    "verify_code" integer,
    "work_code" varchar(20),
    "raw_line" varchar(500),
    "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_quarantine_logs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "attendance_quarantine_logs_device_id_pin_punched_at_key" ON "attendance_quarantine_logs" ("device_id", "pin", "punched_at");
ALTER TABLE "attendance_quarantine_logs" ADD CONSTRAINT "attendance_quarantine_logs_device_id_fkey"
    FOREIGN KEY ("device_id") REFERENCES "attendance_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_quarantine_logs" ENABLE ROW LEVEL SECURITY;

-- Ghi log vào khu cách ly: chỉ cho máy CHỜ XÁC MINH thuộc doanh nghiệp của phiên (app.tenant_id). Trần 200.000 dòng / máy.
CREATE OR REPLACE FUNCTION public.ghi_log_cach_ly(p_device uuid, p_dong jsonb)
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
    ) THEN
        RETURN 0;
    END IF;
    con := 200000 - (SELECT count(*) FROM public.attendance_quarantine_logs q WHERE q.device_id = p_device);
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

-- Lấy (và xóa) log cách ly: chỉ khi máy ĐÃ XÁC MINH và thuộc doanh nghiệp của phiên — dùng ngay sau khi kích hoạt.
CREATE OR REPLACE FUNCTION public.lay_log_cach_ly(p_device uuid)
RETURNS TABLE (pin text, punched_at timestamptz, status integer, verify_code integer, work_code text, raw_line text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.attendance_devices d
         WHERE d.id = p_device AND d.verify_status = 'da-xac-minh'
           AND d.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    ) THEN
        RETURN;
    END IF;
    RETURN QUERY
        DELETE FROM public.attendance_quarantine_logs q WHERE q.device_id = p_device
        RETURNING q.pin::text, q.punched_at, q.status, q.verify_code, q.work_code::text, q.raw_line::text;
END;
$$;

-- Số dòng đang cách ly của một máy CHỜ XÁC MINH của doanh nghiệp phiên (chỉ con số, không nội dung).
CREATE OR REPLACE FUNCTION public.dem_log_cach_ly(p_device uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT count(*)::integer FROM public.attendance_quarantine_logs q
      JOIN public.attendance_devices d ON d.id = q.device_id
     WHERE q.device_id = p_device AND d.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

-- Giải phóng SN bị doanh nghiệp KHÁC đăng ký mà CHƯA XÁC MINH quá 24 giờ (chống chiếm chỗ): xóa máy đó + log cách ly.
CREATE OR REPLACE FUNCTION public.giai_phong_sn_cho_xac_minh(p_sn text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    n integer;
BEGIN
    DELETE FROM public.attendance_devices d
     WHERE upper(d.serial_number) = upper(p_sn) AND d.verify_status = 'cho-xac-minh'
       AND d.created_at < now() - interval '24 hours'
       AND d.tenant_id IS DISTINCT FROM NULLIF(current_setting('app.tenant_id', true), '')::uuid
       AND NOT EXISTS (SELECT 1 FROM public.attendance_punches p WHERE p.device_id = d.id);
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.ghi_log_cach_ly(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lay_log_cach_ly(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dem_log_cach_ly(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.giai_phong_sn_cho_xac_minh(text) FROM PUBLIC;
-- Quyền EXECUTE cho cowork_app cấp ở prisma/rls.sql.

-- 2. Người phụ thuộc "chưa ghi tên" (QĐ-182): không giảm trừ tới khi có họ tên + MST / số giấy tờ.
ALTER TABLE "salary_dependents" ADD COLUMN "info_pending" boolean NOT NULL DEFAULT false;
UPDATE "salary_dependents" SET "info_pending" = true
 WHERE "relationship" = 'chưa ghi' AND "full_name" LIKE '%(nhập CSV — bổ sung họ tên)%';

-- 3. Lịch mặc định áp từ ngày chọn (QĐ-187): lịch sử chỉ ghi thêm. Lịch mặc định đang có (chỉ có ở bản 0.22 thử) → áp từ 2000.
CREATE TABLE "default_schedule_changes" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "schedule_id" uuid NOT NULL,
    "effective_from" date NOT NULL,
    "created_by" uuid,
    "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "default_schedule_changes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "default_schedule_changes_tenant_id_effective_from_idx" ON "default_schedule_changes" ("tenant_id", "effective_from");
ALTER TABLE "default_schedule_changes" ADD CONSTRAINT "default_schedule_changes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "default_schedule_changes" ADD CONSTRAINT "default_schedule_changes_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "work_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "default_schedule_changes" ("tenant_id", "schedule_id", "effective_from")
SELECT s."tenant_id", s."id", DATE '2000-01-01' FROM "work_schedules" s WHERE s."is_default"
  AND NOT EXISTS (SELECT 1 FROM "default_schedule_changes" c WHERE c."tenant_id" = s."tenant_id");
