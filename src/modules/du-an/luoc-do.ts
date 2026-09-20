import { z } from "zod";
import { chuoiTuyChon, ngayTuyChon, uuidTuyChon } from "@/modules/crm/chung";
import { TRANG_THAI_HANG_MUC } from "./tinh-toan";

/** Lược đồ phân hệ Dự án. Luật: BUSINESS_RULES.md mục 10 (DU-01 → DU-07). */

export const LuocDoTaoDuAn = z.object({
  khachHangId: z.uuid("Chọn khách hàng."),
  donHangId: uuidTuyChon,
  ten: z.string().trim().min(3, "Tên dự án tối thiểu 3 ký tự.").max(500),
  moTa: chuoiTuyChon(5000),
  nguoiPhuTrachId: uuidTuyChon,
  ngayBatDau: ngayTuyChon,
  ngayDuKien: ngayTuyChon,
  /** Hạng mục khởi tạo, mỗi dòng một việc lớn. */
  hangMuc: z.array(z.string().trim().min(2).max(500)).max(50).optional().default([]),
});

export const LuocDoSuaDuAn = z.object({
  ten: z.string().trim().min(3).max(500).optional(),
  moTa: chuoiTuyChon(5000),
  nguoiPhuTrachId: uuidTuyChon,
  ngayBatDau: ngayTuyChon,
  ngayDuKien: ngayTuyChon,
});

export const LuocDoDoiTrangThaiDuAn = z.object({
  trangThai: z.enum(["IN_PROGRESS", "ON_HOLD", "ACCEPTED", "CANCELLED"]),
  /** Bắt buộc khi hủy; khi nghiệm thu thì là biên bản / ghi chú nghiệm thu. */
  ghiChu: chuoiTuyChon(5000),
});

export const LuocDoHangMuc = z.object({
  ten: z.string().trim().min(2, "Nhập tên hạng mục.").max(500),
  hanHoanThanh: ngayTuyChon,
  ghiChu: chuoiTuyChon(2000),
});

export const LuocDoSuaHangMuc = z.object({
  ten: z.string().trim().min(2).max(500).optional(),
  trangThai: z.enum(TRANG_THAI_HANG_MUC).optional(),
  hanHoanThanh: ngayTuyChon,
  ghiChu: chuoiTuyChon(2000),
});

export const LuocDoLocDuAn = z.object({
  q: z.string().trim().max(100).optional().default(""),
  /** "" = đang chạy; "tat-ca"; hoặc một trạng thái cụ thể. */
  trangThai: z.string().trim().max(20).optional().default(""),
  nguoiPhuTrach: z.union([z.uuid(), z.literal("")]).optional().default(""),
  khachHang: z.union([z.uuid(), z.literal("")]).optional().default(""),
  /** "1" = chỉ dự án quá hạn dự kiến mà chưa nghiệm thu. */
  quaHan: z.enum(["", "1"]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});

export type DuLieuTaoDuAn = z.infer<typeof LuocDoTaoDuAn>;
export type DuLieuSuaDuAn = z.infer<typeof LuocDoSuaDuAn>;
export type DuLieuDoiTrangThaiDuAn = z.infer<typeof LuocDoDoiTrangThaiDuAn>;
export type BoLocDuAn = z.infer<typeof LuocDoLocDuAn>;
