# Nhật ký thay đổi

Theo phiên bản ứng dụng. Ngày theo giờ Việt Nam.

## 0.4.0 — 20/09/2026 — Phase 3: Sản phẩm và bảng giá

Căn cứ: prompt triển khai 36 mục, mục 8–9. Luật nghiệp vụ: `BUSINESS_RULES.md` mục 4.
**Chưa triển khai lên máy thật** — cùng đợt với 0.3.0, chờ Giám đốc cho phép.

### Thêm
- **CSDL** (migration `20260920011356_phase3_san_pham`, chỉ thêm bảng): `product_categories`, `brands`, `suppliers`, `products`, `supplier_product_prices`, `price_history`, `import_jobs`; 20 ràng buộc CHECK; **trigger chặn sửa/xóa `price_history`**.
- **Phân hệ quyền mới `product`** (6 quyền). Kinh doanh và kế toán xem + xuất; Mua hàng giữ danh mục và bảng giá; kho, kỹ thuật, CSKH, marketing chỉ xem. Seed tự cấp mã quyền mới khi triển khai; `supplier.view` (mã cũ) được cấp bù bằng migration.
- **Sản phẩm**: SKU chuẩn hóa chống trùng ("lap-dell-3420" = "LAP DELL 3420"), thông số kỹ thuật dạng khóa–giá trị, kế thừa bảo hành/VAT/số sê-ri từ nhóm, biên lợi nhuận tính sẵn, lọc theo nhóm/thương hiệu/nhà cung cấp/chưa có giá, sắp xếp 5 kiểu.
- **Nhóm sản phẩm** dạng cây (12 nhóm khởi tạo theo mục 9 prompt), **thương hiệu**, **nhà cung cấp** (mã NCC-0001, chống trùng mã số thuế).
- **Bảng giá nhiều nguồn**: mỗi sản phẩm nhiều nhà cung cấp, kèm tình trạng hàng và thời gian giao; hệ thống chỉ ra **nguồn nên mua** (còn hàng → giá thấp → giao nhanh).
- **Lịch sử giá chỉ-ghi-thêm** cho mọi thay đổi giá vốn, giá bán, giá từng nguồn — kể cả lúc tạo và lúc gỡ nguồn; ghi rõ ai đổi, lý do, nhập tay hay nhập CSV.
- **Nhập CSV** hai loại (danh mục sản phẩm; bảng giá của một nhà cung cấp): luôn xem trước, đối chiếu từng dòng, bỏ dòng hỏng kèm lý do, lưu phiếu nhập; **xuất CSV** theo bộ lọc; tệp mẫu tải sẵn.
- Bộ đọc/ghi CSV tự viết: dấu phân cách `;` của Excel tiếng Việt, BOM, CRLF, ô có dấu nháy kép, số tiền kiểu Việt Nam.
- Tìm kiếm toàn cục thêm nguồn **sản phẩm** (SKU, tên, model). 13 route `/api/v1` mới, 8 màn hình mới.
- Dữ liệu mẫu tenant `demo`: 5 sản phẩm, 2 nhà cung cấp, 5 dòng giá.
- Kiểm thử: 21 bài đơn vị mới (73), `thu-san-pham` 56 kiểm chứng (tích hợp 212), `thu-http` thêm 25 kiểm chứng (112).

### Vấn đề đã biết
- Chỉ nhập **CSV**, chưa đọc thẳng `.xlsx` — Excel phải "Lưu thành → CSV UTF-8". Thêm thư viện đọc xlsx khi có yêu cầu thật.
- Nhập tệp chạy đồng bộ trong một yêu cầu; giới hạn 5.000 dòng mỗi lần.
- Giá vốn trên sản phẩm là **giá tham chiếu**. Giá vốn thực theo từng lần nhập kho là việc của Phase 5.

## 0.3.0 — 20/09/2026 — Phase 2: CRM

Căn cứ: prompt triển khai 36 mục của Giám đốc ngày 20/09/2026 (mục 7, 23–25). Luật nghiệp vụ: `BUSINESS_RULES.md` mục 3.
**Chưa triển khai lên máy thật** — xem "Vấn đề đã biết".

### Thêm
- **CSDL** (migration `20260919171944_phase2_crm`, chỉ thêm bảng): `customers`, `contacts`, `leads`, `interactions`, `opportunities`, `tasks`, `document_sequences`; extension `pg_trgm`; 20 ràng buộc CHECK cho luật nghiệp vụ.
- **Khách hàng**: danh sách lọc/phân trang theo phạm vi; tạo/sửa; mã tự cấp `KH-000001`; **chống trùng** — trùng mã số thuế bị chặn, trùng điện thoại/email (của khách hoặc liên hệ) hoặc tên gần giống thì cảnh báo và phải xác nhận; dò trùng quét toàn doanh nghiệp nhưng chỉ lộ mã + tên + người phụ trách của khách ngoài phạm vi.
- **Customer 360**: tổng quan (chỉ số cơ hội, pipeline có trọng số, tương tác gần nhất), liên hệ, cơ hội, tương tác, công việc, dòng thời gian hợp nhất (đọc thẳng từ bảng gốc, không chép dữ liệu).
- **Lead**: tạo (dò trùng với khách, liên hệ, lead đang mở), giao người phụ trách, ghi tương tác (lead mới tự sang "Đã liên hệ"), loại có lý do, mở lại, **chuyển đổi** thành khách mới hoặc khách có sẵn + liên hệ + cơ hội trong một giao dịch.
- **Cơ hội**: mã `CH-2026-0001` theo năm giờ Việt Nam; luật **Owner + Hành động kế tiếp + Ngày** chặn ở cả form, service và CSDL; thua bắt buộc lý do (Dữ liệu gốc); thắng/thua ghi thời điểm đóng; mở lại cần quyền duyệt; xác suất gợi ý theo giai đoạn.
- **Pipeline Kanban** 8 cột (3 cột lead + 5 cột cơ hội), kéo thả đổi giai đoạn, thẻ quá hạn viền đỏ, tổng giá trị và pipeline có trọng số.
- **Công việc**: việc của tôi / quá hạn / cả nhóm, giao việc theo phạm vi, đổi trạng thái ngay trên danh sách.
- **Nút "+ Tạo mới"** (Khách hàng, Lead, Cơ hội, Công việc) — chỉ loại đã có màn hình tạo, lọc theo quyền trên máy chủ.
- **Tìm kiếm toàn cục** thêm khách hàng (tên, mã, MST, điện thoại, email), liên hệ, lead, cơ hội — mỗi nguồn tự lọc theo phạm vi.
- Dữ liệu mẫu CRM cho tenant `demo`, tạo **qua service** bằng tài khoản nhân viên mẫu.
- Kiểm thử: 27 bài đơn vị mới (tổng 52), `thu-crm` 81 kiểm chứng (tổng tích hợp 156), `thu-http` thêm 44 kiểm chứng CRM (tổng 87–88).
- Tài liệu: `IMPLEMENTATION_PLAN.md`, `BUSINESS_RULES.md`.

### Sửa
- **Bố cục máy tính bị vỡ từ bản 0.2.x**: lớp phủ menu điện thoại `.man-che` chỉ bị ẩn trong `@media` hẹp, nên trên màn hình rộng hơn 900 px nó chiếm một ô lưới và đẩy toàn bộ vùng nội dung xuống dưới thanh bên. Lỗi có trên máy thật; chưa ai thấy vì trước đây chưa soát giao diện sau đăng nhập.
- API nhận id sai định dạng (`/api/v1/.../undefined`) trả **500**; nay trả 404. UUID sai trong thân yêu cầu (lỗi Prisma P2007) trả 400.
- Vai trò Trưởng phòng Kinh doanh thiếu `sales.approve` → không mở lại được cơ hội đã đóng. Cấp bù cho vai trò đã có bằng migration (seed không cấp lại mã quyền cũ — QĐ-10).
- `thu-quan-tri` không chạy lại được trên cùng CSDL (dùng tenant cố định); nay mỗi lần chạy một tenant riêng.
- `npm run db:seed` và `thu:*` tự nạp `.env` (`--env-file-if-exists`).
- Ô tìm kiếm trên điện thoại không còn xuống 3 dòng; trên màn hẹp cột thao tác lên trước form dài.

### Vấn đề đã biết
- **Chưa triển khai lên `thegioitinhoc.io.vn`** — chờ Giám đốc cho phép (Q6 trong `IMPLEMENTATION_PLAN.md`). Migration đã diễn tập nâng cấp từ trạng thái Phase 1 có dữ liệu: đạt.
- Chưa có màn hình sau đăng nhập nào được người thật bấm thử: trợ lý không gõ mật khẩu vào trình duyệt. Giao diện được soát bằng HTML dựng thật (đăng nhập qua API) ở 1440 px và 375 px; tương tác phía trình duyệt (kéo thả, hộp thoại) mới kiểm qua API tương ứng.
- Nhiều service dùng `Promise.all` trong một giao dịch → thư viện `pg` báo *DeprecationWarning* (sẽ thành lỗi ở `pg@9`). Có từ Phase 1; chưa sửa.
- Ô chọn ngày hiển thị theo ngôn ngữ trình duyệt (trình duyệt tiếng Anh thấy mm/dd/yyyy); giá trị lưu vẫn đúng.

## 0.2.1 — 19/09/2026 — Sửa lỗi phát hiện khi triển khai lên máy thật

- **nginx trả 502 sau khi tạo lại container `app`** (khoảng 1 phút, hai lần trong ngày): nginx chỉ phân giải tên `app` lúc khởi động; container mới nhận IP khác, `worker` lấy mất IP cũ. Nay phân giải lại qua DNS Docker mỗi 10 giây; đã kiểm bằng cách ép đổi IP — nginx tự theo sau 1 giây.
- Cấu hình nginx gắn cả thư mục thay vì một tệp (gắn một tệp giữ inode cũ, thay tệp thì container không thấy).
- `trien-khai.sh`: kiểm cú pháp và nạp lại nginx, chờ `/khoe` trả 200 rồi mới báo xong.
- `sao-luu.sh` báo hỏng ngẫu nhiên dù tệp tốt (`pg_restore | grep -q` + `pipefail` → SIGPIPE). Nay ghi mục lục ra tệp rồi kiểm cả `users` và `audit_logs`.
- Bỏ `X-Frame-Options` khỏi ứng dụng: nginx máy chủ đã đặt `SAMEORIGIN`, hai giá trị mâu thuẫn.
- Lịch sao lưu hằng ngày 02:15 trên máy chủ; đã phục hồi thử một bản vào CSDL tạm, số dòng khớp bản gốc.

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
