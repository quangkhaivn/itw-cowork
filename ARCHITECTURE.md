# Kiến trúc — TGTH Business Cowork

Cập nhật: 20/09/2026 (Phase 2 — CRM và Phase 3 — Sản phẩm xong trên máy phát triển).

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
| Xác thực 2 lớp | TOTP RFC 6238 tự viết (`src/lib/totp.ts`); đăng nhập hai bước qua phiên tạm 5 phút; mã sai dùng chung bộ đếm khóa tài khoản; bật/tắt/đặt lại thu hồi phiên khác qua `users.security_changed_at` (mục 7r) |
| Bí mật lưu trong CSDL | Mật khẩu SMTP, khóa TOTP: AES-256-GCM bằng `APP_ENC_KEY`, ngữ cảnh (doanh nghiệp / người dùng) trong AAD; CHECK chỉ nhận chuỗi `v1:…` (`src/lib/ma-hoa.ts`, QĐ-68) |
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

## 7c. Sản phẩm và bảng giá (Phase 3)

- Phân hệ: `src/modules/{san-pham,danh-muc-san-pham,nha-cung-cap}`; phần thuần ở `src/modules/san-pham/chuan-hoa.ts` và `src/lib/csv.ts`.
- Quyền: `product.*` cho sản phẩm / nhóm / thương hiệu / bảng giá; `supplier.*` cho nhà cung cấp. **Không có phạm vi theo người** (QĐ-18).
- Mọi đổi giá đi qua `ghiLichSuGia()` → `price_history` chỉ-ghi-thêm; kể cả nhập CSV, vì nhập gọi lại đúng service thường.
- `giaChoBaoGia(nc, ids)` là cửa cho Phase 4: trả giá vốn tham chiếu, giá bán, VAT, bảo hành và nguồn nên mua của từng SKU.
- Nhập CSV chạy trong chính giao dịch của `xuLyApi`: xem trước không ghi gì; khi ghi thật, dòng hỏng bị bỏ qua và cả lần nhập lưu một `import_jobs`.

## 7d. Báo giá (Phase 4)

- Phân hệ: `src/modules/bao-gia` (`tinh-toan.ts` thuần — tính tiền, biên lợi nhuận, luật duyệt, đọc tiền bằng chữ; `luoc-do.ts`; `service.ts`) và `src/modules/ho-so-cong-ty` (thông tin in đầu chứng từ).
- **Một đầu phiếu, nhiều phiên bản**: `quotations` giữ số và người phụ trách; mỗi `quotation_versions` là một bản gửi khách. Sửa bản đã gửi = tạo phiên bản mới, bản cũ chuyển `SUPERSEDED` (BG-02).
- Giao diện, API, bản in và (sau này) trợ lý AI **dùng chung một hàm** `tinhBaoGia()` nên con số không bao giờ lệch nhau; làm tròn từng dòng về đồng rồi mới cộng.
- Ngưỡng duyệt đọc từ Cấu hình `bao_gia.nguong_bien_loi_nhuan`, **không viết cứng**; chưa đặt thì mọi báo giá phải duyệt (BG-04).
- Phạm vi xem như cơ hội (QĐ-13): người lập, cộng đường chủ tài khoản khách.
- Bản in là trang riêng ngoài khung ứng dụng (`src/app/(in)/bao-gia/[id]/in`), in bằng trình duyệt (QĐ-21); phần đầu lấy từ Hồ sơ công ty (QĐ-22). Từ 0.16.0 bố cục theo mẫu PDF báo giá của ITW CRM, có logo công ty (`tenant_settings` khóa `cong_ty.logo`, nhúng `data:` URI; kiểm byte đầu bằng `nhanDangTep()` của tệp đính kèm).

## 7e. Đơn hàng và kho (Phase 5)

- Phân hệ: `src/modules/don-hang` và `src/modules/kho`; phần thuần ở `don-hang/tinh-toan.ts` (trạng thái, tiến độ giao) và `kho/tinh-toan.ts` (chiều tác động của từng loại giao dịch, chặn số dư âm).
- **Một cửa duy nhất đụng tồn kho**: `ghiSoKho()`. Hàm này khóa dòng số dư bằng `SELECT … FOR UPDATE`, tính số dư mới bằng hàm thuần, chặn nếu âm, rồi ghi **cùng lúc** dòng sổ cái và số dư mới. Không chỗ nào trong hệ thống tự cộng trừ tồn kho theo cách riêng.
- Đơn hàng đụng kho ở đúng ba chỗ: xác nhận (giữ chỗ), hủy (nhả giữ chỗ), xuất hàng (trừ tồn + nhả phần giữ chỗ tương ứng). Mọi dòng sổ cái của một đơn đều mang `ref_type = 'don-hang'` và `ref_id` là id đơn, nên phần còn giữ chỗ của đơn luôn tính đúng bằng một phép cộng.
- Tiền của đơn dùng lại `tinhBaoGia()` của Phase 4 — một cách tính cho cả báo giá và đơn (DH-08).
- `doiSoatKho()` so tổng sổ cái với số dư từng cặp (kho, sản phẩm); bài thử tích hợp chạy hàm này sau mọi nghiệp vụ.

## 7f. Dự án, bảo hành, bàn dịch vụ (Phase 6)

- Phân hệ: `src/modules/{bao-hanh,ho-tro,du-an}`; phần thuần ở `bao-hanh/tinh-toan.ts` (ngày hết hạn tính theo NGÀY, không theo giờ), `ho-tro/tinh-toan.ts` (luồng trạng thái + hạn SLA), `du-an/tinh-toan.ts` (tiến độ theo hạng mục).
- **Chuỗi nối tiếp Phase 5**: `taoPhieuXuat()` gọi `sinhBaoHanhKhiGiao()` ngay trong cùng giao dịch — giao hàng và bảo hành không bao giờ lệch nhau. Phiếu hỗ trợ gắn bảo hành → sê-ri → đơn hàng, nên mở phiếu chỉ cần số máy.
- Hạn SLA **chụp lại lúc mở phiếu**: đổi ngưỡng trong Cấu hình không làm đổi cam kết đã hứa với khách (HT-03).
- Diễn biến phiếu và sổ cái kho dùng chung một cách: bảng chỉ-ghi-thêm + trigger `chan_sua_xoa()`.
- Nghiệm thu dự án là **cổng chặn có điều kiện dữ liệu**: service tính lại tiến độ từ hạng mục chứ không tin cờ trạng thái (DU-05).

## 7g. Tài chính và bảng điều hành (Phase 7)

- Phân hệ: `src/modules/tai-chinh` (hóa đơn, công nợ, thu tiền) và `src/modules/bang-dieu-khien`. Phần thuần ở `tai-chinh/tinh-toan.ts`: `congNo()`, `soNgayQuaHan()`, `nhomTuoiNo()`, `tongHopTuoiNo()`, `hanThanhToanGoiY()`, `bienLoiNhuanKy()`.
- **Số tiền một nguồn**: hóa đơn tính bằng đúng `tinhBaoGia()` mà báo giá và đơn hàng dùng. Ba chứng từ không thể ra ba con số cho cùng một dòng hàng.
- **Công nợ không lưu**: còn nợ = hóa đơn đã phát hành − phân bổ của phiếu thu còn hiệu lực, tính lúc đọc (QĐ-09). Hủy phiếu thu chỉ đổi trạng thái nên công nợ tự quay lại, không cần bút toán đảo.
- Bảng điều hành **dùng lại `dieuKienXem*` của từng phân hệ** thay vì viết truy vấn riêng, nên phạm vi dữ liệu trên trang tổng quan luôn khớp với phạm vi trên màn hình chi tiết. Khối nào người xem không có quyền thì trả `null` và màn hình bỏ hẳn khối đó.
- Mọi ngưỡng (số ngày công nợ, cảnh báo quá hạn) đọc từ Cấu hình. **Chưa đặt thì không bịa**: phát hành hóa đơn bị từ chối cho tới khi có hạn, và màn hình công nợ nói rõ là chưa đặt ngưỡng.

## 7h. Tự động hóa, nhắc việc, bảo trì và gia hạn (Phase 8)

- Phân hệ: `src/modules/{nhac-viec,thong-bao,bao-tri}`. Phần thuần ở `nhac-viec/tinh-toan.ts` (ngày tháng theo giờ Việt Nam, kỳ bảo trì, điều kiện chạy quy tắc, câu tóm tắt chuông) và danh mục quy tắc ở `nhac-viec/quy-tac.ts`.
- **Quy tắc là mã, không phải dữ liệu.** Bảng `automation_rules` chỉ giữ công tắc; mỗi quy tắc tự biết mình quét gì và cần ngưỡng nào (QĐ-30).
- **Bản quét chạy với tư cách hệ thống**, nên nó nhìn toàn bộ dữ liệu của doanh nghiệp. Việc sinh ra luôn gắn đúng người phụ trách bản ghi, và mỗi người chỉ đọc được việc của chính mình — phạm vi dữ liệu không bị bản quét chọc thủng.
- **Chống chạy hai lần dựa vào CSDL, không dựa vào bộ nhớ**: chỉ mục riêng phần `job_runs_lich_moi_ngay` cho lần chạy theo lịch, khóa duy nhất cho từng việc và từng thông báo. Worker khởi động lại giữa chừng cũng không quét lại.
- `worker/index.ts` quét **từng doanh nghiệp trong một giao dịch riêng**: một doanh nghiệp hỏng không kéo theo doanh nghiệp khác, và lần chạy hỏng vẫn nằm lại trong `job_runs` kèm lỗi.
- Thông báo dùng chung một hàm `taoThongBao(tx, tenantId, …)` nhận `tx` chứ không nhận `NguCanh`, vì worker nền cũng gọi nó mà không có người dùng nào đứng sau.

## 7i. Trợ lý AI (Phase 9)

- Phân hệ: `src/modules/tro-ly`. `nha-cung-cap.ts` (giao diện + cài đặt Anthropic + đọc cấu hình), `cong-cu.ts` (sổ công cụ đọc), `de-xuat.ts` (công cụ ghi duy nhất + luồng duyệt), `service.ts` (vòng lặp), `tinh-toan.ts` (phần thuần).
- **Công cụ là lớp bọc mỏng trên service**, không có công cụ nào tự truy vấn CSDL. Đây là lý do trợ lý không cần một hệ phân quyền riêng: nó dùng lại đúng hệ đang có.
- **Hai lớp kiểm quyền**: danh sách công cụ gửi cho mô hình đã lọc theo quyền người hỏi, và mỗi công cụ còn bị `batBuocQuyen` một lần nữa ngay trước khi chạy. Lớp thứ hai để một lỗi ở lớp thứ nhất không thành lỗ hổng.
- **Trợ lý không ghi dữ liệu nghiệp vụ.** Công cụ ghi duy nhất là `de_xuat_hanh_dong`, và nó chỉ ghi được một dòng `ai_actions` trạng thái đề xuất. Chốt cuối nằm ở CHECK trong CSDL, không chỉ ở mã.
- **Đổi mô hình là đổi cấu hình**: `AI_PROVIDER`, `AI_MODEL`, khóa API trong biến môi trường. Chưa cấu hình thì hệ thống nói thẳng, không có chế độ "trả lời tạm".
- Kiểm thử cắm **nhà cung cấp kịch bản** qua `datNhaCungCapThu()` nên vòng lặp, kiểm quyền và luồng duyệt kiểm được tất định, không gọi mạng (QĐ-33).

## 7j. Mua hàng (phần để lại từ Phase 5)

- Phân hệ: `src/modules/mua-hang`. Phần thuần ở `tinh-toan.ts`: vòng đời chứng từ, `tienDoNhan()`, `tinhDonMua()`, `soLuongCanMua()`.
- **Không có đường ghi tồn riêng cho mua hàng.** Nhận hàng gọi đúng `ghiSoKho()` của Phase 5, với `ref_type = 'don-mua'`. Nhờ vậy `doiSoatKho()` — bất biến "số dư == tổng sổ cái" — vẫn đúng sau khi có mua hàng, và bài thử kiểm lại điều đó sau **mỗi** lần nhận.
- **Kiểm hết rồi mới ghi**: cả phiếu nhận được kiểm (số lượng còn lại, đủ sê-ri, sê-ri không trùng) trước khi ghi bất cứ dòng nào. Một dòng sai thì không có phiếu nào được tạo.
- Trạng thái đơn tính lại từ dữ liệu thật của các dòng sau mỗi lần nhận, không tin cờ đang lưu — cùng cách Phase 5 làm với phiếu xuất.
- `tinhDonMua()` cố ý **không** tính giá vốn: với đơn mua thì đơn giá chính là giá vốn, nên không có biên lợi nhuận để tính.

## 7k. Công nợ phải trả

- Phân hệ: `src/modules/cong-no-tra`. **Không có phần thuần riêng**: nó dùng lại `congNo()`, `nhomTuoiNo()`, `tongHopTuoiNo()` của `tai-chinh/tinh-toan.ts` và `tinhDonMua()` của `mua-hang/tinh-toan.ts`.
- `congNo()` nhận thêm tham số **trạng thái bắt đầu tính nợ** ("ISSUED" cho hóa đơn bán ra, "RECORDED" cho hóa đơn nhà cung cấp) thay vì nhân đôi công thức. Một chỗ sửa, hai chiều nợ cùng đúng.
- Nợ phải trả **không lưu**: còn nợ = hóa đơn đã ghi nhận − phân bổ của phiếu chi còn hiệu lực, tính lúc đọc (QĐ-09). Hủy phiếu chi chỉ đổi trạng thái nên nợ tự quay lại, không cần bút toán đảo.
- **Hạn thanh toán bắt buộc nhập** khi ghi nhận: nó in trên hóa đơn nhà cung cấp. Đây là chỗ khác hóa đơn bán ra — bên bán mình tự đặt hạn theo chính sách, bên mua thì đọc hạn từ chứng từ nhận được (QĐ-38).
- Dòng hóa đơn giữ `order_item_id`, nên màn hình đối chiếu được ba con số: **đặt** (đơn mua), **nhận** (sổ kho), **đòi** (hóa đơn) — và cảnh báo khi lệch, trước lúc ghi nhận.

## 7l. Trả hàng và đổi máy

- Phân hệ: `src/modules/tra-hang`. Phần thuần chỉ giữ vòng đời, số lượng trả tối đa và kiểm phân bổ giảm trừ; **tiền** dùng lại `tinhDonMua()`, **nợ** dùng lại `congNo()`, **kho** dùng lại `ghiSoKho()`. Không có công thức nào của riêng phần này.
- Hai chiều (khách trả / trả nhà cung cấp) dùng **chung một bộ trạng thái** `DRAFT → CONFIRMED → SETTLED`, chỉ khác nhãn hiển thị: "Đã nhận lại hàng" với chiều bán, "Đã trả hàng đi" với chiều mua. Một vòng đời thì một chỗ để hiểu sai.
- Hai bước cố ý tách: **hàng qua kho** cần `inventory.update`, **chốt tiền** cần `finance.approve` (QĐ-41). Gộp lại thì chỉ Giám đốc bấm được, vì không vai trò dựng sẵn nào cầm cả hai.
- Màn hình khách trả hàng cần **ba vai trò** cùng nhìn (kinh doanh, chăm sóc khách hàng, kế toán), nên kiểm "một trong các quyền" ở service và `yeuCauMotTrongCacQuyen()` ở trang — thay vì cấp cho ai đó một quyền rộng hơn việc của họ (cùng lý lẽ QĐ-31).
- Sê-ri khai lúc lập phiếu **chưa** đụng bảng `serial_numbers`; mới chỉ là ý định, ghi kèm dòng phiếu. Chỉ bước xác nhận mới kiểm chặt và đổi trạng thái sê-ri — vì trước đó hàng chưa thật sự nằm trong tay mình (TH-04, TH-05).
- `congNo()` trả `daThu` và `daGiamTru` **tách nhau**. Cộng gộp thì màn hình nói nhầm là khách đã trả tiền, trong khi thực tế nợ được xóa bằng hàng (QĐ-42).

## 7m. Chuyển kho nội bộ

- Phân hệ: `src/modules/chuyen-kho`. Phần thuần giữ vòng đời, tổng kết xuất/nhận và luật "thiếu thì phải có lý do"; hàng đi qua **đúng** `ghiSoKho()` như mọi phân hệ khác.
- **Hai bước, và giữa hai bước hàng không thuộc kho nào** (QĐ-43). Hệ quả cố ý: tồn tổng của công ty thấp hơn thực tế đúng bằng số đang trên đường. Màn hình danh sách nêu con số đó ngay ô đầu tiên, và trang chi tiết nói rõ khi phiếu đang ở `IN_TRANSIT`.
- **Không dựng kho ảo "đang chuyển"** để giữ cho tồn tổng không đổi. Kho ảo là một cái kho không có thật trong danh sách kho của Giám đốc, và mọi báo cáo sau này phải nhớ loại nó ra.
- Sê-ri có thêm trạng thái `dang-chuyen` với ràng buộc `warehouse_id IS NULL`. Nới CHECK cũ thay vì lách bằng cách gán sẵn kho đích lúc xuất — gán sẵn nghĩa là CSDL nói máy đã ở kho đích trong khi nó đang trên xe.
- Nhận thiếu **không** sinh bút toán bù. Sổ kho đã ghi một bút toán xuất và một bút toán nhập nhỏ hơn, nên số dư vẫn cộng đúng bằng sổ cái; cái hệ thống đòi là **lý do**, không phải một con số cân đối giả.

## 7n. Tệp đính kèm

- Phân hệ: `src/modules/dinh-kem`. Ba tệp tách rõ: `tinh-toan.ts` (thuần — danh sách trắng, nhận dạng byte, làm sạch tên, sinh đường dẫn), `kho-tep.ts` (đọc/ghi đĩa, chỉ chạy ở máy chủ), `quyen.ts` (mượn quyền của chứng từ chủ), `service.ts` (ráp lại).
- **Không có mã quyền riêng** (QĐ-44). `quyen.ts` map từng loại chứng từ sang mã quyền xem/sửa của chính chứng từ đó, rồi gọi lại đúng `dieuKienXem*()` của phân hệ chủ để kiểm phạm vi — không viết lại logic phạm vi lần hai.
- **Nhận dạng tệp theo nội dung, không theo đuôi hay Content-Type** (QĐ-45): đây là chỗ duy nhất hệ thống nhận byte thô từ người dùng và ghi lên đĩa máy chủ, nên không tin bất cứ điều gì phía gửi tự khai.
- Ghi đĩa **trước**, ghi bản ghi CSDL **sau** trong cùng luồng xử lý (không phải cùng giao dịch DB — ổ đĩa không tham gia transaction). Ghi đĩa hỏng thì giao dịch CSDL chưa chạy, không có bản ghi mồ côi; CSDL hỏng sau đó thì chỉ còn rác trên đĩa, không phải bản ghi trỏ vào khoảng không.
- Tên tệp trên đĩa là **id do hệ thống sinh**, không phải tên người dùng đặt — chặn cả `../` lẫn tên trùng nhau. Hai lớp chặn đường dẫn thoát thư mục: kiểm khuôn dạng (`duongDanHopLe`) và kiểm `path.resolve` nằm trong thư mục gốc.
- Nội dung **không** vào CSDL, để `pg_dump` không phải kéo theo ảnh chụp hóa đơn; `scripts/sao-luu.sh` đóng gói riêng thư mục đĩa cùng hạn giữ.

## 7o. Khách hàng nâng cao (0.16.0)

- Phân hệ mới: `src/modules/hanh-trinh` (`moc.ts` danh mục mốc tự chuyển, `tinh-toan.ts` thuần — `coTuChuyen`, `tinhPheu`; `service.ts`), `src/modules/nhom-khach`, `src/modules/cham-diem` (`tinh-toan.ts` thuần — `chamDiem`, `hangDiem`; `service.ts`), `src/modules/ban-giao`. Mở rộng `src/modules/khach-hang`: `danh-muc-loc.ts` (danh mục lọc nhanh / sắp xếp / cột, thuần), `bo-loc.ts` (bộ lọc đã lưu + tùy chọn cột), `hang-loat.ts`, `gop.ts`, `nhap-xuat.ts`, `su-kien-khach.ts`, `tinh-toan.ts`. Luật: `BUSINESS_RULES.md` mục 21 (KHN).
- **Một cửa ghi hành trình**: `ghiDoiHanhTrinh()` ghi cột trên `customers`, dòng lịch sử chỉ-ghi-thêm, Audit Log và Business Event. Đổi tay, đổi hàng loạt, nhập CSV, gộp khách và tự chuyển đều đi qua đây.
- **Móc nối một dòng**: các service cơ hội, báo giá, đơn hàng, tương tác, khách hàng gọi `khiCoSuKienKhach(nc, khachId, moc?)` ngay trong giao dịch của thao tác gốc → tự chuyển bước (nếu là mốc) + tính lại điểm. Thao tác gốc hỏng thì hai việc này cuộn ngược theo (QĐ-48).
- **Danh sách khách dùng một hàm điều kiện** `dieuKienLocKhach()` cho danh sách, đếm theo hành trình (thẻ trạng thái) và xuất CSV — phạm vi `customer.view` luôn được áp ở đây, nên bộ lọc dùng chung không mở thêm khách cho ai (KHN-07).
- **Điểm**: lưu `customers.lead_score` để sắp xếp / lọc phía máy chủ; phần diễn giải tính lại lúc xem từ cùng hàm thuần `chamDiem()`. Gom tín hiệu bằng một truy vấn có tham số cho một hoặc mọi khách. Ghi điểm bằng SQL thô để không đổi `updated_at`.
- **Gộp khách** đọc khóa ngoại trỏ vào `customers.id` từ catalog PostgreSQL lúc chạy (QĐ-51) — bảng mới có khóa ngoại tới khách tự được chuyển; bài thử đếm từng bảng qua `information_schema` trước/sau.
- **Nhập CSV** chạy mỗi dòng trong một SAVEPOINT qua đúng service thường; xem trước là chạy thật rồi `ROLLBACK TO SAVEPOINT` (QĐ-54).
- Giao diện: danh sách khách (thẻ trạng thái, lọc nhanh, bộ lọc đã lưu, cột, đổi hành trình trên dòng, thanh hàng loạt), Customer 360 thẻ "Hành trình & điểm", trang `/crm/hanh-trinh` (kéo thả HTML5 + nút ↑↓ cho điện thoại, phễu), `/crm/nhom-khach`, `/crm/cham-diem`, `/crm/khach-hang/nhap-csv`, `/crm/khach-hang/gop`, khối "Bàn giao khi nghỉ việc" ở trang người dùng.

## 7p. Marketing và thu lead (0.16.0)

- Phân hệ: `src/modules/marketing/` — `hang-so.ts` (danh mục dùng chung trình duyệt), `tinh-toan.ts` (thuần: chỉ số CPL/ROAS, vòng đời chiến dịch, chia vòng tròn, che liên lạc, kiểm dữ liệu form), `luoc-do.ts`, `khoi-landing.ts` (danh mục khối + Zod), và service tách theo việc: `chien-dich.ts`, `nhan-lead.ts`, `form.ts`, `webhook.ts`, `phan-khuc.ts`, `landing.ts`, `cong-khai.ts`. `service.ts` xuất lại tất cả và giữ khối bảng điều hành.
- **Một cửa nhận lead** `nhanLead(tx, tenantId, dữ liệu, tác nhân)` (QĐ-57): form công khai, landing page, webhook và nhập tay đều gọi đúng hàm này. Tác nhân không đăng nhập thì Business Event ghi `actorType = "system"`, Audit Log ghi IP.
- **Đường công khai** (QĐ-61): `/f/<mã DN>/<slug>`, `/lp/<mã DN>/<slug>`, `/api/cong-khai/form|webhook/<mã DN>/…` mở trong `proxy.ts`. `chayNhanCongKhai()` giới hạn tốc độ → tra sổ `tenants` → `voiTenant()`; lần bị từ chối ghi `lead_captures` trong giao dịch riêng. Webhook miễn kiểm Origin vì xác thực bằng khóa, không bằng cookie (QĐ-63); form vẫn kiểm Origin. Chỉ `/f/*` được nhúng iframe (QĐ-62).
- **Chỉ số** dùng chung một hàm `dauVaoChiSo()` + `tinhChiSoChienDich()` cho danh sách, chi tiết và khối Marketing trên bảng điều hành; doanh thu đọc từ hóa đơn đã phát hành (QĐ-29, QĐ-59).
- Chuyển đổi lead (`lead/service.ts`) mang `campaign_id` sang cơ hội và sang khách mới — một chỗ sửa duy nhất ngoài phân hệ.
- `danhSachTheoPhanKhuc(nc, phanKhucId, tuyChon)` là cửa cho gói Email marketing; mặc định chỉ trả người nhận được tin và che liên lạc theo quyền.
- Landing page là Server Component dựng từ khối đã kiểm Zod (`src/components/marketing/KhoiLanding.tsx`), dùng chung cho trang công khai và khung xem trước; form công khai là một client component dùng chung (`FormDangKyCongKhai.tsx`).

## 7q. Email marketing

- Phân hệ: `src/modules/email`. `tinh-toan.ts` (thuần — khối, dựng HTML, lọc người nhận, phân loại lỗi SMTP), `luoc-do.ts`, `ma-lien-ket.ts` (mã ký liên kết công khai), `van-chuyen.ts` (lớp gửi — nodemailer, thay được trong bài thử), `ket-noi.ts` (kết nối SMTP), `nguon-nguoi-nhan.ts` (giao diện nguồn người nhận), `service.ts` (mẫu + chiến dịch), `gui.ts` (gửi theo lô — worker gọi), `cong-khai.ts` (huỷ nhận tin, mở, bấm).
- **Mẫu là dữ liệu, không phải HTML** (QĐ-23 + EM-03). Một hàm `dungThu()` dựng HTML cho xem trước, thư thử và thư thật — cái người soạn thấy là cái khách nhận. Xem trước hiện trong `<iframe sandbox="" srcDoc>`, không chèn vào DOM của trang.
- **Nguồn người nhận là chỗ cắm** (QĐ-71). Chiến dịch chỉ biết `{ ma, quyen, luocDo, moTa(), lay(nc, thamSo) }`; `lay()` trả `{ email, ten, congTy, loai: "lead"|"contact", id, khachHangId, tuChoiLuc }` **đã lọc theo phạm vi** người gọi. Loại trùng / hỏng / từ chối làm chung một chỗ (`locNguoiNhan()`). Nguồn có sẵn: `loc-don-gian` (lead theo nguồn + giai đoạn; liên hệ theo nguồn / phân khúc / ngành của khách). Gói Marketing cắm phân khúc bằng `dangKyNguonNguoiNhan({ ma: "phan-khuc", … })`.
- **Đã cắm nguồn `phan-khuc`** (khi gộp 0.16.0): `nguon-nguoi-nhan.ts` gọi `danhSachTheoPhanKhuc(nc, id, { chiNguoiNhanDuoc: true, boCheDeGui: true })` của gói Marketing — chỉ người đã đồng ý và chưa từ chối, email thật chỉ đi vào máy chủ. Hủy nhận tin (E) tắt luôn `marketing_opt_in` (M), và `nhanLead()` (M) coi email trong danh sách chặn của E là đã từ chối.
- **Gửi tối đa một lần** (QĐ-70): nhận việc (`FOR UPDATE SKIP LOCKED` → SENDING) và COMMIT **trước** khi mở SMTP; gửi ngoài giao dịch; ghi kết quả bằng giao dịch nhỏ. Kẹt SENDING quá 10 phút → FAILED, không gửi lại. Tốc độ đếm trong CSDL (thư đã nhận việc trong 60 giây qua), dưới `pg_advisory_xact_lock` theo doanh nghiệp nên nhiều worker không cùng đếm một lúc. Phân loại lỗi SMTP dựa vào **lệnh** bị từ chối và **mã mở rộng** RFC 3463, không dựa vào `code` của nodemailer (nó gắn `EENVELOPE` cho cả lỗi MAIL FROM).
- **Đường công khai** `/huy-nhan-tin/[mã]` và `/api/cong-khai/...` (QĐ-76): không có phiên; mã ký HMAC (khóa con của `APP_ENC_KEY`) mang doanh nghiệp + người nhận + chỉ số liên kết. `proxy.ts` mở hai tiền tố này và **miễn kiểm Origin** cho `/api/cong-khai/` vì ứng dụng thư gửi `List-Unsubscribe-Post` không kèm Origin. Mỗi đường giới hạn tốc độ theo IP.
- Worker: mỗi nhịp 60 giây, sau bản quét nhắc việc, gọi `guiLoThu(tenantId)` cho từng doanh nghiệp trong `try` riêng.

## 7r. Xác thực 2 lớp

- Phân hệ: `src/modules/xac-thuc-2-lop/service.ts`; phần thuần `src/lib/totp.ts` (HOTP/TOTP, base32, mã khôi phục) có kiểm thử bằng vector chuẩn RFC 4226 / RFC 6238.
- Đăng nhập: `/api/dang-nhap` kiểm mật khẩu như cũ; tài khoản bật 2 lớp thì cấp cookie `cowork_2lop` (JWT có `p: "2lop"`, 5 phút, path `/api/dang-nhap`) thay vì cookie phiên. `giaiMaPhien()` từ chối mọi token có `p`, nên phiên tạm không mở được gì. `/api/dang-nhap/2-lop` kiểm mã rồi mới cấp phiên thật.
- **Thu hồi phiên**: `layHoSoQuyen().doiMatKhauLuc` = mốc muộn hơn của `password_changed_at` và `security_changed_at` — mọi chỗ đang so phiên với lần đổi mật khẩu tự động tính cả đổi thiết lập 2 lớp, không phải sửa từng chỗ.
- **Bắt buộc theo vai trò**: danh sách mã vai trò lưu ở `tenant_settings` khóa `bao_mat.vai_tro_bat_buoc_2_lop` (mảng — màn hình Cấu hình chỉ nhận số, QĐ-73). `layHoSoQuyen()` tính `phaiBat2Lop`; `xuLyApi` chặn (trừ route có `choPhepKhiPhaiBat2Lop`), `yeuCauDangNhap()` đưa sang `/bat-xac-thuc-2-lop`.

## 7s. Khóa chứng từ và lan truyền trạng thái (0.16.1)

Luật: `BUSINESS_RULES.md` mục 25 (TV-BH). Quyết định QĐ-77 → QĐ-81. Bài thử `thu/thu-toan-ven-ban-hang.ts` (mỗi lỗi tranh chấp chạy hai giao dịch `voiTenant` song song).

- **Khóa trước, đọc sau.** Mỗi API nghiệp vụ đã là một giao dịch (`xuLyApi` → `voiTenant`, READ COMMITTED). Hàm đổi trạng thái gọi `khoaChungTu(tx, bang, id)` (`src/lib/khoa-chung-tu.ts`, `SELECT … FOR UPDATE` theo danh sách trắng, nhiều dòng thì theo thứ tự id) **trước** khi đọc chứng từ. Yêu cầu thứ hai chờ đến khi yêu cầu thứ nhất COMMIT rồi mới đọc — thấy trạng thái mới và bị chặn bằng chính kiểm tra trạng thái sẵn có. Không dùng SERIALIZABLE (phải bắt lỗi tuần tự hóa và chạy lại cả request) hay cột phiên bản (phải sửa mọi màn hình) — QĐ-78.
- **Thứ tự khóa** trong một yêu cầu: dòng chứng từ chính → (dòng đơn khi lập phiếu trả; hóa đơn / hóa đơn NCC khi chốt giảm trừ — khớp thứ tự "phiếu → hóa đơn tăng dần" của mục 7t) → dòng số dư kho trong `ghiSoKho()` → bảo hành. Mọi đường đi cùng thứ tự đó nên không khóa chéo.
- **Thứ không thuộc một chứng từ** (sê-ri dùng chung giữa nhiều đơn) đổi trạng thái bằng `updateMany` có điều kiện trạng thái cũ, kiểm `count === 1`; sai thì ném lỗi nghiệp vụ, cả giao dịch cuộn ngược.
- **Số cộng dồn** (`sales_order_items.delivered_qty`) cộng bằng `{ increment }` trên CSDL; CHECK `delivered_qty <= quantity` là lớp chặn cuối.
- **Giữ chỗ suy từ sổ cái** (QĐ-79): không lưu "kho giữ chỗ" trên đơn. `taoPhieuXuat()` đọc phần còn giữ theo (sản phẩm → kho) từ `inventory_transactions` (`ref_type = 'don-hang'`, `ref_id` = đơn); xuất ở kho giao thì nhả tại kho giao trước (`nhaGiuCho` của dòng `xuat`), phần còn lại nhả bằng dòng `nha-giu-cho` ở các kho đã giữ (theo thứ tự id kho). Đơn giao đủ / hủy gọi `nhaHetGiuCho()` — nhả mọi phần còn dương ở mọi kho. Mọi thay đổi vẫn qua `ghiSoKho()`, nên đối soát sổ cái ↔ số dư vẫn khớp.
- **Lan truyền trạng thái trong cùng giao dịch**:
  - báo giá chấp nhận / đơn từ báo giá → `thangCoHoiTheoBaoGia()` (bao-gia/service.ts): cập nhật có điều kiện `stage NOT IN (WON, LOST)`, kiểm toán + sự kiện + mốc hành trình `co-hoi-thang` như `doiGiaiDoan()`, không đòi quyền sửa cơ hội;
  - xác nhận phiếu trả hàng thường → `ketThucBaoHanhKhiTraHang()` (bao-hanh/service.ts): bảo hành `huy` + nhả sê-ri;
  - hủy đơn → đọc `invoices` trong cùng giao dịch, chặn nếu còn hóa đơn chưa hủy; trả về danh sách dự án còn mở để giao diện cảnh báo.
- **Một đơn mỗi báo giá**: service khóa dòng `quotations` rồi kiểm; chỉ mục riêng phần `sales_orders_bao_gia_dang_hoat_dong_key (quotation_id) WHERE status <> 'CANCELLED'` là lớp chặn cuối (lỗi P2002 → câu tiếng Việt).
- **Phiếu hỗ trợ mở lại**: `resolved_at` = mốc xong hiện hành (bộ quét SLA dựa vào nó), `first_resolved_at` = mốc xong lần đầu. Loại diễn biến `mo-lai` thêm vào CHECK `support_ticket_events_loai_check`.
- Bảng cần khóa mà chưa có trong danh sách trắng của `khoaChungTu` thì thêm vào `BANG_KHOA` (một chỗ), không viết `FOR UPDATE` rời rạc trong service.

## 7t. Khóa chứng từ tiền (0.16.1)

- Nền: `src/lib/khoa-chung-tu.ts` — `khoaChungTu(tx, bang, ids)` chạy `SELECT … FOR UPDATE` trên danh sách trắng bảng, khóa nhiều dòng theo id tăng dần (QĐ-77). Không có tầng khóa nào khác (không advisory lock, không SERIALIZABLE).
- **Khóa trước, đọc sau.** Mọi hàm ghi tiền và mọi bước đổi trạng thái chứng từ mua gọi `khoaChungTu` *trước* khi đọc trạng thái hay số đã thu. Ở READ COMMITTED, câu lệnh đọc sau khi chờ khóa thấy dữ liệu mới nhất — nên kiểm "còn nợ bao nhiêu" luôn đúng mà công nợ vẫn **tính lúc đọc** (TC-06), không cần cột số dư (QĐ-82).
- **Thứ tự khóa** (để không khóa chéo): đề nghị mua → đơn mua; đơn hàng → hóa đơn; phiếu thu / phiếu chi → hóa đơn. Phiếu thu mới chỉ khóa hóa đơn (phiếu chưa tồn tại). Hủy hóa đơn chỉ khóa hóa đơn.
  | Hàm | Khóa |
  |---|---|
  | `taoHoaDon` (từ đơn) / `taoHoaDonMua` (từ đơn mua) | `sales_orders` / `purchase_orders` |
  | `phatHanhHoaDon`, `huyHoaDon` / `ghiNhanHoaDonMua`, `huyHoaDonMua` | `invoices` / `supplier_bills` |
  | `thuTien` / `chiTien` | mọi `invoices` / `supplier_bills` trong phân bổ |
  | `huyPhieuThu` / `huyPhieuChi` | `payments` rồi `invoices` / `supplier_payments` rồi `supplier_bills` |
  | xin duyệt, duyệt, sửa, hủy đề nghị; `taoDonMua` từ đề nghị | `purchase_requests` |
  | sửa, gửi, xác nhận đơn mua; `nhanHang` | `purchase_orders` |
  | `huyDonMua` | `purchase_requests` (nếu có) rồi `purchase_orders` |
- **Chốt cuối ở CSDL** cho luật "một đơn — một hóa đơn còn hiệu lực": hai chỉ mục duy nhất riêng phần (migration `20261014085000_toan_ven_tai_chinh`). Prisma không khai được chỉ mục riêng phần nên chỉ ghi chú ở `schema.prisma` (cùng cách `job_runs_lich_moi_ngay`).
- Bài thử `thu:toan-ven-tai-chinh` chạy **hai giao dịch `voiTenant` thật** (hai kết nối) bằng `Promise.allSettled`; gỡ khóa ra thì các bài đồng thời hỏng (đã kiểm khi viết).
- **Còn ngoài phạm vi gói này**: chốt giảm trừ trả hàng (`tra-hang`) cũng đọc phần còn nợ của hóa đơn — phân hệ đó phải khóa `invoices` / `supplier_bills` bằng đúng hàm này thì mới khép kín với thu / chi.

## 7u. Vận hành bền vững (0.16.1)

Quyết định QĐ-86 → QĐ-90. Migration `20261014090001_van_hanh_ben_vung`. Bài thử `npm run thu:van-hanh`, `thu/don-vi/van-hanh.test.ts`.

- **Bản quét nhắc việc bền vững** (`src/modules/nhac-viec/service.ts`): `chayQuet(tx, …)` giữ nguyên là phần chạy trong một giao dịch; ghi việc bằng **một** `createManyAndReturn({ skipDuplicates })` mỗi quy tắc, dựa vào khóa duy nhất (người + ngày + quy tắc + đối tượng) thay vì đọc rồi ghi từng dòng. `quetBenVung(tenantId, …)` mở giao dịch hạn `HAN_GIAO_DICH_THEO_LO_MS`; hỏng thì ghi dòng `job_runs` trạng thái `hong` bằng **giao dịch riêng** (giao dịch quét đã cuộn ngược), đếm hỏng liên tiếp, từ 2 lần thì `baoChoNguoiCoQuyen(…, "setting.update")` (chống trùng theo ngày), rồi ném `LoiQuetHong` (503). `quetTheoLich()` (worker) kiểm giờ, đã xong chưa, và giãn cách 15 → 30 → 60 → 120 phút, tối đa 5 lần hỏng/ngày (`src/modules/van-hanh/tinh-toan.ts`). Chỉ mục `job_runs_lich_moi_ngay` nay chỉ phủ dòng `status <> 'hong'`.
- **Nhịp sống** (`src/modules/van-hanh/nhip.ts`, bảng `system_heartbeats`, toàn hệ thống, không `tenant_id`): worker ghi dòng `worker` mỗi phút (`worker/nhip.ts` — PostgreSQL và Redis mỗi nơi một `try`, Redis có hạn 2 giây); `scripts/sao-luu.sh` ghi `sao-luu`, `scripts/thu-phuc-hoi.sh` ghi `thu-phuc-hoi` bằng vai chủ sở hữu. RLS: `cowork_app` đọc mọi dòng, chỉ INSERT/UPDATE dòng `worker%`. Healthcheck Docker: `worker/kiem-tra-song.ts`. `/api/khoe` công khai chỉ thêm `worker: ok|tre`; chi tiết ở `GET /api/v1/tu-dong-hoa/van-hanh` (`setting.view`) và băng đỏ trên *Quản trị → Tự động hóa* (`cacCanhBaoVanHanh`).
- **Gọi mạng ngoài giao dịch** (`src/lib/api-nhieu-buoc.ts`): `xuLyApiNhieuBuoc` đưa cho service một `BuocGiaoDich` — mỗi `nb.giaoDich(nc => …)` là một giao dịch ngắn, kiểm lại phiên + quyền (dùng chung `kiemHoSoTrongGiaoDich` với `xuLyApi`). Dùng cho `POST /api/v1/tro-ly/hoi` (ghi câu hỏi → gọi mô hình có hạn `AI_HAN_GOI_GIAY` → mỗi công cụ một giao dịch → ghi câu trả lời), `POST /api/v1/email/ket-noi/gui-thu` (đọc cấu hình → gửi SMTP → ghi kết quả) và `POST /api/v1/tu-dong-hoa/chay`. Service nhận `NguCanh | BuocGiaoDich`; `thanhBuoc(nc)` giữ đường cũ cho bài thử. Các bước không cuộn ngược cùng nhau — service sắp thứ tự ghi để hỏng giữa chừng vẫn có nghĩa.
- **Sao lưu**: `scripts/sao-luu.sh` sinh dump + gói đính kèm (`THU_MUC_DINH_KEM`) + `.env` mã hóa gpg cùng mốc, đọc lại từng phần, chép ra `RCLONE_REMOTE` và kiểm kích thước, ghi trạng thái, hỏng thì báo động (`ALERT_WEBHOOK_URL` / `ALERT_EMAIL`, `scripts/van-hanh-chung.sh`). `trien-khai.sh` cài cron 02:15. Chi tiết: DEPLOYMENT.md.
- **Giới hạn tốc độ**: Redis hỏng → `demVaKiem` đếm bằng bộ nhớ tiến trình; nginx trong Docker có `limit_req` cho `/api/dang-nhap*`, `/api/cong-khai/` và lấy IP thật bằng module realip (chỉ tin dải nội bộ), ghi đè `X-Real-IP`/`X-Forwarded-For` gửi vào app.

## 8. Tác vụ nền

`worker/index.ts` dùng chung ảnh Docker với app. Phase 1 mới đấu dây (nhịp 60 giây kiểm CSDL + Redis). Phase 8 thêm: bộ lập lịch, quy tắc nhắc việc (đọc ngưỡng từ Cấu hình), sinh thông báo. 0.16.1: nhịp sống vào PostgreSQL, quét hỏng thì ghi riêng và thử lại có giãn cách (mục 7u).

## 9. Việc chưa làm có chủ đích

| Việc | Vì sao chưa | Làm ở |
|---|---|---|
| Chuông thông báo | Chưa có sự kiện nào cần báo cho người dùng; chuông không có gì bên trong là nút chết | Phase 8 |
| Tùy chọn cột trên bảng | ~~Chưa có yêu cầu thật~~ — **đã làm 0.16.0** cho danh sách khách hàng (mục 7o) | — |
| Xuất CSV khách hàng | ~~Chưa có màn hình~~ — **đã làm 0.16.0** (mục 7o) | — |
| Hợp đồng bảo trì định kỳ và gia hạn tự động | Cần bộ nhắc việc chạy nền mới có ích; dữ liệu bảo hành đã đủ để sinh nhắc khi có | Phase 8 |
| Trả hàng, đổi máy | Đi kèm công nợ và hóa đơn; làm một nửa sẽ lệch kho và lệch tiền | Phase 7 |
| Tệp đính kèm (ảnh hiện trường, biên bản) | Chưa chọn nơi lưu tệp trên máy chủ thật; cần bàn với Giám đốc về dung lượng và sao lưu | khi có yêu cầu |
| Mua hàng (đề nghị mua, đơn mua, nhận hàng) | Nhập kho hiện ghi thẳng kèm nguồn hàng; làm mua hàng tử tế cần luồng duyệt riêng và đối chiếu công nợ nhà cung cấp | Phase 5b / 7 |
| Chuyển kho nội bộ | Chưa có nhu cầu thật; hiện làm được bằng hai lần điều chỉnh có lý do | khi có yêu cầu |
| Trả hàng, bảo hành theo sê-ri | Sê-ri đã ghi đủ vết để làm sau; nghiệp vụ trả hàng đi kèm công nợ | Phase 6 |
| Gửi email báo giá tự động | Chưa có dịch vụ gửi thư và mẫu thư được duyệt; hiện ghi nhận "đã gửi bằng kênh nào" để không mất dấu vết | Phase 8 |
| Đọc thẳng tệp .xlsx | Excel lưu được CSV UTF-8; thêm thư viện đọc xlsx là thêm phụ thuộc nặng cho một việc người dùng làm được bằng hai cú bấm | khi có yêu cầu thật |
| Song ngữ Việt–Anh | Chữ giao diện hiện viết thẳng; chuẩn bị bằng cách gom nhãn menu vào một tệp. Tách từ điển khi có yêu cầu thật | khi cần |
| Lưu tệp (đối tượng) | Chưa phân hệ nào cần đính kèm | Phase 6 (ảnh nghiệm thu) |
