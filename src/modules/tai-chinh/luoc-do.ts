import { z } from "zod";
import { chuoiTuyChon, ngayTuyChon, soTien, uuidTuyChon } from "@/modules/crm/chung";
import { PHUONG_THUC_THU } from "./tinh-toan";

/** Lược đồ phân hệ Tài chính. Luật: BUSINESS_RULES.md mục 11 (TC-01 → TC-09). */

export const LuocDoTaoHoaDon = z.object({
  /** Cách thường dùng: lập từ một đơn hàng đã xác nhận. */
  donHangId: uuidTuyChon,
  /** Lập tay khi không đi từ đơn (dịch vụ lẻ, phí triển khai…). */
  khachHangId: uuidTuyChon,
  duAnId: uuidTuyChon,
  ghiChu: chuoiTuyChon(5000),
  dong: z
    .array(
      z.object({
        sanPhamId: uuidTuyChon,
        ten: z.string().trim().min(2, "Nhập tên hàng.").max(500),
        soLuong: z.union([z.number(), z.string()]).transform((v, ctx) => {
          const s = typeof v === "number" ? String(v) : v.trim().replace(/\./g, "").replace(",", ".");
          if (!/^\d+(\.\d{1,3})?$/.test(s) || Number(s) <= 0) {
            ctx.addIssue({ code: "custom", message: "Số lượng phải lớn hơn 0." });
            return z.NEVER;
          }
          return s;
        }),
        donViTinh: chuoiTuyChon(50),
        donGia: soTien,
        chietKhau: z.coerce.number().min(0).max(100).optional().default(0),
        vat: z.coerce.number().min(0).max(100).optional().default(10),
        giaVon: soTien.optional().default("0"),
      }),
    )
    .max(200)
    .optional()
    .default([]),
});

export const LuocDoPhatHanh = z.object({
  ngayPhatHanh: ngayTuyChon,
  hanThanhToan: ngayTuyChon,
  ghiChu: chuoiTuyChon(2000),
});

export const LuocDoHuyHoaDon = z.object({
  lyDo: z.string().trim().min(2, "Hủy hóa đơn phải ghi lý do.").max(500),
});

export const LuocDoThuTien = z.object({
  khachHangId: z.uuid("Chọn khách hàng."),
  phuongThuc: z.enum(PHUONG_THUC_THU),
  soTien: soTien,
  ngayThu: ngayTuyChon,
  thamChieu: chuoiTuyChon(255),
  ghiChu: chuoiTuyChon(2000),
  /** Phân bổ cho từng hóa đơn; tổng phải đúng bằng số tiền thu (TC-05). */
  phanBo: z
    .array(z.object({ hoaDonId: z.uuid(), soTien: soTien }))
    .min(1, "Chọn ít nhất một hóa đơn để trừ nợ.")
    .max(100),
});

export const LuocDoHuyPhieuThu = z.object({
  lyDo: z.string().trim().min(2, "Hủy phiếu thu phải ghi lý do.").max(500),
});

export const LuocDoLocHoaDon = z.object({
  q: z.string().trim().max(100).optional().default(""),
  /** "" = còn nợ; "tat-ca"; "DRAFT" | "ISSUED" | "CANCELLED"; "qua-han". */
  trangThai: z.string().trim().max(20).optional().default(""),
  khachHang: z.union([z.uuid(), z.literal("")]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});

export const LuocDoLocPhieuThu = z.object({
  q: z.string().trim().max(100).optional().default(""),
  khachHang: z.union([z.uuid(), z.literal("")]).optional().default(""),
  tuNgay: ngayTuyChon,
  denNgay: ngayTuyChon,
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});

export type DuLieuTaoHoaDon = z.infer<typeof LuocDoTaoHoaDon>;
export type DuLieuPhatHanh = z.infer<typeof LuocDoPhatHanh>;
export type DuLieuThuTien = z.infer<typeof LuocDoThuTien>;
export type BoLocHoaDon = z.infer<typeof LuocDoLocHoaDon>;
export type BoLocPhieuThu = z.infer<typeof LuocDoLocPhieuThu>;
