-- 0.19.0 — cấp bù quyền chấm công cho vai trò dựng sẵn ĐÃ CÓ trên máy thật (QĐ-10, QĐ-104).
-- Seed chỉ cấp mã quyền "mới xuất hiện" cho vai trò đã có; nếu mã đã nằm trong bảng permissions (vd do
-- một lần seed / bài thử trước), vai trò cũ sẽ không bao giờ nhận. Migration này cấp đúng như
-- src/lib/vai-tro.ts: nhân viên `own` (xem + tự chấm / gửi đơn), trưởng phòng thêm `approve` theo phạm vi.
-- Giám đốc / Quản trị luôn được seed đồng bộ đủ toàn quyền; vai trò Nhân sự, Thực tập sinh do seed tạo mới.

INSERT INTO "permissions" ("id", "code", "module", "action", "description", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), m || '.' || a, m, a,
       (CASE a WHEN 'view' THEN 'Xem' WHEN 'create' THEN 'Tạo' WHEN 'update' THEN 'Sửa' WHEN 'delete' THEN 'Xóa'
               WHEN 'approve' THEN 'Duyệt' ELSE 'Xuất dữ liệu' END)
       || ' phân hệ ' || (CASE m WHEN 'cham_cong' THEN 'Chấm công' ELSE 'Nhân sự' END),
       'hoat-dong', now(), now()
FROM unnest(ARRAY['cham_cong', 'nhan_su']) AS m
CROSS JOIN unnest(ARRAY['view', 'create', 'update', 'delete', 'approve', 'export']) AS a
ON CONFLICT ("code") DO NOTHING;

-- Nhân viên: xem + tự chấm công / gửi đơn, phạm vi "own".
INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), r."tenant_id", r."id", p."id", 'own', 'hoat-dong', now(), now()
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('cham_cong.view', 'cham_cong.create')
WHERE r."is_built_in"
  AND r."code" IN ('sales', 'marketing', 'technical', 'purchasing', 'warehouse', 'finance', 'customer-service', 'marketing-intern')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

-- Trưởng phòng: xem + chấm + duyệt theo phạm vi của vai trò.
INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), r."tenant_id", r."id", p."id",
       CASE r."code" WHEN 'technical-manager' THEN 'department' ELSE 'team' END,
       'hoat-dong', now(), now()
FROM "roles" r
JOIN "permissions" p ON p."code" IN ('cham_cong.view', 'cham_cong.create', 'cham_cong.approve')
WHERE r."is_built_in"
  AND r."code" IN ('sales-manager', 'marketing-manager', 'technical-manager', 'project-manager')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
