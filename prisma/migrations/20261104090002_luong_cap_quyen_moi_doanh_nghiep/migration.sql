-- 0.21.0 — Tính lương: QUYỀN + DỮ LIỆU NỀN cho MỌI doanh nghiệp đang có (như QĐ-117 của 0.19.0).
--
-- IDEMPOTENT (chạy lại bao nhiêu lần cũng không đổi gì thêm) và viết thành MỘT khối DO để bài thử chạy lại nguyên văn.
-- Định nghĩa phải khớp src/lib/vai-tro.ts (quyền), src/modules/luong/tinh-toan.ts (THAM_SO_MAC_DINH, PHU_CAP_MAC_DINH)
-- và prisma/seed/index.ts — bài thử thu-luong so dữ liệu tạo bằng migration với dữ liệu tạo bằng seed.
--
-- Quyền `luong.*` (QĐ-141): Giám đốc / Quản trị toàn quyền; Kế toán (`finance`) xem toàn công ty + tính + xuất;
-- Nhân sự (`nhan-su-hr`) xem toàn công ty + hồ sơ lương (KHÔNG duyệt); mọi vai trò dựng sẵn khác xem phiếu CỦA MÌNH
-- (`luong.view` phạm vi own). Trợ lý AI KHÔNG BAO GIỜ có `luong.*` (gỡ nếu lỡ có). Vai trò tự tạo không bị đụng tới.
-- Tham số lương nạp sẵn (source = 'mac-dinh', CHƯA xác nhận — LU-11): chỉ thêm bộ (loại, ngày hiệu lực) còn thiếu.
-- Danh mục phụ cấp nạp sẵn: chỉ thêm mã còn thiếu.
DO $$
DECLARE
    t record;
BEGIN
    INSERT INTO "permissions" ("id", "code", "module", "action", "description", "status", "created_at", "updated_at")
    SELECT gen_random_uuid(), 'luong.' || a, 'luong', a,
           (CASE a WHEN 'view' THEN 'Xem' WHEN 'create' THEN 'Tạo' WHEN 'update' THEN 'Sửa' WHEN 'delete' THEN 'Xóa'
                   WHEN 'approve' THEN 'Duyệt' ELSE 'Xuất dữ liệu' END) || ' phân hệ Tính lương',
           'hoat-dong', now(), now()
    FROM unnest(ARRAY['view', 'create', 'update', 'delete', 'approve', 'export']) AS a
    ON CONFLICT ("code") DO NOTHING;

    FOR t IN SELECT "id" FROM "tenants" ORDER BY "code" LOOP
        -- Giám đốc / Quản trị: mọi mã luong.*, phạm vi all (lối thoát, như seed).
        INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
        SELECT gen_random_uuid(), t."id", r."id", p."id", 'all', 'hoat-dong', now(), now()
        FROM "roles" r JOIN "permissions" p ON p."module" = 'luong'
        WHERE r."tenant_id" = t."id" AND r."code" IN ('ceo', 'admin')
        ON CONFLICT ("role_id", "permission_id") DO NOTHING;

        -- Kế toán: xem toàn công ty, tính, xuất (không duyệt / khóa).
        INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
        SELECT gen_random_uuid(), t."id", r."id", p."id", 'all', 'hoat-dong', now(), now()
        FROM "roles" r JOIN "permissions" p ON p."code" IN ('luong.view', 'luong.create', 'luong.export')
        WHERE r."tenant_id" = t."id" AND r."is_built_in" AND r."code" = 'finance'
        ON CONFLICT ("role_id", "permission_id") DO NOTHING;

        -- Nhân sự: xem toàn công ty + hồ sơ lương (không duyệt).
        INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
        SELECT gen_random_uuid(), t."id", r."id", p."id", 'all', 'hoat-dong', now(), now()
        FROM "roles" r JOIN "permissions" p ON p."code" IN ('luong.view', 'luong.update')
        WHERE r."tenant_id" = t."id" AND r."is_built_in" AND r."code" = 'nhan-su-hr'
        ON CONFLICT ("role_id", "permission_id") DO NOTHING;

        -- Mọi nhân viên / thực tập sinh: phiếu lương của chính mình.
        INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
        SELECT gen_random_uuid(), t."id", r."id", p."id", 'own', 'hoat-dong', now(), now()
        FROM "roles" r JOIN "permissions" p ON p."code" = 'luong.view'
        WHERE r."tenant_id" = t."id" AND r."is_built_in"
          AND r."code" IN ('sales-manager', 'sales', 'marketing-manager', 'marketing', 'technical-manager', 'technical',
                           'project-manager', 'purchasing', 'warehouse', 'customer-service', 'marketing-intern', 'sinh-vien-thuc-tap')
        ON CONFLICT ("role_id", "permission_id") DO NOTHING;

        -- Bất biến: trợ lý AI không có luong.*.
        DELETE FROM "role_permissions" rp USING "roles" r, "permissions" p
        WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id"
          AND r."tenant_id" = t."id" AND r."code" = 'ai-assistant' AND p."module" = 'luong';

        -- Tham số lương nạp sẵn (chờ kế toán xác nhận).
        INSERT INTO "payroll_param_sets" ("id", "tenant_id", "kind", "effective_from", "values", "note", "source", "created_at")
        SELECT gen_random_uuid(), t."id", v.loai, v.hieu_luc, v.gia_tri, v.ghi_chu, 'mac-dinh', now()
        FROM (VALUES
            ('bao-hiem', DATE '2024-07-01', '{"nld":{"bhxh":8,"bhyt":1.5,"bhtn":1},"dn":{"bhxh":17.5,"bhyt":3,"bhtn":1,"kpcd":2},"luongCoSo":2340000,"tranLanLuongCoSo":20,"tranLanToiThieuVung":20,"ngayNghiKhongDong":14}'::jsonb, 'Nạp sẵn: lương cơ sở 2.340.000 đ từ 01/07/2024; NLĐ 8% / 1,5% / 1%, DN 17,5% / 3% / 1%, KPCĐ 2%.'),
            ('luong-toi-thieu-vung', DATE '2024-07-01', '{"vung":1,"mucVung":{"1":4960000,"2":4410000,"3":3860000,"4":3450000}}'::jsonb, 'Nạp sẵn: mức áp dụng từ 01/07/2024. Vùng của doanh nghiệp mặc định vùng I — sửa nếu khác.'),
            ('luong-toi-thieu-vung', DATE '2026-01-01', '{"vung":1,"mucVung":{"1":5310000,"2":4730000,"3":4140000,"4":3700000}}'::jsonb, 'Nạp sẵn: mức áp dụng từ 01/01/2026 theo hiểu biết lúc làm phần mềm — đối chiếu nghị định hiện hành.'),
            ('giam-tru', DATE '2020-07-01', '{"banThan":11000000,"nguoiPhuThuoc":4400000}'::jsonb, 'Nạp sẵn: mức giảm trừ áp dụng từ kỳ tính thuế 2020 đến hết 2025.'),
            ('giam-tru', DATE '2026-01-01', '{"banThan":15500000,"nguoiPhuThuoc":6200000}'::jsonb, 'Nạp sẵn: 15.500.000 / 6.200.000 đ áp dụng từ kỳ tính thuế 2026.'),
            ('bieu-thue', DATE '2009-01-01', '{"bac":[{"den":5000000,"tyLe":5},{"den":10000000,"tyLe":10},{"den":18000000,"tyLe":15},{"den":32000000,"tyLe":20},{"den":52000000,"tyLe":25},{"den":80000000,"tyLe":30},{"den":null,"tyLe":35}]}'::jsonb, 'Nạp sẵn: biểu 7 bậc (tháng) của Luật Thuế TNCN 2007 sửa đổi.'),
            ('bieu-thue', DATE '2026-01-01', '{"bac":[{"den":10000000,"tyLe":5},{"den":30000000,"tyLe":10},{"den":50000000,"tyLe":20},{"den":100000000,"tyLe":30},{"den":null,"tyLe":35}]}'::jsonb, 'Nạp sẵn THEO HIỂU BIẾT: biểu 5 bậc (tháng) của Luật Thuế TNCN 2025 áp cho tiền lương từ kỳ tính thuế 2026. Kế toán đối chiếu văn bản; nếu chưa áp dụng thì nhập lại biểu 7 bậc với hiệu lực 01/01/2026.'),
            ('khau-tru-10', DATE '2015-01-01', '{"tyLe":10,"nguong":2000000}'::jsonb, 'Nạp sẵn: khấu trừ 10% khi trả từ 2.000.000 đ trở lên cho cá nhân không ký HĐLĐ hoặc HĐLĐ dưới 3 tháng.'),
            ('thu-viec', DATE '2021-01-01', '{"tyLeToiThieu":85}'::jsonb, 'Nạp sẵn: lương thử việc ít nhất 85% lương của công việc đó (Bộ luật Lao động 2019).'),
            ('tang-ca', DATE '2021-01-01', '{"thuong":150,"thuongDem":210,"nghiTuan":200,"nghiTuanDem":270,"le":300,"leDem":390,"phanVuotMienThue":true}'::jsonb, 'Nạp sẵn: 150% / 200% / 300%; ban đêm 210% / 270% / 390%. Phần trả cao hơn giờ bình thường không chịu thuế TNCN.'),
            ('hoa-hong', DATE '2026-01-01', '{"kieu":"phang","tyLe":0,"bac":[]}'::jsonb, 'Nạp sẵn 0% — Giám đốc / kế toán nhập chính sách hoa hồng thật của công ty.')
        ) AS v(loai, hieu_luc, gia_tri, ghi_chu)
        WHERE NOT EXISTS (
            SELECT 1 FROM "payroll_param_sets" x
            WHERE x."tenant_id" = t."id" AND x."kind" = v.loai AND x."effective_from" = v.hieu_luc AND x."source" = 'mac-dinh');

        -- Danh mục phụ cấp nạp sẵn.
        INSERT INTO "salary_allowance_types" ("id", "tenant_id", "code", "name", "taxable", "insurable", "basis", "sort_order", "status", "created_at", "updated_at")
        SELECT gen_random_uuid(), t."id", v.ma, v.ten, v.chiu_thue, v.tinh_bh, v.theo, v.thu_tu, 'hoat-dong', now(), now()
        FROM (VALUES
            ('an-trua', 'Ăn trưa', false, false, 'ngay-cong', 10),
            ('xang-xe', 'Xăng xe', true, false, 'thang', 20),
            ('dien-thoai', 'Điện thoại', false, false, 'thang', 30)
        ) AS v(ma, ten, chiu_thue, tinh_bh, theo, thu_tu)
        ON CONFLICT ("tenant_id", "code") DO NOTHING;
    END LOOP;
END $$;
