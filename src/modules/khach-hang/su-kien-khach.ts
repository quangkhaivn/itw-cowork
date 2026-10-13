import type { NguCanh } from "@/lib/api";
import { tuChuyenHanhTrinh } from "@/modules/hanh-trinh/service";
import type { MaMoc } from "@/modules/hanh-trinh/moc";
import { tinhLaiDiemKhach } from "@/modules/cham-diem/service";

/**
 * Móc nối "có chuyện xảy ra với khách" — một dòng gọi từ service của khách hàng, tương tác,
 * cơ hội, báo giá, đơn hàng. Chạy trong CÙNG giao dịch với thao tác gốc: thao tác hỏng thì
 * việc tự chuyển bước và tính lại điểm cũng cuộn ngược theo.
 *
 *   1. Tự chuyển bước hành trình nếu sự kiện là một mốc (KHN-04).
 *   2. Tính lại điểm khách (KHN-09).
 */
export async function khiCoSuKienKhach(nc: NguCanh, khachId: string | null | undefined, moc?: MaMoc): Promise<void> {
  if (!khachId) return;
  if (moc) await tuChuyenHanhTrinh(nc, khachId, moc);
  await tinhLaiDiemKhach(nc.tx, khachId);
}
