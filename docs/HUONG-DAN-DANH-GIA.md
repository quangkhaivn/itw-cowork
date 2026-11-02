# Hướng dẫn: giao việc, báo cáo, duyệt, đánh giá, KPI, thực tập (0.20.0)

Tài liệu cho **Nhân sự**, **quản lý / trưởng phòng**, **nhân viên** và **thực tập sinh**. Luật đầy đủ: `BUSINESS_RULES.md` mục 31.

Vòng một việc: **giao → nhận → làm và báo tiến độ → xong (chờ duyệt) → duyệt và chấm điểm**. Điểm từng việc cộng vào KPI tháng, nên cuối tháng quản lý không phải nhớ lại ai làm tốt việc gì.

---

## 1. Nhân sự (HR) — chuẩn bị một lần

1. **Hồ sơ nhân sự** (Nhân sự → Hồ sơ nhân sự): khai **quản lý trực tiếp** cho từng người. Người **không có** quản lý trực tiếp vẫn phải nộp báo cáo và vẫn có phiếu đánh giá — **Giám đốc** nhận báo cáo, nhận xét và chấm phiếu của họ (QĐ-132; nhiều Giám đốc thì người tạo tài khoản sớm nhất). Giám đốc không phải báo cáo, trừ khi bật Cấu hình *Giám đốc cũng phải báo cáo*. Ghi **chức danh** để chọn đúng bộ KPI. Thực tập sinh: loại nhân sự *Thực tập*, điền trường, khoa, MSSV, giảng viên, **người hướng dẫn**, thời gian.
2. **Báo cáo ngày theo phòng**: Kinh doanh và Kỹ thuật đã bật sẵn. Muốn bật / tắt phòng khác: báo quản trị (cột `daily_report` của phòng).
3. **Cấu hình** (Quản trị → Cấu hình):
   - *Công việc – giao và duyệt*: hạn nhận việc, hạn duyệt (giờ), hệ số đúng hạn / trễ nhẹ / trễ nặng / không có hạn, ngưỡng trễ nhẹ.
   - *Báo cáo công việc*: hạn báo cáo tuần (thứ + giờ, mặc định thứ Sáu 17:00), hạn báo cáo ngày (giờ, mặc định 20:00), nhắc trước bao nhiêu giờ, *Giám đốc cũng phải báo cáo* (0 / 1, mặc định 0).
   - *Đánh giá nhân sự*: kỳ mặc định (1 = tháng, 3 = quý), trần % đạt mỗi chỉ tiêu, ngưỡng A / B / C (90 / 75 / 60), hệ số thưởng A / B / C / D (1,2 / 1 / 0,8 / 0), *Trưởng phòng được chốt phiếu* (0 / 1, mặc định 0 = chỉ Giám đốc chốt).
   - Mọi con số trên là **mặc định khi chưa đặt**; đổi ở Cấu hình, không cần sửa mã (QĐ-134).
4. **Bộ KPI** (Nhân sự → Bộ KPI): mỗi vị trí 3–6 chỉ tiêu, trọng số cộng lại **100**.
   - Áp cho *chức danh* (khớp đúng chữ trên hồ sơ, không phân biệt hoa thường) hoặc *vai trò*. Để trống cả hai = **bộ mặc định** cho người không khớp bộ nào.
   - *Tự tính*: chọn chỉ số (doanh số đã thu, lead đã xử lý, tỷ lệ chuyển đổi, công nợ quá hạn, phiếu hỗ trợ xong, % trong hạn SLA, phiếu mở lại, lead marketing, tổng điểm việc, tỷ lệ bị trả lại, tỷ lệ đúng hạn) và mục tiêu tháng / quý. Chỉ tiêu "thấp là tốt" (công nợ quá hạn, phiếu mở lại, tỷ lệ trả lại): đạt mục tiêu khi **không vượt** mục tiêu.
   - *Quản lý chấm*: chỉ tiêu định tính (thái độ, chất lượng triển khai…), chấm 0–100.
5. **Mở kỳ đánh giá** (Nhân sự → Đánh giá nhân viên → *Mở kỳ đánh giá*): chọn tháng / quý. Máy tạo phiếu cho mọi người (trừ thực tập sinh và Giám đốc), người chấm = quản lý trực tiếp, không có thì Giám đốc; chụp chỉ tiêu + mục tiêu của bộ KPI và tính sẵn số liệu. Sửa bộ KPI sau đó **không** đổi phiếu đã mở. Mở nhầm tháng: vào kỳ → *Sửa kỳ* — chỉ được khi **chưa có phiếu nào chốt** (QĐ-140); sửa xong mở từng phiếu bấm *Làm mới số liệu*.
6. **Mẫu phiếu đánh giá thực tập** (Nhân sự → Thực tập → *Mẫu phiếu đánh giá*): xem mục 6 dưới đây.

## 2. Người giao việc / quản lý

### Giao việc
- Công việc → *Tạo công việc*: chọn người làm (chỉ người trong nhóm / phòng bạn quản lý), hạn, **độ khó 1–5**, danh sách kiểm tra. Có thể *Giao thêm người* — mỗi người nhận một việc riêng.
- **Cần duyệt** bật sẵn khi giao cho người khác. *Người duyệt* mặc định là bạn; chọn người khác nếu cần. Không ai được duyệt việc của chính mình.
- **Mẫu việc** (Công việc → *Mẫu & định kỳ*): điền sẵn tiêu đề, độ khó, danh sách kiểm tra, hạn sau N ngày và **chuỗi duyệt nhiều cấp** (vd cấp 1 người giao → cấp 2 trưởng phòng).
- **Việc định kỳ**: hằng ngày, hằng tuần (chọn thứ) hoặc hằng tháng (ngày 31 → tháng ngắn lấy ngày cuối tháng), hạn trong ngày. Máy tự sinh việc mỗi ngày lặp nhân danh bạn; không sinh trùng, không sinh bù ngày máy chủ tắt. Việc định kỳ **mặc định không cần duyệt** (QĐ-136) — bật *Cần duyệt khi xong* trên từng lịch nếu muốn chấm điểm.
- **Ai được đổi gì trên một việc** (QĐ-137): người làm, độ khó, cần duyệt, người duyệt, hạn chỉ **người giao**, **quản lý trực tiếp của người làm**, **Giám đốc / Quản trị** đổi được. Người khác dù sửa được việc (vd phạm vi toàn công ty) chỉ sửa tiêu đề, mô tả, ưu tiên, danh sách kiểm tra. **Người giao ghi một lần**: chuyển việc cho người khác không đổi người giao.

### Theo dõi
- Thẻ **Tôi giao**: việc bạn giao. Nhãn *Chờ nhận* / *Bị từ chối*. Người làm từ chối thì bạn nhận thông báo kèm lý do — *Giao lại* cho người khác, hoặc sửa việc rồi lưu để gửi lại.
- Quá hạn nhận (mặc định 24 giờ) máy nhắc bạn.
- **Xin gia hạn**: bạn nhận thông báo; mở việc → *Đồng ý* hoặc *Từ chối* (ghi lý do). Bạn đổi hạn trực tiếp cũng được ghi lại như một lần gia hạn. Người giao đã nghỉ thì đề nghị đi lên quản lý của người giao (không có thì Giám đốc).
- **Việc của nhóm** (Công việc → *Việc của nhóm*): mỗi người đang mở bao nhiêu việc, quá hạn, chờ nhận, chờ duyệt, xong tuần này, điểm việc tháng này.

### Duyệt và chấm điểm
- Thẻ **Chờ tôi duyệt**. Mở việc → *Duyệt + chấm điểm*: chọn chất lượng 1–5 (Kém → Xuất sắc), nhận xét. Hoặc *Trả lại* kèm lý do — việc về Đang làm, người làm sửa rồi gửi lại.
- Điểm việc = **độ khó × chất lượng × hệ số đúng hạn**. Máy tự tính đúng hạn theo **hạn cuối cùng** (sau gia hạn đã duyệt) và lúc người làm bấm Xong — người duyệt chậm không làm người làm bị trễ.
- Chuỗi nhiều cấp: cấp trước duyệt thì cấp sau nhận thông báo; chỉ cấp cuối chốt điểm.
- Thông báo "đã duyệt" gửi người giao **chỉ kèm điểm** khi người giao được xem đánh giá của người làm (QĐ-139); không thì chỉ báo đã duyệt.
- Sai điểm sau khi duyệt: *Điều chỉnh điểm* (người duyệt cấp cuối hoặc trưởng phòng / Giám đốc có quyền duyệt đánh giá trong phạm vi), bắt buộc lý do; lịch sử giữ lại.
- Việc đã duyệt không mở lại được.
- Đổi độ khó, bật / tắt cần duyệt, đổi người duyệt: mở việc → *Sửa độ khó / duyệt* (người giao / quản lý; người làm không tự đổi).

### Báo cáo của nhóm
- Báo cáo công việc → phần *Báo cáo của nhóm*: ai đã nộp (đúng hạn / trễ), ai chưa nộp / thiếu, vướng mắc. Báo cáo ngày chỉ tính **ngày phải làm** của từng người (QĐ-138): ngày không có ca theo lịch làm việc, ngày lễ, ngày nghỉ phép đã duyệt cả ngày không bắt buộc (không nhắc, không ghi thiếu); nghỉ nửa ngày vẫn phải báo cáo. Người chưa gán lịch làm việc: mọi ngày trừ lễ / nghỉ phép cả ngày.
- Mở báo cáo → *Nhận xét*, hoặc **Chuyển vướng mắc thành việc** (một nút; việc mới giao cho bạn, nội dung vướng mắc chép sẵn — đổi người làm ở trang việc).

### Đánh giá tháng / quý
- Nhân viên tự đánh giá xong thì bạn nhận thông báo. Mở phiếu → *Quản lý chấm*: chấm các chỉ tiêu định tính (0–100), có thể chấm đè chỉ tiêu tự tính khi số liệu chưa phản ánh đúng (ghi chú lý do), nhận xét → *Chấm xong, gửi chốt*.
- Phiếu hiện bối cảnh: báo cáo tuần và báo cáo ngày (chỉ ngày phải làm) đúng hạn / trễ / thiếu, công (từ bảng công tháng), điểm việc, tỷ lệ đúng hạn / bị trả lại. *Làm mới số liệu* trước khi chốt nếu cuối tháng còn phát sinh.
- **Giám đốc** *Chốt kết quả* (QĐ-133): điểm tổng → xếp loại A/B/C/D và hệ số thưởng. Trưởng phòng chấm rồi gửi chốt — Giám đốc nhận thông báo. Bật Cấu hình *Trưởng phòng được chốt phiếu* thì trưởng phòng chốt được phiếu người trong phạm vi. Không ai tự chốt phiếu của mình. Đã chốt thì không sửa; sai thì *Điều chỉnh sau khi chốt* (điểm mới + lý do), kết quả hiệu lực là lần điều chỉnh mới nhất.

## 3. Nhân viên

- Việc được giao: bấm **Nhận việc**, hoặc **Từ chối** kèm lý do (đang nghỉ phép, không đúng chuyên môn…). Bắt tay vào làm mà quên bấm Nhận thì máy coi như đã nhận.
- **Báo tiến độ**: % hoàn thành + ghi chú + ảnh / tệp. Người giao thấy ngay.
- Không kịp hạn: **Xin gia hạn** (hạn mới + lý do). Không tự sửa hạn việc người khác giao.
- Xong: *Hoàn thành* như trước (kết quả bắt buộc, đánh giá Đạt / Một phần / Không đạt / Cần làm tiếp). Việc cần duyệt chuyển **Chờ duyệt**; bị trả lại thì sửa và hoàn thành lại.
- **Báo cáo tuần** (Công việc → Báo cáo công việc): máy điền sẵn việc đã xong, đang làm, sắp tới hạn và số liệu (doanh số đã thu, phiếu hỗ trợ xong…). Bổ sung nhận định, ghi **vướng mắc**, *Nộp báo cáo* trước hạn (mặc định thứ Sáu 17:00). Nộp rồi không sửa được. Nộp trễ / không nộp được ghi vào đánh giá tháng — **không phạt tiền**. Phòng Kinh doanh, Kỹ thuật: báo cáo ngày trước 20:00.
- **Đánh giá tháng**: nhận thông báo khi mở kỳ → mở phiếu → *Tự đánh giá* (tự chấm, giải trình từng chỉ tiêu, nhận xét chung) → *Gửi quản lý*. Xem kết quả khi được chốt.

## 4. Thực tập sinh

- Chỉ thấy việc, nhật ký và phiếu đánh giá **của mình**.
- Mỗi tuần: Nhân sự → **Thực tập** → *Nhật ký tuần này*: đã làm gì, học được gì, vướng gì → *Nộp nhật ký*. Người hướng dẫn nhận xét, bạn nhận thông báo.
- Việc được giao làm như nhân viên (Nhận, báo tiến độ, Hoàn thành).

## 5. Người hướng dẫn thực tập

- Thực tập → chọn sinh viên → đọc nhật ký → *Nhận xét*.
- Cuối đợt: *Tạo phiếu đánh giá* → chọn sinh viên và **mẫu của trường**. Phiếu tự điền họ tên, MSSV, trường, khoa, giảng viên, người hướng dẫn, thời gian thực tập; tính sẵn **chuyên cần** (từ chấm công), **tỷ lệ việc đạt** và **chất lượng việc** (từ Công việc).
- Chấm từng tiêu chí (thang 10, chữ, hoặc Đạt / Không đạt theo mẫu). Tiêu chí có nguồn tự động để trống thì dùng số máy tính. Ghi các ô nhận xét, ô nhập tay (đề tài…). *Lưu điểm* → máy tính **điểm tổng** (trung bình có trọng số, thang 10) và chữ.
- *Chốt phiếu* khi đủ điểm (chốt rồi không sửa được) → *In / Lưu PDF*: tờ A4 theo đúng bố cục mẫu, có ô ký; in trước khi chốt mang chữ "BẢN NHÁP".

## 6. Mẫu phiếu đánh giá thực tập (Nhân sự)

Mỗi trường một mẫu. Mẫu dựng sẵn *Mẫu chung* dùng tạm khi chưa có mẫu của trường. Thực tập → *Mẫu phiếu đánh giá* → *Thêm mẫu (từ mẫu chung)* hoặc *Sửa* mở **trình soạn dạng biểu mẫu** (QĐ-131) — không cần biết JSON:

1. **Đầu phiếu**: tên đơn vị (góc trái), tiêu đề, tiêu đề phụ, bật / tắt quốc hiệu, bật / tắt in điểm tổng bằng chữ.
2. **Ô thông tin**: nhãn in trên phiếu + *Lấy từ* (họ tên, MSSV, trường, khoa, giảng viên, người hướng dẫn, từ / đến ngày, phòng ban, vị trí, hoặc *Nhập tay* — người hướng dẫn điền lúc chấm). Nút ↑ ↓ đổi thứ tự, ✕ xóa, *+ Thêm ô thông tin*.
3. **Phần và tiêu chí**: mỗi phần có tên (vd "I. Ý thức, thái độ") và các tiêu chí: tên, mô tả, **trọng số**, **thang** (*Điểm 10*, *Thang chữ*, *Có / Không* — Đạt = 10, Không đạt = 0), **nguồn tự động** (chuyên cần, tỷ lệ việc đạt, chất lượng việc — để trống khi chấm thì lấy số máy tính). Sắp xếp / xóa / thêm phần, tiêu chí bằng các nút. Đầu mục hiện tổng trọng số (điểm tổng là trung bình có trọng số nên không bắt buộc bằng 100).
4. **Thang chữ** (từ cao xuống thấp): chữ, điểm quy đổi khi chấm bằng chữ, ngưỡng điểm tổng để quy ra chữ.
5. **Ô nhận xét**, **ô ký** (nhãn + dòng ghi chú như "(Ký, ghi rõ họ tên)"), **ghi chú cuối phiếu**.
6. Thẻ **Xem trước bản in**: tờ A4 đúng như khi in (chữ "BẢN NHÁP").
7. *Lưu mẫu*: máy kiểm đúng như máy chủ và báo lỗi theo vị trí ("Phần thứ 2 Tiêu chí thứ 1 tên: tối thiểu 2 ký tự").

Mã của ô thông tin / tiêu chí / ô nhận xét / ô ký **tự sinh từ tên** (không dấu, không trùng) khi tạo mới; mã đã có giữ nguyên khi đổi tên — phiếu cũ chấm theo mã. Sửa mẫu tăng phiên bản; **phiếu đã tạo giữ mẫu cũ**. Khi chủ doanh nghiệp gửi mẫu giấy của trường: dựng lại đúng thứ tự tiêu chí, trọng số, thang điểm, ô nhận xét và ô ký của mẫu đó.

**JSON nâng cao** (thẻ thứ ba, cho người rành): cùng bố cục dưới dạng JSON.

| Trường | Ý nghĩa |
|---|---|
| `quocHieu` | `true` = in quốc hiệu, tiêu ngữ ở góc phải |
| `tenDonVi` | Tên công ty in góc trái |
| `tieuDe`, `tieuDePhu` | Tiêu đề phiếu và dòng phụ in nghiêng |
| `thongTin` | Danh sách ô thông tin `{ "ma", "nhan", "nguon" }`; `nguon` ∈ `ho-ten`, `mssv`, `truong`, `khoa`, `giang-vien`, `nguoi-huong-dan`, `tu-ngay`, `den-ngay`, `phong-ban`, `chuc-danh`, `tu-nhap` (người hướng dẫn nhập) |
| `phan` | Các phần `{ "ten", "tieuChi": [...] }`; mỗi tiêu chí `{ "ma", "ten", "trongSo", "thang": "10" / "chu" / "co-khong", "nguon": null hoặc "chuyen-can" / "ty-le-viec-dat" / "chat-luong-viec", "moTa" }` |
| `thangChu` | Thang chữ, **từ cao xuống thấp**: `{ "chu": "A", "diem": 9.5, "tu": 8.5 }` — `diem` là điểm quy đổi khi chấm bằng chữ, `tu` là ngưỡng thang 10 để quy điểm tổng ra chữ |
| `oNhanXet` | Ô nhận xét `{ "ma", "nhan" }` |
| `oKy` | Ô ký `{ "ma", "nhan", "ghiChu" }` |
| `ghiChu` | Ghi chú in cuối phiếu |
| `hienChu` | `true` = in chữ cạnh điểm tổng |

`ma` chỉ gồm chữ thường không dấu, số, gạch ngang (≤ 30), không trùng trong mẫu; để trống thì máy tự sinh từ tên.

## 7. Hỏi nhanh

- *Việc tự tạo có cần duyệt?* Không, trừ khi bạn bật và chọn người duyệt khác mình.
- *Giám đốc giao việc cho kỹ thuật viên phòng khác được không?* Được — phạm vi toàn công ty. Trưởng phòng chỉ giao trong nhóm / phòng mình.
- *Người duyệt nghỉ việc / bị khóa tài khoản thì sao?* (QĐ-135) Lúc quản trị khóa tài khoản (hoặc *Bàn giao khi nghỉ việc*), mọi bước đang chờ người đó — duyệt việc, quyết định gia hạn, báo cáo chưa nhận xét của cấp dưới (14 ngày gần nhất), phiếu đánh giá chờ chấm — **tự chuyển cho quản lý trực tiếp của họ**, không có thì Giám đốc. Người nhận lại chính là người làm việc đó → đi tiếp lên cấp trên (không ai tự duyệt). Mỗi lần chuyển ghi ở *Nhật ký việc → Chuyển bước duyệt* và người nhận được thông báo. Màn hình bàn giao hiện trước số bước sẽ chuyển; các bước này **không** chuyển cho người nhận bàn giao.
- *Không có quản lý trực tiếp thì báo cáo cho ai?* Giám đốc (QĐ-132).
- *Trợ lý AI có xem được điểm, phiếu đánh giá?* Không.
