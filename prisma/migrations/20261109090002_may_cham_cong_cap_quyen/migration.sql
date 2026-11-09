-- 0.22.0 — Quyền mới `may_cham_cong.*` (QĐ-176) cho MỌI doanh nghiệp đang có, theo mẫu QĐ-117.
--
-- Kỹ thuật kết nối máy chấm công mà KHÔNG thấy hồ sơ nhân sự hay lương: đăng ký máy, sửa tên / địa điểm, xem trạng thái,
-- máy lạ, ánh xạ PIN ↔ nhân viên (chỉ thấy tên). Cấp view / create / update cho Giám đốc, Quản trị (mọi mã, lối thoát),
-- Trưởng phòng Kỹ thuật, Kỹ thuật viên, Nhân sự (HR). Phạm vi 'all' (máy là tài sản chung của doanh nghiệp).
-- Trợ lý AI KHÔNG có (gỡ nếu lỡ có). Vai trò tự tạo không bị đụng tới.
-- IDEMPOTENT, một khối DO; định nghĩa khớp src/lib/vai-tro.ts + prisma/seed/index.ts (bài thử thu-mo-dan so hai đường).
DO $$
DECLARE
    t record;
BEGIN
    INSERT INTO "permissions" ("id", "code", "module", "action", "description", "status", "created_at", "updated_at")
    SELECT gen_random_uuid(), 'may_cham_cong.' || a, 'may_cham_cong', a,
           (CASE a WHEN 'view' THEN 'Xem' WHEN 'create' THEN 'Tạo' WHEN 'update' THEN 'Sửa' WHEN 'delete' THEN 'Xóa'
                   WHEN 'approve' THEN 'Duyệt' ELSE 'Xuất dữ liệu' END) || ' phân hệ Máy chấm công',
           'hoat-dong', now(), now()
    FROM unnest(ARRAY['view', 'create', 'update', 'delete', 'approve', 'export']) AS a
    ON CONFLICT ("code") DO NOTHING;

    FOR t IN SELECT "id" FROM "tenants" ORDER BY "code" LOOP
        INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
        SELECT gen_random_uuid(), t."id", r."id", p."id", 'all', 'hoat-dong', now(), now()
        FROM "roles" r JOIN "permissions" p ON p."module" = 'may_cham_cong'
        WHERE r."tenant_id" = t."id" AND r."code" IN ('ceo', 'admin')
        ON CONFLICT ("role_id", "permission_id") DO NOTHING;

        INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
        SELECT gen_random_uuid(), t."id", r."id", p."id", 'all', 'hoat-dong', now(), now()
        FROM "roles" r JOIN "permissions" p ON p."code" IN ('may_cham_cong.view', 'may_cham_cong.create', 'may_cham_cong.update')
        WHERE r."tenant_id" = t."id" AND r."is_built_in" AND r."code" IN ('technical-manager', 'technical', 'nhan-su-hr')
        ON CONFLICT ("role_id", "permission_id") DO NOTHING;

        DELETE FROM "role_permissions" rp USING "roles" r, "permissions" p
        WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id"
          AND r."tenant_id" = t."id" AND r."code" = 'ai-assistant' AND p."module" = 'may_cham_cong';
    END LOOP;
END $$;
