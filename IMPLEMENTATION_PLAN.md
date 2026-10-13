# Kế hoạch triển khai — TGTH Business Cowork

> Tệp này là **điểm vào** cho mọi phiên làm việc sau. Đọc tệp này trước, rồi `CHANGELOG.md`, rồi tài liệu chuyên đề.
> Cập nhật lần cuối: 22/09/2026 (sau Tệp đính kèm).

Căn cứ: master prompt "TGTH Business Cowork Platform" (19/09/2026) và prompt triển khai 36 mục (20/09/2026) của Giám đốc. Hai văn bản nói cùng một lộ trình; khi khác chi tiết, bản 20/09 thắng.

## 1. Trạng thái tổng

| Phase | Nội dung | Ưu tiên | Trạng thái |
|---|---|---|---|
| 0 | Audit | — | **Xong** 19/09, rà lại 20/09 (mục 2) |
| 1 | Nền móng: đăng nhập, người dùng, phòng ban, RBAC + phạm vi, nhật ký kiểm toán | P0 | **Xong** 19/09 — đang chạy thật (bản 0.2.1) |
| 2 | CRM: khách hàng + chống trùng, liên hệ, lead, tương tác, cơ hội + pipeline, công việc, Customer 360 | P0 | **Xong trên máy phát triển** 20/09 (bản 0.3.0) — chưa triển khai máy thật, xem mục 4 |
| 3 | Sản phẩm, nhóm, thương hiệu, nhà cung cấp, giá nhiều nguồn, lịch sử giá, nhập/xuất CSV | P0 | **Xong trên máy phát triển** 20/09 (bản 0.4.0) — chưa triển khai |
| 4 | Báo giá: phiên bản, biên lợi nhuận, duyệt theo ngưỡng, bản in PDF, hồ sơ công ty | P0 | **Xong trên máy phát triển** 20/09 (bản 0.5.0) — chưa triển khai. Chuyển đơn để Phase 5 |
| 5 | Đơn hàng, kho, serial, mua hàng | P1 | **Xong trên máy phát triển**: đơn hàng và kho 20/09 (0.6.0), mua hàng 21/09 (0.11.0) — chưa triển khai |
| 6 | Dự án, phiếu hỗ trợ, bảo hành, bảo trì, gia hạn | P2 | **Xong trên máy phát triển** 20/09 (bản 0.7.0) — chưa triển khai. Bảo trì định kỳ và gia hạn để Phase 8 |
| 7 | Tài chính quản trị (hóa đơn, công nợ hai chiều, thu chi) + Bảng điều hành CEO | P1/P2 | **Xong trên máy phát triển**: phải thu 20/09 (0.8.0), phải trả 21/09 (0.12.0) — chưa triển khai |
| 8 | Tự động hóa, "Việc hôm nay", nhắc việc, chuông thông báo, bảo trì định kỳ / gia hạn | P2 | **Xong trên máy phát triển** 21/09 (bản 0.9.0) — chưa triển khai |
| 9 | AI | P3 | **Xong trên máy phát triển** 21/09 (bản 0.10.0) — chưa triển khai, và **chưa có khóa API** (`VD-109`) |

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
- [x] Migration + schema — `20260919171944_phase2_crm`, diễn tập nâng cấp từ Phase 1 có dữ liệu: đạt
- [x] Service + API — 5 phân hệ, 18 route
- [x] Giao diện — 12 màn hình + nút "+ Tạo mới" + tìm kiếm
- [x] Kiểm thử + build — 52 đơn vị, 156 tích hợp, 87 HTTP, lint, build: đạt
- [~] Kiểm tra trên trình duyệt — soát bố cục bằng HTML dựng thật ở 1440 px và 375 px; **chưa có người bấm thử sau đăng nhập** (trợ lý không gõ mật khẩu)
- [ ] Triển khai máy thật (cần Giám đốc cho phép thời điểm — Q6)

### Việc kế tiếp của Phase 2 (nhỏ, làm khi triển khai hoặc đầu Phase 3)
- Giám đốc / nhân viên đăng nhập bấm thử: kéo thả Kanban, chuyển đổi lead, hộp thoại thua/mở lại.
- Tách `Promise.all` trong giao dịch thành tuần tự (cảnh báo `pg`).
- Bảng điều hành: thêm ô "Việc của tôi hôm nay" và "Cơ hội quá hạn hành động" (dữ liệu đã có; phần chỉ số CEO đầy đủ để Phase 7).

## 4b. Phase 3 — Sản phẩm và bảng giá (xong trên máy phát triển)

- [x] CSDL 7 bảng + CHECK + trigger lịch sử giá · [x] service + 13 route · [x] 8 màn hình · [x] kiểm thử (73 đơn vị, 212 tích hợp, 112 HTTP) · [x] soát giao diện
- [ ] Triển khai máy thật (cùng đợt với 0.3.0 — `VD-101`)
- **Cần Giám đốc/nhân viên làm tiếp**: nhập bảng giá thật của 1–2 nhà cung cấp bằng màn hình Nhập CSV, và khai 12 nhóm sản phẩm cho khớp cách gọi nội bộ (đã tạo sẵn theo mục 9 prompt).

## 4c. Phase 4 — Báo giá (xong trên máy phát triển)

- [x] CSDL 4 bảng + CHECK · [x] service + 9 route · [x] 6 màn hình (danh sách, lập, sửa, chi tiết, bản in, hồ sơ công ty) · [x] kiểm thử (91 đơn vị, 246 tích hợp, 139 HTTP) · [x] soát giao diện
- [ ] Triển khai máy thật (cùng đợt với 0.3.0 và 0.4.0 — `VD-101`)
- **Cần Giám đốc**: đặt ngưỡng biên lợi nhuận ở Quản trị → Cấu hình (Q2); khai **Hồ sơ công ty** (địa chỉ, mã số thuế, tài khoản ngân hàng, người ký) để bản in đủ phần đầu; khai điều khoản thanh toán / giao hàng ở Quản trị → Dữ liệu gốc; gửi mẫu báo giá TGTH đang dùng (logo, câu chữ) để đối chiếu.

## 4d. Phase 5 — Đơn hàng và kho (xong trên máy phát triển)

- [x] CSDL 8 bảng + 2 cột trên `products` + CHECK + trigger sổ cái · [x] service + 15 route · [x] 9 màn hình · [x] kiểm thử (113 đơn vị, 299 tích hợp, 169 HTTP) · [x] diễn tập cài mới trên CSDL trống · [x] soát giao diện
- [ ] Triển khai máy thật (cùng đợt với 0.3.0 → 0.5.0 — `VD-101`)
- **Cần Giám đốc**: khai kho thật và nhập tồn đầu kỳ (`VD-105`); trả lời Q8 (nhân viên kinh doanh có được tự tạo đơn không).
- **Chưa làm có chủ đích**: mua hàng (đề nghị mua → đơn mua → nhận hàng), chuyển kho nội bộ, trả hàng.

## 4e. Phase 6 — Dự án, bảo hành, bàn dịch vụ (xong trên máy phát triển)

- [x] CSDL 5 bảng + cột `project_id` trên `tasks` + CHECK + trigger diễn biến · [x] service + 14 route · [x] 8 màn hình · [x] kiểm thử (138 đơn vị, 350 tích hợp, 200 HTTP) · [x] soát giao diện
- [ ] Triển khai máy thật (cùng đợt với 0.3.0 → 0.6.0 — `VD-101`)
- **Cần Giám đốc**: đặt 4 ngưỡng cam kết dịch vụ và ngưỡng cảnh báo bảo hành ở Quản trị → Cấu hình (`VD-106`); trả lời Q9 (kỹ thuật có được thấy khách của phòng kinh doanh không).
- **Chưa làm có chủ đích**: hợp đồng bảo trì định kỳ, gia hạn tự động, trả hàng/đổi máy, tệp đính kèm.

## 4f. Phase 7 — Tài chính quản trị và bảng điều hành (xong trên máy phát triển)

- [x] CSDL 4 bảng + CHECK · [x] service + 9 route · [x] 6 màn hình (hóa đơn: danh sách / chi tiết / lập mới, công nợ, phiếu thu, bảng điều hành dựng lại) · [x] kiểm thử (151 đơn vị, 390 tích hợp, 228 HTTP) · [x] diễn tập cài mới trên CSDL trống · [x] soát giao diện
- [ ] Triển khai máy thật (cùng đợt với 0.3.0 → 0.8.0 — `VD-101`)
- **Cần Giám đốc**: đặt **số ngày công nợ mặc định** và **ngưỡng cảnh báo quá hạn** ở Quản trị → Cấu hình (`VD-107`). Chưa đặt thì phát hành hóa đơn phải nhập tay hạn thanh toán từng lần, và màn hình công nợ không tô đỏ khoản nào.
- **Chưa làm có chủ đích**: phiếu chi và công nợ phải trả nhà cung cấp, hóa đơn điện tử theo chuẩn cơ quan thuế, đối soát ngân hàng, ngoại tệ, bản in hóa đơn A4 (báo giá đã có, hóa đơn dùng lại được khi cần).

## 4g. Phase 8 — Tự động hóa, Việc hôm nay, bảo trì và gia hạn (xong trên máy phát triển)

- [x] CSDL 6 bảng + CHECK + chỉ mục riêng phần · [x] service + 16 route · [x] 6 màn hình (Việc hôm nay, chuông thông báo, Tự động hóa, Hợp đồng bảo trì: danh sách / chi tiết / lập mới, Lịch gia hạn) · [x] worker chạy thật · [x] kiểm thử (184 đơn vị, 457 tích hợp, 268 HTTP) · [x] diễn tập cài mới · [x] soát giao diện
- [ ] Triển khai máy thật (cùng đợt với 0.3.0 → 0.9.0 — `VD-101`)
- **Cần Giám đốc**: đặt **giờ quét hằng ngày** (`tu_dong.gio_quet_hang_ngay`) — chưa đặt thì máy **không tự quét**, chỉ chạy được bằng nút Chạy quét ngay (`VD-108`). Các ngưỡng nhắc việc khác nằm trong `VD-104`, `VD-106`, `VD-107`.
- **Chưa làm có chủ đích**: gửi nhắc ra ngoài (email, Zalo), nhắc theo giờ trong ngày, quy tắc do người dùng tự định nghĩa.

## 4h. Phase 9 — Trợ lý AI (xong trên máy phát triển)

- [x] CSDL 4 bảng + CHECK + 2 trigger chỉ-ghi-thêm · [x] lớp nhà cung cấp + sổ 13 công cụ + vòng lặp + luồng đề xuất · [x] 6 route · [x] màn hình Trợ lý · [x] kiểm thử (220 đơn vị, 514 tích hợp, 278 HTTP) · [x] diễn tập cài mới · [x] soát giao diện
- [ ] **Cần khóa API** `ANTHROPIC_API_KEY` trên máy chủ (`VD-109`). Chưa có thì màn hình Trợ lý nói rõ là chưa dùng được — hệ thống cố ý không trả lời thay vì bịa.
- [ ] Triển khai máy thật (cùng đợt với 0.3.0 → 0.10.0 — `VD-101`)
- **Chưa làm có chủ đích**: tác nhân nền tự chạy bằng AI (bộ quy tắc Phase 8 đang làm việc đó bằng luật tường minh, dễ kiểm hơn), trợ lý gửi tin cho khách, CEO Briefing định kỳ, truy xuất tài liệu (RAG).

## 4i. Mua hàng (xong trên máy phát triển)

- [x] CSDL 6 bảng + 18 CHECK · [x] service + 12 route · [x] 6 màn hình · [x] kiểm thử (241 đơn vị, 582 tích hợp, 314 HTTP) · [x] diễn tập cài mới · [x] soát giao diện
- [ ] Triển khai máy thật (cùng đợt với 0.3.0 → 0.11.0 — `VD-101`)
- **Chưa làm có chủ đích**: hóa đơn nhà cung cấp và công nợ phải trả, trả hàng cho nhà cung cấp, cập nhật giá vốn danh mục theo giá mua thực tế, chuyển kho nội bộ.

## 4j. Công nợ phải trả (xong trên máy phát triển)

- [x] CSDL 4 bảng + CHECK · [x] service + 8 route · [x] 4 màn hình · [x] kiểm thử (241 đơn vị, 629 tích hợp, 342 HTTP) · [x] diễn tập cài mới · [x] soát giao diện
- [ ] Triển khai máy thật (cùng đợt với 0.3.0 → 0.12.0 — `VD-101`)
- **Không cần Giám đốc đặt thêm ngưỡng nào**: hạn thanh toán đọc từ hóa đơn nhà cung cấp (QĐ-38).
- **Chưa làm có chủ đích**: trả hàng cho nhà cung cấp và giảm trừ công nợ, bù trừ công nợ hai chiều, dự báo dòng tiền.

## 4k. Trả hàng và đổi máy (xong trên máy phát triển)

- [x] CSDL 6 bảng + 24 CHECK + 1 cột trên `serial_numbers` · [x] service + 12 route · [x] 6 màn hình · [x] kiểm thử (264 đơn vị, 702 tích hợp, 382 HTTP) · [x] diễn tập cài mới 13 migration · [x] soát giao diện
- [x] **Triển khai máy thật 21/09/2026** (đợt 0.3.0 → 0.13.0, 13 migration — `VD-101` đã đóng)
- **Không cần Giám đốc đặt thêm ngưỡng nào.** Một chính sách đã chốt thay Giám đốc và cần xác nhận lại: đổi máy giữ nguyên mốc hết hạn bảo hành (QĐ-40) — câu hỏi Q13.
- **Chưa làm có chủ đích**: hoàn tiền mặt cho khách, đòi lại tiền từ nhà cung cấp, chênh lệch giá khi đổi sang máy khác model.

## 4l. Chuyển kho nội bộ (xong trên máy phát triển)

- [x] CSDL 2 bảng + 9 CHECK + cột sê-ri · [x] service + 5 route · [x] 3 màn hình · [x] kiểm thử (285 đơn vị, 742 tích hợp, 408 HTTP) · [x] diễn tập cài mới 14 migration · [x] soát giao diện
- [ ] Triển khai máy thật (bản 0.14.0 — đợt trước đã lên 21/09)
- **Chỉ dùng được khi có từ hai kho trở lên.** Màn hình lập phiếu nói thẳng điều đó nếu mới khai một kho — liên quan `VD-105`.
- **Chưa làm có chủ đích**: phiếu in ra giấy cho lái xe, và tự ghi hao hụt phần thiếu vào tài khoản chi phí.

## 4m. Tệp đính kèm (xong trên máy phát triển)

- [x] CSDL 1 bảng + 6 CHECK · [x] service + 4 route · [x] 1 component dùng chung, gắn vào 5 loại trang · [x] kiểm thử (309 đơn vị, 772 tích hợp, 434 HTTP) · [x] diễn tập cài mới 15 migration · [x] soát giao diện
- [ ] Triển khai máy thật (bản 0.15.0 — đợt trước đã lên 21/09, gồm 0.3.0 → 0.13.0)
- **Không cần Giám đốc đặt ngưỡng nào.** Trần 20 MB/tệp và 20 tệp/chứng từ là trần kỹ thuật, không phải chính sách.
- Nhân tiện thêm màn hình *Quản trị → Cấu hình* hiện **phiên bản và mã bản dựng đang chạy** (bản 0.14.1), để lần triển khai sau không phải đoán máy thật đang chạy gì.
- **Chưa làm có chủ đích**: xem trước ảnh/PDF ngay trong trang (hiện chỉ tải về), giới hạn dung lượng theo gói dịch vụ.

## 4n. Tích hợp CRM — 0.16.0 (xong trên máy phát triển, 13/10/2026)

- [x] Khách hàng nâng cao (hành trình, nhóm, bộ lọc đã lưu, chấm điểm, gộp khách, CSV, bàn giao) · [x] Marketing & thu lead (chiến dịch, CPL/ROAS, form `/f`, landing `/lp`, webhook, phân khúc) · [x] Email marketing (SMTP, mẫu khối an toàn, đợt gửi có duyệt, hủy nhận tin, theo dõi) · [x] Xác thực 2 lớp TOTP · [x] Bản in báo giá có logo
- [x] Gộp ba gói + tương tác chéo (bàn giao gồm việc Marketing, gộp khách mang chiến dịch, đợt gửi email theo phân khúc, hủy nhận tin tắt cờ đồng ý) · [x] kiểm thử (448 đơn vị, 1.562 tích hợp, 434 + 107 + 75 HTTP) · [x] diễn tập cài mới 18 migration
- [ ] Triển khai máy thật — cần `APP_ENC_KEY` (không đổi sau khi dùng), nginx máy chủ ghi đè `X-Real-IP`, mở cổng SMTP ra ngoài.
- Ngưỡng mới chờ Giám đốc: ngưỡng điểm Nóng/Ấm, hạn gọi lại lead mới, tốc độ gửi email (đang mặc định chậm).

## 5. Sau Phase 9 — việc còn lại

Lộ trình 0→9 của prompt đã đi hết. Việc còn lại không thuộc phase nào, xếp theo thứ tự nên làm:

1. ~~Triển khai 0.3.0 → 0.13.0 lên máy thật~~ **đã xong 21/09/2026** (`VD-101` đóng). Máy thật đang chạy 0.13.0; bản 0.14.0 (chuyển kho) và 0.15.0 (tệp đính kèm) còn trên máy phát triển, chưa triển khai đợt tiếp theo.
2. **Khai dữ liệu nền và các ngưỡng** (`VD-104` → `VD-109`) — nay **chặn thật**, không còn là việc chờ song song: màn hình đã có trên máy thật mà ngưỡng chưa đặt, nên một số tính năng báo "chưa đặt ngưỡng" thay vì chạy.
3. **Phần cố ý để lại** — ~~mua hàng~~ (0.11.0), ~~công nợ phải trả~~ (0.12.0), ~~trả hàng / đổi máy~~ (0.13.0), ~~chuyển kho nội bộ~~ (0.14.0), ~~tệp đính kèm~~ (0.15.0) và tích hợp CRM / marketing / email (0.16.0) **đã làm**. Còn: gửi nhắc tự động ra ngoài qua email hoặc Zalo, hoàn tiền mặt cho khách, bù trừ công nợ hai chiều, dự báo dòng tiền, nơi cất sao lưu ngoài máy chủ.

## 6. Câu hỏi chờ Giám đốc

| # | Câu hỏi | Mặc định đang chạy | Chặn |
|---|---|---|---|
| Q1 | Cowork là dòng thiết kế chính (VD-088)? | Coi là **có** — prompt 20/09 tiếp tục chỉ định `thegioitinhoc.io.vn` | Không chặn |
| Q2 | Ngưỡng biên lợi nhuận + cấp duyệt (VD-095) | Chưa đặt → **mọi báo giá phải qua duyệt**; ai có `quotation.approve` (Trưởng phòng KD, Giám đốc) thì duyệt được, người lập không tự duyệt | Không chặn, nhưng làm chậm mọi báo giá cho tới khi đặt ngưỡng |
| Q3 | Danh sách nhân sự thật (VD-091) | Chỉ có tài khoản quản trị | Đưa người dùng thật vào |
| Q4 | Nhân viên KD thấy khách của mình hay toàn bộ (VD-096) | `own` cho NV, `team` cho TP — đổi trên màn hình Vai trò | Không chặn |
| Q5 | Nơi cất sao lưu ngoài máy chủ (VD-068) | Sao lưu cùng máy, giữ 14 ngày | **Nên có trước khi nhập dữ liệu khách thật** |
| Q6 | Thời điểm cho phép triển khai Phase 2–4 lên máy thật | Chưa triển khai; chạy trên máy phát triển | Triển khai |
| Q7 | Mẫu báo giá TGTH đang dùng (logo, câu chữ, điều khoản chuẩn) | Bản in dùng mẫu chuẩn của hệ thống, chưa có logo | Không chặn |
| Q9 | Trưởng phòng Kỹ thuật / Quản lý dự án có được thấy khách hàng của phòng kinh doanh không? | Theo mục 19 đặc tả: phạm vi **phòng ban**, nên không thấy — Giám đốc hoặc kinh doanh mở dự án rồi giao lại cho kỹ thuật | Không chặn; đổi bằng màn hình Vai trò |
| Q8 | Nhân viên Kinh doanh có được tự tạo và xác nhận đơn hàng không? | Theo mục 19 đặc tả: **không** — chỉ xem; Trưởng phòng KD tạo, xác nhận, hủy. Đổi được ngay trên màn hình Vai trò | Không chặn kỹ thuật, nhưng đổi nhịp làm việc của phòng kinh doanh |
| Q10 | Doanh thu trên bảng điều hành tính theo **hóa đơn đã phát hành** — có đúng cách Giám đốc vẫn nhìn con số không? | Đang lấy mốc hóa đơn phát hành (QĐ-29). Nếu Giám đốc quen nhìn theo đơn đã xác nhận hoặc theo tiền thực thu thì đổi được, nhưng phải chọn **một** mốc duy nhất | Không chặn; đổi mốc thì mọi con số lịch sử đổi theo |
| Q11 | Bản quét nhắc việc nên chạy lúc mấy giờ sáng? | Chưa đặt → máy **không tự quét**, chỉ chạy được bằng tay ở màn hình Tự động hóa. Gợi ý 7 giờ, trước giờ làm | Chặn việc nhắc tự động chạy hằng ngày (`VD-108`) |
| Q12 | Có cấp khóa API mô hình AI cho máy chủ không, và ngân sách mỗi tháng bao nhiêu? | Chưa có khóa → màn hình Trợ lý nói rõ là chưa dùng được; không có chế độ trả lời tạm | Chặn toàn bộ Phase 9 chạy thật (`VD-109`) |
| Q13 | Đổi máy trong bảo hành thì bảo hành của máy mới tính thế nào? | Hệ thống đang **giữ nguyên mốc hết hạn** của lần mua, không tính lại từ ngày đổi (QĐ-40) — chọn cách không tự ý cam kết thêm với khách. Nếu chính sách của công ty là tính lại 12 tháng từ ngày đổi thì phải nói rõ, vì đó là nghĩa vụ mới | Không chặn; đang chạy theo cách hẹp hơn, đổi được bất cứ lúc nào |

## 7. Known issues

Xem mục "Vấn đề đã biết" của bản mới nhất trong `CHANGELOG.md`.

## 8. Môi trường phát triển trên máy trạm (không có Docker)

- CSDL: cụm PostgreSQL nhúng tại `.pgdata/` (gitignore), cổng 5434, UTF8. Bản nhị phân mượn từ `L:\CODE\tmdt\node_modules\@embedded-postgres\windows-x64\native\bin`.
  - Khởi động: `"<bin>/pg_ctl.exe" -D .pgdata -o "-p 5434" -l .pgdata/log.txt start -w`
  - Không có `psql` — chạy SQL bằng thư viện `pg` của dự án (ví dụ áp `prisma/rls.sql`).
- Vai: `cowork_owner` (chủ sở hữu, chạy migration/seed) và `cowork_app` (ứng dụng, bị RLS). Mật khẩu cục bộ trong `.env` (không commit).
- Chạy thử bản dựng: cấu hình `cowork-itw` trong `.claude/launch.json` của vault (cổng 3300).
- Tài khoản mẫu tenant `demo`: xem `prisma/seed/mau.ts`; CRM mẫu thuộc `kd1@demo.test`, `kd2@demo.test`, trưởng phòng `tp.kinhdoanh@demo.test` thấy cả hai. Mật khẩu chung đặt bằng `DEMO_MAT_KHAU`; seed **không ghi đè** mật khẩu của tài khoản đã có, muốn đặt lại thì sửa thẳng trong CSDL.
- Chạy `npm run thu:http` cần `THU_EMAIL` + `THU_MAT_KHAU` của quản trị tenant `itw`. Bài thử **đổi mật khẩu quản trị cục bộ** ở lần chạy đầu (thêm hậu tố `-Moi1`) rồi in ra khi đặt `THU_GHI_MAT_KHAU_MOI=1` — lần sau phải truyền mật khẩu mới, `.env` không tự cập nhật.
- Có **một phiên Claude khác** đang khảo sát tích hợp trên cùng kho (tạo `docs/integration/`). Khi commit, chỉ `git add` tệp của mình.
