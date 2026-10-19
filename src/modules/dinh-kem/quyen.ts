import type { NguCanh } from "@/lib/api";
import { coMotTrongCacQuyen } from "@/lib/phan-quyen";
import { dieuKienXemHoaDonMua } from "@/modules/cong-no-tra/service";
import { dieuKienXemDon } from "@/modules/don-hang/service";
import { dieuKienXemPhieu } from "@/modules/ho-tro/service";
import { dieuKienXemViec } from "@/modules/cong-viec/service";
import { dieuKienXemTraHangBan, dieuKienXemTraHangMua } from "@/modules/tra-hang/service";
import type { LoaiDoiTuong } from "./tinh-toan";

/**
 * Tệp đính kèm **không có quyền riêng**. Nó mượn nguyên quyền của chứng từ chủ:
 * ai xem được hóa đơn nhà cung cấp thì xem được tệp của nó, ai sửa được phiếu trả
 * hàng thì đính kèm được vào đó (DK-02).
 *
 * Quan trọng: kiểm **cả phạm vi dữ liệu**, không chỉ mã quyền. Nhân viên kinh doanh
 * có `order.view` phạm vi "của mình" thì không được đọc tệp của đơn người khác — nếu
 * chỉ kiểm mã quyền thì tệp đính kèm thành cửa sau đi vòng qua phạm vi.
 *
 * Thêm loại chứng từ mới thì thêm cả ở đây **và** ở CHECK `attachments_loai_doi_tuong_check`.
 * Thiếu một trong hai là có tệp mà không ai biết ai được đọc.
 */

async function coTrongPhamVi(nc: NguCanh, loai: LoaiDoiTuong, id: string): Promise<boolean> {
  switch (loai) {
    default:
      return false;
    case "supplier_bill": {
      const n = await nc.tx.supplierBill.count({ where: { AND: [{ id }, await dieuKienXemHoaDonMua(nc)] } });
      return n > 0;
    }
    case "sales_return": {
      const n = await nc.tx.salesReturn.count({ where: { AND: [{ id }, await dieuKienXemTraHangBan(nc)] } });
      return n > 0;
    }
    case "purchase_return": {
      const n = await nc.tx.purchaseReturn.count({ where: { AND: [{ id }, await dieuKienXemTraHangMua(nc)] } });
      return n > 0;
    }
    case "sales_order": {
      const n = await nc.tx.salesOrder.count({ where: { AND: [{ id }, await dieuKienXemDon(nc)] } });
      return n > 0;
    }
    case "support_ticket": {
      const n = await nc.tx.supportTicket.count({ where: { AND: [{ id }, await dieuKienXemPhieu(nc)] } });
      return n > 0;
    }
    case "task": {
      // 0.17.0 (CV-10): biên bản, ảnh hiện trường, tệp khách gửi — theo đúng phạm vi task.view.
      const n = await nc.tx.task.count({ where: { AND: [{ id }, await dieuKienXemViec(nc)] } });
      return n > 0;
    }
    case "stock_transfer": {
      // Kho là tài sản dùng chung, không chia phạm vi theo người (QĐ-18).
      const n = await nc.tx.stockTransfer.count({ where: { id } });
      return n > 0;
    }
  }
}

/** Mã quyền cần có để **xem** chứng từ của từng loại. Một trong các mã là đủ. */
const QUYEN_XEM: Record<LoaiDoiTuong, string[]> = {
  supplier_bill: ["finance.view"],
  sales_return: ["order.view", "service_desk.view", "finance.view"],
  purchase_return: ["purchasing.view", "finance.view"],
  stock_transfer: ["inventory.view"],
  sales_order: ["order.view"],
  support_ticket: ["service_desk.view"],
  task: ["task.view"],
};

/** Mã quyền cần có để **đính kèm hoặc gỡ** tệp của từng loại. */
const QUYEN_SUA: Record<LoaiDoiTuong, string[]> = {
  supplier_bill: ["finance.update"],
  sales_return: ["order.update", "service_desk.update"],
  purchase_return: ["purchasing.update"],
  stock_transfer: ["inventory.update"],
  sales_order: ["order.update"],
  support_ticket: ["service_desk.update"],
  task: ["task.update"],
};

export async function duocXemChungTu(nc: NguCanh, loai: LoaiDoiTuong, id: string): Promise<boolean> {
  // Loại lạ (gọi sai, hoặc dữ liệu cũ) thì trả false chứ không nổ — mặc định là KHÔNG cho.
  if (!QUYEN_XEM[loai] || !coMotTrongCacQuyen(nc.hoSo, QUYEN_XEM[loai])) return false;
  return coTrongPhamVi(nc, loai, id);
}

export async function duocSuaChungTu(nc: NguCanh, loai: LoaiDoiTuong, id: string): Promise<boolean> {
  if (!QUYEN_SUA[loai] || !coMotTrongCacQuyen(nc.hoSo, QUYEN_SUA[loai])) return false;
  // Sửa được thì đương nhiên phải xem được. Kiểm phạm vi một lần ở đây là đủ.
  return coTrongPhamVi(nc, loai, id);
}

/** Cho màn hình biết cần quyền nào — chỉ để hiện thông báo, không phải chốt chặn. */
export function moTaQuyenCan(loai: LoaiDoiTuong): { xem: string[]; sua: string[] } {
  return { xem: QUYEN_XEM[loai], sua: QUYEN_SUA[loai] };
}
