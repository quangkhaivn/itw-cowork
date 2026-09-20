import { z } from "zod";
import { chuoiTuyChon, soTien, uuidTuyChon } from "@/modules/crm/chung";
import { TRANG_THAI_HANG } from "./chuan-hoa";

/** Lược đồ phân hệ Sản phẩm và bảng giá nhà cung cấp. */

const soNguyenTuyChon = (toiDa: number) =>
  z
    .union([z.coerce.number().int().min(0).max(toiDa), z.literal("" as const), z.null()])
    .transform((v) => (v === "" || v === null ? null : v))
    .optional();

const tienTuyChon = z
  .union([soTien, z.literal("" as const), z.null()])
  .transform((v) => (v === "" || v === null ? null : v))
  .optional();

export const LuocDoTaoSanPham = z.object({
  sku: z.string().trim().min(1, "Nhập mã sản phẩm (SKU).").max(64),
  ten: z.string().trim().min(2, "Tên sản phẩm tối thiểu 2 ký tự.").max(500),
  nhomId: uuidTuyChon,
  thuongHieuId: uuidTuyChon,
  model: chuoiTuyChon(255),
  moTa: chuoiTuyChon(10_000),
  /** Thông số kỹ thuật dạng khóa–giá trị, ví dụ { "CPU": "i5-1240P", "RAM": "16GB" }. */
  thongSo: z.record(z.string().max(100), z.string().max(1000)).optional().nullable(),
  donViTinh: chuoiTuyChon(50),
  giaVon: tienTuyChon,
  giaBan: tienTuyChon,
  vat: z.coerce.number().min(0).max(100).optional().default(10),
  baoHanhThang: soNguyenTuyChon(600),
  batBuocSerial: z.boolean().optional(),
  nhaCungCapMacDinhId: uuidTuyChon,
  lyDoDoiGia: chuoiTuyChon(255),
});
export type DuLieuTaoSanPham = z.infer<typeof LuocDoTaoSanPham>;

export const LuocDoSuaSanPham = LuocDoTaoSanPham.partial().extend({
  trangThai: z.enum(["hoat-dong", "ngung-kinh-doanh"]).optional(),
});
export type DuLieuSuaSanPham = z.infer<typeof LuocDoSuaSanPham>;

export const LuocDoLocSanPham = z.object({
  q: z.string().trim().max(100).optional().default(""),
  nhom: z.union([z.uuid(), z.literal("")]).optional().default(""),
  thuongHieu: z.union([z.uuid(), z.literal("")]).optional().default(""),
  nhaCungCap: z.union([z.uuid(), z.literal("")]).optional().default(""),
  trangThai: z.enum(["", "hoat-dong", "ngung-kinh-doanh"]).optional().default("hoat-dong"),
  /** Chỉ sản phẩm chưa có giá bán — để biết còn thiếu gì trước khi báo giá. */
  thieuGia: z.enum(["", "1"]).optional().default(""),
  sapXep: z.enum(["moi-nhat", "ten", "sku", "gia-tang", "gia-giam"]).optional().default("moi-nhat"),
  trang: z.coerce.number().int().min(1).max(10_000).optional().default(1),
  coTrang: z.coerce.number().int().min(10).max(200).optional().default(25),
});
export type BoLocSanPham = z.infer<typeof LuocDoLocSanPham>;

export const LuocDoDatGiaNguon = z.object({
  nhaCungCapId: z.uuid("Chọn nhà cung cấp."),
  giaMua: soTien,
  tinhTrang: z.enum(TRANG_THAI_HANG).optional().default("khong-ro"),
  soNgayGiao: z
    .union([z.coerce.number().int().min(0).max(365), z.literal("" as const), z.null()])
    .transform((v) => (v === "" || v === null ? null : v))
    .optional(),
  thamChieu: chuoiTuyChon(255),
  ghiChu: chuoiTuyChon(2000),
  lyDo: chuoiTuyChon(255),
});
export type DuLieuDatGiaNguon = z.infer<typeof LuocDoDatGiaNguon>;

export const LuocDoNhapCsv = z.object({
  tenTep: z.string().trim().min(1).max(255).default("bang-gia.csv"),
  noiDung: z.string().min(1, "Tệp rỗng.").max(8_000_000, "Tệp quá lớn — tách nhỏ dưới 8 MB."),
  /** "san-pham" = danh mục sản phẩm; "gia-nha-cung-cap" = bảng giá của một nhà cung cấp. */
  loai: z.enum(["san-pham", "gia-nha-cung-cap"]),
  /** Bắt buộc khi nhập bảng giá nhà cung cấp. */
  nhaCungCapId: uuidTuyChon,
  /** false = chỉ xem trước, không ghi. */
  ghiThat: z.boolean().optional().default(false),
});
export type DuLieuNhapCsv = z.infer<typeof LuocDoNhapCsv>;
