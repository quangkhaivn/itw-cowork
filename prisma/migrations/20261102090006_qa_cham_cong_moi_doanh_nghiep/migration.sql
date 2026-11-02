-- 0.19.0 QA — QĐ-117: dữ liệu nền Nhân sự cho MỌI doanh nghiệp đang có, không chỉ doanh nghiệp seed (`itw`).
-- Seed trước đây chỉ chạy cho SEED_MA_TENANT, nên doanh nghiệp khác sau nâng cấp thiếu: vai trò Nhân sự (HR) /
-- Thực tập sinh, 4 loại nghỉ, quyền chấm công + nhân sự cho Giám đốc / Quản trị (không ai mở được phân hệ).
--
-- IDEMPOTENT: chạy lại bao nhiêu lần cũng không đổi gì thêm (ON CONFLICT DO NOTHING). KHÔNG đè chỉnh sửa của
-- con người: vai trò Nhân sự / Thực tập sinh đã có (kể cả đã sửa quyền trên màn hình Vai trò) giữ nguyên — chỉ
-- vai trò VỪA TẠO mới được cấp quyền; loại nghỉ đã có (kể cả đã tắt / đổi tên) giữ nguyên.
-- Định nghĩa phải khớp src/lib/vai-tro.ts + prisma/seed/index.ts (bài thử thu-qa-cham-cong so sánh hai đường).
-- Khóa Cấu hình nhóm Chấm công / Nghỉ phép KHÔNG cần dòng: chưa đặt = mặc định của danh mục (mọi doanh nghiệp).
-- Viết thành MỘT khối DO để bài thử chạy lại được nguyên văn tệp này.
DO $$
DECLARE
    t record;
    vt_id uuid;
BEGIN
    INSERT INTO "permissions" ("id", "code", "module", "action", "description", "status", "created_at", "updated_at")
    SELECT gen_random_uuid(), m || '.' || a, m, a,
           (CASE a WHEN 'view' THEN 'Xem' WHEN 'create' THEN 'Tạo' WHEN 'update' THEN 'Sửa' WHEN 'delete' THEN 'Xóa'
                   WHEN 'approve' THEN 'Duyệt' ELSE 'Xuất dữ liệu' END)
           || ' phân hệ ' || (CASE m WHEN 'cham_cong' THEN 'Chấm công' ELSE 'Nhân sự' END),
           'hoat-dong', now(), now()
    FROM unnest(ARRAY['cham_cong', 'nhan_su']) AS m
    CROSS JOIN unnest(ARRAY['view', 'create', 'update', 'delete', 'approve', 'export']) AS a
    ON CONFLICT ("code") DO NOTHING;

    FOR t IN SELECT "id" FROM "tenants" ORDER BY "code" LOOP
        -- Giám đốc / Quản trị: lối thoát luôn đủ quyền (như seed) — mọi mã cham_cong.* / nhan_su.*, phạm vi all.
        INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
        SELECT gen_random_uuid(), t."id", r."id", p."id", 'all', 'hoat-dong', now(), now()
        FROM "roles" r
        JOIN "permissions" p ON p."module" IN ('cham_cong', 'nhan_su')
        WHERE r."tenant_id" = t."id" AND r."code" IN ('ceo', 'admin')
        ON CONFLICT ("role_id", "permission_id") DO NOTHING;

        -- Vai trò Nhân sự (HR) — chỉ cấp quyền khi VỪA tạo.
        vt_id := NULL;
        INSERT INTO "roles" ("id", "tenant_id", "code", "name", "description", "is_built_in", "status", "created_at", "updated_at")
        VALUES (gen_random_uuid(), t."id", 'nhan-su-hr', 'Nhân sự (HR)',
                'Hồ sơ nhân sự, ca làm, máy chấm công, duyệt nghỉ phép / tăng ca, bảng công tháng.', true, 'hoat-dong', now(), now())
        ON CONFLICT ("tenant_id", "code") DO NOTHING
        RETURNING "id" INTO vt_id;
        IF vt_id IS NOT NULL THEN
            INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
            SELECT gen_random_uuid(), t."id", vt_id, p."id", CASE WHEN p."module" = 'task' THEN 'own' ELSE 'all' END, 'hoat-dong', now(), now()
            FROM "permissions" p
            WHERE p."code" IN (
                'cham_cong.view', 'cham_cong.create', 'cham_cong.update', 'cham_cong.approve', 'cham_cong.export',
                'nhan_su.view', 'nhan_su.create', 'nhan_su.update', 'nhan_su.export',
                'user.view', 'department.view',
                'task.view', 'task.create', 'task.update', 'task.export',
                'dashboard.view', 'alert.view')
            ON CONFLICT ("role_id", "permission_id") DO NOTHING;
        END IF;

        -- Vai trò Thực tập sinh — công việc + chấm công của chính mình; chỉ cấp quyền khi VỪA tạo.
        vt_id := NULL;
        INSERT INTO "roles" ("id", "tenant_id", "code", "name", "description", "is_built_in", "status", "created_at", "updated_at")
        VALUES (gen_random_uuid(), t."id", 'sinh-vien-thuc-tap', 'Thực tập sinh',
                'Sinh viên thực tập: chỉ xem / cập nhật công việc được giao và chấm công của chính mình.', true, 'hoat-dong', now(), now())
        ON CONFLICT ("tenant_id", "code") DO NOTHING
        RETURNING "id" INTO vt_id;
        IF vt_id IS NOT NULL THEN
            INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
            SELECT gen_random_uuid(), t."id", vt_id, p."id", 'own', 'hoat-dong', now(), now()
            FROM "permissions" p
            WHERE p."code" IN ('task.view', 'task.update', 'cham_cong.view', 'cham_cong.create')
            ON CONFLICT ("role_id", "permission_id") DO NOTHING;
        END IF;

        -- 4 loại nghỉ khởi tạo — chỉ thêm loại còn thiếu.
        INSERT INTO "leave_types" ("id", "tenant_id", "code", "name", "paid", "uses_balance", "sort_order", "status", "created_at", "updated_at")
        SELECT gen_random_uuid(), t."id", l.ma, l.ten, l.co_luong, l.tru_phep, l.thu_tu, 'hoat-dong', now(), now()
        FROM (VALUES
            ('phep-nam', 'Phép năm', true, true, 10),
            ('viec-rieng-co-luong', 'Việc riêng có lương (cưới, tang…)', true, false, 20),
            ('om-dau', 'Ốm đau (BHXH chi trả)', false, false, 30),
            ('khong-luong', 'Nghỉ không lương', false, false, 40)
        ) AS l(ma, ten, co_luong, tru_phep, thu_tu)
        ON CONFLICT ("tenant_id", "code") DO NOTHING;
    END LOOP;
END $$;
