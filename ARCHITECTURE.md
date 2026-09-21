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
- Bản in là trang riêng ngoài khung ứng dụng (`src/app/(in)/bao-gia/[id]/in`), in bằng trình duyệt (QĐ-21); phần đầu lấy từ Hồ sơ công ty (QĐ-22).

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

## 8. Tác vụ nền

`worker/index.ts` dùng chung ảnh Docker với app. Phase 1 mới đấu dây (nhịp 60 giây kiểm CSDL + Redis). Phase 8 thêm: bộ lập lịch, quy tắc nhắc việc (đọc ngưỡng từ Cấu hình), sinh thông báo.

## 9. Việc chưa làm có chủ đích

| Việc | Vì sao chưa | Làm ở |
|---|---|---|
| Chuông thông báo | Chưa có sự kiện nào cần báo cho người dùng; chuông không có gì bên trong là nút chết | Phase 8 |
| Tùy chọn cột trên bảng | Bảng CRM 5–7 cột vẫn đọc tốt; chưa có yêu cầu thật để ẩn/hiện cột | khi có yêu cầu |
| Xuất CSV khách hàng | Quyền `customer.export` đã có nhưng chưa có màn hình; bộ xuất CSV dùng chung đã sẵn ở `src/lib/csv.ts` | khi cần |
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
