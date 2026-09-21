import { z } from "zod";
import { chuoiTuyChon, ngayTuyChon, soTien, uuidTuyChon } from "@/modules/crm/chung";
import { PHUONG_THUC_THU } from "@/modules/tai-chinh/tinh-toan";

/** Lược đồ công nợ phải trả. Luật: BUSINESS_RULES.md mục 17 (CT). */

const soLuong = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const s = typeof v === "number" ? String(v) : v.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(s) || Number(s) <= 0) {
    ctx.addIssue({ code: "custom", message: "Số lượng phải lớn hơn 0." });
    return z.NEVER;
  }
  return s;
});

const tyLe = z.coerce.number().min(0).max(100);

export const LuocDoTaoHoaDonMua = z.object({
  /** Cách thường dùng: lập từ một đơn mua đã gửi nhà cung cấp. */
  donMuaId: uuidTuyChon,
  /** Lập tay khi không đi từ đơn mua (phí vận chuyển, dịch vụ lẻ…). */
  nhaCungCapId: uuidTuyChon,
  soHoaDonNcc: chuoiTuyChon(100),
  ghiChu: chuoiTuyChon(5000),
  dong: z
    .array(
      z.object({
        sanPhamId: uuidTuyChon,
        ten: z.string().trim().min(2, "Nhập tên hàng.").max(500),
        soLuong,
        donViTinh: chuoiTuyChon(50),
        donGia: soTien,
        chietKhau: tyLe.optional().default(0),
        vat: tyLe.optional().default(10),
      }),
    )
    .max(200)
    .optional()
    .default([]),
});
export type DuLieuTaoHoaDonMua = z.infer<typeof LuocDoTaoHoaDonMua>;

/**
 * Ghi nhận hóa đơn nhà cung cấp: chốt số tiền và bắt đầu tính nợ phải trả.
 * Hạn thanh toán **bắt buộc** — nó in trên hóa đơn nhà cung cấp gửi tới, không phải
 * con số hệ thống tự nghĩ ra (CT-04).
 */
export const LuocDoGhiNhanHoaDonMua = z.object({
  ngayHoaDon: ngayTuyChon,
  hanThanhToan: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Chọn hạn thanh toán ghi trên hóa đơn nhà cung cấp."),
  soHoaDonNcc: chuoiTuyChon(100),
  ghiChu: chuoiTuyChon(2000),
});
export type DuLieuGhiNhanHoaDonMua = z.infer<typeof LuocDoGhiNhanHoaDonMua>;

export const LuocDoHuyHoaDonMua = z.object({
  lyDo: z.string().trim().min(2, "Hủy hóa đơn phải ghi lý do.").max(500),
});

export const LuocDoChiTien = z.object({
  nhaCungCapId: z.uuid("Chọn nhà cung cấp."),
  phuongThuc: z.enum(PHUONG_THUC_THU),
  soTien: soTien,
  ngayChi: ngayTuyChon,
  thamChieu: chuoiTuyChon(255),
  ghiChu: chuoiTuyChon(2000),
  /** Phân bổ cho từng hóa đơn; tổng phải đúng bằng số tiền chi (CT-05). */
  phanBo: z
    .array(z.object({ hoaDonId: z.uuid(), soTien: soTien }))
    .min(1, "Chọn ít nhất một hóa đơn để trừ nợ.")
    .max(100),
});
export type DuLieuChiTien = z.infer<typeof LuocDoChiTien>;

export const LuocDoHuyPhieuChi = z.object({
  lyDo: z.string().trim().min(2, "Hủy phiếu chi phải ghi lý do.").max(500),
});

export const LuocDoLocHoaDonMua = z.object({
  q: z.string().trim().max(100).optional().default(""),
  /** "" = còn nợ; "tat-ca"; "DRAFT" | "RECORDED" | "CANCELLED"; "qua-han". */
  trangThai: z.string().trim().max(20).optional().default(""),
  nhaCungCap: z.union([z.uuid(), z.literal("")]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocHoaDonMua = z.infer<typeof LuocDoLocHoaDonMua>;

export const LuocDoLocPhieuChi = z.object({
  q: z.string().trim().max(100).optional().default(""),
  nhaCungCap: z.union([z.uuid(), z.literal("")]).optional().default(""),
  tuNgay: ngayTuyChon,
  denNgay: ngayTuyChon,
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocPhieuChi = z.infer<typeof LuocDoLocPhieuChi>;
