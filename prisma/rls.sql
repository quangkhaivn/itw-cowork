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
--
--    Danh sách bảng KHÔNG viết tay nữa (từ 19/09/2026): quét mọi bảng trong
--    schema public có cột tenant_id. Viết tay thì bảng mới của phase sau dễ bị
--    quên — và bảng bị quên nghĩa là không có RLS, tức rò dữ liệu mà không ai
--    biết. Bảng chỉ-ghi-thêm được loại ra ở đây và xử lý riêng ở mục 3.
-- --------------------------------------------------------------------------
DO $$
DECLARE
    ten_bang text;
BEGIN
    FOR ten_bang IN
        SELECT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND c.column_name = 'tenant_id'
          AND t.table_type = 'BASE TABLE'
          AND c.table_name NOT IN ('business_events', 'audit_logs', 'email_consents', 'email_sns_messages',
                                   'attendance_consents', 'attendance_punch_reviews', 'leave_adjustments',
                                   'task_approval_logs', 'task_score_adjustments', 'task_progress_logs',
                                   'work_report_comments', 'evaluation_adjustments', 'intern_journal_comments', 'attendance_day_reviews',
                                   'salary_profiles', 'approval_transfers', 'attendance_manual_days', 'default_schedule_changes')
        ORDER BY c.table_name
    LOOP
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
-- 3. Bảng chỉ ghi thêm: business_events, audit_logs, và (0.18.0) sổ đồng ý
--    email_consents + nhật ký thông điệp SNS email_sns_messages, (0.19.0) xác nhận
--    thông báo vị trí attendance_consents, quyết định xem xét lần chấm
--    attendance_punch_reviews, điều chỉnh quỹ phép leave_adjustments, và (0.20.0) lịch
--    sử duyệt việc task_approval_logs, điều chỉnh điểm việc task_score_adjustments, nhật ký
--    tiến độ task_progress_logs, nhận xét báo cáo work_report_comments, phiên điều chỉnh
--    đánh giá evaluation_adjustments, nhận xét nhật ký thực tập intern_journal_comments,
--    và (QA 0.19.0) xét ngày công thiếu giờ attendance_day_reviews (QĐ-116), và (0.21.0) phiên bản
--    hồ sơ lương salary_profiles (LU-02 — sửa = phiên bản mới),
--    (0.20.0 chính sách) lịch sử chuyển bước duyệt approval_transfers (QĐ-135),
--    (0.22.0) đặt công một ngày attendance_manual_days (QĐ-174 — bản ghi sau thắng)
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
    ds_bang text[] := ARRAY['business_events', 'audit_logs', 'email_consents', 'email_sns_messages',
                            'attendance_consents', 'attendance_punch_reviews', 'leave_adjustments',
                            'task_approval_logs', 'task_score_adjustments', 'task_progress_logs',
                            'work_report_comments', 'evaluation_adjustments', 'intern_journal_comments', 'attendance_day_reviews',
                            'salary_profiles', 'approval_transfers', 'attendance_manual_days', 'default_schedule_changes'];
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
-- 3b. (0.19.0) Lần chấm công `attendance_punches`: chỉ ghi thêm (NS-10). Ứng dụng cần
--     UPDATE cho đúng một việc — gán người cho dòng PIN chưa khớp, trigger
--     chan_sua_lan_cham kiểm — nhưng KHÔNG bao giờ được xóa.
--     Hàm tra_may_cham_cong (SECURITY DEFINER, QĐ-104): máy chấm công gọi vào không
--     kèm doanh nghiệp; hàm trả doanh nghiệp của đúng một số sê-ri đang hoạt động.
-- --------------------------------------------------------------------------
REVOKE DELETE ON public.attendance_punches FROM cowork_app;
-- 0.21.0 (LU-10, LU-40): bộ tham số lương chỉ ghi thêm (UPDATE chỉ để đặt xác nhận — trigger chan_sua_tham_so_luong);
-- kỳ lương và các dòng của nó không bao giờ bị xóa bởi ứng dụng (sửa sai = khoản điều chỉnh kỳ sau). Dòng lương,
-- khoản cộng / trừ, hoa hồng của kỳ NHÁP vẫn xóa được (tính lại) — trigger chan_sua_ky_luong_da_khoa chặn kỳ đã khóa.
REVOKE DELETE ON public.payroll_param_sets FROM cowork_app;
REVOKE DELETE ON public.payroll_runs FROM cowork_app;
REVOKE ALL ON FUNCTION public.tra_may_cham_cong(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tra_may_cham_cong(text) TO cowork_app;
-- 0.22.0 (QĐ-175): MÁY LẠ — bảng không có tenant_id (chưa biết thuộc doanh nghiệp nào). Ứng dụng KHÔNG có quyền trực tiếp
-- (RLS bật, không chính sách); chỉ ghi qua ghi_may_la (đường /iclock), đọc qua ds_may_la (lọc theo IP người xem / IP máy
-- của doanh nghiệp / đúng SN, cần app.tenant_id), xóa qua xoa_may_la (chỉ khi SN đã được đăng ký).
REVOKE ALL ON public.attendance_unknown_devices FROM cowork_app;
ALTER TABLE public.attendance_unknown_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION public.ghi_may_la(text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ds_may_la(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.xoa_may_la(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ghi_may_la(text, text, text, integer) TO cowork_app;
GRANT EXECUTE ON FUNCTION public.ds_may_la(text, text) TO cowork_app;
GRANT EXECUTE ON FUNCTION public.xoa_may_la(text) TO cowork_app;
-- 0.22.0 (QĐ-181): KHU CÁCH LY lần chấm của máy chờ xác minh — không tenant_id, ứng dụng không có quyền trên bảng; chỉ qua
-- ghi_log_cach_ly (máy chờ xác minh của doanh nghiệp phiên), lay_log_cach_ly (máy đã xác minh của doanh nghiệp phiên),
-- dem_log_cach_ly (chỉ con số), giai_phong_sn_cho_xac_minh (SN doanh nghiệp khác chiếm > 24 giờ chưa xác minh).
REVOKE ALL ON public.attendance_quarantine_logs FROM cowork_app;
ALTER TABLE public.attendance_quarantine_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION public.ghi_log_cach_ly(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lay_log_cach_ly(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dem_log_cach_ly(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.giai_phong_sn_cho_xac_minh(text) FROM PUBLIC;
-- 0.22.0 (QĐ-190): bản 2 tham số không kiểm IP thôi dùng — thu hồi; ứng dụng dùng bản có IP (ghim IP khi xác minh).
REVOKE ALL ON FUNCTION public.ghi_log_cach_ly(uuid, jsonb) FROM cowork_app;
REVOKE ALL ON FUNCTION public.ghi_log_cach_ly(uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ghi_log_cach_ly(uuid, jsonb, text) TO cowork_app;
REVOKE ALL ON FUNCTION public.ip_may_la_truoc_dang_ky(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ip_may_la_truoc_dang_ky(text) TO cowork_app;
GRANT EXECUTE ON FUNCTION public.lay_log_cach_ly(uuid) TO cowork_app;
GRANT EXECUTE ON FUNCTION public.dem_log_cach_ly(uuid) TO cowork_app;
GRANT EXECUTE ON FUNCTION public.giai_phong_sn_cho_xac_minh(text) TO cowork_app;

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
-- 5b. Bảng `system_heartbeats` (0.16.1): nhịp sống worker và sao lưu — toàn hệ
--     thống, không có tenant_id, không chứa dữ liệu nghiệp vụ. Ứng dụng đọc được
--     mọi dòng (màn hình Tự động hóa, /api/khoe) nhưng CHỈ ghi được dòng tên
--     'worker…' — dòng 'sao-luu' do scripts/sao-luu.sh ghi bằng vai chủ sở hữu, để
--     một lỗi ở ứng dụng không thể "báo sao lưu ổn" thay cho script. Không cấp DELETE.
-- --------------------------------------------------------------------------
ALTER TABLE public.system_heartbeats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_nhip ON public.system_heartbeats;
CREATE POLICY doc_nhip ON public.system_heartbeats
    FOR SELECT
    USING (true);
DROP POLICY IF EXISTS them_nhip_worker ON public.system_heartbeats;
CREATE POLICY them_nhip_worker ON public.system_heartbeats
    FOR INSERT
    WITH CHECK (name LIKE 'worker%');
DROP POLICY IF EXISTS sua_nhip_worker ON public.system_heartbeats;
CREATE POLICY sua_nhip_worker ON public.system_heartbeats
    FOR UPDATE
    USING (name LIKE 'worker%')
    WITH CHECK (name LIKE 'worker%');
GRANT SELECT, INSERT, UPDATE ON public.system_heartbeats TO cowork_app;

-- --------------------------------------------------------------------------
-- 6. Bảng ghi lịch sử migration của Prisma: ứng dụng không cần đụng tới.
-- --------------------------------------------------------------------------
REVOKE ALL ON public._prisma_migrations FROM cowork_app;

-- --------------------------------------------------------------------------
-- 7. Tự kiểm: mọi bảng có tenant_id phải đang bật RLS. Sai thì dừng triển khai.
-- --------------------------------------------------------------------------
DO $$
DECLARE
    thieu text;
BEGIN
    SELECT string_agg(c.relname, ', ') INTO thieu
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
      AND EXISTS (
          SELECT 1 FROM information_schema.columns col
          WHERE col.table_schema = 'public' AND col.table_name = c.relname AND col.column_name = 'tenant_id'
      );
    IF thieu IS NOT NULL THEN
        RAISE EXCEPTION 'Bang co tenant_id nhung chua bat RLS: %', thieu;
    END IF;
END $$;
