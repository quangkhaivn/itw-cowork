import { z } from "zod";
import { chuoiTuyChon, ngayTuyChon, soTien, uuidTuyChon } from "@/modules/crm/chung";

/** Lược đồ hợp đồng bảo trì định kỳ và gia hạn. Luật: BUSINESS_RULES.md mục 14. */

const ngayBatBuoc = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Chọn ngày hợp lệ.");

export const LuocDoTaoHopDongBaoTri = z.object({
  khachHangId: z.uuid("Chọn khách hàng."),
  ten: z.string().trim().min(3, "Tên hợp đồng tối thiểu 3 ký tự.").max(300),
  phamVi: chuoiTuyChon(5000),
  ngayBatDau: ngayBatBuoc,
  ngayKetThuc: ngayBatBuoc,
  chuKyThang: z.coerce.number().int().min(1, "Chu kỳ tối thiểu 1 tháng.").max(60),
  giaTri: soTien.optional().default("0"),
  nguoiPhuTrachId: uuidTuyChon,
  ghiChu: chuoiTuyChon(5000),
});
export type DuLieuTaoHopDongBaoTri = z.infer<typeof LuocDoTaoHopDongBaoTri>;

export const LuocDoSuaHopDongBaoTri = z.object({
  ten: z.string().trim().min(3).max(300).optional(),
  phamVi: chuoiTuyChon(5000),
  ngayKetThuc: ngayTuyChon,
  chuKyThang: z.coerce.number().int().min(1).max(60).optional(),
  giaTri: soTien.optional(),
  nguoiPhuTrachId: uuidTuyChon,
  ghiChu: chuoiTuyChon(5000),
  /** hieu-luc | tam-dung — đổi trạng thái vận hành; hủy đi đường riêng vì phải có lý do. */
  trangThai: z.enum(["hieu-luc", "tam-dung"]).optional(),
});
export type DuLieuSuaHopDongBaoTri = z.infer<typeof LuocDoSuaHopDongBaoTri>;

/** Ghi nhận đã bảo trì xong một kỳ — đẩy mốc kỳ kế tiếp lên. */
export const LuocDoGhiNhanBaoTri = z.object({
  ngayBaoTri: ngayTuyChon,
  ghiChu: chuoiTuyChon(2000),
});
export type DuLieuGhiNhanBaoTri = z.infer<typeof LuocDoGhiNhanBaoTri>;

export const LuocDoHuyHopDongBaoTri = z.object({
  lyDo: z.string().trim().min(2, "Hủy hợp đồng phải ghi lý do.").max(500),
});

export const LuocDoLocBaoTri = z.object({
  q: z.string().trim().max(100).optional().default(""),
  /** "" = đang hiệu lực; "tat-ca"; hoặc một mã trạng thái; "den-ky" = tới kỳ bảo trì. */
  trangThai: z.string().trim().max(20).optional().default(""),
  khachHang: z.union([z.uuid(), z.literal("")]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocBaoTri = z.infer<typeof LuocDoLocBaoTri>;

export const LuocDoLocGiaHan = z.object({
  q: z.string().trim().max(100).optional().default(""),
  /** "" = còn mở (moi); "tat-ca"; hoặc một mã trạng thái. */
  trangThai: z.string().trim().max(20).optional().default(""),
  nguon: z.union([z.enum(["bao-hanh", "bao-tri"]), z.literal("")]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocGiaHan = z.infer<typeof LuocDoLocGiaHan>;

/** Chốt một dòng gia hạn thành cơ hội bán hàng. */
export const LuocDoChotGiaHan = z.object({
  tieuDe: chuoiTuyChon(255),
  giaTri: soTien.optional().default("0"),
  ngayHanhDong: ngayBatBuoc,
  hanhDongKeTiep: z.string().trim().min(3, "Ghi rõ việc sẽ làm tiếp.").max(255),
  nguoiPhuTrachId: uuidTuyChon,
});
export type DuLieuChotGiaHan = z.infer<typeof LuocDoChotGiaHan>;

export const LuocDoBoQuaGiaHan = z.object({
  lyDo: z.string().trim().min(2, "Bỏ qua gia hạn phải ghi lý do.").max(500),
});
