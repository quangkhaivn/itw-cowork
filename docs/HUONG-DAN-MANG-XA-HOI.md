# Hướng dẫn Mạng xã hội (0.23.0 → 0.24.0)

Cowork đăng bài lên kênh mạng xã hội của công ty thay bạn, theo giờ đã hẹn, và **chỉ báo "Đã đăng" khi đã đọc lại thấy bài trên kênh**. Đăng được lên **WordPress** (0.23), **Facebook Page, Instagram, YouTube** (0.24); lấy ảnh / video từ **Google Drive** (0.24). Zalo OA mở ở bản sau.

> Ghi chú 0.24.0: phần Facebook / Instagram / YouTube / Google Drive được viết theo tài liệu công khai của Meta và Google và thử bằng máy chủ giả — **chưa kiểm với API thật**. Lần đầu nối kênh thật, làm theo mục 8–10 và báo bộ phận kỹ thuật nếu gặp lỗi lạ.

Ai làm gì:

| Vai trò | Được làm |
|---|---|
| Nhân viên Marketing | Nối kênh, soạn bài, đăng ngay, hẹn giờ, hủy lịch, đăng lại, xóa nháp, xuất CSV |
| Trưởng phòng Marketing | Như trên + **duyệt** bài người khác soạn |
| Thực tập sinh Marketing | Soạn bài của mình và **gửi duyệt** (không tự đăng) |
| Giám đốc / Quản trị | Tất cả; nhập thông tin app Meta / Google / Zalo (cần bật xác thực 2 lớp); sửa trang Điều khoản / Quyền riêng tư / Xóa dữ liệu |

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

Dành cho Giám đốc / Quản trị (**phải bật xác thực 2 lớp**). Dùng khi nối Facebook / Instagram (Meta), YouTube / Google Drive (Google), Zalo OA; WordPress không cần. Làm từng bước ở mục 8 (Meta) và mục 9 (Google).

1. Màn hình hiện sẵn **tên miền** và **Redirect URI** của từng nền tảng (lấy từ địa chỉ Cowork) — bấm **Sao chép** rồi dán vào trang của nền tảng.
2. Mỗi nền tảng có **Hướng dẫn từng bước** (vào đâu trên Meta for Developers / Google Cloud Console / Zalo for Developers, bật API nào, dán URL nào).
3. Nhập App ID / Client ID và **App Secret / Client Secret / Secret Key** → **Lưu**. Sau khi lưu, bí mật **không bao giờ hiện lại** — chỉ thấy 4 ký tự cuối và lúc cập nhật. Muốn đổi: nhập giá trị mới rồi Lưu; muốn bỏ: **Xóa**.
4. **Kiểm tra**: Meta — Cowork xin "app token" của Meta, báo đúng / sai App ID + Secret. Google, Zalo — chỉ kiểm định dạng (kiểm thật khi nối kênh đầu tiên).
5. Kỹ thuật và Marketing chỉ thấy "Đã cấu hình / Chưa cấu hình". Dòng "Đang dùng giá trị từ máy chủ" nghĩa là chưa nhập trên màn hình và máy chủ đang dùng giá trị trong `.env`.

Nền tảng yêu cầu trang **Điều khoản**, **Quyền riêng tư**, **Xóa dữ liệu** khi tạo / duyệt app — từ 0.24 Cowork có sẵn (mục 11); màn hình Kết nối nền tảng hiện sẵn đường dẫn để dán.

## 6. Cấu hình (Quản trị → Cấu hình hệ thống → Mạng xã hội)

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| Bài do AI tạo phải duyệt | 1 | 0 = không bắt buộc (không khuyến nghị) |
| Mọi bài phải duyệt trước khi đăng | 0 | 1 = cả bài người soạn cũng phải duyệt (0.24) |
| Số video tải lên YouTube tối đa mỗi ngày | 100 | Đếm chung mọi kênh YouTube; ngày đổi lúc 14–15 giờ chiều giờ Việt Nam (nửa đêm giờ Mỹ Thái Bình Dương). Chạm ngưỡng → dời sang ngày sau và báo (0.24) |
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
| Kênh "Cần cấp lại quyền" (Facebook / Instagram / YouTube) | Bấm **Kết nối lại** ở Mạng xã hội → Kênh (đăng nhập lại, giữ nguyên kênh), rồi vào bài lỗi bấm **Đăng lại** |
| "Instagram cần Cowork chạy ở địa chỉ https công khai" | Báo quản trị máy chủ: `APP_URL` phải là `https://…` truy cập được từ Internet |
| "Chưa nhập thông tin app …" khi bấm Kết nối | Giám đốc / Quản trị làm mục 8 / 9 rồi nhập ở Quản trị → Kết nối nền tảng (API) |
| Google báo "redirect_uri_mismatch" / Facebook báo "URL bị chặn" | Redirect URI trên Google Cloud / Meta phải dán ĐÚNG từng ký tự như màn hình Kết nối nền tảng (https, không thừa dấu /) |
| "Google không trả refresh token" | Vào myaccount.google.com/permissions → gỡ quyền TGTH Cowork → Kết nối lại |
| Kênh YouTube "Cần cấp lại quyền" mỗi tuần | Màn hình OAuth của Google đang "External + Testing" (Google cho token 7 ngày) — chuyển "Internal" (Google Workspace) hoặc xuất bản app |
| Video bị từ chối (thời lượng / tỉ lệ / mã hóa) | Cowork không tự sửa video — xuất lại bằng phần mềm dựng: MP4, H.264, Reels khổ dọc 1080×1920 |
| Bài YouTube "dời sang ngày sau" | Đã chạm ngưỡng tải lên trong ngày — Cowork tự đăng lúc đầu ngày hạn mức mới; muốn tăng thì sửa Cấu hình (và xin Google tăng quota nếu cần) |

## 8. Tạo app trên Meta for Developers (Giám đốc / Quản trị — làm một lần)

Cần: tài khoản Facebook đang là **quản trị viên Page** của công ty; Page đã gắn tài khoản **Instagram chuyên nghiệp** (Instagram → Cài đặt → Tài khoản → Chuyển sang tài khoản chuyên nghiệp → liên kết Page). Mở sẵn màn hình **Quản trị → Kết nối nền tảng (API)** của Cowork ở một thẻ khác để chép các đường dẫn.

1. Vào **developers.facebook.com** → đăng nhập → **My Apps** (Ứng dụng của tôi) → **Create App** (Tạo ứng dụng).
2. Chọn loại **Business** (Doanh nghiệp) → đặt tên, ví dụ `TGTH Cowork`, email liên hệ → chọn **Business Portfolio** của công ty (nếu có) → **Create app**. App mới ở **chế độ phát triển (Development)** — đủ cho Page của chính công ty, KHÔNG cần gửi Meta duyệt.
3. **App settings → Basic** (Cài đặt → Cơ bản):
   - **App Domains**: dán *Tên miền của app* từ màn hình Kết nối nền tảng.
   - **Privacy Policy URL**: dán *Chính sách quyền riêng tư*; **Terms of Service URL**: dán *Điều khoản sử dụng*.
   - **User data deletion**: chọn *Data deletion callback URL* → dán *Data Deletion Callback của Meta*.
   - Bấm **Save changes**. Chép **App ID** và **App Secret** (bấm *Show*, nhập lại mật khẩu Facebook) — để dán vào Cowork ở bước 7.
4. **Add product** (Thêm sản phẩm) → **Facebook Login for Business** → **Set up**. Vào **Facebook Login for Business → Settings**: ô **Valid OAuth Redirect URIs** dán *Redirect URI của Meta* (đúng từng ký tự, bắt đầu `https://`) → **Save**.
5. Quyền (Permissions): ứng dụng ở chế độ phát triển được dùng các quyền sau cho người có vai trò trong app — `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`, `publish_video`, `instagram_basic`, `instagram_content_publish`, và `business_management` nếu Page nằm trong Business Manager. (Tùy chọn) **Facebook Login for Business → Configurations → Create configuration**: chọn loại *User access token*, tích đủ các quyền trên → chép **Configuration ID** để dán vào Cowork.
6. **App roles → Roles** (Vai trò): **Add People** → thêm tài khoản Facebook quản trị Page làm **Administrator** (hoặc Developer / Tester) → người đó vào Facebook chấp nhận lời mời. Chỉ người có vai trò mới kết nối được khi app còn ở chế độ phát triển.
7. Trong Cowork, **Quản trị → Kết nối nền tảng (API) → Meta**: dán **App ID**, **App Secret**, (tùy chọn) **Configuration ID**; giữ **Phiên bản Graph API** điền sẵn (đổi khi Meta ra bản mới) → **Lưu** → **Kiểm tra** (báo đạt = đúng App ID / Secret).

Muốn người NGOÀI công ty (khách hàng) dùng: phải **xác minh doanh nghiệp** trên Meta Business và gửi **App Review** cho từng quyền (kèm video quay quy trình) — chưa cần ở bản này.

## 9. Tạo project trên Google Cloud (Giám đốc / Quản trị — làm một lần)

1. Vào **console.cloud.google.com** → đăng nhập bằng tài khoản Google của công ty (nên là tài khoản sở hữu kênh YouTube) → chọn dự án ở thanh trên → **New Project** → tên `TGTH Cowork` → **Create**.
2. **APIs & Services → Library** (Thư viện): tìm và bấm **Enable** (Bật) lần lượt **YouTube Data API v3**, **Google Drive API**, **Google Picker API**.
3. **APIs & Services → OAuth consent screen** (Màn hình xin quyền):
   - Công ty dùng **Google Workspace** (email @tên-công-ty): chọn **Internal** — chỉ người trong công ty dùng, không cần Google duyệt, token không hết hạn sau 7 ngày.
   - Không có Workspace: chọn **External** → ở mục **Test users** bấm **Add users** và thêm email Google của từng người sẽ kết nối (lưu ý: chế độ thử nghiệm Google cho token 7 ngày → mỗi tuần bấm “Kết nối lại”; muốn bỏ thì **Publish app**, quyền YouTube là quyền nhạy cảm nên Google có thể yêu cầu xác minh).
   - Điền **App name** `TGTH Cowork`, email hỗ trợ, **Authorized domains** = *Tên miền của app*, link **Privacy policy** / **Terms of service** = hai trang công khai của Cowork → **Save**.
   - Mục **Scopes** (Data access): thêm `.../auth/youtube.upload`, `.../auth/youtube.readonly`, `.../auth/drive.file`. KHÔNG thêm `drive.readonly` (quyền nhạy cảm, Cowork không cần).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**: loại **Web application** → tên `Cowork` → **Authorized JavaScript origins**: thêm địa chỉ Cowork (ví dụ `https://cowork.itw.vn`, không có dấu / cuối) → **Authorized redirect URIs**: dán *Redirect URI của Google* → **Create** → chép **Client ID** và **Client Secret**.
5. **Create credentials → API key** → bấm vào khóa vừa tạo → **Application restrictions: Websites (HTTP referrers)** → thêm *Referrer cho Google API key (Picker)* (dạng `https://cowork.itw.vn/*`) → **API restrictions: Restrict key** → chọn **Google Picker API** → **Save** → chép khóa (bắt đầu `AIza…`).
6. Trong Cowork, **Quản trị → Kết nối nền tảng (API) → Google**: dán **OAuth Client ID**, **Client Secret**, **Google API key (Picker)** → **Lưu** → **Kiểm tra** (Google chỉ kiểm định dạng; kiểm thật khi nối kênh đầu tiên).

## 10. Kết nối kênh Facebook / Instagram / YouTube (Marketing)

1. **Mạng xã hội → Kênh** → **Kết nối Facebook Page / Instagram** (hoặc **Kết nối kênh YouTube**).
2. Màn hình **đồng ý của Cowork** liệt kê từng quyền xin và để làm gì → đọc → **Tiếp tục tới Facebook / Google**. Liên kết chỉ dùng được một lần trong 10 phút, trên đúng trình duyệt này.
3. Trên Facebook: đăng nhập tài khoản quản trị Page → **Tiếp tục** → tích chọn **các Page** và **tài khoản Instagram** cần cho Cowork dùng → cho phép đủ quyền → **Lưu**. Trên Google: chọn tài khoản → **Cho phép** (Allow).
4. Quay về Cowork, màn hình **Chọn kênh để nối** (chờ vài giây) liệt kê Page / Instagram / kênh YouTube tìm được → tích những kênh muốn nối → **Lưu**. Kênh không chọn thì Cowork không giữ quyền.
5. Kênh hiện ở bảng **Kênh đã nối**, trạng thái **Đang nối**, có liên kết mở Page / Instagram / kênh.

Về sau: Cowork tự làm mới quyền trước khi hết hạn. Khi Facebook / Google thu hồi quyền (đổi mật khẩu, gỡ ứng dụng, mất vai trò quản trị Page…), kênh chuyển **"Cần cấp lại quyền"** và Marketing nhận thông báo → bấm **Kết nối lại** ở kênh đó (làm lại bước 2–4, chọn đúng kênh). **Ngắt kết nối** xóa quyền đã lưu; nhớ gỡ thêm ứng dụng trên Facebook (Cài đặt → Doanh nghiệp tích hợp) hoặc myaccount.google.com/permissions.

## 11. Đăng lên Facebook, Instagram, YouTube

Soạn bài như mục 3, chọn kênh. Cowork tự chọn cách đăng theo nội dung của bài, hiện ở trang bài cạnh từng kênh:

| Nền tảng | Nội dung bài | Cách đăng |
|---|---|---|
| Facebook | Chỉ chữ (có thể kèm **Liên kết đính kèm**) | Bài chữ, Facebook dựng khung xem trước liên kết |
| Facebook | 1 ảnh / 2–10 ảnh | Bài ảnh / album |
| Facebook | 1 video | Video; tích **Đăng thành Reels** nếu video dọc 9:16, 3–90 giây (tối đa 30 Reels / 24 giờ mỗi Page) |
| Instagram | 1 ảnh / 2–10 ảnh | Ảnh / Carousel. Ảnh tỉ lệ từ 4:5 (dọc) tới 1,91:1 (ngang), ≤ 8 MB; PNG / WebP tự đổi JPEG |
| Instagram | 1 video | Reels (3 giây – 15 phút, H.264); Instagram có hạn mức số bài / 24 giờ — hết thì Cowork tự hoãn |
| YouTube | đúng 1 video + **tiêu đề** | Chọn **Quyền riêng tư**: Riêng tư / Không công khai / Công khai (mặc định Riêng tư). Video dọc ≤ 3 phút YouTube tự xếp vào Shorts |

- **Ảnh / video**: tải thẳng ở khung Tệp đính kèm (tối đa 20 MB), hoặc **Chọn từ Google Drive** (tối đa 10 tệp mỗi lần; video tới 200 MB). Lần đầu Google hỏi cho phép Cowork mở hộp chọn tệp → chọn tài khoản → Cho phép. Cowork chỉ đọc được đúng tệp bạn chọn, tệp trên Drive vẫn riêng tư.
- Bấm Đăng ngay / Hẹn giờ / Gửi duyệt: Cowork **kiểm định dạng theo từng nền tảng** trước (kích thước, tỉ lệ, thời lượng, mã hóa video). Không hợp thì báo rõ lý do + cách sửa — Cowork **không tự cắt / chuyển mã video**.
- Instagram cần Cowork chạy ở địa chỉ **https công khai** (Instagram tự tải ảnh / video từ Cowork).
- Video YouTube lớn tải từng đoạn; mất mạng giữa chừng Cowork tải tiếp từ chỗ dừng (không tải lại từ đầu). Hết lượt tải lên trong ngày (Cấu hình) → bài **dời sang ngày sau**, người soạn nhận thông báo.
- Bài lỗi một phần (có kênh đã lên, có kênh lỗi): bản này chưa sửa riêng được từng kênh (0.25) — **Đăng lại** kênh lỗi, hoặc tạo bài mới cho kênh lỗi.

## 12. Trang công khai (Điều khoản, Quyền riêng tư, Xóa dữ liệu)

- Ba trang `/dieu-khoan`, `/quyen-rieng-tu`, `/xoa-du-lieu` mở được không cần đăng nhập (đường dẫn đầy đủ có `?dn=<mã doanh nghiệp>` — lấy ở màn hình Kết nối nền tảng). Meta / Google bắt buộc có khi tạo app.
- Nội dung mặc định là **BẢN MẪU — cần luật sư rà**. Giám đốc / Quản trị sửa ở **Quản trị → Trang công khai** (chữ thường: dòng `## ` là tiêu đề mục, dòng `- ` là gạch đầu dòng).
- Khi một người gỡ ứng dụng trên Facebook, Meta tự gửi **yêu cầu xóa dữ liệu** tới Cowork: Cowork kiểm chữ ký, xóa quyền (token) mọi Page / Instagram người đó đã cấp, kênh chuyển "Đã ngắt", lượt đăng chưa chạy bị hủy, Marketing nhận thông báo. Người đó nhận một **mã xác nhận** và tra trạng thái ở trang Xóa dữ liệu.
