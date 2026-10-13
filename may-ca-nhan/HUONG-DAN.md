# Chạy thử TGTH Cowork trên máy Windows

Bộ này dựng TGTH Cowork (bản trên nhánh `release/0.16`) chạy riêng trên **một máy Windows**, với **dữ liệu thử DEMO**. Nó không kết nối và không đụng gì tới bản đang chạy thật ở thegioitinhoc.io.vn.

- **Cơ sở dữ liệu**: PostgreSQL 16 và Redis 7 chạy trong Docker Desktop. Chỉ máy này truy cập được, qua cổng 55432 và 56379.
- **Phần mềm**: ứng dụng Next.js và worker chạy bằng Node.js. Mở trong trình duyệt tại **http://127.0.0.1:3000**.

## 1. Cài 3 phần mềm (một lần)

| Phần mềm | Tải ở đâu | Ghi chú |
|---|---|---|
| Git for Windows | https://git-scm.com/download/win | Cài mặc định |
| Node.js **22 LTS** | https://nodejs.org | Chọn bản "LTS", cài mặc định |
| Docker Desktop | https://www.docker.com/products/docker-desktop | Cài xong mở lên một lần, đợi góc dưới báo **Engine running**. Nếu Windows hỏi bật WSL 2 thì đồng ý và khởi động lại máy |

Máy nên có từ **8 GB RAM**, còn trống khoảng **5 GB** ổ đĩa. Lần cài đầu cần mạng Internet để tải gói npm và ảnh Docker.

## 2. Cài TGTH Cowork (một lần, 10–20 phút)

1. Mở Docker Desktop, đợi báo **Engine running**.
2. Bấm đúp **`TAI-VE-VA-CAI-DAT.bat`**. Tệp này tải mã nguồn về thư mục `C:\Users\<tên bạn>\TGTH-Cowork`, chạy cài đặt, rồi mở phần mềm.
   - Nếu kho mã trên GitHub đang để **Private**, Git sẽ mở cửa sổ đăng nhập GitHub. Đăng nhập bằng tài khoản có quyền xem kho `quangkhaivn/itw-cowork`.
3. Bộ cài chạy 8 bước:
   1. Kiểm tra máy.
   2. Tạo tệp `.env` với mật khẩu và khoá ngẫu nhiên.
   3. Bật CSDL.
   4. Tạo vai cho ứng dụng.
   5. Cài gói npm.
   6. Tạo bảng và bật bảo mật theo doanh nghiệp.
   7. Nạp dữ liệu nền và dữ liệu mẫu DEMO.
   8. Dựng bản chạy.

   Xong sẽ hiện **CÀI ĐẶT XONG** và trình duyệt tự mở.

Thông tin đăng nhập được ghi vào tệp `THONG-TIN-DANG-NHAP.txt` trong thư mục `TGTH-Cowork`:

| Doanh nghiệp (ô "Mã doanh nghiệp") | Tài khoản | Mật khẩu |
|---|---|---|
| `demo`: công ty mẫu, có sẵn khách, báo giá, đơn hàng, kho, hoá đơn | `giamdoc@demo.test` (Giám đốc). Các vai trò khác: `quantri@`, `tp.kinhdoanh@`, `kd1@`, `kd2@`, `marketing@`, `ketoan@`, `tp.kythuat@`, `ktv1@`, `cskh@`, `kho@` (đều `…@demo.test`) | `MauThu2026x` |
| `itw`: doanh nghiệp trống, để thử khai báo từ đầu | `admin@thegioitinhoc.vn` | Xem trong `THONG-TIN-DANG-NHAP.txt` (lần đầu bắt đổi) |

Mỗi vai trò thấy một menu khác nhau, nên có thể đăng nhập từng tài khoản để xem phân quyền.

## 3. Dùng hằng ngày

Mở thư mục `TGTH-Cowork\may-ca-nhan`:

| Tệp | Việc |
|---|---|
| **`CHAY.bat`** | Bật CSDL, mở 2 cửa sổ đen "TGTH Cowork – ung dung" và "TGTH Cowork – worker", rồi mở trình duyệt. **Không đóng 2 cửa sổ đó khi đang dùng.** |
| **`DUNG.bat`** | Tắt CSDL trong Docker. Đóng 2 cửa sổ đen trước. Dữ liệu được giữ lại. |
| **`CAI-DAT.bat`** | Chạy lại sau mỗi lần cập nhật mã. Dữ liệu và `.env` được giữ nguyên. |
| **`XOA-DU-LIEU-THU.bat`** | Xoá sạch dữ liệu thử để cài lại từ đầu. Phải gõ `XOA` để xác nhận. |

**Cập nhật bản mới:** bấm đúp lại `TAI-VE-VA-CAI-DAT.bat`. Tệp này lấy mã mới nhất của nhánh `release/0.16` rồi cài lại.

## 4. Thử các tính năng mới của 0.16.0

- **CRM → Khách hàng**: thẻ hành trình, lọc nhanh, cột Điểm, bộ lọc đã lưu, Cột hiển thị, Xuất/Nhập CSV, Gộp khách trùng.
- **CRM → Hành trình khách hàng**: kéo thả các bước, phễu chuyển đổi. **Chấm điểm khách**: đặt ngưỡng Nóng/Ấm.
- **Marketing → Chiến dịch marketing**: tạo chiến dịch, ghi chi phí, xem CPL/ROAS.
  - **Form đăng ký**: tạo form, mở đường dẫn công khai `/f/demo/...` (thử cả trên điện thoại cùng mạng nếu cần).
  - **Landing page**, **Phân khúc**, **Nhận lead**.
- **Marketing → Đợt gửi email / Mẫu email**: soạn thư, chọn phân khúc, gửi duyệt, duyệt.
  - Muốn gửi **thật** thì vào **Quản trị → Kết nối email** khai hộp thư. Gmail/Google Workspace phải dùng **Mật khẩu ứng dụng**, không dùng mật khẩu đăng nhập.
- **Quản trị → Xác thực 2 lớp**; **Tài khoản của tôi → bật xác thực 2 lớp** bằng ứng dụng Google Authenticator / Microsoft Authenticator.
- **Bán hàng → Báo giá → In**: bản in theo mẫu ITW. Tải logo ở **Quản trị → Hồ sơ công ty**.
- **Trợ lý ITA**: cần khoá API. Điền `ANTHROPIC_API_KEY=` trong tệp `.env` rồi chạy lại `CHAY.bat`.

## 5. Gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| "Docker Desktop chưa chạy" | Mở Docker Desktop, đợi **Engine running**, chạy lại |
| Cửa sổ đen báo lỗi rồi tắt ngay khi bấm `.bat` | Chuột phải tệp `.bat` → *Properties* → tích **Unblock** (nếu có) → OK, chạy lại |
| `npm ci` lỗi mạng | Kiểm tra Internet/proxy công ty, chạy lại `CAI-DAT.bat` |
| Cổng 3000 đã có phần mềm khác dùng | Tắt phần mềm đó, hoặc báo người hỗ trợ đổi cổng trong `chay.ps1` |
| Trình duyệt báo không mở được trang | Xem lỗi trong cửa sổ "TGTH Cowork – ung dung"; đóng cả 2 cửa sổ đen rồi chạy lại `CHAY.bat` |
| Muốn làm lại từ đầu | `XOA-DU-LIEU-THU.bat` → `CAI-DAT.bat` |

Bộ này **chỉ để chạy thử**. Máy chủ thật triển khai theo `DEPLOYMENT.md` (Docker Compose ở thư mục gốc, `trien-khai.sh`).
