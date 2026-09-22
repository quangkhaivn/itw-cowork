-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "object_type" VARCHAR(40) NOT NULL,
    "object_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "stored_path" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "note" TEXT,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_by" UUID NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),
    "deleted_by" UUID,
    "delete_reason" TEXT,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attachments_tenant_id_object_type_object_id_idx" ON "attachments"("tenant_id", "object_type", "object_id");

-- CreateIndex
CREATE INDEX "attachments_tenant_id_sha256_idx" ON "attachments"("tenant_id", "sha256");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Ràng buộc nghiệp vụ tệp đính kèm — luật ở BUSINESS_RULES.md mục 20 (DK).
-- ---------------------------------------------------------------------------

-- DK-01: chỉ đính kèm vào những loại chứng từ hệ thống biết cách KIỂM QUYỀN XEM.
-- Thêm loại mới ở đây thì phải thêm cả hàm kiểm quyền trong `src/modules/dinh-kem/quyen.ts`,
-- nếu không sẽ có tệp mà không ai biết ai được đọc.
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_loai_doi_tuong_check"
    CHECK ("object_type" IN ('supplier_bill', 'sales_return', 'purchase_return',
                             'stock_transfer', 'sales_order', 'support_ticket'));

-- DK-03: tệp rỗng không phải tệp; 20 MB là trần kỹ thuật, không phải ngưỡng nghiệp vụ.
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_dung_luong_check"
    CHECK ("size_bytes" > 0 AND "size_bytes" <= 20971520);

-- DK-04: chỉ nhận những kiểu tệp trong danh sách trắng. Không có SVG và không có HTML
-- — hai thứ đó là mã chạy được trong trình duyệt, không phải tài liệu.
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_kieu_tep_check"
    CHECK ("mime_type" IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
                           'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                           'text/csv', 'text/plain'));

ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ma_bam_check"
    CHECK (char_length("sha256") = 64 AND "sha256" ~ '^[0-9a-f]+$');

ALTER TABLE "attachments" ADD CONSTRAINT "attachments_ten_tep_check"
    CHECK (length(btrim("file_name")) >= 1);

-- DK-06: xóa là **xóa mềm** và phải ghi lý do. Ba cột đi với nhau, không cái nào lẻ.
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_xoa_check"
    CHECK (("deleted_at" IS NULL AND "deleted_by" IS NULL AND "delete_reason" IS NULL)
           OR ("deleted_at" IS NOT NULL AND "deleted_by" IS NOT NULL
               AND length(btrim(coalesce("delete_reason", ''))) >= 2));

-- ---------------------------------------------------------------------------
-- Không thêm mã quyền mới. Quyền đọc/ghi tệp đính kèm **mượn nguyên** quyền của
-- chứng từ chủ: ai xem được hóa đơn nhà cung cấp thì xem được tệp của nó, ai sửa
-- được phiếu trả hàng thì đính kèm được vào đó (DK-02).
-- Không cấp bù cho ai — mọi thay đổi quyền phải khớp `src/lib/vai-tro.ts` (QĐ-37).
-- ---------------------------------------------------------------------------
