import { z } from "zod";
import { chuoiTuyChon, ngayTuyChon, soTien, uuidTuyChon } from "@/modules/crm/chung";
import { LOAI_TRA_HANG, TINH_TRANG_HANG } from "./tinh-toan";

/** Lược đồ trả hàng và đổi máy. Luật: BUSINESS_RULES.md mục 18 (TH). */

const soLuong = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const s = typeof v === "number" ? String(v) : v.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(s) || Number(s) <= 0) {
    ctx.addIssue({ code: "custom", message: "Số lượng phải lớn hơn 0." });
    return z.NEVER;
  }
  return s;
});

const tyLe = z.coerce.number().min(0).max(100);

const serial = z
  .array(z.string().trim().min(1).max(100))
  .max(200)
  .optional()
  .default([]);

// ---------------------------------------------------------------------------
// Khách trả hàng / đổi máy
// ---------------------------------------------------------------------------

export const LuocDoTaoTraHangBan = z.object({
  khachHangId: z.uuid("Chọn khách hàng."),
  /** Trả theo đơn nào — để đối chiếu đã giao bao nhiêu (TH-03). Bỏ trống thì trả lẻ. */
  donHangId: uuidTuyChon,
  khoId: z.uuid("Chọn kho nhận hàng trả về."),
  loai: z.enum(LOAI_TRA_HANG).optional().default("tra-hang"),
  ngayTra: ngayTuyChon,
  lyDo: z.string().trim().min(2, "Ghi rõ vì sao khách trả hàng.").max(2000),
  ghiChu: chuoiTuyChon(5000),
  dong: z
    .array(
      z.object({
        dongDonId: uuidTuyChon,
        sanPhamId: uuidTuyChon,
        ten: z.string().trim().min(2, "Nhập tên hàng.").max(500),
        soLuong,
        donViTinh: chuoiTuyChon(50),
        donGia: soTien,
        vat: tyLe.optional().default(10),
        tinhTrang: z.enum(TINH_TRANG_HANG).optional().default("con-tot"),
        /** Có cộng lại vào tồn kho hay không. Bỏ trống: hàng còn tốt thì nhập lại, hàng lỗi thì không (TH-06). */
        nhapLaiKho: z.boolean().optional(),
        /** Sê-ri của máy khách mang về — phải là sê-ri đã bán cho chính khách này. */
        serial,
        /** Đổi máy: mặt hàng giao thay thế và sê-ri của máy mới. */
        thayTheSanPhamId: uuidTuyChon,
        thayTheSerial: serial,
        ghiChu: chuoiTuyChon(2000),
      }),
    )
    .min(1, "Thêm ít nhất một dòng hàng.")
    .max(200),
});
export type DuLieuTaoTraHangBan = z.infer<typeof LuocDoTaoTraHangBan>;

export const LuocDoXacNhanTraHang = z.object({
  ghiChu: chuoiTuyChon(2000),
});
export type DuLieuXacNhanTraHang = z.infer<typeof LuocDoXacNhanTraHang>;

export const LuocDoHuyTraHang = z.object({
  lyDo: z.string().trim().min(2, "Hủy phiếu trả hàng phải ghi lý do.").max(500),
});

/** Chốt tiền: giảm trừ giá trị phiếu vào các hóa đơn còn nợ (TH-07). */
export const LuocDoChotGiamTru = z.object({
  ghiChu: chuoiTuyChon(2000),
  phanBo: z
    .array(z.object({ hoaDonId: z.uuid(), soTien }))
    .min(1, "Chọn ít nhất một hóa đơn để giảm trừ.")
    .max(100),
});
export type DuLieuChotGiamTru = z.infer<typeof LuocDoChotGiamTru>;

// ---------------------------------------------------------------------------
// Trả hàng cho nhà cung cấp
// ---------------------------------------------------------------------------

export const LuocDoTaoTraHangMua = z.object({
  nhaCungCapId: z.uuid("Chọn nhà cung cấp."),
  /** Trả theo đơn mua nào — để đối chiếu đã nhận bao nhiêu (TH-03). */
  donMuaId: uuidTuyChon,
  khoId: z.uuid("Chọn kho xuất hàng trả đi."),
  ngayTra: ngayTuyChon,
  lyDo: z.string().trim().min(2, "Ghi rõ vì sao trả hàng cho nhà cung cấp.").max(2000),
  ghiChu: chuoiTuyChon(5000),
  dong: z
    .array(
      z.object({
        dongDonId: uuidTuyChon,
        sanPhamId: uuidTuyChon,
        ten: z.string().trim().min(2, "Nhập tên hàng.").max(500),
        soLuong,
        donViTinh: chuoiTuyChon(50),
        donGia: soTien,
        vat: tyLe.optional().default(10),
        serial,
        ghiChu: chuoiTuyChon(2000),
      }),
    )
    .min(1, "Thêm ít nhất một dòng hàng.")
    .max(200),
});
export type DuLieuTaoTraHangMua = z.infer<typeof LuocDoTaoTraHangMua>;

// ---------------------------------------------------------------------------
// Bộ lọc
// ---------------------------------------------------------------------------

export const LuocDoLocTraHangBan = z.object({
  q: z.string().trim().max(100).optional().default(""),
  /** "" = đang mở (nháp + đã nhận hàng); "tat-ca"; hoặc một mã trạng thái. */
  trangThai: z.string().trim().max(20).optional().default(""),
  loai: z.string().trim().max(20).optional().default(""),
  khachHang: z.union([z.uuid(), z.literal("")]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocTraHangBan = z.infer<typeof LuocDoLocTraHangBan>;

export const LuocDoLocTraHangMua = z.object({
  q: z.string().trim().max(100).optional().default(""),
  trangThai: z.string().trim().max(20).optional().default(""),
  nhaCungCap: z.union([z.uuid(), z.literal("")]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocTraHangMua = z.infer<typeof LuocDoLocTraHangMua>;
