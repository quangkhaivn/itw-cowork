import { z } from "zod";
import { chuoiTuyChon, ngayTuyChon, soTien, uuidTuyChon } from "@/modules/crm/chung";

/** Lược đồ phân hệ Báo giá. Luật: BUSINESS_RULES.md mục 5 (BG-01 → BG-10). */

const soLuong = z
  .union([z.number(), z.string()])
  .transform((v, ctx) => {
    const s = typeof v === "number" ? String(v) : v.trim().replace(/\./g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,3})?$/.test(s) || Number(s) <= 0) {
      ctx.addIssue({ code: "custom", message: "Số lượng phải lớn hơn 0 (tối đa 3 số lẻ)." });
      return z.NEVER;
    }
    return s;
  });

const tyLe = z.coerce.number().min(0, "Không âm").max(100, "Tối đa 100");

export const LuocDoDongBaoGia = z.object({
  sanPhamId: uuidTuyChon,
  ten: z.string().trim().min(2, "Nhập tên hàng.").max(500),
  moTa: chuoiTuyChon(2000),
  soLuong: soLuong,
  donViTinh: chuoiTuyChon(50),
  donGia: soTien,
  chietKhau: tyLe.optional().default(0),
  vat: tyLe.optional().default(10),
  giaVon: soTien.optional().default("0"),
  nhaCungCapId: uuidTuyChon,
});
export type DuLieuDongBaoGia = z.infer<typeof LuocDoDongBaoGia>;

const truongChung = {
  lienHeId: uuidTuyChon,
  coHoiId: uuidTuyChon,
  nguoiPhuTrachId: uuidTuyChon,
  dieuKhoanThanhToan: chuoiTuyChon(50),
  dieuKhoanGiaoHang: chuoiTuyChon(50),
  dieuKhoanBaoHanh: chuoiTuyChon(3000),
  hieuLucDen: ngayTuyChon,
  ghiChu: chuoiTuyChon(5000),
};

export const LuocDoTaoBaoGia = z.object({
  khachHangId: z.uuid("Chọn khách hàng."),
  ...truongChung,
  dong: z.array(LuocDoDongBaoGia).max(200, "Tối đa 200 dòng hàng.").optional().default([]),
});
export type DuLieuTaoBaoGia = z.infer<typeof LuocDoTaoBaoGia>;

/** Sửa phiên bản đang soạn. Gửi `dong` = thay toàn bộ bảng hàng. */
export const LuocDoSuaPhienBan = z.object({
  ...truongChung,
  dong: z.array(LuocDoDongBaoGia).max(200).optional(),
});
export type DuLieuSuaPhienBan = z.infer<typeof LuocDoSuaPhienBan>;

export const LuocDoXinDuyet = z.object({ ghiChu: chuoiTuyChon(2000) });

export const LuocDoQuyetDuyet = z.object({
  quyetDinh: z.enum(["cho-duyet", "tu-choi"]),
  ghiChu: chuoiTuyChon(2000),
});

export const LuocDoGuiKhach = z.object({
  /** Ghi lại đã gửi bằng cách nào: email tay, Zalo, in giấy… (hệ thống chưa tự gửi email). */
  kenh: z.enum(["email", "zalo", "in-giay", "khac"]).optional().default("email"),
  ghiChu: chuoiTuyChon(2000),
});

export const LuocDoChotBaoGia = z.object({
  ketQua: z.enum(["ACCEPTED", "REJECTED", "NEGOTIATING"]),
  ghiChu: chuoiTuyChon(2000),
});

export const LuocDoLocBaoGia = z.object({
  q: z.string().trim().max(100).optional().default(""),
  /** "" = đang chạy (chưa chốt); "tat-ca"; hoặc một trạng thái cụ thể. */
  trangThai: z.string().trim().max(20).optional().default(""),
  nguoiPhuTrach: z.union([z.uuid(), z.literal("")]).optional().default(""),
  khachHang: z.union([z.uuid(), z.literal("")]).optional().default(""),
  /** "1" = chỉ báo giá đang chờ duyệt (hàng đợi của trưởng phòng / giám đốc). */
  choDuyet: z.enum(["", "1"]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocBaoGia = z.infer<typeof LuocDoLocBaoGia>;
