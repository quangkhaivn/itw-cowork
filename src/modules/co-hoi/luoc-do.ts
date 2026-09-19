import { z } from "zod";
import { GIAI_DOAN_CO_HOI } from "@/modules/crm/hang-so";
import { chuoiTuyChon, ngayTuyChon, soTien, uuidTuyChon } from "@/modules/crm/chung";

/**
 * Lược đồ phân hệ Cơ hội. Luật CH-02 (đang mở phải có Hành động kế tiếp + Ngày) kiểm
 * ở đây để báo lỗi đúng ô, và kiểm lại ở service + CHECK của CSDL.
 */

const hanhDong = z.string().trim().min(3, "Nhập hành động kế tiếp (tối thiểu 3 ký tự).").max(255);
const ngayBatBuoc = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Chọn ngày hành động kế tiếp.");

export const LuocDoTaoCoHoi = z.object({
  khachHangId: z.uuid("Chọn khách hàng."),
  lienHeId: uuidTuyChon,
  tieuDe: z.string().trim().min(3, "Tiêu đề tối thiểu 3 ký tự.").max(255),
  moTa: chuoiTuyChon(5000),
  giaTri: soTien.optional().default("0"),
  xacSuat: z.coerce.number().int().min(0).max(100).optional(),
  ngayDuKienChot: ngayTuyChon,
  nguon: chuoiTuyChon(50),
  nguoiPhuTrachId: uuidTuyChon,
  hanhDongKeTiep: hanhDong,
  ngayHanhDong: ngayBatBuoc,
  doiThu: chuoiTuyChon(255),
});
export type DuLieuTaoCoHoi = z.infer<typeof LuocDoTaoCoHoi>;

export const LuocDoSuaCoHoi = z.object({
  lienHeId: uuidTuyChon,
  tieuDe: z.string().trim().min(3).max(255).optional(),
  moTa: chuoiTuyChon(5000),
  giaTri: soTien.optional(),
  xacSuat: z.coerce.number().int().min(0).max(100).optional(),
  ngayDuKienChot: ngayTuyChon,
  nguon: chuoiTuyChon(50),
  nguoiPhuTrachId: uuidTuyChon,
  hanhDongKeTiep: hanhDong.optional(),
  ngayHanhDong: ngayBatBuoc.optional(),
  doiThu: chuoiTuyChon(255),
});
export type DuLieuSuaCoHoi = z.infer<typeof LuocDoSuaCoHoi>;

export const LuocDoDoiGiaiDoan = z.object({
  giaiDoan: z.enum(GIAI_DOAN_CO_HOI),
  lyDoThua: chuoiTuyChon(50),
  ghiChuThua: chuoiTuyChon(2000),
  xacSuat: z.coerce.number().int().min(0).max(100).optional(),
  /** Bắt buộc khi mở lại cơ hội đã đóng (CH-02 áp lại). */
  hanhDongKeTiep: hanhDong.optional(),
  ngayHanhDong: ngayBatBuoc.optional(),
});
export type DuLieuDoiGiaiDoan = z.infer<typeof LuocDoDoiGiaiDoan>;

export const LuocDoLocCoHoi = z.object({
  q: z.string().trim().max(100).optional().default(""),
  /** "" = tất cả; "dang-mo"; "da-dong"; hoặc một giai đoạn cụ thể. */
  giaiDoan: z.enum(["", "dang-mo", "da-dong", ...GIAI_DOAN_CO_HOI]).optional().default("dang-mo"),
  nguoiPhuTrach: z.union([z.uuid(), z.literal("")]).optional().default(""),
  khachHang: z.union([z.uuid(), z.literal("")]).optional().default(""),
  /** "1" = chỉ cơ hội đang mở mà ngày hành động kế tiếp đã qua. */
  quaHan: z.enum(["", "1"]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocCoHoi = z.infer<typeof LuocDoLocCoHoi>;
