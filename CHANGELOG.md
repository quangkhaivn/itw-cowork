# Nhật ký thay đổi

Theo phiên bản ứng dụng. Ngày theo giờ Việt Nam.

## 0.18.0 (chưa phát hành) — Email marketing, giai đoạn 1: gửi số lượng lớn

**Chưa triển khai lên máy thật.** Một migration mới (`20261025090001_email_gui_lon`, có chuyển dữ liệu cũ vào sổ đồng ý), chạy lại `prisma/rls.sql` như mọi lần (sổ đồng ý + nhật ký SNS vào nhóm bảng chỉ-ghi-thêm). Không có biến môi trường mới, không thêm mã quyền, không thêm thư viện.

Luật nghiệp vụ: `BUSINESS_RULES.md` mục 29 (EG-01 → EG-14). Quyết định QĐ-94 → QĐ-99. Hướng dẫn: `docs/HUONG-DAN-SES.md`.

### Thêm
- **Kênh gửi Amazon SES** (Quản trị → Kết nối email): chọn "Amazon SES", vùng (mặc định ap-southeast-1), configuration set, tên miền gửi (vd `tin.itwonline.com`), SMTP credentials. Máy tự dùng `email-smtp.<vùng>.amazonaws.com:587` STARTTLS, gắn configuration set + thẻ người nhận vào thư và lưu mã thư SES.
- **Webhook sự kiện SES qua SNS** `/api/cong-khai/email/ses/<mã>`: kiểm chữ ký SNS (phiên bản 1 và 2), chủ đề, host chứng chỉ; tự xác nhận đăng ký; không xử lý trùng. Thư tới hộp thư, bị trả lại vĩnh viễn (chặn email hỏng), bị báo rác (chặn + ghi phản đối + từ chối trên lead / liên hệ).
- **Tự tạm dừng chiến dịch** khi tỷ lệ trả lại > 5% hoặc báo rác > 1‰ (sau 200 thư), báo người duyệt.
- **Sổ đồng ý email** (Marketing → Sổ đồng ý email): chỉ ghi thêm; ghi tự động từ form có ô đồng ý (khách tự tích), huỷ nhận tin, báo rác; ghi tay có căn cứ; nhập CSV (Email, Nguồn, Căn cứ, Thời điểm). Duyệt chiến dịch loại người chưa có đồng ý ("Chưa có đồng ý nhận thư quảng cáo").
- **Nhãn [QC]** tự động đầu tiêu đề thư quảng cáo (đổi được, không bỏ được).
- **Tối đa 3 thư quảng cáo / địa chỉ / 24 giờ** trên mọi chiến dịch — vượt thì hoãn, không lỗi.
- **Thư xác nhận từ chối**: sau khi huỷ nhận tin, gửi một thư xác nhận lúc nhận yêu cầu và lúc ngừng gửi.
- **Khởi động tên miền (warm-up)**: trần ngày tăng dần từ 200 thư, hệ số 1,3/ngày; hạn mức hôm nay hiện ở Kết nối email và chiến dịch.
- **Báo cáo theo tên miền nhận** (Gmail, Outlook, Yahoo, khác) trên chi tiết chiến dịch; thẻ "Trả lại / báo rác".
- **Tên miền gửi**: bảng bản ghi DNS cần thêm, chia "Làm ngay" (DMARC) và "Sau khi có AWS" (DKIM, MAIL FROM), nút **Kiểm tra** báo từng bản ghi.
- Cấu hình mới (nhóm Email marketing): `email.nguong_hong_phan_tram`, `email.nguong_bao_rac_phan_nghin`, `email.mau_toi_thieu_danh_gia`, `email.bat_buoc_dong_y`, `email.toi_da_thu_moi_dia_chi_24h`, `email.khoi_dong_ngay_bat_dau`, `email.khoi_dong_muc_dau`, `email.khoi_dong_he_so`.

### Thay đổi đáng lưu ý
- **Duyệt chiến dịch giờ cần sổ đồng ý** (mặc định bật). Migration chuyển cờ đồng ý cũ vào sổ (nguồn "Chuyển từ dữ liệu trước 0.18"); người chỉ được tích "đồng ý" bằng nút trên lead mà không có căn cứ sẽ bị loại — ghi lại ở Sổ đồng ý kèm căn cứ. Tắt bằng `email.bat_buoc_dong_y = 0` (chỉ khi gửi thư không phải quảng cáo).
- Tiêu đề thư chiến dịch, xem trước và thư thử luôn mở đầu bằng `[QC]`.
- Chưa có tài khoản AWS: mọi tính năng trên (trừ webhook SES) chạy với hộp thư SMTP hiện tại.

## 0.17.0 — 19/10/2026 — Công việc thông suốt: kết quả công việc, hồ sơ khách đầy đủ, thông báo giao việc, kiểm tra trước khi xong

**Chưa triển khai lên máy thật.** Một migration mới (`20261014150000_cong_viec_thong_suot`), không có biến môi trường mới, không thêm mã quyền.

Luật nghiệp vụ: `BUSINESS_RULES.md` mục 27 (CV-04 → CV-11) và mục 28 (HS-01 → HS-04). Quyết định QĐ-91 → QĐ-93.

### Thêm
- **Kết quả công việc**: mỗi việc có ô kết quả (đã làm gì, khách nói gì, bước tiếp theo) và đánh giá *Đạt / Đạt một phần / Không đạt / Cần làm tiếp*, ghi người ghi và lúc ghi. Đánh dấu xong **bắt buộc** có kết quả (≥ 10 ký tự) và đánh giá. Kết quả hiện trên dòng thời gian và thẻ Công việc của Customer 360.
- **Kiểm tra trước khi xong**: hộp hoàn thành kiểm tra trực tiếp trong lúc gõ và liệt kê còn thiếu gì; máy chủ kiểm lại đúng bộ kiểm tra đó trong cùng giao dịch lúc ghi (API trả 422 `chua-du-dieu-kien-xong` kèm danh sách vấn đề).
- **Danh sách kiểm tra** trên từng việc (tối đa 30 mục, bắt buộc / không bắt buộc): lập ngay lúc giao việc (mỗi dòng một mục, `?` đầu dòng = không bắt buộc) hoặc thêm sau; mục bắt buộc chưa tích thì không xong được; khóa khi việc đã xong / đã hủy.
- **Thông báo khi giao việc**: người được giao nhận thông báo ngay (khẩn/cao hiện mức tương ứng); giao lại thì người mới được báo "Được chuyển việc", người cũ được báo không cần làm tiếp; việc xong thì người giao nhận thông báo kèm đánh giá và kết quả ("Không đạt" là mức cảnh báo). Ghi người giao và lúc giao trên từng việc.
- **"Cần làm tiếp" phải hẹn việc tiếp theo**: việc mới tạo cùng lúc, cùng người làm, cùng khách / lead / cơ hội, mang theo kết quả lần trước.
- **Trang chi tiết công việc** `/cong-viec/:id` — đích của mọi thông báo: thông tin giao việc, hạn, kết quả, danh sách kiểm tra, **tệp đính kèm** (biên bản, ảnh hiện trường), nút Bắt đầu làm / Hoàn thành / Giao lại / Hủy / Mở lại / Sửa kết quả.
- Danh sách công việc: thẻ **"Tôi giao"** (việc mình giao cho người khác), tiến độ danh sách kiểm tra, kết quả + đánh giá ngay dưới tên việc; bấm ô "xong" mở hộp ghi kết quả thay vì ghi tắt.
- **Hồ sơ khách đầy đủ**: Customer 360 hiện điểm đầy đủ 0–100, trường bắt buộc còn thiếu (theo loại khách: doanh nghiệp / đại lý cần mã số thuế và người liên hệ) và chỗ bổ sung. Tính lúc đọc, không lưu. Hồ sơ thiếu chỉ **nhắc** khi hoàn thành việc, không chặn.
- API mới: `GET /api/v1/cong-viec/:id`, `GET /api/v1/cong-viec/:id/kiem-tra`, `POST /api/v1/cong-viec/:id/muc-kiem-tra`, `PATCH|DELETE /api/v1/cong-viec/muc-kiem-tra/:mucId`. `PATCH /api/v1/cong-viec/:id` nhận thêm `ketQua`, `danhGia`, `viecTiepTheo`.

### Thay đổi đáng lưu ý
- Việc đã xong **trước 0.17** không có kết quả: vẫn mở lại được, nhưng muốn sửa thứ khác thì phải ghi kết quả trước. Trang chi tiết hiện nhắc "Ghi kết quả". Luật này kiểm ở service chứ không đặt CHECK, để chuyển đổi lead và gộp khách vẫn chạy trên dữ liệu cũ (QĐ-91).
- Việc cũ được điền người giao = người tạo, lúc giao = lúc tạo.

### Sửa
- Lưới hai cột `.luoi-the` (Customer 360, chi tiết công việc) lệch hàng 16px — cùng lỗi đã sửa cho lưới thẻ chỉ số ở 0.16.0.
- Lint báo lỗi trên `may-ca-nhan/chay-sql.cjs` (script CommonJS của bộ chạy thử Windows) — bỏ thư mục đó khỏi lint ứng dụng.
- `thu:qa-khach` hỏng giả khi máy không có CSDL mẫu ITW CRM (đường dẫn cũ của phiên trước): nay **bỏ qua có báo rõ** phần script nhập ITW; đặt `QA_ITW_DB` để chạy đủ.

### Kiểm thử
- **469 bài đơn vị** (thêm 21 cho `kiemTraTruocKhiXong` và `danhGiaHoSoKhach`), `typecheck` + `lint` + `build` sạch.
- **1.620 kiểm chứng tích hợp** trong 27 bộ của `thu:tich-hop`, gồm bộ mới `thu:cong-viec` 66 (lưu kết quả, báo người giao, việc tiếp theo, chuyển người, việc cũ, đính kèm, hồ sơ khách, ràng buộc CSDL). `thu:qa-khach` 127 (8 kiểm chứng script nhập ITW bỏ qua vì thiếu CSDL mẫu).
- Trên bản dựng production: **447 bài `thu:http`** (thêm 13 cho công việc: 422 khi thiếu kết quả, xem trước, mục kiểm tra, chi tiết, trang chi tiết, phạm vi), **107 `thu:qa-marketing-http`**, **75 `thu:qa-email-http`** — tất cả đạt. Chạy thử trên trình duyệt: giao việc có danh sách kiểm tra → tích mục → ô "xong" ở danh sách mở hộp → "Cần làm tiếp" bắt hẹn việc → xong → việc tiếp theo được tạo.

## 0.16.1 — 19/10/2026 — Toàn vẹn dữ liệu: khóa chứng từ, lan truyền trạng thái, vận hành bền vững

### Toàn vẹn dữ liệu — tài chính và mua hàng

Luật nghiệp vụ: `BUSINESS_RULES.md` mục 26 (TV-TC-01 → TV-TC-10). Kiến trúc: `ARCHITECTURE.md` mục 7t. Quyết định QĐ-82 → QĐ-85. Migration `20261014085000_toan_ven_tai_chinh`. Bài thử mới `npm run thu:toan-ven-tai-chinh` (60 kiểm chứng, đã nối vào `thu:tich-hop`).

#### Sửa
- **Thu tiền / chi tiền vượt công nợ khi hai yêu cầu chạy cùng lúc** (hai kế toán, hoặc bấm đúp): phiếu thu / phiếu chi nay khóa các hóa đơn được phân bổ trước khi đọc phần còn nợ. Một hóa đơn lặp hai lần trong cùng một phiếu cũng bị từ chối rõ ràng (trước đây lỗi CSDL khó hiểu).
- **Hủy hóa đơn chạy đua với thu tiền** có thể để lại tiền thu trên hóa đơn đã hủy — nay khóa hóa đơn. Hủy một phiếu thu / chi hai lần cùng lúc không còn ghi hai sự kiện.
- **Hủy được hóa đơn đã có giảm trừ trả hàng đã chốt**, làm khoản giảm trừ lơ lửng — nay chặn kèm số phiếu trả hàng, nút Hủy ẩn (cả chiều bán lẫn chiều mua).
- **Hai hóa đơn còn hiệu lực cho một đơn hàng / đơn mua** khi bấm lập cùng lúc — nay khóa đơn trước, và thêm chỉ mục duy nhất riêng phần ở CSDL.
- **Hóa đơn gắn được dự án của khách khác**; chọn khách khác với khách của đơn thì bị lặng lẽ đổi theo đơn — nay từ chối. Tương tự nhà cung cấp trên hóa đơn từ đơn mua.
- **Hủy đơn mua làm đề nghị gốc kẹt ở "Đã đặt hàng"** mãi mãi — nay đề nghị quay về "Đã duyệt" để đặt lại. Dòng đơn mua trỏ được sang dòng của đề nghị khác — nay chặn.
- **Hủy được đơn mua đang có hóa đơn nhà cung cấp** — nay phải hủy hóa đơn trước.
- Đề nghị mua và đơn mua khóa dòng ở mọi bước đổi trạng thái (duyệt, lập đơn, gửi, xác nhận, hủy, nhận hàng): hai người cùng lập đơn từ một đề nghị, hay nhận đủ hàng hai lần cùng lúc, không còn sinh chứng từ thừa.
- Hủy hóa đơn nhà cung cấp và hủy phiếu chi nay ghi sự kiện như bên bán.
- (QA) Lỗi khóa chéo / xung đột ghi của PostgreSQL (40P01, 40001) nay trả **409** "thử lại" thay vì 500 (giao dịch đã cuộn ngược hết). Dòng phân bổ phiếu thu / phiếu chi dưới 1 ₫ sau làm tròn bị từ chối rõ ràng thay vì lỗi 500 từ CHECK của CSDL. Nút Hủy đơn mua ẩn khi đơn đã nhận hàng hoặc còn hóa đơn nhà cung cấp (TV-TC-10). Bài thử QA độc lập `npm run thu:qa-tv-tai-chinh`.

#### Triển khai
- Migration chỉ thêm hai chỉ mục; nếu dữ liệu cũ đã có đơn nào mang hơn một hóa đơn còn hiệu lực, migration **dừng** và báo số lượng. Kiểm trước:
  `SELECT sales_order_id, count(*) FROM invoices WHERE sales_order_id IS NOT NULL AND status <> 'CANCELLED' GROUP BY 1 HAVING count(*) > 1;` (và tương tự `supplier_bills.purchase_order_id`). Hủy hóa đơn thừa kèm lý do rồi chạy lại. Chạy lại `rls.sql` như mọi lần.
### Toàn vẹn dữ liệu — bán hàng và kho

Luật nghiệp vụ: `BUSINESS_RULES.md` mục 25 (TV-BH-01 → TV-BH-12). Kiến trúc: `ARCHITECTURE.md` mục 7s. Quyết định QĐ-77 → QĐ-81. Migration `20261014081000_toan_ven_ban_hang` (chạy lại `prisma/rls.sql` sau khi áp). Bài thử mới `npm run thu:toan-ven-ban-hang` (80 kiểm chứng, nằm trong `thu:tich-hop`).

#### Sửa
- **Bấm hai lần / hai người làm cùng lúc** không còn ghi hai lần: xác nhận đơn (trước đây giữ chỗ gấp đôi), hai phiếu xuất cho một đơn (giao vượt), tạo đơn từ báo giá, chốt / duyệt / gửi báo giá, nhận hàng chuyển kho (nhập kho đích hai lần), chuyển đổi lead (hai khách), xác nhận / lập phiếu trả hàng, đổi trạng thái phiếu hỗ trợ — khóa dòng chứng từ trước khi đọc trạng thái.
- **Một sê-ri bán cho hai đơn**: xuất hàng nay chỉ chuyển sê-ri đang `trong-kho` đúng kho; đơn thứ hai nhận lỗi rõ ràng.
- **Số đã giao bị ghi đè** khi hai phiếu xuất chạy song song: cộng nguyên tử; một dòng đơn chỉ xuất hiện một lần trong phiếu xuất.
- **Giữ chỗ kẹt mãi**: giao từ kho khác kho đã giữ thì nhả giữ chỗ ở kho đã giữ; đơn giao đủ nhả mọi phần còn sót.
- **Máy khách trả về không bán lại được** (lỗi trùng khóa sê-ri khi xuất lại) và khách cũ vẫn còn bảo hành: trả hàng thường nay kết thúc bảo hành cũ và nhả sê-ri; hủy bảo hành bằng tay cũng nhả sê-ri. Migration sửa luôn dữ liệu cũ: bảo hành của máy đã quay về kho chuyển "hủy", bảo hành đã hủy nhả sê-ri.
- **Hủy đơn khi còn hóa đơn**: bị chặn, thông báo liệt kê số hóa đơn; dự án còn mở chỉ được cảnh báo.
- **Một báo giá sinh nhiều đơn**: chặn ở CSDL (một đơn chưa hủy mỗi báo giá) và chặn ra phiên bản mới khi báo giá đã có đơn.
- **Báo giá chấp nhận mà cơ hội vẫn mở**: chấp nhận báo giá hoặc tạo đơn từ báo giá chuyển cơ hội sang Thắng (không lật cơ hội đã Thua).
- **Liên kết chéo khách**: phiếu hỗ trợ không gắn được sê-ri / đơn / dự án / liên hệ của khách khác; phiếu trả hàng không lấy được dòng của đơn khác, sê-ri bán cho khách khác, hay cộng nhiều dòng vượt số đã giao.
- **Mở lại phiếu hỗ trợ** đã xử lý xong nay xóa mốc xong để nhắc trễ hạn SLA chạy lại; giữ mốc xong lần đầu, diễn biến ghi "Mở lại phiếu".

- **QA độc lập** (`npm run thu:qa-tv-ban-hang`, trong `thu:tich-hop`; `thu:qa-tv-ban-hang-http` chạy riêng vào máy chủ đang chạy): hai đơn có dòng hàng ngược thứ tự xác nhận / xuất cùng lúc từng khóa chéo nhau và trả lỗi 500 — nay khóa số dư theo một thứ tự chung, lỗi tranh chấp còn lại trả 409 "thử lại"; xác nhận trả hàng nhà cung cấp chạy cùng lúc với xuất đơn từng ghi đè máy đã bán cho khách thành "trả NCC" — nay cập nhật sê-ri có điều kiện; sửa bảo hành chạy cùng lúc với hủy từng gia hạn bảo hành đã hủy — nay khóa; khách trả máy mà bảo hành đã quá hạn theo ngày thì giữ trạng thái hết hạn (trước đây ghi "hủy").

#### Đổi hành vi
- **Khách trả hàng bắt buộc theo đơn** (bỏ phiếu "trả lẻ"): mở từ nút "Khách trả hàng" trên trang đơn hàng. Phiếu đổi máy không còn tính vào "đã trả" của dòng đơn.

#### Cơ sở dữ liệu
- Chỉ mục riêng phần `sales_orders_bao_gia_dang_hoat_dong_key`; CHECK `warranties_huy_nha_serial_check`; cột `support_tickets.first_resolved_at`; loại diễn biến `mo-lai`. Báo giá nào đang có hai đơn chưa hủy thì migration dừng với thông báo rõ ràng — hủy đơn thừa rồi chạy lại.
### Vận hành bền vững

Kiến trúc: `ARCHITECTURE.md` mục 7u. Quyết định QĐ-86 → QĐ-90. Migration `20261014090001_van_hanh_ben_vung`. Hướng dẫn máy chủ: `DEPLOYMENT.md` mục "Nâng cấp lên 0.16.1" và "Sao lưu và phục hồi".

#### Sửa
- **Bản quét nhắc việc hỏng biến mất và thử lại mỗi phút mãi mãi**: dòng "hỏng" được ghi trong chính giao dịch đã cuộn ngược; bản quét lớn còn hỏng chắc vì hạn 5 giây. Nay quét trong giao dịch hạn theo lô, ghi việc theo lô (`createMany … skipDuplicates`), lần hỏng ghi bằng giao dịch riêng, thử lại sau 15 → 30 → 60 → 120 phút (tối đa 5 lần/ngày), hỏng 2 lần liên tiếp thì chuông báo quản trị. Nút *Chạy quét ngay* cũng ghi lần hỏng và báo lỗi rõ.
- **Redis hỏng làm worker bỏ cả nhịp** (kể cả bản quét): mỗi kho một `try`; nhịp sống chính chuyển sang PostgreSQL.
- **Trợ lý AI gọi mô hình bên trong giao dịch CSDL**, fetch không có hạn: nay ghi câu hỏi → gọi mô hình ngoài giao dịch (hạn `AI_HAN_GOI_GIAY`, mặc định 60 giây) → mỗi công cụ một giao dịch ngắn → ghi câu trả lời. Mô hình treo thì báo "Mô hình không trả lời trong … giây", không lỗi 500.
- **Gửi thư thử SMTP bên trong giao dịch**: tách ba bước, gửi ngoài giao dịch.
- **Giới hạn tốc độ cho qua hết khi Redis hỏng**: nay đếm tạm trong bộ nhớ tiến trình.
- `docker-compose.yml` không chuyển `AI_PROVIDER` / `AI_MODEL` / `ANTHROPIC_API_KEY` vào `app` nên trợ lý trên máy thật luôn "chưa cấu hình"; biến rỗng nay được coi như chưa đặt.

#### Thêm
- Bảng `system_heartbeats`; healthcheck container `worker` (`worker/kiem-tra-song.ts`); `/api/khoe` thêm `worker: ok|tre`; `GET /api/v1/tu-dong-hoa/van-hanh`; thẻ Worker / Sao lưu và **băng đỏ** trên *Quản trị → Tự động hóa* (worker trễ > 5 phút, quét hỏng, sao lưu > 26 giờ / hỏng / chưa chép ra ngoài / chưa sao lưu `.env`, thử phục hồi hỏng).
- **Sao lưu**: dùng `THU_MUC_DINH_KEM`; dump + gói đính kèm (luôn có) + `.env` mã hóa gpg cùng mốc; chép ra ngoài bằng rclone (`RCLONE_REMOTE`, kiểm kích thước, `GIU_NGAY_NGOAI`); ghi trạng thái; hỏng thì thoát mã ≠ 0 và báo động (`ALERT_WEBHOOK_URL`, `ALERT_EMAIL`); khóa chạy một mình. `trien-khai.sh` cài `/etc/cron.d/cowork-sao-luu` (02:15) + logrotate khi chạy bằng root.
- `scripts/thu-phuc-hoi.sh`: phục hồi bộ mới nhất (trên máy hoặc từ ngoài máy) vào CSDL tạm, kiểm số liệu, gói đính kèm, giải mã `.env`, xóa CSDL tạm; cron hằng tuần tùy chọn (`THU_PHUC_HOI_HANG_TUAN=1`).
- nginx trong Docker: `limit_req` cho đăng nhập và `/api/cong-khai/`, IP thật qua module realip (chỉ tin dải nội bộ), ghi đè `X-Real-IP`/`X-Forwarded-For`; `proxy_read_timeout 300s` cho `/api/v1/tro-ly/hoi`.
- Bài thử `npm run thu:van-hanh` (nối vào `thu:tich-hop`) và `thu/don-vi/van-hanh.test.ts`.

#### Còn lại
- `guiThuThu` (gửi thử một chiến dịch, `src/modules/email/service.ts`) vẫn gửi SMTP trong giao dịch — ngoài phạm vi gói này, sửa cùng mẫu `BuocGiaoDich`.
- **Nếu migration đã dừng vì dữ liệu trùng**, Prisma ghi nó là "failed" và mọi lần `migrate deploy` sau báo `P3009` dù dữ liệu đã sửa (đã thử trên CSDL bẩn). Migration không tạo gì trước khi dừng, nên sau khi hủy hóa đơn thừa phải đánh dấu cuộn ngược rồi mới chạy lại `trien-khai.sh`:
  `docker compose run --rm -v "$(pwd)/prisma:/app/prisma" -e DATABASE_URL="$DATABASE_URL_OWNER" app npx prisma migrate resolve --rolled-back 20261014085000_toan_ven_tai_chinh`
#### Sửa sau QA độc lập (`npm run thu:qa-tv-van-hanh`, nối vào `thu:tich-hop`)
- `guiThuThu` (gửi thử chiến dịch) cũng gửi SMTP ngoài giao dịch, cùng mẫu `BuocGiaoDich`.
- Giới hạn tốc độ: kho bộ nhớ dự phòng có trần 10.000 khóa (trước đây phình không giới hạn và dọn O(n) mỗi lần đếm — 50.000 khóa lạ mất 46 giây); Redis hỏng thì rơi sang bộ nhớ NGAY (`enableOfflineQueue: false`) thay vì mỗi yêu cầu chờ ~2 giây, không còn "Unhandled error event".
- `sao-luu.sh` / `thu-phuc-hoi.sh` bị ngắt (TERM/INT/HUP) nay ghi trạng thái hỏng và báo động — trước đây trap EXIT thấy `$? = 0` nên im lặng như thành công. `thu-phuc-hoi.sh` đặt cờ xóa CSDL tạm trước khi tạo.
- `sao-luu.sh` chỉ xóa tệp `.dang-ghi` của chính nó (lần chạy chờ khóa quá hạn từng xóa tệp đang ghi của lần kia); hạn chờ khóa đổi được bằng `SAO_LUU_CHO_KHOA_GIAY`; cảnh báo khi máy không có `flock`.
- Trợ lý AI: phiên bị thu hồi / bắt đổi mật khẩu giữa lượt thì dừng ngay (401), không gọi mô hình thêm vòng nào.

## 0.16.0 — 13/10/2026 — Tích hợp CRM: khách hàng nâng cao, marketing & thu lead, email marketing, xác thực 2 lớp

Gộp ba gói: **Khách hàng nâng cao** (gói K), **Marketing và thu lead** (gói M), **Email marketing + xác thực 2 lớp + bản in báo giá** (gói E). **Chưa triển khai lên máy thật.** Cần biến môi trường mới `APP_ENC_KEY` (app và worker).

### Khách hàng nâng cao

Luật nghiệp vụ: `BUSINESS_RULES.md` mục 21 (KHN, CSV-01). Kiến trúc: `ARCHITECTURE.md` mục 7o. Quyết định QĐ-46 → QĐ-56. Migration `20261012030000_khach_hang_nang_cao`.

#### Thêm
- **Hành trình khách hàng**: danh mục trạng thái riêng của doanh nghiệp (tên, màu, thứ tự, loại đang theo / thành công / thất bại, số ngày "đứng lâu" tùy chọn) — tách hẳn khỏi trạng thái giao dịch hiện có. Mỗi lần đổi ghi một dòng lịch sử chỉ-ghi-thêm: từ, sang, ai, lúc nào, tự động hay đổi tay.
- **Tự chuyển bước theo nghiệp vụ**: tạo khách, mở cơ hội, gửi báo giá, thắng cơ hội, xác nhận đơn — chỉ tiến, không lùi; khách đã "thất bại" chỉ được báo giá / thắng cơ hội / đơn xác nhận kéo lại.
- Trang **Hành trình khách hàng**: kéo thả xếp trạng thái (điện thoại dùng nút ↑↓), sửa màu / mốc / số ngày đứng lâu, và **phễu chuyển đổi** theo kỳ tính từ lịch sử (bước xa nhất từng chạm, tỷ lệ so với tổng và so với bước trước, số ngày trung bình).
- **Danh sách khách hàng**: thẻ trạng thái kèm số khách, đổi hành trình ngay trên dòng, 7 lọc nhanh (của tôi, chưa có trạng thái, đứng lâu, sinh nhật trong tháng, có cơ hội mở, chưa tương tác, khách nóng), sắp xếp (gồm theo điểm), **bộ lọc đã lưu** cá nhân / dùng chung / mặc định, **tùy chọn cột** lưu theo người dùng.
- **Nhóm khách hàng** nhiều–nhiều, lọc theo nhóm; **thao tác hàng loạt** tối đa 500 khách: gắn / gỡ nhóm, đổi hành trình, đổi người phụ trách (vẫn theo KH-05).
- **Chấm điểm khách** 0–100 từ tín hiệu có thật, diễn giải từng phần trong Customer 360, trọng số ở Cấu hình (mặc định ghi rõ là mặc định), ngưỡng Nóng/Ấm do Giám đốc đặt — chưa đặt thì không xếp hạng. Điểm theo nguồn khách, nút "Tính lại toàn bộ".
- **Nhắc việc mới**: khách đứng lâu một trạng thái (ngưỡng riêng từng trạng thái, mỗi lần vào chỉ nhắc một lần), sinh nhật người liên hệ (thêm ngày sinh cho liên hệ).
- **Gộp khách trùng**: xem trước số bản ghi từng bảng, chuyển toàn bộ sang khách giữ lại trong một giao dịch, khách bị gộp giữ lại ở trạng thái "Đã gộp".
- **Xuất / nhập CSV khách hàng** gồm cả hành trình, nhóm, người phụ trách (email), ngày sinh liên hệ; xem trước rồi mới ghi, dò trùng theo KH-02/KH-03.
- **Bàn giao khi nhân viên nghỉ việc** ở trang người dùng: xem trước số việc từng loại, chuyển việc đang dở rồi khóa tài khoản.
- Trợ lý ITA thêm công cụ đọc `diem_hanh_trinh_khach`.
- **Script nhập từ ITW CRM** `scripts/nhap-tu-itw-crm.ts <itwcrm.db> [--ghi]`: mặc định chạy thử và in báo cáo; nhập trạng thái hành trình, nhóm, khách, liên hệ (kèm ngày sinh), tương tác, trạng thái hiện tại; dò trùng MST / điện thoại; gắn nhóm nhãn "ITW CRM"; chạy lại không nhân đôi (QĐ-55). Đã thử với CSDL mẫu của ITW CRM 1.8 (31 khách, 30 liên hệ, 30 tương tác).
- 6 bảng CSDL + 8 cột, 19 tệp route API, 5 màn hình mới (cùng danh sách khách, Customer 360 và trang người dùng được mở rộng), 3 mục menu.

#### Sửa
- Quy tắc nhắc "Khách lâu chưa mua lại" lọc khách theo `status = 'hoat-dong'` — giá trị không tồn tại trên khách hàng, nên quy tắc chưa từng sinh việc nào. Nay lọc "không ngừng giao dịch, không đã gộp".
- Thẻ chỉ số trong lưới bị lệch hàng (luật chung `.the + .the` đẩy thẻ thứ hai trở đi xuống 16px).

#### Sửa sau kiểm thử QA độc lập (`thu:qa-khach`, 135 kiểm chứng)
- **Xuất CSV chống chèn công thức** (CSV-01): ô bắt đầu bằng `= + - @`, tab, xuống dòng được thêm `'`. Sửa ở `taoCsv()` dùng chung nên xuất sản phẩm cũng an toàn.
- **Nhập CSV hỏng từ ~150 dòng** vì hết hạn giao dịch 5 giây: route theo lô (nhập CSV khách + sản phẩm, hàng loạt, tính lại điểm) chạy với hạn 120 giây; cấu hình chấm điểm đọc một lần mỗi giao dịch (QĐ-56). 2.000 dòng xem trước ~45 giây.
- **Gộp đồng thời tạo chuỗi gộp**: gộp nay khóa hai dòng khách theo thứ tự id rồi mới kiểm `da-gop`.
- **Thanh tìm kiếm toàn cục trả khách đã gộp** — nay ẩn.
- Gộp khách đóng việc hôm nay đang mở và chuyển thông báo chưa đọc của khách bị gộp; lọc nhanh "Đứng lâu" dùng chung hàm với máy quét; bàn giao báo rõ khi người nhận thiếu quyền xem một loại việc; script nhập ITW đi theo khách giữ lại khi trùng một khách đã gộp.

#### Quyết định đáng ghi
- **Trưởng phòng Kinh doanh được cấp `customer.approve`** (QĐ-46) để quản lý hành trình, nhóm, bộ lọc chung, gộp khách — không bắt cả phòng chờ Giám đốc.
- **Gộp khách đọc danh sách bảng từ catalog PostgreSQL** (QĐ-51): bảng sau này có khóa ngoại tới khách tự được chuyển, không bị sót.
- **Nhập CSV khách: mỗi dòng một SAVEPOINT, xem trước là chạy thật rồi cuộn ngược** (QĐ-54).
- Chấm điểm khách chứ chưa chấm lead (QĐ-49).

#### Kiểm thử
- Thêm `thu:khach-nang-cao` (bài tích hợp) và `thu/don-vi/khach-nang-cao.test.ts` (29 bài đơn vị). Bài gộp khách đếm từng bảng có khóa ngoại tới khách (liệt kê bằng `information_schema`) trước và sau khi gộp.

### Marketing và thu lead

Luật nghiệp vụ: `BUSINESS_RULES.md` mục 22 (MK). Kiến trúc: `ARCHITECTURE.md` mục 7p. Quyết định QĐ-57 → QĐ-66. Migration `20261012044827_marketing_thu_lead`.

#### Thêm
- **Chiến dịch marketing** (`CD-2026-0001`): kênh, thời gian, ngân sách, người phụ trách, mã `utm_campaign`; chi phí thực tế theo ngày / khoản (hủy kèm lý do, không xóa). Chỉ số **CPL, ROAS, tỷ lệ đủ điều kiện, tỷ lệ chuyển đổi** — chưa có mẫu số thì để trống, không ghi 0.
- **Duyệt ngân sách**: chiến dịch có ngân sách phải được Trưởng phòng Marketing / Giám đốc duyệt trước khi chạy; tăng ngân sách khi đang chạy thì tự về chờ duyệt. Chốt bằng CHECK trong CSDL.
- **Một cửa nhận lead** `nhanLead()`: form công khai, landing page, webhook và nhập tay cùng chuẩn hóa, dò trùng (trùng lead đang mở → ghi thêm, không đẻ lead mới; trùng khách → lead mới gắn cảnh báo, giao người phụ trách khách), gắn chiến dịch theo UTM, **chia sale vòng tròn**, tạo việc “Gọi lại” có hạn theo Cấu hình, báo chuông. Mọi lần nhận — kể cả bị từ chối — vào nhật ký chỉ-ghi-thêm.
- **Form đăng ký công khai** `/f/<mã doanh nghiệp>/<slug>`: chọn trường từ danh mục an toàn, câu hỏi đồng ý nhận tin (không tích sẵn), lời cảm ơn, nhận UTM, mã nhúng iframe; chống spam bằng giới hạn tốc độ, ô bẫy, trần độ dài.
- **Webhook nhận lead** cho Facebook Lead Ads (qua Zapier / Make), Zalo, website khác: khóa bí mật theo nguồn, hiện một lần, đổi / thu hồi được; nhật ký nhận / từ chối.
- **Phân khúc** lead hoặc liên hệ khách theo nguồn, chiến dịch, giai đoạn, phân khúc / ngành / loại khách, tỉnh thành, đã đồng ý nhận tin…; xem trước số lượng và mẫu. Cửa `danhSachTheoPhanKhuc()` cho gói Email marketing.
- **Đồng ý / từ chối nhận tin** trên lead và liên hệ (`marketing_opt_in`, `marketing_opt_in_at`, `marketing_opt_out_at`, `marketing_consent_source`); ghi nhận trên trang lead.
- **Landing page** `/lp/<mã doanh nghiệp>/<slug>` dựng từ 8 loại khối an toàn (tiêu đề, đoạn văn, ảnh https, lợi ích, nút gọi, form, hỏi đáp, lời khách), xuất bản / ẩn, **thử A/B** hai biến thể, thống kê lượt xem và tỷ lệ đăng ký.
- Thực tập sinh Marketing bị **che SĐT / email** ở mọi màn hình và API marketing mới.
- Khối **Marketing tháng này** trên Bảng điều hành (lead theo nguồn, CPL, chiến dịch nhiều lead nhất); khối **Nguồn marketing** trên trang lead.
- Ngưỡng mới trong Cấu hình: `marketing.phut_goi_lai_lead` (chưa đặt).
- 8 bảng CSDL + cột mới trên `leads`, `contacts`, `customers`, `opportunities`; 36 CHECK; 23 route API nội bộ + 2 route công khai; 16 màn hình nội bộ + 2 trang công khai (form, landing).

#### Quyết định đáng ghi
- **Một hàm nhận lead cho mọi kênh**, nhận `tx` thay vì phiên người dùng vì khách ngoài không đăng nhập (QĐ-57).
- **Tenant giải từ mã doanh nghiệp trên đường dẫn trước khi chạm dữ liệu** (QĐ-61); chỉ trang form được nhúng iframe, POST vẫn kiểm Origin, không mở CORS (QĐ-62); webhook xác thực bằng khóa nên miễn kiểm Origin (QĐ-63).
- **ROAS tính theo hóa đơn đã phát hành của khách mới** do chiến dịch mang về (QĐ-59).
- **Che liên lạc theo quyền**, không theo tên vai trò (QĐ-65).

#### Sửa sau kiểm thử độc lập (QA 12/10)
- **Gửi đồng thời không còn đẻ hai lead** cho cùng một SĐT / email: khóa tư vấn theo giá trị chuẩn hóa trước bước dò trùng, áp cả cho lead sale tạo tay.
- **Lead dự phòng chỉ về người có quyền xem lead**; Thực tập sinh Marketing không còn nhận lead. Mô tả việc "Gọi lại" **không chép SĐT / email** nữa.
- **Từ chối nhận tin luôn thắng** qua mọi kênh công khai: không xóa lời từ chối, lead mới kế thừa lời từ chối, kèm ghi chú "cần xác nhận lại".
- Ký tự NUL / điều khiển → 400 thay vì 500; slug / mã sai khuôn → 404 không truy vấn; trần thân yêu cầu tính theo byte; lượt xem form / landing có trần theo IP.

#### Kiểm thử
- 339 bài đơn vị (thêm 30), 997 bài tích hợp (thêm `thu:marketing` 103 bài và `thu:qa-marketing` 122 bài), 434 bài HTTP đầu-cuối + 107 bài `thu:qa-marketing-http` — tất cả đạt.

### Email marketing và xác thực 2 lớp

Luật nghiệp vụ: `BUSINESS_RULES.md` mục 23 (EM) và 24 (XT). Kiến trúc: `ARCHITECTURE.md` mục 7q, 7r.
Quyết định QĐ-67 → QĐ-76. Migration `20261012090000_email_marketing_2_lop`. Cần biến môi trường mới `APP_ENC_KEY` cho cả app và worker.

#### Thêm
- **Kết nối email** (Quản trị): máy chủ SMTP, cổng, mã hóa, tài khoản, người gửi, địa chỉ trả lời; nút gợi ý cho Gmail/Google Workspace (mật khẩu ứng dụng), Microsoft 365, SendGrid, Mailgun, Amazon SES; **Gửi thư thử** tới email của người đang đăng nhập. Mật khẩu **mã hóa** trước khi lưu, không bao giờ hiện lại.
- **Mẫu email** soạn bằng khối an toàn — tiêu đề, đoạn văn, nút liên kết, ảnh, danh sách, đường ngăn cách — không có ô nào nhận HTML. Biến `{{ten}}`, `{{cong_ty}}`, `{{email}}`, `{{cong_ty_gui}}`. Xem trước dựng ở máy chủ, gửi thử tới chính mình.
- **Chiến dịch email** (`EM-2026-0001`): chọn mẫu + người nhận (lead theo nguồn, giai đoạn; liên hệ theo nguồn, phân khúc, ngành) → đếm trước (đã loại người từ chối, email hỏng, trùng) → **gửi duyệt** → người có quyền duyệt marketing đưa vào hàng gửi → máy gửi dần theo tốc độ ở Cấu hình. Tạm dừng / tiếp tục / huỷ; thống kê đã gửi, lỗi, mở, bấm, huỷ nhận tin; mỗi người nhận một dòng trạng thái kèm lý do.
- **Huỷ nhận tin một chạm**: liên kết ký HMAC trong chân thư, trang `/huy-nhan-tin/…`, và tiêu đề `List-Unsubscribe` + `List-Unsubscribe-Post` để Gmail/Outlook huỷ ngay trong hộp thư. Cột `marketing_opt_out_at` mới trên lead và liên hệ.
- **Theo dõi mở / bấm** (bật ở Kết nối email). Bấm chỉ chuyển tới liên kết có thật trong thư.
- Gửi thành công ghi tương tác `email` vào dòng thời gian lead / khách.
- **Bản in báo giá theo mẫu ITW**: logo công ty (Hồ sơ công ty — PNG/JPEG/WebP ≤ 512 KB, kiểm byte đầu như tệp đính kèm, không nhận SVG), đầu trang công ty, dải tiêu đề "BẢNG BÁO GIÁ", khối khách hàng, bảng hàng có mã SP + VAT từng dòng, khối tổng + bằng chữ, điều khoản đánh số + thông tin chuyển khoản, ký tên hai bên. Vẫn in bằng trình duyệt (QĐ-21).
- **Xác thực 2 lớp** (TOTP): tự bật ở Tài khoản của tôi, 10 mã khôi phục dùng một lần, đăng nhập hai bước; Quản trị chọn vai trò bắt buộc và đặt lại cho người mất điện thoại.
- 7 bảng CSDL (22 CHECK + 1 trigger chỉ-ghi-thêm) + 7 cột trên `users` / `leads` / `contacts`, 28 route API (3 công khai), 10 màn hình + mục 2 lớp ở Tài khoản của tôi và bước 2 ở Đăng nhập, 2 ngưỡng Cấu hình.

#### Quyết định đáng ghi
- Thêm **`nodemailer`** (QĐ-67) — thư viện gửi thư đã qua kiểm chứng thay vì tự viết SMTP.
- **Khóa mã hóa riêng `APP_ENC_KEY`** cho bí mật lưu trong CSDL, tách khỏi `AUTH_SECRET` (QĐ-68).
- **Gửi tối đa một lần** (QĐ-70): máy dừng giữa chừng thì ghi lỗi chứ không gửi lại — khách nhận hai thư tệ hơn thiếu một thư.
- **Nguồn người nhận là chỗ cắm** (QĐ-71) — phân khúc của gói Marketing cắm vào sau, không sửa chiến dịch.
- TOTP tự viết, chưa có mã QR (QĐ-72).

#### Sửa sau kiểm thử đối kháng (QA độc lập, 13/10)
- **Phân loại lỗi SMTP**: chỉ đưa người nhận vào danh sách chặn khi lỗi ở RCPT có mã 5.1.x / 5.2.1 (hoặc 550/551/553 nói rõ người nhận không tồn tại). Hết hạn mức Gmail (5.4.5), M365 5.7.60 / 5.7.708, SPF/relay, mọi 4xx, mọi lỗi ở MAIL FROM / DATA → trả thư về hàng chờ, tự tạm dừng kèm lý do tiếng Việt. Trước đó một lần Gmail hết hạn mức chặn vĩnh viễn cả danh sách.
- Nhiều worker cùng lúc không còn vượt tốc độ gửi: đếm + nhận việc dưới `pg_advisory_xact_lock`.
- `APP_ENC_KEY` thiếu / sai / bản mã hỏng → lỗi 503 `khoa-ma-hoa-khong-khop` nói rõ phải làm gì (thư thử, bật 2 lớp); worker tự tạm dừng chiến dịch; bước 2 đăng nhập trả câu chung, log máy chủ ghi rõ.
- Biến `{{constructor}}`, `{{__proto__}}`… không còn lọt danh sách trắng (`Object.hasOwn`).
- Hồ sơ công ty mất địa chỉ sau khi duyệt → worker tự tạm dừng, không gửi thư thiếu chân thư.
- Tắt 2 lớp / sinh lại mã khôi phục dùng chung hàng rào với bước 2 đăng nhập (giới hạn tốc độ + khóa tài khoản).
- Đăng nhập 2 bước đúng thì xoá bộ đếm tốc độ; phiên tạm chỉ dùng được một lần.

#### Kiểm thử
- 386 bài đơn vị, 1.030 bài tích hợp (gồm `thu:qa-email` 124 bài của QA), 434 bài HTTP + 75 bài HTTP đối kháng (`thu:qa-email-http`) — tất cả đạt.
- (Trước QA) 376 bài đơn vị (thêm 67: vector chuẩn RFC 4226 / RFC 6238, mã hóa, khối an toàn, lọc người nhận, mã ký liên kết, lỗi SMTP), 906 bài tích hợp (thêm `thu:email` 91 bài — nodemailer thật vào máy chủ SMTP giả — và `thu:xac-thuc-2-lop` 43 bài) — tất cả đạt.

### Sau khi gộp các gói

- **Đợt gửi email chọn được người nhận theo phân khúc Marketing** (chỉ người đã đồng ý và chưa từ chối; cần quyền sửa Marketing).
- **Sửa lỗi chéo M×E**: hủy nhận tin qua liên kết trong thư với người đã đồng ý ở Marketing bị CSDL từ chối (CHECK cấm đồng ý và từ chối cùng bật) — nay tắt luôn cờ đồng ý. Form công khai coi email đã hủy trong thư là đã từ chối (không bật lại đồng ý).
- Một cột `marketing_opt_out_at` dùng chung cho Marketing và Email (migration email đổi thành `ADD COLUMN IF NOT EXISTS`).
- Menu Marketing gộp một nhóm; tách tên **"Chiến dịch marketing"** (ngân sách, UTM, CPL/ROAS) và **"Đợt gửi email"**.
- Nguồn người nhận "liên hệ" của email bỏ cả khách đã gộp.
- **Bàn giao khi nghỉ việc chuyển cả việc Marketing**: chiến dịch chưa kết thúc, form / nguồn webhook / phân khúc đang dùng, landing nháp / đang xuất bản, và suất nhận lead vòng tròn (người nhận chưa có suất thì nhận nguyên suất, đã có thì suất người nghỉ tạm dừng).
- **Gộp khách mang theo chiến dịch chạm đầu tiên** sang khách giữ lại khi khách giữ lại chưa có; lead "trùng khách" (`matched_customer_id`) tự chuyển theo nhờ gộp đọc khóa ngoại từ catalog.
- **Nhận lead trùng SĐT / email của khách đã gộp** gắn khách giữ lại và giao người phụ trách khách đó (trước khi sửa: gắn vào khách đã gộp).
- Xuất CSV khách thêm cột **"Liên hệ nhận tin"** (Đồng ý / Từ chối); nhập CSV không bao giờ bật đồng ý nhận tin.

### Kiểm thử (bản gộp)

- Bản gộp `release/0.16` (K + M + E): **448 bài đơn vị**, **1.562 kiểm chứng tích hợp** trong 26 bộ của `thu:tich-hop` (gồm `thu:khach-nang-cao` 140, `thu:qa-khach` 135, `thu:marketing` 103, `thu:qa-marketing` 122, `thu:email` 91, `thu:xac-thuc-2-lop` 43, `thu:qa-email` 124 và hai bài mới cho tương tác chéo: `thu:gop-k-m` 17, `thu:gop-m-e` 15). Trên bản dựng production: **434 bài `thu:http`**, **107 bài `thu:qa-marketing-http`**, **75 bài `thu:qa-email-http`** — tất cả đạt.
- `prisma migrate diff --from-migrations … --to-schema …` trên CSDL tạm: rỗng (lược đồ khớp tổng ba migration). Diễn tập cài mới trên CSDL trống: 18 migration + `rls.sql` + seed chạy sạch.
- `db:seed:mau` chạy hết (sửa bước đọc đơn mẫu bằng tài khoản thiếu `order.view`).

## 0.15.0 — 22/09/2026 — Tệp đính kèm

Luật nghiệp vụ: `BUSINESS_RULES.md` mục 20 (DK).
**Chưa triển khai lên máy thật.**

### Thêm
- **Đính tệp vào chứng từ**: hóa đơn nhà cung cấp, phiếu khách trả hàng, phiếu trả nhà cung cấp, phiếu chuyển kho, đơn hàng, phiếu hỗ trợ. Khối `Tệp đính kèm` dùng chung một component cho mọi trang.
- **Chặn tệp xấu bằng nội dung thật sự**, không tin đuôi tên hay `Content-Type`: danh sách trắng PDF/ảnh/Word/Excel/CSV/văn bản, khớp vài byte đầu với đuôi tên. Không nhận SVG, HTML, zip.
- **Nội dung tệp nằm trên đĩa**, không trong CSDL — `scripts/sao-luu.sh` đóng gói riêng thành `.tar.gz`.
- Gỡ tệp là xóa mềm, bắt buộc ghi lý do; tải về kiểm lại mã băm SHA-256 trước khi trả về.
- 1 bảng CSDL + 6 CHECK, 4 route API, 1 component dùng chung, gắn vào 5 loại trang chứng từ.

### Quyết định đáng ghi
- **Không có mã quyền riêng cho tệp đính kèm** (QĐ-44): mượn nguyên quyền và phạm vi của chứng từ chủ. Một mã quyền riêng sẽ tách rời khỏi phạm vi dữ liệu thật của chứng từ và dễ thành cửa sau.
- **Nhận dạng tệp theo byte đầu, không theo đuôi tên hay Content-Type** (QĐ-45): đây là chỗ duy nhất hệ thống nhận byte từ người ngoài và cất lên đĩa máy chủ.

### Kiểm thử
- 309 bài đơn vị, 772 bài tích hợp (thêm `thu:dinh-kem` 30 bài), 434 bài HTTP đầu-cuối — tất cả đạt.
- Diễn tập cài mới trên CSDL rỗng: 15 migration chạy sạch, RLS phủ đủ mọi bảng có `tenant_id`.

## 0.14.1 — 21/09/2026 — Hiện phiên bản đang chạy

**Chưa triển khai lên máy thật.**

### Thêm
- **Máy chủ nói được nó đang chạy bản nào**: số phiên bản, **mã bản dựng** và thời điểm dựng, hiện ở *Quản trị → Cấu hình* và ở `GET /api/v1/phien-ban`.
- `trien-khai.sh` in phiên bản và mã bản dựng ở dòng cuối, ngay sau khi triển khai xong.

### Vì sao
Ngày 21/09 mất gần một buổi chỉ vì không ai trả lời được câu "máy thật đang chạy bản nào". Dò từ ngoài không ra: proxy đẩy **mọi** đường dẫn chưa đăng nhập về `/dang-nhap`, kể cả đường không tồn tại, nên mã 307 không chứng minh được route nào có thật; `/api/khoe` thì không trả phiên bản.

**Mã bản dựng** mới là thứ trả lời đúng câu hỏi: nó đổi mỗi lần dựng lại, nên nói được *mã đang chạy có đúng là mã vừa gửi lên không*. Hai bản dựng khác nhau vẫn có thể cùng số phiên bản.

### Quyết định đáng ghi
- Đường dẫn phiên bản **có đăng nhập**, khác `/api/khoe` mở công khai. Phiên bản không phải bí mật, nhưng đây là phần mềm nội bộ — không có lý do gì để người chưa đăng nhập biết máy chủ đang chạy bản nào. Đọc ở máy chủ bằng `node:fs`, không nhúng vào gói JavaScript gửi xuống trình duyệt.

### Kiểm thử
- Thêm 6 bài HTTP (tổng 414), trong đó có một bài canh đúng điều trên: `/api/khoe` công khai **không** được chứa số phiên bản.

## 0.14.0 — 21/09/2026 — Chuyển kho nội bộ

Luật nghiệp vụ: `BUSINESS_RULES.md` mục 19 (CK).
**Chưa triển khai lên máy thật** — đợt trước (0.3.0 → 0.13.0) đã lên ngày 21/09.

### Thêm
- **Phiếu chuyển kho** (`CK-2026-0001`): điều hàng giữa hai kho. Vòng đời Nháp → Đang trên đường → Đã nhận, hoặc Đã hủy.
- **Hàng đang trên đường được nói thẳng**: xuất khỏi kho nguồn thì tồn nguồn giảm ngay, tồn đích chưa tăng, và màn hình ghi rõ đang có bao nhiêu hàng chưa tới nơi. Không cho tồn nhảy tức thì giữa hai kho.
- **Nhận thiếu phải ghi lý do**, kể cả nhận 0. Phiếu giữ lại số xuất, số nhận và lý do chênh lệch.
- **Sê-ri có trạng thái `dang-chuyen`**: máy đang trên đường không thuộc kho nào — nói nó còn ở kho nguồn hay đã ở kho đích đều là nói sai.
- 2 bảng CSDL + 1 cột trên `serial_numbers`, 5 route API, 3 màn hình.

### Quyết định đáng ghi
- **Hai bước thay vì một** (QĐ-43): gộp lại thì khi hàng thiếu lúc tới nơi không còn chỗ nào để ghi, và tồn hai kho cùng đúng ở một thời điểm mà thực tế hàng đang nằm trên xe.

### Kiểm thử
- 285 bài đơn vị, 742 bài tích hợp (thêm `thu:chuyen-kho` 40 bài), 408 bài HTTP đầu-cuối — tất cả đạt.
- Diễn tập cài mới trên CSDL rỗng: 14 migration chạy sạch, RLS phủ đủ mọi bảng có `tenant_id`.
- Đối soát kho chạy lại khi hàng đang trên đường và sau khi nhận thiếu — vẫn khớp.

## 0.13.0 — 21/09/2026 — Trả hàng và đổi máy

Luật nghiệp vụ: `BUSINESS_RULES.md` mục 18 (TH).
**Đã triển khai lên `thegioitinhoc.io.vn` ngày 21/09/2026**, cùng đợt 0.3.0 → 0.13.0 (`VD-101`).

### Thêm
- **Phiếu khách trả hàng** (`TH-2026-0001`): lập từ đơn đã giao (điền sẵn phần còn trả được) hoặc lập lẻ. Vòng đời Nháp → Đã nhận lại hàng → Đã chốt tiền, hoặc Đã hủy.
- **Đổi máy trong bảo hành**: máy cũ về kho hoặc để riêng, máy mới xuất đi, sê-ri đổi trạng thái — và **bảo hành chuyển sang máy mới mà giữ nguyên mốc hết hạn**. Phiếu đổi máy có giá trị 0, không phát sinh tiền.
- **Phiếu trả hàng nhà cung cấp** (`TM-2026-0001`): đối xứng hoàn toàn, chỉ đổi chiều hàng và chiều nợ.
- **Giảm trừ công nợ hai chiều**: giá trị hàng trả trừ thẳng vào hóa đơn còn nợ. Tiền không đi qua quỹ, nên phiếu thu và phiếu chi giữ nguyên — màn hình nói rõ đâu là tiền về, đâu là nợ xóa bằng hàng.
- **Hàng lỗi không tự quay lại kệ bán**: hàng còn tốt mặc định cộng lại tồn, hàng lỗi mặc định không; muốn vẫn nhập lại thì phải ghi rõ vì sao.
- 6 bảng CSDL + 1 cột trên `serial_numbers`, 12 route API, 6 màn hình, và nút *Khách trả hàng* / *Trả hàng nhà cung cấp* trên trang đơn bán và đơn mua.

### Sửa
- `congNo()` tách **tiền đã thu** khỏi **phần giảm trừ bằng hàng** thay vì cộng gộp, để màn hình không nói nhầm là khách đã trả tiền. Tham số thứ tư đổi thành một đối tượng tùy chọn; mọi chỗ tính nợ (hóa đơn bán, hóa đơn mua, bảng điều hành, nhắc việc) cùng đi qua đường này.
- Thêm `yeuCauMotTrongCacQuyen()` cho trang cần nhiều vai trò cùng nhìn, thay vì nới quyền của từng vai.

### Quyết định đáng ghi
- **Đổi máy không làm mới đồng hồ bảo hành** (QĐ-40): bảo hành thuộc về lần mua, không thuộc về cái máy. Tính lại từ ngày đổi là tự ý cam kết thêm với khách mà không ai duyệt.
- **Hàng đi trước, tiền chốt sau** (QĐ-41): hai bước, hai quyền khác nhau. Gộp một bước thì chỉ Giám đốc bấm được, vì không vai trò dựng sẵn nào cầm cả quyền kho lẫn quyền duyệt tài chính.

### Kiểm thử
- 264 bài đơn vị, 702 bài tích hợp (thêm `thu:tra-hang` 73 bài), 382 bài HTTP đầu-cuối — tất cả đạt.
- Diễn tập cài mới trên CSDL rỗng: 13 migration chạy sạch, RLS phủ đủ mọi bảng có `tenant_id`.
- Đối soát kho chạy lại sau mỗi lần trả hàng hai chiều và vẫn khớp.

## 0.12.0 — 21/09/2026 — Công nợ phải trả

Luật nghiệp vụ: `BUSINESS_RULES.md` mục 17 (CT).
**Đã triển khai lên `thegioitinhoc.io.vn` ngày 21/09/2026**, cùng đợt 0.3.0 → 0.13.0 (`VD-101`).

### Thêm
- **Hóa đơn nhà cung cấp** (`HM-2026-0001`): lập từ đơn mua đã gửi (chép dòng, giữ liên kết tới dòng đơn) hoặc nhập tay cho khoản lẻ. Vòng đời Nháp → Đã ghi nhận → (Đã hủy).
- **Phiếu chi** (`PC-2026-0001`): một phiếu trừ cho nhiều hóa đơn; hủy phiếu giữ lại bản ghi kèm lý do và trả nợ về đúng như trước.
- **Công nợ phải trả** theo nhà cung cấp kèm bảng tuổi nợ — **dùng chung đúng hàm tính** của công nợ phải thu, nên hai chiều nợ không lệch cách tính.
- **Đối chiếu ba chiều** ngay trên hóa đơn: đơn mua đặt bao nhiêu, kho đã nhận bao nhiêu, hóa đơn đòi bao nhiêu — cảnh báo khi lệch, trước lúc ghi nhận.
- 4 bảng CSDL, 8 route API, 4 màn hình (hóa đơn nhà cung cấp: danh sách / chi tiết; công nợ phải trả; phiếu chi), nút *Ghi hóa đơn nhà cung cấp* trên trang đơn mua.

### Sửa
- `congNo()` nhận thêm tham số trạng thái tính nợ thay vì gắn cứng "ISSUED", để hóa đơn nhà cung cấp ("RECORDED") dùng lại đúng công thức đó. Không viết hàm thứ hai để hai chiều nợ trôi khỏi nhau.

### Quyết định đáng ghi
- **Hạn thanh toán bắt buộc nhập**, không suy từ ngưỡng nào của hệ thống: hạn do nhà cung cấp ghi trên hóa đơn. Cũng nhờ vậy phần này không mở thêm một mục chờ Giám đốc đặt ngưỡng (QĐ-38).

### Kiểm thử
- 241 bài đơn vị, 629 bài tích hợp (thêm `thu:cong-no-tra` 47 bài), 342 bài HTTP đầu-cuối — tất cả đạt.
- Diễn tập cài mới trên CSDL rỗng: 12 migration chạy sạch, RLS phủ đủ mọi bảng có `tenant_id`.

## 0.11.0 — 21/09/2026 — Mua hàng (phần để lại từ Phase 5)

Luật nghiệp vụ: `BUSINESS_RULES.md` mục 16 (MH).
**Đã triển khai lên `thegioitinhoc.io.vn` ngày 21/09/2026**, cùng đợt 0.3.0 → 0.13.0 (`VD-101`).

### Thêm
- **Đề nghị mua** (`DN-2026-0001`): ai cần gì, vì sao, cần trước ngày nào. Vòng đời Nháp → Chờ duyệt → Đã duyệt → Đã đặt hàng, hoặc Bị từ chối / Đã hủy. Người đề nghị không tự duyệt.
- **Đơn mua** (`DM-2026-0001`): đặt nhà cung cấp, chọn kho nhận, chốt giá và VAT. Gửi đi rồi thì khóa dòng hàng.
- **Nhận hàng** (`NK-2026-0001`): nhận nhiều lần cho một đơn; hàng vào kho bằng **đúng `ghiSoKho()`** mà bán hàng dùng để xuất, nên tồn kho và sổ cái không bao giờ lệch. Hàng theo sê-ri phải khai đủ sê-ri.
- **Gợi ý mua từ đơn bán thiếu hàng**: mở đơn bán, bấm *Đề nghị mua*, hệ thống điền sẵn đúng phần kho không đủ để giao.
- 6 bảng CSDL, 12 route API, 6 màn hình (đề nghị: danh sách / chi tiết / lập mới; đơn mua: danh sách / chi tiết / lập mới).
- Ô tìm sản phẩm tách thành component dùng chung `OTimSanPham`; bảng hàng báo giá dùng lại nó thay vì giữ bản sao riêng.

### Sửa
- **Định nghĩa vai trò không khớp migration.** Cấp bù quyền trong migration chỉ chạm doanh nghiệp **đang có**; doanh nghiệp tạo mới lấy quyền từ `src/lib/vai-tro.ts`. Phase 7 cấp `finance.view`/`finance.export` cho Trưởng phòng Kinh doanh bằng migration mà quên sửa định nghĩa, nên tenant mới thiếu quyền đó. Nay sửa cả hai chỗ, và bài thử kiểm chứng hai chỗ khớp nhau.

### Quyết định đáng ghi
- Quyền duyệt đề nghị mua giao cho **Kế toán – Tài chính**, không phải Trưởng phòng Kinh doanh: duyệt chi tiền là việc của tài chính, và vai trò Kế toán vốn đã có `purchasing.view` nên cấp thêm `approve` mới thành một bộ dùng được (QĐ-35).
- **Phiếu nhận hàng không có đường hủy** — ghi sai thì điều chỉnh tồn kèm lý do, giữ sổ cái kho là sổ chỉ ghi thêm (QĐ-36).

### Kiểm thử
- 241 bài đơn vị, 582 bài tích hợp (thêm `thu:mua-hang` 68 bài), 314 bài HTTP đầu-cuối — tất cả đạt.
- Diễn tập cài mới trên CSDL rỗng: 11 migration chạy sạch, RLS phủ đủ mọi bảng có `tenant_id`.
- Đối soát kho chạy lại sau mỗi lần nhận hàng và vẫn khớp — chứng minh mua hàng không phá bất biến tồn kho của Phase 5.

## 0.10.0 — 21/09/2026 — Phase 9: Trợ lý AI

Căn cứ: prompt triển khai 36 mục, mục 25–30. Thiết kế: `AI_ARCHITECTURE.md`. Luật nghiệp vụ: `BUSINESS_RULES.md` mục 15 (AI).
**Đã triển khai lên `thegioitinhoc.io.vn` ngày 21/09/2026**, cùng đợt 0.3.0 → 0.13.0 (`VD-101`). **Chưa có khóa API**: trợ lý báo rõ là chưa dùng được cho tới khi Giám đốc cấp khóa (`VD-109`).

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
**Đã triển khai lên `thegioitinhoc.io.vn` ngày 21/09/2026**, cùng đợt 0.3.0 → 0.13.0 (`VD-101`).

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
**Đã triển khai lên `thegioitinhoc.io.vn` ngày 21/09/2026**, cùng đợt 0.3.0 → 0.13.0 (`VD-101`).

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
**Đã triển khai lên `thegioitinhoc.io.vn` ngày 21/09/2026**, cùng đợt 0.3.0 → 0.13.0 (`VD-101`).

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
**Đã triển khai lên `thegioitinhoc.io.vn` ngày 21/09/2026**, cùng đợt 0.3.0 → 0.13.0 (`VD-101`).

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
**Đã triển khai lên `thegioitinhoc.io.vn` ngày 21/09/2026**, cùng đợt 0.3.0 → 0.13.0 (`VD-101`).

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
**Đã triển khai lên `thegioitinhoc.io.vn` ngày 21/09/2026**, cùng đợt 0.3.0 → 0.13.0 (`VD-101`).

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
**Đã triển khai lên `thegioitinhoc.io.vn` ngày 21/09/2026**, cùng đợt 0.3.0 → 0.13.0 (`VD-101`). Xem thêm "Vấn đề đã biết".

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
