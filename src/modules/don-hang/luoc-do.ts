import { z } from "zod";
import { chuoiTuyChon, ngayTuyChon, soTien, uuidTuyChon } from "@/modules/crm/chung";
import { soLuongKho } from "@/modules/kho/luoc-do";

/** Lược đồ phân hệ Đơn hàng. Luật: BUSINESS_RULES.md mục 6 (DH-01 → DH-09). */

const tyLe = z.coerce.number().min(0, "Không âm").max(100, "Tối đa 100");

export const LuocDoDongDon = z.object({
  sanPhamId: uuidTuyChon,
  ten: z.string().trim().min(2, "Nhập tên hàng.").max(500),
  moTa: chuoiTuyChon(2000),
  soLuong: soLuongKho,
  donViTinh: chuoiTuyChon(50),
  donGia: soTien,
  chietKhau: tyLe.optional().default(0),
  vat: tyLe.optional().default(10),
  giaVon: soTien.optional().default("0"),
});

const truongChung = {
  lienHeId: uuidTuyChon,
  nguoiPhuTrachId: uuidTuyChon,
  ngayDat: ngayTuyChon,
  ngayGiaoDuKien: ngayTuyChon,
  diaChiGiao: chuoiTuyChon(1000),
  dieuKhoanThanhToan: chuoiTuyChon(50),
  dieuKhoanGiaoHang: chuoiTuyChon(50),
  ghiChu: chuoiTuyChon(5000),
};

export const LuocDoTaoDon = z.object({
  khachHangId: z.uuid("Chọn khách hàng."),
  ...truongChung,
  dong: z.array(LuocDoDongDon).max(200, "Tối đa 200 dòng hàng.").optional().default([]),
});

/** Sửa đơn còn nháp. Gửi `dong` = thay toàn bộ bảng hàng. */
export const LuocDoSuaDon = z.object({
  ...truongChung,
  dong: z.array(LuocDoDongDon).max(200).optional(),
});

export const LuocDoXacNhanDon = z.object({
  khoId: z.uuid("Chọn kho giữ hàng."),
  ghiChu: chuoiTuyChon(2000),
});

export const LuocDoHuyDon = z.object({
  lyDo: z.string().trim().min(2, "Hủy đơn phải ghi rõ lý do.").max(500),
});

export const LuocDoDongXuat = z.object({
  dongDonId: z.uuid(),
  soLuong: soLuongKho,
  /** Sê-ri của hàng quản lý theo máy, đúng bằng số lượng xuất (KHO-05). */
  serial: z.array(z.string().trim().min(1).max(100)).max(1000).optional().default([]),
});

export const LuocDoTaoPhieuXuat = z.object({
  khoId: z.uuid("Chọn kho xuất hàng."),
  nguoiNhan: chuoiTuyChon(255),
  ghiChu: chuoiTuyChon(2000),
  dong: z
    .array(LuocDoDongXuat)
    .min(1, "Chọn ít nhất một dòng hàng để xuất.")
    // TV-BH-03: hai dòng cùng một dòng đơn trong một phiếu = cộng số đã giao hai lần.
    .refine((ds) => new Set(ds.map((x) => x.dongDonId)).size === ds.length, "Mỗi dòng hàng chỉ xuất hiện một lần trong phiếu xuất."),
});

export const LuocDoLocDon = z.object({
  q: z.string().trim().max(100).optional().default(""),
  /** "" = đang chạy (chưa đóng); "tat-ca"; hoặc một trạng thái cụ thể. */
  trangThai: z.string().trim().max(24).optional().default(""),
  nguoiPhuTrach: z.union([z.uuid(), z.literal("")]).optional().default(""),
  khachHang: z.union([z.uuid(), z.literal("")]).optional().default(""),
  /** "1" = chỉ đơn còn hàng chưa giao. */
  conPhaiGiao: z.enum(["", "1"]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});

export type DuLieuTaoDon = z.infer<typeof LuocDoTaoDon>;
export type DuLieuSuaDon = z.infer<typeof LuocDoSuaDon>;
export type DuLieuTaoPhieuXuat = z.infer<typeof LuocDoTaoPhieuXuat>;
export type BoLocDon = z.infer<typeof LuocDoLocDon>;
