import { LoiDinhDang } from "@/lib/loi";
import { boDau } from "@/modules/crm/chuan-hoa";

/**
 * Chuẩn hóa và luật chọn nguồn hàng — hàm thuần, có kiểm thử đơn vị.
 * Luật: BUSINESS_RULES.md mục 5.
 */

/**
 * SKU → khóa so trùng: viết hoa, bỏ khoảng trắng thừa. "dell  3420" và "DELL 3420" là một.
 * Cho phép chữ, số, `- _ . / +` và khoảng trắng; tối đa 64 ký tự.
 */
export function chuanHoaSku(s: string): string {
  const t = s.trim().replace(/\s+/g, " ").toUpperCase();
  if (!t) throw new LoiDinhDang("sku", "Nhập mã sản phẩm (SKU).");
  if (t.length > 64) throw new LoiDinhDang("sku", "SKU tối đa 64 ký tự.");
  if (!/^[A-Z0-9][A-Z0-9 _.\-/+]*$/.test(t)) {
    throw new LoiDinhDang("sku", "SKU chỉ gồm chữ, số và các ký tự - _ . / + (bắt đầu bằng chữ hoặc số).");
  }
  return t;
}

/** Tên sản phẩm → khóa tìm kiếm: bỏ dấu, chữ thường, gộp khoảng trắng. */
export function chuanHoaTenSanPham(s: string): string {
  return boDau(s).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Mã nhóm / thương hiệu: chữ thường không dấu, số, gạch ngang. */
export function chuanHoaMaDanhMuc(s: string, truong = "ma"): string {
  const t = boDau(s.trim()).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!t) throw new LoiDinhDang(truong, "Nhập mã (chữ thường không dấu, số, gạch ngang).");
  if (t.length > 50) throw new LoiDinhDang(truong, "Mã tối đa 50 ký tự.");
  return t;
}

// ---------------------------------------------------------------------------
// Chọn nguồn hàng
// ---------------------------------------------------------------------------

export const TRANG_THAI_HANG = ["con-hang", "het-hang", "dat-truoc", "khong-ro"] as const;
export type TrangThaiHang = (typeof TRANG_THAI_HANG)[number];
export const NHAN_TRANG_THAI_HANG: Record<string, string> = {
  "con-hang": "Còn hàng",
  "het-hang": "Hết hàng",
  "dat-truoc": "Đặt trước",
  "khong-ro": "Chưa rõ",
};

export interface DongGiaNguon {
  supplierId: string;
  purchasePrice: { toString(): string } | number | string;
  availability: string;
  leadTimeDays?: number | null;
  status?: string;
}

/**
 * Nguồn nên mua (SP-07): trong các nhà cung cấp còn bán, ưu tiên **còn hàng**, rồi **giá thấp**,
 * rồi **giao nhanh**. Hết hàng chỉ được chọn khi không còn nguồn nào khác.
 * Trả `null` khi chưa có bảng giá nào.
 */
export function chonNguonTot<T extends DongGiaNguon>(ds: T[]): T | null {
  const dung = ds.filter((d) => (d.status ?? "hoat-dong") === "hoat-dong");
  if (dung.length === 0) return null;
  const hang = (a: string) => (a === "con-hang" ? 0 : a === "dat-truoc" ? 1 : a === "khong-ro" ? 2 : 3);
  return [...dung].sort((a, b) => {
    const h = hang(a.availability) - hang(b.availability);
    if (h !== 0) return h;
    const g = Number(a.purchasePrice.toString()) - Number(b.purchasePrice.toString());
    if (g !== 0) return g;
    return (a.leadTimeDays ?? 999) - (b.leadTimeDays ?? 999);
  })[0];
}

/**
 * Biên lợi nhuận gộp % của một sản phẩm theo giá bán và giá vốn. Trả `null` khi thiếu
 * giá bán hoặc giá bán bằng 0 — KHÔNG trả 0% (0% nghĩa là bán bằng giá vốn, khác hẳn "chưa biết").
 */
export function bienLoiNhuan(giaBan: unknown, giaVon: unknown): number | null {
  const ban = Number(giaBan ?? NaN);
  const von = Number(giaVon ?? NaN);
  if (!Number.isFinite(ban) || !Number.isFinite(von) || ban <= 0) return null;
  return Math.round(((ban - von) / ban) * 1000) / 10;
}
