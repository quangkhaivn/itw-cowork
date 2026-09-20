import { z } from "zod";
import { chuoiTuyChon, uuidTuyChon } from "@/modules/crm/chung";
import { LOAI_PHIEU, UU_TIEN_PHIEU } from "./tinh-toan";

/** Lược đồ bàn dịch vụ. Luật: BUSINESS_RULES.md mục 9 (HT-01 → HT-08). */

export const LuocDoTaoPhieu = z.object({
  khachHangId: z.uuid("Chọn khách hàng."),
  lienHeId: uuidTuyChon,
  baoHanhId: uuidTuyChon,
  serialId: uuidTuyChon,
  donHangId: uuidTuyChon,
  duAnId: uuidTuyChon,
  loai: z.enum(LOAI_PHIEU),
  uuTien: z.enum(UU_TIEN_PHIEU).optional().default("trung-binh"),
  tieuDe: z.string().trim().min(3, "Tiêu đề tối thiểu 3 ký tự.").max(500),
  moTa: chuoiTuyChon(5000),
  nguoiXuLyId: uuidTuyChon,
});

export const LuocDoSuaPhieu = z.object({
  uuTien: z.enum(UU_TIEN_PHIEU).optional(),
  tieuDe: z.string().trim().min(3).max(500).optional(),
  moTa: chuoiTuyChon(5000),
  lienHeId: uuidTuyChon,
  duAnId: uuidTuyChon,
});

export const LuocDoGiaoPhieu = z.object({
  nguoiXuLyId: z.uuid("Chọn kỹ thuật viên."),
  ghiChu: chuoiTuyChon(2000),
});

export const LuocDoGhiDienBien = z.object({
  loai: z.enum(["ghi-chu", "phan-hoi-khach"]).optional().default("ghi-chu"),
  noiDung: z.string().trim().min(2, "Ghi nội dung đã làm gì.").max(5000),
});

export const LuocDoDoiTrangThai = z.object({
  trangThai: z.enum(["DANG_XU_LY", "CHO_KHACH", "HOAN_THANH", "DONG", "HUY"]),
  /** Bắt buộc khi hoàn thành: đã xử lý thế nào (HT-05). */
  cachXuLy: chuoiTuyChon(5000),
  ghiChu: chuoiTuyChon(2000),
});

export const LuocDoLocPhieu = z.object({
  q: z.string().trim().max(100).optional().default(""),
  /** "" = đang mở; "tat-ca"; hoặc một trạng thái cụ thể. */
  trangThai: z.string().trim().max(20).optional().default(""),
  loai: z.string().trim().max(20).optional().default(""),
  uuTien: z.string().trim().max(20).optional().default(""),
  nguoiXuLy: z.union([z.uuid(), z.literal("")]).optional().default(""),
  khachHang: z.union([z.uuid(), z.literal("")]).optional().default(""),
  /** "1" = chỉ phiếu đang trễ hạn phản hồi hoặc trễ hạn xử lý. */
  treHan: z.enum(["", "1"]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});

export type DuLieuTaoPhieu = z.infer<typeof LuocDoTaoPhieu>;
export type DuLieuSuaPhieu = z.infer<typeof LuocDoSuaPhieu>;
export type DuLieuDoiTrangThai = z.infer<typeof LuocDoDoiTrangThai>;
export type BoLocPhieu = z.infer<typeof LuocDoLocPhieu>;
