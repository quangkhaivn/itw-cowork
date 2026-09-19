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

## 4. Báo giá (Phase 4 — đã chốt từ prompt, chưa triển khai)

- Biên lợi nhuận gộp % = (Doanh thu − Giá vốn) / Doanh thu × 100. Hàm thuần, có bài thử.
- Dưới ngưỡng `bao_gia.nguong_bien_loi_nhuan` → `PENDING_APPROVAL` → Trưởng phòng KD / Giám đốc duyệt. Ngưỡng chưa đặt → mọi báo giá phải duyệt.
- Báo giá đã gửi không sửa; sửa = phiên bản mới `QT-2026-0001-V2`.
- Chấp nhận → chuyển đơn một thao tác, không nhập lại.
- AI chỉ tạo `DRAFT`.
