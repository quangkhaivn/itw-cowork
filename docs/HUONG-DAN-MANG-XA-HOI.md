# Hướng dẫn Mạng xã hội (0.23.0)

Cowork đăng bài lên kênh mạng xã hội của công ty thay bạn, theo giờ đã hẹn, và **chỉ báo "Đã đăng" khi đã đọc lại thấy bài trên kênh**. Bản 0.23.0 đăng được lên **WordPress**; Facebook, Instagram, YouTube, Zalo OA mở ở các bản sau.

Ai làm gì:

| Vai trò | Được làm |
|---|---|
| Nhân viên Marketing | Nối kênh, soạn bài, đăng ngay, hẹn giờ, hủy lịch, đăng lại, xóa nháp, xuất CSV |
| Trưởng phòng Marketing | Như trên + **duyệt** bài người khác soạn |
| Thực tập sinh Marketing | Soạn bài của mình và **gửi duyệt** (không tự đăng) |
| Giám đốc / Quản trị | Tất cả; nhập thông tin app Meta / Google / Zalo (cần bật xác thực 2 lớp) |

## 1. Tạo mật khẩu ứng dụng (Application Password) trên WordPress

Mật khẩu ứng dụng là mật khẩu riêng cho một phần mềm — **không phải** mật khẩu bạn dùng để đăng nhập WordPress, thu hồi được bất cứ lúc nào mà không ảnh hưởng tài khoản.

1. **Dùng tài khoản riêng, quyền vừa đủ.** Đăng nhập WordPress bằng tài khoản quản trị → **Thành viên (Users) → Thêm mới** → tạo tài khoản ví dụ `cowork-dang-bai`, vai trò **Tác giả (Author)** (đăng bài của chính mình, tải ảnh) hoặc **Biên tập viên (Editor)**. Không dùng tài khoản Quản trị viên: mật khẩu ứng dụng có toàn quyền của tài khoản và không tự hết hạn.
2. Đăng nhập bằng tài khoản đó → **Thành viên → Hồ sơ (Profile)** → kéo xuống mục **Mật khẩu ứng dụng (Application Passwords)**.
3. Ô **Tên mật khẩu ứng dụng mới**: gõ `TGTH Cowork` → **Thêm mật khẩu ứng dụng mới**.
4. WordPress hiện chuỗi 24 ký tự dạng `abcd EFGH ijkl MNOP qrst UVWX` — **chép ngay**, WordPress chỉ hiện một lần.

Không thấy mục Mật khẩu ứng dụng?
- Site phải chạy **HTTPS** (WordPress tắt tính năng này trên HTTP).
- Một số plugin bảo mật (Wordfence, iThemes, "Disable REST API"…) tắt mật khẩu ứng dụng hoặc chặn REST API — mở lại cho tài khoản này.
- WordPress phải từ bản 5.6 trở lên.

## 2. Nối kênh trong Cowork

**Mạng xã hội → Kênh** → mục *Nối site WordPress*:

1. **Địa chỉ site**: `https://tintuc.congty.vn` (site nằm trong thư mục con thì ghi cả thư mục: `https://congty.vn/blog`). Chỉ nhận HTTPS.
2. **Tên đăng nhập**: tên đăng nhập WordPress của tài khoản ở bước 1 (ví dụ `cowork-dang-bai`).
3. **Mật khẩu ứng dụng**: dán chuỗi 24 ký tự (có hay không có dấu cách đều được).
4. Bấm **Kiểm tra kết nối**: Cowork đăng nhập thử và kiểm tài khoản có quyền **đăng bài** và **tải ảnh**. Báo lỗi thì đọc lời nhắc (sai mật khẩu, thiếu quyền, không thấy REST API…).
5. Bấm **Lưu kênh**. Mật khẩu được mã hóa trên máy chủ và **không bao giờ hiện lại**.

Về sau:
- **Kiểm tra lại**: máy nền kiểm trong khoảng 15 giây, tải lại trang để xem kết quả.
- Kênh báo **"Cần nhập lại mật khẩu ứng dụng"** (mật khẩu bị thu hồi / tài khoản bị đổi quyền): tạo mật khẩu ứng dụng mới trên WordPress → **Nhập lại mật khẩu** → rồi vào bài bị lỗi bấm **Đăng lại**.
- **Ngắt kết nối**: Cowork xóa mật khẩu đã lưu và hủy các lượt đăng chưa chạy. Nhớ **thu hồi** mật khẩu ứng dụng trên WordPress (Hồ sơ → Mật khẩu ứng dụng → Thu hồi).

## 3. Soạn và đăng bài

**Mạng xã hội → Soạn bài**:

1. **Tiêu đề** (bắt buộc với WordPress) và **Nội dung** — viết chữ thường; dòng trống để tách đoạn; liên kết `https://…` tự thành link. Không dán HTML (Cowork tự định dạng, mã HTML dán vào sẽ hiện nguyên chữ).
2. Chọn **kênh** → **Lưu nháp**. Trang bài mở ra.
3. Thêm **ảnh** ở khung Tệp đính kèm (JPEG, PNG, GIF, WebP, tối đa 20 MB). Ảnh đầu tiên làm **ảnh đại diện** của bài WordPress.
4. Chọn một trong:
   - **Đăng ngay** — máy nền đăng trong khoảng 15 giây.
   - **Hẹn giờ** — chọn ngày giờ (giờ Việt Nam) → **Hẹn giờ**. Đến giờ, bài được đăng (lệch không quá 1 phút). Đổi ý thì **Hủy lịch** (chỉ khi chưa tới giờ), bài về "Đã hủy" → **Chuyển về nháp** để sửa.
   - **Gửi duyệt** (thực tập sinh, hoặc bài do AI soạn) — chọn "Duyệt xong thì: đăng ngay / đăng vào giờ hẹn / để người có quyền đăng chọn giờ".

Trạng thái từng kênh trên trang bài và **Mạng xã hội → Bài và lịch đăng**:

| Trạng thái | Nghĩa |
|---|---|
| Chờ đăng | Đã xếp lịch; nếu là lần thử lại thì hiện giờ thử |
| Đang đăng / Đang xác minh | Máy nền đang gửi, hoặc đã gửi và đang đọc lại để chắc bài đã lên |
| **Đã đăng (đã xác minh)** | WordPress trả mã bài **và** Cowork đã đọc lại thấy đúng bài — có link **Xem bài đã đăng** |
| Lỗi | Kèm thông báo của WordPress và **hướng dẫn sửa**; bấm **Đăng lại các kênh lỗi** sau khi sửa |

Hệ thống tự xử lý lỗi theo loại:
- **Máy chủ WordPress tạm lỗi / mất mạng**: tự thử lại sau 30 giây, 1, 2, 4… phút (tối đa theo Cấu hình, mặc định 5 lần).
- **WordPress từ chối nội dung** (sai định dạng, ảnh không hợp lệ…): báo lỗi ngay — sửa bài rồi đăng lại.
- **Sai / bị thu hồi mật khẩu ứng dụng**: báo lỗi, kênh chuyển "Cần nhập lại".
- **Đã gửi mà không nhận được trả lời** (mạng chập chờn): Cowork **không gửi lại ngay** — chờ 2 phút, tìm trên WordPress xem bài đã lên chưa (theo đường dẫn riêng của bài): đã lên thì đánh dấu đã đăng, chưa lên mới đăng lại. Không bao giờ sinh bài trùng.

Trang bài có **Nhật ký gọi nền tảng** — từng lần Cowork gọi WordPress, kết quả, mã HTTP — để đối chiếu khi cần.

## 4. Duyệt bài

- Bài gửi duyệt báo chuông cho người có quyền duyệt. Người duyệt vào **Mạng xã hội → Chờ duyệt** (chỉ hiện bài mình được duyệt) → mở bài → **Duyệt** (có thể ghi chú) hoặc **Trả lại** (bắt buộc ghi lý do — bài về Nháp, người soạn được báo).
- **Không ai tự duyệt** bài mình soạn hoặc mình gửi duyệt. Người duyệt phải là cấp trên của người soạn (theo hồ sơ nhân sự), Giám đốc / Quản trị, hoặc người có quyền duyệt bài cả phòng (Trưởng phòng Marketing).
- Sửa bài đã duyệt → bài về Nháp, phải duyệt lại.
- Bài do trợ lý AI soạn (từ bản 0.25) **luôn phải duyệt** khi Cấu hình *Mạng xã hội → Bài do AI tạo phải duyệt* = 1 (mặc định).

## 5. Quản trị → Kết nối nền tảng (API)

Dành cho Giám đốc / Quản trị (**phải bật xác thực 2 lớp**). Dùng khi nối Facebook / Instagram (Meta), YouTube / Google Drive (Google), Zalo OA — các kênh này mở ở 0.24; WordPress không cần.

1. Màn hình hiện sẵn **tên miền** và **Redirect URI** của từng nền tảng (lấy từ địa chỉ Cowork) — bấm **Sao chép** rồi dán vào trang của nền tảng.
2. Mỗi nền tảng có **Hướng dẫn từng bước** (vào đâu trên Meta for Developers / Google Cloud Console / Zalo for Developers, bật API nào, dán URL nào).
3. Nhập App ID / Client ID và **App Secret / Client Secret / Secret Key** → **Lưu**. Sau khi lưu, bí mật **không bao giờ hiện lại** — chỉ thấy 4 ký tự cuối và lúc cập nhật. Muốn đổi: nhập giá trị mới rồi Lưu; muốn bỏ: **Xóa**.
4. **Kiểm tra**: Meta — Cowork xin "app token" của Meta, báo đúng / sai App ID + Secret. Google, Zalo — chỉ kiểm định dạng (kiểm thật khi nối kênh đầu tiên).
5. Kỹ thuật và Marketing chỉ thấy "Đã cấu hình / Chưa cấu hình". Dòng "Đang dùng giá trị từ máy chủ" nghĩa là chưa nhập trên màn hình và máy chủ đang dùng giá trị trong `.env`.

Nền tảng yêu cầu trang **Điều khoản**, **Quyền riêng tư**, **Xóa dữ liệu** khi gửi duyệt app — Cowork chưa có các trang này; cần đăng trên website công ty.

## 6. Cấu hình (Quản trị → Cấu hình hệ thống → Mạng xã hội)

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| Bài do AI tạo phải duyệt | 1 | 0 = không bắt buộc (không khuyến nghị) |
| Hạn link ảnh / video công khai | 60 phút | Link ký để nền tảng kéo ảnh (Instagram — 0.24) |
| Số lần thử đăng tối đa mỗi kênh | 5 | Với lỗi tạm thời |
| Hạn một lần gọi nền tảng | 30 giây | Quá hạn sau khi đã gửi → đối soát |
| Chờ trước khi đối soát | 120 giây | |
| Coi lượt đăng là kẹt sau | 10 phút | Máy nền dừng giữa chừng → đối soát |

## 7. Khi có sự cố

| Hiện tượng | Làm gì |
|---|---|
| "Máy chủ chưa đặt SOCIAL_MASTER_KEY" | Báo quản trị máy chủ chạy lại `trien-khai.sh` (tự sinh khóa) — DEPLOYMENT.md → Nâng cấp lên 0.23.0 |
| "Không thấy REST API của WordPress" | Kiểm địa chỉ site (có `www`? thư mục con?), plugin chặn REST API |
| "Máy chủ chuyển hướng sang địa chỉ khác" | Nhập đúng địa chỉ cuối cùng (ví dụ `https://www.congty.vn` thay vì `https://congty.vn`) |
| "Địa chỉ trỏ vào mạng nội bộ — bị chặn" | Cowork chỉ gọi site công khai trên Internet |
| Bài "Đang xác minh" lâu | Bình thường trong vài phút khi mạng chập chờn; quá lâu thì xem Nhật ký gọi nền tảng |
| Bài lỗi "đọc lại không được" | Bài có thể đã lên — kiểm trực tiếp trên site trước khi đăng lại |
