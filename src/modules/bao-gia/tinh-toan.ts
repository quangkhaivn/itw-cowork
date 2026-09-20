/**
 * Tính tiền và biên lợi nhuận của báo giá — hàm THUẦN, có kiểm thử đơn vị (mục 12 prompt).
 *
 * Mọi con số tiền trên báo giá đều đi qua hàm này; giao diện, API, PDF và trợ lý AI dùng
 * chung một cách tính để không bao giờ lệch nhau.
 *
 * Quy ước làm tròn: làm tròn **từng dòng** về đồng (VND không có phần lẻ), rồi cộng.
 * Làm tròn ở tổng sẽ khiến bảng in ra cộng không khớp tổng — khách hàng sẽ hỏi ngay.
 */

export const TRANG_THAI_BAO_GIA = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SENT",
  "VIEWED",
  "NEGOTIATING",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "SUPERSEDED",
] as const;
export type TrangThaiBaoGia = (typeof TRANG_THAI_BAO_GIA)[number];

export const NHAN_TRANG_THAI_BAO_GIA: Record<string, string> = {
  DRAFT: "Nháp",
  PENDING_APPROVAL: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  SENT: "Đã gửi khách",
  VIEWED: "Khách đã xem",
  NEGOTIATING: "Đang thương lượng",
  ACCEPTED: "Khách chấp nhận",
  REJECTED: "Khách từ chối",
  EXPIRED: "Hết hiệu lực",
  SUPERSEDED: "Đã thay bằng bản mới",
};

export const LOP_TRANG_THAI_BAO_GIA: Record<string, string> = {
  DRAFT: "",
  PENDING_APPROVAL: "canh-bao",
  APPROVED: "chinh",
  SENT: "chinh",
  VIEWED: "chinh",
  NEGOTIATING: "canh-bao",
  ACCEPTED: "tot",
  REJECTED: "loi",
  EXPIRED: "loi",
  SUPERSEDED: "",
};

/** Trạng thái còn sửa trực tiếp được (chưa gửi khách). */
export const CHUA_GUI: TrangThaiBaoGia[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED"];
/** Đã gửi khách và còn đang chạy. */
export const DANG_CHAY: TrangThaiBaoGia[] = ["SENT", "VIEWED", "NEGOTIATING"];
/** Đã chốt, không đổi nữa. */
export const DA_CHOT: TrangThaiBaoGia[] = ["ACCEPTED", "REJECTED", "EXPIRED", "SUPERSEDED"];

export function chuaGui(tt: string): boolean {
  return (CHUA_GUI as string[]).includes(tt);
}
export function daChot(tt: string): boolean {
  return (DA_CHOT as string[]).includes(tt);
}

// ---------------------------------------------------------------------------
// Tính tiền
// ---------------------------------------------------------------------------

export interface DongBaoGia {
  /** Số lượng, cho phép lẻ (mét dây, giờ công). */
  soLuong: number | string;
  donGia: number | string;
  /** Chiết khấu theo % trên dòng. */
  chietKhau?: number | string | null;
  /** Thuế suất % của dòng. */
  vat?: number | string | null;
  /** Giá vốn một đơn vị, chụp tại lúc lập. */
  giaVon?: number | string | null;
}

export interface KetQuaTinhDong {
  /** Thành tiền trước chiết khấu: số lượng × đơn giá. */
  thanhTienGoc: number;
  tienChietKhau: number;
  /** Thành tiền sau chiết khấu, chưa thuế — đây là cột "Thành tiền" trên bản in. */
  thanhTien: number;
  tienVat: number;
  /** Thành tiền + thuế. */
  thanhTienCoVat: number;
  giaVonDong: number;
}

export interface KetQuaTinhBaoGia {
  dong: KetQuaTinhDong[];
  /** Tổng trước chiết khấu. */
  tamTinh: number;
  tongChietKhau: number;
  tongVat: number;
  /** Số tiền khách phải trả. */
  tongCong: number;
  tongGiaVon: number;
  /** Doanh thu trước thuế (tạm tính − chiết khấu) − giá vốn. */
  loiNhuanGop: number;
  /** % trên doanh thu trước thuế. `null` khi doanh thu bằng 0 — KHÔNG trả 0%. */
  bienLoiNhuan: number | null;
}

function so(x: number | string | null | undefined, macDinh = 0): number {
  if (x === null || x === undefined || x === "") return macDinh;
  const n = typeof x === "number" ? x : Number(String(x).replace(/\s/g, ""));
  return Number.isFinite(n) ? n : macDinh;
}

/** Làm tròn về đồng. */
function dong(n: number): number {
  return Math.round(n);
}

export function tinhBaoGia(dsDong: DongBaoGia[]): KetQuaTinhBaoGia {
  const dong4 = dsDong.map((d) => {
    const sl = so(d.soLuong, 0);
    const gia = so(d.donGia, 0);
    const ck = Math.min(100, Math.max(0, so(d.chietKhau, 0)));
    const vat = Math.min(100, Math.max(0, so(d.vat, 0)));
    const von = so(d.giaVon, 0);

    const thanhTienGoc = dong(sl * gia);
    const tienChietKhau = dong((sl * gia * ck) / 100);
    const thanhTien = thanhTienGoc - tienChietKhau;
    const tienVat = dong((thanhTien * vat) / 100);
    return {
      thanhTienGoc,
      tienChietKhau,
      thanhTien,
      tienVat,
      thanhTienCoVat: thanhTien + tienVat,
      giaVonDong: dong(sl * von),
    };
  });

  const tamTinh = dong4.reduce((s, d) => s + d.thanhTienGoc, 0);
  const tongChietKhau = dong4.reduce((s, d) => s + d.tienChietKhau, 0);
  const tongVat = dong4.reduce((s, d) => s + d.tienVat, 0);
  const tongGiaVon = dong4.reduce((s, d) => s + d.giaVonDong, 0);
  const doanhThu = tamTinh - tongChietKhau;
  const loiNhuanGop = doanhThu - tongGiaVon;

  return {
    dong: dong4,
    tamTinh,
    tongChietKhau,
    tongVat,
    tongCong: doanhThu + tongVat,
    tongGiaVon,
    loiNhuanGop,
    bienLoiNhuan: doanhThu > 0 ? Math.round((loiNhuanGop / doanhThu) * 10000) / 100 : null,
  };
}

/**
 * Báo giá này có phải qua duyệt không (mục 12 prompt).
 *
 *   - Ngưỡng CHƯA ĐẶT → **mọi báo giá phải duyệt**. An toàn hơn là tự chọn một con số.
 *   - Biên lợi nhuận chưa tính được (doanh thu 0) → phải duyệt.
 *   - Biên < ngưỡng → phải duyệt.
 */
export function canDuyet(bienLoiNhuan: number | null, nguong: number | null): { can: boolean; lyDo: "threshold_not_set" | "margin_below_threshold" | null } {
  if (nguong === null || nguong === undefined) return { can: true, lyDo: "threshold_not_set" };
  if (bienLoiNhuan === null) return { can: true, lyDo: "margin_below_threshold" };
  return bienLoiNhuan < nguong ? { can: true, lyDo: "margin_below_threshold" } : { can: false, lyDo: null };
}

/** Báo giá đã quá hạn hiệu lực chưa (so theo ngày, không so giờ). */
export function hetHieuLuc(hieuLucDen: Date | string | null | undefined, homNay: string): boolean {
  if (!hieuLucDen) return false;
  const ngay = typeof hieuLucDen === "string" ? hieuLucDen.slice(0, 10) : hieuLucDen.toISOString().slice(0, 10);
  return ngay < homNay;
}

/** Đọc số tiền bằng chữ tiếng Việt — bản in cần dòng "Bằng chữ". */
export function docTienBangChu(n: number): string {
  const CHU_SO = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
  const so3 = (x: number, daycao: boolean): string => {
    const tram = Math.floor(x / 100);
    const chuc = Math.floor((x % 100) / 10);
    const donVi = x % 10;
    const phan: string[] = [];
    if (tram > 0 || daycao) phan.push(`${CHU_SO[tram]} trăm`);
    if (chuc > 1) {
      phan.push(`${CHU_SO[chuc]} mươi`);
      if (donVi === 1) phan.push("mốt");
      else if (donVi === 5) phan.push("lăm");
      else if (donVi > 0) phan.push(CHU_SO[donVi]);
    } else if (chuc === 1) {
      phan.push("mười");
      if (donVi === 1) phan.push("một");
      else if (donVi === 5) phan.push("lăm");
      else if (donVi > 0) phan.push(CHU_SO[donVi]);
    } else if (donVi > 0) {
      if (tram > 0 || daycao) phan.push("lẻ");
      phan.push(CHU_SO[donVi]);
    }
    return phan.join(" ");
  };

  const tien = Math.round(Math.abs(n));
  if (tien === 0) return "Không đồng";
  const DON_VI = ["", " nghìn", " triệu", " tỷ", " nghìn tỷ", " triệu tỷ"];
  const nhom: number[] = [];
  let con = tien;
  while (con > 0) {
    nhom.push(con % 1000);
    con = Math.floor(con / 1000);
  }
  const phan: string[] = [];
  for (let i = nhom.length - 1; i >= 0; i--) {
    if (nhom[i] === 0) continue;
    phan.push(so3(nhom[i], i < nhom.length - 1) + DON_VI[i]);
  }
  const chu = `${n < 0 ? "âm " : ""}${phan.join(" ")} đồng`;
  return chu.charAt(0).toUpperCase() + chu.slice(1);
}
