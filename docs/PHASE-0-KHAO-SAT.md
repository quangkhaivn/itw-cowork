# Phase 0 — Khảo sát kho mã và lộ trình

Ngày khảo sát: 19/09/2026. Căn cứ: master prompt "TGTH Business Cowork Platform" (45 mục).
Phạm vi: `L:\CODE\cowork-itw` trên máy trạm và `/root/cowork-itw` trên VPS `thegioitinhoc.io.vn`.

## 1. Kiến trúc hiện tại (trước khi sửa)

- Next.js 16 (App Router) + React 19 + TypeScript, Prisma 7 (adapter `pg`), PostgreSQL 16, Redis, Zod, bcrypt, JWT (jose). Một dịch vụ `app` phục vụ cả giao diện lẫn API; worker dùng chung ảnh.
- Docker Compose 5 dịch vụ trên VPS; nginx máy chủ giữ TLS. Đang chạy, `/khoe` trả 200, 6 ngày không khởi động lại.
- **Đa doanh nghiệp hai lớp**: `voiTenant()` đặt `app.tenant_id` trong giao dịch + RLS ở PostgreSQL; ứng dụng dùng vai `cowork_app` không phải chủ sở hữu. Có bài thử chứng minh cách ly (11 kiểm chứng).
- Kiến trúc tốt → **mở rộng, không viết lại**.

## 2. Cơ sở dữ liệu hiện tại

11 bảng: `tenants, tenant_settings, departments, users, staff_profiles, roles, permissions, role_permissions, user_roles, business_events, audit_logs`. Hai bảng nhật ký chỉ ghi thêm (trigger chặn sửa/xóa). Dữ liệu thật trên VPS: 1 doanh nghiệp, 1 người dùng thật + 1 tài khoản máy, 9 sự kiện, 8 dòng kiểm toán, 8,8 MB, mã hóa UTF8. **Chưa có dữ liệu kinh doanh nào.**

## 3. Phân hệ đã có

| Có | Mức |
|---|---|
| Đăng nhập / đăng xuất | Chạy thật |
| 15 vai trò, 144 quyền, kiểm quyền `batBuocQuyen` | Chạy thật, chưa có giao diện quản trị |
| Business Events, Audit Log | Chạy thật, chưa có màn hình tra cứu |
| Bảng điều khiển | Một trang đếm người dùng / vai trò / sự kiện |
| Worker | Đấu dây, chưa có việc |
| Script đặt lại mật khẩu quản trị | Tạo sáng 19/09 (ngoài phiên này) |

## 4. Thành phần tái sử dụng

`voiTenant`, RLS, `layHoSoQuyen`, `ghiSuKien`, `ghiKiemToan` (có che khóa nhạy cảm), danh mục vai trò + bất biến AI, quy trình `trien-khai.sh` 7 bước, Dockerfile chịu được mạng chập chờn, 3 bài thử tích hợp.

## 5. Còn thiếu so với Phase 1 của master prompt

Khung ứng dụng (sidebar, header, breadcrumb, tìm kiếm, menu người dùng) · quản trị người dùng / vai trò / phòng ban · phạm vi dữ liệu own/team/department/all · dữ liệu gốc · cấu hình hệ thống · tra cứu nhật ký kiểm toán · đổi mật khẩu · kiểm thử đơn vị · lint · tài liệu (thư mục `docs/` rỗng dù `docker-compose.yml` trỏ tới).

## 6. Vấn đề bảo mật tìm thấy

| # | Vấn đề | Mức | Xử lý |
|---|---|---|---|
| S1 | Không giới hạn số lần đăng nhập — dò mật khẩu không bị chặn | Cao | Đã sửa: giới hạn theo IP + tài khoản, khóa tạm |
| S2 | Không có cách đổi mật khẩu trên giao diện; mật khẩu khởi tạo quản trị đã hiện trong khung chat 12/09 | Cao | Đã sửa: trang đổi mật khẩu, bắt đổi lần đầu, phiên cũ bị vô hiệu |
| S3 | Chưa có sao lưu CSDL (VD-068) | Cao | Một phần: script + tự sao lưu trước migrate. **Còn**: nơi cất ngoài máy chủ |
| S4 | IP ghi vào nhật ký giả được: lấy phần tử đầu `X-Forwarded-For`; nginx trong Docker ghi đè `X-Real-IP` bằng IP cổng Docker | Trung bình | Đã sửa |
| S5 | Không kiểm Origin cho yêu cầu ghi (chỉ dựa SameSite=Lax) | Trung bình | Đã sửa |
| S6 | `/api/khoe` công khai trả nguyên thông báo lỗi CSDL | Thấp | Đã sửa |
| S7 | Ghi vết từ chối quyền mất khi giao dịch cuộn ngược | Trung bình (mất vết dò quyền) | Đã sửa |
| S8 | Seed đồng bộ cứng quyền mỗi lần triển khai — sẽ xóa phân quyền đã chỉnh | Trung bình | Đã sửa |
| S9 | Phiên JWT không thu hồi được khi đổi mật khẩu | Trung bình | Đã sửa (so mốc đổi mật khẩu) |

## 7. Nợ kỹ thuật

- Migration chỉ nằm trên máy chủ, kho mã trên máy trạm không có → **đã kéo về và commit**.
- Kho mã chưa có commit nào → **đã commit bản nền 12/09 làm mốc lùi** trước khi sửa.
- Danh sách bảng bật RLS viết tay → nay tự quét mọi bảng có `tenant_id`.
- `src/middleware.ts` theo quy ước cũ → `src/proxy.ts` (Next 16).
- Chưa có môi trường thử (staging) — xem mục 10.

## 8. Lộ trình Phase 0 → 9

Thứ tự bám master prompt mục 40, và khớp thứ tự Giám đốc đã ưu tiên ngày 12/09 (khách hàng → lead → cơ hội → báo giá → đơn/dự án → thanh toán).

| Phase | Nội dung | Điều kiện xong | Phụ thuộc |
|---|---|---|---|
| 0 | Khảo sát | Báo cáo này | — |
| **1** | **Nền móng**: đăng nhập, người dùng, phòng ban, RBAC + phạm vi, dữ liệu gốc, cấu hình, nhật ký, khung ứng dụng | **Xong 19/09/2026** | — |
| 2 | CRM: khách hàng (chống trùng MST/điện thoại/email/tên), liên hệ, lead, hoạt động, cơ hội + luật Owner/Next Action/Date, pipeline Kanban + bảng, Customer 360 | Nhân viên tạo lead → chuyển thành khách + cơ hội → ghi cuộc gọi trên điện thoại → trưởng phòng thấy trên pipeline nhóm | Danh sách nhân sự thật (Q3) |
| 3 | Sản phẩm, nhóm, thương hiệu, nhà cung cấp, giá nhiều nhà cung cấp, lịch sử giá, nhập/xuất CSV-Excel | Nhập được bảng giá thật; tìm theo SKU/model/tên < 300 ms | Tệp giá mẫu từ nhà cung cấp; danh mục 7.126 sản phẩm website (VD-084) |
| 4 | **Báo giá**: phiên bản, tính biên, duyệt theo ngưỡng, PDF, gửi email, chuyển thành đơn | Báo giá dưới ngưỡng không gửi được khi chưa duyệt; chuyển đơn không nhập lại | Ngưỡng biên + cấp duyệt (Q2); mẫu báo giá TGTH |
| 5 | Đơn hàng, kho nhiều kho, giữ chỗ, serial, phiếu kho, mua hàng | Đơn xác nhận giữ chỗ tồn; xuất kho ghi serial | Danh sách kho thật |
| 6 | Dự án kỹ thuật, nghiệm thu, phiếu hỗ trợ + SLA, bảo hành, bảo trì, gia hạn | Bảo hành sắp hết tự tạo cơ hội gia hạn | Chính sách bảo hành (VD-038) |
| 7 | Bảng điều hành CEO/Sales, báo cáo, tài chính quản trị (doanh thu, giá vốn, lãi gộp, công nợ) | Mọi chỉ số mục 6 master prompt có số thật, lọc theo kỳ / người / nhóm hàng / phân khúc | Dữ liệu Phase 2–5 |
| 8 | Thông báo, lịch chạy nền, quy tắc nhắc việc, "Việc hôm nay" | Mỗi sáng mỗi nhân viên có danh sách việc | Các ngưỡng nhắc việc ở màn hình Cấu hình |
| 9 | AI: trợ lý bán hàng, báo giá, nhắc việc, CEO | Qua đủ bài thử ở `AI_ARCHITECTURE.md` mục 5 | Dữ liệu lõi ổn định; ngân sách AI |

## 9. Cấu trúc thư mục ứng dụng

```
src/
  app/
    (he-thong)/                 màn hình sau đăng nhập — dùng chung khung
      bang-dieu-khien/          Dashboard
      crm/{lead,khach-hang,lien-he,hoat-dong,co-hoi}/          Phase 2
      ban-hang/{pipeline,bao-gia,don-hang,muc-tieu}/           Phase 2–5
      san-pham/{san-pham,nhom,thuong-hieu,bang-gia,nha-cung-cap}/  Phase 3
      kho/  mua-hang/  du-an/  dich-vu/  cong-viec/  tai-chinh/  bao-cao/  ai/   Phase 5–9
      quan-tri/{nguoi-dung,vai-tro,phong-ban,du-lieu-goc,cau-hinh,tich-hop,nhat-ky-kiem-toan}/
      tai-khoan/
    api/v1/<phân hệ>/…          Route Handler mỏng → service
    dang-nhap/  doi-mat-khau/
  modules/<phân hệ>/
    luoc-do.ts                  Zod: dữ liệu vào
    service.ts                  nghiệp vụ: kiểm quyền, phạm vi, bất biến, nhật ký
    tinh-toan.ts                hàm thuần (giá, biên lợi nhuận, tồn kho) — kiểm thử đơn vị
  lib/                          db, api, trang, phan-quyen, pham-vi, kiem-toan, su-kien, dinh-dang, …
  components/{khung,ui}/
worker/                         lập lịch + việc nền (Phase 8)
thu/{don-vi,*.ts}               kiểm thử
```

Tên thư mục giao diện là đường dẫn tiếng Việt không dấu (nhân viên đọc được URL); tên bảng CSDL tiếng Anh.

## 10. Quyết định cần Giám đốc xác nhận

Chỉ những câu thật sự đổi hướng làm. Các lựa chọn kỹ thuật nhỏ đã tự quyết và ghi ở `docs/quyet-dinh-kien-truc.md`.

| # | Câu hỏi | Chặn gì | Mặc định đang dùng nếu chưa trả lời |
|---|---|---|---|
| Q1 | Master prompt 19/09 có phải là câu trả lời cho `VD-088` không — tức **Cowork là dòng thiết kế chính**, ba dòng trước (AI Hub, AI Business Platform, ERP Python) dừng? Đội sinh viên có đang viết mã song song không? | Mọi mã chạm bảng khách hàng (Phase 2) | Coi Cowork là dòng chính và tiếp tục |
| Q2 | **Ngưỡng biên lợi nhuận gộp** tối thiểu (%) và **cấp duyệt**: dưới ngưỡng thì Trưởng phòng Kinh doanh duyệt đến mức nào, dưới mức nào phải Giám đốc? | Phase 4 | Chưa đặt → mọi báo giá phải duyệt |
| Q3 | Danh sách **phòng ban và nhân sự thật** (họ tên, email, phòng, quản lý trực tiếp, vai trò) để tạo tài khoản | Đưa người dùng thật vào, từ Phase 2 | 9 phòng ban mẫu; chỉ có tài khoản quản trị |
| Q4 | **Nhân viên kinh doanh chỉ thấy khách của mình** (phạm vi `own`), trưởng phòng thấy cả nhóm — đúng ý không? Hay kinh doanh được xem toàn bộ khách để tránh hai người cùng gọi một khách? | Phase 2 | `own` cho nhân viên, `team` cho trưởng phòng |
| Q5 | **Nơi cất bản sao lưu ngoài máy chủ** (Google Drive công ty / VPS khác / S3) | An toàn dữ liệu khi bắt đầu nhập dữ liệu kinh doanh thật | Sao lưu trên cùng máy, giữ 14 ngày |
