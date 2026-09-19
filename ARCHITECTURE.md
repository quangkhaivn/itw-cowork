# Kiến trúc — TGTH Business Cowork

Cập nhật: 20/09/2026 (Phase 2 — CRM xong trên máy phát triển).

## 1. Nguyên tắc

1. **Một nguồn dữ liệu.** Một khách hàng một mã, một sản phẩm một SKU, một báo giá có phiên bản, báo giá chấp nhận thành đơn mà không nhập lại (mục 4 master prompt). Không có "ốc đảo dữ liệu" giữa các phân hệ.
2. **Kiểm quyền ở máy chủ, hai lớp chặn dữ liệu.** Ẩn nút ở giao diện không phải phân quyền.
3. **Nghiệp vụ ở một chỗ.** `src/modules/<phân hệ>/service.ts`. Giao diện, API, worker, trợ lý AI đều gọi cùng service.
4. **Không bịa số.** Mọi ngưỡng nghiệp vụ nằm ở màn hình Cấu hình; ngưỡng chưa được Giám đốc đặt thì hệ thống chọn hành vi an toàn (ví dụ: bắt duyệt mọi báo giá) thay vì tự chọn một con số.
5. **Mở rộng, không viết lại.** Phase 1 (12/09) được giữ nguyên kiến trúc; bản 19/09 chỉ bổ sung.

## 2. Đường đi của một yêu cầu

```
Trình duyệt
  │  cookie cowork_phien (httpOnly, SameSite=Lax, Secure)
  ▼
src/proxy.ts ─ yêu cầu ghi tới /api mà Origin khác máy chủ → 403 (chống CSRF)
             ─ trang trong hệ thống mà chưa có phiên hợp lệ → /dang-nhap
  ▼
Route /api/v1/...  =  xuLyApi(handler, { quyen })          (src/lib/api.ts)
  1. đọc phiên; phiên ký trước lần đổi mật khẩu gần nhất → 401
  2. voiTenant(tenantId): mở giao dịch, SET LOCAL app.tenant_id   ← lớp chặn 1
  3. layHoSoQuyen: vai trò + quyền + phạm vi, đọc lại MỖI yêu cầu
  4. đang bị bắt đổi mật khẩu → 403
  5. batBuocQuyen(quyen của route)
  6. handler → service: kiểm quyền chi tiết, phạm vi dữ liệu, bất biến, ghi Audit Log + Business Event
  7. lỗi → ánh xạ: Zod 400 · thiếu quyền 403 (+ ghi vết trong giao dịch RIÊNG) · nghiệp vụ 4xx · còn lại 500 chung chung
  ▼
PostgreSQL: RLS lọc theo app.tenant_id                          ← lớp chặn 2
            quên đặt tenant → 0 dòng, không phải dữ liệu của người khác
```

Trang (Server Component) đi đường tương đương qua `src/lib/trang.ts`: `yeuCauQuyen("user.view")` → `docDuLieu(nd, tx => service(...))`.

## 3. Đa doanh nghiệp (multi-tenant)

Master prompt 19/09 mô tả hệ thống của riêng TGTH. Kiến trúc đa doanh nghiệp của Phase 1 **được giữ lại** (QĐ-06), vì:
- Nó đã chạy thật và có bài thử chứng minh cách ly.
- Tenant `demo` chứa dữ liệu mẫu mà không lẫn vào số liệu thật của tenant `itw`.
- Website B2B mới (`itw-web`, dự án DA-14) sẽ dùng chung PostgreSQL; RLS là hàng rào giữa hai ứng dụng.

Chi phí: mỗi bảng thêm cột `tenant_id` và một chỉ mục. Không có chi phí nào khác cho người dùng.

## 4. Phân quyền (RBAC) và phạm vi dữ liệu

- **Quyền** = `<phân hệ>.<hành động>`, hành động ∈ view, create, update, delete, approve, export. 26 phân hệ × 6 = 156 quyền.
- **Vai trò** gom quyền; 15 vai trò dựng sẵn, bao trùm 10 vai trò ban đầu của master prompt (Super Admin → `admin`, CEO → `ceo`, Accountant → `finance`, Technician → `technical`…). Tạo thêm vai trò trên giao diện.
- **Phạm vi dữ liệu** lưu trên từng dòng `role_permissions.data_scope`: `own` · `team` (cấp dưới trực tiếp và gián tiếp theo `staff_profiles.manager_id`) · `department` (phòng mình và phòng con) · `all`. Nhiều vai trò → lấy phạm vi rộng nhất. Phase 2 dùng:
  ```ts
  const pv = await idNguoiTrongPhamVi(nc.tx, nc.hoSo, "customer.view");
  where: pv === "tat-ca" ? {} : { ownerId: { in: pv } }
  ```
- **Bất biến** (kiểm trong service, có bài thử):
  - Luôn còn ≥ 1 người thật đang hoạt động giữ vai trò Giám đốc hoặc Quản trị.
  - Vai trò Giám đốc/Quản trị luôn đủ toàn quyền, không sửa được.
  - Trợ lý AI không bao giờ có quyền `approve` hay `delete`.
  - Không cấp cho vai trò khác quyền mà chính mình không có.
  - Đổi vai trò của người khác cần thêm quyền `role.update`.

## 5. Xác thực và bảo mật

| Vấn đề | Cách xử |
|---|---|
| Lưu mật khẩu | bcrypt, 12 vòng. Chính sách: ≥ 10 ký tự, có chữ và số, không chứa tên đăng nhập |
| Phiên | JWT HS256 trong cookie httpOnly, 8 giờ; chỉ chứa id người dùng + tenant, **không** chứa quyền |
| Thu hồi phiên | Khóa tài khoản → hết hiệu lực ngay. Đổi / đặt lại mật khẩu → mọi phiên ký trước đó (so tới mili-giây) hết hiệu lực |
| Dò mật khẩu | 30 lần / 15 phút / IP; 5 lần / 15 phút / (doanh nghiệp, email) — áp cả email không tồn tại; sai N lần liên tiếp thì khóa tài khoản M phút (N, M ở màn hình Cấu hình) |
| Liệt kê tài khoản | Một thông báo lỗi cho mọi kiểu sai; vẫn băm một lần khi email không tồn tại để thời gian phản hồi như nhau |
| CSRF | SameSite=Lax + kiểm Origin/Referer ở `proxy.ts` cho mọi yêu cầu ghi tới `/api` |
| XSS, nhúng khung | React tự thoát ký tự; không dùng `dangerouslySetInnerHTML`; CSP `frame-ancestors 'none'` (không đặt X-Frame-Options ở ứng dụng vì nginx máy chủ đã đặt — hai giá trị sẽ mâu thuẫn) |
| SQL injection | Prisma tham số hóa; SQL thô chỉ dùng template có tham số (`$queryRaw\`...${x}\``) |
| IP thật | Chỉ tin `X-Real-IP` do nginx máy chủ đặt; nginx trong Docker chuyển tiếp nguyên giá trị |
| Lộ lỗi | Lỗi ngoài dự kiến chỉ trả câu chung; chi tiết vào log máy chủ. `/api/khoe` không trả chi tiết lỗi |
| Nhật ký | `audit_logs`, `business_events` chỉ ghi thêm — trigger chặn UPDATE/DELETE kể cả với chủ sở hữu; tự che khóa `password`, `token`, `secret`, `apiKey`… |

## 6. Giao diện

- Khung: thanh bên trái (lọc theo quyền **trên máy chủ**), thanh trên (tìm kiếm Ctrl/⌘ K, menu người dùng), breadcrumb trong đầu trang.
- Chỉ những màn hình đã chạy thật mới có mặt trong menu (`src/components/khung/dieu-huong.ts`) — không có nút chết.
- Danh sách: lọc và phân trang **phía máy chủ** qua URL; không tải cả bảng lên trình duyệt.
- Định dạng: `1.234.567 ₫`, `dd/MM/yyyy`, giờ `Asia/Ho_Chi_Minh` — chỉ đổi ở lớp hiển thị (`src/lib/dinh-dang.ts`); CSDL lưu `timestamptz`.
- Điện thoại: dưới 900 px thanh bên thành ngăn kéo, form một cột, không cuộn ngang.

## 7. Tìm kiếm toàn cục

`src/modules/tim-kiem/service.ts` giữ danh sách **nguồn**. Mỗi nguồn tự kiểm quyền và phạm vi. Đang có: màn hình, người dùng, phòng ban (Phase 1); khách hàng — tên, mã, MST, điện thoại, email —, liên hệ, lead, cơ hội (Phase 2). Phase 3 thêm SKU; Phase 4 thêm số báo giá — mỗi phase thêm một phần tử vào mảng `NGUON`. Câu tìm có chữ số được so với cột đã chuẩn hóa, nên "0909 111 222" hay "0305.547.654" đều ra.

## 7b. CRM (Phase 2)

- Phân hệ: `src/modules/{khach-hang,lead,co-hoi,tuong-tac,cong-viec}` + phần dùng chung `src/modules/crm/{chuan-hoa,hang-so,chung}.ts`.
- Quyền: khách/liên hệ `customer.*`, lead/tương tác `crm.*`, cơ hội `sales.*`, công việc `task.*`. Phạm vi theo `owner_id` qua `locTheoPhamVi()`.
- Xem cơ hội theo tài khoản khách (QĐ-13): `dieuKienXemCoHoi()`.
- Chuyển đổi lead gọi lần lượt `taoKhachHang` → `taoLienHe` → `taoCoHoi` trong cùng giao dịch của `xuLyApi`: lỗi ở đâu cũng cuộn ngược hết.
- Luật nghiệp vụ và nơi chặn: `BUSINESS_RULES.md` mục 3.
- Giao diện: thành phần dùng chung ở `src/components/crm/` (cảnh báo trùng, chọn khách, ô tiền, ghi tương tác, tạo việc, hộp đổi giai đoạn, dòng thời gian).

## 8. Tác vụ nền

`worker/index.ts` dùng chung ảnh Docker với app. Phase 1 mới đấu dây (nhịp 60 giây kiểm CSDL + Redis). Phase 8 thêm: bộ lập lịch, quy tắc nhắc việc (đọc ngưỡng từ Cấu hình), sinh thông báo.

## 9. Việc chưa làm có chủ đích

| Việc | Vì sao chưa | Làm ở |
|---|---|---|
| Chuông thông báo | Chưa có sự kiện nào cần báo cho người dùng; chuông không có gì bên trong là nút chết | Phase 8 |
| Tùy chọn cột trên bảng | Bảng CRM 5–7 cột vẫn đọc tốt; chưa có yêu cầu thật để ẩn/hiện cột | khi có yêu cầu |
| Xuất CSV khách hàng | Quyền `customer.export` đã có nhưng chưa có màn hình; không để nút chết | Phase 3 (dùng chung bộ nhập/xuất của sản phẩm) |
| Song ngữ Việt–Anh | Chữ giao diện hiện viết thẳng; chuẩn bị bằng cách gom nhãn menu vào một tệp. Tách từ điển khi có yêu cầu thật | khi cần |
| Lưu tệp (đối tượng) | Chưa phân hệ nào cần đính kèm | Phase 6 (ảnh nghiệm thu) |
