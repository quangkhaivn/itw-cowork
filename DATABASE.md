# Cơ sở dữ liệu — TGTH Business Cowork

Cập nhật: 19/09/2026. PostgreSQL 16, Prisma 7.

Tài liệu gồm hai phần: **(A) những gì đang chạy** sau Phase 1, và **(B) thiết kế đề xuất** cho Phase 2–9 (bước 4 của master prompt). Phần B là đề xuất: mỗi phase sẽ chốt lại chi tiết khi viết migration, và cập nhật tệp này.

## Quy ước chung

- Tên bảng, cột: tiếng Anh, `snake_case`, bảng số nhiều. Khóa chính `id uuid`.
- Mọi bảng nghiệp vụ có: `id, tenant_id, created_at, updated_at, created_by, updated_by, status`.
- Thời gian: `timestamptz` (UTC). Đổi sang giờ Việt Nam chỉ ở lớp hiển thị.
- Tiền: `numeric(18,2)`, đơn vị VND trừ khi có cột `currency`. Số lượng: `numeric(18,3)`. **Không dùng số thực dấu phẩy động cho tiền.**
- Tỷ lệ phần trăm (VAT, chiết khấu, biên lợi nhuận): `numeric(7,4)`, lưu dạng phần trăm (`10` = 10%).
- Trạng thái: `varchar` + ràng buộc `CHECK` liệt kê giá trị hợp lệ (dễ thêm giá trị hơn enum của PostgreSQL).
- Xóa: nghiệp vụ không xóa cứng — đổi `status`. Chỉ bảng nối (vai trò–quyền, người dùng–vai trò) mới xóa dòng.
- JSON chỉ dùng cho: cấu hình khóa–giá trị, `payload` sự kiện, `before/after` kiểm toán, thông số kỹ thuật sản phẩm (cấu trúc thay đổi theo nhóm hàng). Còn lại là cột quan hệ.
- **Mọi bảng có `tenant_id` tự được bật RLS** bởi `prisma/rls.sql`; bảng nào sót thì triển khai dừng.

---

## A. Đang chạy (Phase 1)

| Bảng | Vai trò | Ghi chú |
|---|---|---|
| `tenants` | Sổ đăng ký doanh nghiệp | Ứng dụng chỉ được đọc |
| `tenant_settings` | Cấu hình khóa–giá trị theo tenant | Danh mục khóa và lược đồ ở `src/modules/cau-hinh/danh-muc.ts` |
| `departments` | Phòng ban, cây qua `parent_id` | CHECK không tự làm cha mình; chống vòng ở service |
| `users` | Tài khoản đăng nhập | `must_change_password`, `password_changed_at`, `failed_login_count`, `locked_until` (thêm 19/09) |
| `staff_profiles` | Hồ sơ nhân sự 1–1 với `users` | `manager_id` (thêm 19/09) cho phạm vi "team"; CHECK không tự quản lý mình |
| `roles` | Vai trò theo tenant | `is_built_in` |
| `permissions` | Danh mục quyền toàn hệ thống | 156 dòng; ứng dụng chỉ đọc |
| `role_permissions` | Vai trò ↔ quyền | `data_scope` ∈ own/team/department/all (thêm 19/09) |
| `user_roles` | Người dùng ↔ vai trò | |
| `master_data_items` | Dữ liệu gốc: phân khúc, loại khách, ngành, nguồn lead, lý do thua, đơn vị tính, điều khoản, đối thủ | Thêm 19/09. Duy nhất theo `(tenant_id, type, code)` |
| `business_events` | Sự kiện nghiệp vụ | Chỉ ghi thêm (trigger) |
| `audit_logs` | Ai đổi gì, trước/sau, IP | Chỉ ghi thêm (trigger); che khóa nhạy cảm |

Migration: `20260912100158_nen_mong` (nền móng), `20260919043807_phase1_hoan_thien` (bổ sung — chỉ thêm cột/bảng/ràng buộc, không xóa gì; kèm gán phạm vi mặc định cho quyền đã có và đổi tên hai vai trò dựng sẵn nếu chưa bị sửa tay).

Vai kết nối: `cowork_app` (ứng dụng, bị RLS) và chủ sở hữu (migration, seed). Ứng dụng **không bao giờ** chạy bằng chủ sở hữu.

---

## B. Thiết kế đề xuất Phase 2–9

Sơ đồ quan hệ lõi (vòng đời khách hàng, mục 3 và 45 master prompt):

```
customers ─┬─< contacts
           ├─< activities (gọi, email, Zalo, gặp, ghi chú)
           ├─< opportunities ─< quotations ─< quotation_versions ─< quotation_items >─ products
           │                                     │                                    │
           │                                     └─ quotation_approvals               ├─< supplier_product_prices >─ suppliers
           │                                                                          └─< price_history
           ├─< sales_orders ─< sales_order_items ──> inventory_reservations
           │        ├─< projects ─< project_tasks, acceptance
           │        └─< invoices ─< payment_allocations >─ payments
           ├─< support_tickets
           ├─< warranties >─ serial_numbers
           └─< renewals ──> opportunities (tự tạo cơ hội gia hạn)
leads ──(chuyển đổi)──> customers + contacts + opportunities
```

### Phase 2 — CRM

| Bảng | Cột chính | Ràng buộc / chỉ mục |
|---|---|---|
| `customers` | `code` (KH-000123), `name`, `name_normalized`, `tax_code`, `tax_code_normalized`, `customer_type`, `segment`, `industry` (mã dữ liệu gốc), `owner_id` → users, `source`, `address`, `province`, `website`, `note` | Duy nhất `(tenant_id, code)`; duy nhất `(tenant_id, tax_code_normalized)` khi khác null; chỉ mục trigram trên `name_normalized` để dò trùng |
| `contacts` | `customer_id`, `full_name`, `title`, `phone`, `phone_normalized`, `email`, `email_normalized`, `zalo`, `is_primary` | Chỉ mục `(tenant_id, phone_normalized)`, `(tenant_id, email_normalized)` |
| `leads` | `full_name`, `company_name`, `phone_normalized`, `email_normalized`, `tax_code_normalized`, `source`, `stage` (NEW_LEAD/CONTACTED/QUALIFIED/DISQUALIFIED/CONVERTED), `owner_id`, `converted_customer_id`, `converted_opportunity_id`, `raw_payload` (dữ liệu gốc từ website/Zalo) | Lead không bao giờ xóa; chuyển đổi ghi con trỏ sang khách hàng |
| `activities` | `type` (call/email/zalo/meeting/note/visit), `customer_id`, `contact_id`, `lead_id`, `opportunity_id`, `occurred_at`, `summary`, `outcome`, `next_action`, `next_action_at`, `owner_id` | Chỉ mục `(tenant_id, customer_id, occurred_at desc)` phục vụ dòng thời gian |
| `opportunities` | `code` (CH-000045), `customer_id`, `contact_id`, `product_category`, `description`, `estimated_value`, `probability`, `expected_close_date`, `owner_id`, `source`, `stage` (OPPORTUNITY/QUOTATION/NEGOTIATION/WON/LOST), `competitor`, `lost_reason`, `next_action`, `next_action_date`, `closed_at` | **CHECK**: khi `stage NOT IN ('WON','LOST')` thì `owner_id`, `next_action`, `next_action_date` NOT NULL (luật mục 8). **CHECK**: `stage='LOST'` thì `lost_reason` NOT NULL |
| `tasks` | `title`, `description`, `owner_id`, `priority`, `due_at`, `status`, `related_type`, `related_id`, `customer_id` | `related_type` CHECK trong danh sách; `customer_id` lặp lại có chủ đích để dòng thời gian Customer 360 không phải nối vòng |
| `document_sequences` | `doc_type`, `period`, `last_number` | Cấp số chứng từ bằng `UPDATE ... RETURNING` có khóa dòng — không trùng số khi hai người tạo cùng lúc |

**Chống trùng khách hàng (mục 4):** chuẩn hóa trước khi lưu — mã số thuế bỏ ký tự không phải số; điện thoại về dạng `84xxxxxxxxx`; email chữ thường; tên bỏ dấu, bỏ "công ty", "TNHH", "cổ phần"… Khi tạo: trùng MST → chặn; trùng điện thoại/email/tên gần giống (trigram ≥ 0,6) → cảnh báo kèm danh sách ứng viên, người dùng chọn "là khách cũ" hay "tạo mới". Hàm chuẩn hóa là hàm thuần, có kiểm thử đơn vị.

**Customer 360 — dòng thời gian:** không chép dữ liệu sang bảng dòng thời gian. Một truy vấn `UNION ALL` trên `activities`, `quotations`, `sales_orders`, `payments`, `support_tickets`, `warranties`, `tasks` theo `customer_id`, mỗi nhánh có chỉ mục `(tenant_id, customer_id, <thời điểm>)`, phân trang theo con trỏ thời gian.

### Phase 3 — Sản phẩm và bảng giá

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `product_categories` | `code`, `name`, `parent_id`, `requires_serial`, `default_warranty_months`, `default_vat_rate` | Khởi tạo 12 nhóm mục 9 master prompt |
| `brands` | `code`, `name` | |
| `suppliers` | `code`, `name`, `tax_code`, `phone`, `email`, `payment_terms`, `lead_time_days` | |
| `products` | `sku`, `name`, `category_id`, `brand_id`, `model`, `description`, `specifications jsonb`, `unit`, `cost_price`, `selling_price`, `vat_rate`, `warranty_months`, `requires_serial`, `default_supplier_id` | Duy nhất `(tenant_id, sku)`; chỉ mục trigram trên `sku`, `model`, `name` cho tìm nhanh |
| `supplier_product_prices` | `product_id`, `supplier_id`, `purchase_price`, `currency`, `availability`, `lead_time_days`, `valid_from`, `valid_to`, `updated_at` | Nhiều nhà cung cấp một sản phẩm; báo giá gợi ý nguồn rẻ nhất còn hàng |
| `price_history` | `product_id`, `price_type` (cost/selling/supplier), `supplier_id`, `old_price`, `new_price`, `changed_by`, `changed_at`, `reason` | Chỉ ghi thêm. Ghi bằng service mỗi lần đổi giá (mục 20: đổi giá phải kiểm toán) |
| `import_jobs` | `type`, `file_name`, `status`, `total_rows`, `ok_rows`, `error_rows`, `errors jsonb` | Nhập CSV/Excel chạy nền, báo lỗi từng dòng |

### Phase 4 — Báo giá (ưu tiên cao nhất)

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `quotations` | `number` (BG-2026-0001), `customer_id`, `contact_id`, `opportunity_id`, `owner_id`, `current_version_id`, `status` | Đầu phiếu, trỏ tới phiên bản hiện hành |
| `quotation_versions` | `quotation_id`, `version_no`, `payment_terms`, `delivery_terms`, `warranty_terms`, `valid_until`, `notes`, `subtotal`, `discount_total`, `vat_total`, `total`, `cost_total`, `gross_profit`, `gross_margin`, `status`, `sent_at`, `viewed_at` | **Đóng băng** khi đã gửi: sửa = tạo phiên bản mới. Các cột tổng là ảnh chụp tại thời điểm tính — lưu có chủ đích vì đây là chứng từ đã gửi khách |
| `quotation_items` | `version_id`, `line_no`, `product_id`, `description`, `quantity`, `unit`, `unit_price`, `discount_pct`, `vat_rate`, `unit_cost`, `supplier_id`, `line_total`, `line_cost` | Giá vốn chụp tại lúc lập để biên lợi nhuận không đổi khi giá nhập đổi sau này |
| `quotation_approvals` | `version_id`, `required_reason` (margin_below_threshold…), `margin_at_request`, `threshold_at_request`, `requested_by`, `decided_by`, `decision`, `decided_at`, `comment` | Chụp cả ngưỡng tại lúc xin duyệt |

Trạng thái: Draft → Pending Approval → Approved → Sent → Viewed → Negotiating → Accepted / Rejected / Expired. Biên lợi nhuận tính bằng **một hàm thuần** `tinhBaoGia(dong[])` có kiểm thử đơn vị; ngưỡng đọc từ `bao_gia.nguong_bien_loi_nhuan` (chưa đặt → mọi báo giá phải duyệt).

### Phase 5 — Đơn hàng, kho, mua hàng

| Bảng | Ghi chú |
|---|---|
| `sales_orders`, `sales_order_items` | Tạo từ `quotation_version` đã Accepted bằng một thao tác; dòng hàng chép từ phiên bản báo giá (chứng từ pháp lý phải giữ nguyên dù báo giá đổi sau) và giữ `quotation_item_id` để truy ngược |
| `warehouses` | Nhiều kho |
| `inventory_balances` | `(warehouse_id, product_id)`: `on_hand`, `reserved`, `incoming`; `available` = on_hand − reserved (cột sinh). CHECK không âm |
| `inventory_transactions` | Sổ cái chỉ ghi thêm: nhập, xuất, chuyển kho, điều chỉnh, giữ chỗ, nhả giữ chỗ — số dư cập nhật **trong cùng giao dịch** với dòng sổ cái. Thiết kế giữ chỗ lấy từ kho mã tham khảo `tmdt` |
| `serial_numbers` | `serial`, `product_id`, `warehouse_id`, `status` (in_stock/reserved/sold/returned/rma), `sales_order_item_id`, `purchase_order_item_id` — duy nhất `(tenant_id, product_id, serial)` |
| `purchase_requests`, `purchase_orders`, `purchase_order_items` | Mua hàng cho đơn thiếu hàng |

### Phase 6 — Dự án, dịch vụ, bảo hành

`projects`, `project_tasks`, `project_acceptances`, `support_tickets` (SLA: `response_due_at`, `resolve_due_at`), `warranties` (`serial_id`, `start_date`, `end_date`), `maintenance_contracts`, `renewals` (`source_type` warranty/license/maintenance, `due_date`, `opportunity_id` tự tạo), `attachments` (`storage_key`, `file_name`, `mime`, `size`, `related_type`, `related_id`).

### Phase 7 — Tài chính quản trị

`invoices`, `invoice_items`, `payments`, `payment_allocations` (một lần thu trả cho nhiều hóa đơn), `supplier_bills`, `supplier_payments`.

**Công nợ phải thu / phải trả là VIEW, không phải bảng**: `receivables` = hóa đơn − phân bổ thanh toán; `payables` tương tự. Master prompt mục 28 liệt kê `Receivable`, `Payable` như thực thể; lưu thành bảng riêng sẽ có hai nơi giữ cùng một con số và sớm muộn lệch nhau — trái với mục 4 (một nguồn dữ liệu).

Doanh thu / giá vốn / lợi nhuận gộp của bảng điều hành đọc từ các view tổng hợp theo ngày (`daily_sales_summary`), làm mới bằng worker, để trang CEO không quét toàn bộ đơn hàng mỗi lần mở.

### Phase 8 — Tự động hóa

`notifications` (`user_id`, `type`, `title`, `link`, `read_at`), `automation_rules` (loại quy tắc + tham số, đọc ngưỡng từ Cấu hình), `job_runs` (lần chạy, kết quả, lỗi), `daily_action_items` (Today's Sales Actions theo người).

### Phase 9 — AI

`ai_conversations`, `ai_messages`, `ai_tool_calls` (tên công cụ, tham số, kết quả rút gọn, thời gian, lỗi), `ai_actions` (đề xuất hành động: `type`, `payload`, `status` proposed/approved/rejected/executed, `approved_by`). Xem [`AI_ARCHITECTURE.md`](AI_ARCHITECTURE.md).

### Tích hợp (thiết kế sẵn, triển khai dần)

`integrations` (`provider`, `status`, `credentials_ref` — **tên** bí mật trong kho bí mật/biến môi trường, không bao giờ giá trị, `config jsonb`, `last_sync_at`), `integration_sync_logs`, `integration_errors`.

## Sao lưu

Xem [`DEPLOYMENT.md`](DEPLOYMENT.md) mục Sao lưu và phục hồi.
