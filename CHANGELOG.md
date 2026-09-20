# Nhật ký thay đổi

Theo phiên bản ứng dụng. Ngày theo giờ Việt Nam.

## 0.10.0 — 21/09/2026 — Phase 9: Trợ lý AI

Căn cứ: prompt triển khai 36 mục, mục 25–30. Thiết kế: `AI_ARCHITECTURE.md`. Luật nghiệp vụ: `BUSINESS_RULES.md` mục 15 (AI).
**Chưa triển khai lên máy thật** — cùng đợt với 0.3.0 → 0.9.0, chờ Giám đốc cho phép. **Chưa có khóa API**: trợ lý báo rõ là chưa dùng được cho tới khi Giám đốc cấp khóa (`VD-109`).

### Thêm
- **Trợ lý ITA**: khung chat hỏi đáp bằng tiếng Việt về khách hàng, cơ hội, báo giá, tồn kho, công nợ, bảng điều hành.
- **13 công cụ đọc**, mỗi công cụ là lớp bọc mỏng trên service sẵn có — không công cụ nào tự truy vấn CSDL, nên phạm vi dữ liệu và luật nghiệp vụ của tám phase trước tự động áp cho trợ lý.
- **Luồng đề xuất**: trợ lý chỉ đặt được một *lời đề nghị* (tạo báo giá nháp, tạo việc). Người dùng bấm Đồng ý thì service mới chạy, và chạy bằng **quyền của người bấm**.
- **Lớp nhà cung cấp** tách rời: đổi mô hình là đổi biến môi trường (`AI_PROVIDER`, `AI_MODEL`, `ANTHROPIC_API_KEY`). Khóa API không bao giờ nằm trong CSDL hay nhật ký.
- 4 bảng CSDL (`ai_conversations`, `ai_messages`, `ai_tool_calls`, `ai_actions`), 6 route API, 1 màn hình. Lịch sử hỏi đáp và lần gọi công cụ **chỉ ghi thêm**.
- Giao diện hiện rõ **trợ lý đã tra bằng công cụ nào** dưới mỗi câu trả lời, để người đọc biết con số lấy từ đâu.

### Quyết định đáng ghi
- Nhà cung cấp **kịch bản** chỉ dùng trong kiểm thử, cắm qua `datNhaCungCapThu()`; mã sản phẩm luôn đi qua `layNhaCungCap()`. Nhờ vậy 57 kiểm chứng chạy tất định, không gọi mạng, không tốn tiền mô hình (QĐ-33).
- `automation_rules` của Phase 8 và sổ công cụ của Phase 9 theo cùng một lối: **cấu trúc nằm trong mã, chỉ công tắc và ngưỡng nằm trong CSDL**.

### Kiểm thử
- 220 bài đơn vị, 514 bài tích hợp (thêm `thu:tro-ly` 57 bài), 278 bài HTTP đầu-cuối — tất cả đạt.
- Diễn tập cài mới trên CSDL rỗng: 10 migration chạy sạch, RLS phủ đủ mọi bảng có `tenant_id`.

## 0.9.0 — 21/09/2026 — Phase 8: Tự động hóa, Việc hôm nay, bảo trì và gia hạn

Căn cứ: prompt triển khai 36 mục, mục 21–22. Luật nghiệp vụ: `BUSINESS_RULES.md` mục 13 (TD), mục 14 (BT/GH).
**Chưa triển khai lên máy thật** — cùng đợt với 0.3.0 → 0.8.0, chờ Giám đốc cho phép.

### Thêm
- **Bản quét nhắc việc**: 8 quy tắc (báo giá chờ phản hồi, cơ hội im lặng, việc quá hạn, hóa đơn quá hạn, phiếu hỗ trợ trễ cam kết, bảo hành sắp hết, bảo trì tới kỳ, khách lâu chưa mua lại). Quy tắc thiếu ngưỡng thì **không quét** và nói rõ thiếu gì.
- **"Việc hôm nay"**: danh sách gợi ý riêng của từng người, đánh dấu đã xử lý hoặc bỏ qua kèm lý do. Chạy lại bản quét trong ngày không nhân đôi việc.
- **Chuông thông báo** trên thanh trên: tóm tắt việc hôm nay, phiếu hỗ trợ được giao, báo giá chờ duyệt, hóa đơn đã thu đủ. Chống trùng bằng khóa, không báo khi không có gì.
- **Màn hình Tự động hóa** (Quản trị): bật/tắt từng quy tắc, xem ngưỡng đang dùng, lịch sử chạy nền, nút Chạy quét ngay.
- **Worker chạy thật**: mỗi nhịp kiểm tra từng doanh nghiệp, tới giờ đã đặt thì quét. Chưa đặt giờ thì **không tự quét**.
- **Hợp đồng bảo trì định kỳ** (`BT-<năm>-0001`): chu kỳ tháng, ghi nhận từng kỳ, tự hết hạn sau kỳ cuối.
- **Lịch gia hạn**: bảo hành và hợp đồng sắp hết hạn, chốt thành cơ hội hoặc bỏ qua kèm lý do.
- 6 bảng CSDL (`notifications`, `automation_rules`, `job_runs`, `daily_action_items`, `maintenance_contracts`, `renewals`), 16 route API, 6 màn hình, một cấu hình mới (giờ quét hằng ngày).

### Sửa
- Bài thử Tài chính và HTTP lấy mốc "N ngày trước" theo **giờ UTC** trong khi hệ thống tính theo giờ Việt Nam: từ 0 đến 7 giờ sáng hai mốc lệch nhau một ngày và bài thử báo hỏng oan. Nay dùng chung hàm thuần theo giờ Việt Nam.
- Bài thử HTTP mục 7h chọn đúng dòng việc của lần chạy hiện tại thay vì dòng đầu danh sách (chạy nhiều lần trong ngày thì danh sách còn cả việc đã đóng của lần trước).

### Quyết định đáng ghi
- Đã cân nhắc cấp `service_desk.view` cho vai trò Kinh doanh để họ xem lịch gia hạn, rồi **bỏ**: cấp như vậy mở luôn cả hàng đợi phiếu hỗ trợ. Thay bằng kiểm `service_desk.view` HOẶC `sales.view` ngay trong service (QĐ-31).

### Kiểm thử
- 184 bài đơn vị, 457 bài tích hợp (thêm `thu:tu-dong-hoa` 67 bài), 268 bài HTTP đầu-cuối — tất cả đạt.
- Diễn tập cài mới trên CSDL rỗng: 9 migration chạy sạch, RLS phủ đủ mọi bảng có `tenant_id`.

## 0.8.0 — 20/09/2026 — Phase 7: Tài chính và Bảng điều hành

Căn cứ: prompt triển khai 36 mục, mục 6 và mục 20. Luật nghiệp vụ: `BUSINESS_RULES.md` mục 11 (TC), mục 12 (BDK).
**Chưa triển khai lên máy thật** — cùng đợt với 0.3.0 → 0.7.0, chờ Giám đốc cho phép.

### Thêm
- **Hóa đơn**: lập từ đơn hàng đã xác nhận (chép dòng, giữ liên kết tới dòng đơn) hoặc lập tay cho khoản lẻ; vòng đời Nháp → Đã phát hành → (Đã hủy). Số `HD-<năm>-0001` cấp nguyên tử. Màn hình danh sách, chi tiết, lập mới.
- **Công nợ phải thu**: bảng tuổi nợ năm nhóm và công nợ theo từng khách. **Không lưu thành cột** — tính từ hóa đơn đã phát hành trừ tiền đã thu, nên không có hai nguồn số để lệch.
- **Phiếu thu**: một phiếu trừ cho nhiều hóa đơn, tổng phân bổ phải khớp số tiền thu; hủy phiếu thu giữ lại bản ghi kèm lý do và trả công nợ về đúng như trước.
- **Bảng điều hành dựng bằng số liệu thật**: doanh thu và lợi nhuận gộp tháng này so với tháng trước, công nợ và nợ quá hạn, pipeline có trọng số, báo giá chờ duyệt, đơn chờ giao, cảnh báo tồn kho, phiếu hỗ trợ trễ hạn, dự án quá hạn, việc của tôi. Mỗi khối gắn quyền và phạm vi riêng; không có quyền thì khối không hiện.
- 4 bảng CSDL (`invoices`, `invoice_items`, `payments`, `payment_allocations`), 9 route API, nhóm điều hướng **Tài chính**, nút **Lập hóa đơn** trên trang đơn hàng, mục Hóa đơn trong nút Tạo mới.
- Dữ liệu mẫu tenant `demo` có hóa đơn, phiếu thu và một khoản đã quá hạn để bảng điều hành có gì để cảnh báo.

### Sửa
- Bài thử HTTP mục 7f gắn phiếu hỗ trợ vào bảo hành theo **số sê-ri thực tế của bản ghi đầu danh sách** thay vì đoán là sê-ri số 1 — thứ tự danh sách bảo hành không được bảo đảm nên khẳng định cũ thỉnh thoảng báo hỏng oan.

### Kiểm thử
- 151 bài đơn vị, 390 bài tích hợp (thêm `thu:tai-chinh` 40 bài), 228 bài HTTP đầu-cuối — tất cả đạt.
- Diễn tập cài mới trên CSDL rỗng: 8 migration chạy sạch, RLS phủ đủ mọi bảng có `tenant_id`.

## 0.7.0 — 20/09/2026 — Phase 6: Dự án, bảo hành, bàn dịch vụ

Căn cứ: prompt triển khai 36 mục, mục 17–18. Luật nghiệp vụ: `BUSINESS_RULES.md` mục 8 (BH), mục 9 (HT), mục 10 (DU).
**Chưa triển khai lên máy thật** — cùng đợt với 0.3.0 → 0.6.0, chờ Giám đốc cho phép.

### Thêm
- **CSDL** (migration `20260920140406_phase6_du_an_bao_hanh_ho_tro`, chỉ thêm bảng và cột): `warranties`, `projects`, `project_milestones`, `support_tickets`, `support_ticket_events`; cột `project_id` trên `tasks`; 17 ràng buộc CHECK; **trigger chặn sửa/xóa diễn biến phiếu**; cấp bù `order.view` cho CSKH và kỹ thuật để tra được máy đã bán.
- **Bảo hành tự sinh khi giao hàng**: mỗi số sê-ri một phiếu, thời hạn = ngày giao + số tháng của sản phẩm (chụp lại lúc giao). Tra theo số sê-ri ra ngay khách, đơn hàng và còn hạn hay không.
- **Bàn dịch vụ**: phiếu `HT-2026-0001` gắn thẳng với chiếc máy đã bán; giao kỹ thuật; ghi diễn biến **chỉ-ghi-thêm**; hoàn thành bắt buộc ghi cách xử lý; đóng phiếu.
- **Cam kết dịch vụ (SLA)**: hạn phản hồi và hạn xử lý tính từ ngưỡng trong Cấu hình (4 ngưỡng mới, phiếu Khẩn có ngưỡng riêng), **chụp lại lúc mở phiếu** nên đổi ngưỡng không làm đổi phiếu cũ. Danh sách lọc được phiếu trễ hạn.
- **Dự án triển khai**: mã `DA-2026-0001` từ đơn đã xác nhận, chia hạng mục, tiến độ theo hạng mục, tự chuyển sang "đang triển khai" khi hạng mục đầu chạy, **nghiệm thu chỉ mở khi mọi hạng mục đã xong**, nghiệm thu rồi thì khóa.
- Việc (`tasks`) và phiếu hỗ trợ gắn được vào dự án; trang đơn hàng có nút "Mở dự án triển khai".
- **Màn hình**: Phiếu hỗ trợ (danh sách, mở phiếu có tra sê-ri, chi tiết + diễn biến), Bảo hành (danh sách, chi tiết, sửa hạn, hủy), Dự án (danh sách, mở dự án, chi tiết + hạng mục + nghiệm thu). 14 route `/api/v1` mới.
- Dữ liệu mẫu tenant `demo`: 14 phiếu bảo hành, 2 phiếu hỗ trợ (1 đã đóng đủ diễn biến, 1 chờ khách), 1 dự án đang chạy.
- Kiểm thử: 25 bài đơn vị mới (**138**), `thu-dich-vu` 51 kiểm chứng (tích hợp **350**), `thu-http` thêm 31 kiểm chứng (**200**).

### Sửa
- `suaBaoHanh()` tự kiểm lý do ngay trong service, không chỉ dựa vào lược đồ — gọi thẳng service (seed, AI sau này) vẫn bị chặn.
- Ngưỡng cảnh báo bảo hành sắp hết chuyển từ "dùng từ Phase 8" sang **dùng từ Phase 6**, nên màn hình Cấu hình không còn báo nhầm là chưa dùng đến.

### Vấn đề đã biết
- **Chưa có hợp đồng bảo trì định kỳ và gia hạn tự động** (`maintenance_contracts`, `renewals`) — để Phase 8 cùng bộ nhắc việc.
- Chưa có trả hàng / đổi máy và tệp đính kèm cho phiếu.
- Trưởng phòng Kỹ thuật có phạm vi khách hàng theo **phòng ban** nên không tự mở dự án cho khách của phòng kinh doanh; Giám đốc mở phạm vi ở màn hình Vai trò nếu muốn (câu hỏi Q9).

## 0.6.0 — 20/09/2026 — Phase 5: Đơn hàng và kho

Căn cứ: prompt triển khai 36 mục, mục 15–16. Luật nghiệp vụ: `BUSINESS_RULES.md` mục 6 (DH-01 → DH-09) và mục 7 (KHO-01 → KHO-08).
**Chưa triển khai lên máy thật** — cùng đợt với 0.3.0 → 0.5.0, chờ Giám đốc cho phép.

### Thêm
- **CSDL** (migration `20260920103433_phase5_don_hang_kho`, chỉ thêm bảng và cột): `warehouses`, `sales_orders`, `sales_order_items`, `inventory_balances`, `inventory_transactions`, `deliveries`, `delivery_items`, `serial_numbers`; hai cột mới trên `products` (`min_stock`, `quan_ly_ton`); 20 ràng buộc CHECK; **trigger chặn sửa/xóa sổ cái kho**; cấp bù quyền kho cho vai trò Thủ kho đã có trên máy thật.
- **Báo giá đã chốt → đơn hàng bằng một nút**: dòng hàng và số tiền chép sang (giữ liên kết truy ngược từng dòng), bấm lại không sinh đơn thứ hai. Trang báo giá chỉ luôn đơn đã sinh.
- **Đơn hàng**: số `DH-2026-0001`, sửa khi còn nháp, xác nhận (giữ hàng trong kho), hủy có lý do (nhả hàng), xuất hàng nhiều lần; trạng thái giao **tính từ dữ liệu** nên không có đơn "đã giao đủ" mà còn hàng chưa xuất.
- **Kho**: nhiều kho, nhập kho kèm nguồn hàng, điều chỉnh sau kiểm kê (bắt buộc lý do), **thẻ kho chỉ-ghi-thêm** ghi cả số dư sau từng giao dịch, đối soát sổ cái với số dư.
- **Giữ chỗ hàng**: hàng còn bán được = tồn kho − phần đang giữ cho đơn đã xác nhận; xác nhận đơn khi hàng không đủ bị chặn kèm con số thật.
- **Số sê-ri**: nhập kho khai đủ sê-ri cho hàng quản lý theo máy, xuất phải đúng sê-ri đang ở kho đó; tra cứu sê-ri ra ngay đơn và khách đã mua.
- **Mức tồn tối thiểu** cho từng sản phẩm, sinh cảnh báo "sắp hết" / "hết hàng" ngay trên màn hình Tồn kho.
- **Màn hình**: Đơn hàng (danh sách, chi tiết, tạo, sửa), Kho (tồn kho, nhập kho, thẻ kho, số sê-ri, danh sách kho). 15 route `/api/v1` mới.
- Dữ liệu mẫu tenant `demo`: 2 kho, 4 mặt hàng có tồn (kèm sê-ri), 1 đơn hàng đã xác nhận và giao một phần.
- Kiểm thử: 22 bài đơn vị mới (**113**), `thu-don-hang` 53 kiểm chứng (tích hợp **299**), `thu-http` thêm 33 kiểm chứng (**169**); diễn tập **cài mới** toàn bộ migration trên CSDL trống: 39 bảng, 81 CHECK, 4 trigger chỉ-ghi-thêm, RLS không sót bảng.

### Sửa
- Gợi ý sản phẩm (`/api/v1/bao-gia/goi-y-san-pham`) nay dùng chung cho lập báo giá, lập đơn và nhập kho — trước đó chỉ người có quyền tạo báo giá mới tra được hàng.
- Nhãn phase ở chân thanh bên và `PHASE_HIEN_TAI` cập nhật sang Phase 5.

### Vấn đề đã biết
- **Chưa có mua hàng** (`purchase_requests`, `purchase_orders`): nhập kho hiện ghi thẳng kèm nguồn hàng dạng chữ. Mua hàng theo đề nghị — đặt hàng — nhận hàng để phase sau.
- Chưa có chuyển kho nội bộ và trả hàng/bảo hành (Phase 6).
- Giá vốn trên dòng đơn là **giá chụp lúc lập**, chưa phải giá vốn bình quân theo lô nhập (Phase 7).
- Theo mục 19 đặc tả, **Nhân viên Kinh doanh chỉ xem đơn**; tạo và xác nhận đơn là của Trưởng phòng. Giám đốc có thể đổi ngay trên màn hình Vai trò (câu hỏi Q8).

## 0.5.0 — 20/09/2026 — Phase 4: Báo giá

Căn cứ: prompt triển khai 36 mục, mục 10–14. Luật nghiệp vụ: `BUSINESS_RULES.md` mục 5 (BG-01 → BG-10).
**Chưa triển khai lên máy thật** — cùng đợt với 0.3.0 và 0.4.0, chờ Giám đốc cho phép.

### Thêm
- **CSDL** (migration `20260920015506_phase4_bao_gia`, chỉ thêm bảng): `quotations`, `quotation_versions`, `quotation_items`, `quotation_approvals`; CHECK cho trạng thái, tiền không âm, số lượng > 0, chiết khấu/VAT 0–100, đã gửi phải có thời điểm gửi, đã quyết duyệt phải có người quyết.
- **Một báo giá, nhiều phiên bản**: số `QT-2026-0001`, bản hiển thị `QT-2026-0001-V2`. Sửa bản đã gửi thì tạo phiên bản mới, bản cũ chuyển "Đã thay bằng bản mới" và **giữ nguyên để đối chiếu**.
- **Tính tiền và biên lợi nhuận bằng một hàm thuần** dùng chung cho giao diện, API và bản in: làm tròn từng dòng về đồng rồi cộng (bảng in cộng đúng bằng tổng); doanh thu 0 trả biên `null`, không phải 0%.
- **Luồng duyệt theo ngưỡng**: biên dưới `bao_gia.nguong_bien_loi_nhuan` (đọc từ Cấu hình, **không viết cứng**) thì phải xin duyệt; **ngưỡng chưa đặt thì mọi báo giá phải duyệt**; người lập không tự duyệt trừ người có phạm vi duyệt toàn công ty; sửa bản đã duyệt thì quay về Nháp.
- **Gửi khách và chốt**: ghi kênh gửi (email / Zalo / in giấy) và thời điểm — hệ thống chưa tự gửi email; gửi báo giá đẩy cơ hội sang giai đoạn "Báo giá"; chốt Chấp nhận / Từ chối / Đang thương lượng.
- **Giá vốn và SKU chụp lại trên từng dòng hàng** lúc lập, nên nhà cung cấp đổi giá sau đó không làm đổi con số của báo giá cũ.
- **Bản in / PDF** (`/bao-gia/<id>/in`): mẫu A4 có phần đầu công ty, người nhận, bảng hàng, tổng tiền, **tiền bằng chữ**, điều khoản và chỗ ký; in hoặc lưu PDF bằng hộp thoại in của trình duyệt (QĐ-21).
- **Hồ sơ công ty** (Quản trị → Hồ sơ công ty): tên, địa chỉ, mã số thuế, liên hệ, ngân hàng, người ký, điều khoản in cuối chứng từ. **Không điền sẵn gì** — mục nào chưa khai thì bản in để trống kèm nhắc (QĐ-22).
- **Màn hình**: danh sách báo giá (tóm tắt đang chạy / đã nhận / hàng đợi duyệt, lọc theo trạng thái và người lập), lập báo giá với ô tìm sản phẩm lấy sẵn giá bán + giá vốn theo nguồn nên mua, sửa phiên bản đang soạn, chi tiết có thẻ phiên bản và lịch sử duyệt, bản in, hồ sơ công ty. Trang cơ hội có nút "Lập báo giá" và danh sách báo giá của cơ hội đó.
- 9 route `/api/v1` mới (`/bao-gia`, `/bao-gia/goi-y-san-pham`, `/bao-gia/[id]`, `/phien-ban`, `/xin-duyet`, `/duyet`, `/gui`, `/chot`, `/ho-so-cong-ty`).
- Dữ liệu mẫu tenant `demo`: 3 báo giá đi đủ luồng (một qua duyệt rồi gửi, một khách đã chấp nhận, một có phiên bản V2 đang soạn) + hồ sơ công ty mẫu.
- Kiểm thử: 18 bài đơn vị mới (**91**), `thu-bao-gia` 34 kiểm chứng (tích hợp **246**), `thu-http` thêm 28 kiểm chứng (**139**).

### Sửa
- **Rò dữ liệu giữa các doanh nghiệp ở phần đầu bản in**: `docHoSoCongTy()` hỏi bảng `tenants` mà không lọc theo tenant. Bảng này cho đọc mọi dòng đang hoạt động (cần cho lúc đăng nhập), nên Postgres trả về **doanh nghiệp bất kỳ** — bản in có thể mang tên và mã số thuế của công ty khác. Nay bắt buộc truyền `tenantId`.
- **Trang sửa báo giá trắng trang**: Server Component gọi `dinhDangNhapTien()` đặt trong tệp `"use client"` → Next.js ném lỗi lúc dựng trang. Hàm thuần đã chuyển về `src/lib/dinh-dang.ts` (QĐ-23); thêm bài thử HTTP dựng trang sửa để không tái diễn.
- Nhãn phase ở chân thanh bên và `PHASE_HIEN_TAI` còn dừng ở Phase 1–2, nay đúng Phase 4 (màn hình Cấu hình vì thế không còn báo nhầm "chưa dùng đến" cho ngưỡng biên lợi nhuận).

### Vấn đề đã biết
- **Chưa chuyển báo giá đã chấp nhận thành đơn hàng** — chưa có bảng đơn hàng, để Phase 5.
- Chưa gửi email tự động; người dùng gửi rồi ghi nhận lại (Phase 8).
- Bản in chưa có logo (chưa có chỗ tải tệp ảnh trong hệ thống) và chưa có mẫu song ngữ.
- Báo giá hết hiệu lực mới **hiển thị** là hết hiệu lực, chưa có tác vụ nền tự chuyển trạng thái (Phase 8).

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
