import { z } from "zod";
import type { NguCanh } from "@/lib/api";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { kiemTraNguoiPhuTrach, locTheoPhamVi } from "@/modules/crm/chung";
import { doiHanhTrinh } from "@/modules/hanh-trinh/service";
import { boKhachKhoiNhom, ganKhachVaoNhom } from "@/modules/nhom-khach/service";
import { suaKhachHang } from "./service";

/**
 * Thao tác hàng loạt trên danh sách khách (BUSINESS_RULES.md mục 21, KHN-10).
 *
 * Cả lô đi trong MỘT giao dịch của `xuLyApi`: một khách hỏng thì cả lô cuộn ngược.
 * Có khách nằm ngoài phạm vi sửa → từ chối cả lô (không âm thầm bỏ qua). Mỗi khách vẫn đi
 * qua đúng service thường, nên nhật ký và luật (KH-05 khi đổi người phụ trách) không bị lách.
 */

export const TOI_DA_HANG_LOAT = 500;

export const LuocDoHangLoat = z.object({
  ids: z.array(z.uuid()).min(1, "Chưa chọn khách nào.").max(TOI_DA_HANG_LOAT, `Tối đa ${TOI_DA_HANG_LOAT} khách mỗi lần.`),
  thaoTac: z.enum(["gan-nhom", "bo-nhom", "doi-hanh-trinh", "doi-phu-trach"]),
  giaTri: z.uuid("Chọn giá trị cho thao tác."),
});

export async function thaoTacHangLoat(nc: NguCanh, d: z.infer<typeof LuocDoHangLoat>) {
  batBuocQuyen(nc.hoSo, "customer.update", { objectType: "customer" });
  const ids = [...new Set(d.ids)];
  const trongPhamVi = await nc.tx.customer.findMany({
    where: { id: { in: ids }, ...(await locTheoPhamVi(nc, "customer.update")) },
    select: { id: true, code: true, status: true, ownerId: true },
  });
  if (trongPhamVi.length !== ids.length) {
    throw new LoiNghiepVu(
      `${ids.length - trongPhamVi.length} khách không tồn tại hoặc nằm ngoài phạm vi bạn được sửa — không thao tác lô này.`,
      403,
      "ngoai-pham-vi",
    );
  }
  const daGop = trongPhamVi.filter((k) => k.status === "da-gop");
  if (daGop.length) throw new LoiNghiepVu(`Có khách đã gộp trong lô (${daGop.map((k) => k.code).join(", ")}) — bỏ chọn rồi làm lại.`, 409, "da-gop");

  let soDoi = 0;
  switch (d.thaoTac) {
    case "gan-nhom":
      soDoi = await ganKhachVaoNhom(nc, d.giaTri, ids);
      break;
    case "bo-nhom":
      soDoi = await boKhachKhoiNhom(nc, d.giaTri, ids);
      break;
    case "doi-hanh-trinh":
      for (const id of ids) {
        const kq = await doiHanhTrinh(nc, id, { trangThaiId: d.giaTri, ghiChu: null }, { ghiChuMacDinh: "Đổi hàng loạt" });
        if (kq.daDoi) soDoi++;
      }
      break;
    case "doi-phu-trach":
      // KH-05: người nhận phải nằm trong phạm vi `customer.update` của người giao.
      await kiemTraNguoiPhuTrach(nc, "customer.update", d.giaTri);
      for (const k of trongPhamVi) {
        if (k.ownerId === d.giaTri) continue;
        await suaKhachHang(nc, k.id, { nguoiPhuTrachId: d.giaTri, xacNhanKhongTrung: false });
        soDoi++;
      }
      break;
  }
  await nc.suKien({ eventType: SU_KIEN.CUSTOMER_BULK_UPDATED, objectType: "customer", payload: { thaoTac: d.thaoTac, giaTri: d.giaTri, soKhach: ids.length, soDoi } });
  return { soKhach: ids.length, soDoi };
}
