import { z } from "zod";
import { chuoiTuyChon, ngayTuyChon } from "@/modules/crm/chung";
import { soLuongKho } from "@/modules/kho/luoc-do";

/** Lược đồ chuyển kho nội bộ. Luật: BUSINESS_RULES.md mục 19 (CK). */

const serial = z.array(z.string().trim().min(1).max(100)).max(500).optional().default([]);

export const LuocDoTaoChuyenKho = z.object({
  khoNguonId: z.uuid("Chọn kho xuất hàng."),
  khoDichId: z.uuid("Chọn kho nhận hàng."),
  ngayChuyen: ngayTuyChon,
  lyDo: z.string().trim().min(2, "Ghi rõ vì sao chuyển kho.").max(2000),
  ghiChu: chuoiTuyChon(5000),
  dong: z
    .array(
      z.object({
        sanPhamId: z.uuid("Chọn sản phẩm."),
        soLuong: soLuongKho,
        /** Sê-ri của hàng quản lý theo máy; khai đủ bằng số lượng chuyển (CK-05). */
        serial,
        ghiChu: chuoiTuyChon(2000),
      }),
    )
    .min(1, "Thêm ít nhất một dòng hàng.")
    .max(200),
});
export type DuLieuTaoChuyenKho = z.infer<typeof LuocDoTaoChuyenKho>;

export const LuocDoXuatChuyenKho = z.object({
  ghiChu: chuoiTuyChon(2000),
});
export type DuLieuXuatChuyenKho = z.infer<typeof LuocDoXuatChuyenKho>;

/**
 * Nhận hàng ở kho đích. Bỏ trống `dong` nghĩa là **nhận đủ** đúng như đã xuất.
 * Khai `dong` khi có chênh lệch — và chênh lệch thì bắt buộc ghi lý do (CK-04).
 */
export const LuocDoNhanChuyenKho = z.object({
  ghiChu: chuoiTuyChon(2000),
  dong: z
    .array(
      z.object({
        dongId: z.uuid(),
        soLuongNhan: z.union([z.number(), z.string()]).transform((v, ctx) => {
          const s = typeof v === "number" ? String(v) : v.trim().replace(/\./g, "").replace(",", ".");
          if (!/^\d+(\.\d{1,3})?$/.test(s)) {
            ctx.addIssue({ code: "custom", message: "Số nhận phải là số không âm." });
            return z.NEVER;
          }
          return s;
        }),
        ghiChu: chuoiTuyChon(2000),
      }),
    )
    .max(200)
    .optional()
    .default([]),
});
export type DuLieuNhanChuyenKho = z.infer<typeof LuocDoNhanChuyenKho>;

export const LuocDoHuyChuyenKho = z.object({
  lyDo: z.string().trim().min(2, "Hủy phiếu chuyển kho phải ghi lý do.").max(500),
});

export const LuocDoLocChuyenKho = z.object({
  q: z.string().trim().max(100).optional().default(""),
  /** "" = đang mở (nháp + đang trên đường); "tat-ca"; hoặc một mã trạng thái. */
  trangThai: z.string().trim().max(20).optional().default(""),
  kho: z.union([z.uuid(), z.literal("")]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocChuyenKho = z.infer<typeof LuocDoLocChuyenKho>;
