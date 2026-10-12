import { boDau, chuanHoaDienThoai, chuanHoaEmail, chuanHoaMaSoThue } from "@/modules/crm/chuan-hoa";
import { KHOA_UTM, TRUONG_FORM, type KhoaTruongForm, type KhoaUtm, type TrangThaiChienDich } from "./hang-so";

/**
 * Phần thuần của Marketing — không đụng cơ sở dữ liệu, có kiểm thử đơn vị
 * (`thu/don-vi/marketing.test.ts`). Luật: BUSINESS_RULES.md mục 21 (MK).
 */

// ---------------------------------------------------------------------------
// Chỉ số chiến dịch (MK-05)
// ---------------------------------------------------------------------------

export interface DauVaoChiSo {
  chiPhi: number;
  soLead: number;
  soDuDieuKien: number;
  soChuyenDoi: number;
  doanhThu: number;
  giaTriCoHoiThang?: number;
}

export interface ChiSoChienDich extends Required<DauVaoChiSo> {
  /** Chi phí / lead (đồng). Chưa có lead → null — không phải 0. */
  cpl: number | null;
  /** Doanh thu / chi phí (lần, 2 số lẻ). Chưa tiêu đồng nào → null. */
  roas: number | null;
  /** % lead đủ điều kiện trên tổng lead, 1 số lẻ. */
  tyLeDuDieuKien: number | null;
  /** % lead đã chuyển đổi thành khách trên tổng lead, 1 số lẻ. */
  tyLeChuyenDoi: number | null;
}

/** Tỷ lệ phần trăm 1 số lẻ; mẫu số 0 → null. */
export function tyLePhanTram(tu: number, mau: number): number | null {
  if (!mau) return null;
  return Math.round((tu / mau) * 1000) / 10;
}

export function tinhChiSoChienDich(d: DauVaoChiSo): ChiSoChienDich {
  const chiPhi = Math.round(d.chiPhi);
  const doanhThu = Math.round(d.doanhThu);
  return {
    chiPhi,
    soLead: d.soLead,
    soDuDieuKien: d.soDuDieuKien,
    soChuyenDoi: d.soChuyenDoi,
    doanhThu,
    giaTriCoHoiThang: Math.round(d.giaTriCoHoiThang ?? 0),
    cpl: d.soLead > 0 ? Math.round(chiPhi / d.soLead) : null,
    roas: chiPhi > 0 ? Math.round((doanhThu / chiPhi) * 100) / 100 : null,
    tyLeDuDieuKien: tyLePhanTram(d.soDuDieuKien, d.soLead),
    tyLeChuyenDoi: tyLePhanTram(d.soChuyenDoi, d.soLead),
  };
}

/** Cộng nhiều bộ đầu vào (dòng tổng của bảng chiến dịch) rồi tính lại — không cộng các tỷ lệ. */
export function congChiSo(ds: DauVaoChiSo[]): ChiSoChienDich {
  return tinhChiSoChienDich(
    ds.reduce<Required<DauVaoChiSo>>(
      (s, x) => ({
        chiPhi: s.chiPhi + x.chiPhi,
        soLead: s.soLead + x.soLead,
        soDuDieuKien: s.soDuDieuKien + x.soDuDieuKien,
        soChuyenDoi: s.soChuyenDoi + x.soChuyenDoi,
        doanhThu: s.doanhThu + x.doanhThu,
        giaTriCoHoiThang: s.giaTriCoHoiThang + (x.giaTriCoHoiThang ?? 0),
      }),
      { chiPhi: 0, soLead: 0, soDuDieuKien: 0, soChuyenDoi: 0, doanhThu: 0, giaTriCoHoiThang: 0 },
    ),
  );
}

// ---------------------------------------------------------------------------
// Vòng đời chiến dịch và duyệt ngân sách (MK-03)
// ---------------------------------------------------------------------------

/** Ngân sách hiện tại có cần (lại) duyệt không: > 0 và vượt mức đã duyệt (hoặc chưa duyệt). */
export function canDuyetNganSach(nganSach: number, daDuyet: number | null): boolean {
  if (!(nganSach > 0)) return false;
  return daDuyet === null || nganSach > daDuyet;
}

const CHUYEN_TRANG_THAI: Record<TrangThaiChienDich, TrangThaiChienDich[]> = {
  "ke-hoach": ["cho-duyet", "dang-chay", "huy"],
  "cho-duyet": ["ke-hoach", "huy"],
  "dang-chay": ["tam-dung", "ket-thuc"],
  "tam-dung": ["dang-chay", "ket-thuc"],
  "ket-thuc": [],
  huy: [],
};

/** Bước chuyển trạng thái do người dùng bấm. Duyệt ngân sách là thao tác riêng. */
export function chuyenTrangThaiHopLe(tu: TrangThaiChienDich, den: TrangThaiChienDich): boolean {
  return CHUYEN_TRANG_THAI[tu]?.includes(den) ?? false;
}

export function cacBuocKeTiep(tu: TrangThaiChienDich): TrangThaiChienDich[] {
  return CHUYEN_TRANG_THAI[tu] ?? [];
}

// ---------------------------------------------------------------------------
// Chia lead vòng tròn (MK-08)
// ---------------------------------------------------------------------------

/**
 * Chọn người nhận theo số đếm nguyên tử (1, 2, 3…) do CSDL cấp. Danh sách đổi thì vòng
 * lệch đi một chút — chấp nhận; quan trọng là hai lead đến cùng lúc không rơi vào cùng
 * một suất vì số đếm đã khác nhau.
 */
export function chonTheoVongTron<T>(ds: readonly T[], soDem: number): T | null {
  if (!ds.length) return null;
  const i = (((Math.trunc(soDem) - 1) % ds.length) + ds.length) % ds.length;
  return ds[i];
}

/** Hạn gọi lại = lúc nhận + số phút cấu hình. Chưa đặt → null (việc không có hạn — MK-09). */
export function hanGoiLai(luc: Date, soPhut: number | null): Date | null {
  if (soPhut === null || !(soPhut > 0)) return null;
  return new Date(luc.getTime() + soPhut * 60_000);
}

// ---------------------------------------------------------------------------
// Che thông tin liên lạc (MK-15)
// ---------------------------------------------------------------------------

/** "0909123456" → "0909***456". Số quá ngắn thì che gần hết. */
export function cheDienThoai(s: string | null | undefined): string | null {
  if (!s) return null;
  const so = s.replace(/\D/g, "");
  if (so.length < 7) return "***";
  return `${so.slice(0, 4)}***${so.slice(-3)}`;
}

/** "nguyen.van.a@abc.vn" → "n***@abc.vn". */
export function cheEmail(s: string | null | undefined): string | null {
  if (!s) return null;
  const at = s.indexOf("@");
  if (at < 1) return "***";
  return `${s[0]}***${s.slice(at)}`;
}

// ---------------------------------------------------------------------------
// Đường dẫn công khai, UTM
// ---------------------------------------------------------------------------

/** "Khuyến mãi Camera Tết 2027!" → "khuyen-mai-camera-tet-2027". Tối đa 60 ký tự. */
export function taoSlug(s: string): string {
  return boDau(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

export function laSlugHopLe(s: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,58}[a-z0-9])?$/.test(s);
}

/** Giá trị utm_campaign so khớp không phân biệt hoa thường, bỏ dấu — người chạy quảng cáo hay gõ lệch. */
export function chuanHoaUtmCampaign(s: string | null | undefined): string | null {
  if (!s || !s.trim()) return null;
  const t = boDau(s.trim())
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[-_]+|-+$/g, "")
    .slice(0, 120);
  return t || null;
}

export type BoUtm = Record<KhoaUtm, string | null>;

/** Lấy 5 khóa UTM từ một nguồn bất kỳ (tham số URL, thân JSON), cắt 120 ký tự. */
export function docUtm(nguon: Record<string, unknown> | null | undefined): BoUtm {
  const kq = {} as BoUtm;
  for (const k of KHOA_UTM) {
    const v = nguon?.[k];
    kq[k] = typeof v === "string" && v.trim() ? v.trim().slice(0, 120) : null;
  }
  return kq;
}

// ---------------------------------------------------------------------------
// Kiểm dữ liệu gửi từ form công khai (MK-11)
// ---------------------------------------------------------------------------

export interface TruongFormCauHinh {
  khoa: KhoaTruongForm;
  nhan: string;
  batBuoc: boolean;
}

export type DuLieuForm = Partial<Record<KhoaTruongForm, string>>;

export interface KetQuaKiemForm {
  duLieu: DuLieuForm;
  loi: Record<string, string>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Chỉ nhận đúng những trường form đã khai; trường lạ bị bỏ. Cắt khoảng trắng, chặn độ dài,
 * kiểm điện thoại / email / MST, và luật chung của lead: phải có họ tên (hoặc công ty) và
 * phải có điện thoại hoặc email (LD-02).
 */
export function kiemTraDuLieuForm(truong: TruongFormCauHinh[], than: Record<string, unknown>): KetQuaKiemForm {
  const duLieu: DuLieuForm = {};
  const loi: Record<string, string> = {};
  for (const t of truong) {
    const dn = TRUONG_FORM[t.khoa];
    if (!dn) continue;
    const tho = than[t.khoa];
    const v = typeof tho === "string" ? tho.trim() : "";
    if (!v) {
      if (t.batBuoc) loi[t.khoa] = `Vui lòng nhập ${t.nhan.toLowerCase()}.`;
      continue;
    }
    if (v.length > dn.toiDa) {
      loi[t.khoa] = `${t.nhan} tối đa ${dn.toiDa} ký tự.`;
      continue;
    }
    duLieu[t.khoa] = v;
  }
  if (duLieu.dienThoai) {
    try {
      chuanHoaDienThoai(duLieu.dienThoai);
    } catch {
      loi.dienThoai = "Số điện thoại không hợp lệ.";
    }
  }
  if (duLieu.email && !EMAIL.test(duLieu.email)) loi.email = "Email không hợp lệ.";
  if (duLieu.maSoThue) {
    try {
      chuanHoaMaSoThue(duLieu.maSoThue);
    } catch {
      loi.maSoThue = "Mã số thuế phải có 10 hoặc 13 chữ số.";
    }
  }
  if (!duLieu.hoTen && !duLieu.congTy && !loi.hoTen) loi.hoTen = "Vui lòng nhập họ tên.";
  if (!duLieu.dienThoai && !duLieu.email && !loi.dienThoai && !loi.email) {
    loi[truong.some((t) => t.khoa === "dienThoai") ? "dienThoai" : "email"] = "Vui lòng nhập số điện thoại hoặc email.";
  }
  return { duLieu, loi };
}

/** Khóa so trùng của một người gửi — dùng chung cho mọi kênh nhận (MK-07). */
export function khoaNhanDien(d: { dienThoai?: string | null; email?: string | null; maSoThue?: string | null }) {
  let dienThoai: string | null = null;
  let maSoThue: string | null = null;
  try {
    dienThoai = chuanHoaDienThoai(d.dienThoai);
  } catch {
    dienThoai = null;
  }
  try {
    maSoThue = chuanHoaMaSoThue(d.maSoThue);
  } catch {
    maSoThue = null;
  }
  return { dienThoai, email: chuanHoaEmail(d.email), maSoThue };
}
