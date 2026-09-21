import { z } from "zod";
import { chuoiTuyChon, ngayTuyChon, soTien, uuidTuyChon } from "@/modules/crm/chung";

/** Lược đồ mua hàng. Luật: BUSINESS_RULES.md mục 16 (MH). */

const soLuong = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const s = typeof v === "number" ? String(v) : v.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,3})?$/.test(s) || Number(s) <= 0) {
    ctx.addIssue({ code: "custom", message: "Số lượng phải lớn hơn 0." });
    return z.NEVER;
  }
  return s;
});

const tyLe = z.coerce.number().min(0).max(100);

// --- Đề nghị mua ---

export const LuocDoDongDeNghi = z.object({
  sanPhamId: uuidTuyChon,
  ten: z.string().trim().min(2, "Nhập tên hàng.").max(500),
  soLuong,
  donViTinh: chuoiTuyChon(50),
  giaDuKien: soTien.optional().default("0"),
  nhaCungCapId: uuidTuyChon,
  ghiChu: chuoiTuyChon(2000),
});

export const LuocDoTaoDeNghi = z.object({
  donBanId: uuidTuyChon,
  ngayCan: ngayTuyChon,
  lyDo: chuoiTuyChon(2000),
  ghiChu: chuoiTuyChon(5000),
  dong: z.array(LuocDoDongDeNghi).min(1, "Đề nghị mua phải có ít nhất một dòng.").max(200),
});
export type DuLieuTaoDeNghi = z.infer<typeof LuocDoTaoDeNghi>;

export const LuocDoSuaDeNghi = z.object({
  ngayCan: ngayTuyChon,
  lyDo: chuoiTuyChon(2000),
  ghiChu: chuoiTuyChon(5000),
  /** Gửi `dong` = thay toàn bộ bảng hàng. */
  dong: z.array(LuocDoDongDeNghi).max(200).optional(),
});
export type DuLieuSuaDeNghi = z.infer<typeof LuocDoSuaDeNghi>;

export const LuocDoQuyetDuyetDeNghi = z.object({
  quyetDinh: z.enum(["cho-duyet", "tu-choi"]),
  ghiChu: chuoiTuyChon(2000),
});
export type DuLieuQuyetDuyetDeNghi = z.infer<typeof LuocDoQuyetDuyetDeNghi>;

export const LuocDoHuyDeNghi = z.object({
  lyDo: z.string().trim().min(2, "Hủy đề nghị mua phải ghi lý do.").max(500),
});

export const LuocDoLocDeNghi = z.object({
  q: z.string().trim().max(100).optional().default(""),
  /** "" = đang chạy (chưa đóng); "tat-ca"; hoặc một mã trạng thái. */
  trangThai: z.string().trim().max(20).optional().default(""),
  choDuyet: z.enum(["", "1"]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocDeNghi = z.infer<typeof LuocDoLocDeNghi>;

// --- Đơn mua ---

export const LuocDoDongDonMua = z.object({
  deNghiDongId: uuidTuyChon,
  sanPhamId: uuidTuyChon,
  ten: z.string().trim().min(2, "Nhập tên hàng.").max(500),
  soLuong,
  donViTinh: chuoiTuyChon(50),
  donGia: soTien,
  chietKhau: tyLe.optional().default(0),
  vat: tyLe.optional().default(10),
});

export const LuocDoTaoDonMua = z.object({
  nhaCungCapId: z.uuid("Chọn nhà cung cấp."),
  khoId: z.uuid("Chọn kho nhận hàng."),
  deNghiId: uuidTuyChon,
  ngayHenGiao: ngayTuyChon,
  dieuKhoanThanhToan: chuoiTuyChon(50),
  ghiChu: chuoiTuyChon(5000),
  dong: z.array(LuocDoDongDonMua).min(1, "Đơn mua phải có ít nhất một dòng.").max(200),
});
export type DuLieuTaoDonMua = z.infer<typeof LuocDoTaoDonMua>;

export const LuocDoSuaDonMua = z.object({
  khoId: uuidTuyChon,
  ngayHenGiao: ngayTuyChon,
  dieuKhoanThanhToan: chuoiTuyChon(50),
  ghiChu: chuoiTuyChon(5000),
  dong: z.array(LuocDoDongDonMua).max(200).optional(),
});
export type DuLieuSuaDonMua = z.infer<typeof LuocDoSuaDonMua>;

export const LuocDoHuyDonMua = z.object({
  lyDo: z.string().trim().min(2, "Hủy đơn mua phải ghi lý do.").max(500),
});

export const LuocDoLocDonMua = z.object({
  q: z.string().trim().max(100).optional().default(""),
  /** "" = đang chạy (chưa đóng); "tat-ca"; hoặc một mã trạng thái. */
  trangThai: z.string().trim().max(25).optional().default(""),
  nhaCungCap: z.union([z.uuid(), z.literal("")]).optional().default(""),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(100).optional().default(20),
});
export type BoLocDonMua = z.infer<typeof LuocDoLocDonMua>;

// --- Nhận hàng ---

export const LuocDoNhanHang = z.object({
  ngayNhan: ngayTuyChon,
  soChungTuNcc: chuoiTuyChon(100),
  ghiChu: chuoiTuyChon(2000),
  dong: z
    .array(
      z.object({
        dongDonId: z.uuid(),
        soLuong,
        giaVon: soTien.optional().default(""),
        /** Hàng quản lý theo sê-ri thì phải đủ số sê-ri, mỗi cái một dòng. */
        serial: z.array(z.string().trim().min(1).max(100)).max(500).optional().default([]),
      }),
    )
    .min(1, "Chọn ít nhất một dòng để nhận.")
    .max(200),
});
export type DuLieuNhanHang = z.infer<typeof LuocDoNhanHang>;
