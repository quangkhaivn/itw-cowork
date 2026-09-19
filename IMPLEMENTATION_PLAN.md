# Kế hoạch triển khai — TGTH Business Cowork

> Tệp này là **điểm vào** cho mọi phiên làm việc sau. Đọc tệp này trước, rồi `CHANGELOG.md`, rồi tài liệu chuyên đề.
> Cập nhật lần cuối: 20/09/2026.

Căn cứ: master prompt "TGTH Business Cowork Platform" (19/09/2026) và prompt triển khai 36 mục (20/09/2026) của Giám đốc. Hai văn bản nói cùng một lộ trình; khi khác chi tiết, bản 20/09 thắng.

## 1. Trạng thái tổng

| Phase | Nội dung | Ưu tiên | Trạng thái |
|---|---|---|---|
| 0 | Audit | — | **Xong** 19/09, rà lại 20/09 (mục 2) |
| 1 | Nền móng: đăng nhập, người dùng, phòng ban, RBAC + phạm vi, nhật ký kiểm toán | P0 | **Xong** 19/09 — đang chạy thật (bản 0.2.1) |
| 2 | CRM: khách hàng + chống trùng, liên hệ, lead, tương tác, cơ hội + pipeline, công việc, Customer 360 | P0 | **Đang làm** 20/09 — xem mục 4 |
| 3 | Sản phẩm, nhóm, thương hiệu, nhà cung cấp, giá nhiều nguồn, lịch sử giá, nhập/xuất CSV | P0 | Chưa |
| 4 | Báo giá: phiên bản, biên lợi nhuận, duyệt theo ngưỡng, PDF, chuyển đơn | P0 | Chưa |
| 5 | Đơn hàng, kho, serial | P1 | Chưa |
| 6 | Dự án, phiếu hỗ trợ, bảo hành, bảo trì, gia hạn | P2 | Chưa |
| 7 | Bảng điều hành CEO | P1 | Chưa (bảng điều khiển Phase 1 chỉ có số liệu hệ thống) |
| 8 | Tự động hóa, "Việc hôm nay" | P2 | Chưa |
| 9 | AI | P3 | Chỉ có thiết kế (`AI_ARCHITECTURE.md`) |

Thứ tự ưu tiên khi thiếu thời gian (mục 34 prompt 20/09): Auth+RBAC → Customer → Product → Price → Opportunity → Quotation → Order → Dashboard → Task → Inventory → Project → Support → Finance → Automation → AI. **Không hy sinh P0 để làm AI sớm.**

## 2. Kết quả audit 20/09/2026

Kho mã `L:\CODE\cowork-itw`, nhánh `master`, cây làm việc sạch lúc bắt đầu, commit gần nhất `fb878e6` (bản 0.2.1).

### EXISTING — đã có và chạy thật
- Next.js 16 + React 19 + TypeScript; Prisma 7 + PostgreSQL 16; Zod 4; một dịch vụ `app` cho cả giao diện lẫn API.
- Đa doanh nghiệp hai lớp: `voiTenant()` + RLS, ứng dụng dùng vai `cowork_app`. `prisma/rls.sql` tự bật RLS cho mọi bảng có `tenant_id`.
- Đăng nhập / đăng xuất / phiên JWT httpOnly / đổi mật khẩu / bắt đổi lần đầu / khóa tạm khi sai nhiều / giới hạn tốc độ / chống CSRF bằng kiểm Origin.
- Người dùng (tạo, xem, sửa, ngừng), phòng ban dạng cây, 15 vai trò bao trùm 10 vai trò của prompt, ma trận quyền 26 phân hệ × 6 hành động (view/create/update/delete/approve/export), phạm vi own/team/department/all.
- Audit Log và Business Event chỉ-ghi-thêm (trigger chặn sửa/xóa).
- Dữ liệu gốc 9 loại, Cấu hình 8 ngưỡng (không ngưỡng nào viết cứng).
- Khung giao diện: thanh bên lọc quyền trên máy chủ, thanh trên, tìm kiếm Ctrl/⌘ K, breadcrumb, trang lỗi/không quyền/không thấy.
- Triển khai: Docker Compose 5 dịch vụ trên VPS, `trien-khai.sh` tự sao lưu trước migrate, lịch sao lưu 02:15, `/khoe`.
- Kiểm thử: 25 bài đơn vị, 75 kiểm chứng tích hợp, 46 kiểm chứng HTTP.

### REUSABLE — dùng lại nguyên cho Phase 2+
`xuLyApi` + `NguCanh`, `yeuCauQuyen` + `docDuLieu`, `idNguoiTrongPhamVi`, `ghiKiemToan`/`ghiSuKien`, `LoiNghiepVu`, `useGoiApi`, `DauTrang`/`PhanTrang`/`TrongRong`, định dạng VN (`dinh-dang.ts`), mảng nguồn tìm kiếm `NGUON`, danh mục vai trò `VAI_TRO`.

### NEEDS REFACTOR
- Lệnh `npm run db:seed` và `thu:*` không tự nạp `.env` → phải truyền biến tay. Sửa 20/09: dùng `--env-file-if-exists=.env`.
- `.env` cục bộ có `SEED_ADMIN_PASSWORD` không đạt chính sách mật khẩu → seed dừng. Đã sửa tệp cục bộ (không commit).

### MISSING
Toàn bộ Phase 2–9. Riêng tài liệu: `IMPLEMENTATION_PLAN.md`, `BUSINESS_RULES.md` (tạo 20/09).

### BLOCKER
Không có blocker cứng cho Phase 2. Các câu chờ Giám đốc đều có mặc định an toàn, đổi được trên giao diện, không cần sửa mã (mục 6).

### SECURITY RISK
| Mã | Rủi ro | Mức | Trạng thái |
|---|---|---|---|
| S3 | Sao lưu chỉ nằm trên cùng máy chủ | Cao | Chờ Giám đốc chọn nơi cất (Q5) |
| S10 | Chưa có HSTS ở nginx máy chủ | Thấp | Ghi nhận; thêm khi chắc chắn không còn dịch vụ HTTP thuần trên domain |
| S11 | Chưa có môi trường thử (staging) — kiểm thử tích hợp chỉ chạy trên máy trạm | Trung bình | Ghi nhận |

### TECHNICAL DEBT
- Máy trạm không có Docker/PostgreSQL: CSDL phát triển là cụm PostgreSQL nhúng tại `.pgdata/` (cổng 5434, bản 18 — máy thật là 16; không dùng tính năng riêng của 17/18).
- Chưa có CI; `npm run kiem-tra` chạy tay trước mỗi commit.
- Chưa có thư viện i18n; chữ giao diện viết thẳng tiếng Việt.

## 3. Quy tắc làm việc trong kho mã (tóm tắt)

- Nghiệp vụ ở `src/modules/<phân hệ>/service.ts`, nhận `NguCanh`, **tự kiểm quyền và phạm vi**. Route `/api/v1` chỉ bọc `xuLyApi`. Trang dùng `yeuCauQuyen` + `docDuLieu`.
- Menu chỉ liệt kê màn hình chạy thật (`src/components/khung/dieu-huong.ts`). Không nút chết.
- Mọi bảng mới có `tenant_id` → RLS tự bật; không cần sửa `rls.sql`.
- Tiền `numeric(18,2)`, phần trăm `numeric(7,4)`, thời gian `timestamptz`. Trạng thái = `varchar` + CHECK.
- Không xóa cứng nghiệp vụ; đổi trạng thái.
- Trước commit: `npm run kiem-tra` + `npm run thu:tich-hop` (CSDL phát triển). Trước khi lên máy thật: thêm `npm run thu:http` và diễn tập migrate nếu migration sửa dữ liệu.
- Quyết định kiến trúc mới → thêm dòng vào `docs/quyet-dinh-kien-truc.md`.
- Luật nghiệp vụ → `BUSINESS_RULES.md`.

## 4. Phase 2 — CRM

### Phạm vi
| Hạng mục | Nội dung |
|---|---|
| CSDL | `document_sequences`, `customers`, `contacts`, `leads`, `interactions`, `opportunities`, `tasks` + CHECK + chỉ mục trigram |
| Khách hàng | Danh sách lọc/phân trang, tạo/sửa, **chống trùng** MST (chặn) · điện thoại/email/tên gần giống (cảnh báo, xác nhận mới tạo) |
| Customer 360 | Tổng quan, liên hệ, tương tác, cơ hội, công việc, dòng thời gian hợp nhất |
| Lead | Danh sách, tạo (dò trùng với khách và lead cũ), giao người phụ trách, ghi tương tác, loại, **chuyển đổi** thành khách + liên hệ + cơ hội |
| Cơ hội | Danh sách, tạo/sửa, đổi giai đoạn, luật Owner + Next Action + Next Action Date, thua bắt buộc lý do |
| Pipeline | Kanban 8 cột: 3 cột lead (New Lead, Contacted, Qualified) + 5 cột cơ hội (Opportunity, Quotation, Negotiation, Won, Lost); kéo thả đổi giai đoạn |
| Công việc | Danh sách của tôi / quá hạn, tạo, hoàn thành; gắn với khách/lead/cơ hội |
| Khung | Nút "+ Tạo mới" (Khách hàng, Lead, Cơ hội, Công việc); tìm kiếm thêm khách, MST, điện thoại, email, liên hệ, lead, cơ hội |
| Kiểm thử | Đơn vị (chuẩn hóa, cấp số, luật cơ hội), tích hợp (phạm vi own/team, chống trùng, chuyển đổi lead, CHECK CSDL), HTTP |

### Tiến độ
- [ ] Migration + schema
- [ ] Service + API
- [ ] Giao diện
- [ ] Kiểm thử + build
- [ ] Kiểm tra trên trình duyệt
- [ ] Triển khai máy thật (cần Giám đốc cho phép thời điểm — mục 6)

## 5. Phase 3 trở đi — việc kế tiếp đã rõ

Thiết kế bảng ở `DATABASE.md` phần B. Phase 3 cần tệp giá mẫu thật của nhà cung cấp để kiểm nhập CSV; Phase 4 cần mẫu báo giá TGTH (logo, điều khoản).

## 6. Câu hỏi chờ Giám đốc

| # | Câu hỏi | Mặc định đang chạy | Chặn |
|---|---|---|---|
| Q1 | Cowork là dòng thiết kế chính (VD-088)? | Coi là **có** — prompt 20/09 tiếp tục chỉ định `thegioitinhoc.io.vn` | Không chặn |
| Q2 | Ngưỡng biên lợi nhuận + cấp duyệt (VD-095) | Chưa đặt → mọi báo giá phải duyệt | Phase 4 |
| Q3 | Danh sách nhân sự thật (VD-091) | Chỉ có tài khoản quản trị | Đưa người dùng thật vào |
| Q4 | Nhân viên KD thấy khách của mình hay toàn bộ (VD-096) | `own` cho NV, `team` cho TP — đổi trên màn hình Vai trò | Không chặn |
| Q5 | Nơi cất sao lưu ngoài máy chủ (VD-068) | Sao lưu cùng máy, giữ 14 ngày | **Nên có trước khi nhập dữ liệu khách thật** |
| Q6 | Thời điểm cho phép triển khai Phase 2 lên máy thật | Chưa triển khai; chạy trên máy phát triển | Triển khai |

## 7. Known issues

Xem mục "Vấn đề đã biết" cuối `CHANGELOG.md` của bản mới nhất.
