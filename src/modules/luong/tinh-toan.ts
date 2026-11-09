/**
 * Tính lương — PHẦN THUẦN (không đọc CSDL), có bài thử đơn vị `thu/don-vi/luong.test.ts`.
 * Luật: BUSINESS_RULES.md mục 32 (LU-01 → LU-62). Quyết định QĐ-141 → QĐ-153.
 *
 * Quy ước tiền (QĐ-142):
 *  - Tiền là số nguyên VND. Bên trong hàm tính dùng `bigint`; tỷ lệ phần trăm đổi sang PHẦN VẠN (8% → 800),
 *    hệ số đổi sang phần vạn (1,5 → 15 000), công đổi sang PHẦN TRĂM ngày (21,5 công → 2 150).
 *  - Mỗi khoản tiền làm tròn ĐÚNG MỘT LẦN bằng `chiaLamTron` (nửa đơn vị làm tròn ra xa số 0) — điểm làm tròn
 *    duy nhất của cả phân hệ. Không cộng dồn số lẻ qua nhiều phép chia.
 *  - Đầu vào / kết quả lưu JSON dùng `number` (mọi khoản < 2^53 nên chính xác tuyệt đối).
 */

// ---------------------------------------------------------------------------
// Số học tiền
// ---------------------------------------------------------------------------

export const VAN = 10_000n;

/** Chia rồi làm tròn nửa ra xa số 0 (0,5 → 1; −0,5 → −1). ĐIỂM LÀM TRÒN DUY NHẤT của phân hệ lương. */
export function chiaLamTron(tu: bigint, mau: bigint): bigint {
  if (mau <= 0n) throw new Error("Mẫu số phải dương.");
  const am = tu < 0n;
  const a = am ? -tu : tu;
  const q = (a * 2n + mau) / (2n * mau);
  return am ? -q : q;
}

/** Tích các tử chia tích các mẫu, làm tròn một lần. */
export function nhanChia(tu: bigint[], mau: bigint[]): bigint {
  return chiaLamTron(
    tu.reduce((a, b) => a * b, 1n),
    mau.reduce((a, b) => a * b, 1n),
  );
}

/** Phần trăm (tối đa 2 chữ số thập phân) → phần vạn: 8 → 800, 1,5 → 150, 17,5 → 1 750. */
export function phanVan(phanTram: number): bigint {
  return BigInt(Math.round(phanTram * 100));
}

/** Công (ngày, bước 0,01) → phần trăm ngày: 21,5 → 2 150. */
export function congTram(cong: number): bigint {
  return BigInt(Math.round(cong * 100));
}

/** Tiền vào (number / chuỗi / bigint) → bigint; số lẻ đồng bị từ chối (dữ liệu phải là số nguyên VND). */
export function tien(x: number | string | bigint): bigint {
  if (typeof x === "bigint") return x;
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isSafeInteger(n)) throw new Error(`Số tiền phải là số nguyên VND: ${x}`);
  return BigInt(n);
}

/** bigint → number cho JSON (luôn an toàn: lương < 2^53). */
export function so(x: bigint): number {
  const n = Number(x);
  if (!Number.isSafeInteger(n)) throw new Error("Số tiền vượt giới hạn an toàn.");
  return n;
}

const max0 = (x: bigint) => (x > 0n ? x : 0n);
const nhoHon = (a: bigint, b: bigint) => (a < b ? a : b);

// ---------------------------------------------------------------------------
// Tham số có hiệu lực theo ngày (LU-10) — kiểu dữ liệu + giá trị nạp sẵn
// ---------------------------------------------------------------------------

export const LOAI_THAM_SO = ["bao-hiem", "luong-toi-thieu-vung", "giam-tru", "bieu-thue", "khau-tru-10", "thu-viec", "tang-ca", "hoa-hong"] as const;
export type LoaiThamSo = (typeof LOAI_THAM_SO)[number];

export const NHAN_LOAI_THAM_SO: Record<LoaiThamSo, string> = {
  "bao-hiem": "Bảo hiểm bắt buộc và kinh phí công đoàn",
  "luong-toi-thieu-vung": "Lương tối thiểu vùng",
  "giam-tru": "Giảm trừ gia cảnh",
  "bieu-thue": "Biểu thuế lũy tiến từng phần (tháng)",
  "khau-tru-10": "Khấu trừ thuế 10% (không theo hợp đồng lao động)",
  "thu-viec": "Lương thử việc",
  "tang-ca": "Hệ số tăng ca",
  "hoa-hong": "Chính sách hoa hồng bán hàng",
};

export interface ThamSoBaoHiem {
  /** Tỷ lệ % người lao động đóng. */
  nld: { bhxh: number; bhyt: number; bhtn: number };
  /** Tỷ lệ % doanh nghiệp đóng (BHXH gồm cả quỹ tai nạn lao động – bệnh nghề nghiệp) + kinh phí công đoàn. */
  dn: { bhxh: number; bhyt: number; bhtn: number; kpcd: number };
  luongCoSo: number;
  /** Trần BHXH, BHYT = số lần × lương cơ sở. */
  tranLanLuongCoSo: number;
  /** Trần BHTN = số lần × lương tối thiểu vùng. */
  tranLanToiThieuVung: number;
  /** Không làm việc và không hưởng lương từ ngần này ngày làm việc trong tháng thì không đóng bảo hiểm tháng đó. */
  ngayNghiKhongDong: number;
}
export interface ThamSoVung {
  /** Vùng của doanh nghiệp (1 – 4). */
  vung: number;
  mucVung: Record<string, number>;
}
export interface ThamSoGiamTru {
  banThan: number;
  nguoiPhuThuoc: number;
}
export interface BacThue {
  /** Thu nhập tính thuế THÁNG tới hết bậc (null = bậc cuối). */
  den: number | null;
  tyLe: number;
}
export interface ThamSoBieuThue {
  bac: BacThue[];
}
export interface ThamSoKhauTru10 {
  tyLe: number;
  /** Khấu trừ khi tổng thu nhập trả một lần / tháng từ mức này trở lên. */
  nguong: number;
}
export interface ThamSoThuViec {
  tyLeToiThieu: number;
}
/** Hệ số tăng ca theo % lương giờ ngày thường. */
export interface ThamSoTangCa {
  thuong: number;
  thuongDem: number;
  nghiTuan: number;
  nghiTuanDem: number;
  le: number;
  leDem: number;
  /** Phần tiền tăng ca trả cao hơn giờ làm bình thường không chịu thuế TNCN. */
  phanVuotMienThue: boolean;
}
export interface BacHoaHong {
  /** Doanh số thu trong tháng từ mức này trở lên. */
  tu: number;
  tyLe: number;
}
export interface ThamSoHoaHong {
  /** phang: một tỷ lệ; bac-thang: đạt bậc nào thì tỷ lệ của bậc đó áp cho toàn bộ doanh số thu. */
  kieu: "phang" | "bac-thang";
  tyLe: number;
  bac: BacHoaHong[];
}

export interface BoThamSo {
  "bao-hiem": ThamSoBaoHiem;
  "luong-toi-thieu-vung": ThamSoVung;
  "giam-tru": ThamSoGiamTru;
  "bieu-thue": ThamSoBieuThue;
  "khau-tru-10": ThamSoKhauTru10;
  "thu-viec": ThamSoThuViec;
  "tang-ca": ThamSoTangCa;
  "hoa-hong": ThamSoHoaHong;
}

/**
 * Giá trị NẠP SẴN theo hiểu biết của người viết phần mềm lúc làm (11/2026) — KHÔNG tra cứu được văn bản (mạng bị chặn).
 * Mọi bộ nạp sẵn gắn cờ "cần kế toán xác nhận" (LU-11); kế toán phải đối chiếu văn bản pháp luật hiện hành rồi xác
 * nhận từng bộ, hoặc nhập bộ mới. Migration `20261104090002` và seed nạp ĐÚNG danh sách này (bài thử so hai đường).
 */
export const THAM_SO_MAC_DINH: { loai: LoaiThamSo; hieuLucTu: string; giaTri: BoThamSo[LoaiThamSo]; ghiChu: string }[] = [
  {
    loai: "bao-hiem",
    hieuLucTu: "2024-07-01",
    giaTri: {
      nld: { bhxh: 8, bhyt: 1.5, bhtn: 1 },
      dn: { bhxh: 17.5, bhyt: 3, bhtn: 1, kpcd: 2 },
      luongCoSo: 2_340_000,
      tranLanLuongCoSo: 20,
      tranLanToiThieuVung: 20,
      ngayNghiKhongDong: 14,
    } satisfies ThamSoBaoHiem,
    ghiChu: "Nạp sẵn: lương cơ sở 2.340.000 đ từ 01/07/2024; NLĐ 8% / 1,5% / 1%, DN 17,5% / 3% / 1%, KPCĐ 2%.",
  },
  {
    loai: "luong-toi-thieu-vung",
    hieuLucTu: "2024-07-01",
    giaTri: { vung: 1, mucVung: { "1": 4_960_000, "2": 4_410_000, "3": 3_860_000, "4": 3_450_000 } } satisfies ThamSoVung,
    ghiChu: "Nạp sẵn: mức áp dụng từ 01/07/2024. Vùng của doanh nghiệp mặc định vùng I — sửa nếu khác.",
  },
  {
    loai: "luong-toi-thieu-vung",
    hieuLucTu: "2026-01-01",
    giaTri: { vung: 1, mucVung: { "1": 5_310_000, "2": 4_730_000, "3": 4_140_000, "4": 3_700_000 } } satisfies ThamSoVung,
    ghiChu: "Nạp sẵn: mức áp dụng từ 01/01/2026 theo hiểu biết lúc làm phần mềm — đối chiếu nghị định hiện hành.",
  },
  {
    loai: "giam-tru",
    hieuLucTu: "2020-07-01",
    giaTri: { banThan: 11_000_000, nguoiPhuThuoc: 4_400_000 } satisfies ThamSoGiamTru,
    ghiChu: "Nạp sẵn: mức giảm trừ áp dụng từ kỳ tính thuế 2020 đến hết 2025.",
  },
  {
    loai: "giam-tru",
    hieuLucTu: "2026-01-01",
    giaTri: { banThan: 15_500_000, nguoiPhuThuoc: 6_200_000 } satisfies ThamSoGiamTru,
    ghiChu: "Nạp sẵn: 15.500.000 / 6.200.000 đ áp dụng từ kỳ tính thuế 2026.",
  },
  {
    loai: "bieu-thue",
    hieuLucTu: "2009-01-01",
    giaTri: {
      bac: [
        { den: 5_000_000, tyLe: 5 },
        { den: 10_000_000, tyLe: 10 },
        { den: 18_000_000, tyLe: 15 },
        { den: 32_000_000, tyLe: 20 },
        { den: 52_000_000, tyLe: 25 },
        { den: 80_000_000, tyLe: 30 },
        { den: null, tyLe: 35 },
      ],
    } satisfies ThamSoBieuThue,
    ghiChu: "Nạp sẵn: biểu 7 bậc (tháng) của Luật Thuế TNCN 2007 sửa đổi.",
  },
  {
    loai: "bieu-thue",
    hieuLucTu: "2026-01-01",
    giaTri: {
      bac: [
        { den: 10_000_000, tyLe: 5 },
        { den: 30_000_000, tyLe: 10 },
        { den: 50_000_000, tyLe: 20 },
        { den: 100_000_000, tyLe: 30 },
        { den: null, tyLe: 35 },
      ],
    } satisfies ThamSoBieuThue,
    ghiChu: "Nạp sẵn THEO HIỂU BIẾT: biểu 5 bậc (tháng) của Luật Thuế TNCN 2025 áp cho tiền lương từ kỳ tính thuế 2026. Kế toán đối chiếu văn bản; nếu chưa áp dụng thì nhập lại biểu 7 bậc với hiệu lực 01/01/2026.",
  },
  {
    loai: "khau-tru-10",
    hieuLucTu: "2015-01-01",
    giaTri: { tyLe: 10, nguong: 2_000_000 } satisfies ThamSoKhauTru10,
    ghiChu: "Nạp sẵn: khấu trừ 10% khi trả từ 2.000.000 đ trở lên cho cá nhân không ký HĐLĐ hoặc HĐLĐ dưới 3 tháng.",
  },
  {
    loai: "thu-viec",
    hieuLucTu: "2021-01-01",
    giaTri: { tyLeToiThieu: 85 } satisfies ThamSoThuViec,
    ghiChu: "Nạp sẵn: lương thử việc ít nhất 85% lương của công việc đó (Bộ luật Lao động 2019).",
  },
  {
    loai: "tang-ca",
    hieuLucTu: "2021-01-01",
    giaTri: { thuong: 150, thuongDem: 210, nghiTuan: 200, nghiTuanDem: 270, le: 300, leDem: 390, phanVuotMienThue: true } satisfies ThamSoTangCa,
    ghiChu: "Nạp sẵn: 150% / 200% / 300%; ban đêm 210% / 270% / 390%. Phần trả cao hơn giờ bình thường không chịu thuế TNCN.",
  },
  {
    loai: "hoa-hong",
    hieuLucTu: "2026-01-01",
    giaTri: { kieu: "phang", tyLe: 0, bac: [] } satisfies ThamSoHoaHong,
    ghiChu: "Nạp sẵn 0% — Giám đốc / kế toán nhập chính sách hoa hồng thật của công ty.",
  },
];

/**
 * Chọn bộ áp dụng cho một ngày (LU-12): hiệu lực lớn nhất ≤ ngày; cùng ngày hiệu lực thì bộ tạo sau cùng.
 * Trả null khi chưa có bộ nào hiệu lực.
 */
export function chonBoHieuLuc<T extends { hieuLucTu: string; taoLuc: string | Date }>(ds: T[], ngay: string): T | null {
  let chon: T | null = null;
  for (const b of ds) {
    if (b.hieuLucTu > ngay) continue;
    if (!chon || b.hieuLucTu > chon.hieuLucTu || (b.hieuLucTu === chon.hieuLucTu && new Date(b.taoLuc).getTime() >= new Date(chon.taoLuc).getTime())) chon = b;
  }
  return chon;
}

// ---------------------------------------------------------------------------
// Ngày và kỳ
// ---------------------------------------------------------------------------

/** Ngày đầu / cuối tháng (YYYY-MM-DD). Tháng 2 năm nhuận 29 ngày. */
export function khoangThang(nam: number, thang: number): { tu: string; den: string; soNgay: number } {
  const soNgay = new Date(Date.UTC(nam, thang, 0)).getUTCDate();
  const t = String(thang).padStart(2, "0");
  return { tu: `${nam}-${t}-01`, den: `${nam}-${t}-${String(soNgay).padStart(2, "0")}`, soNgay };
}

/** Tháng (năm, tháng) lùi `lui` tháng. */
export function thangLui(nam: number, thang: number, lui: number): { nam: number; thang: number } {
  const t = nam * 12 + (thang - 1) - lui;
  return { nam: Math.floor(t / 12), thang: (t % 12) + 1 };
}

export const nhanKy = (nam: number, thang: number) => `${String(thang).padStart(2, "0")}/${nam}`;

// ---------------------------------------------------------------------------
// Thuế, bảo hiểm, hoa hồng
// ---------------------------------------------------------------------------

/** Thuế lũy tiến từng phần trên thu nhập tính thuế THÁNG (LU-34). Làm tròn một lần ở cuối. */
export function thueLuyTien(thuNhapTinhThue: bigint, bac: BacThue[]): bigint {
  if (thuNhapTinhThue <= 0n) return 0n;
  let truoc = 0n;
  let tong = 0n;
  for (const b of bac) {
    const den = b.den === null ? null : tien(b.den);
    const tran = den === null || thuNhapTinhThue < den ? thuNhapTinhThue : den;
    if (tran > truoc) tong += (tran - truoc) * phanVan(b.tyLe);
    if (den === null || thuNhapTinhThue <= den) break;
    truoc = den;
  }
  return chiaLamTron(tong, VAN);
}

/** Biểu thuế hợp lệ: ≥ 1 bậc, mức "đến" tăng dần, chỉ bậc cuối để trống, tỷ lệ 0 – 100. */
export function bieuThueHopLe(bac: BacThue[]): string | null {
  if (bac.length === 0) return "Biểu thuế phải có ít nhất một bậc.";
  for (let i = 0; i < bac.length; i++) {
    const b = bac[i];
    if (b.tyLe < 0 || b.tyLe > 100) return `Bậc ${i + 1}: tỷ lệ phải từ 0 đến 100%.`;
    const cuoi = i === bac.length - 1;
    if (cuoi !== (b.den === null)) return cuoi ? "Bậc cuối phải để trống mức “đến”." : `Bậc ${i + 1}: phải có mức “đến” (chỉ bậc cuối để trống).`;
    if (!cuoi && i > 0 && (b.den as number) <= (bac[i - 1].den as number)) return `Bậc ${i + 1}: mức “đến” phải lớn hơn bậc trước.`;
  }
  return null;
}

/** Tỷ lệ hoa hồng (%) theo chính sách và doanh số thu trong tháng (LU-23). */
export function tyLeHoaHong(doanhSo: bigint, cs: ThamSoHoaHong): number {
  if (cs.kieu === "phang") return cs.tyLe;
  let tyLe = 0;
  let tuChon = -1n;
  for (const b of cs.bac) {
    const tu = tien(b.tu);
    if (doanhSo >= tu && tu >= tuChon) {
      tyLe = b.tyLe;
      tuChon = tu;
    }
  }
  return tyLe;
}

/**
 * Hoa hồng theo TỪNG phân bổ phiếu thu: tỷ lệ chọn theo tổng doanh số thu, mỗi phân bổ làm tròn riêng — để truy
 * thu một phiếu bị hủy ra đúng số đã trả cho phiếu đó (LU-24).
 */
export function hoaHongTheoPhanBo(phanBo: bigint[], cs: ThamSoHoaHong): { doanhSo: bigint; tyLeBp: bigint; tungKhoan: bigint[]; tong: bigint } {
  const doanhSo = phanBo.reduce((a, b) => a + b, 0n);
  const tyLeBp = phanVan(tyLeHoaHong(doanhSo, cs));
  const tungKhoan = phanBo.map((x) => chiaLamTron(x * tyLeBp, VAN));
  return { doanhSo, tyLeBp, tungKhoan, tong: tungKhoan.reduce((a, b) => a + b, 0n) };
}

/** Số tiền truy thu (âm) của một phân bổ đã tính hoa hồng ở kỳ trước với tỷ lệ `tyLeBp`. */
export function truyThuHoaHong(soTien: bigint, tyLeBp: bigint): bigint {
  return -chiaLamTron(soTien * tyLeBp, VAN);
}

// ---------------------------------------------------------------------------
// Một dòng lương
// ---------------------------------------------------------------------------

export const LOAI_HOP_DONG = ["chinh-thuc", "thu-viec", "thoi-vu", "thuc-tap"] as const;
export type LoaiHopDong = (typeof LOAI_HOP_DONG)[number];
export const NHAN_LOAI_HOP_DONG: Record<LoaiHopDong, string> = {
  "chinh-thuc": "Chính thức",
  "thu-viec": "Thử việc",
  "thoi-vu": "Thời vụ / khoán",
  "thuc-tap": "Thực tập sinh",
};
export const CACH_TRA = ["thang", "ngay", "gio"] as const;
export type CachTra = (typeof CACH_TRA)[number];
export const NHAN_CACH_TRA: Record<CachTra, string> = { thang: "Lương tháng (theo công)", ngay: "Lương ngày", gio: "Lương giờ" };
export const PHUONG_PHAP_THUE = ["luy-tien", "khau-tru-10", "khong"] as const;
export type PhuongPhapThue = (typeof PHUONG_PHAP_THUE)[number];
export const NHAN_PHUONG_PHAP_THUE: Record<PhuongPhapThue, string> = {
  "luy-tien": "Lũy tiến từng phần (HĐLĐ từ 3 tháng)",
  "khau-tru-10": "Khấu trừ 10% (không HĐLĐ / dưới 3 tháng)",
  khong: "Không khấu trừ (đã có cam kết 08/CK-TNCN…)",
};
/** Gợi ý phương pháp thuế theo loại hợp đồng — người lập hồ sơ đổi được. */
export const THUE_GOI_Y: Record<LoaiHopDong, PhuongPhapThue> = {
  "chinh-thuc": "luy-tien",
  "thu-viec": "luy-tien",
  "thoi-vu": "khau-tru-10",
  "thuc-tap": "khau-tru-10",
};

export interface PhuCapDauVao {
  ma: string;
  ten: string;
  soTien: number;
  chiuThue: boolean;
  tinhBH: boolean;
  theo: "thang" | "ngay-cong";
  /** QĐ-157: phụ cấp cố định tháng TRẢ ĐỦ, không chia theo công (mặc định: chia theo công). */
  traDu?: boolean;
}

export interface KhoanDauVao {
  chieu: "cong" | "tru";
  loai: string;
  soTien: number;
  chiuThue: boolean;
  lyDo: string;
  /**
   * QĐ-158 — chỉ khoản điều chỉnh kỳ trước: `truoc-thue` = vào (cộng) / giảm (trừ) tổng thu nhập, thu nhập chịu thuế
   * (nếu `chiuThue`) và lương đóng BH (nếu `tinhBH`) — như truy thu hoa hồng; `sau-thue` = cộng / trừ thẳng vào thực
   * lĩnh. Không có (ảnh chụp cũ) → cách cũ: cộng vào tổng thu nhập, trừ sau thuế.
   */
  tinhThue?: "truoc-thue" | "sau-thue";
  tinhBH?: boolean;
}

/** Phút tăng ca theo loại ngày, tách phần đêm (từ bảng công đã khóa). */
export interface PhutTangCa {
  thuong: number;
  thuongDem: number;
  nghiTuan: number;
  nghiTuanDem: number;
  le: number;
  leDem: number;
}

/**
 * QĐ-156: một ĐOẠN của tháng có cùng phiên bản hồ sơ lương (đổi lương / hết thử việc giữa tháng → nhiều đoạn). Công,
 * tăng ca, phụ cấp tính theo đoạn với mức của phiên bản đó; công chuẩn vẫn là của cả tháng.
 */
export interface DoanLuong {
  hoSoId: string | null;
  tu: string;
  den: string;
  loaiHopDong: LoaiHopDong;
  tyLeThuViec: number | null;
  cachTra: CachTra;
  luongCoBan: number;
  phuCap: PhuCapDauVao[];
  cong: { thucTe: number; nghiCoLuong: number; le: number; tangCaPhut: PhutTangCa };
}

/** ẢNH CHỤP ĐẦU VÀO của một dòng lương (LU-28) — đủ để tính lại ra đúng số. */
export interface DauVaoLuong {
  ky: { nam: number; thang: number };
  /** Phiên bản hiệu lực cuối kỳ: thuế, BH, thưởng KPI, hoa hồng lấy theo bản này. */
  hoSo: {
    id: string | null;
    hieuLucTu: string;
    loaiHopDong: LoaiHopDong;
    tyLeThuViec: number | null;
    cachTra: CachTra;
    luongCoBan: number;
    luongDongBH: number;
    thuongKpi: number;
    huongHoaHong: boolean;
    phuongPhapThue: PhuongPhapThue;
  };
  phuCap: PhuCapDauVao[];
  /** QĐ-156: các đoạn theo phiên bản hồ sơ. Không có (ảnh chụp cũ) → một đoạn = `hoSo` + `phuCap` + `cong`. */
  doan?: DoanLuong[];
  cong: {
    /** Ngày công chuẩn của tháng theo lịch làm việc (coi như không có ngày lễ). */
    chuan: number;
    thucTe: number;
    nghiCoLuong: number;
    nghiKhongLuong: number;
    /** Ngày lễ rơi vào ngày phải làm theo lịch — được trả lương. */
    le: number;
    tangCaPhut: PhutTangCa;
    /** QĐ-166: phút tăng ca còn ÂM chuyển từ kỳ trước (≤ 0), trừ vào tăng ca kỳ này. */
    tangCaNoKyTruoc?: PhutTangCa;
    /** Chỉ ghi nhận, KHÔNG trừ tiền (LU-21). */
    phutMuon: number;
    phutSom: number;
    soDongDieuChinh: number;
  };
  soNguoiPhuThuoc: number;
  kpi: { trangThai: "da-chot" | "chua-chot" | "khong-co"; heSo: number | null; xepLoai: string | null; danhGiaId: string | null };
  hoaHong: {
    phanBo: { id: string; so: string; soTien: number }[];
    truyThu: { id: string; so: string; soTien: number; tyLeBp: number }[];
  };
  khoan: KhoanDauVao[];
  thamSo: BoThamSo & { soGioNgay: number };
}

export type MucCanhBao = "loi" | "canh-bao";
export interface CanhBaoLuong {
  ma: string;
  muc: MucCanhBao;
  noiDung: string;
}

export interface KetQuaLuong {
  congTinhLuong: number;
  luongTheoCong: number;
  /** QĐ-156: chi tiết từng đoạn (một đoạn khi không đổi hồ sơ trong tháng). */
  doan?: { tu: string; den: string; loaiHopDong: LoaiHopDong; tyLeThuViec: number | null; luongCoBan: number; congTinhLuong: number; luongTheoCong: number; tangCa: number }[];
  phuCap: { ma: string; ten: string; soTien: number; chiuThue: boolean; tinhBH: boolean }[];
  tongPhuCap: number;
  phuCapKhongChiuThue: number;
  tangCa: { tien: number; mienThue: number; chiTiet: { loai: keyof PhutTangCa; phut: number; heSo: number; tien: number }[] };
  /** QĐ-166: phút tăng ca còn âm chưa trừ hết → chuyển kỳ sau (null = không còn). */
  tangCaNoChuyenKySau?: PhutTangCa | null;
  thuongKpi: number;
  hoaHong: { doanhSo: number; tyLeBp: number; tien: number; truyThu: number; tungKhoan: number[] };
  khoanCong: number;
  khoanCongKhongChiuThue: number;
  /** QĐ-158: điều chỉnh kỳ trước tính TRƯỚC thuế (có dấu: âm = thu hồi). */
  dieuChinhTruocThue?: number;
  /** QĐ-158: điều chỉnh kỳ trước cộng SAU thuế vào thực lĩnh. */
  khoanCongSauThue?: number;
  khoanTru: number;
  tongThuNhap: number;
  thuNhapChiuThue: number;
  baoHiem: {
    thamGia: boolean;
    luongDong: number;
    mucDongXH: number;
    mucDongTN: number;
    nld: { bhxh: number; bhyt: number; bhtn: number; tong: number };
    dn: { bhxh: number; bhyt: number; bhtn: number; kpcd: number; tong: number };
  };
  giamTru: { banThan: number; phuThuoc: number; soNguoi: number; tong: number };
  thuNhapTinhThue: number;
  thue: { phuongPhap: PhuongPhapThue; tien: number };
  thucLinh: number;
  chiPhiDoanhNghiep: number;
  canhBao: CanhBaoLuong[];
}

const LOAI_TANG_CA: { loai: keyof PhutTangCa; heSo: keyof ThamSoTangCa }[] = [
  { loai: "thuong", heSo: "thuong" },
  { loai: "thuongDem", heSo: "thuongDem" },
  { loai: "nghiTuan", heSo: "nghiTuan" },
  { loai: "nghiTuanDem", heSo: "nghiTuanDem" },
  { loai: "le", heSo: "le" },
  { loai: "leDem", heSo: "leDem" },
];

export const NHAN_TANG_CA: Record<keyof PhutTangCa, string> = {
  thuong: "Ngày thường",
  thuongDem: "Ngày thường – ban đêm",
  nghiTuan: "Nghỉ hằng tuần",
  nghiTuanDem: "Nghỉ hằng tuần – ban đêm",
  le: "Ngày lễ",
  leDem: "Ngày lễ – ban đêm",
};

export const PHUT_TANG_CA_RONG: PhutTangCa = { thuong: 0, thuongDem: 0, nghiTuan: 0, nghiTuanDem: 0, le: 0, leDem: 0 };

/**
 * QĐ-166: trừ phút tăng ca ÂM (dòng điều chỉnh bảng công, nợ kỳ trước) vào phút dương của các đoạn, từ đoạn cuối
 * ngược về đầu. Không đủ trừ → trả phần còn âm (`no` ≤ 0) để chuyển kỳ sau — KHÔNG kẹp về 0 lặng lẽ.
 */
export function truTangCaAm(phut: number[]): { phut: number[]; no: number } {
  const kq = phut.map((x) => Math.max(0, x));
  let thieu = phut.reduce((a, x) => a + Math.min(0, x), 0);
  for (let i = kq.length - 1; i >= 0 && thieu < 0; i--) {
    const lay = Math.min(kq[i], -thieu);
    kq[i] -= lay;
    thieu += lay;
  }
  return { phut: kq, no: thieu };
}

/**
 * Tính một dòng lương (LU-20 → LU-36). Hàm thuần: cùng đầu vào → cùng kết quả (kiểm lại ảnh chụp, LU-28).
 *
 *  1. Công tính lương = công thực tế + nghỉ có lương + lễ (nghỉ ốm, không lương không trả — BHXH chi ốm đau).
 *     Đi muộn / về sớm KHÔNG trừ tiền.
 *  2. Lương theo công, TỪNG ĐOẠN phiên bản hồ sơ (QĐ-156): tháng = lương × % thử việc × công tính lương của đoạn /
 *     công chuẩn CẢ THÁNG; ngày = × công; giờ = × công × giờ/ngày.
 *  3. Phụ cấp: theo ngày công = × công thực tế; cố định tháng = × công tính lương / công chuẩn (QĐ-157), trừ loại
 *     "trả đủ". Tăng ca: lương giờ của đoạn × giờ × hệ số; phút âm trừ dần, thiếu thì chuyển kỳ sau (QĐ-166).
 *  4. Thưởng KPI = mức thưởng × hệ số phiếu đã chốt (chưa chốt → 0 + cảnh báo). Hoa hồng theo phân bổ phiếu thu.
 *  5. Bảo hiểm NLĐ trên lương đóng BH (+ phụ cấp tính BH ± điều chỉnh trước thuế tính BH), có trần; nghỉ không
 *     lương ≥ N ngày → không đóng.
 *  6. Thuế: lũy tiến trên (thu nhập chịu thuế − BH − giảm trừ) hoặc 10% khi ≥ ngưỡng, hoặc không khấu trừ.
 *  7. Thực lĩnh = tổng thu nhập − BH NLĐ − thuế − khoản trừ + điều chỉnh cộng sau thuế. Âm → lỗi (LU-36).
 */
export function tinhLuong(dv: DauVaoLuong): KetQuaLuong {
  const canhBao: CanhBaoLuong[] = [];
  const ts = dv.thamSo;
  const hs = dv.hoSo;
  const gioNgay = BigInt(Math.max(1, Math.round(ts.soGioNgay)));
  const chuan = congTram(dv.cong.chuan);

  const doan: DoanLuong[] = dv.doan?.length
    ? dv.doan
    : [{
        hoSoId: hs.id, tu: khoangThang(dv.ky.nam, dv.ky.thang).tu, den: khoangThang(dv.ky.nam, dv.ky.thang).den, loaiHopDong: hs.loaiHopDong,
        tyLeThuViec: hs.tyLeThuViec, cachTra: hs.cachTra, luongCoBan: hs.luongCoBan, phuCap: dv.phuCap,
        cong: { thucTe: dv.cong.thucTe, nghiCoLuong: dv.cong.nghiCoLuong, le: dv.cong.le, tangCaPhut: dv.cong.tangCaPhut },
      }];

  // 1–2. Công và lương theo công, từng đoạn.
  let congTL = 0n;
  let luongTheoCong = 0n;
  let thieuLich = false;
  const gio: { tu: bigint[]; mau: bigint[] }[] = [];
  const congDoan: bigint[] = [];
  const luongDoan: bigint[] = [];
  for (const d of doan) {
    const ctl = congTram(d.cong.thucTe) + congTram(d.cong.nghiCoLuong) + congTram(d.cong.le);
    congDoan.push(ctl);
    congTL += ctl;
    const base = tien(d.luongCoBan);
    let tyLeVan = VAN;
    if (d.loaiHopDong === "thu-viec") {
      const tl = d.tyLeThuViec ?? 100;
      tyLeVan = phanVan(tl);
      if (tl < ts["thu-viec"].tyLeToiThieu && !canhBao.some((c) => c.ma === "thu-viec-duoi-muc")) {
        canhBao.push({ ma: "thu-viec-duoi-muc", muc: "loi", noiDung: `Lương thử việc ${tl}% thấp hơn mức tối thiểu ${ts["thu-viec"].tyLeToiThieu}%.` });
      }
    }
    let l: bigint;
    if (d.cachTra === "thang") {
      if (chuan <= 0n) {
        thieuLich = true;
        l = 0n;
        gio.push({ tu: [0n], mau: [1n] });
      } else {
        l = nhanChia([base, tyLeVan, ctl], [VAN, chuan]);
        gio.push({ tu: [base, tyLeVan, 100n], mau: [VAN, chuan, gioNgay] });
      }
    } else if (d.cachTra === "ngay") {
      l = nhanChia([base, tyLeVan, ctl], [VAN, 100n]);
      gio.push({ tu: [base, tyLeVan], mau: [VAN, gioNgay] });
    } else {
      l = nhanChia([base, tyLeVan, ctl, gioNgay], [VAN, 100n]);
      gio.push({ tu: [base, tyLeVan], mau: [VAN] });
    }
    luongDoan.push(l);
    luongTheoCong += l;
  }
  if (thieuLich) canhBao.push({ ma: "thieu-lich", muc: "loi", noiDung: "Chưa có lịch làm việc trong tháng nên không có ngày công chuẩn — gán lịch ở Thiết lập chấm công." });
  if (congTL <= 0n) canhBao.push({ ma: "khong-co-cong", muc: "canh-bao", noiDung: "Không có công tính lương trong tháng." });

  // 3. Phụ cấp (QĐ-157): theo ngày công × công thực tế của đoạn; cố định tháng × công tính lương / công chuẩn; "trả
  // đủ" = mức của phiên bản cuối có phụ cấp đó, không chia.
  // QA v2 (QĐ-168): phụ cấp cố định tháng chia theo công KHÔNG vượt mức tháng (kẹp ở 100% mức cao nhất trong tháng);
  // phần công cộng thêm do dòng điều chỉnh tháng trước → cảnh báo kèm số tiền chưa trả, kế toán nhập khoản điều chỉnh.
  const phuCapMap = new Map<string, { ma: string; ten: string; soTien: bigint; chiuThue: boolean; tinhBH: boolean }>();
  const mucThang = new Map<string, bigint>();
  const traDu = new Map<string, PhuCapDauVao>();
  doan.forEach((d, i) => {
    for (const p of d.phuCap) {
      let st: bigint;
      if (p.theo === "ngay-cong") st = nhanChia([tien(p.soTien), congTram(d.cong.thucTe)], [100n]);
      else if (p.traDu) {
        traDu.set(p.ma, p);
        continue;
      } else {
        st = chuan > 0n ? nhanChia([tien(p.soTien), congDoan[i]], [chuan]) : tien(p.soTien);
        mucThang.set(p.ma, (mucThang.get(p.ma) ?? 0n) > tien(p.soTien) ? mucThang.get(p.ma)! : tien(p.soTien));
      }
      const cu = phuCapMap.get(p.ma);
      phuCapMap.set(p.ma, { ma: p.ma, ten: p.ten, soTien: (cu?.soTien ?? 0n) + st, chiuThue: p.chiuThue, tinhBH: p.tinhBH });
    }
  });
  const vuotMuc: string[] = [];
  for (const [ma, muc] of mucThang) {
    const p = phuCapMap.get(ma)!;
    if (p.soTien > muc) {
      vuotMuc.push(`${p.ten} ${(p.soTien - muc).toLocaleString("vi-VN")} đ`);
      p.soTien = muc;
    }
  }
  if (vuotMuc.length) {
    canhBao.push({
      ma: "phu-cap-vuot-muc-thang",
      muc: "canh-bao",
      noiDung: `Công tính lương (${Number(congTL) / 100}) vượt công chuẩn (${Number(chuan) / 100}) do dòng điều chỉnh tháng trước — phụ cấp tháng kẹp ở mức tháng, phần chưa trả: ${vuotMuc.join(", ")}. Nếu tháng trước trả thiếu phụ cấp, nhập khoản "Điều chỉnh kỳ trước" (trước thuế).`,
    });
  }
  for (const p of traDu.values()) {
    const cu = phuCapMap.get(p.ma);
    phuCapMap.set(p.ma, { ma: p.ma, ten: p.ten, soTien: (cu?.soTien ?? 0n) + tien(p.soTien), chiuThue: p.chiuThue, tinhBH: p.tinhBH });
  }
  const phuCap = [...phuCapMap.values()];
  const tongPhuCap = phuCap.reduce((a, p) => a + p.soTien, 0n);
  const phuCapKhongChiuThue = phuCap.filter((p) => !p.chiuThue).reduce((a, p) => a + p.soTien, 0n);

  // Tăng ca (QĐ-166): phút từng đoạn; nợ kỳ trước + dòng điều chỉnh âm trừ từ đoạn cuối; còn thiếu → chuyển kỳ sau.
  const tc = ts["tang-ca"];
  let tienTangCa = 0n;
  let mienThueTangCa = 0n;
  const tangCaDoan = doan.map(() => 0n);
  const chiTietTc: KetQuaLuong["tangCa"]["chiTiet"] = [];
  const no: PhutTangCa = { ...PHUT_TANG_CA_RONG };
  let coNo = false;
  for (const l of LOAI_TANG_CA) {
    const ds = doan.map((d) => Math.round(d.cong.tangCaPhut[l.loai] ?? 0));
    ds[ds.length - 1] += Math.min(0, Math.round(dv.cong.tangCaNoKyTruoc?.[l.loai] ?? 0));
    const tru = truTangCaAm(ds);
    if (tru.no < 0) {
      no[l.loai] = tru.no;
      coNo = true;
    }
    const heSo = tc[l.heSo] as number;
    let tongPhut = 0n;
    let tongTien = 0n;
    tru.phut.forEach((ph, i) => {
      const phut = BigInt(ph);
      if (phut <= 0n) return;
      const t = nhanChia([...gio[i].tu, phanVan(heSo), phut], [...gio[i].mau, VAN, 60n]);
      tongTien += t;
      tongPhut += phut;
      tangCaDoan[i] += t;
      if (tc.phanVuotMienThue) mienThueTangCa += max0(t - nhanChia([...gio[i].tu, phut], [...gio[i].mau, 60n]));
    });
    tienTangCa += tongTien;
    if (tongPhut > 0n) chiTietTc.push({ loai: l.loai, phut: Number(tongPhut), heSo, tien: so(tongTien) });
  }
  if (coNo) {
    canhBao.push({
      ma: "tang-ca-am-chuyen-ky-sau",
      muc: "canh-bao",
      noiDung: `Điều chỉnh giảm tăng ca lớn hơn tăng ca kỳ này — còn ${LOAI_TANG_CA.filter((l) => no[l.loai] < 0).map((l) => `${NHAN_TANG_CA[l.loai].toLowerCase()} ${-no[l.loai]} phút`).join(", ")} chuyển trừ ở kỳ sau.`,
    });
  }

  // 4. Thưởng KPI
  let thuongKpi = 0n;
  if (dv.kpi.trangThai === "da-chot" && dv.kpi.heSo !== null) {
    thuongKpi = nhanChia([tien(hs.thuongKpi), BigInt(Math.round(dv.kpi.heSo * 10_000))], [VAN]);
  } else if (tien(hs.thuongKpi) > 0n) {
    canhBao.push({
      ma: "kpi-chua-chot",
      muc: "canh-bao",
      noiDung: dv.kpi.trangThai === "khong-co" ? "Không có phiếu đánh giá kỳ này — thưởng KPI = 0." : "Phiếu đánh giá chưa chốt — thưởng KPI = 0.",
    });
  }

  // Hoa hồng
  const hh = hs.huongHoaHong ? hoaHongTheoPhanBo(dv.hoaHong.phanBo.map((p) => tien(p.soTien)), ts["hoa-hong"]) : { doanhSo: 0n, tyLeBp: 0n, tungKhoan: [] as bigint[], tong: 0n };
  const truyThu = dv.hoaHong.truyThu.reduce((a, t) => a + truyThuHoaHong(tien(t.soTien), BigInt(t.tyLeBp)), 0n);

  // Khoản cộng / trừ (QĐ-158: điều chỉnh kỳ trước theo cách tính đã chọn).
  const coDau = (k: KhoanDauVao) => (k.chieu === "cong" ? tien(k.soTien) : -tien(k.soTien));
  const dcTruoc = dv.khoan.filter((k) => k.tinhThue === "truoc-thue");
  const dcSau = dv.khoan.filter((k) => k.tinhThue === "sau-thue");
  const thuong = dv.khoan.filter((k) => !k.tinhThue);
  const khoanCong = thuong.filter((k) => k.chieu === "cong").reduce((a, k) => a + tien(k.soTien), 0n);
  const khoanCongKhongThue = thuong.filter((k) => k.chieu === "cong" && !k.chiuThue).reduce((a, k) => a + tien(k.soTien), 0n);
  const dieuChinhTruocThue = dcTruoc.reduce((a, k) => a + coDau(k), 0n);
  const dieuChinhKhongThue = dcTruoc.filter((k) => !k.chiuThue).reduce((a, k) => a + coDau(k), 0n);
  const dieuChinhBH = dcTruoc.filter((k) => k.tinhBH).reduce((a, k) => a + coDau(k), 0n);
  const khoanCongSauThue = dcSau.filter((k) => k.chieu === "cong").reduce((a, k) => a + tien(k.soTien), 0n);
  const khoanTru = [...thuong, ...dcSau].filter((k) => k.chieu === "tru").reduce((a, k) => a + tien(k.soTien), 0n);

  const tongThuNhap = luongTheoCong + tongPhuCap + tienTangCa + thuongKpi + hh.tong + truyThu + khoanCong + dieuChinhTruocThue;
  const thuNhapChiuThue = max0(tongThuNhap - phuCapKhongChiuThue - mienThueTangCa - khoanCongKhongThue - dieuChinhKhongThue);

  // 5. Bảo hiểm
  const bh = ts["bao-hiem"];
  const vung = ts["luong-toi-thieu-vung"];
  const mucVung = tien(vung.mucVung[String(vung.vung)] ?? 0);
  const phuCapBH = dv.phuCap
    .filter((p) => p.tinhBH)
    .reduce((a, p) => a + (p.theo === "ngay-cong" ? nhanChia([tien(p.soTien), chuan], [100n]) : tien(p.soTien)), 0n);
  const luongDong = tien(hs.luongDongBH) > 0n ? max0(tien(hs.luongDongBH) + phuCapBH + dieuChinhBH) : 0n;
  const ngayKhongLuong = chuan - congTL;
  let thamGia = luongDong > 0n;
  if (thamGia && ngayKhongLuong >= congTram(bh.ngayNghiKhongDong)) {
    thamGia = false;
    canhBao.push({
      ma: "nghi-khong-dong-bh",
      muc: "canh-bao",
      noiDung: `Không làm việc / không hưởng lương ${Number(ngayKhongLuong) / 100} ngày (≥ ${bh.ngayNghiKhongDong}) — tháng này không đóng bảo hiểm.`,
    });
  }
  if (tien(hs.luongDongBH) > 0n && mucVung > 0n && tien(hs.luongDongBH) < mucVung) {
    canhBao.push({ ma: "luong-bh-duoi-toi-thieu", muc: "canh-bao", noiDung: `Lương đóng bảo hiểm thấp hơn lương tối thiểu vùng ${vung.vung} (${mucVung.toLocaleString("vi-VN")} đ).` });
  }
  const mucXH = thamGia ? nhoHon(luongDong, tien(bh.luongCoSo) * BigInt(Math.round(bh.tranLanLuongCoSo))) : 0n;
  const mucTN = thamGia ? nhoHon(luongDong, mucVung * BigInt(Math.round(bh.tranLanToiThieuVung))) : 0n;
  const pt = (muc: bigint, phanTram: number) => chiaLamTron(muc * phanVan(phanTram), VAN);
  const nld = { bhxh: pt(mucXH, bh.nld.bhxh), bhyt: pt(mucXH, bh.nld.bhyt), bhtn: pt(mucTN, bh.nld.bhtn) };
  const nldTong = nld.bhxh + nld.bhyt + nld.bhtn;
  const dn = { bhxh: pt(mucXH, bh.dn.bhxh), bhyt: pt(mucXH, bh.dn.bhyt), bhtn: pt(mucTN, bh.dn.bhtn), kpcd: pt(mucXH, bh.dn.kpcd) };
  const dnTong = dn.bhxh + dn.bhyt + dn.bhtn + dn.kpcd;

  // 6. Thuế TNCN
  const gt = ts["giam-tru"];
  const soNguoi = Math.max(0, Math.round(dv.soNguoiPhuThuoc));
  const giamTru = { banThan: tien(gt.banThan), phuThuoc: tien(gt.nguoiPhuThuoc) * BigInt(soNguoi) };
  let thuNhapTinhThue = 0n;
  let thue = 0n;
  if (hs.phuongPhapThue === "luy-tien") {
    thuNhapTinhThue = max0(thuNhapChiuThue - nldTong - giamTru.banThan - giamTru.phuThuoc);
    thue = thueLuyTien(thuNhapTinhThue, ts["bieu-thue"].bac);
  } else if (hs.phuongPhapThue === "khau-tru-10") {
    thuNhapTinhThue = thuNhapChiuThue;
    if (thuNhapChiuThue >= tien(ts["khau-tru-10"].nguong)) thue = chiaLamTron(thuNhapChiuThue * phanVan(ts["khau-tru-10"].tyLe), VAN);
  }

  // 7. Thực lĩnh
  const thucLinh = tongThuNhap - nldTong - thue - khoanTru + khoanCongSauThue;
  if (thucLinh < 0n) {
    canhBao.push({ ma: "thuc-linh-am", muc: "loi", noiDung: `Thực lĩnh âm (${thucLinh.toLocaleString("vi-VN")} đ) — giảm khoản trừ (chuyển tạm ứng sang kỳ sau) rồi tính lại.` });
  }

  return {
    congTinhLuong: Number(congTL) / 100,
    luongTheoCong: so(luongTheoCong),
    doan: doan.map((d, i) => ({
      tu: d.tu, den: d.den, loaiHopDong: d.loaiHopDong, tyLeThuViec: d.tyLeThuViec, luongCoBan: d.luongCoBan,
      congTinhLuong: Number(congDoan[i]) / 100, luongTheoCong: so(luongDoan[i]), tangCa: so(tangCaDoan[i]),
    })),
    phuCap: phuCap.map((p) => ({ ...p, soTien: so(p.soTien) })),
    tongPhuCap: so(tongPhuCap),
    phuCapKhongChiuThue: so(phuCapKhongChiuThue),
    tangCa: { tien: so(tienTangCa), mienThue: so(mienThueTangCa), chiTiet: chiTietTc },
    tangCaNoChuyenKySau: coNo ? no : null,
    thuongKpi: so(thuongKpi),
    hoaHong: { doanhSo: so(hh.doanhSo), tyLeBp: Number(hh.tyLeBp), tien: so(hh.tong), truyThu: so(truyThu), tungKhoan: hh.tungKhoan.map(so) },
    khoanCong: so(khoanCong),
    khoanCongKhongChiuThue: so(khoanCongKhongThue),
    dieuChinhTruocThue: so(dieuChinhTruocThue),
    khoanCongSauThue: so(khoanCongSauThue),
    khoanTru: so(khoanTru),
    tongThuNhap: so(tongThuNhap),
    thuNhapChiuThue: so(thuNhapChiuThue),
    baoHiem: {
      thamGia,
      luongDong: so(luongDong),
      mucDongXH: so(mucXH),
      mucDongTN: so(mucTN),
      nld: { bhxh: so(nld.bhxh), bhyt: so(nld.bhyt), bhtn: so(nld.bhtn), tong: so(nldTong) },
      dn: { bhxh: so(dn.bhxh), bhyt: so(dn.bhyt), bhtn: so(dn.bhtn), kpcd: so(dn.kpcd), tong: so(dnTong) },
    },
    giamTru: { banThan: hs.phuongPhapThue === "luy-tien" ? so(giamTru.banThan) : 0, phuThuoc: hs.phuongPhapThue === "luy-tien" ? so(giamTru.phuThuoc) : 0, soNguoi, tong: hs.phuongPhapThue === "luy-tien" ? so(giamTru.banThan + giamTru.phuThuoc) : 0 },
    thuNhapTinhThue: so(thuNhapTinhThue),
    thue: { phuongPhap: hs.phuongPhapThue, tien: so(thue) },
    thucLinh: so(thucLinh),
    chiPhiDoanhNghiep: so(tongThuNhap + dnTong),
    canhBao,
  };
}

/** Kết quả có lỗi chặn gửi duyệt không (LU-36). */
export function coLoi(cb: CanhBaoLuong[]): boolean {
  return cb.some((c) => c.muc === "loi");
}

/** So kết quả tính lại từ ảnh chụp với số đã lưu (LU-28) — trả các trường lệch. */
export function soKhopKetQua(a: KetQuaLuong, b: KetQuaLuong): string[] {
  const truong: (keyof KetQuaLuong)[] = ["luongTheoCong", "tongPhuCap", "thuongKpi", "khoanCong", "khoanTru", "tongThuNhap", "thuNhapChiuThue", "thuNhapTinhThue", "thucLinh", "chiPhiDoanhNghiep"];
  const lech = truong.filter((t) => a[t] !== b[t]);
  if (a.baoHiem.nld.tong !== b.baoHiem.nld.tong) lech.push("baoHiem");
  if (a.thue.tien !== b.thue.tien) lech.push("thue");
  if (a.tangCa.tien !== b.tangCa.tien) lech.push("tangCa");
  if (a.hoaHong.tien !== b.hoaHong.tien || a.hoaHong.truyThu !== b.hoaHong.truyThu) lech.push("hoaHong");
  return lech;
}

// ---------------------------------------------------------------------------
// Trạng thái kỳ lương (LU-20)
// ---------------------------------------------------------------------------

export const TRANG_THAI_KY = ["nhap", "cho-duyet", "da-duyet", "da-khoa", "da-chi"] as const;
export type TrangThaiKy = (typeof TRANG_THAI_KY)[number];
export const NHAN_TRANG_THAI_KY: Record<TrangThaiKy, string> = {
  nhap: "Nháp",
  "cho-duyet": "Chờ duyệt",
  "da-duyet": "Đã duyệt",
  "da-khoa": "Đã khóa",
  "da-chi": "Đã chi",
};
export const laKyDaKhoa = (tt: string) => tt === "da-khoa" || tt === "da-chi";

// ---------------------------------------------------------------------------
// Xuất file (LU-50 → LU-53)
// ---------------------------------------------------------------------------

/** Bỏ dấu tiếng Việt (nội dung chuyển khoản — nhiều ngân hàng không nhận dấu). */
export function boDau(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Điền mẫu nội dung chuyển khoản: {ho_ten}, {thang}, {nam}, {ma_nv}. */
export function dienNoiDung(mau: string, g: { hoTen: string; thang: number; nam: number; maNv: string | null }): string {
  return mau
    .replace(/\{ho_ten\}/g, g.hoTen)
    .replace(/\{thang\}/g, String(g.thang).padStart(2, "0"))
    .replace(/\{nam\}/g, String(g.nam))
    .replace(/\{ma_nv\}/g, g.maNv ?? "")
    .slice(0, 210);
}

export const COT_NGAN_HANG = ["stt", "so-tai-khoan", "chu-tai-khoan", "ngan-hang", "so-tien", "noi-dung", "ma-nhan-vien", "ho-ten"] as const;
export type CotNganHang = (typeof COT_NGAN_HANG)[number];
export const NHAN_COT_NGAN_HANG: Record<CotNganHang, string> = {
  stt: "STT",
  "so-tai-khoan": "Số tài khoản",
  "chu-tai-khoan": "Tên chủ tài khoản",
  "ngan-hang": "Ngân hàng",
  "so-tien": "Số tiền",
  "noi-dung": "Nội dung",
  "ma-nhan-vien": "Mã nhân viên",
  "ho-ten": "Họ tên",
};
export const XUAT_NGAN_HANG_MAC_DINH = {
  cot: ["stt", "so-tai-khoan", "chu-tai-khoan", "ngan-hang", "so-tien", "noi-dung"] as CotNganHang[],
  noiDung: "Luong thang {thang}/{nam} {ho_ten}",
  boDau: true,
};

/** Tài khoản kế toán dùng cho bút toán lương (Cấu hình nhóm Tính lương). */
export interface TaiKhoanLuong {
  chiPhi: number;
  phaiTra: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  kpcd: number;
  thue: number;
  tamUng: number;
  khauTruKhac: number;
  tien: number;
  /** 0.22.0 (QĐ-173): Có của phần trả tay / tiền mặt khi đã chi (mặc định 1111). Không khai → dùng `tien`. */
  tienMat?: number;
}

export interface DongTongHopButToan {
  tongThuNhap: number;
  bhNld: { bhxh: number; bhyt: number; bhtn: number };
  bhDn: { bhxh: number; bhyt: number; bhtn: number; kpcd: number };
  thue: number;
  tamUng: number;
  truKhac: number;
  /** QĐ-158: điều chỉnh kỳ trước cộng sau thuế. */
  congSauThue?: number;
  thucLinh: number;
  /** 0.22.0 (QĐ-173): dòng trả tay / tiền mặt (không vào file ngân hàng) — bút toán chi tách tài khoản tiền mặt. */
  traTay?: boolean;
}

/**
 * Bút toán lương tổng hợp theo cặp tài khoản (LU-53). Chưa có module xuất MISA nên xuất CSV chung (ngày, số chứng
 * từ, diễn giải, TK Nợ, TK Có, số tiền) — dán / nhập vào MISA bằng mẫu "Chứng từ nghiệp vụ khác". Bỏ dòng 0 đ.
 * `daChi` = kỳ đã chi → thêm bút toán trả lương (Nợ 334 / Có tiền).
 */
export function butToanLuong(ds: DongTongHopButToan[], tk: TaiKhoanLuong, daChi: boolean): { dienGiai: string; no: number; co: number; soTien: number }[] {
  const cong = (f: (d: DongTongHopButToan) => number) => ds.reduce((a, d) => a + f(d), 0);
  const kq = [
    { dienGiai: "Chi phí tiền lương phải trả", no: tk.chiPhi, co: tk.phaiTra, soTien: cong((d) => d.tongThuNhap) },
    { dienGiai: "BHXH doanh nghiệp đóng", no: tk.chiPhi, co: tk.bhxh, soTien: cong((d) => d.bhDn.bhxh) },
    { dienGiai: "BHYT doanh nghiệp đóng", no: tk.chiPhi, co: tk.bhyt, soTien: cong((d) => d.bhDn.bhyt) },
    { dienGiai: "BHTN doanh nghiệp đóng", no: tk.chiPhi, co: tk.bhtn, soTien: cong((d) => d.bhDn.bhtn) },
    { dienGiai: "Kinh phí công đoàn", no: tk.chiPhi, co: tk.kpcd, soTien: cong((d) => d.bhDn.kpcd) },
    { dienGiai: "Khấu trừ BHXH người lao động", no: tk.phaiTra, co: tk.bhxh, soTien: cong((d) => d.bhNld.bhxh) },
    { dienGiai: "Khấu trừ BHYT người lao động", no: tk.phaiTra, co: tk.bhyt, soTien: cong((d) => d.bhNld.bhyt) },
    { dienGiai: "Khấu trừ BHTN người lao động", no: tk.phaiTra, co: tk.bhtn, soTien: cong((d) => d.bhNld.bhtn) },
    { dienGiai: "Khấu trừ thuế TNCN", no: tk.phaiTra, co: tk.thue, soTien: cong((d) => d.thue) },
    { dienGiai: "Khấu trừ tạm ứng", no: tk.phaiTra, co: tk.tamUng, soTien: cong((d) => d.tamUng) },
    { dienGiai: "Khấu trừ khác (phạt, khác)", no: tk.phaiTra, co: tk.khauTruKhac, soTien: cong((d) => d.truKhac) },
    { dienGiai: "Điều chỉnh kỳ trước cộng sau thuế", no: tk.khauTruKhac, co: tk.phaiTra, soTien: cong((d) => d.congSauThue ?? 0) },
  ];
  if (daChi) {
    // QĐ-173: phần chuyển khoản Có tài khoản tiền gửi, phần trả tay Có tài khoản tiền mặt — tổng hai dòng = tổng thực lĩnh.
    kq.push({ dienGiai: "Trả lương nhân viên (chuyển khoản)", no: tk.phaiTra, co: tk.tien, soTien: cong((d) => (d.traTay ? 0 : d.thucLinh)) });
    kq.push({ dienGiai: "Trả lương nhân viên (tiền mặt / trả tay)", no: tk.phaiTra, co: tk.tienMat ?? tk.tien, soTien: cong((d) => (d.traTay ? d.thucLinh : 0)) });
  }
  return kq.filter((x) => x.soTien !== 0);
}

/**
 * Danh mục phụ cấp nạp sẵn (LU-03) — chỉ thêm mã còn thiếu, không đè chỉnh sửa. Cờ chịu thuế là GIẢ ĐỊNH phổ biến
 * (ăn giữa ca, điện thoại khoán theo quy chế không chịu thuế); kế toán đổi được trên màn hình Hồ sơ lương.
 */
export const PHU_CAP_MAC_DINH: { ma: string; ten: string; chiuThue: boolean; tinhBH: boolean; theo: "thang" | "ngay-cong"; thuTu: number }[] = [
  { ma: "an-trua", ten: "Ăn trưa", chiuThue: false, tinhBH: false, theo: "ngay-cong", thuTu: 10 },
  { ma: "xang-xe", ten: "Xăng xe", chiuThue: true, tinhBH: false, theo: "thang", thuTu: 20 },
  { ma: "dien-thoai", ten: "Điện thoại", chiuThue: false, tinhBH: false, theo: "thang", thuTu: 30 },
];

// ---------------------------------------------------------------------------
// 0.22.0 (QĐ-192): giấy tờ người phụ thuộc
// ---------------------------------------------------------------------------

/**
 * Số giấy tờ người phụ thuộc hợp lệ: MST (10 số, hoặc 10 số-3 số), CCCD / số định danh (12 số), giấy tờ khác (hộ chiếu,
 * giấy khai sinh…) ít nhất 6 ký tự chữ-số. Bỏ khoảng trắng trước khi kiểm.
 */
export function giayToNguoiPhuThuocHopLe(so: string | null | undefined): boolean {
  if (!so) return false;
  const s = so.replace(/\s/g, "");
  return /^\d{10}$/.test(s) || /^\d{10}-\d{3}$/.test(s) || /^\d{12}$/.test(s) || /^[A-Za-z0-9]{6,30}$/.test(s);
}

/** Đủ thông tin để được giảm trừ: họ tên thật (≥ 2 ký tự, không phải tên giữ chỗ của nhập CSV) + giấy tờ hợp lệ. */
export function nguoiPhuThuocDuGiayTo(hoTen: string | null | undefined, soGiayTo: string | null | undefined): boolean {
  const ten = (hoTen ?? "").trim();
  return ten.length >= 2 && !/\(nhập CSV — bổ sung họ tên\)/.test(ten) && giayToNguoiPhuThuocHopLe(soGiayTo);
}

// ---------------------------------------------------------------------------
// 0.22.0 (QĐ-191): đối chiếu công sau khi khóa bảng công
// ---------------------------------------------------------------------------

/** Một dòng bảng công đã khóa (đủ để tính công tính lương). */
export interface DongCongDoiChieu {
  ngay: string;
  dieuChinh: boolean;
  cong: number;
  nghi: number;
  nghiCoLuong: boolean;
  phutTangCa: number;
  phutTangCaDem: number;
  loaiNgay: string;
  phutMuon: number;
  phutSom: number;
}

/**
 * Thay CÔNG trong ảnh chụp đầu vào bằng công của bảng công đã khóa (giữ nguyên mọi thứ khác: hồ sơ, đoạn, lễ, phụ cấp, KPI,
 * hoa hồng, khoản, tham số). Dòng điều chỉnh → đoạn cuối; ngày ngoài mọi đoạn (không có hồ sơ) bỏ qua. Hàm thuần.
 */
export function thayCongTuBangCong(dv: DauVaoLuong, dong: DongCongDoiChieu[]): DauVaoLuong {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const rong = (): PhutTangCa => ({ ...PHUT_TANG_CA_RONG });
  const doanCu: DoanLuong[] = dv.doan?.length
    ? dv.doan
    : [{
        hoSoId: dv.hoSo.id, tu: khoangThang(dv.ky.nam, dv.ky.thang).tu, den: khoangThang(dv.ky.nam, dv.ky.thang).den, loaiHopDong: dv.hoSo.loaiHopDong,
        tyLeThuViec: dv.hoSo.tyLeThuViec, cachTra: dv.hoSo.cachTra, luongCoBan: dv.hoSo.luongCoBan, phuCap: dv.phuCap,
        cong: { thucTe: dv.cong.thucTe, nghiCoLuong: dv.cong.nghiCoLuong, le: dv.cong.le, tangCaPhut: dv.cong.tangCaPhut },
      }];
  const doan = doanCu.map((d) => ({ ...d, cong: { thucTe: 0, nghiCoLuong: 0, le: d.cong.le, tangCaPhut: rong() } }));
  const tc = rong();
  let thucTe = 0, nghiCo = 0, nghiKhong = 0, muon = 0, som = 0, soDc = 0;
  for (const r of dong) {
    const i = r.dieuChinh ? doan.length - 1 : doan.findIndex((d) => d.tu <= r.ngay && r.ngay <= d.den);
    if (r.dieuChinh) soDc++;
    muon += r.phutMuon;
    som += r.phutSom;
    if (!r.nghiCoLuong) nghiKhong += r.nghi;
    if (i < 0) continue;
    const d = doan[i];
    d.cong.thucTe += r.cong;
    thucTe += r.cong;
    if (r.nghiCoLuong) {
      d.cong.nghiCoLuong += r.nghi;
      nghiCo += r.nghi;
    }
    const ngayTc = r.phutTangCa - r.phutTangCaDem;
    const loai: [keyof PhutTangCa, keyof PhutTangCa] = r.loaiNgay === "le" ? ["le", "leDem"] : r.loaiNgay === "nghi-tuan" ? ["nghiTuan", "nghiTuanDem"] : ["thuong", "thuongDem"];
    d.cong.tangCaPhut[loai[0]] += ngayTc;
    d.cong.tangCaPhut[loai[1]] += r.phutTangCaDem;
    tc[loai[0]] += ngayTc;
    tc[loai[1]] += r.phutTangCaDem;
  }
  for (const d of doan) {
    d.cong.thucTe = r2(d.cong.thucTe);
    d.cong.nghiCoLuong = r2(d.cong.nghiCoLuong);
  }
  return {
    ...dv,
    ...(dv.doan?.length ? { doan } : {}),
    cong: { ...dv.cong, thucTe: r2(thucTe), nghiCoLuong: r2(nghiCo), nghiKhongLuong: r2(nghiKhong), tangCaPhut: tc, phutMuon: muon, phutSom: som, soDongDieuChinh: soDc },
  };
}
