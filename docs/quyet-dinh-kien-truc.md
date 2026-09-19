# Sổ quyết định kiến trúc

Mỗi quyết định: bối cảnh, lựa chọn, lý do, hệ quả. Đổi quyết định thì thêm dòng mới, không sửa dòng cũ.

| Mã | Ngày | Quyết định | Lý do | Người chốt |
|---|---|---|---|---|
| QĐ-01 | 12/09/2026 | Kho mã mới `cowork-itw`, không mở rộng `tmdt` | `tmdt` không có `tenant_id`; nhồi đa doanh nghiệp vào 33 bảng có sẵn dễ rò dữ liệu. Chỉ mang sang thiết kế giữ chỗ tồn kho và sổ cái kép | Giám đốc (qua đề xuất) |
| QĐ-02 | 12/09/2026 | Tên bảng/cột tiếng Anh `snake_case`; giao diện, chú thích, tài liệu tiếng Việt | Theo mục 20 đặc tả 12/09; tên tiếng Anh ổn định cho tích hợp và công cụ AI | Trợ lý, đã báo |
| QĐ-03 | 12/09/2026 | Gộp frontend + backend thành một dịch vụ `app` (Next.js) | Tách đôi không đem lại lợi ích ở quy mô này, lại tăng số thành phần phải vận hành | Trợ lý, đã báo |
| QĐ-04 | 12/09/2026 | Cách ly tenant hai lớp: `voiTenant()` + RLS, ứng dụng dùng vai `cowork_app` | Không dựa vào kỷ luật lập trình viên | Trợ lý |
| QĐ-05 | 19/09/2026 | **Giữ CSS thuần có biến màu, chưa thêm Tailwind + shadcn/ui** | Master prompt mục 27: "nếu project đã có stack tốt thì tiếp tục stack hiện tại". Hệ giao diện hiện là một tệp CSS; các màn hình quản trị dựng xong không cần thư viện. Thêm Tailwind + shadcn/ui kéo theo trình biên dịch CSS và hàng chục gói Radix — mỗi lần dựng ảnh trên VPS lâu hơn, trong khi mạng tới npm hay đứt. **Xem lại** khi Phase 2 cần bảng dữ liệu phức tạp (tùy chọn cột, kéo thả Kanban): nếu tự viết tốn hơn ~2 ngày thì thêm TanStack Table / thư viện kéo thả thay vì cả bộ UI | Trợ lý — Giám đốc có thể đảo |
| QĐ-06 | 19/09/2026 | Giữ kiến trúc đa doanh nghiệp dù master prompt 19/09 chỉ mô tả TGTH | Đã chạy và có bài thử; cách ly dữ liệu mẫu (tenant `demo`) khỏi dữ liệu thật; là hàng rào giữa Cowork và website `itw-web` khi dùng chung CSDL | Trợ lý |
| QĐ-07 | 19/09/2026 | Phạm vi dữ liệu lưu trên `role_permissions.data_scope`, "team" theo chuỗi `staff_profiles.manager_id` | Một chỗ khai báo cho cả quyền và phạm vi; Giám đốc chỉnh được trên giao diện; không cần bảng "nhóm" riêng khi sơ đồ tổ chức đã có quản lý trực tiếp | Trợ lý |
| QĐ-08 | 19/09/2026 | API nghiệp vụ là Route Handler `/api/v1` gọi service, không dùng Server Actions | Cùng một service phục vụ giao diện, worker, tích hợp và công cụ AI; đường HTTP rõ ràng để kiểm thử đầu-cuối | Trợ lý |
| QĐ-09 | 19/09/2026 | Công nợ phải thu/phải trả là VIEW tính từ hóa đơn và thanh toán, không phải bảng | Master prompt mục 4 (một nguồn dữ liệu) thắng mục 28 (liệt kê Receivable/Payable như thực thể) khi hai mục mâu thuẫn | Trợ lý — áp dụng ở Phase 7 |
| QĐ-10 | 19/09/2026 | Seed không đè chỉnh sửa của con người | Seed chạy ở mọi lần triển khai. Bản 12/09 đồng bộ cứng quyền → mỗi lần triển khai sẽ xóa phân quyền đã chỉnh | Trợ lý |
| QĐ-11 | 19/09/2026 | Kiểm thử bằng `node:test` qua `tsx`, không thêm Jest/Vitest | Đủ cho logic thuần và bài thử tích hợp; bớt một phụ thuộc | Trợ lý |
