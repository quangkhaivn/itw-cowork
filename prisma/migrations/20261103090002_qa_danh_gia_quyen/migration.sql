-- 0.20.0 QA — cấp quyền `danh_gia.*` cho đúng như src/lib/vai-tro.ts trên MỌI doanh nghiệp đã có.
--
-- Diễn tập nâng cấp từ CSDL 0.19 có hai doanh nghiệp (itw + demo) cho thấy hai chỗ lệch:
--  1. Giám đốc (`ceo`) và Quản trị (`admin`) chỉ nhận `danh_gia.*` khi `npm run db:seed` chạy — mà seed chỉ
--     đồng bộ doanh nghiệp SEED_MA_TENANT (mặc định itw). Doanh nghiệp khác (demo…) sau nâng cấp có Giám đốc
--     không xem / chốt / điều chỉnh được phiếu đánh giá nào.
--  2. Migration 20261103090001 cấp `danh_gia.create` cho Nhân sự (HR) phạm vi `all`, trong khi vai-tro.ts
--     (và cài mới bằng seed) là `own` — HR chỉ tự viết báo cáo / tự đánh giá của mình.
-- Không đụng vai trò tự tạo (is_built_in = false). Chạy lại nhiều lần vẫn an toàn.

INSERT INTO "role_permissions" ("id", "tenant_id", "role_id", "permission_id", "data_scope", "status", "created_at", "updated_at")
SELECT gen_random_uuid(), r."tenant_id", r."id", p."id", 'all', 'hoat-dong', now(), now()
FROM "roles" r
JOIN "permissions" p ON p."module" = 'danh_gia'
WHERE r."is_built_in" AND r."code" IN ('ceo', 'admin')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

UPDATE "role_permissions" rp
   SET "data_scope" = 'own', "updated_at" = now()
  FROM "roles" r, "permissions" p
 WHERE rp."role_id" = r."id" AND rp."permission_id" = p."id"
   AND r."is_built_in" AND r."code" = 'nhan-su-hr'
   AND p."code" = 'danh_gia.create' AND rp."data_scope" = 'all';
