# Chạy thử TGTH Cowork trên máy Windows

> **Cách nhanh nhất, không cần cài Git, Node.js hay Docker:** bấm đúp **`CAI-NHANH-TGTH-COWORK.bat`**. Bộ cài tự tải mọi thứ vào `L:\TGTH-Cowork` (không có ổ L: thì vào thư mục người dùng), dựng xong thì mở phần mềm. Đã cài bản cũ thì bấm lại tệp này để cập nhật: dữ liệu thử và `.env` được giữ. Phần dưới đây là cách cài bằng Docker Desktop.

Bộ này dựng TGTH Cowork (bản trên nhánh `release/0.21`) chạy riêng trên **một máy Windows**, với **dữ liệu thử DEMO**. Nó không kết nối và không đụng gì tới bản đang chạy thật ở thegioitinhoc.io.vn.

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

**Cập nhật bản mới:** bấm đúp lại `TAI-VE-VA-CAI-DAT.bat`. Tệp này lấy mã mới nhất của nhánh `release/0.21` rồi cài lại.

## 4b. Thử phần Nhân sự (0.19 → 0.21): chấm công, giao việc, đánh giá, thực tập, lương

Đăng nhập `giamdoc@demo.test` (doanh nghiệp `demo`), menu **Nhân sự**:

- **Bảng chấm công trực tiếp**: ai đã vào ca, đi muộn, chưa đến, đang ở hiện trường; tự làm mới mỗi 10 giây. **Chấm công** (GPS): bấm Vào ca / Ra ca trên trình duyệt (trình duyệt hỏi quyền vị trí → Cho phép).
- **Công việc**: giao việc có độ khó, cần duyệt; người nhận bấm Nhận / Từ chối; thẻ *Chờ tôi duyệt*, *Chờ tôi nhận*; **Mẫu & định kỳ**.
- **Báo cáo công việc** (ngày / tuần), **Đánh giá** (kỳ tháng / quý, xếp loại A/B/C/D), **Bộ KPI**.
- **Thực tập**: nhật ký tuần, phiếu đánh giá theo mẫu của trường, in A4.
- **Tính lương**: bắt buộc **xác thực 2 lớp** — vào *Tài khoản của tôi → Bật xác thực 2 lớp* (cài Google Authenticator / Microsoft Authenticator trên điện thoại, quét mã). Sau đó: Hồ sơ lương, Tham số lương, Kỳ lương, Phiếu lương của tôi.

### Những phần chưa có — bổ sung ngay trong phần mềm khi đang chạy

| Phần | Bổ sung ở đâu |
|---|---|
| **Máy chấm công vân tay** (ZKTeco) | Mở bằng **`CHAY-MANG-NOI-BO.bat`** (thay cho CHAY.bat) — cửa sổ hiện IP của máy tính. Trên máy chấm công: *Comm. → Cloud Server Setting (ADMS)*: Server Address = IP đó, Port = 3000, tắt HTTPS. Trong Cowork: **Nhân sự → Máy chấm công → Đăng ký máy** (nhập số serial SN). Gán mã chấm công (PIN) cho nhân viên ở **Nhân sự → Hồ sơ nhân sự**. Khoảng 1 phút sau máy hiện *Trực tuyến*. |
| **Mẫu phiếu đánh giá sinh viên của trường** | **Thực tập → Mẫu phiếu → Thêm mẫu (từ mẫu chung)** → soạn bằng biểu mẫu (ô thông tin, phần, tiêu chí, thang điểm), bấm *Xem trước bản in* để so với mẫu giấy. |
| **Địa điểm làm việc / bán kính GPS, ca, lịch làm việc, ngày lễ** | **Nhân sự → Thiết lập chấm công**. |
| **Tham số lương** (bảo hiểm, lương tối thiểu vùng, giảm trừ, biểu thuế) | **Tính lương → Tham số lương**: đúng thì bấm *Xác nhận*, sai thì *Nhập bộ mới* cùng ngày hiệu lực. Bảng lương dùng tham số chưa xác nhận sẽ không gửi duyệt được. |
| **Hồ sơ lương, phụ cấp, người phụ thuộc, tài khoản ngân hàng** | **Tính lương → Hồ sơ lương** (một người không tự sửa hồ sơ của chính mình). |
| **Logo công ty** (in phiếu, báo giá) | **Quản trị → Hồ sơ công ty**. |

> Chấm công GPS trên **điện thoại** cần địa chỉ **https** — trên máy chạy thử (http) chỉ thử được ngay trên máy tính này. Máy chấm công vân tay chạy được qua http trong mạng nội bộ.

## 4a. Thử các tính năng mới của 0.17.0 và 0.16.1

- **Công việc → mở một việc**: trang chi tiết có danh sách kiểm tra, tệp đính kèm, nút Bắt đầu làm / Hoàn thành / Giao lại / Mở lại.
  - Bấm **Hoàn thành**: phải ghi kết quả (ít nhất 10 ký tự) và chọn đánh giá *Đạt / Đạt một phần / Không đạt / Cần làm tiếp*. Chọn "Cần làm tiếp" thì phải hẹn việc tiếp theo.
  - Thẻ **Tôi giao** liệt kê việc mình giao cho người khác. Giao việc cho tài khoản khác rồi đăng nhập tài khoản đó để xem thông báo.
- **CRM → Khách hàng → một khách**: điểm đầy đủ hồ sơ (0–100) và các trường còn thiếu; kết quả công việc hiện trên dòng thời gian.
- **Bán hàng**: chấp nhận báo giá thì cơ hội tự chuyển sang Thắng; một báo giá chỉ ra được một đơn; hủy đơn còn hóa đơn sẽ bị chặn kèm số hóa đơn.
- **Kho**: xác nhận đơn ở kho A rồi xuất từ kho B, phần giữ chỗ ở kho A được nhả; khách trả máy có sê-ri thì máy bán lại được cho khách khác.
- **Tài chính**: hai người cùng thu một hóa đơn không thể thu vượt số nợ; hủy hóa đơn đã có giảm trừ trả hàng bị chặn.
- **Quản trị → Tự động hóa**: thẻ Worker và Sao lưu. Trên máy chạy thử không có sao lưu nên băng đỏ "chưa sao lưu" là bình thường.

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
