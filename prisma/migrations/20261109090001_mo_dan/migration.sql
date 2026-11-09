-- 0.22.0 — "Mở dần — bổ sung sau" (BUSINESS_RULES mục 33, QĐ-170 → QĐ-180).
-- Thiếu dữ liệu / thiết lập thì phần mềm vẫn chạy và cảnh báo; chỉ chặn khi vi phạm toàn vẹn hoặc bảo mật.
-- Chỉ THÊM: cột mới có mặc định, bảng mới, hàm mới. Không đổi dữ liệu cũ.

-- 1. Lịch mặc định của doanh nghiệp (QĐ-171): áp cho người chưa được gán lịch nào. Tối đa một lịch mặc định.
ALTER TABLE "work_schedules" ADD COLUMN "is_default" boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "work_schedules_mot_mac_dinh" ON "work_schedules" ("tenant_id") WHERE "is_default";

-- 2. Máy chấm công đăng ký trước, chọn địa điểm sau (Kỹ thuật không phải chờ Nhân sự).
ALTER TABLE "attendance_devices" ALTER COLUMN "location_id" DROP NOT NULL;

-- 3. Hình thức trả lương (QĐ-173): chuyển khoản / tiền mặt (trả tay). Thêm cột có mặc định không gọi trigger chỉ-ghi-thêm.
ALTER TABLE "salary_profiles" ADD COLUMN "payment_method" varchar(20) NOT NULL DEFAULT 'chuyen-khoan';
ALTER TABLE "salary_profiles" ADD CONSTRAINT "salary_profiles_hinh_thuc_tra_check" CHECK ("payment_method" IN ('chuyen-khoan', 'tien-mat'));
ALTER TABLE "payroll_lines" ADD COLUMN "pay_method" varchar(20);
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_hinh_thuc_tra_check" CHECK ("pay_method" IS NULL OR "pay_method" IN ('chuyen-khoan', 'tien-mat'));

-- 4. Công nhập tay trên dòng lương nháp (QĐ-172). Bất biến khi kỳ đã khóa — dùng chung trigger của kỳ lương.
CREATE TABLE "payroll_manual_inputs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "run_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "work_days" decimal(5, 2),
    "ot_minutes" integer NOT NULL DEFAULT 0,
    "unpaid_leave_days" decimal(5, 2) NOT NULL DEFAULT 0,
    "reason" text NOT NULL,
    "created_by" uuid NOT NULL,
    "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamptz(6) NOT NULL,
    CONSTRAINT "payroll_manual_inputs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payroll_manual_inputs_gia_tri_check" CHECK (
        ("work_days" IS NULL OR ("work_days" >= 0 AND "work_days" <= 31))
        AND "ot_minutes" >= 0 AND "ot_minutes" <= 300 * 60
        AND "unpaid_leave_days" >= 0 AND "unpaid_leave_days" <= 31
        AND char_length(btrim("reason")) >= 5)
);
CREATE UNIQUE INDEX "payroll_manual_inputs_run_id_user_id_key" ON "payroll_manual_inputs" ("run_id", "user_id");
CREATE INDEX "payroll_manual_inputs_tenant_id_run_id_idx" ON "payroll_manual_inputs" ("tenant_id", "run_id");
ALTER TABLE "payroll_manual_inputs" ADD CONSTRAINT "payroll_manual_inputs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_manual_inputs" ADD CONSTRAINT "payroll_manual_inputs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TRIGGER payroll_manual_inputs_khoa
    BEFORE INSERT OR UPDATE OR DELETE ON "payroll_manual_inputs"
    FOR EACH ROW EXECUTE FUNCTION public.chan_sua_ky_luong_da_khoa();

-- 5. Đặt công một ngày (QĐ-174): chỉ ghi thêm (rls.sql), không ghi được khi bảng công tháng đó đã khóa.
CREATE TABLE "attendance_manual_days" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "work_date" date NOT NULL,
    "work_value" decimal(3, 2) NOT NULL,
    "reason" text NOT NULL,
    "created_by" uuid NOT NULL,
    "created_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attendance_manual_days_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_manual_days_gia_tri_check" CHECK ("work_value" IN (0, 0.5, 1) AND char_length(btrim("reason")) >= 5)
);
CREATE INDEX "attendance_manual_days_tenant_id_user_id_work_date_created_at_idx" ON "attendance_manual_days" ("tenant_id", "user_id", "work_date", "created_at");
ALTER TABLE "attendance_manual_days" ADD CONSTRAINT "attendance_manual_days_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attendance_manual_days" ADD CONSTRAINT "attendance_manual_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION public.chan_cong_tay_ky_da_khoa() RETURNS trigger AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM timesheets t
         WHERE t.tenant_id = NEW.tenant_id AND t.status = 'da-khoa'
           AND t.year = EXTRACT(YEAR FROM NEW.work_date)::int AND t.month = EXTRACT(MONTH FROM NEW.work_date)::int
    ) THEN
        RAISE EXCEPTION 'Bang cong thang nay da khoa, khong dat cong tay duoc.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER attendance_manual_days_ky_khoa
    BEFORE INSERT ON "attendance_manual_days"
    FOR EACH ROW EXECUTE FUNCTION public.chan_cong_tay_ky_da_khoa();

-- 6. Máy lạ (QĐ-175): SN chưa đăng ký gọi /iclock. Bảng KHÔNG có tenant_id và ứng dụng KHÔNG có quyền trên bảng
--    (rls.sql REVOKE + RLS bật, không chính sách) — chỉ qua ba hàm SECURITY DEFINER dưới đây.
CREATE TABLE "attendance_unknown_devices" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "serial_number" varchar(64) NOT NULL,
    "last_ip" varchar(45),
    "first_seen_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hit_count" integer NOT NULL DEFAULT 1,
    "model" varchar(100),
    CONSTRAINT "attendance_unknown_devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "attendance_unknown_devices_so_seri_check" CHECK ("serial_number" ~ '^[A-Za-z0-9_-]{4,64}$')
);
CREATE UNIQUE INDEX "attendance_unknown_devices_serial_number_key" ON "attendance_unknown_devices" ("serial_number");
ALTER TABLE "attendance_unknown_devices" ENABLE ROW LEVEL SECURITY;

-- Ghi / cập nhật một máy lạ. Bỏ qua SN đã đăng ký ở BẤT KỲ doanh nghiệp nào (kể cả máy đã ngừng). Trần: tối đa
-- p_tran dòng toàn hệ thống (dòng im lặng quá 30 ngày được dọn trước khi đếm); vượt trần → không ghi máy mới.
CREATE OR REPLACE FUNCTION public.ghi_may_la(p_sn text, p_ip text, p_model text, p_tran integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    sn text := upper(p_sn);
BEGIN
    IF sn !~ '^[A-Z0-9_-]{4,64}$' THEN RETURN false; END IF;
    IF EXISTS (SELECT 1 FROM attendance_devices d WHERE upper(d.serial_number) = sn) THEN RETURN false; END IF;
    UPDATE attendance_unknown_devices
       SET last_ip = left(p_ip, 45), last_seen_at = now(), hit_count = LEAST(hit_count + 1, 2000000000),
           model = COALESCE(left(p_model, 100), model)
     WHERE serial_number = sn;
    IF FOUND THEN RETURN true; END IF;
    DELETE FROM attendance_unknown_devices WHERE last_seen_at < now() - interval '30 days';
    IF (SELECT count(*) FROM attendance_unknown_devices) >= p_tran THEN RETURN false; END IF;
    INSERT INTO attendance_unknown_devices (serial_number, last_ip, model) VALUES (sn, left(p_ip, 45), left(p_model, 100))
    ON CONFLICT (serial_number) DO NOTHING;
    RETURN true;
END;
$$;

-- Danh sách máy lạ một doanh nghiệp được thấy (cách ly giữa doanh nghiệp, QĐ-175): máy gọi từ CÙNG IP với người đang
-- xem, hoặc từ IP mà một máy ĐÃ ĐĂNG KÝ của chính doanh nghiệp (đọc từ app.tenant_id) từng gọi, hoặc khớp ĐÚNG SN
-- người xem gõ vào. Không có ngữ cảnh doanh nghiệp → không thấy gì.
CREATE OR REPLACE FUNCTION public.ds_may_la(p_ip_nguoi_xem text, p_sn text)
RETURNS TABLE (serial_number text, last_ip text, first_seen_at timestamptz, last_seen_at timestamptz, hit_count integer, model text, cung_ip_nguoi_xem boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT u.serial_number::text, u.last_ip::text, u.first_seen_at, u.last_seen_at, u.hit_count, u.model::text,
           (p_ip_nguoi_xem IS NOT NULL AND u.last_ip = p_ip_nguoi_xem)
      FROM attendance_unknown_devices u
     WHERE NULLIF(current_setting('app.tenant_id', true), '') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM attendance_devices d WHERE upper(d.serial_number) = u.serial_number)
       AND (
            (p_ip_nguoi_xem IS NOT NULL AND u.last_ip = p_ip_nguoi_xem)
         OR (p_sn IS NOT NULL AND u.serial_number = upper(p_sn))
         OR u.last_ip IN (SELECT d.last_ip FROM attendance_devices d
                           WHERE d.tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid AND d.last_ip IS NOT NULL)
       )
     ORDER BY u.last_seen_at DESC
     LIMIT 50
$$;

-- Xóa dòng máy lạ khi SN đã được đăng ký (gọi sau khi tạo máy). SN chưa đăng ký thì không xóa được.
CREATE OR REPLACE FUNCTION public.xoa_may_la(p_sn text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    n integer;
BEGIN
    DELETE FROM attendance_unknown_devices u
     WHERE u.serial_number = upper(p_sn)
       AND EXISTS (SELECT 1 FROM attendance_devices d WHERE upper(d.serial_number) = upper(p_sn));
    GET DIAGNOSTICS n = ROW_COUNT;
    RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.ghi_may_la(text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ds_may_la(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.xoa_may_la(text) FROM PUBLIC;
