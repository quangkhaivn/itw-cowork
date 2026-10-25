# Hướng dẫn gửi email marketing số lượng lớn qua Amazon SES

Dành cho chủ tên miền **itwonline.com** (người tự thêm bản ghi DNS tại nhà đăng ký / nơi quản lý DNS của mình) và người quản trị TGTH Business Cowork. Áp dụng từ bản **0.18.0**. Luật chi tiết: `BUSINESS_RULES.md` mục 29.

Thư marketing gửi từ tên miền con riêng **`tin.itwonline.com`** (ví dụ `tin@tin.itwonline.com`) để uy tín gửi hàng loạt không ảnh hưởng tới thư giao dịch hằng ngày của `itwonline.com`.

Việc chia làm hai phần:

| Phần | Khi nào | Ai làm |
|---|---|---|
| **A. Làm ngay** | Bây giờ, chưa cần tài khoản AWS | Chủ tên miền (DNS) + quản trị Cowork |
| **B. Sau khi có AWS** | Khi đã mở tài khoản Amazon Web Services | Chủ tên miền (DNS) + người giữ tài khoản AWS + quản trị Cowork |

Trong lúc chưa có AWS, Cowork vẫn gửi bằng hộp thư SMTP hiện tại và **mọi luật mới đều chạy**: sổ đồng ý, nhãn `[QC]`, tối đa 3 thư/địa chỉ/24 giờ, thư xác nhận từ chối, khởi động (warm-up), báo cáo theo tên miền nhận, tự tạm dừng khi thư bị trả lại nhiều.

> Tên nút / tên mục trong bảng điều khiển AWS thay đổi theo thời gian. Chỗ nào hướng dẫn này không chắc tên chính xác thì mô tả việc cần làm — tìm mục có nghĩa tương ứng.

---

## A. Làm ngay (không cần AWS)

### A1. Khai tên miền gửi trong Cowork

1. Đăng nhập Cowork bằng tài khoản có quyền Quản trị → **Quản trị → Kết nối email**.
2. Ở khung **Tên miền gửi**: nhập `tin.itwonline.com`; ô **Hộp thư nhận báo cáo DMARC**: một hộp thư có thật, ví dụ `dmarc@itwonline.com` (nên là hộp thư riêng vì sẽ nhận nhiều thư báo cáo tự động).
3. Bấm **Lưu kết nối**. Phía dưới hiện bảng **Bản ghi DNS của tên miền gửi**, chia hai phần "Làm ngay" và "Sau khi có tài khoản AWS".

### A2. Thêm bản ghi DMARC

Tại nơi quản lý DNS của `itwonline.com`, thêm **một** bản ghi:

| Loại | Tên (host) | Giá trị |
|---|---|---|
| TXT | `_dmarc.tin.itwonline.com` | `v=DMARC1; p=none; rua=mailto:dmarc@itwonline.com; fo=1` |

- Nhiều nơi quản lý DNS tự thêm tên miền gốc vào cuối ô "Tên" — khi đó chỉ nhập **`_dmarc.tin`**. Nếu sau khi lưu, ô hiển thị `_dmarc.tin.itwonline.com.itwonline.com` là đã nhập thừa.
- `p=none` = **chỉ quan sát**: không thư nào bị chặn vì DMARC, chỉ nhận báo cáo. Sau 3–4 tuần gửi ổn định (DKIM và SPF đều đạt trong báo cáo) mới cân nhắc nâng lên `p=quarantine`.
- Mỗi tên (host) chỉ được **một** bản ghi DMARC.
- Hộp thư `rua` cùng tên miền gốc `itwonline.com` nên không cần bước "ủy quyền nhận báo cáo" cho tên miền khác.

### A3. Kiểm tra

Quay lại **Kết nối email → Bản ghi DNS của tên miền gửi → Kiểm tra**. Bản ghi mới có thể mất từ vài phút tới vài giờ mới tra thấy. Trạng thái:

| Hiện | Nghĩa |
|---|---|
| ✓ Đúng | Bản ghi đã có và đúng giá trị |
| ✗ Sai giá trị | Có bản ghi nhưng giá trị khác — xem dòng "Đang thấy" |
| ✗ Chưa có | Chưa tra thấy bản ghi |
| ? Không tra được | DNS không trả lời lúc này — thử lại sau |
| — Chưa khai | Chưa có dữ liệu để tra (mã DKIM chỉ có sau phần B) |

Ở phần A, chỉ cần dòng DMARC **✓ Đúng**. Các dòng "Sau khi có AWS" hiện ✗ / "Chưa khai" là bình thường.

### A4. Chuẩn bị danh sách người nhận (sổ đồng ý)

Từ 0.18.0, duyệt chiến dịch chỉ lấy người **có đồng ý** trong **Marketing → Sổ đồng ý email**.

- Khách tự tích ô đồng ý trên form đăng ký của Cowork → tự vào sổ.
- Danh sách đồng ý có sẵn (phiếu hội thảo, form giấy…) → **Nhập CSV** với 4 cột `Email; Nguồn; Căn cứ; Thời điểm` (Excel: *Lưu thành → CSV UTF-8*). Bấm **Đọc thử** trước, rồi **Nhập vào sổ**.
- Không nhập những địa chỉ không có căn cứ đồng ý (mua danh sách, thu thập từ website khác…): vừa trái NĐ 91/2020, vừa làm tỷ lệ báo rác tăng — Amazon SES có thể khóa tài khoản.

---

## B. Sau khi có tài khoản AWS

### B1. Tạo tài khoản AWS

1. Đăng ký tại trang chủ Amazon Web Services bằng một email công ty (không dùng email cá nhân của nhân viên), khai thẻ thanh toán.
2. Bật **xác thực nhiều lớp (MFA)** cho tài khoản gốc (root) ngay sau khi tạo.
3. Tạo một người dùng quản trị riêng (IAM / IAM Identity Center) để làm việc hằng ngày; cất tài khoản gốc.
4. Đặt **cảnh báo chi phí** (Billing → Budgets) — ví dụ báo khi vượt 20 USD/tháng. Ở quy mô dưới 100.000 thư/tháng, chi phí SES thường chỉ vài USD/tháng.

### B2. Mở Amazon SES ở vùng Singapore

Trong bảng điều khiển AWS, chọn vùng **Asia Pacific (Singapore) — `ap-southeast-1`** ở góc trên, rồi mở dịch vụ **Amazon Simple Email Service (SES)**. Mọi bước dưới đây làm **trong cùng vùng này**.

### B3. Xác minh tên miền `tin.itwonline.com` (Easy DKIM)

1. Trong SES, tạo **danh tính (identity)** loại **Domain**, nhập `tin.itwonline.com`.
2. Chọn **Easy DKIM**, khóa **RSA 2048 bit**.
3. Bật **Custom MAIL FROM domain** (có thể làm ở bước này hoặc sau khi tạo, trong trang chi tiết danh tính): nhập `bounce.tin.itwonline.com`; mục xử lý khi MX lỗi chọn **dùng MAIL FROM mặc định của SES** (không chọn từ chối thư).
4. SES hiện **3 bản ghi CNAME** dạng `<mã>._domainkey.tin.itwonline.com → <mã>.dkim.amazonses.com` và **2 bản ghi** cho MAIL FROM.
5. Dán **3 mã** (phần `<mã>` trước `._domainkey`) vào ô **3 mã DKIM từ SES** trong Cowork (mỗi mã một dòng) → **Lưu kết nối**. Bảng DNS trong Cowork sẽ hiện đúng 3 CNAME cần thêm.

### B4. Thêm bản ghi DNS (phần "Sau khi có AWS")

| Loại | Tên (host) | Giá trị | Ghi chú |
|---|---|---|---|
| CNAME | `<mã 1>._domainkey.tin.itwonline.com` | `<mã 1>.dkim.amazonses.com` | DKIM 1 |
| CNAME | `<mã 2>._domainkey.tin.itwonline.com` | `<mã 2>.dkim.amazonses.com` | DKIM 2 |
| CNAME | `<mã 3>._domainkey.tin.itwonline.com` | `<mã 3>.dkim.amazonses.com` | DKIM 3 |
| MX | `bounce.tin.itwonline.com` | `10 feedback-smtp.ap-southeast-1.amazonses.com` | Ưu tiên 10 (một số nơi tách ô "Ưu tiên") |
| TXT | `bounce.tin.itwonline.com` | `v=spf1 include:amazonses.com ~all` | SPF của MAIL FROM |
| TXT | `_dmarc.tin.itwonline.com` | `v=DMARC1; p=none; rua=mailto:dmarc@itwonline.com; fo=1` | Đã làm ở A2 |

- Như A2: nếu nơi quản lý DNS tự thêm tên miền gốc thì chỉ nhập phần trước `.itwonline.com` (vd `abc123…._domainkey.tin`, `bounce.tin`).
- CNAME: không bật "proxy" / "tăng tốc" nếu nơi quản lý DNS có tùy chọn đó — phải là bản ghi DNS thuần.
- Bấm **Kiểm tra** trong Cowork cho tới khi cả 6 dòng ✓. SES cũng tự kiểm và báo danh tính "Verified" (có thể mất tới 72 giờ, thường dưới 1 giờ).

### B5. Tạo SMTP credentials

1. Trong SES, mục **SMTP settings** → tạo **SMTP credentials** (SES tạo một người dùng IAM chỉ có quyền gửi thư).
2. Tải / chép **SMTP user name** và **SMTP password** ngay — mật khẩu chỉ hiện một lần.
3. Đây **không phải** Access key / Secret key thường của IAM, và chỉ dùng được ở vùng đã tạo (ap-southeast-1).

### B6. Configuration set + chủ đề SNS

1. Mở dịch vụ **Amazon SNS** (cùng vùng) → tạo **topic** loại **Standard**, ví dụ `cowork-ses-su-kien`. Chép **ARN** của topic (dạng `arn:aws:sns:ap-southeast-1:<12 số>:cowork-ses-su-kien`).
2. Quay lại SES → **Configuration sets** → tạo `cowork-tin`.
3. Trong configuration set, thêm **event destination** loại **Amazon SNS**, chọn topic vừa tạo, đánh dấu các loại sự kiện: **Send, Delivery, Bounce, Complaint, Reject, Rendering failure, Delivery delay**. (Open / Click không cần — Cowork tự đếm mở / bấm nếu bật theo dõi.)

### B7. Khai kênh SES trong Cowork và nối webhook

1. **Quản trị → Kết nối email → Kênh gửi → Amazon SES**.
2. Điền: Vùng `ap-southeast-1`; Configuration set `cowork-tin`; ARN chủ đề SNS (bước B6); tên đăng nhập + mật khẩu SMTP (bước B5); **Địa chỉ gửi** thuộc tên miền gửi, ví dụ `tin@tin.itwonline.com`; tên người gửi. Bấm **Lưu kết nối**.
3. Khung **Webhook sự kiện SES** → **Tạo URL webhook**. URL chỉ hiện **một lần** — chép ngay.
4. Trong SNS, mở topic → tạo **subscription**: Protocol **HTTPS**, Endpoint = URL vừa chép. **Không** bật "raw message delivery".
5. Cowork tự xác nhận đăng ký; vài giây sau tải lại trang Kết nối email phải thấy **"SNS đã xác nhận"**. Trong SNS, subscription chuyển sang "Confirmed".
6. Bấm **Gửi thư thử** (tới chính email của người bấm).

Đổi mã webhook (khi nghi lộ URL): bấm **Đổi mã webhook** → sửa Endpoint của subscription trong SNS sang URL mới (URL cũ hết hiệu lực ngay).

### B8. Xin ra khỏi sandbox (production access)

Tài khoản SES mới ở **sandbox**: chỉ gửi được tới địa chỉ đã xác minh, khoảng 200 thư/ngày. Trong SES, mục **Account dashboard** → yêu cầu **production access**. Form bằng tiếng Anh; nội dung gợi ý (sửa số liệu cho đúng):

> **Mail type:** Marketing
> **Website URL:** https://itwonline.com
> **Use case description:**
> We are The Gioi Tin Hoc (ITW), an IT products and services company in Vietnam. We will send product news and promotions from the subdomain tin.itwonline.com, only to customers and leads who explicitly opted in (unchecked consent checkbox on our sign-up forms, event registration sheets). Every consent is recorded with source, evidence and timestamp in our CRM. Expected volume: under 100,000 emails per month, starting at 200 per day and ramping up over about two weeks.
> Every message carries a one-click unsubscribe link and List-Unsubscribe / List-Unsubscribe-Post headers (RFC 8058). Unsubscribes are applied immediately and confirmed by email. Bounces and complaints are received via a configuration set and SNS; permanent bounces and complaints are suppressed automatically, and a campaign is paused automatically if its bounce rate exceeds 5% or complaint rate exceeds 0.1%. We follow Vietnamese Decree 91/2020 (prior consent, [QC] label in subject, at most 3 promotional emails per address per 24 hours).

Nghĩa: thư marketing chỉ gửi người đã tự đồng ý, có ghi căn cứ; quy mô dưới 100.000 thư/tháng; có huỷ nhận tin một chạm; tự chặn email hỏng / báo rác và tự dừng khi tỷ lệ cao. AWS thường trả lời trong 24–48 giờ; có thể hỏi thêm — trả lời đúng sự thật.

### B9. Đặt hạn mức trong Cowork

**Quản trị → Cấu hình → Email marketing**:

| Mục | Đặt | Ghi chú |
|---|---|---|
| Ngày bắt đầu khởi động tên miền gửi | Ngày gửi chiến dịch SES đầu tiên, dạng `20261110` | Từ ngày này trần mỗi ngày tăng dần |
| Số thư ngày đầu khởi động | 200 (mặc định) | |
| Hệ số tăng mỗi ngày | 1,3 (mặc định) | ≈ 2 tuần lên ~5.000 |
| Số thư chiến dịch tối đa mỗi ngày | Để trống = **mặc định 5.000** khi dùng SES | Không vượt hạn mức SES được cấp |
| Tốc độ gửi chiến dịch email | 60–300 thư/phút | Không vượt "maximum send rate" SES cấp (×60) |

---

## C. Khởi động (warm-up) — vì sao và làm thế nào

Gmail, Outlook, Yahoo đánh giá uy tín theo **tên miền** và **lịch sử gửi**. Tên miền mới đột ngột gửi hàng nghìn thư sẽ bị đưa vào thư rác hoặc bị chặn tạm. Với mặc định 200 × 1,3^ngày, Cowork tự giữ trần:

| Ngày | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Trần | 200 | 260 | 338 | 439 | 571 | 742 | 965 | 1.254 | 1.631 | 2.120 | 2.757 | 3.584 | 4.659 | 5.000* |

\* min(đường khởi động, trần ngày 5.000).

Lời khuyên:
- Những ngày đầu gửi cho người **tương tác nhiều nhất** (khách mua gần đây, người vừa đăng ký form) — tỷ lệ mở cao, ít báo rác.
- Không gửi danh sách cũ trên 12 tháng chưa liên lạc vào tuần đầu.
- Nội dung rõ ràng, có tên công ty, không viết hoa toàn bộ tiêu đề, không chỉ một ảnh lớn.
- Thấy chiến dịch **tự tạm dừng** (tỷ lệ trả lại > 5% hoặc báo rác > 1‰): xem lại danh sách trước khi bấm Tiếp tục.

---

## D. Quy định người gửi số lượng lớn của Gmail / Yahoo (từ 2024)

Áp cho người gửi khoảng 5.000 thư/ngày trở lên tới Gmail (Yahoo tương tự):

| Yêu cầu | Cowork / SES |
|---|---|
| SPF và DKIM đạt, tên miền From khớp (alignment) | DKIM `tin.itwonline.com` (B3–B4) + MAIL FROM `bounce.tin.itwonline.com` (SPF) |
| Có DMARC (tối thiểu `p=none`) | A2 |
| Huỷ nhận tin một chạm (RFC 8058), xử lý trong 2 ngày | Có sẵn: tiêu đề `List-Unsubscribe` + `List-Unsubscribe-Post`, áp ngay |
| Tỷ lệ báo rác dưới 0,3% (nên dưới 0,1%) | Cowork tự dừng chiến dịch ở 1‰ (0,1%) |
| Kết nối TLS, máy gửi có PTR hợp lệ | SES lo |

Nên đăng ký **Google Postmaster Tools** cho `tin.itwonline.com` (xác minh bằng một bản ghi TXT Google cấp) để xem tỷ lệ báo rác Gmail ghi nhận.

## E. Tóm tắt NĐ 91/2020/NĐ-CP (thư điện tử quảng cáo)

- Chỉ gửi khi người nhận **đã đồng ý trước** → Sổ đồng ý email, bắt buộc khi duyệt.
- Tiêu đề có nhãn **[QC]** ở đầu → Cowork tự gắn (đổi được nhãn, không bỏ được).
- Tối đa **3 thư quảng cáo / địa chỉ / 24 giờ** (trừ khi người nhận đồng ý khác) → Cowork hoãn thư thứ 4.
- Có cách từ chối và **xác nhận** khi nhận yêu cầu từ chối → liên kết huỷ nhận tin + thư xác nhận tự động.
- Thông tin người gửi rõ ràng → chân thư bắt buộc (tên + địa chỉ công ty ở Hồ sơ công ty).

## F. Kiểm tra hằng ngày (5 phút)

1. **Marketing → Đợt gửi email**: chiến dịch nào **Tạm dừng** và lý do (máy tự dừng vì tỷ lệ / lỗi kết nối).
2. Chi tiết chiến dịch đang gửi: thẻ **Trả lại / báo rác**, bảng **Theo tên miền nhận** — một nhà (vd Gmail) trả lại nhiều bất thường là dấu hiệu bị chặn.
3. **Kết nối email**: "Sự kiện gần nhất" của webhook còn mới (nếu đang gửi mà không có sự kiện nào nhiều giờ → kiểm subscription SNS); "Hạn mức gửi hôm nay".
4. Bảng điều khiển SES → **Reputation metrics**: tỷ lệ bounce (AWS xem xét khi khoảng 5%, có thể dừng gửi khi khoảng 10%) và complaint (xem xét khoảng 0,1%, dừng khoảng 0,5%).
5. Hộp thư `dmarc@…`: báo cáo DMARC hằng ngày — DKIM / SPF phải "pass".
6. Mỗi tuần: Google Postmaster Tools (khi đủ lượng thư tới Gmail).

## G. Sự cố thường gặp

| Hiện tượng | Nguyên nhân hay gặp | Xử lý |
|---|---|---|
| Chiến dịch tự tạm dừng "Hộp thư gửi từ chối đăng nhập" | Sai SMTP credentials / dùng nhầm Access key | Tạo lại SMTP credentials (B5), nhập lại |
| "Email address is not verified" | Còn sandbox | B8 |
| "SNS chưa xác nhận" mãi | Endpoint sai / đổi mã mà chưa sửa SNS / bật raw message delivery | Tạo lại subscription với URL đang dùng, tắt raw delivery |
| Webhook trả 403 | Chủ đề trong Cowork khác topic thật, hoặc đã đổi mã | Sửa ARN ở Kết nối email / cập nhật Endpoint |
| DKIM "Sai giá trị" | Nhập thừa tên miền gốc (`….itwonline.com.itwonline.com`) hoặc bật proxy | Sửa tên host, tắt proxy |
| Nhiều người "Chưa có đồng ý nhận thư quảng cáo" khi duyệt | Chưa có dòng đồng ý trong sổ | Nhập CSV có căn cứ (A4); không tắt `email.bat_buoc_dong_y` cho thư quảng cáo |
| Một số người "Chờ gửi" lâu | Đã đủ 3 thư quảng cáo / 24 giờ | Bình thường — máy tự gửi khi ra khỏi cửa sổ 24 giờ |
