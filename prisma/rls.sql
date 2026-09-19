-- ============================================================================
-- Cowork Business OS — ITW
-- Lớp chặn thứ hai: Row Level Security.
--
-- Vì sao cần: mục 30 đặc tả cấm "trộn dữ liệu giữa tenant". Nếu chỉ dựa vào
-- code nhớ lọc tenant_id thì chỉ cần một lập trình viên quên một chỗ là rò dữ
-- liệu của doanh nghiệp này sang doanh nghiệp khác, và không có cách nào phát
-- hiện tự động. RLS biến việc quên đó thành "trả về 0 dòng" thay vì "trả nhầm".
--
-- Cách hoạt động:
--   - Ứng dụng kết nối bằng vai `cowork_app`, KHÔNG phải chủ sở hữu bảng.
--     PostgreSQL chỉ áp RLS cho vai không phải chủ sở hữu, nên migration và seed
--     (chạy bằng vai chủ sở hữu) vẫn làm việc bình thường.
--   - Mỗi giao dịch đặt `app.tenant_id` qua set_config (xem src/lib/db.ts).
--   - Nếu quên đặt, phép so sánh ra NULL và mọi dòng bị lọc. Không có ngữ cảnh
--     thì không thấy gì.
--   - Vì sao phải bọc NULLIF: sau khi giao dịch dùng SET LOCAL kết thúc,
--     PostgreSQL trả biến tùy biến về CHUỖI RỖNG chứ không phải NULL. Ép ''
--     sang uuid sẽ ném lỗi cú pháp thay vì lọc sạch. NULLIF biến '' thành NULL
--     để hành vi đúng là "không thấy dòng nào". Bài thử cách ly đã bắt lỗi này.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Thu hồi quyền mặc định, chỉ cấp lại đúng thứ cần
-- --------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO cowork_app;

-- --------------------------------------------------------------------------
-- 2. Bảng có tenant_id: đọc/ghi trong phạm vi tenant của phiên
-- --------------------------------------------------------------------------
DO $$
DECLARE
    ten_bang text;
    ds_bang text[] := ARRAY[
        'tenant_settings',
        'departments',
        'users',
        'staff_profiles',
        'roles',
        'role_permissions',
        'user_roles'
    ];
BEGIN
    FOREACH ten_bang IN ARRAY ds_bang LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', ten_bang);
        EXECUTE format('DROP POLICY IF EXISTS cach_ly_tenant ON public.%I', ten_bang);
        EXECUTE format($f$
            CREATE POLICY cach_ly_tenant ON public.%I
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
                WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        $f$, ten_bang);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO cowork_app', ten_bang);
    END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- 3. Bảng chỉ ghi thêm: business_events và audit_logs
--    Không cấp UPDATE/DELETE cho ứng dụng, và chặn thêm bằng trigger để kể cả
--    chủ sở hữu cũng không lỡ tay sửa lịch sử.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chan_sua_xoa() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Bang % chi duoc ghi them. Khong duoc sua hoac xoa.', TG_TABLE_NAME
        USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
    ten_bang text;
    ds_bang text[] := ARRAY['business_events', 'audit_logs'];
BEGIN
    FOREACH ten_bang IN ARRAY ds_bang LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', ten_bang);
        EXECUTE format('DROP POLICY IF EXISTS cach_ly_tenant ON public.%I', ten_bang);
        EXECUTE format($f$
            CREATE POLICY cach_ly_tenant ON public.%I
                USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
                WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        $f$, ten_bang);
        -- Cố ý KHÔNG cấp UPDATE, DELETE.
        EXECUTE format('GRANT SELECT, INSERT ON public.%I TO cowork_app', ten_bang);

        EXECUTE format('DROP TRIGGER IF EXISTS chan_sua_xoa_%I ON public.%I', ten_bang, ten_bang);
        EXECUTE format($f$
            CREATE TRIGGER chan_sua_xoa_%I
                BEFORE UPDATE OR DELETE ON public.%I
                FOR EACH ROW EXECUTE FUNCTION public.chan_sua_xoa()
        $f$, ten_bang, ten_bang);
    END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- 4. Bảng `tenants`: sổ đăng ký doanh nghiệp.
--    Ứng dụng cần đọc để tra mã lúc đăng nhập (khi đó chưa biết tenant nào),
--    nhưng KHÔNG được sửa. Bảng này không chứa dữ liệu khách hàng.
-- --------------------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_so_dang_ky ON public.tenants;
CREATE POLICY doc_so_dang_ky ON public.tenants
    FOR SELECT
    USING (status = 'hoat-dong');
GRANT SELECT ON public.tenants TO cowork_app;

-- --------------------------------------------------------------------------
-- 5. Bảng `permissions`: danh mục quyền toàn hệ thống, chỉ đọc.
-- --------------------------------------------------------------------------
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_danh_muc_quyen ON public.permissions;
CREATE POLICY doc_danh_muc_quyen ON public.permissions
    FOR SELECT
    USING (true);
GRANT SELECT ON public.permissions TO cowork_app;

-- --------------------------------------------------------------------------
-- 6. Bảng ghi lịch sử migration của Prisma: ứng dụng không cần đụng tới.
-- --------------------------------------------------------------------------
REVOKE ALL ON public._prisma_migrations FROM cowork_app;
