import { boKyTuVoHinh } from "./vo-hinh";

/**
 * Dữ liệu sản phẩm ĐƯA CHO AI (0.25.0, QĐ-237) — bộ chọn theo DANH SÁCH TRẮNG, thuần.
 *
 * Luật cứng: KHÔNG BAO GIỜ gửi giá vốn, nhà cung cấp, giá nhập, biên lợi nhuận, chiết khấu cho nhà cung cấp AI. Hàm này
 * DỰNG MỚI một đối tượng chỉ gồm các trường được phép (không sao chép / spread bản ghi nguồn), lọc thêm thông số kỹ thuật
 * và mô tả có chữ liên quan tới giá vốn / nhà cung cấp, rồi `batBuocKhongCoTruongCam` kiểm lại lần cuối trước khi gửi.
 * Bài thử đơn vị `thu/don-vi/mxh-ai-du-lieu.test.ts` HỎNG nếu một trường giá vốn lọt vào.
 */

/** Đúng các khóa được phép xuất hiện trong dữ liệu sản phẩm gửi AI. */
export const TRUONG_DUOC_GUI_AI = [
  "ma", "ten", "model", "nhom", "thuongHieu", "donViTinh", "moTa", "thongSo", "giaBan", "vatPhanTram", "giaGomVat",
  "baoHanhThang", "tinhTrangHang", "soLuongConBan",
] as const;

export type TinhTrangHang = "con-hang" | "sap-het" | "het-hang" | "khong-theo-doi";
export const NHAN_TINH_TRANG_HANG: Record<TinhTrangHang, string> = {
  "con-hang": "Còn hàng",
  "sap-het": "Sắp hết hàng",
  "het-hang": "Hết hàng",
  "khong-theo-doi": "Không theo dõi tồn (dịch vụ / phần mềm)",
};

export interface SanPhamChoAI {
  ma: string;
  ten: string;
  model: string | null;
  nhom: string | null;
  thuongHieu: string | null;
  donViTinh: string | null;
  moTa: string | null;
  thongSo: Record<string, string> | null;
  /** Giá bán (số nguyên VND) — null = chưa có giá, AI không được tự đặt giá. */
  giaBan: number | null;
  vatPhanTram: number | null;
  giaGomVat: number | null;
  baoHanhThang: number | null;
  tinhTrangHang: TinhTrangHang;
  /** Chỉ có khi người yêu cầu có quyền xem tồn kho (inventory.view). */
  soLuongConBan?: number;
}

/** Bản ghi nguồn (sản phẩm + tồn) — có thể chứa trường cấm; hàm chỉ đọc đúng các trường cần. */
export interface NguonSanPham {
  sku: string;
  name: string;
  model?: string | null;
  description?: string | null;
  specifications?: unknown;
  unit?: string | null;
  sellingPrice?: { toString(): string } | number | string | null;
  vatRate?: { toString(): string } | number | string | null;
  warrantyMonths?: number | null;
  category?: { name: string } | null;
  brand?: { name: string } | null;
  quanLyTon?: boolean;
  minStock?: { toString(): string } | number | string | null;
  /** Còn bán được (tồn − giữ chỗ) cộng mọi kho; null = chưa từng nhập. */
  conBanDuoc?: number | null;
  [khac: string]: unknown;
}

/**
 * Bỏ dấu, chữ thường, MỌI dấu câu / gạch / gạch dưới → khoảng trắng — để so khớp mẫu chữ cấm bất kể viết có dấu / không
 * dấu / "giá-vốn" / "gia_von" / "GIÁ.VỐN" (QA 0.25.0, QĐ-240: trước đây chỉ bỏ dấu nên "Giá-vốn: …" lọt).
 */
function boDau(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

/**
 * Mẫu chữ liên quan giá vốn / giá mua / nhà cung cấp / lợi nhuận / hoa hồng / thông tin nội bộ. Khóa hoặc giá trị thông số
 * khớp → bỏ; dòng mô tả khớp → bỏ dòng. Thừa còn hơn thiếu: lỡ bỏ một thông số vô hại không sao, lọt giá vốn thì có hại.
 * ("mạng nội bộ" — LAN — không tính là thông tin nội bộ.)
 */
const MAU_CAM = /(gia\s*von|von\s*hang|gia\s*nhap|nhap\s*gia|nhap\s*hang|gia\s*mua|mua\s*vao|cost|nha\s*cung\s*cap|ncc\b|supplier|vendor|nha\s*phan\s*phoi|margin|bien\s*loi|loi\s*nhuan|lai\s*gop|tien\s*lai|hoa\s*hong|chiet\s*khau\s*(dai\s*ly|nha)|purchase|wholesale|gia\s*si|gia\s*dai\s*ly|(?<!mang\s)noi\s*bo\b|khong\s*cong\s*khai|bi\s*mat|confidential|internal)/;

export function coChuCam(s: string): boolean {
  return MAU_CAM.test(boDau(s));
}

/** Tên các khóa TUYỆT ĐỐI không được có ở bất kỳ tầng nào của dữ liệu gửi AI (kiểm lần cuối). */
const KHOA_CAM = /^(costPrice|cost_price|giaVon|gia_von|cost|supplier|suppliers|supplierPrices|defaultSupplier|defaultSupplierId|nhaCungCap|nhaCungCapMacDinh|bienLoiNhuan|margin|purchasePrice|giaNhap)$/i;

function cat(s: string | null | undefined, toiDa: number): string | null {
  if (typeof s !== "string") return null;
  // QA 0.25.0 (QĐ-241): bỏ cả ký tự vô hình / đảo chiều / thẻ Unicode (lệnh giấu trong dữ liệu sản phẩm).
  const t = boKyTuVoHinh(s, " ").trim();
  return t ? t.slice(0, toiDa) : null;
}

/**
 * LỚP ĐỐI CHIẾU (QA 0.25.0, QĐ-240): giá vốn / giá nhập THẬT và tên / mã nhà cung cấp THẬT của chính sản phẩm (service đọc
 * riêng, KHÔNG đưa vào dữ liệu gửi đi) — dòng mô tả / cặp thông số chứa chúng dưới BẤT KỲ dạng nào (không nhãn, "GV9876543",
 * "9,876,543", bảng) bị bỏ. Danh sách mẫu chữ không thể đoán hết cách người nhập ghi giá vốn; con số thật thì đoán được.
 */
export interface DoiChieuNhayCam {
  giaVon: readonly number[];
  nhaCungCap: readonly string[];
}

function chuaNhayCam(s: string, dc: DoiChieuNhayCam | undefined): boolean {
  if (!dc) return false;
  const so = [...s.matchAll(/\d[\d.,\s]*\d|\d/g)].map((m) => m[0].replace(/[.,\s]/g, ""));
  for (const g of dc.giaVon) {
    const n = Math.round(g);
    if (n >= 1000 && so.some((x) => x.includes(String(n)))) return true;
  }
  const c = ` ${boDau(s)} `;
  return dc.nhaCungCap.some((t) => {
    const k = boDau(t).trim();
    return k.length >= 4 && c.includes(` ${k} `);
  });
}

/** Dòng chỉ có số / dấu / đơn vị tiền (không có chữ) — ví dụ "9.876.543 đ", "15.990.000 | 9.876.543". */
const CHI_SO = /^[\d\s.,:;|/\\()+*%=–—-]*(?:\s*(?:đ|₫|vnđ|vnd|đồng|k|tr|triệu))?[\d\s.,:;|/\\()+*%=–—-]*$/iu;

function soNguyen(x: { toString(): string } | number | string | null | undefined): number | null {
  if (x === null || x === undefined) return null;
  const n = Number(typeof x === "number" ? x : x.toString());
  return Number.isFinite(n) ? Math.round(n) : null;
}

function soThuc(x: { toString(): string } | number | string | null | undefined): number | null {
  if (x === null || x === undefined) return null;
  const n = Number(typeof x === "number" ? x : x.toString());
  return Number.isFinite(n) ? n : null;
}

/** Thông số kỹ thuật: tối đa 30 cặp chữ, bỏ cặp có chữ cấm / giá vốn / nhà cung cấp thật. */
function locThongSo(x: unknown, dc?: DoiChieuNhayCam): Record<string, string> | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const kq: Record<string, string> = {};
  let n = 0;
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    if (n >= 30) break;
    if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
    const khoa = cat(k, 80);
    const giaTri = cat(String(v), 300);
    if (!khoa || !giaTri || coChuCam(khoa) || coChuCam(giaTri) || KHOA_CAM.test(khoa) || chuaNhayCam(`${khoa} ${giaTri}`, dc)) continue;
    kq[khoa] = giaTri;
    n++;
  }
  return n ? kq : null;
}

/**
 * Mô tả: bỏ dòng có chữ cấm / giá vốn / nhà cung cấp thật, tối đa 1.500 ký tự. QA 0.25.0 (QĐ-240): dòng CHỈ CÓ SỐ ngay sau
 * một dòng bị bỏ cũng bỏ (nhãn một dòng, con số dòng dưới — "Giá vốn:\n9.876.543 đ" — hoặc hàng số của bảng).
 */
function locMoTa(s: string | null | undefined, dc?: DoiChieuNhayCam): string | null {
  if (typeof s !== "string") return null;
  const giu: string[] = [];
  let boTruoc = false;
  for (const d of s.replace(/\r\n?/g, "\n").split("\n")) {
    const bo = coChuCam(d) || chuaNhayCam(d, dc) || (boTruoc && d.trim() !== "" && CHI_SO.test(d.trim()));
    if (bo) boTruoc = true;
    else {
      if (d.trim() !== "") boTruoc = false;
      giu.push(d);
    }
  }
  return cat(giu.join("\n"), 1500);
}

export function tinhTrangHang(nguon: Pick<NguonSanPham, "quanLyTon" | "minStock" | "conBanDuoc">): TinhTrangHang {
  if (nguon.quanLyTon === false) return "khong-theo-doi";
  const con = nguon.conBanDuoc ?? 0;
  if (con <= 0) return "het-hang";
  const toiThieu = soThuc(nguon.minStock ?? null);
  if (toiThieu !== null && con <= toiThieu) return "sap-het";
  return "con-hang";
}

/**
 * Dựng dữ liệu một sản phẩm cho AI. `xemSoLuong` = người yêu cầu có `inventory.view` (không có → chỉ tình trạng còn / hết).
 * `doiChieu` = giá vốn / giá nhập / nhà cung cấp THẬT của sản phẩm để bỏ dòng chứa chúng (lớp đối chiếu, QĐ-240).
 */
export function sanPhamChoAI(p: NguonSanPham, xemSoLuong: boolean, doiChieu?: DoiChieuNhayCam): SanPhamChoAI {
  const giaBan = soNguyen(p.sellingPrice ?? null);
  const vat = soThuc(p.vatRate ?? null);
  const tt = tinhTrangHang(p);
  const kq: SanPhamChoAI = {
    ma: cat(p.sku, 64) ?? "",
    ten: cat(p.name, 300) ?? "",
    model: cat(p.model ?? null, 120),
    nhom: cat(p.category?.name ?? null, 120),
    thuongHieu: cat(p.brand?.name ?? null, 120),
    donViTinh: cat(p.unit ?? null, 30),
    moTa: locMoTa(p.description ?? null, doiChieu),
    thongSo: locThongSo(p.specifications, doiChieu),
    giaBan: giaBan !== null && giaBan > 0 ? giaBan : null,
    vatPhanTram: vat,
    giaGomVat: giaBan !== null && giaBan > 0 && vat !== null ? Math.round(giaBan * (1 + vat / 100)) : null,
    baoHanhThang: typeof p.warrantyMonths === "number" ? p.warrantyMonths : null,
    tinhTrangHang: tt,
  };
  if (xemSoLuong && tt !== "khong-theo-doi") kq.soLuongConBan = Math.max(0, Math.floor(p.conBanDuoc ?? 0));
  return kq;
}

/**
 * Kiểm LẦN CUỐI dữ liệu sắp gửi AI: mọi khóa ở mọi tầng không được thuộc danh sách cấm; khóa ở tầng sản phẩm phải thuộc
 * danh sách trắng. Vi phạm → ném lỗi (không gửi). Gọi ngay trước khi dựng lời nhắc.
 */
export function batBuocKhongCoTruongCam(ds: readonly SanPhamChoAI[]): void {
  const duyet = (x: unknown, duong: string) => {
    if (!x || typeof x !== "object") return;
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
      if (KHOA_CAM.test(k)) throw new Error(`Dữ liệu gửi AI có trường cấm: ${duong}${k}`);
      duyet(v, `${duong}${k}.`);
    }
  };
  for (const sp of ds) {
    for (const k of Object.keys(sp)) {
      if (!(TRUONG_DUOC_GUI_AI as readonly string[]).includes(k)) throw new Error(`Dữ liệu gửi AI có trường ngoài danh sách trắng: ${k}`);
    }
    duyet(sp, "");
  }
}

/** Các mức giá THẬT (giá bán, giá gồm VAT) — để kiểm AI không bịa giá khác. */
export function giaHopLe(ds: readonly SanPhamChoAI[]): Set<number> {
  const s = new Set<number>();
  for (const sp of ds) {
    if (sp.giaBan) s.add(sp.giaBan);
    if (sp.giaGomVat) s.add(sp.giaGomVat);
  }
  return s;
}
