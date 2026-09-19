# Nhật ký thay đổi

Theo phiên bản ứng dụng. Ngày theo giờ Việt Nam.

## 0.2.0 — 19/09/2026 — Phase 1 hoàn thiện (TGTH Business Cowork)

Căn cứ: master prompt "TGTH Business Cowork Platform" (45 mục) do Giám đốc đưa ngày 19/09/2026. Mở rộng bản 0.1.0, không viết lại.

### Thêm
- **Khung ứng dụng**: thanh bên theo quyền, thanh trên, breadcrumb, tìm kiếm toàn cục Ctrl/⌘ K (màn hình, người dùng, phòng ban — tự kiểm quyền và phạm vi), menu người dùng, trang lỗi / đang tải / không có quyền / không tìm thấy; dùng được trên điện thoại.
- **Quản trị người dùng**: danh sách lọc + phân trang phía máy chủ; tạo, sửa, gán phòng ban, quản lý trực tiếp, vai trò; ngừng/mở lại; đặt lại mật khẩu; mở khóa đăng nhập; lịch sử thay đổi từng người.
- **Vai trò & quyền**: ma trận quyền 26 phân hệ × 6 hành động, **phạm vi dữ liệu** own/team/department/all theo từng dòng quyền; tạo vai trò tùy chỉnh (sao chép từ vai trò có sẵn).
- **Phòng ban** dạng cây; **Dữ liệu gốc** 9 loại (44 mục khởi tạo, 3 loại để trống có chủ đích); **Cấu hình hệ thống** 8 ngưỡng (bảo mật đăng nhập, biên lợi nhuận báo giá, nhắc việc) — không ngưỡng nào viết cứng trong mã.
- **Nhật ký kiểm toán**: tra cứu theo hành động, đối tượng, người, khoảng ngày; xem giá trị trước/sau.
- **Tài khoản của tôi** (xem toàn bộ quyền của mình) và **Đổi mật khẩu**.
- API `/api/v1/*` qua một lớp bọc chung `xuLyApi`; nghiệp vụ tách vào `src/modules/*/service.ts`.
- Bảng `master_data_items`; cột `users.must_change_password / password_changed_at / failed_login_count / locked_until`, `staff_profiles.manager_id`, `role_permissions.data_scope`; ràng buộc CHECK tương ứng.
- Seed dữ liệu mẫu trong tenant `demo` riêng (`npm run db:seed:mau`).
- Kiểm thử: 25 bài đơn vị, bài tích hợp `thu-quan-tri` (35 kiểm chứng), bài HTTP đầu-cuối `thu-http` (46 kiểm chứng). ESLint.
- Script sao lưu `scripts/sao-luu.sh`; `trien-khai.sh` tự sao lưu trước khi migrate.
- Tài liệu: README, ARCHITECTURE, DATABASE (kèm thiết kế Phase 2–9), DEPLOYMENT, AI_ARCHITECTURE, docs/PHASE-0-KHAO-SAT, docs/quyet-dinh-kien-truc.

### Bảo mật
- Giới hạn tốc độ đăng nhập theo IP và theo tài khoản (Redis, dự phòng bộ nhớ); khóa tài khoản tạm sau N lần sai.
- Chống CSRF: kiểm Origin cho mọi yêu cầu ghi tới `/api`.
- Đổi / đặt lại mật khẩu vô hiệu mọi phiên cũ (so tới mili-giây); tài khoản mới và tài khoản vừa đặt lại bị bắt đổi mật khẩu.
- Chính sách mật khẩu dùng chung cho mọi đường đặt mật khẩu.
- Tiêu đề bảo mật trong ứng dụng (nosniff, Referrer-Policy, Permissions-Policy, CSP frame-ancestors). Không đặt X-Frame-Options vì nginx máy chủ đã đặt.
- IP khách lấy từ `X-Real-IP` của nginx máy chủ; nginx trong Docker không ghi đè nữa.
- `/api/khoe` không còn trả chi tiết lỗi cơ sở dữ liệu.
- `rls.sql` tự bật RLS cho mọi bảng có `tenant_id` và dừng triển khai nếu sót.

### Sửa
- Ghi vết từ chối quyền bị mất khi giao dịch cuộn ngược: `batBuocQuyen` không tự ghi nữa; lớp bọc ghi trong giao dịch riêng.
- Seed đồng bộ cứng quyền vai trò ở mỗi lần triển khai (sẽ xóa phân quyền Giám đốc đã chỉnh): nay chỉ cấp quyền của phân hệ mới.
- Migration trước đây chỉ nằm trên máy chủ, nay đã vào kho mã.
- Đăng nhập không phân biệt hoa thường ở email.

### Đổi
- Tên hiển thị: "TGTH Business Cowork". Vai trò `admin` → "Quản trị hệ thống (Super Admin)", `finance` → "Kế toán – Tài chính".
- `src/middleware.ts` → `src/proxy.ts` (quy ước Next 16).

## 0.1.0 — 12/09/2026 — Phase 1 nền móng

Đa doanh nghiệp (voiTenant + RLS), đăng nhập, 15 vai trò, 144 quyền, Business Events và Audit Log chỉ-ghi-thêm, triển khai Docker lên VPS.
