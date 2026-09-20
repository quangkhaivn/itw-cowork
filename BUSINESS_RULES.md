# Luật nghiệp vụ — TGTH Business Cowork

Mỗi luật ghi: nội dung, nơi chặn (CSDL / service / giao diện), có bài thử không. Luật chặn ở CSDL hoặc service mới là luật; chặn ở giao diện chỉ để báo lỗi sớm.

Quy ước: **[CSDL]** ràng buộc trong PostgreSQL · **[SV]** kiểm trong `src/modules/*/service.ts` · **[TH]** có bài thử tự động.

## 1. Nền móng (Phase 1)

| # | Luật | Chặn ở |
|---|---|---|
| NM-01 | Dữ liệu của doanh nghiệp này không bao giờ đọc/ghi được từ doanh nghiệp khác | [CSDL] RLS + [SV] `voiTenant` · [TH] |
| NM-02 | Luôn còn ≥ 1 người thật đang hoạt động giữ vai trò Giám đốc hoặc Quản trị | [SV] · [TH] |
| NM-03 | Vai trò Giám đốc/Quản trị luôn đủ toàn quyền, không sửa được | [SV] + seed · [TH] |
| NM-04 | Trợ lý AI không bao giờ có quyền `approve` hay `delete` | [SV] + seed · [TH] |
| NM-05 | Không cấp cho vai trò khác quyền mà chính mình không có; đổi vai trò người khác cần `role.update` | [SV] · [TH] |
| NM-06 | Audit Log và Business Event chỉ ghi thêm | [CSDL] trigger · [TH] |
| NM-07 | Mọi ngưỡng nghiệp vụ nằm ở màn hình Cấu hình; ngưỡng chưa đặt → hành vi an toàn | [SV] |
| NM-08 | Kiểm quyền ở máy chủ; ẩn nút ở giao diện không phải phân quyền | [SV] `xuLyApi` / `yeuCauQuyen` · [TH] |

## 2. Phạm vi dữ liệu

| Phạm vi | Thấy bản ghi nào |
|---|---|
| `own` | Bản ghi mình phụ trách (`owner_id` = mình) |
| `team` | Của mình + mọi cấp dưới trực tiếp và gián tiếp (`staff_profiles.manager_id`) |
| `department` | Của mọi người trong phòng mình và phòng con |
| `all` | Toàn doanh nghiệp |

Nhiều vai trò → phạm vi rộng nhất. Bản ghi ngoài phạm vi trả **404**, không phải 403 — để không lộ việc bản ghi tồn tại.

## 3. CRM (Phase 2)

### Ánh xạ quyền

| Đối tượng | Phân hệ quyền | Phạm vi tính theo |
|---|---|---|
| Khách hàng, Liên hệ | `customer.*` | `customers.owner_id` (liên hệ đi theo khách) |
| Lead, Tương tác | `crm.*` | `leads.owner_id`; tương tác đi theo khách / lead / cơ hội nó gắn |
| Cơ hội, Pipeline | `sales.*` | `opportunities.owner_id` |
| Công việc | `task.*` | `tasks.owner_id` |

"Activity" trong prompt = **Công việc** (`tasks`: việc cần làm, có hạn). "Interaction" = **Tương tác** (`interactions`: việc đã xảy ra — cuộc gọi, email, Zalo, gặp, ghi chú).

### Khách hàng

| # | Luật | Chặn ở |
|---|---|---|
| KH-01 | Mã khách tự cấp `KH-000001`, không trùng kể cả khi hai người tạo cùng lúc | [CSDL] duy nhất + cấp số bằng `INSERT … ON CONFLICT … RETURNING` · [TH] |
| KH-02 | **Trùng mã số thuế → chặn** (sau chuẩn hóa: chỉ giữ chữ số; 10 hoặc 13 số) | [CSDL] duy nhất `(tenant_id, tax_code_normalized)` + [SV] báo tên khách đã có · [TH] |
| KH-03 | Trùng điện thoại hoặc email (của khách hoặc của liên hệ), hoặc tên gần giống (trigram ≥ 0,6 sau khi bỏ "công ty", "TNHH", "cổ phần"…) → **cảnh báo** kèm danh sách; chỉ tạo khi người dùng xác nhận "đây là khách mới" | [SV] · [TH] |
| KH-04 | Kiểm trùng quét **toàn doanh nghiệp**, không giới hạn theo phạm vi của người nhập — nếu không, nhân viên `own` sẽ tạo lại khách của đồng nghiệp. Cảnh báo chỉ hiện mã + tên + người phụ trách, không hiện chi tiết khách ngoài phạm vi | [SV] · [TH] |
| KH-05 | Khách phải có người phụ trách (Account Owner). Người tạo mặc định là người phụ trách; giao cho người khác cần phạm vi `customer.update` bao trùm người nhận | [CSDL] NOT NULL + [SV] |
| KH-06 | Không xóa khách; đổi trạng thái `ngung-giao-dich` | [SV] |
| KH-07 | Điện thoại lưu dạng quốc nội `0xxxxxxxxx` (bỏ `+84`/`84`, bỏ ký tự khác số); email chữ thường | [SV] hàm thuần · [TH] |

### Lead

| # | Luật | Chặn ở |
|---|---|---|
| LD-01 | Giai đoạn: `NEW_LEAD` → `CONTACTED` → `QUALIFIED` → `CONVERTED`, hoặc `DISQUALIFIED` (bắt buộc lý do) | [CSDL] CHECK · [SV] |
| LD-02 | Lead phải có ít nhất một cách liên lạc: điện thoại hoặc email | [CSDL] CHECK · [TH] |
| LD-03 | Tạo lead dò trùng với khách hàng, liên hệ và lead đang mở theo điện thoại/email/MST → cảnh báo | [SV] · [TH] |
| LD-04 | Ghi tương tác đầu tiên trên lead `NEW_LEAD` tự chuyển lead sang `CONTACTED` | [SV] · [TH] |
| LD-05 | Chuyển đổi: tạo khách mới **hoặc** gắn vào khách đã có → tạo liên hệ → tùy chọn tạo cơ hội. Một giao dịch; lỗi ở bước nào thì không bước nào được ghi | [SV] · [TH] |
| LD-06 | Lead đã chuyển đổi không sửa, không chuyển lại; giữ con trỏ sang khách và cơ hội | [SV] · [TH] |
| LD-07 | Không xóa lead | [SV] |

### Cơ hội

| # | Luật | Chặn ở |
|---|---|---|
| CH-01 | Giai đoạn: `OPPORTUNITY`, `QUOTATION`, `NEGOTIATION` (đang mở) · `WON`, `LOST` (đã đóng) | [CSDL] CHECK |
| CH-02 | **Cơ hội đang mở phải có Người phụ trách + Hành động kế tiếp + Ngày hành động kế tiếp** | [CSDL] CHECK + [SV] · [TH] |
| CH-03 | Cơ hội `LOST` phải có lý do thua (mã trong Dữ liệu gốc `ly_do_thua`) | [CSDL] CHECK + [SV] · [TH] |
| CH-04 | Xác suất 0–100; giá trị ≥ 0 | [CSDL] CHECK |
| CH-05 | Đóng (WON/LOST) ghi `closed_at`; WON đặt xác suất 100, LOST đặt 0 | [SV] · [TH] |
| CH-06 | Mở lại cơ hội đã đóng cần quyền `sales.approve` (Trưởng phòng/Giám đốc) | [SV] · [TH] |
| CH-07 | Cơ hội phải gắn một khách hàng mà người tạo được thấy | [SV] · [TH] |
| CH-08 | Mã cơ hội `CH-2026-0001`, đánh số lại theo năm (giờ Việt Nam) | [SV] · [TH] |
| CH-09 | Giá trị pipeline có trọng số = Σ (giá trị × xác suất / 100) của cơ hội đang mở | [SV] hàm thuần · [TH] |

### Công việc

| # | Luật | Chặn ở |
|---|---|---|
| CV-01 | Trạng thái: `mo`, `dang-lam`, `xong`, `huy`. `xong` ghi `completed_at` | [CSDL] CHECK · [SV] |
| CV-02 | Quá hạn = chưa `xong`/`huy` và `due_at` < bây giờ | [SV] |
| CV-03 | Công việc gắn khách/lead/cơ hội thì người tạo phải thấy được bản ghi đó | [SV] |

### Tương tác

| # | Luật | Chặn ở |
|---|---|---|
| TT-01 | Loại: `call`, `email`, `zalo`, `meeting`, `visit`, `note` | [CSDL] CHECK |
| TT-02 | Phải gắn với ít nhất một khách hàng hoặc một lead | [CSDL] CHECK · [TH] |
| TT-03 | Tương tác gắn cơ hội thì tự gắn luôn khách của cơ hội đó (để dòng thời gian Customer 360 không sót) | [SV] |
| TT-04 | Không sửa nội dung tương tác của người khác | [SV] |

## 4. Sản phẩm và bảng giá (Phase 3)

Quyền: sản phẩm, nhóm, thương hiệu dùng `product.*`; nhà cung cấp dùng `supplier.*`; giá của nhà cung cấp cho một sản phẩm sửa bằng `product.update` (nó nằm trên trang sản phẩm). **Không có phạm vi theo người phụ trách** — danh mục là tài sản dùng chung (QĐ-18).

| # | Luật | Chặn ở |
|---|---|---|
| SP-01 | SKU là duy nhất trong doanh nghiệp. So trùng theo bản chuẩn hóa: viết hoa, gộp khoảng trắng — "lap-dell-3420" và "LAP DELL 3420" là **một** sản phẩm. Cách viết người dùng nhập được giữ nguyên để hiển thị | [CSDL] duy nhất `(tenant_id, sku_normalized)` + [SV] · [TH] |
| SP-02 | Tiền lưu `numeric(18,2)`, không âm; VAT 0–100%; bảo hành ≥ 0 tháng | [CSDL] CHECK · [TH] |
| SP-03 | Sản phẩm mới kế thừa bảo hành, VAT và "quản lý số sê-ri" từ nhóm; người nhập sửa đè được | [SV] · [TH] |
| SP-04 | Không xóa sản phẩm, nhóm, thương hiệu, nhà cung cấp — đổi trạng thái. Ngừng nhóm/thương hiệu khi còn hàng đang kinh doanh thì bị chặn | [SV] · [TH] |
| SP-05 | Một sản phẩm có nhiều nhà cung cấp; mỗi cặp (sản phẩm, nhà cung cấp) đúng một dòng giá hiện hành | [CSDL] duy nhất `(tenant_id, product_id, supplier_id)` · [TH] |
| SP-06 | Ngừng nhà cung cấp khi còn dòng giá đang dùng thì bị chặn — nếu không, bảng giá sẽ còn giá của nơi không còn bán | [SV] · [TH] |
| SP-07 | "Nguồn nên mua" = còn hàng trước, rồi giá thấp, rồi giao nhanh. Hết hàng chỉ được chọn khi không còn nguồn nào khác. Chưa có nguồn thì trả `null`, không đoán | [SV] hàm thuần · [TH] |
| SP-08 | **Mọi thay đổi giá** (giá vốn, giá bán, giá từng nhà cung cấp, kể cả lúc tạo và lúc gỡ nguồn) ghi một dòng `price_history`. Bảng này **chỉ ghi thêm** — trigger chặn sửa/xóa kể cả với vai chủ sở hữu | [CSDL] trigger + [SV] · [TH] |
| SP-09 | Nhập CSV luôn **xem trước** rồi mới ghi. Dòng hỏng bị bỏ qua kèm lý do; dòng tốt vẫn vào; mỗi lần ghi lưu một phiếu nhập `import_jobs` | [SV] · [TH] |
| SP-10 | Ô giá trong CSV: trống hoặc ghi rõ "liên hệ", "—", "N/A" = chưa có giá; nội dung khác mà không đọc được ra số thì **báo lỗi dòng**, không âm thầm coi là không có giá | [SV] hàm thuần · [TH] |
| SP-11 | Nhập CSV cập nhật sản phẩm cũ **không đổi cách viết SKU** đã có trên hệ thống | [SV] · [TH] |

## 5. Báo giá (Phase 4)

Quyền `quotation.*`. **Phạm vi**: theo người lập (`quotations.owner_id`), **cộng** đường "chủ tài khoản khách" — ai thấy khách thì thấy báo giá của khách đó (QĐ-13, giống cơ hội). Ngoài phạm vi trả **404**, không phải 403.

Kiến trúc: `quotations` là đầu phiếu (số `QT-2026-0001`, khách hàng, người lập); mỗi `quotation_versions` là **một bản gửi khách**; `quotation_items` là bảng hàng của bản đó; `quotation_approvals` là lịch sử xin duyệt / quyết duyệt.

| # | Luật | Chặn ở |
|---|---|---|
| BG-01 | Số báo giá `QT-<năm>-0001` cấp theo năm giờ Việt Nam, nguyên tử, **không tái sử dụng** kể cả khi giao dịch sau đó hỏng. Số hiển thị của một bản là `QT-2026-0001-V2` | [SV] `capSoChungTu` · [CSDL] duy nhất `(tenant_id, number)` |
| BG-02 | Bản **đã gửi khách** không sửa trực tiếp. Muốn đổi số liệu thì tạo **phiên bản mới**: bản cũ chuyển `SUPERSEDED` và giữ nguyên để đối chiếu, bản mới chép lại toàn bộ dòng hàng | [SV] · [TH] (trang sửa từ chối mở) |
| BG-03 | Biên lợi nhuận gộp % = (Doanh thu trước thuế − Giá vốn) / Doanh thu trước thuế × 100. Làm tròn **từng dòng** về đồng rồi cộng — để bảng in cộng đúng bằng tổng. Doanh thu bằng 0 → biên là `null`, **không phải 0%** | [SV] hàm thuần có kiểm thử đơn vị |
| BG-04 | Biên **dưới** ngưỡng `bao_gia.nguong_bien_loi_nhuan` → phải xin duyệt trước khi gửi khách. **Ngưỡng chưa đặt → mọi báo giá phải duyệt** (an toàn hơn tự chọn một con số). Biên chưa tính được cũng phải duyệt | [SV] `canDuyet` + chặn ở `guiKhach` · [TH] |
| BG-05 | **Người lập không tự duyệt báo giá của mình**, trừ người có phạm vi duyệt `all` (Giám đốc) | [SV] · [TH] |
| BG-06 | Trạng thái đi một chiều: `DRAFT` → `PENDING_APPROVAL` → `APPROVED` → `SENT` → (`VIEWED` / `NEGOTIATING`) → `ACCEPTED` \| `REJECTED`. Từ chối duyệt hoặc **sửa bản đã duyệt** thì quay về `DRAFT` — vì người duyệt đã duyệt cho con số cũ | [SV] · [CSDL] CHECK danh sách trạng thái |
| BG-07 | Giá vốn và SKU được **chụp lại trên từng dòng hàng** lúc lập. Nhà cung cấp đổi giá sau đó không làm đổi con số của báo giá cũ | [SV] · [CSDL] |
| BG-08 | Số lượng > 0 (tối đa 3 số lẻ); đơn giá, giá vốn, các cột tiền không âm; chiết khấu và VAT trong 0–100% | [CSDL] CHECK · [SV] lược đồ · [TH] |
| BG-09 | Gửi khách **ghi lại thời điểm và kênh gửi** (email, Zalo, in giấy) — hệ thống chưa tự gửi email, người dùng gửi rồi ghi nhận. Gửi báo giá đẩy cơ hội liên quan sang giai đoạn `QUOTATION` | [SV] · [TH] |
| BG-10 | Điều khoản thanh toán và giao hàng là **Dữ liệu gốc** (`dieu_khoan_thanh_toan`, `dieu_khoan_giao_hang`), không phải chữ gõ tự do — để dùng lại và thống kê được. Đơn vị tính trên dòng hàng cũng lấy từ Dữ liệu gốc `don_vi_tinh` | [SV] `kiemTraMaDuLieuGoc` · [TH] (ô chọn) |

**Bản in (PDF)**: bản in là HTML có `@media print`, người dùng bấm "In / Lưu PDF" của trình duyệt (QĐ-21). Phần đầu lấy từ **Hồ sơ công ty** (Quản trị → Hồ sơ công ty). Mục nào chưa khai thì **để trống kèm nhắc**, hệ thống không tự điền thông tin pháp nhân (mục 5 luật vault).

**Chưa làm ở phase này**: chuyển báo giá đã chấp nhận thành đơn hàng (Phase 5); gửi email tự động; AI soạn `DRAFT` (Phase 9).

## 6. Đơn hàng (Phase 5)

Quyền `order.*`. **Phạm vi** như báo giá: theo người phụ trách đơn, cộng đường "chủ tài khoản khách" (QĐ-13). Ngoài phạm vi trả **404**.

Theo mục 19 đặc tả vai trò: **Nhân viên Kinh doanh chỉ XEM đơn**; tạo, sửa, xác nhận, hủy đơn là việc của Trưởng phòng Kinh doanh trở lên (`order.create`, `order.approve`). Nếu Giám đốc muốn nhân viên tự tạo đơn thì cấp thêm quyền ở màn hình Vai trò — không phải sửa mã (câu hỏi Q8 trong `IMPLEMENTATION_PLAN.md`).

| # | Luật | Chặn ở |
|---|---|---|
| DH-01 | Đơn sinh từ **một phiên bản báo giá khách đã chấp nhận** bằng một thao tác: dòng hàng và số tiền **chép** sang, giữ `quotation_item_id` để truy ngược. Báo giá chưa chốt thì chưa tạo đơn được; bấm lại lần nữa **không** sinh đơn thứ hai | [SV] · [TH] |
| DH-02 | Số đơn `DH-<năm>-0001` cấp theo năm giờ Việt Nam, nguyên tử, không trùng, không tái sử dụng | [SV] `capSoChungTu` · [CSDL] duy nhất `(tenant_id, number)` |
| DH-03 | Chỉ sửa được dòng hàng khi đơn còn **Nháp**. Đơn đã xác nhận là cam kết với khách và đã giữ hàng trong kho — muốn đổi thì hủy rồi lập đơn mới | [SV] · [TH] (trang sửa từ chối mở) |
| DH-04 | Xác nhận đơn thì **giữ chỗ** hàng trong kho được chọn, cho từng dòng có gắn sản phẩm **có theo dõi tồn**. Hàng không đủ thì chặn và nói rõ đang có bao nhiêu. Dịch vụ, công lắp đặt (`quan_ly_ton = false`) không giữ chỗ | [SV] · [CSDL] CHECK `reserved <= on_hand` |
| DH-05 | Xuất hàng không bao giờ vượt phần **còn phải giao** của dòng đó | [CSDL] CHECK `delivered_qty <= quantity` · [SV] · [TH] |
| DH-06 | Trạng thái giao hàng **tính từ dữ liệu**, không do người dùng chọn: chưa giao gì → Đã xác nhận; giao một phần → Giao một phần; đủ mọi dòng → Đã giao đủ (ghi thời điểm hoàn thành) | [SV] hàm thuần `tienDoGiao()` có kiểm thử |
| DH-07 | Hủy đơn **phải ghi lý do** và nhả toàn bộ phần còn giữ chỗ. Đơn đã giao đủ thì không hủy (hàng đã ra khỏi kho — trả hàng là nghiệp vụ của phase sau) | [CSDL] CHECK · [SV] · [TH] |
| DH-08 | Tiền của đơn tính bằng **đúng hàm** `tinhBaoGia()` của Phase 4, nên số tiền chuyển từ báo giá sang đơn khớp đến từng đồng | [SV] hàm thuần dùng chung |
| DH-09 | Điều khoản thanh toán / giao hàng và đơn vị tính lấy từ **Dữ liệu gốc**, như báo giá (BG-10) | [SV] `kiemTraMaDuLieuGoc` · [TH] |

## 7. Kho (Phase 5)

Quyền `inventory.*`, **không có phạm vi theo người** — kho là tài sản dùng chung (như QĐ-18). Thủ kho giữ quyền nhập, xuất, điều chỉnh; kinh doanh và kế toán chỉ xem.

Hai bảng đi cùng nhau: `inventory_balances` là **số dư hiện tại**, `inventory_transactions` là **sổ cái chỉ ghi thêm**. Mọi thay đổi đều đi qua đúng một hàm `ghiSoKho()`.

| # | Luật | Chặn ở |
|---|---|---|
| KHO-01 | Sổ cái kho **chỉ ghi thêm**: không sửa, không xóa, kể cả bằng vai chủ sở hữu. Mỗi dòng ghi cả số dư sau giao dịch để đối soát | [CSDL] trigger `chan_sua_inventory_transactions` · [TH] |
| KHO-02 | Tồn kho và phần giữ chỗ **không bao giờ âm**, và không giữ chỗ nhiều hơn hàng đang có | [CSDL] CHECK · [SV] hàm thuần `soDuSau()` · [TH] |
| KHO-03 | Điều chỉnh tồn sau kiểm kê **bắt buộc ghi lý do**; lý do vào thẳng thẻ kho và không xóa được | [SV] lược đồ · [TH] |
| KHO-04 | Số dư luôn cộng đúng bằng tổng sổ cái. Hai người thao tác cùng lúc trên một mặt hàng phải **xếp hàng** (`SELECT … FOR UPDATE` trên dòng số dư) | [SV] · [TH] hàm `doiSoatKho()` |
| KHO-05 | Hàng quản lý theo sê-ri: nhập kho phải khai **đủ số sê-ri**; xuất phải chọn đúng sê-ri **đang ở kho đó**; sê-ri đã bán không xuất lại được. Sê-ri là duy nhất theo (doanh nghiệp, sản phẩm) | [CSDL] duy nhất + CHECK · [SV] · [TH] |
| KHO-06 | Hàng còn bán được = tồn kho − phần giữ chỗ. Đây là con số dùng để chặn xác nhận đơn, không phải tồn kho thô | [SV] hàm thuần `conBanDuoc()` |
| KHO-07 | Không ngừng hoạt động một kho khi kho đó **còn hàng** — nếu không, hàng biến mất khỏi mọi màn hình trong khi sổ sách vẫn còn | [SV] · [TH] |
| KHO-08 | Mức tồn tối thiểu (tùy chọn) sinh cảnh báo "sắp hết"; hết sạch thì cảnh báo "hết hàng" dù chưa đặt mức | [SV] hàm thuần `mucTon()` · [CSDL] CHECK không âm |

**Chưa làm ở phase này**: mua hàng (`purchase_requests`, `purchase_orders`) — nhập kho hiện ghi thẳng kèm nguồn hàng; chuyển kho nội bộ; trả hàng và bảo hành (Phase 6); giá vốn bình quân theo lô (Phase 7 tài chính).

## 8. Bảo hành (Phase 6)

Quyền `service_desk.*`, không có phạm vi theo người — ai trực bàn dịch vụ cũng phải tra được máy của mọi khách.

| # | Luật | Chặn ở |
|---|---|---|
| BH-01 | Bảo hành **tự sinh khi xuất kho giao hàng**: mỗi số sê-ri một phiếu; hàng không quản lý sê-ri thì một phiếu cho cả dòng. Hàng bảo hành 0 tháng thì không sinh phiếu | [SV] gọi từ `taoPhieuXuat()` · [TH] |
| BH-02 | Thời hạn = ngày giao + số tháng bảo hành của sản phẩm, **lùi một ngày** (24 tháng từ 20/09/2026 hết 19/09/2028). Ngày 31 cộng sang tháng ngắn hơn thì lấy ngày cuối tháng | [SV] hàm thuần có kiểm thử · [CSDL] CHECK `end_date >= start_date` |
| BH-03 | Số tháng bảo hành **chụp lại lúc giao**. Sau này đổi chính sách hãng cũng không làm đổi bảo hành đã cấp | [SV] · [CSDL] |
| BH-04 | Sửa thời hạn bảo hành **luôn phải ghi lý do**, và ghi vào Nhật ký kiểm toán | [SV] (lược đồ + chốt chặn trong service) · [TH] |
| BH-05 | Không xóa bảo hành — hủy thì chuyển trạng thái `huy` kèm lý do, bản ghi vẫn còn để tra | [CSDL] CHECK · [SV] · [TH] |
| BH-06 | "Sắp hết bảo hành" tính theo ngưỡng `theo_doi.bao_hanh_sap_het_ngay` trong Cấu hình. **Ngưỡng chưa đặt thì không có mức "sắp hết"** — hệ thống không tự chọn con số | [SV] hàm thuần · [TH] |

## 9. Bàn dịch vụ — phiếu hỗ trợ (Phase 6)

Quyền `service_desk.*`. **Phạm vi**: người tiếp nhận hoặc người đang xử lý — kỹ thuật viên phạm vi "own" thấy đúng phiếu được giao cho mình.

| # | Luật | Chặn ở |
|---|---|---|
| HT-01 | Số phiếu `HT-<năm>-0001`. Phiếu gắn được với **đúng chiếc máy** đã bán qua bảo hành → sê-ri → đơn hàng; bảo hành của khách khác thì bị chặn | [SV] `capSoChungTu` + kiểm chéo khách · [CSDL] duy nhất `(tenant_id, number)` |
| HT-02 | Trạng thái đi theo luồng: Mới → Đang xử lý / Chờ khách → Đã xử lý xong → Đã đóng. Không nhảy thẳng sang Đóng; phiếu đã đóng hoặc đã hủy thì khóa | [SV] hàm thuần `chuyenDuoc()` · [CSDL] CHECK danh sách trạng thái · [TH] |
| HT-03 | Hạn cam kết (SLA) **chụp lại lúc mở phiếu** từ ngưỡng trong Cấu hình (`dich_vu.gio_*`), phiếu Khẩn dùng ngưỡng riêng. **Ngưỡng chưa đặt thì phiếu không có hạn** — không bịa hạn | [SV] hàm thuần `hanSla()` · [CSDL] CHECK hạn xử lý ≥ hạn phản hồi |
| HT-04 | Lần liên hệ khách đầu tiên (ghi diễn biến "đã liên hệ khách", hoặc chuyển sang đang xử lý) là **mốc phản hồi** của SLA | [SV] · [TH] |
| HT-05 | Hoàn thành phiếu **bắt buộc ghi đã xử lý thế nào** và thời điểm xong — không có phiếu "xong" mà trống trơn | [CSDL] CHECK · [SV] · [TH] |
| HT-06 | Đóng phiếu ghi thời điểm đóng; hủy phiếu phải ghi lý do | [CSDL] CHECK · [SV] |
| HT-07 | Diễn biến phiếu là **chỉ ghi thêm** — không sửa, không xóa, kể cả bằng vai chủ sở hữu | [CSDL] trigger `chan_sua_support_ticket_events` · [TH] |
| HT-08 | Đổi mức ưu tiên thì tính lại hạn cho phần **chưa làm**; phần đã phản hồi hoặc đã xong giữ nguyên mốc cũ | [SV] |

## 10. Dự án triển khai (Phase 6)

Quyền `project.*`; phạm vi theo người phụ trách dự án, cộng người đang được giao việc trong dự án đó.

| # | Luật | Chặn ở |
|---|---|---|
| DU-01 | Mã dự án `DA-<năm>-0001`. Dự án gắn với **một đơn hàng đã xác nhận** (đơn còn nháp thì chưa triển khai), và đơn phải cùng khách | [SV] · [CSDL] duy nhất `(tenant_id, code)` · [TH] |
| DU-02 | Trạng thái: Đang chuẩn bị → Đang triển khai ↔ Tạm dừng → Đã nghiệm thu \| Đã hủy. Nghiệm thu và hủy là **điểm dừng** | [SV] hàm thuần · [CSDL] CHECK · [TH] |
| DU-03 | Hạng mục đầu tiên bắt đầu chạy thì dự án **tự** chuyển sang Đang triển khai và ghi ngày bắt đầu | [SV] |
| DU-04 | Hạng mục xong thì ghi thời điểm xong; hạng mục đã xong **không xóa được** (còn để đối chiếu khi nghiệm thu) | [CSDL] CHECK · [SV] · [TH] |
| DU-05 | **Nghiệm thu chỉ mở khi mọi hạng mục đã xong** và dự án có ít nhất một hạng mục. Nghiệm thu ghi người và thời điểm, rồi khóa dự án | [CSDL] CHECK · [SV] · [TH] |
| DU-06 | Hủy dự án phải ghi lý do; đã hủy thì khóa | [CSDL] CHECK · [SV] · [TH] |
| DU-07 | Việc (`tasks`) và phiếu hỗ trợ gắn được vào dự án, hiện ngay trên trang dự án — không phải mở màn hình khác để biết dự án đang vướng gì | [SV] |

**Lưu ý vận hành**: Trưởng phòng Kỹ thuật có phạm vi khách hàng theo **phòng ban** (mục 19 đặc tả), nên không thấy khách do phòng kinh doanh phụ trách và không tự mở dự án cho khách đó được. Muốn kỹ thuật tự mở dự án thì Giám đốc mở phạm vi `customer.view` cho vai trò đó ở màn hình Vai trò (câu hỏi Q9).

**Chưa làm ở phase này**: hợp đồng bảo trì định kỳ và gia hạn tự động (`maintenance_contracts`, `renewals`), trả hàng / đổi máy, tệp đính kèm (`attachments`).

## 11. Tài chính — hóa đơn, công nợ, thu tiền (Phase 7)

Quyền `finance.*`; phạm vi hóa đơn đi theo **khách hàng** (QĐ-13: thấy khách thì thấy hóa đơn của khách đó). Kế toán có phạm vi toàn công ty; trưởng phòng Kinh doanh được cấp `finance.view`/`finance.export` phạm vi **nhóm** để theo dõi tiền về của nhóm mình.

| # | Luật | Chặn ở |
|---|---|---|
| TC-01 | Số hóa đơn `HD-<năm>-0001`, cấp nguyên tử. Lập từ **đơn hàng đã xác nhận** (chép nguyên dòng, giữ liên kết từng dòng về dòng đơn) hoặc lập tay cho khoản lẻ | [SV] · [CSDL] duy nhất `(tenant_id, number)` · [TH] |
| TC-02 | **Một đơn hàng chỉ có một hóa đơn còn hiệu lực.** Gọi lập lần hai trả về đúng hóa đơn cũ (`daCoTruoc: true`), không sinh bản thứ hai | [SV] · [TH] |
| TC-03 | Hóa đơn sinh ra ở trạng thái Nháp và **chưa tính công nợ**. Phát hành mới chốt số tiền, ghi ngày phát hành, người phát hành và hạn thanh toán; từ đó mới tính nợ | [CSDL] CHECK (phát hành phải đủ ngày + người) · [SV] · [TH] |
| TC-04 | Hạn thanh toán lấy từ Cấu hình `tai_chinh.so_ngay_cong_no_mac_dinh`, hoặc nhập tay. **Chưa đặt cấu hình và không nhập tay thì từ chối phát hành** — hệ thống không bịa hạn | [SV] · [TH] |
| TC-05 | Một phiếu thu trừ được cho nhiều hóa đơn. **Tổng phân bổ phải đúng bằng số tiền thu**, và từng hóa đơn không nhận quá phần còn nợ | [CSDL] CHECK (số tiền > 0) · [SV] · [TH] |
| TC-06 | **Công nợ không lưu thành cột.** Còn nợ = tổng hóa đơn đã phát hành − tổng phân bổ của phiếu thu còn hiệu lực. Một nguồn số, không bao giờ lệch | [SV] hàm thuần `congNo()` · [TH] |
| TC-07 | Tuổi nợ chia năm nhóm: trong hạn, 1–30, 31–60, 61–90, trên 90 ngày. Ngưỡng cảnh báo lấy từ `tai_chinh.canh_bao_qua_han_ngay`; **chưa đặt thì không cảnh báo**, màn hình nói rõ là chưa đặt | [SV] hàm thuần · [TH] |
| TC-08 | Hủy hóa đơn phải ghi lý do, và **chỉ hủy được khi chưa thu đồng nào** — muốn hủy thì hủy phiếu thu trước | [CSDL] CHECK · [SV] · [TH] |
| TC-09 | Hủy phiếu thu phải ghi lý do. Phiếu **không bị xóa**, chỉ đổi trạng thái; công nợ của hóa đơn quay lại đúng như trước khi thu | [CSDL] CHECK · [SV] · [TH] |

Số tiền trên hóa đơn tính bằng đúng hàm `tinhBaoGia()` mà báo giá và đơn hàng dùng, nên ba chứng từ không bao giờ ra số khác nhau cho cùng một dòng hàng.

**Chưa làm ở phase này**: chi (phiếu chi, công nợ phải trả nhà cung cấp), hóa đơn điện tử theo chuẩn cơ quan thuế, đối soát ngân hàng tự động, ngoại tệ.

## 12. Bảng điều hành (Phase 7)

| # | Luật | Chặn ở |
|---|---|---|
| BDK-01 | Mỗi khối chỉ tính khi người xem **có quyền tương ứng**; không có quyền thì khối trả `null` và màn hình **không vẽ ô trống** | [SV] · [TH] |
| BDK-02 | Mỗi khối chỉ đếm trong **phạm vi dữ liệu** của người xem (Giám đốc toàn công ty, trưởng phòng theo nhóm, nhân viên theo mình) | [SV] dùng lại `dieuKienXem*` của từng phân hệ · [TH] |
| BDK-03 | **Doanh thu ghi nhận theo hóa đơn đã phát hành**, không theo đơn hàng — đơn đã xác nhận nhưng chưa xuất hóa đơn thì chưa phải doanh thu | [SV] |
| BDK-04 | Không có số minh họa. Chưa có dữ liệu thì hiện 0 kèm lời giải thích, hoặc ẩn khối — không bịa con số cho đẹp | [SV] · [TH] |
| BDK-05 | Biên lợi nhuận khi doanh thu bằng 0 trả **null** (chưa tính được), không phải 0% | [SV] hàm thuần · [ĐV] |

Các con số đọc thẳng từ bảng gốc lúc mở trang. Bảng tổng hợp theo ngày chỉ dựng khi dữ liệu đủ lớn (DATABASE.md phần B) — làm sớm chỉ tạo thêm một nơi có thể lệch số.
