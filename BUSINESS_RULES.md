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
| BG-11 | Logo in trên báo giá (0.16.0): chỉ ảnh PNG / JPEG / WebP **thật** (kiểm byte đầu, đuôi tên phải khớp), tối đa 512 KB; không nhận SVG. Đổi / gỡ logo cần `setting.update`; nhật ký ghi mã băm, không ghi nội dung ảnh | [SV] `nhanDangTep` · [TH] |

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

## 13. Nhắc việc tự động và "Việc hôm nay" (Phase 8)

Bản quét chạy mỗi ngày một lần theo giờ đặt ở Cấu hình, lập danh sách gợi ý cho từng người. Danh sách này **không phải** công việc chính thức (`tasks`) — nó là lời nhắc, đóng lại được mà không ảnh hưởng bản ghi gốc.

| # | Luật | Chặn ở |
|---|---|---|
| TD-01 | **Quy tắc thiếu ngưỡng thì không quét.** Lần chạy ghi rõ quy tắc nào bị bỏ và vì sao; màn hình Tự động hóa hiện "Chưa đặt" kèm đường tới Cấu hình. Hệ thống không tự chọn một con số thay Giám đốc | [SV] hàm thuần `kiemTraDieuKien()` · [ĐV] · [TH] |
| TD-02 | **Chạy lại trong ngày không nhân đôi.** Việc hôm nay duy nhất theo (người, ngày, quy tắc, đối tượng); thông báo duy nhất theo (người, khóa chống trùng). Lần chạy **theo lịch** chỉ có một mỗi ngày | [CSDL] duy nhất + chỉ mục riêng phần `job_runs_lich_moi_ngay` · [SV] · [TH] |
| TD-03 | **"Việc hôm nay" là của riêng mỗi người.** Máy chủ lọc theo phiên; không có đường nào xem hay đóng việc của người khác, kể cả trưởng phòng | [SV] · [TH] |
| TD-04 | Mỗi người **một thông báo tóm tắt** mỗi ngày, và chỉ khi thật sự có việc. Không có việc thì không rung chuông | [SV] hàm thuần `cauTomTatHangNgay()` · [ĐV] · [TH] |
| TD-05 | Đóng một việc phải ghi ai đóng và lúc nào; việc đã đóng không đóng lại được | [CSDL] CHECK · [SV] · [TH] |
| TD-06 | **Bỏ qua phải ghi lý do.** Lý do bỏ qua là dữ liệu để biết quy tắc nào đang nhắc sai và cần chỉnh ngưỡng | [CSDL] CHECK · [SV] · [TH] |
| TD-07 | Bật/tắt quy tắc và chạy quét tay cần `setting.update`. Mỗi lần chạy ghi lại nguồn (lịch hay tay), người bấm, kết quả từng quy tắc | [SV] · [TH] |
| TD-08 | Việc chỉ giao cho **người phụ trách bản ghi gốc**. Bản ghi không có người phụ trách thì bỏ qua, không đẩy bừa cho ai | [SV] |

**Tám quy tắc đang có**: báo giá chờ phản hồi, cơ hội lâu không hoạt động, việc quá hạn, hóa đơn quá hạn, phiếu hỗ trợ trễ cam kết, bảo hành sắp hết, hợp đồng bảo trì tới kỳ, khách lâu chưa mua lại. Năm quy tắc cần ngưỡng; ba quy tắc còn lại đọc mốc đã có sẵn trên bản ghi.

**Chưa làm ở phase này**: gửi nhắc ra ngoài (email, Zalo) — cần dịch vụ gửi và mẫu thư được duyệt; nhắc theo giờ trong ngày thay vì theo ngày; quy tắc do người dùng tự định nghĩa.

## 14. Bảo trì định kỳ và gia hạn (Phase 8)

| # | Luật | Chặn ở |
|---|---|---|
| BT-01 | Mã hợp đồng `BT-<năm>-0001`. Kỳ hạn phải hợp lệ (kết thúc ≥ bắt đầu), chu kỳ 1–60 tháng | [CSDL] CHECK + duy nhất · [SV] · [TH] |
| BT-02 | **Kỳ đầu tiên là ngày bắt đầu hợp đồng**; kỳ sau = lần bảo trì gần nhất + chu kỳ. Vượt ngày kết thúc thì **không còn kỳ nào** — hệ thống không nhắc bảo trì cho hợp đồng đã hết hạn | [SV] hàm thuần `kyBaoTriKeTiep()` · [ĐV] · [TH] |
| BT-03 | Ghi nhận bảo trì là **chỗ duy nhất** đẩy mốc kỳ kế tiếp — không có ô nhập tay "kỳ sau là ngày nào". Không ghi nhận cho ngày ở tương lai, cũng không ghi trước ngày bắt đầu hợp đồng | [CSDL] CHECK · [SV] · [TH] |
| BT-04 | Ghi nhận kỳ cuối xong thì hợp đồng **tự chuyển sang Hết hạn**, không nằm mãi ở Hiệu lực | [SV] · [TH] |
| BT-05 | Hủy hợp đồng phải ghi lý do; đã hủy thì khóa | [CSDL] CHECK · [SV] · [TH] |
| GH-01 | Gia hạn do bản quét lập sẵn từ bảo hành sắp hết hoặc hợp đồng bảo trì. Một nguồn + một ngày đến hạn = **một dòng**, quét lại không nhân đôi | [CSDL] duy nhất · [SV] · [TH] |
| GH-02 | Gia hạn **không tự thành cơ hội**. Người bán xem rồi quyết: mở cơ hội, hoặc bỏ qua kèm lý do. Máy tự mở cơ hội cho mọi máy sắp hết bảo hành sẽ làm pipeline đầy rác trong một tuần | [SV] · [TH] |
| GH-03 | Chốt gia hạn đi qua đúng `taoCoHoi()` như mọi cơ hội khác — cùng kiểm quyền, cùng cấp mã, cùng nhật ký. Không có đường tắt riêng. Bắt buộc có **việc kế tiếp và ngày làm** | [SV] · [TH] |
| GH-04 | Bỏ qua phải ghi lý do; dòng đã xử lý thì không chốt hay bỏ lại | [CSDL] CHECK · [SV] · [TH] |

**Ai xem được lịch gia hạn**: `service_desk.view` **hoặc** `sales.view`. Cố ý kiểm ở service chứ không cấp `service_desk.view` cho vai trò Kinh doanh — cấp như vậy sẽ mở luôn cả hàng đợi phiếu hỗ trợ cho phòng kinh doanh, rộng hơn nhiều so với việc họ cần làm.

## 15. Trợ lý AI (Phase 9)

Quyền `ai.view`. Trợ lý là một **lớp bọc mỏng trên các service sẵn có** — nó không có đường riêng nào vào cơ sở dữ liệu, nên mọi luật của tám phase trước tự động áp cho nó.

| # | Luật | Chặn ở |
|---|---|---|
| AI-01 | **Trợ lý không có quyền rộng hơn người đang hỏi.** Mọi công cụ chạy với `NguCanh` của người đó; danh sách công cụ gửi cho mô hình cũng đã lọc theo quyền, và còn một lần kiểm nữa ngay trước khi chạy | [SV] hai lớp · [TH] |
| AI-02 | **Số liệu chỉ đến từ công cụ.** Mỗi con số trong câu trả lời truy được về một dòng `ai_tool_calls` trong cùng cuộc trò chuyện. Lời nhắc hệ thống cấm mô hình nhớ ra hay suy ra số liệu | [SV] · [ĐV] · [TH] |
| AI-03 | **Trợ lý chỉ ĐỀ XUẤT, không tự chạy.** Hành động ghi sinh một dòng `ai_actions` trạng thái `de-xuat`; người dùng bấm Đồng ý thì service chạy với **quyền của người bấm**. Không có đường nào chuyển sang `da-chay` mà thiếu người duyệt | [CSDL] CHECK `ai_actions_duyet_check` · [SV] · [TH] |
| AI-04 | Hội thoại là **của riêng người hỏi**. Không ai đọc được hội thoại của người khác, kể cả Giám đốc | [SV] · [TH] |
| AI-05 | Vòng lặp mô hình ↔ công cụ có **trần**. Chạm trần thì dừng và nói thật là đã dừng giữa chừng, không ghép tạm một câu nghe như đã xong | [SV] hàm thuần · [ĐV] · [TH] |
| AI-06 | **Chưa cấu hình nhà cung cấp thì từ chối rõ ràng** (HTTP 503 kèm lý do), không sinh câu trả lời và không tạo hội thoại rỗng. Gọi mô hình hỏng cũng nói thẳng là chưa gọi được | [SV] · [TH] |
| AI-07 | Lịch sử hỏi đáp và từng lần gọi công cụ **chỉ ghi thêm** — đó là bằng chứng cho AI-02 | [CSDL] trigger · [TH] |
| AI-08 | Công cụ thiếu quyền, sai tham số hoặc không tồn tại đều **không làm sập lượt**: mô hình nhận một câu giải thích kèm lời dặn đừng đoán, và lần gọi hỏng vẫn được ghi | [SV] · [TH] |

Vai trò `ITA — Trợ lý AI` từ Phase 1 vẫn giữ nguyên giới hạn: không bao giờ có `*.approve` hay `*.delete` (bài thử `kiemTraGioiHanAI` chạy trong mọi lần seed).

**Chưa làm ở phase này**: tác nhân nền tự chạy (Follow-up Agent sinh "Việc hôm nay" bằng AI — bộ quy tắc Phase 8 đang làm việc đó bằng luật tường minh), trợ lý gửi tin cho khách, sinh CEO Briefing định kỳ, truy xuất tài liệu (RAG).

## 16. Mua hàng (phần để lại từ Phase 5)

Quyền `purchasing.*`; phạm vi theo người đề nghị (đề nghị mua) và người phụ trách (đơn mua). Ba chứng từ nối nhau: **đề nghị mua** (ai cần gì, vì sao) → **đơn mua** (đặt ai, giá bao nhiêu) → **nhận hàng** (hàng thật vào kho).

| # | Luật | Chặn ở |
|---|---|---|
| MH-01 | Số chứng từ cấp nguyên tử: `DN-<năm>-0001` (đề nghị), `DM-<năm>-0001` (đơn mua), `NK-<năm>-0001` (phiếu nhận) | [SV] · [CSDL] duy nhất `(tenant_id, number)` · [TH] |
| MH-02 | Đề nghị phải **được duyệt** mới đặt hàng được. **Người đề nghị không tự duyệt** đề nghị của mình, trừ khi có quyền duyệt phạm vi toàn công ty. Từ chối phải ghi lý do | [CSDL] CHECK · [SV] · [TH] |
| MH-03 | Đơn mua lập từ đề nghị **đã duyệt**, hoặc lập thẳng khi đã biết mua gì của ai. Lập từ đề nghị thì đề nghị chuyển sang Đã đặt hàng | [SV] · [TH] |
| MH-04 | Đơn mua **gửi nhà cung cấp rồi thì khóa dòng hàng**. Muốn đổi thì hủy đơn và lập đơn khác — chứng từ đã gửi ra ngoài không sửa lén | [SV] · [TH] |
| MH-05 | Nhận hàng **không vượt phần còn lại** của từng dòng. Chốt cuối là CHECK `received_qty <= quantity` ở tầng CSDL | [CSDL] CHECK · [SV] · [TH] |
| MH-06 | **Hàng vào kho bằng đúng `ghiSoKho()`** mà bán hàng dùng để xuất — số dư và sổ cái cập nhật trong cùng một giao dịch, nên `doiSoatKho()` vẫn đúng sau khi có mua hàng. Hàng theo sê-ri phải khai đủ sê-ri, và sê-ri kiểm **trước** khi đụng tồn | [SV] dùng lại hàm Phase 5 · [TH] đối soát kho sau mỗi lần nhận |
| MH-07 | Trạng thái đơn tính lại **từ dữ liệu thật của các dòng** sau mỗi lần nhận, không tin cờ đang lưu: nhận đủ → Đã nhận đủ, nhận dở → Nhận một phần | [SV] hàm thuần `tienDoNhan()` · [ĐV] · [TH] |
| MH-08 | Hủy đơn mua phải ghi lý do, và **chỉ hủy được khi chưa nhận đồng nào**. Đã nhận rồi thì hàng ở trong kho — muốn trả thì điều chỉnh tồn có lý do (KHO-03) | [CSDL] CHECK · [SV] · [TH] |
| MH-09 | **Phiếu nhận hàng không có đường hủy.** Ghi sai thì điều chỉnh tồn kèm lý do, để sổ cái kho luôn là sổ chỉ ghi thêm | [SV] không có hàm hủy · [TH] |

**Ai duyệt đề nghị mua**: Giám đốc, Quản trị, và **Kế toán – Tài chính** — duyệt chi tiền là việc của tài chính. Vai trò Mua hàng cố ý **không** tự duyệt đề nghị của chính mình.

**Gợi ý mua từ đơn bán**: mở một đơn bán đã xác nhận rồi bấm *Đề nghị mua*, hệ thống liệt kê đúng những dòng kho không đủ hàng để giao và điền sẵn số lượng còn thiếu.

**Chưa làm ở phần này**: hóa đơn nhà cung cấp và công nợ phải trả (`supplier_bills`, `supplier_payments`), trả hàng cho nhà cung cấp, cập nhật giá vốn danh mục theo giá mua thực tế, chuyển kho nội bộ.

## 17. Công nợ phải trả — hóa đơn nhà cung cấp và phiếu chi

Quyền `finance.*`, như công nợ phải thu. Đối xứng với mục 11 và **dùng chung đúng những hàm thuần đó** — `congNo()`, `nhomTuoiNo()`, `tongHopTuoiNo()` — nên hai chiều nợ không bao giờ tính theo hai kiểu khác nhau.

| # | Luật | Chặn ở |
|---|---|---|
| CT-01 | Số hóa đơn `HM-<năm>-0001`, số phiếu chi `PC-<năm>-0001`, cấp nguyên tử. Hóa đơn lập từ **đơn mua đã gửi nhà cung cấp** (chép nguyên dòng, giữ liên kết từng dòng) hoặc lập tay cho khoản lẻ | [SV] · [CSDL] duy nhất · [TH] |
| CT-02 | **Một đơn mua chỉ có một hóa đơn còn hiệu lực.** Gọi lập lần hai trả về đúng hóa đơn cũ (`daCoTruoc: true`) | [SV] · [TH] |
| CT-03 | Hóa đơn sinh ra ở trạng thái Nháp và **chưa tính nợ phải trả**. Ghi nhận mới chốt số tiền, ngày hóa đơn, hạn thanh toán và người ghi nhận | [CSDL] CHECK · [SV] · [TH] |
| CT-04 | **Hạn thanh toán bắt buộc nhập** khi ghi nhận — nó in trên hóa đơn nhà cung cấp gửi tới, không phải con số hệ thống tự suy ra. Hạn không được trước ngày hóa đơn; không ghi nhận cho ngày ở tương lai | [CSDL] CHECK · [SV] lược đồ · [TH] |
| CT-05 | Một phiếu chi trừ được cho nhiều hóa đơn. **Tổng phân bổ phải đúng bằng số tiền chi**, và từng hóa đơn không nhận quá phần còn nợ. Chỉ chi cho hóa đơn **đã ghi nhận** của **đúng nhà cung cấp** đó | [CSDL] CHECK (số tiền > 0) · [SV] · [TH] |
| CT-06 | **Nợ phải trả không lưu thành cột.** Còn nợ = hóa đơn đã ghi nhận − tổng phân bổ của phiếu chi còn hiệu lực (QĐ-09) | [SV] hàm thuần dùng chung · [TH] |
| CT-07 | Tuổi nợ chia năm nhóm y như phải thu: trong hạn, 1–30, 31–60, 61–90, trên 90 ngày | [SV] hàm thuần dùng chung · [ĐV] · [TH] |
| CT-08 | Hủy hóa đơn phải ghi lý do, và **chỉ hủy được khi chưa chi đồng nào** | [CSDL] CHECK · [SV] · [TH] |
| CT-09 | Hủy phiếu chi phải ghi lý do. Phiếu **không bị xóa**, chỉ đổi trạng thái; nợ của hóa đơn quay lại đúng như trước khi chi | [CSDL] CHECK · [SV] · [TH] |

**Đối chiếu ba chiều**: màn hình hóa đơn hiện cạnh nhau *đơn mua đặt bao nhiêu*, *kho đã nhận bao nhiêu*, *hóa đơn đòi bao nhiêu*, và cảnh báo ngay khi lệch — kiểm trước lúc ghi nhận, vì ghi nhận rồi là khóa.

Số tiền trên hóa đơn nhà cung cấp tính bằng đúng `tinhDonMua()` mà đơn mua dùng, nên hai chứng từ không ra hai con số cho cùng một dòng hàng.

**Chưa làm ở phần này**: trả hàng cho nhà cung cấp và giảm trừ công nợ, bù trừ công nợ hai chiều với khách vừa mua vừa bán, dự báo dòng tiền.

## 18. Trả hàng và đổi máy

Hai chiều đối xứng — khách trả cho mình, và mình trả nhà cung cấp — đi chung **một vòng đời**:

```
Nháp → Đã qua kho → Đã chốt tiền
```

Hàng đi trước (quyền `inventory.update`), tiền chốt sau (quyền `finance.approve`). Hai bước cố ý tách rời: ở cửa hàng, người nhận hàng và người chốt tiền là hai người khác nhau, và hàng về kho **không** đồng nghĩa với việc đã thỏa thuận xong số tiền (QĐ-41).

| # | Luật | Chặn ở |
|---|---|---|
| TH-01 | Số phiếu `TH-<năm>-0001` (khách trả) và `TM-<năm>-0001` (trả nhà cung cấp), cấp nguyên tử. Lập từ một **đơn** để đối chiếu, hoặc lập lẻ khi không có đơn | [SV] · [CSDL] duy nhất · [TH] |
| TH-02 | **Mọi phiếu phải ghi rõ vì sao trả.** Không có lý do thì không có phiếu | [CSDL] CHECK · [SV] lược đồ · [TH] |
| TH-03 | Không trả quá phần **đã thật sự giao** (chiều bán) hoặc **đã thật sự nhận** (chiều mua), trừ đi phần đã trả bằng các phiếu trước. Phiếu đã hủy không tính | [SV] · [TH] |
| TH-04 | **Xác nhận** là lúc hàng thật sự đi qua kho: hàng còn dùng được cộng lại tồn, máy đổi được xuất ra, sê-ri đổi trạng thái. Xác nhận rồi thì khóa sửa và khóa hủy | [CSDL] CHECK · [SV] · [TH] |
| TH-05 | Sê-ri khách trả phải là **máy mình đã bán ra** (đang ở trạng thái `da-ban`). Nhập lại kho thì về `trong-kho`, không nhập lại thì sang `tra-lai` và không thuộc kho nào | [CSDL] CHECK vị trí sê-ri · [SV] · [TH] |
| TH-06 | Hàng còn tốt mặc định cộng lại tồn; **hàng lỗi mặc định KHÔNG**. Muốn vẫn nhập lại hàng lỗi thì phải ghi rõ vì sao — nếu không, hàng hỏng nằm trên kệ bán mà không ai biết | [CSDL] CHECK · [SV] · [TH] |
| TH-07 | Chốt tiền bằng cách **giảm trừ công nợ**: tổng giảm trừ không vượt giá trị phiếu, và từng hóa đơn không nhận quá phần còn nợ. Giảm trừ **không** làm tăng "tiền đã thu"/"tiền đã chi" — nợ xóa bằng hàng và tiền về quỹ là hai chuyện (QĐ-42) | [CSDL] CHECK · [SV] hàm thuần dùng chung · [ĐV] · [TH] |
| TH-08 | **Đổi máy là đổi ngang, giá trị phiếu = 0.** Chênh lệch giá phải đi bằng chứng từ khác, không giấu trong phiếu đổi máy. Mỗi dòng đổi máy phải khai mặt hàng giao thay thế | [CSDL] CHECK · [SV] · [TH] |
| TH-09 | **Chỉ hủy được phiếu còn nháp.** Hàng đã qua kho thì phải xử bằng chứng từ ngược hoặc điều chỉnh tồn kèm lý do — cùng lý lẽ với phiếu nhận hàng (QĐ-36) | [SV] · [TH] |
| TH-10 | Đổi máy **không làm mới đồng hồ bảo hành**: phiếu bảo hành chuyển sang sê-ri máy mới nhưng giữ nguyên ngày bắt đầu và ngày hết hạn, kèm ghi chú truy ngược (QĐ-40) | [SV] · [TH] |

Hàng đi qua **đúng** `ghiSoKho()` mà bán hàng và mua hàng dùng, nên `doiSoatKho()` vẫn khớp sau mỗi phiếu. Tiền đi qua **đúng** `congNo()` của tài chính, nên hai chiều nợ không lệch cách tính.

**Ai làm gì** — không mở thêm mã quyền nào:

| Việc | Quyền |
|---|---|
| Xem phiếu khách trả | `order.view` **hoặc** `service_desk.view` **hoặc** `finance.view` |
| Lập / sửa / hủy phiếu khách trả | `order.update` **hoặc** `service_desk.update` |
| Xem phiếu trả nhà cung cấp | `purchasing.view` **hoặc** `finance.view` |
| Lập / sửa / hủy phiếu trả nhà cung cấp | `purchasing.update` |
| Xác nhận hàng đi qua kho | `inventory.update` |
| Chốt tiền (giảm trừ công nợ) | `finance.approve` |

**Chưa làm ở phần này**: hoàn tiền mặt cho khách khi không còn hóa đơn nào để giảm trừ, đòi lại tiền từ nhà cung cấp khi không còn hóa đơn nợ, chênh lệch giá khi đổi máy khác model, phiếu bảo hành cho chính cái máy đổi mới (bảo hành cũ được chuyển sang, không sinh phiếu mới).

## 19. Chuyển kho nội bộ

Điều hàng giữa hai kho. Quyền `inventory.create` để lập phiếu, `inventory.update` để xuất và nhận — không có mã quyền mới.

Vòng đời **hai bước**, vì hàng đi xe giữa hai kho:

```
Nháp → Đang trên đường → Đã nhận
```

Giữa hai bước hàng **không thuộc kho nào**. Đó là sự thật, và màn hình nói thẳng như vậy thay vì cho tồn nhảy tức thì từ kho này sang kho kia. Gộp một bước thì khi hàng thiếu lúc tới nơi sẽ không còn chỗ nào để ghi (QĐ-43).

| # | Luật | Chặn ở |
|---|---|---|
| CK-01 | Số phiếu `CK-<năm>-0001`, cấp nguyên tử. **Kho nhận phải khác kho xuất** — chuyển vào chính nó chỉ sinh hai bút toán triệt tiêu nhau mà không ai hiểu vì sao | [CSDL] CHECK · [SV] · [TH] |
| CK-02 | **Mọi phiếu phải ghi rõ vì sao chuyển.** Kho đóng cửa thì không nhận hàng vào được | [CSDL] CHECK · [SV] · [TH] |
| CK-03 | **Xuất** là lúc hàng thật sự rời kho nguồn: tồn nguồn giảm ngay, tồn đích **chưa** tăng. Xuất rồi thì khóa sửa và khóa hủy | [CSDL] CHECK · [SV] · [TH] |
| CK-04 | **Nhận** không quá số đã xuất. Nhận thiếu — kể cả nhận 0 — thì **bắt buộc ghi lý do**: hàng đã rời kho nguồn mà không tới kho đích thì phải có người trả lời câu hỏi "đi đâu". Bỏ trống phần khai nghĩa là nhận đủ | [CSDL] CHECK · [SV] hàm thuần · [ĐV] · [TH] |
| CK-05 | Sê-ri phải đang nằm ở **đúng kho nguồn**. Lúc xuất chuyển sang trạng thái `dang-chuyen` và **không thuộc kho nào**; nhận đủ thì về kho đích. Nhận thiếu thì sê-ri giữ nguyên `dang-chuyen` để còn truy được | [CSDL] CHECK vị trí sê-ri · [SV] · [TH] |
| CK-06 | **Chỉ hủy được phiếu còn nháp.** Hàng đã rời kho thì phải nhận về kho đích rồi lập phiếu chuyển ngược, hoặc điều chỉnh tồn kèm lý do — cùng lý lẽ QĐ-36 và TH-09 | [SV] · [TH] |

Hàng đi qua **đúng** `ghiSoKho()` mà bán hàng, mua hàng và trả hàng dùng, nên `doiSoatKho()` vẫn khớp — kể cả khi hàng đang trên đường, và kể cả khi nhận thiếu (sổ ghi một bút toán xuất và một bút toán nhập nhỏ hơn; số dư vẫn cộng đúng bằng sổ cái).

**Chưa làm ở phần này**: phiếu chuyển kho in ra giấy cho lái xe cầm, và tự động ghi hao hụt phần thiếu vào một tài khoản chi phí.

## 20. Tệp đính kèm

Đính tệp vào chứng từ: hóa đơn nhà cung cấp, phiếu khách trả hàng, phiếu trả nhà cung cấp, phiếu chuyển kho, đơn hàng, phiếu hỗ trợ.

**Không có mã quyền riêng cho tệp đính kèm.** Quyền mượn nguyên của chứng từ chủ — ai xem được hóa đơn nhà cung cấp thì xem được tệp của nó, ai sửa được phiếu trả hàng thì đính kèm được vào đó (DK-02). Kiểm cả **phạm vi dữ liệu**, không chỉ mã quyền: nhân viên có `order.view` phạm vi "của mình" thì không đọc được tệp của đơn người khác.

| # | Luật | Chặn ở |
|---|---|---|
| DK-01 | Chỉ đính kèm vào loại chứng từ hệ thống biết cách kiểm quyền xem. Thêm loại mới phải thêm cả ở CHECK và ở `src/modules/dinh-kem/quyen.ts` — thiếu một trong hai là có tệp mà không ai biết ai được đọc | [CSDL] CHECK · [SV] |
| DK-02 | Quyền đọc/ghi **mượn nguyên** quyền và phạm vi của chứng từ chủ, không có mã quyền riêng | [SV] `quyen.ts` · [TH] |
| DK-03 | Tệp rỗng bị chặn. Trần 20 MB mỗi tệp, tối đa 20 tệp một chứng từ — trần kỹ thuật, không phải ngưỡng nghiệp vụ | [CSDL] CHECK · [SV] · [ĐV] |
| DK-04 | **Danh sách trắng kiểu tệp**, nhận dạng theo **nội dung thật sự** (vài byte đầu), không tin `Content-Type` trình duyệt gửi lên. Đuôi tên và nội dung phải khớp nhau — tệp đặt tên `.pdf` mà ruột không phải PDF bị từ chối. Không nhận SVG, HTML, zip: những thứ chạy được trong trình duyệt hoặc không kiểm được bên trong | [CSDL] CHECK · [SV] hàm thuần · [ĐV] · [TH] |
| DK-05 | Tên tệp hiển thị được làm sạch (bỏ đường dẫn, ký tự điều khiển, dấu nháy). Tên trên đĩa là **id hệ thống sinh**, không phải tên người dùng đặt. Tải về luôn kèm `Content-Disposition: attachment` — không mở thẳng trong tab | [SV] · [ĐV] · [TH] |
| DK-06 | Gỡ tệp là **xóa mềm**, bắt buộc ghi lý do. Tệp vẫn nằm trên đĩa và bản ghi vẫn còn — chứng từ đã có người nhìn thấy thì không được biến mất không dấu vết | [CSDL] CHECK · [SV] · [TH] |

Nội dung tệp nằm **trên đĩa** (`data/dinh-kem`, gắn volume Docker), không trong CSDL — để bản sao lưu CSDL không phải kéo theo hàng gigabyte ảnh chụp hóa đơn. `scripts/sao-luu.sh` đóng gói riêng thư mục này thành `.tar.gz` cùng hạn giữ; **phục hồi phải lấy cả hai gói**.

Mã băm SHA-256 lưu cùng bản ghi; tải về kiểm lại mã băm — tệp trên đĩa khác với lúc tải lên thì báo lỗi rõ ràng, không im lặng trả tệp sai.

**Giới hạn cần biết**: bản sao lưu tệp đính kèm nằm trên cùng máy chủ như CSDL — mất máy chủ là mất cả hai (`VD-068`, chưa có nơi cất ngoài).

## 21. Khách hàng nâng cao (0.16.0)

Hành trình khách hàng, nhóm khách, lọc nhanh / bộ lọc đã lưu / tùy chọn cột, thao tác hàng loạt, chấm điểm khách, nhắc đứng lâu và sinh nhật, gộp khách trùng, xuất / nhập CSV, bàn giao khi nghỉ việc. Nghiệp vụ tham khảo ITW CRM 1.7–1.8, viết lại theo kiến trúc Cowork.

**Quyền**: xem theo `customer.view`; đổi hành trình, gắn nhóm, thao tác hàng loạt theo `customer.update` **trong phạm vi**; quản lý danh mục trạng thái và nhóm, bộ lọc dùng chung, gộp khách, tính lại toàn bộ điểm cần `customer.approve` (cấp thêm cho Trưởng phòng Kinh doanh, phạm vi "team" — QĐ-46); xuất CSV `customer.export`; nhập CSV `customer.create`; bảng điểm theo nguồn `setting.update`; bàn giao `user.update`.

**Trạng thái hành trình ≠ trạng thái giao dịch.** `customers.status` (tiềm năng / đang / ngừng giao dịch, thêm `da-gop`) giữ nguyên ý nghĩa cũ; hành trình là cột riêng `journey_stage_id` trỏ vào danh mục của doanh nghiệp.

| # | Luật | Chặn ở |
|---|---|---|
| KHN-01 | Trạng thái hành trình là danh mục riêng theo doanh nghiệp (tên, màu `#RRGGBB`, thứ tự, loại `mo` / `thanh-cong` / `that-bai`, số ngày đứng lâu tùy chọn). Không đụng `customers.status`. Không xóa trạng thái — ngừng dùng, và chỉ ngừng được khi không còn khách nào ở đó | [CSDL] CHECK · [SV] · [TH] |
| KHN-02 | Mọi lần đổi trạng thái — tay hay tự động — ghi một dòng `customer_journey_history` **chỉ ghi thêm** (từ, sang, ai, lúc nào, tự/tay, mốc, ghi chú) kèm Audit Log + Business Event, qua đúng một hàm `ghiDoiHanhTrinh()` | [CSDL] trigger `chan_sua_xoa` + CHECK · [SV] · [TH] |
| KHN-03 | Mốc tự chuyển là **mã** (`hanh-trinh/moc.ts`: tạo khách, có cơ hội mở, đã gửi báo giá, thắng cơ hội, đơn xác nhận). Mỗi mốc gắn tối đa một trạng thái; trạng thái thất bại không nhận mốc | [CSDL] duy nhất + CHECK · [SV] · [TH] |
| KHN-04 | Tự chuyển **chỉ tiến** theo thứ tự, không lùi, không tự đẩy vào trạng thái thất bại. Khách đang ở trạng thái thất bại chỉ được mốc mạnh (báo giá gửi, thắng cơ hội, đơn xác nhận) kéo lại. Tự chuyển chạy trong cùng giao dịch với thao tác gây ra mốc | [SV] hàm thuần `coTuChuyen` · [ĐV] · [TH] |
| KHN-05 | Nhóm khách nhiều–nhiều; tên nhóm không trùng (không phân biệt hoa thường). Tạo/sửa nhóm cần `customer.approve`; gắn/gỡ khách cần `customer.update` trên khách đó. Số khách của nhóm tính trong phạm vi người xem | [CSDL] duy nhất · [SV] · [TH] |
| KHN-06 | Phễu chuyển đổi: khách **tạo trong kỳ**, tính **bước xa nhất từng chạm** theo lịch sử (khách đã qua báo giá rồi bỏ vẫn tính là tới báo giá). Trạng thái thất bại nằm ngoài phễu. Mẫu số 0 → tỷ lệ `null`, không phải 0% | [SV] hàm thuần `tinhPheu` · [ĐV] · [TH] |
| KHN-07 | Bộ lọc dùng chung cần `customer.approve`. Áp bộ lọc (kể cả dùng chung) **luôn** qua phạm vi `customer.view` của người xem. Tham số lưu và tham số trên URL đều được lọc theo danh mục khóa + giá trị thật (lọc nhanh, sắp xếp, cột) — giá trị lạ bị bỏ, không tin dữ liệu lưu | [SV] `kiemTraThamSoBoLoc`, `locCot` · [ĐV] · [TH] |
| KHN-08 | Điểm khách 0–100 chỉ từ tín hiệu có thật (nguồn, tương tác và gặp mặt gần đây, im lặng lâu, cơ hội mở, báo giá đã gửi, đã có đơn xác nhận, có cách liên lạc). Không dùng giá vốn, không gọi AI. Trọng số ở Cấu hình (`diem_khach.*`) có **mặc định ghi rõ là mặc định**; ngưỡng Nóng/Ấm **chưa đặt → không xếp hạng** và lọc "Khách nóng" báo chưa đặt. Khách ngừng giao dịch / đã gộp không chấm; khách ở trạng thái thất bại = 0 | [CSDL] CHECK 0–100 · [SV] hàm thuần `chamDiem`, `hangDiem` · [ĐV] · [TH] |
| KHN-09 | Điểm tự tính lại khi có tương tác, cơ hội (tạo / đổi giai đoạn), báo giá gửi, đơn xác nhận, liên hệ thêm/sửa, gộp khách. "Tính lại toàn bộ" cần `customer.approve`. Tính lại điểm không đổi `updated_at` của khách | [SV] · [TH] |
| KHN-10 | Thao tác hàng loạt tối đa 500 khách, một giao dịch. Có khách nằm ngoài phạm vi sửa hoặc đã gộp → **từ chối cả lô**. Đổi người phụ trách hàng loạt theo KH-05 | [SV] · [TH] |
| KHN-11 | Gộp khách cần `customer.approve` và **cả hai** khách trong phạm vi `customer.update` của người gộp. Hai khách khác mã số thuế → chặn (hai pháp nhân). Một giao dịch; **khóa hai dòng khách (`FOR UPDATE`, theo thứ tự id) trước khi đọc và kiểm `da-gop`** — hai lần gộp đồng thời (C→B trong lúc B→A) không tạo chuỗi gộp | [SV] · [TH] (bài QA tranh chấp đồng thời) |
| KHN-12 | Khách bị gộp **không bị xóa**: `status = da-gop`, `merged_into_id` trỏ khách giữ lại. **Mọi** bảng có khóa ngoại tới khách (đọc từ catalog PostgreSQL lúc chạy) chuyển sang khách giữ lại, trừ lịch sử hành trình chỉ-ghi-thêm. Trường còn trống của khách giữ lại được bổ sung từ khách bị gộp (kể cả chiến dịch chạm đầu tiên `campaign_id` — MK-10). Khách từng gộp vào khách bị gộp trỏ thẳng sang khách giữ lại. Việc hôm nay đang mở của khách bị gộp được đóng (bỏ qua, ghi lý do); thông báo chưa đọc trỏ sang khách giữ lại | [CSDL] CHECK `customers_da_gop_check` · [SV] · [TH] (đếm từng bảng qua `information_schema`) |
| KHN-13 | Không gắn bản ghi mới (cơ hội, báo giá, đơn, tương tác, việc…), không sửa, không đổi hành trình khách đã gộp. Danh sách mặc định, xuất CSV, trợ lý và **thanh tìm kiếm toàn cục** ẩn khách đã gộp; mở theo id vẫn thấy (trỏ sang khách giữ lại) | [SV] `chanKhachDaGop` · [TH] |
| KHN-14 | Nhắc "khách đứng lâu": ngưỡng đặt **riêng từng trạng thái**; trạng thái chưa đặt thì không nhắc. Mỗi lần vào một trạng thái chỉ nhắc một lần (không nhắc lặp mỗi sáng). Lọc nhanh "Đứng lâu" và máy quét dùng **chung một hàm** `khachDungLau()` (ngày lịch giờ VN, bỏ khách ngừng giao dịch / đã gộp, bỏ trạng thái đã ngừng) | [CSDL] CHECK 1–365 · [SV] · [ĐV] · [TH] |
| KHN-15 | Nhắc sinh nhật người liên hệ đang hoạt động, giao cho người phụ trách khách. Mặc định nhắc đúng ngày; nhắc trước N ngày khi Giám đốc đặt `theo_doi.sinh_nhat_nhac_truoc_ngay`. Sinh ngày 29/02 nhắc vào 28/02 năm không nhuận | [SV] · [ĐV] · [TH] |
| KHN-16 | Nhập CSV khách: luôn xem trước rồi mới ghi; mỗi dòng chạy trong một SAVEPOINT qua đúng service (xem trước = chạy thật rồi cuộn ngược). Có Mã KH hoặc trùng MST → cập nhật khách đó (KH-02); trùng mềm (KH-03) → bỏ qua dòng trừ khi người nhập xác nhận. Mỗi lần ghi lưu `import_jobs`. Cột "Liên hệ nhận tin" chỉ có khi xuất; nhập không bao giờ ghi cờ đồng ý nhận tin (MK-13) | [SV] · [ĐV] · [TH] |
| KHN-17 | Bàn giao khi nghỉ việc (`user.update`): xem trước số việc từng loại; chuyển việc **đang dở** (khách, lead mở, cơ hội mở, việc chưa xong, báo giá chưa chốt, đơn chưa giao xong, hóa đơn đang theo dõi, phiếu hỗ trợ mở, bảo trì, gia hạn; và việc Marketing — chiến dịch chưa kết thúc / hủy, form / nguồn webhook / phân khúc đang dùng, landing nháp / đang xuất bản, suất nhận lead vòng tròn: người nhận chưa có suất thì nhận nguyên suất, đã có thì suất người nghỉ chuyển tạm dừng) rồi khóa tài khoản — một giao dịch. Việc đã xong giữ nguyên người làm. Không bàn giao cho chính mình hoặc người đã ngừng. Người nhận thiếu quyền xem một loại việc → vẫn chuyển nhưng kết quả **nêu rõ** loại việc đó để cấp vai trò (không chặn: quản trị có thể bàn giao tạm cho mình rồi phân lại) | [SV] · [TH] |
| KHN-18 | Nhập CSV, thao tác hàng loạt, tính lại toàn bộ điểm chạy với hạn giao dịch `HAN_GIAO_DICH_THEO_LO_MS` (120 giây) thay vì 5 giây mặc định; vẫn MỘT giao dịch (QĐ-56) | [SV] `xuLyApi(..., { hanGiaoDichMs })` · [TH] (QA: 2.000 dòng, 500 khách) |

### Xuất CSV (dùng chung mọi bộ xuất)

| # | Luật | Chặn ở |
|---|---|---|
| CSV-01 | **Chống chèn công thức**: ô chuỗi bắt đầu bằng `=` `+` `-` `@`, tab hoặc xuống dòng được thêm dấu `'` ở đầu để Excel / LibreOffice hiện nguyên văn (không chạy `=HYPERLINK`, `=cmd|…`). Ô kiểu số giữ nguyên. Áp trong `taoCsv()` nên mọi bộ xuất (khách hàng, sản phẩm…) đều được che | [SV] hàm thuần `voHieuCongThuc` · [ĐV] · [TH] |

**Chưa làm ở phần này**: chấm điểm cho **lead** (chỉ chấm khách — QĐ-49); tự động chạy "tính lại toàn bộ" theo lịch (điểm cũ dần với tín hiệu "im lặng lâu" cho tới khi có sự kiện mới hoặc quản lý bấm tính lại); gộp **lead** trùng; hoàn tác gộp bằng một nút (nhật ký đủ trước/sau để làm tay).

## 22. Marketing và thu lead (0.16.0)

Chiến dịch, chi phí, chỉ số; **một cửa nhận lead** cho form công khai, landing page, webhook và nhập tay; phân khúc; landing page. Không thêm mã quyền: dùng phân hệ `marketing.*` đã có từ Phase 1 (Trưởng phòng Marketing, Nhân viên Marketing — phạm vi toàn công ty; Thực tập sinh Marketing — phạm vi của mình). Phạm vi tính theo `owner_id` của chiến dịch / form / nguồn webhook / phân khúc / landing.

| Việc | Quyền |
|---|---|
| Xem chiến dịch, form, webhook, phân khúc, landing, nhật ký nhận lead | `marketing.view` |
| Tạo chiến dịch, form, nguồn webhook, phân khúc, landing; nhập tay lead | `marketing.create` |
| Sửa, đổi trạng thái, ghi / hủy chi phí, đổi khóa / thu hồi webhook, đặt danh sách nhận lead | `marketing.update` (trong phạm vi) |
| Duyệt ngân sách chiến dịch | `marketing.approve` |
| Ghi nhận đồng ý / từ chối nhận tin | `crm.update` (lead) · `customer.update` (liên hệ) · hoặc `marketing.update` |
| Gửi form / gọi webhook | Không cần đăng nhập — form phải đang mở, webhook phải đúng khóa |

| # | Luật | Chặn ở |
|---|---|---|
| MK-01 | Mã chiến dịch `CD-<năm>-0001`, cấp nguyên tử. `utm_campaign` chuẩn hóa (bỏ dấu, chữ thường) và **duy nhất** trong doanh nghiệp — để một đường dẫn quảng cáo chỉ thuộc một chiến dịch | [CSDL] duy nhất + CHECK khuôn · [SV] · [TH] |
| MK-02 | Kênh, trạng thái trong danh mục; ngân sách ≥ 0; ngày kết thúc ≥ ngày bắt đầu. Vòng đời: Kế hoạch → (Chờ duyệt) → Đang chạy ⇄ Tạm dừng → Kết thúc; Hủy (bắt buộc lý do) chỉ từ Kế hoạch / Chờ duyệt. Kết thúc / hủy thì khóa sửa | [CSDL] CHECK · [SV] hàm thuần · [ĐV] · [TH] |
| MK-03 | **Ngân sách > 0 phải được duyệt (`marketing.approve`) trước khi chạy.** Tăng ngân sách vượt mức đã duyệt khi đang chạy → tự về Chờ duyệt. Người phụ trách không tự duyệt, trừ phạm vi duyệt toàn công ty. Từ chối phải có lý do. Gửi duyệt báo chuông người có quyền duyệt | [CSDL] CHECK `marketing_campaigns_duyet_check` · [SV] · [TH] |
| MK-04 | Chi phí theo ngày / theo khoản, số tiền > 0. **Không xóa** — hủy kèm lý do. Không ghi chi phí vào chiến dịch đã hủy. Chi vượt ngân sách (đã duyệt) → cảnh báo, không chặn (hóa đơn quảng cáo về muộn vẫn phải ghi được) | [CSDL] CHECK · [SV] · [TH] |
| MK-05 | CPL = chi phí / số lead; ROAS = doanh thu / chi phí; tỷ lệ đủ điều kiện, tỷ lệ chuyển đổi = / số lead. **Mẫu số 0 → để trống (null), không ghi 0.** Doanh thu = hóa đơn đã phát hành của khách mới do chiến dịch mang về (QĐ-59). Dòng tổng cộng đầu vào rồi tính lại, không cộng tỷ lệ | [SV] hàm thuần `tinhChiSoChienDich` · [ĐV] · [TH] |
| MK-06 | **Mọi kênh đi qua `nhanLead()`**. SĐT / email / MST chuẩn hóa theo KH-07; cần họ tên (hoặc công ty) và SĐT hoặc email (LD-02) | [SV] · [TH] |
| MK-07 | Dò trùng (LD-03) theo SĐT / email / MST: trùng **lead đang mở** → ghi thêm tương tác vào lead đó, bổ sung chỗ còn trống, báo người phụ trách, không tạo lead mới (và không đẻ việc gọi lại thứ hai nếu còn việc mở). Trùng **khách / liên hệ** → vẫn tạo lead mới, gắn `matched_customer_id`, giao người phụ trách khách; trùng khách **đã gộp** → gắn khách giữ lại (KHN-13). Ghi chú hệ thống không đổi giai đoạn lead. **Hai lần gửi cùng lúc** cùng SĐT / email / MST không lọt qua nhau: khóa tư vấn `pg_advisory_xact_lock` theo (doanh nghiệp, giá trị chuẩn hóa), thứ tự cố định, trước bước dò — áp cả cho lead sale tạo tay | [SV] · [TH] (cả bài đồng thời) |
| MK-08 | Chia lead: vòng tròn theo danh sách sale nhận lead (bộ đếm nguyên tử trong `document_sequences`). **Mọi bước** (chỉ định, người phụ trách khách, danh sách, phụ trách chiến dịch, người phụ trách form / nguồn / người nhập) chỉ nhận người đang hoạt động **có `crm.view`**; không ai đủ điều kiện → Giám đốc / Quản trị. Thực tập sinh Marketing không bao giờ nhận lead | [SV] · [ĐV] · [TH] |
| MK-09 | Lead mới sinh việc **“Gọi lại”** ưu tiên Cao cho người nhận, hạn = lúc nhận + `marketing.phut_goi_lai_lead`. **Chưa đặt → việc không có hạn** và mô tả việc + màn hình Nhận lead nói rõ. Chuông báo người nhận. Mô tả việc **không chép SĐT / email** — người xem việc mở lead để thấy liên lạc theo quyền của mình (MK-15) | [SV] · [TH] |
| MK-10 | Gắn chiến dịch: `utm_campaign` khớp chiến dịch → chiến dịch đó; không thì chiến dịch của form / nguồn webhook / chọn tay. Lưu đủ 5 khóa UTM trên lead. Chuyển đổi lead: chiến dịch đi theo sang cơ hội; sang khách **chỉ khi khách mới** (QĐ-59) | [SV] · [TH] |
| MK-11 | Form công khai: trường chỉ từ danh mục (họ tên, SĐT, email, công ty, chức danh, MST, nhu cầu, ghi chú) — form ngoài không ghi được người phụ trách, giai đoạn, giá trị. Trần độ dài từng trường, thân ≤ 20 KB. Ô bẫy chống bot (trả “thành công” nhưng không tạo lead, ghi nhật ký `spam`). Giới hạn tốc độ theo IP (cả đếm lượt xem trang form / landing). Ký tự điều khiển (NUL…) trong bất kỳ trường nào → 400; mã doanh nghiệp / slug / mã nguồn sai khuôn → 404 (webhook: 401 như sai khóa) mà không truy vấn. Trần thân tính theo **byte** (Content-Length rồi đếm lại sau khi đọc) → 413. Form tắt / mã doanh nghiệp sai → 404 | [SV] · [ĐV] · [TH] |
| MK-12 | Webhook: khóa hiện **một lần**, máy chủ chỉ giữ SHA-256, so thời gian hằng; đổi khóa → khóa cũ hết hiệu lực ngay; thu hồi được. **Mọi lần nhận — kể cả bị từ chối** (sai / thiếu khóa, đã thu hồi, dữ liệu sai) — vào nhật ký `lead_captures` chỉ-ghi-thêm | [CSDL] CHECK + trigger · [SV] · [ĐV] · [TH] |
| MK-13 | Đồng ý nhận tin chỉ khi **chính người đó** tự tích (ô không tích sẵn; form không hỏi thì không bao giờ coi là đồng ý; nhập tay phải có bằng chứng). **Từ chối luôn thắng**: người đã từng từ chối (trên bất kỳ lead nào, hay liên hệ khách, cùng SĐT / email — hoặc đã bấm hủy nhận tin trong thư email nên nằm trong danh sách chặn `email_suppressions`) thì kênh công khai và nhập tay **không** bật lại đồng ý, không xóa lời từ chối; lead mới của người đó mang luôn lời từ chối (`ke-thua-tu-choi`); nếu lần gửi có tích đồng ý thì ghi một ghi chú "cần xác nhận lại" để người phụ trách xử lý tay (đổi tay qua nút Ghi nhận đồng ý, có ghi nguồn). Đồng ý và từ chối không cùng bật. Lưu thời điểm và nguồn đồng ý | [CSDL] CHECK · [SV] · [TH] |
| MK-14 | Phân khúc: điều kiện JSON chỉ gồm trường trong danh mục (Zod `.strict()`); dịch sang điều kiện truy vấn bằng mã, không nhận biểu thức tự do. Danh sách gửi tin (`danhSachTheoPhanKhuc`) mặc định **chỉ người đã đồng ý và chưa từ chối** | [SV] · [ĐV] · [TH] |
| MK-15 | SĐT / email của lead hiện khi có `crm.view`; của liên hệ khách khi có `customer.view`; còn lại **che** (Thực tập sinh Marketing luôn bị che). Lấy danh sách không che để gửi cần `marketing.update` và không trả về trình duyệt | [SV] · [ĐV] · [TH] |
| MK-16 | Landing page dựng từ danh mục khối khai báo bằng mã; không nhận HTML / script; ảnh và liên kết chỉ `https://`; tối đa 30 khối. Chỉ trang **đang xuất bản** mở công khai. Trang có khối form phải chọn form; xuất bản cần form đang mở. Đang xuất bản thì không đổi đường dẫn | [CSDL] CHECK · [SV] lược đồ · [ĐV] · [TH] |

**Chưa làm ở phần này**: kéo lead trực tiếp từ Facebook Graph API (hiện nhận qua Zapier / Make gọi webhook); ảnh landing lấy từ tệp đính kèm; gửi email / SMS theo phân khúc (gói Email marketing); xuất phân khúc ra Excel; báo cáo thời gian phản hồi lead.

## 23. Email marketing

Gửi thư giới thiệu sản phẩm, khuyến mãi tới lead và liên hệ của khách qua hộp thư SMTP của công ty. **Gửi cần duyệt**: người soạn (`marketing.create/update`) lập chiến dịch, người có `marketing.approve` (Trưởng phòng Marketing, Giám đốc) mới đưa được vào hàng gửi. Kết nối SMTP do `integration.*` (Quản trị) giữ.

Vòng đời chiến dịch: **Nháp → Chờ duyệt → Đang gửi ⇄ Tạm dừng → Đã gửi xong**, hoặc **Đã huỷ**. Chờ duyệt trả về Nháp được (kèm lý do).

| # | Luật | Chặn ở |
|---|---|---|
| EM-01 | Kết nối SMTP: cổng 1–65535, mã hóa `tls` / `starttls` / `none`, địa chỉ gửi đúng dạng email — [CSDL] CHECK. **Không gửi mật khẩu qua kết nối không mã hóa** (`none` + tên đăng nhập bị từ chối) — chỉ chặn ở [SV] `luuKetNoi` | [CSDL] CHECK (cổng, chế độ, địa chỉ) · [SV] · [TH] |
| EM-02 | Mật khẩu SMTP **không bao giờ lưu dạng thuần**: mã hóa AES-256-GCM bằng `APP_ENC_KEY` trước khi ghi; API chỉ trả cờ "đã có mật khẩu"; nhật ký kiểm toán chỉ ghi "đã đổi / giữ nguyên / đã xóa". Bỏ trống ô mật khẩu khi lưu = giữ nguyên | [CSDL] CHECK tiền tố `v1:` · [SV] · [TH] |
| EM-03 | Nội dung thư soạn bằng **khối an toàn** (tiêu đề, đoạn văn, nút liên kết, ảnh, danh sách, đường ngăn cách). Không có ô nào nhận HTML; máy chủ dựng HTML và thoát mọi ký tự — kể cả giá trị biến lấy từ dữ liệu khách. Liên kết và ảnh chỉ nhận `https://`. Tiêu đề thư không được xuống dòng | [SV] lược đồ + hàm thuần · [ĐV] · [TH] |
| EM-04 | Biến cá nhân hóa **danh sách trắng**: `{{ten}}`, `{{cong_ty}}`, `{{email}}`, `{{cong_ty_gui}}` (so bằng `Object.hasOwn` — `{{constructor}}`, `{{__proto__}}`… cũng bị từ chối). Biến khác bị từ chối lúc lưu, không lặng lẽ để nguyên. Không dùng biến trong địa chỉ liên kết | [SV] · [ĐV] · [TH] |
| EM-05 | Chuyển trạng thái chiến dịch chỉ theo vòng đời trên; đã xong / đã huỷ không mở lại. Huỷ phải có lý do | [CSDL] CHECK · [SV] hàm thuần · [ĐV] · [TH] |
| EM-06 | **Gửi cần `marketing.approve`**. Nội dung và điều kiện người nhận chỉ sửa được khi còn Nháp; đã vào hàng gửi thì phải có người duyệt và thời điểm duyệt. Tạm dừng: `marketing.update` (ai soạn được cũng dừng được); tiếp tục, huỷ chiến dịch đang gửi: `marketing.approve` | [CSDL] CHECK · [SV] · [TH] |
| EM-07 | Danh sách người nhận **chốt lúc duyệt**: loại người không có email, email sai dạng, đã từ chối nhận tin, email hỏng, và gộp trùng theo email chữ thường. Khóa duy nhất (chiến dịch, email) là chốt cuối chống gửi trùng | [CSDL] duy nhất + CHECK chữ thường · [SV] hàm thuần · [ĐV] · [TH] |
| EM-08 | Mỗi người nhận một dòng trạng thái: Chờ gửi, Đang gửi, Đã gửi, Lỗi, Bị loại. **Lỗi và Bị loại phải có lý do**; Đã gửi phải có thời điểm gửi | [CSDL] CHECK · [TH] |
| EM-09 | **Chân thư bắt buộc**: tên + địa chỉ công ty (Hồ sơ công ty) và liên kết huỷ nhận tin — máy tự thêm, người soạn không bỏ được. Hồ sơ công ty chưa khai địa chỉ thì không gửi duyệt / duyệt được | [SV] · [ĐV] · [TH] |
| EM-10 | **Huỷ nhận tin một chạm**: liên kết mang mã ký HMAC (không đoán được, không chứa email). Mở trang **không** tự huỷ (trình quét thư mở sẵn mọi liên kết); bấm nút mới huỷ. Thư có tiêu đề `List-Unsubscribe` + `List-Unsubscribe-Post` (RFC 8058) để Gmail/Outlook huỷ ngay trong hộp thư. Huỷ ghi `marketing_opt_out_at` lên **mọi** lead/liên hệ cùng email, **đồng thời tắt `marketing_opt_in`** và ghi nguồn `huy-nhan-tin-email` (MK-13 — hai cờ không cùng bật), và đưa email vào danh sách chặn — mọi lần gửi sau đều loại | [SV] · [ĐV] mã ký · [TH] |
| EM-11 | Theo dõi mở / bấm **tùy chọn** (bật ở Kết nối email, chụp lại lúc duyệt). Liên kết bấm chỉ chuyển tới URL **có trong nội dung chiến dịch**, theo chỉ số nằm trong mã ký — không nhận URL từ đường dẫn (chống open redirect). Nhật ký mở / bấm / huỷ chỉ ghi thêm | [SV] · [CSDL] trigger · [ĐV] · [TH] |
| EM-12 | Người nhận lấy qua **nguồn người nhận** theo quyền và **phạm vi dữ liệu** của người thao tác: lead cần `crm.view`, liên hệ cần `customer.view`. Email người nhận chỉ hiện đủ cho người có quyền xem nguồn đó; người khác thấy dạng che (`ng•••@abc.vn`). Trần kỹ thuật 20.000 người một chiến dịch. Nguồn **`phan-khuc`** (gói Marketing, MK-14) chỉ trả người **đã đồng ý và chưa từ chối**, cần `marketing.view` và `marketing.update` (lấy email thật — thực tập sinh và sale không lấy được) | [SV] · [TH] (`thu:gop-m-e`) |
| EM-13 | **Chỉ đổ lỗi cho người nhận khi chắc chắn.** Lỗi phía hộp thư gửi — mất kết nối, sai đăng nhập, **mọi 4xx**, mọi lỗi ở MAIL FROM hoặc DATA, và ở RCPT mà mã 5.4.x / 5.7.x hoặc câu trả lời nói về hạn mức, SPF/DKIM, relay, quyền gửi (Gmail 550 5.4.5, M365 5.7.60, 5.7.708) — thì thư **chưa đi** trả về hàng chờ, chiến dịch **tự tạm dừng** kèm lý do tiếng Việt và báo người lập + người duyệt. Chỉ ở RCPT với mã 5.1.x / 5.2.1 (hoặc 550/551/553 không mã mở rộng mà câu trả lời nói rõ người nhận không tồn tại) mới ghi Lỗi + đưa email vào danh sách chặn "email hỏng". 5.2.2 hộp thư đầy và 5.7.x chính sách bên nhận → Lỗi cho đúng người đó, không chặn. `APP_ENC_KEY` thiếu / sai hoặc Hồ sơ công ty mất địa chỉ (EM-09) lúc đang gửi → cũng tự tạm dừng kèm lý do | [SV] hàm thuần · [ĐV] · [TH] |
| EM-14 | **Gửi tối đa một lần**: dòng đã nhận việc (Đang gửi) mà máy dừng giữa chừng quá 10 phút → ghi Lỗi "không rõ đã gửi chưa", **không gửi lại**. Tốc độ đếm theo CSDL; bước đếm + nhận việc chạy dưới `pg_advisory_xact_lock` theo doanh nghiệp, nên khởi động lại worker hay chạy nhiều worker cùng lúc cũng không vượt ngưỡng | [SV] · [CSDL] khóa tư vấn · [TH] |
| EM-15 | Thư thử (của kết nối, mẫu hoặc chiến dịch) chỉ gửi tới email của chính người bấm, không tạo dòng người nhận, không ghi tương tác | [SV] · [TH] |
| EM-16 | Gửi thành công ghi một **tương tác `email`** vào dòng thời gian lead / khách (TT-02), người ghi là người lập chiến dịch. Thư hàng loạt **không** tự chuyển lead sang "Đã liên hệ" (LD-04 không áp) | [SV] · [TH] |

Ngưỡng ở Cấu hình: `email.so_thu_moi_phut` (chưa đặt → **10 thư/phút**, mức chậm an toàn cho Gmail/Microsoft 365, ghi rõ là mặc định), `email.so_thu_toi_da_moi_ngay` (chưa đặt → không chặn theo ngày).

## 24. Xác thực 2 lớp

Mã 6 số đổi mỗi 30 giây (TOTP, RFC 6238) từ ứng dụng xác thực trên điện thoại. Mỗi người tự bật ở **Tài khoản của tôi**; Quản trị chọn vai trò **bắt buộc** và đặt lại cho người mất máy.

| # | Luật | Chặn ở |
|---|---|---|
| XT-01 | Bật = nhận khóa bí mật → nhập đúng mã 6 số đang hiện. Chưa xác nhận thì khóa chỉ ở trạng thái chờ, đăng nhập chưa đòi mã | [SV] · [TH] |
| XT-02 | Khóa bí mật TOTP **mã hóa** như mật khẩu SMTP (gắn với từng người — chép sang người khác không giải được); đã bật thì phải có khóa | [CSDL] CHECK · [SV] · [ĐV] · [TH] |
| XT-03 | 10 **mã khôi phục** dùng một lần, chỉ lưu băm (HMAC-SHA256 có khóa riêng); hiện đúng một lần lúc bật / sinh lại. Sinh lại thì mã cũ hết hiệu lực | [CSDL] CHECK · [SV] · [TH] |
| XT-04 | Đăng nhập 2 bước: mật khẩu đúng chỉ cấp **phiên tạm 5 phút** (cookie riêng, không mở được trang hay API nào), nhập mã đúng mới cấp phiên thật và mới ghi "đăng nhập" | [SV] route · chạy thật |
| XT-05 | Một câu lỗi chung cho mọi kiểu sai mã. Mã sai dùng **chung bộ đếm khóa tài khoản** với bước mật khẩu (N lần / M phút ở Cấu hình) + giới hạn tốc độ theo IP và tài khoản; nhập đúng thì xoá bộ đếm tốc độ. Hàng rào này áp cho **cả** bước 2 đăng nhập lẫn các thao tác trong phiên cần mã (tắt 2 lớp, sinh lại mã khôi phục). Mỗi mã TOTP chỉ dùng được một lần (chặn phát lại trong cửa sổ ±30 giây); phiên tạm chỉ dùng được một lần (ký trước lần đăng nhập thành công gần nhất thì hết giá trị). `APP_ENC_KEY` sai → 503 câu chung cho người ngoài, log máy chủ ghi rõ | [SV] · [ĐV] · [TH] |
| XT-06 | Vai trò bắt buộc 2 lớp do người có `setting.update` chọn. **Chưa đặt = không bắt buộc ai.** Người bị bắt mà chưa bật thì sau đăng nhập chỉ vào được trang bật 2 lớp; API trả 403 `phai-bat-2-lop` | [SV] `layHoSoQuyen` + `xuLyApi` + `yeuCauDangNhap` · [TH] |
| XT-07 | Bật, tắt, đặt lại đều **thu hồi mọi phiên khác** (như đổi mật khẩu). Tắt cần cả mật khẩu và một mã. Vai trò bắt buộc thì không tự tắt được | [SV] · [TH] |
| XT-08 | Quản trị (`user.update`) đặt lại 2 lớp cho người khác, bắt buộc ghi lý do, ghi kiểm toán; không tự đặt lại cho chính mình | [SV] · [TH] |

## 26. Toàn vẹn tài chính và mua hàng (0.16.1)

Các luật ở mục 11, 16, 17 đã đúng khi **một người bấm một lần**. Mục này bịt các lỗ khi **hai yêu cầu chạy cùng lúc** (hai kế toán, hoặc một cú bấm đúp) và vài chỗ dữ liệu lệch nhau giữa chứng từ. Cách khóa: `khoaChungTu()` (QĐ-77) — `SELECT … FOR UPDATE` dòng chứng từ **trước** khi đọc trạng thái, nhiều dòng thì theo thứ tự id tăng dần.

| # | Luật | Chặn ở |
|---|---|---|
| TV-TC-01 | **Thu / chi không vượt nợ kể cả khi chạy cùng lúc.** Phiếu thu (phiếu chi) khóa mọi hóa đơn được phân bổ rồi mới đọc phần còn nợ: hai phiếu cùng lúc cho một hóa đơn thì phiếu sau chờ phiếu trước xong rồi đọc lại. Một hóa đơn chỉ được chọn **một lần** trong một phiếu | [SV] khóa dòng · [TH] đồng thời |
| TV-TC-02 | **Hủy hóa đơn, phát hành / ghi nhận, hủy phiếu thu / chi đều khóa chứng từ trước khi đọc.** Hủy hóa đơn chạy đua với thu tiền thì đúng một việc thắng — không có tiền thu treo trên hóa đơn đã hủy. Hủy một phiếu hai lần cùng lúc thì một lần ghi, lần kia báo "đã hủy" | [SV] · [TH] đồng thời |
| TV-TC-03 | **Không hủy hóa đơn đã có giảm trừ trả hàng đã chốt** (cả chiều bán lẫn chiều mua). Phiếu trả hàng đã chốt tiền không gỡ được (TH-04), nên hủy hóa đơn sẽ bỏ khoản giảm trừ lơ lửng. Thông báo nêu số phiếu trả hàng; nút Hủy trên màn hình ẩn luôn | [SV] · [TH] |
| TV-TC-04 | **Một đơn — một hóa đơn còn hiệu lực, kể cả khi bấm cùng lúc** (TC-02, CT-02). Lập hóa đơn từ đơn khóa dòng đơn hàng / đơn mua trước khi dò hóa đơn đã có; yêu cầu thứ hai nhận lại đúng hóa đơn của yêu cầu thứ nhất (`daCoTruoc: true`). Chốt cuối ở CSDL: chỉ mục duy nhất riêng phần trên hóa đơn chưa hủy. Lập hóa đơn **từng phần không có** — xem QĐ-83 | [SV] · [CSDL] `invoices_mot_hieu_luc_moi_don`, `supplier_bills_mot_hieu_luc_moi_don` · [TH] |
| TV-TC-05 | **Hóa đơn chỉ gắn dự án của chính khách đó**; dự án đã gắn một đơn hàng thì chỉ gắn vào hóa đơn của đúng đơn đó. Chọn khách (nhà cung cấp) khác với khách (nhà cung cấp) của đơn thì từ chối, không lặng lẽ lấy theo đơn | [SV] · [TH] |
| TV-TC-06 | Công nợ vẫn **tính lúc đọc** (TC-06, CT-06) — không thêm cột số dư nào. Khóa dòng thay cho cột số dư: đúng một nguồn số, và đúng khi chạy song song | [SV] |
| TV-TC-07 | Hủy hóa đơn nhà cung cấp và hủy phiếu chi **ghi sự kiện** (`SUPPLIER_BILL_CANCELLED`, `SUPPLIER_PAYMENT_CANCELLED`) như bên bán — trước đây chỉ có nhật ký kiểm toán | [SV] · [TH] |
| TV-TC-08 | **Hủy đơn mua trả đề nghị gốc về "Đã duyệt"** để đặt lại được (nhu cầu mua vẫn còn), có nhật ký kiểm toán trên đề nghị. Mọi bước đổi trạng thái đề nghị (xin duyệt, duyệt / từ chối, sửa, hủy, lập đơn mua) và đơn mua (sửa, gửi, xác nhận, hủy, nhận hàng) khóa dòng trước khi đọc: hai người cùng lập đơn từ một đề nghị thì chỉ một đơn; nhận đủ hàng hai lần cùng lúc thì một phiếu nhận, lần kia báo lỗi nghiệp vụ | [SV] · [TH] đồng thời |
| TV-TC-09 | Dòng đơn mua chỉ được trỏ về **dòng của chính đề nghị** mà đơn lập từ đó; đơn không lập từ đề nghị thì không trỏ dòng đề nghị nào | [SV] · [TH] |
| TV-TC-10 | **Không hủy đơn mua còn hóa đơn nhà cung cấp còn hiệu lực** — hủy hóa đơn ở Công nợ phải trả trước, để không có khoản phải trả treo trên đơn đã hủy | [SV] · [TH] |
