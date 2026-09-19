# Kiến trúc AI — TGTH Business Cowork

Cập nhật: 19/09/2026. **Trạng thái: thiết kế.** Chưa có dòng mã AI nào chạy — AI triển khai ở Phase 9, sau khi dữ liệu lõi (khách hàng, sản phẩm, báo giá, đơn hàng) đủ ổn định (mục 40 master prompt).

Nền móng cho AI **đã có từ Phase 1**:
- Tài khoản máy `ita@he-thong.noi-bo` với vai trò `ai-assistant`: chỉ đọc + soạn nháp; **không bao giờ** có quyền `approve` hay `delete` — chặn ở định nghĩa, ở seed, ở service Vai trò, và có bài thử.
- Mọi nghiệp vụ nằm trong service nhận `NguCanh` (người dùng + quyền + phạm vi). Công cụ AI gọi đúng các service này.
- `business_events.actor_type = 'ai'` để lọc được mọi việc do AI làm.

## 1. Nguyên tắc

1. **AI không có quyền riêng rộng hơn người đang hỏi.** Khi nhân viên kinh doanh hỏi, mọi công cụ chạy với hồ sơ quyền **của nhân viên đó** (phạm vi `own`) — AI không thấy khách của người khác. Vai trò `ai-assistant` chỉ dùng cho tác vụ nền không có người hỏi (Follow-up Agent), và khi đó kết quả chỉ được giao cho đúng người có phạm vi phù hợp.
2. **Dữ liệu doanh nghiệp chỉ đến từ công cụ.** Mô hình không được trả lời số liệu từ trí nhớ. Mọi con số trong câu trả lời phải truy được về một lần gọi công cụ trong cùng cuộc hội thoại; không tìm thấy thì nói "không tìm thấy".
3. **AI chỉ tạo bản nháp.** Báo giá do AI lập ở trạng thái Draft; gửi khách, duyệt, đổi giá, xóa — luôn cần người bấm.
4. **Không khóa vào một nhà cung cấp.** Lớp trừu tượng nhà cung cấp; đổi mô hình là đổi cấu hình.
5. **Mọi lần gọi đều ghi lại**: câu hỏi, công cụ, tham số, kết quả rút gọn, thời gian, lỗi, chi phí.

## 2. Thành phần

```
Giao diện chat (AI Center)  ──▶  /api/v1/ai/hoi-dap  (xuLyApi: phiên, quyền ai.view)
                                      │
                                      ▼
                             Bộ điều phối (agent loop)
                               ├─ lớp nhà cung cấp: goiMoHinh(tinNhan, congCu, luocDoKetQua)
                               ├─ sổ công cụ: tên → { mô tả, lược đồ Zod tham số, quyền cần, hàm }
                               ├─ vòng lặp: mô hình chọn công cụ → kiểm quyền → chạy service → trả kết quả
                               └─ đầu ra có cấu trúc (Zod): câu trả lời + bảng/biểu đồ + liên kết bản ghi gốc
                                      │
                                      ▼
                         ai_conversations · ai_messages · ai_tool_calls · ai_actions
```

### Lớp nhà cung cấp

```ts
interface NhaCungCapAI {
  goi(dauVao: { heThong: string; tinNhan: TinNhan[]; congCu: DinhNghiaCongCu[]; toiDaToken: number }): Promise<PhanHoiAI>;
}
```
Mặc định dùng Claude (Anthropic) qua tool use; cấu hình mô hình ở biến môi trường (`AI_PROVIDER`, `AI_MODEL`, khóa API trong kho bí mật — không trong mã, không trong CSDL). Thêm nhà cung cấp khác = viết thêm một lớp cài đặt giao diện trên.

### Sổ công cụ (tool registry)

Mỗi công cụ là một hàm mỏng bọc service sẵn có:

| Công cụ | Quyền | Service | Phase dữ liệu |
|---|---|---|---|
| `tim_khach_hang` | customer.view | CRM | 2 |
| `lich_su_mua_cua_khach` | order.view | Đơn hàng | 5 |
| `bao_gia_chua_theo_doi` | quotation.view | Báo giá | 4 |
| `tim_san_pham` (theo nhu cầu, ngân sách) | sales.view | Sản phẩm + giá + tồn | 3, 5 |
| `tinh_bien_loi_nhuan` | quotation.view | hàm thuần `tinhBaoGia` | 4 |
| `tao_nhap_bao_gia` | quotation.create | Báo giá — **chỉ tạo Draft** | 4 |
| `doanh_thu_theo_ky`, `pipeline_theo_nguoi`, `cong_no_qua_han`, `ton_kho_lau_ngay`, `top_khach_hang` | report.view / finance.view | Báo cáo | 7 |

Trước khi chạy công cụ: kiểm quyền bằng `batBuocQuyen` với hồ sơ người hỏi; thiếu quyền thì trả cho mô hình thông báo "không có quyền" (mô hình phải nói lại với người dùng), đồng thời ghi vết từ chối như mọi API.

## 3. Các tác nhân

| Tác nhân | Kích hoạt | Làm gì | Giới hạn |
|---|---|---|---|
| AI Sales Assistant | Nhân viên hỏi | Tra cứu khách, lịch sử mua, báo giá, sản phẩm | Chỉ đọc, phạm vi của người hỏi |
| Quotation Agent | Nhân viên mô tả nhu cầu | Phân tích yêu cầu → tìm sản phẩm → giá, tồn → tính biên → đề xuất cấu hình + phương án thay thế → **tạo báo giá Draft** | Không gửi, không duyệt; báo giá dưới ngưỡng biên vẫn phải qua duyệt như báo giá người lập |
| Follow-up Agent | Worker, hằng ngày | Quét báo giá chưa phản hồi, cơ hội không hoạt động, việc quá hạn, khách lâu chưa mua, bảo hành / bản quyền sắp hết (ngưỡng ở Cấu hình) → sinh "Việc hôm nay" cho từng người | Không liên lạc khách hàng. Gửi tin cho khách chỉ khi có quy tắc được duyệt và kênh đã cấu hình |
| CEO Agent | Giám đốc hỏi | Hiểu câu hỏi → chọn công cụ báo cáo → tính → trả lời kèm bảng/biểu đồ → liên kết về bản ghi gốc để kiểm | Phạm vi của người hỏi (Giám đốc: toàn công ty) |

## 4. Hành động cần người duyệt

AI đề xuất hành động ghi (tạo báo giá nháp, tạo việc, đổi giai đoạn cơ hội) bằng một dòng `ai_actions` trạng thái `proposed`. Người dùng thấy đề xuất, bấm **Đồng ý** → service chạy với **quyền của người bấm**, dòng chuyển `executed` và ghi `approved_by`. Không có đường nào để AI tự chuyển `proposed` → `executed`.

## 5. Kiểm thử bắt buộc trước khi mở AI cho nhân viên

- Ranh giới quyền: nhân viên `own` hỏi về khách của người khác → công cụ trả rỗng; câu trả lời không chứa tên khách đó.
- Chống bịa: câu hỏi về dữ liệu không tồn tại → câu trả lời "không tìm thấy", không có con số.
- Nháp: Quotation Agent không bao giờ tạo báo giá khác trạng thái Draft.
- Vai trò AI: thử cấp `quotation.approve` → bị từ chối (đã có bài thử từ Phase 1).
- Nhật ký: mỗi câu hỏi có đủ dòng `ai_tool_calls`.
