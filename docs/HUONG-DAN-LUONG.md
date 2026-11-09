# Hướng dẫn tính lương (0.21.0, cập nhật 0.22.0)

Tài liệu cho **Kế toán**, có phần cho **Nhân sự** và **Giám đốc**. Viết cho người không chuyên kỹ thuật. Luật đầy đủ: `BUSINESS_RULES.md` mục 32.

Một tháng lương đi đúng một đường:

**Nhân sự khóa bảng công → Kế toán tính và kiểm → Kế toán gửi duyệt → Giám đốc duyệt → Giám đốc khóa → Kế toán chi lương.**

Đã khóa thì không ai sửa được bảng lương nữa (kể cả quản trị hệ thống). Sai sót phát hiện sau đó sửa bằng **khoản điều chỉnh ở tháng sau**.

> **0.22.0 — không cần đủ dữ liệu mới tính được** (`BUSINESS_RULES.md` mục 33). Bảng công chưa khóa, tham số chưa xác nhận, người chưa có tài khoản ngân hàng / mã số thuế / hồ sơ lương: phần mềm vẫn tính, hiện **cảnh báo vàng** và chỗ bổ sung. Việc còn thiếu xem ở **Tổng quan → Thiết lập ban đầu**. Chỉ chặn khi vi phạm toàn vẹn / bảo mật (tự duyệt, sửa sau khóa, thực lĩnh âm…).

---

## 0. Trước khi bắt đầu (làm một lần)

### 0.1. Bật xác thực 2 lớp

Người xem hoặc tính lương của người khác (Kế toán, Nhân sự, Giám đốc, Quản trị) **bắt buộc** bật xác thực 2 lớp. Chưa bật thì trang lương hiện hướng dẫn **từng bước** và nút **Đi tới trang bật 2 lớp**. (0.22.0: Cấu hình → Tính lương → *Bắt buộc xác thực 2 lớp khi xem / tính lương người khác*, mặc định bật; chỉ Giám đốc / Quản trị đổi được, mỗi lần đổi có nhật ký — chỉ nên tạm tắt trong tuần đầu triển khai.) **Lưu ý khi tắt:** người chưa bật 2 lớp làm được **mọi** thao tác lương theo quyền của mình — kể cả **duyệt và khóa** bảng lương (luật không tự duyệt, người tính không duyệt vẫn áp). Bật lại ngay khi mọi người đã cài xong.

1. Cài ứng dụng xác thực trên điện thoại (Google Authenticator hoặc Microsoft Authenticator).
2. Vào **Tài khoản của tôi → Xác thực 2 lớp → Bật**, **nhập lại mật khẩu đăng nhập hiện tại**, quét mã QR, nhập mã 6 số đang hiện.
3. Chép 10 mã khôi phục, cất nơi an toàn (mất điện thoại thì dùng mã này).

Đổi điện thoại: **Đổi điện thoại** → mật khẩu hiện tại + mã 6 số trên điện thoại CŨ (mất máy cũ thì dùng mã khôi phục, hoặc nhờ Quản trị đặt lại). Tắt 2 lớp cũng cần mật khẩu + mã. Nhập sai mật khẩu / mã nhiều lần → tài khoản bị khóa tạm như khi đăng nhập sai.

Nhân viên xem **phiếu lương của chính mình** thì không cần 2 lớp.

### 0.2. Kiểm và xác nhận tham số (quan trọng)

Vào **Tính lương → Tham số lương**. Phần mềm đã nạp sẵn các con số **theo hiểu biết lúc làm phần mềm (tháng 11/2026) — không tra cứu được văn bản**. Mỗi bộ chưa xác nhận có nhãn vàng **“Chưa xác nhận”**, và đầu trang có băng cảnh báo.

**Kế toán phải đối chiếu từng bộ với văn bản pháp luật đang có hiệu lực** (nghị định lương tối thiểu vùng, nghị định / nghị quyết lương cơ sở, luật BHXH / BHYT / BHTN, luật thuế TNCN và nghị quyết giảm trừ gia cảnh, Bộ luật Lao động về thử việc và làm thêm giờ). Sau khi đối chiếu:

- **Đúng** → bấm **Xác nhận** ở dòng đó. Hệ thống ghi tên bạn và thời điểm xác nhận.
- **Sai** → bấm **Nhập bộ mới** ở loại đó, sửa con số, chọn **ngày hiệu lực** (có thể trùng ngày của bộ sai — bộ nhập sau sẽ thay), ghi **căn cứ** (số văn bản, ngày ban hành). Bộ bạn nhập được coi là đã xác nhận.

Bảng lương dùng bộ **chưa xác nhận**: 0.22.0 — **vẫn gửi duyệt / duyệt được**, bảng lương và màn hình duyệt có băng cảnh báo vàng, nhật ký kiểm toán ghi "duyệt khi tham số chưa xác nhận". Muốn chặt như 0.21: Cấu hình → *Chặn gửi duyệt khi tham số lương chưa xác nhận* = 1 — chặn cả gửi duyệt và **khóa kỳ** (bật sau khi đã duyệt thì khóa cũng bị chặn tới khi xác nhận).

Các bộ cần xem kỹ:

| Bộ | Nạp sẵn | Kiểm gì |
|---|---|---|
| Bảo hiểm bắt buộc | NLĐ 8 % / 1,5 % / 1 %; DN 17,5 % / 3 % / 1 %; KPCĐ 2 %; lương cơ sở 2.340.000; trần 20 lần | Tỷ lệ còn đúng không; lương cơ sở (hoặc mức tham chiếu) mới nhất; doanh nghiệp có đóng KPCĐ không (không đóng thì nhập 0) |
| Lương tối thiểu vùng | Vùng I; I–IV: 5.310.000 / 4.730.000 / 4.140.000 / 3.700.000 từ 01/01/2026 | **Vùng của doanh nghiệp** (theo địa bàn); mức từng vùng |
| Giảm trừ gia cảnh | 15.500.000 / 6.200.000 từ 01/01/2026 | Mức áp dụng kỳ tính thuế hiện hành |
| Biểu thuế lũy tiến | 5 bậc từ 01/01/2026 (≤ 10 tr 5 %, ≤ 30 tr 10 %, ≤ 50 tr 20 %, ≤ 100 tr 30 %, trên đó 35 %); 7 bậc trước đó | **Biểu nào đang áp cho tiền lương** của kỳ đang tính. Nếu biểu 5 bậc chưa áp dụng, nhập lại biểu 7 bậc với hiệu lực 01/01/2026 |
| Khấu trừ 10 % | 10 % khi trả từ 2.000.000 | Ngưỡng và tỷ lệ |
| Lương thử việc | Tối thiểu 85 % | |
| Hệ số tăng ca | 150 / 200 / 300 %; ban đêm 210 / 270 / 390 %; phần vượt không chịu thuế | Quy chế công ty có trả cao hơn không |
| Hoa hồng | **0 %** | Nhập chính sách thật: phẳng (một tỷ lệ) hoặc bậc thang theo doanh số đã thu trong tháng (đạt bậc nào áp tỷ lệ bậc đó cho toàn bộ doanh số) |

Khi luật đổi giữa năm (ví dụ lương tối thiểu vùng từ 01/07): **Nhập bộ mới** với ngày hiệu lực mới. Bộ cũ giữ nguyên để tháng cũ vẫn tính đúng. Kỳ lương tháng nào dùng **bộ tham số** có hiệu lực **vào ngày cuối tháng** đó.

### 0.3. Cấu hình kế toán

**Quản trị → Cấu hình → nhóm “Tính lương”**: số giờ làm một ngày (mặc định 8 — dùng để ra lương giờ khi tính tăng ca), số tháng dò phiếu thu ghi muộn (3), và **số tài khoản** cho bút toán lương: chi phí lương (6421), phải trả người lao động (334), BHXH 3383, BHYT 3384, BHTN 3386, KPCĐ 3382, thuế TNCN 3335, tạm ứng 141, khấu trừ khác 1388, tiền chi lương 1121, **tiền mặt chi lương trả tay 1111** (0.22.0). Đổi theo hệ thống tài khoản công ty đang dùng.

### 0.4. Mẫu file chi lương ngân hàng

Cuối trang **Tham số lương**: chọn cột (STT, số tài khoản, tên chủ tài khoản, ngân hàng, số tiền, nội dung, mã nhân viên, họ tên) **theo thứ tự ngân hàng yêu cầu** (thứ tự bấm chọn = thứ tự cột), mẫu nội dung chuyển khoản (ví dụ `Luong {thang}/{nam} {ho_ten}`), bỏ dấu tiếng Việt nếu ngân hàng không nhận dấu.

## 1. Nhân sự — hồ sơ lương

> **0.22.0:** hồ sơ có **Hình thức trả** (Chuyển khoản / Tiền mặt – trả tay); số tài khoản không bắt buộc. **Nhập CSV hồ sơ lương** ở cuối trang Hồ sơ lương: cột `Email, Loại hợp đồng, Lương cơ bản, Lương đóng BH, Số tài khoản, Ngân hàng, Mã số thuế, Số người phụ thuộc` (tùy chọn `% lương thử việc`, `Hình thức trả`) → *Xem trước* (lỗi từng dòng; ô bắt đầu bằng `= + - @` bị báo lỗi) → *Tạo phiên bản hồ sơ*. Mỗi dòng là một phiên bản mới, hiệu lực từ ngày 1 tháng này; trường không có trong tệp giữ như hồ sơ hiện tại. Không nhập được hồ sơ của chính mình; đổi tài khoản vẫn báo nhân viên. Số người phụ thuộc nhiều hơn số đang đăng ký → thêm người phụ thuộc "chưa ghi tên" — **chưa được giảm trừ** cho tới khi Nhân sự bấm *Bổ sung* ghi **họ tên** và **giấy tờ hợp lệ**: MST 10 số (hoặc 10 số-3 số), CCCD 12 số, hoặc giấy tờ khác (hộ chiếu, giấy khai sinh) ít nhất 6 ký tự chữ-số. Luật này áp cho mọi người phụ thuộc — thêm tay, sửa, nhập CSV; người phụ thuộc cũ không đạt đã được gắn cờ “chưa đủ giấy tờ” khi nâng cấp (dòng lương có cảnh báo, Thiết lập ban đầu đếm số người còn thiếu).

**Tính lương → Hồ sơ lương**:

- Bấm **Lập / đổi hồ sơ lương**, chọn nhân viên, **ngày hiệu lực**, loại hợp đồng (thử việc nhập % lương), cách trả (tháng theo công / ngày / giờ), lương cơ bản, **lương đóng bảo hiểm** (để trống = không tham gia bảo hiểm), mức thưởng KPI chuẩn, có hưởng hoa hồng không, **cách khấu trừ thuế**:
  - *Lũy tiến* — hợp đồng lao động từ 3 tháng (máy gợi ý cho chính thức, thử việc);
  - *Khấu trừ 10 %* — không ký HĐLĐ hoặc dưới 3 tháng (máy gợi ý cho thời vụ, thực tập);
  - *Không khấu trừ* — người đã nộp cam kết 08/CK-TNCN.
  Thử việc theo hợp đồng thử việc riêng dưới 3 tháng thường khấu trừ 10 % — kế toán chọn theo hợp đồng thật.
- Phụ cấp: điền số tiền cho từng loại (ăn trưa tính theo **ngày công thực tế**). Danh mục phụ cấp ở cuối trang: đặt chịu thuế / không, tính bảo hiểm / không, và **“trả đủ, không chia theo công”**. Phụ cấp cố định tháng mặc định **chia theo công** (người vào làm / nghỉ việc giữa tháng, nghỉ không lương nhận phần tương ứng; nghỉ không lương cả tháng nhận 0); đánh dấu “trả đủ” cho khoản công ty muốn trả nguyên tháng (ví dụ gửi xe).
- Tài khoản ngân hàng, mã số thuế cá nhân. **Đổi tài khoản** → nhân viên nhận thông báo ngay trong ứng dụng (chỉ hiện 4 số cuối) và hệ thống ghi nhật ký; bảng lương cảnh báo người đổi tài khoản trong 30 ngày.
- **Đổi lương = lưu phiên bản mới** với ngày hiệu lực mới; phiên bản cũ giữ làm lịch sử (bấm tên nhân viên để xem). Không có nút “sửa đè”. Đổi lương / hết thử việc **giữa tháng**: tháng đó máy chia theo ngày công — phần công trước ngày đổi tính theo mức cũ, phần sau theo mức mới (phiếu lương in từng đoạn).
- **Không ai tự lập hoặc sửa hồ sơ lương của chính mình** — kể cả Nhân sự, Kế toán, Giám đốc, Quản trị. Hồ sơ của Nhân sự do người khác có quyền lập.
- **Người phụ thuộc**: bấm tên nhân viên → *Thêm người phụ thuộc*, chọn tháng bắt đầu giảm trừ. Hết giảm trừ thì *Kết thúc* (không xóa).

Mỗi lần mở trang hồ sơ lương đều được ghi nhật ký (ai, lúc nào, xem của ai).

## 2. Kế toán — quy trình mỗi tháng

1. **Nguồn công** (0.22.0 — không phải chờ): mỗi dòng ghi rõ công lấy từ đâu —
   - **Bảng công đã khóa** (nếu Nhân sự đã khóa và người đó có trong bảng);
   - **Công nhập tay**: nút *Nhập công tay* trên kỳ nháp — số ngày công (trống = đủ công chuẩn), giờ tăng ca, ngày nghỉ không lương, lý do. Kế toán hoặc Nhân sự nhập; không ai nhập cho chính mình;
   - **Bảng công nháp** (tạm, cảnh báo vàng) — Nhân sự đã sinh bảng công nhưng chưa khóa;
   - **Mặc định đủ công chuẩn** (cảnh báo vàng) cho người chưa có các nguồn trên.
   Thứ tự ưu tiên: bảng công đã khóa → công nhập tay → bảng công nháp → mặc định.
   **Đối chiếu tự động** (0.22.0): nếu kỳ lương đã KHÓA bằng công tạm mà sau đó Nhân sự mới khóa bảng công tháng đó, Cowork tự tính chênh lệch từng người và tạo khoản **“Điều chỉnh kỳ trước”** (trước thuế, nhãn *Đối chiếu công*) ở kỳ lương **nháp** kế tiếp — chưa có kỳ thì chờ, tự thêm khi bạn tính kỳ đó. Bạn nhận thông báo; xem lại, **giữ hoặc xóa từng khoản** (xóa có nhật ký). Mỗi người chỉ đối chiếu một lần cho mỗi kỳ — xóa rồi không tự sinh lại. Giờ tăng ca nhập tay vượt ngưỡng Cấu hình (40 giờ / tháng) → cảnh báo, không chặn (trần cứng 300 giờ).
   Bảng công khóa sau → bấm **Lấy lại công từ bảng công** (kỳ còn nháp): công nhập tay của người có trong bảng bị bỏ, tính lại theo bảng công. Ngày **“thiếu giờ” chờ quản lý quyết** không còn chặn: tính theo công hiện tại + cảnh báo; quản lý quyết sau thì chênh lệch vào dòng điều chỉnh tháng sau.
2. **Tính lương → Tạo kỳ lương** (năm, tháng) → mở kỳ → **Tính lương**.
   - Nếu Giám đốc (người duyệt) cũng có lương trong bảng: **Tạo kỳ lương riêng** (đặt tên, ví dụ “Lãnh đạo”, chọn người) — những người này ra khỏi kỳ chung; kỳ riêng do Quản trị hoặc Giám đốc khác duyệt. Khi gửi duyệt mà không còn ai duyệt được, máy báo rõ và chỉ cách tách.
3. **Kiểm**:
   - Băng đỏ = lỗi phải sửa trước khi gửi duyệt (thực lĩnh âm; lương thử việc dưới mức; tham số chưa xác nhận **chỉ khi** Cấu hình bật chặn). Vàng (0.22.0): bảng công chưa khóa, công mặc định / nhập tay, tham số chưa xác nhận, chưa có lịch (công chuẩn tạm tính T2–T6), thiếu mã số thuế. Mục **Chưa có hồ sơ lương** liệt kê người đang làm mà chưa có hồ sơ, kèm nút *Tạo hồ sơ*. Băng vàng = cảnh báo nên xem (phiếu đánh giá chưa chốt → thưởng KPI = 0; nghỉ không lương ≥ 14 ngày → tháng đó không đóng bảo hiểm; truy thu hoa hồng…).
   - Bấm tên từng người để xem phiếu chi tiết: công chuẩn / thực tế / nghỉ có lương / lễ, từng khoản thu nhập, bảo hiểm, giảm trừ, thuế.
   - Tải **Bảng lương Excel (nháp)** để đối chiếu.
4. **Khoản cộng / trừ** (chỉ khi kỳ còn nháp): *Thêm khoản* — thưởng đột xuất, phụ cấp khác (chọn chịu thuế hay không), tạm ứng, phạt, khác; bắt buộc lý do. Thêm / xóa khoản xong phải bấm **Tính lại**. Khoản **Điều chỉnh kỳ trước**: xem mục 3.
   - Tạm ứng lớn hơn lương làm thực lĩnh âm → máy chặn. Chuyển phần còn lại sang tháng sau.
5. **Gửi duyệt**. Giám đốc nhận thông báo.
6. Giám đốc **Duyệt** rồi **Khóa** (hoặc **Trả lại** kèm lý do → kỳ về nháp, sửa rồi tính lại).
7. Sau khi khóa:
   - **File chi lương ngân hàng — dùng bản Excel** (mặc định) → nộp lên ngân hàng điện tử. Số tài khoản trong file là tài khoản **chụp lúc khóa kỳ**: Nhân sự đổi tài khoản sau đó không làm đổi file của kỳ đã khóa. Người **chưa có tài khoản** hoặc hồ sơ chọn **Tiền mặt / trả tay**: 0.22.0 — **không chặn khóa**; dòng đó không vào file ngân hàng mà vào mục **Trả tay / tiền mặt** (có tổng tiền) — tải *Danh sách trả tay (Excel)* có cột ký nhận.
   - ⚠ **Không mở bản CSV bằng Excel rồi lưu lại**: Excel tự đổi số tài khoản dài thành dạng số (mất số 0 đầu, thành 1,1E+12). Bản CSV đã ghi số tài khoản trong ngoặc kép cho phần mềm ngân hàng đọc; cần xem / sửa thì dùng bản Excel.
   - **Bút toán lương (CSV)** → nhập vào phần mềm kế toán (MISA: chứng từ nghiệp vụ khác).
   - **Gửi email phiếu lương** → mỗi người nhận một thư (gửi một lần; bấm lại không gửi trùng). Ai báo không nhận được: bấm **Gửi lại phiếu** cạnh tên người đó (mỗi lần gửi lại là một thư mới, có ghi nhật ký).
   - Chuyển tiền xong bấm **Đánh dấu đã chi** (bút toán xuất sau đó có thêm dòng Nợ 334 / Có 1121 cho phần chuyển khoản và Nợ 334 / Có 1111 cho phần trả tay).
   - Nhân viên xem phiếu của mình ở **Tính lương → Phiếu lương của tôi** và in / lưu PDF.

### Cách máy tính (để đối chiếu tay)

- **Công tính lương** = công thực tế + nghỉ phép có lương + ngày lễ (lễ rơi vào ngày phải làm theo lịch). Nghỉ ốm, nghỉ không lương: không trả (ốm do BHXH chi). **Đi muộn / về sớm không trừ tiền** — chỉ in số phút trên phiếu.
- **Công chuẩn** = số công phải làm theo lịch làm việc cả tháng (coi như không có lễ). Lương tháng = lương cơ bản × % thử việc × công tính lương ÷ công chuẩn. Người vào làm giữa tháng (lịch gán từ ngày vào) vẫn có công chuẩn cả tháng → lương theo số công thực làm; phiếu có cảnh báo "lịch bắt đầu giữa tháng" để soát người bị gán lịch muộn.
- **Tăng ca**: chỉ giờ có đơn tăng ca **đã duyệt** trên bảng công; lương giờ = lương tháng ÷ công chuẩn ÷ 8; × hệ số theo ngày thường / nghỉ tuần / lễ / ban đêm. Bảng công tháng này có **dòng điều chỉnh giảm tăng ca** lớn hơn số tăng ca của tháng → phần còn lại được trừ tiếp ở tháng sau (phiếu có cảnh báo), không bỏ qua.
- **Đổi lương / hết thử việc giữa tháng**: mỗi đoạn = lương của phiên bản đó × công tính lương trong đoạn ÷ công chuẩn cả tháng.
- **Phụ cấp cố định tháng** = số tiền × công tính lương ÷ công chuẩn (trừ loại “trả đủ”).
- **Thưởng KPI** = mức thưởng KPI × hệ số thưởng của phiếu đánh giá **đã chốt** của tháng (đánh giá theo quý thì trả vào tháng cuối quý).
- **Hoa hồng** = tỷ lệ × tiền **đã thu thật** trong tháng (phiếu thu còn hiệu lực) của đơn người đó phụ trách. Phiếu thu bị hủy sau khi tháng đã khóa → tháng sau có **dòng truy thu** đúng số đã trả. Phiếu thu của tháng trước nhưng nhập muộn (sau khi tháng trước đã tính) → tính vào tháng này.
- **Bảo hiểm người lao động** trên lương đóng bảo hiểm (+ phụ cấp tính bảo hiểm), không vượt trần.
- **Thuế lũy tiến**: (thu nhập chịu thuế − bảo hiểm − giảm trừ bản thân − giảm trừ người phụ thuộc) × biểu thuế. Thu nhập chịu thuế không gồm phụ cấp không chịu thuế và phần tăng ca cao hơn giờ thường.
- **Thực lĩnh** = tổng thu nhập − bảo hiểm − thuế − tạm ứng / phạt.
- Mỗi khoản làm tròn đến đồng (nửa đồng làm tròn lên).

Mỗi dòng lương lưu “ảnh chụp đầu vào” (công, hồ sơ, tham số, phiếu thu, khoản). Khi kiểm toán, quản trị gọi `POST /api/v1/luong/dong/<mã dòng>/kiem-lai`: máy tính lại từ ảnh chụp và báo có khớp số đã chốt không (chưa có nút trên màn hình).

## 3. Sửa sai sau khi đã khóa

Không mở lại được. Ở **kỳ tháng sau** (còn nháp): *Thêm khoản* → loại **Điều chỉnh kỳ trước**, chọn tháng bị sai, cộng hoặc trừ số chênh lệch, ghi lý do rõ (ít nhất 10 ký tự), và **bắt buộc chọn cách tính**:

- **Trước thuế** — lương, phụ cấp, thưởng trả **thiếu** (cộng) hoặc **thừa** (trừ, thu hồi): khoản này cộng / trừ vào tổng thu nhập và thu nhập chịu thuế (nếu khoản đó chịu thuế), và vào lương đóng bảo hiểm nếu đánh dấu “tính vào lương đóng BH” (khoản trả thừa đã từng tính BH). Thuế và bảo hiểm tháng này tự giảm / tăng theo.
- **Sau thuế** — tạm ứng, khoản đã trừ sau thuế bị trừ thiếu / thừa: cộng / trừ thẳng vào thực lĩnh, không đụng thuế và bảo hiểm.

Khoản này được duyệt cùng bảng lương tháng sau.

Sai về **công** (chấm bù, đơn nghỉ duyệt muộn): Nhân sự xử lý ở chấm công, bảng công tháng sau tự sinh dòng điều chỉnh công → lương tháng sau tự tính phần chênh.

## 4. Giám đốc — duyệt

- Mở kỳ ở trạng thái **Chờ duyệt**: xem tổng hợp, cảnh báo, từng dòng. **Duyệt** → **Khóa**, hoặc **Trả lại** kèm lý do.
- **Người tính không được duyệt.** Bảng lương **có dòng của chính bạn** thì bạn không tự duyệt / khóa được — kế toán tách dòng của bạn sang **kỳ lương riêng** (Quản trị hoặc Giám đốc khác duyệt kỳ đó), hoặc cấp quyền duyệt cho người thứ hai.
- Băng vàng **“Tài khoản nhận lương vừa đổi trong 30 ngày”**: gọi xác nhận trực tiếp với nhân viên trước khi duyệt / chi.
- Khi khóa, máy kiểm lần cuối: phiếu thu nào đã hủy sau khi tính hoa hồng → không khóa được, trả lại để kế toán tính lại.

## 5. Bảo mật

- Mỗi lần ai xem bảng lương, phiếu lương hay hồ sơ lương **của người khác**, hoặc xuất file, hệ thống ghi nhật ký (ai, lúc nào, xem của những ai) — xem ở Quản trị → Nhật ký kiểm toán, hành động “Xem dữ liệu lương”. Nhật ký không ghi số tiền.
- Trợ lý AI không có quyền lương và không đọc được số lương.
- Nhân viên, thực tập sinh chỉ thấy phiếu của chính mình, và chỉ sau khi tháng đã khóa.
- Không ai tự lập / sửa hồ sơ lương của chính mình. Đổi tài khoản nhận lương luôn báo cho chính nhân viên.
