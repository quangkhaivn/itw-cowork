# Hướng dẫn chấm công — dành cho bộ phận Nhân sự

Phiên bản 0.19.0, cập nhật 0.22.0 (mở dần — bổ sung sau). Luật chi tiết: `BUSINESS_RULES.md` mục 30 và 33. Tài liệu này viết cho người làm Nhân sự, không cần biết kỹ thuật.

Cowork chấm công bằng **hai cách**:

1. **Máy chấm công vân tay** (ZKTeco) đặt ở văn phòng — máy tự gửi dữ liệu về Cowork qua mạng.
2. **Điện thoại**: nhân viên mở Cowork, bấm **Vào ca** / **Ra ca**; Cowork lấy vị trí GPS đúng lúc bấm.

Hai cách dùng song song; bảng công gộp cả hai (lần chấm sớm nhất là giờ vào, muộn nhất là giờ ra).

> **0.22.0 — không cần đủ mọi thứ mới dùng được.** Thiếu địa điểm, chưa gán lịch, chưa có máy… phần mềm vẫn chạy và báo việc còn thiếu ở **Tổng quan → Thiết lập ban đầu** (mỗi người chỉ thấy phần mình phụ trách). Người không có máy / GPS: Nhân sự **đặt công tay** (mục 7.1). Máy chấm công do **Kỹ thuật** kết nối ở menu **Kỹ thuật → Máy chấm công** (mục 3).

---

## 1. Thiết lập ban đầu (làm một lần)

Vào **Nhân sự → Thiết lập chấm công**.

### 1.1. Địa điểm làm việc

Mỗi văn phòng / chi nhánh / kho là một địa điểm, gồm toạ độ và **bán kính GPS**.

- Lấy toạ độ: mở Google Maps, **nhấn giữ** đúng vị trí cửa văn phòng → hiện hai số, ví dụ `10.776900, 106.700900`. Số đầu là **vĩ độ**, số sau là **kinh độ**.
- Bán kính: để trống = mặc định 150 m (đổi ở *Quản trị → Cấu hình → Chấm công*). Toà nhà lớn / GPS trong nhà kém thì tăng lên 200–300 m.
- Nhân viên bấm Vào ca trong bán kính bất kỳ địa điểm nào đang hoạt động thì hợp lệ.

### 1.2. Ca làm

Ví dụ ca hành chính: giờ vào 08:00, giờ ra 17:00, nghỉ giữa ca từ 12:00, 60 phút.

- **Ca qua đêm**: giờ ra nhỏ hơn giờ vào (22:00 → 06:00) — hệ thống tự hiểu ra ca sáng hôm sau.
- **Cho phép đi muộn / về sớm**: để trống dùng mặc định (5 phút). Muộn quá mức cho phép thì tính **đủ số phút muộn** (vào 08:20, cho phép 5 → muộn 20 phút). Đi muộn không tự trừ công; số phút có trên bảng công để tính lương theo quy chế.
- Giờ nghỉ giữa ca dùng để chia **nửa ca sáng / chiều** (nghỉ phép nửa ngày, làm sáng thứ Bảy).

### 1.3. Lịch tuần

Chọn ca và đánh dấu từng ngày: Cả ca / Sáng / Chiều / Nghỉ. Ví dụ "T2–T6 cả ca, T7 sáng, CN nghỉ".

### 1.4. Gán lịch cho nhân viên

Bấm **Gán lịch cho nhân viên**, chọn lịch, ngày bắt đầu áp dụng, chọn nhiều người (giữ Ctrl / ⌘). Đổi lịch từ một ngày thì gán lịch mới với ngày đó — những ngày trước vẫn giữ lịch cũ.

> **0.22.0 — Lịch mặc định.** Ở bảng *Lịch tuần*, bấm **Đặt làm mặc định** cho lịch dùng chung của công ty (ví dụ "Hành chính T2–T6 08:00–17:00" — bản cài mới có sẵn lịch này làm mặc định). **Người chưa được gán lịch nào dùng lịch mặc định** từ ngày vào làm: có ngày công dự kiến, vào bảng công, bảng trực tiếp ghi "theo lịch mặc định". Người đã gán lịch riêng giữ lịch của mình. Đặt / đổi lịch mặc định chọn **ngày áp dụng** (mặc định hôm nay): chỉ áp từ ngày đó trở đi, không chọn được ngày trong tháng đã khóa bảng công (tháng đã khóa không đổi, không sinh dòng điều chỉnh). Chưa chọn lịch mặc định thì người chưa gán lịch không có ngày công dự kiến (lương tạm tính T2–T6, có cảnh báo).

### 1.5. Ngày lễ

Nhập ngày lễ từng năm theo thông báo nghỉ lễ chính thức (kể cả ngày nghỉ bù). Hệ thống **không tự điền** lịch lễ. Ngày lễ: không tính vắng, không nhắc chấm công; ai đi làm ngày lễ có đơn tăng ca thì tính tăng ca loại "lễ".

### 1.6. Loại nghỉ và phép năm

Có sẵn: Phép năm (trừ quỹ phép), Việc riêng có lương, Ốm đau (BHXH chi trả — không lương công ty), Nghỉ không lương. Thêm / sửa ở mục *Loại nghỉ*.

Quỹ phép năm đặt ở *Quản trị → Cấu hình → Nghỉ phép*: số ngày cơ bản (12), cứ đủ 5 năm thâm niên cộng 1 ngày, tích lũy theo tháng, số ngày được chuyển sang năm sau. Quỹ tính theo **ngày vào làm** trong hồ sơ — nhớ nhập ngày vào làm. Số dư đầu kỳ khi mới dùng Cowork: vào hồ sơ từng người → **Điều chỉnh quỹ phép** (ghi lý do; không xóa được, sai thì điều chỉnh ngược lại).

### 1.7. Ngưỡng ở Cấu hình (nhóm Chấm công)

Bán kính GPS mặc định, độ chính xác GPS tối đa (100 m), tốc độ di chuyển bất thường (120 km/h), bỏ qua bấm trùng (60 giây), nhắc chưa chấm sau 15 phút, báo máy mất kết nối sau 10 phút, hạn phản hồi bảng công (3 ngày), giờ đêm (22 → 6), **trần tăng ca tháng / năm** (để trống = không cảnh báo — Giám đốc đặt theo quy định pháp luật hiện hành).

Thêm sau QA 0.19.0: giờ máy vân tay được đi trước tối đa (60 phút) và năm sớm nhất chấp nhận (2020); trần yêu cầu của máy theo SN + IP (120 / phút) và trần tổng theo SN (600 / phút); số ngày phiếu hỗ trợ còn hiệu lực cho chấm hiện trường (14); thời gian có mặt tối thiểu so với giờ ca (50%, 0 = không kiểm).

---

## 2. Hồ sơ nhân sự

**Nhân sự → Hồ sơ nhân sự** → chọn người → **Sửa hồ sơ nhân sự**:

- **Loại nhân sự**: Chính thức / Thử việc / Sinh viên thực tập / Cộng tác viên.
- **Mã chấm công**: đúng số *Mã người dùng (User ID)* đã khai cho người đó **trên máy vân tay**. Mỗi mã chỉ gán cho một người.
- **Địa điểm làm việc mặc định**, **ngày vào làm**.
- Sinh viên thực tập: trường, khoa, MSSV, giảng viên hướng dẫn, người hướng dẫn tại công ty, thời gian thực tập. Cấp vai trò **Thực tập sinh** ở *Quản trị → Người dùng* (chỉ thấy công việc và chấm công của mình, không thấy khách hàng, giá).
- **Hợp đồng lao động**: loại, từ ngày – đến ngày, ghi chú, đính kèm bản scan.

Tài khoản, phòng ban, **quản lý trực tiếp** sửa ở *Quản trị → Người dùng*. Quản lý trực tiếp là người duyệt đơn và nhận nhắc khi nhân viên chưa chấm công — cần khai đủ.

---

## 3. Máy chấm công vân tay

> **0.22.0:** màn hình chuyển sang menu **Kỹ thuật → Máy chấm công**. Kỹ thuật viên, Trưởng phòng Kỹ thuật, Nhân sự, Giám đốc, Quản trị đều làm được (quyền `may_cham_cong.*`) — Kỹ thuật **không** thấy hồ sơ nhân sự hay lương, khi gán PIN chỉ thấy tên nhân viên. Đầu màn hình có **hướng dẫn kết nối từng bước** với đúng địa chỉ máy chủ, cổng, HTTPS của công ty.

### 3.1. Đăng ký máy trên Cowork

**Kỹ thuật → Máy chấm công → Đăng ký máy**:

- **Số sê-ri (SN)**: xem trên máy, thường ở *Menu → Thông tin hệ thống → Thông tin thiết bị* (hoặc tem dán sau máy). Máy chưa đăng ký gọi vào bị từ chối (lần chấm **không được lưu**) nhưng hiện ở mục **Máy đang gọi nhưng chưa đăng ký** (mục 3.1b).
- **Đặt tại** (không bắt buộc): địa điểm của máy — Kỹ thuật có thể để trống, Nhân sự chọn sau (cần để kiểm tốc độ di chuyển bất thường).
- **Chỉ nhận từ IP** (nên khai): IP công cộng của mạng văn phòng (hỏi bộ phận IT hoặc xem cột "IP cuối" sau khi máy gọi về lần đầu).

### 3.1a. Xác minh máy (bắt buộc — làm ngay sau khi đăng ký)

Nhiều công ty có thể dùng chung một mạng / IP (tòa nhà văn phòng), nên Cowork phải chắc máy đúng là của công ty mình. Đăng ký xong, máy ở trạng thái **Chờ xác minh** và màn hình hiện **mã PIN xác minh 6 số** (hạn 24 giờ). Trong lúc chờ, lần chấm của máy được giữ ở **khu cách ly**: không hiện ở đâu, không tính công cho ai.

1. Trên máy chấm công: *Menu → Người dùng (User Mgt) → Thêm người dùng*. **Mã người dùng (ID / PIN) = mã xác minh 6 số** trên màn hình Cowork. Đặt **mật khẩu hoặc vân tay — loại nào cũng được**.
2. **Chấm công 1 lần** bằng người dùng đó (nhập mật khẩu hoặc đặt vân tay).
3. Chờ khoảng 1 phút (máy gửi lần chấm về), bấm **Kiểm tra kết nối**: máy chuyển **Đã xác minh**; Cowork nhận toàn bộ lần chấm đang cách ly vào công ty. Kỹ thuật nhận thông báo.
4. **Xóa người dùng tạm** mang mã xác minh trên máy (lần chấm xác minh không tính công cho ai).

- Mã **hết hạn sau 24 giờ** → bấm **Tạo lại mã** rồi làm lại bước 1–2 với mã mới.
- **Hủy đăng ký** (khi chưa xác minh): xóa máy và toàn bộ lần chấm đang cách ly — dùng khi đăng ký nhầm SN.
- SN báo "đã được đăng ký trên hệ thống" mà máy đúng là của công ty: có thể công ty khác đăng ký nhầm. Nếu đăng ký đó chưa xác minh quá 24 giờ, đăng ký lại sẽ được (đăng ký cũ bị gỡ, lần chấm cách ly của họ bị xóa).
- Máy đã đăng ký trước bản 0.22.0 coi như đã xác minh. Quản trị có thể tắt xác minh ở *Cấu hình → Chấm công → Xác minh sở hữu máy chấm công* (chỉ nên làm khi máy chủ chỉ phục vụ một công ty).

### 3.1b. Máy đang gọi nhưng chưa đăng ký (máy lạ)

Khai địa chỉ máy chủ trên máy **trước** cũng được: máy gọi về, Cowork ghi lại SN, IP, mẫu máy, số lần gọi (không lưu lần chấm). Mục **Máy đang gọi nhưng chưa đăng ký** chỉ hiện máy **cùng mạng với bạn** (cùng IP công khai) hoặc cùng mạng với một máy công ty đã đăng ký — doanh nghiệp khác trên cùng máy chủ không thấy máy của mình. Không thấy thì gõ đúng SN vào ô **Tìm đúng SN**. Thấy máy trong danh sách **không** chứng minh máy là của công ty mình (công ty khác có thể dùng chung IP) — vì vậy luôn phải **xác minh** (mục 3.1a). Bấm **Đăng ký máy này** → ở lần gọi kế tiếp Cowork yêu cầu máy **gửi lại toàn bộ nhật ký chấm công** đang lưu trong máy (vào khu cách ly cho tới khi **xác minh** — mục 3.1a).

### 3.2. Khai địa chỉ máy chủ trên máy

> ⚠ Tên menu và cách nhập **khác nhau theo mẫu máy và phiên bản firmware**. Mô tả dưới đây là chung cho dòng ZKTeco có chức năng ADMS / "Cloud Server"; khi có mẫu máy cụ thể, IT sẽ bổ sung ảnh chụp từng bước. Máy phải có chức năng **ADMS / PUSH** (nhiều máy chỉ có phần mềm cài trên máy tính thì không gửi thẳng được — khi đó dùng *nhập CSV*, mục 3.4).

Trên máy (đăng nhập quyền quản trị máy):

1. Vào *Menu → Kết nối (Comm.) → Cài đặt máy chủ đám mây / Cloud Server Setting / ADMS*.
2. **Địa chỉ máy chủ**: tên miền Cowork (ví dụ `cowork.itwonline.com`) — một số máy chỉ nhận địa chỉ IP, khi đó nhập IP máy chủ.
3. **Cổng**: `80` (HTTP). Máy hỗ trợ HTTPS thì bật HTTPS và dùng `443`.
4. Bật **Tên miền / Domain Name** nếu nhập tên miền; tắt **Proxy**.
5. Lưu, khởi động lại máy nếu được yêu cầu.
6. Kiểm tra mạng của máy (IP, cổng mặc định, DNS) ở *Menu → Kết nối → Ethernet*.

Trong vòng một phút, trang *Máy chấm công* hiện **Trực tuyến**, cột "Lần cuối" cập nhật, kèm phiên bản firmware và số người trên máy. Bấm **Kiểm tra kết nối** ở dòng của máy để xem lần gọi cuối và **IP nguồn**; chưa thấy lần gọi nào thì màn hình gợi ý kiểm địa chỉ / cổng / HTTPS.

Máy cần nhận biết đúng **giờ Việt Nam**: máy gửi giờ theo đồng hồ của máy. Kiểm tra *Menu → Ngày giờ* đúng giờ. Giờ máy đi trước giờ máy chủ quá 60 phút (Cấu hình) → lần chấm bị gắn cờ **giờ máy lệch**; đi trước quá 1 ngày hoặc năm trước 2020 (máy mất pin đồng hồ hay về 01/01/2000) → cờ **giờ máy vô lý**. Cả hai loại **chưa được tính công**: chúng vào hàng chờ xem xét ở *Bảng chấm công trực tiếp*, quản lý chấp nhận (đã kiểm — ví dụ máy đặt sai giờ nhưng người đó có làm thật) thì mới tính; giờ sai hẳn thì không chấp nhận và nhân viên làm **giải trình / chấm bù** với giờ đúng. Sửa giờ trên máy ngay khi thấy cờ.

Máy gửi quá nhiều yêu cầu bị từ chối tạm (429) theo **cặp SN + IP gửi**: người lạ biết SN gửi dồn từ IP khác chỉ tự bị chặn, máy thật ở văn phòng vẫn gửi được. Ngoài ra có trần tổng theo SN (mọi IP) để chống lạm dụng.

> IT / quản trị máy chủ: nhiều máy chỉ gửi HTTP — xem `DEPLOYMENT.md` mục "Máy chấm công vân tay — HTTP cho riêng /iclock/".

### 3.3. Mã chấm công (PIN) chưa khớp

Người mới được thêm vân tay trên máy nhưng chưa khai mã chấm công trên Cowork: lần chấm vẫn được lưu, hiện ở mục **PIN chưa khớp người**. Bấm **Gán cho…** chọn đúng người (hoặc nhập mã chấm công ở hồ sơ nhân sự — kết quả như nhau). Các lần chấm cũ của mã đó được tính cho người này, nhưng:

- **chỉ từ ngày vào làm** trong hồ sơ (nhớ nhập ngày vào làm — PIN trên máy hay được dùng lại cho người mới; lần chấm trước ngày vào làm là của người cũ, không bao giờ được áp);
- **chỉ trong tháng chưa khóa bảng công**. Lần chấm thuộc tháng đã khóa còn nằm lại ở danh sách, cột *Đã gán cho* ghi tên người. Nếu đúng là của người này, người có **quyền duyệt chấm công** (không phải chính người đó) bấm **Áp cả kỳ đã khóa…**, tích xác nhận → bảng công tháng sau tự thêm dòng điều chỉnh (chỉ dò 3 tháng đã khóa gần nhất). Mọi lần áp đều ghi nhật ký kiểm toán.

Không ai tự gán cho **chính mình** một mã chấm công đang có lần chấm chưa khớp (kể cả Nhân sự, Kỹ thuật) — nhờ người khác gán.

**Nhập CSV ánh xạ PIN ↔ email** (0.22.0): tệp hai cột `Mã chấm công`, `Email` (email đăng nhập Cowork) → *Xem trước* (lỗi từng dòng: email không có, PIN đã gán người khác, người đã có mã khác, ô bắt đầu bằng `= + - @`) → *Gán mã chấm công*. Lần chấm chưa khớp của PIN đó được áp như *Gán cho…*.

### 3.4. Máy mất kết nối / nhập từ tệp

- Máy im lặng quá 10 phút: người làm Nhân sự và Kỹ thuật nhận thông báo (một lần cho mỗi lần mất kết nối). Kiểm tra điện, dây mạng, địa chỉ máy chủ trên máy. Khi mạng có lại, máy tự gửi bù những lần chấm còn lưu trong máy (không bị nhân đôi).
- Máy hỏng mạng lâu hoặc không có ADMS: xuất dữ liệu chấm công từ phần mềm của máy ra Excel → *Lưu thành CSV UTF-8* → mục **Nhập lần chấm từ tệp** → *Xem trước* → *Ghi*. Cột cần có: `Mã chấm công` (hoặc PIN / AC-No.) và `Thời gian` (hoặc hai cột `Ngày`, `Giờ`). Nhập lại cùng tệp không bị nhân đôi.

---

## 4. Nhân viên chấm công bằng điện thoại

Hướng dẫn gửi nhân viên:

1. Mở Cowork trên điện thoại bằng địa chỉ **https://** (bắt buộc — trình duyệt không cho lấy vị trí trên http). Nên "Thêm vào màn hình chính" để mở nhanh.
2. Vào **Nhân sự → Chấm công**. Lần đầu: đọc **Thông báo về dữ liệu vị trí** và bấm *Tôi đã đọc và đồng ý*. Cowork chỉ lấy vị trí đúng lúc bấm, không theo dõi liên tục (Luật Bảo vệ dữ liệu cá nhân 91/2025).
3. Bấm **Vào ca** khi bắt đầu làm, **Ra ca** khi về. Điện thoại hỏi quyền vị trí → *Cho phép*.
4. Kết quả hiện ngay:
   - **Trong vùng**: hợp lệ.
   - **Hiện trường**: ngoài văn phòng nhưng đang có phiếu hỗ trợ **giao cho chính mình, còn mở và có hoạt động trong 14 ngày** (tạo, cập nhật, ghi diễn biến — số ngày ở Cấu hình) — hợp lệ, quản lý xem lại. Phiếu im lặng quá 14 ngày, hoặc đã xử lý xong trong ngày → vẫn là hiện trường nhưng **chờ quản lý chấp nhận** mới tính công. Kỹ thuật viên nên cập nhật phiếu khi đi khách.
   - **Ngoài vùng**: được ghi nhưng **chỉ tính công khi quản lý chấp nhận**.
   - Cờ "GPS kém chính xác" (ra chỗ thoáng, bật Wi-Fi để định vị tốt hơn), "Tốc độ bất thường", "Không lấy được vị trí" — quản lý xem lại.
5. Bấm hai lần liên tiếp không sao — trong 60 giây chỉ ghi một lần.
6. Giờ chấm là **giờ máy chủ**, không theo đồng hồ điện thoại.

Quên chấm: vào **Đơn từ → Giải trình / chấm bù**, chọn ngày, giờ đúng, vào hay ra, lý do. Quản lý duyệt thì lần chấm bổ sung được ghi.

---

## 5. Bảng chấm công trực tiếp

**Nhân sự → Bảng chấm công trực tiếp** — tự làm mới mỗi 10 giây.

- Ô tóm tắt: *Chưa đến*, *Đi muộn*, *Đã vào ca*, *Hiện trường*, *Nghỉ phép*, *Đã ra ca*… — bấm một ô để lọc.
- Mỗi dòng: giờ vào ca theo lịch, giờ vào thực tế, lần chấm cuối, nguồn (vân tay / GPS / chấm bù), **Xem trên bản đồ** cho lần chấm GPS.
- Lọc theo phòng ban, địa điểm.
- **Lần chấm chờ bạn xem xét**: chấp nhận / không chấp nhận (ghi lý do — nhân viên nhận thông báo). Gồm cả lần chấm vân tay *giờ máy lệch / vô lý* và chấm hiện trường theo phiếu cũ / đã xong; dòng ghi *Chưa tính công cho tới khi chấp nhận* thì phải có quyết định mới được tính.
- **Ngày công thiếu giờ chờ bạn quyết** (đầu trang, 35 ngày gần nhất tới hôm qua): có giờ vào và giờ ra nhưng thời gian có mặt (trừ nghỉ trưa) dưới 50% giờ phải làm — ví dụ chấm vào rồi chấm ra ngay. Hệ thống **không tự trừ**: chọn **Tính đủ**, **Tính nửa** (chỉ ngày phải làm cả ca) hoặc **Không tính** (ghi lý do). Không ai tự quyết ngày của mình.
- Cuối trang: trạng thái từng máy vân tay.

Ai thấy gì: nhân viên thấy chính mình; trưởng phòng thấy nhóm / phòng mình (và cấp dưới trực tiếp); Nhân sự và Giám đốc thấy cả công ty.

---

## 6. Đơn từ

**Nhân sự → Đơn từ**: Xin nghỉ (cả ngày / nửa ngày sáng / chiều), Xin tăng ca, Giải trình / chấm bù. Thẻ đầu trang hiện phép năm còn được dùng.

- Người duyệt: **quản lý trực tiếp** hoặc người có quyền duyệt trong phạm vi (trưởng phòng, Nhân sự). Không ai tự duyệt đơn của mình.
- Đơn nghỉ không tính ngày nghỉ tuần / ngày lễ trong khoảng. Quỹ phép không đủ thì không gửi / không duyệt được.
- Đơn nghỉ đã duyệt muốn hủy: quản lý trực tiếp hoặc Nhân sự hủy (ghi lý do), ngày phép trả lại quỹ.
- Tăng ca: duyệt bao nhiêu giờ thì tính tối đa bấy nhiêu; giờ thực tế lấy từ lần chấm (phần sau giờ ra ca). Vượt / sắp chạm trần tháng, năm thì có cảnh báo (không chặn).
- Lịch nghỉ trong tháng của nhóm ở cuối trang.

---

## 7. Bảng công tháng

**Nhân sự → Bảng công tháng**:

1. Đầu tháng, bấm **Sinh bảng công**, chọn tháng trước. Bảng ở trạng thái **Nháp**; mỗi người có tên trong bảng nhận thông báo.
2. Nhân viên mở bảng, xem dòng của mình, bấm **Phản hồi bảng công** nếu sai (trong 3 ngày). Quên chấm thì gửi kèm đơn giải trình.
3. Nhân sự xử lý (duyệt chấm bù, sửa lịch…), bấm **Sinh lại** để tính lại, rồi **Giải quyết** từng phản hồi.
4. Hết hạn phản hồi và không còn phản hồi mở → **Khóa bảng công**. Bảng đã khóa **không sửa được**.
5. **CSV tổng hợp** (mỗi người một dòng) gửi kế toán tính lương; **CSV chi tiết** từng ngày để đối chiếu.

Cờ trên bảng công: *Thiếu giờ — chờ quản lý quyết* (công vẫn tính đủ cho tới khi có quyết định), *Thiếu giờ — quản lý tính đủ / nửa / không công*; *Có lần chấm chờ quản lý xem xét*. Trước khi khóa, xử lý hết hàng chờ ở *Bảng chấm công trực tiếp* rồi **Sinh lại**.

### 7.1. Đặt công tay (0.22.0) — người không có máy / GPS

**Bảng công tháng → Đặt công tay**: chọn nhân viên, ngày (hoặc khoảng ngày — chỉ áp ngày phải làm theo lịch), công 1 / 0,5 / 0, **lý do** (bắt buộc). Chỉ làm được khi bảng công tháng đó **chưa khóa**; mỗi lần đặt ghi nhật ký kiểm toán; không ai tự đặt công cho mình. Đặt xong bấm **Sinh lại** bảng công nháp — ngày đó có cờ *Công do Nhân sự đặt tay*. Vẫn dùng song song: chấm bù có duyệt (nhân viên xin), nhập CSV lần chấm theo PIN.

Bảng công chưa khóa **không làm chậm lương**: kế toán vẫn tính lương bằng công nhập tay / mặc định đủ công, rồi bấm *Lấy lại công từ bảng công* khi bảng đã khóa (`docs/HUONG-DAN-LUONG.md`).

Sai sót phát hiện sau khi khóa (ví dụ chấm bù được duyệt muộn, ngày thiếu giờ được quyết muộn, áp PIN cả kỳ đã khóa): khi sinh bảng tháng sau, hệ thống tự thêm **dòng điều chỉnh** cho ngày của tháng đã khóa (chênh lệch), cộng vào tổng tháng sau.

---

## 8. Câu hỏi thường gặp

- **Nhân viên báo không bấm được Vào ca**: kiểm tra mở bằng https://, đã cho quyền vị trí cho trình duyệt (Cài đặt điện thoại → Quyền riêng tư → Vị trí), đã xác nhận thông báo vị trí.
- **Máy vân tay không lên Trực tuyến**: bấm *Kiểm tra kết nối*; xem mục *Máy đang gọi nhưng chưa đăng ký* — máy hiện ở đó nghĩa là SN đăng ký sai / chưa đăng ký. SN đăng ký đúng chưa (chữ hoa / thường đúng như trên máy), IP văn phòng có trùng "Chỉ nhận từ IP" không, máy có ra Internet được không, địa chỉ / cổng máy chủ trên máy. Nhờ IT xem nhật ký máy chủ: dòng `Máy chưa đăng ký gọi vào: SN=…` nghĩa là SN chưa khớp.
- **Nhân viên có vân tay trên máy nhưng bảng không có công**: chưa khai mã chấm công → xem mục *PIN chưa khớp người*; hoặc lần chấm mang cờ giờ máy lệch / vô lý đang chờ xem xét.
- **Doanh nghiệp khác trên cùng máy chủ** (không phải doanh nghiệp chính): sau nâng cấp đã có sẵn vai trò Nhân sự (HR), Thực tập sinh, 4 loại nghỉ và quyền chấm công cho Giám đốc / Quản trị — không cần làm gì thêm.
- **Đổi giờ làm của một nhóm từ tuần sau**: tạo lịch mới, gán từ ngày thứ Hai tuần sau.
