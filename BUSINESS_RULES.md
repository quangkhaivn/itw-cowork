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
