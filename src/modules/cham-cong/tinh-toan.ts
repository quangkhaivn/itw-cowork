/**
 * Phần THUẦN của chấm công (0.19.0) — không chạm CSDL, có kiểm thử đơn vị (thu/don-vi/cham-cong.test.ts).
 * Luật: BUSINESS_RULES.md mục 30 (NS).
 *
 * Quy ước thời gian:
 *  - Mọi mốc là `Date` (UTC). Ngày công là chuỗi "yyyy-mm-dd" theo LỊCH GIỜ VIỆT NAM.
 *  - Việt Nam không có giờ mùa hè: lệch cố định +07:00 (cùng giả định với `dauNgayVN` ở lib/dinh-dang.ts).
 *  - Giờ trong ca là PHÚT trong ngày (0–1439); ca qua đêm thì giờ kết thúc cộng thêm 1440 khi tính.
 *
 * Không có số nghiệp vụ "nghe hợp lý" nào ở đây: mọi ngưỡng (bán kính, độ chính xác, phút cho phép
 * đi muộn, giờ đêm, trần tăng ca…) truyền vào từ Cấu hình.
 */

export const LECH_GIO_VN_PHUT = 7 * 60;
const PHUT_MS = 60_000;
const NGAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Ngày giờ theo lịch Việt Nam
// ---------------------------------------------------------------------------

const LA_NGAY = /^\d{4}-\d{2}-\d{2}$/;

export function laNgayHopLe(ngay: string): boolean {
  if (!LA_NGAY.test(ngay)) return false;
  const d = new Date(`${ngay}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ngay;
}

/** Mốc UTC của (ngày VN, phút trong ngày VN). Phút có thể ≥ 1440 (sang ngày sau) hoặc âm. */
export function mocVN(ngay: string, phut: number): Date {
  return new Date(Date.parse(`${ngay}T00:00:00.000Z`) + (phut - LECH_GIO_VN_PHUT) * PHUT_MS);
}

/** Ngày VN ("yyyy-mm-dd") chứa mốc `luc`. */
export function ngayVNCua(luc: Date): string {
  return new Date(luc.getTime() + LECH_GIO_VN_PHUT * PHUT_MS).toISOString().slice(0, 10);
}

/** Phút trong ngày VN của mốc `luc` (0–1439). */
export function phutTrongNgayVN(luc: Date): number {
  const d = new Date(luc.getTime() + LECH_GIO_VN_PHUT * PHUT_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function congNgay(ngay: string, soNgay: number): string {
  return new Date(Date.parse(`${ngay}T00:00:00.000Z`) + soNgay * NGAY_MS).toISOString().slice(0, 10);
}

/** Thứ trong tuần, 0 = thứ Hai … 6 = Chủ nhật (khớp thứ tự 7 ô của lịch tuần). */
export function thuTrongTuan(ngay: string): number {
  return (new Date(`${ngay}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

/** Mọi ngày của tháng (năm, tháng 1–12). */
export function cacNgayTrongThang(nam: number, thang: number): string[] {
  const so = new Date(Date.UTC(nam, thang, 0)).getUTCDate();
  const dau = `${nam}-${String(thang).padStart(2, "0")}-`;
  return Array.from({ length: so }, (_, i) => `${dau}${String(i + 1).padStart(2, "0")}`);
}

/** Danh sách ngày từ `tu` tới `den` (gồm cả hai đầu). Trần 400 ngày để dữ liệu hỏng không lặp mãi. */
export function cacNgayTrongKhoang(tu: string, den: string): string[] {
  const ds: string[] = [];
  for (let d = tu; d <= den && ds.length < 400; d = congNgay(d, 1)) ds.push(d);
  return ds;
}

/** "08:30" ↔ 510. */
export function gioVePhut(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const p = Number(m[2]);
  return h <= 23 && p <= 59 ? h * 60 + p : null;
}

export function phutVeGio(phut: number): string {
  const p = ((phut % 1440) + 1440) % 1440;
  return `${String(Math.floor(p / 60)).padStart(2, "0")}:${String(p % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// GPS — khoảng cách, bán kính, tốc độ (NS-11, NS-12)
// ---------------------------------------------------------------------------

export interface ToaDo {
  lat: number;
  lng: number;
}

/** Bán kính trung bình Trái Đất (IUGG), mét. */
const BAN_KINH_TRAI_DAT_M = 6_371_008.8;

/** Khoảng cách theo đường tròn lớn (haversine), mét. */
export function khoangCachMet(a: ToaDo, b: ToaDo): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * BAN_KINH_TRAI_DAT_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface DiaDiemGps extends ToaDo {
  id: string;
  ten: string;
  /** Bán kính riêng của địa điểm; null = dùng mặc định Cấu hình. */
  banKinhM: number | null;
}

export interface KetQuaViTri {
  /** Nằm trong bán kính của ít nhất một địa điểm. */
  trongVung: boolean;
  /** Địa điểm trong vùng gần nhất, hoặc gần nhất nếu ngoài mọi vùng. */
  diaDiem: { id: string; ten: string; khoangCachM: number; banKinhM: number } | null;
  co: string[];
}

export const CO = {
  doChinhXacThap: "do-chinh-xac-thap",
  tocDoBatThuong: "toc-do-bat-thuong",
  thieuQuyenViTri: "thieu-quyen-vi-tri",
  gioMayLech: "gio-may-lech",
} as const;

/**
 * Đánh giá một vị trí GPS so với các địa điểm làm việc (NS-11). `viTri = null` = trình duyệt không
 * cho lấy vị trí (người dùng từ chối quyền, máy không hỗ trợ, hết giờ) → ngoài vùng + cờ thiếu quyền.
 * Độ chính xác kém hơn ngưỡng vẫn tính trong / ngoài vùng như thường nhưng gắn cờ để quản lý xem.
 */
export function danhGiaViTri(
  viTri: (ToaDo & { doChinhXacM: number | null }) | null,
  diaDiems: DiaDiemGps[],
  cauHinh: { banKinhMacDinhM: number; doChinhXacToiDaM: number },
): KetQuaViTri {
  if (!viTri) return { trongVung: false, diaDiem: null, co: [CO.thieuQuyenViTri] };
  const co: string[] = [];
  if (viTri.doChinhXacM === null || viTri.doChinhXacM > cauHinh.doChinhXacToiDaM) co.push(CO.doChinhXacThap);

  let gan: KetQuaViTri["diaDiem"] = null;
  let ganTrong: KetQuaViTri["diaDiem"] = null;
  for (const d of diaDiems) {
    const kc = khoangCachMet(viTri, d);
    const bk = d.banKinhM ?? cauHinh.banKinhMacDinhM;
    const muc = { id: d.id, ten: d.ten, khoangCachM: Math.round(kc), banKinhM: bk };
    if (!gan || kc < gan.khoangCachM) gan = muc;
    if (kc <= bk && (!ganTrong || kc < ganTrong.khoangCachM)) ganTrong = muc;
  }
  return { trongVung: Boolean(ganTrong), diaDiem: ganTrong ?? gan, co };
}

/**
 * Tốc độ di chuyển "ít nhất phải có" giữa hai lần chấm (km/h): khoảng cách TRỪ sai số của cả hai
 * điểm (để rung GPS tại chỗ không thành "chạy 200 km/h"). Cùng thời điểm thì coi như 1 giây.
 */
export function tocDoToiThieuKmh(
  a: ToaDo & { luc: Date; doChinhXacM?: number | null },
  b: ToaDo & { luc: Date; doChinhXacM?: number | null },
): number {
  const kc = Math.max(0, khoangCachMet(a, b) - (a.doChinhXacM ?? 0) - (b.doChinhXacM ?? 0));
  const giay = Math.max(1, Math.abs(b.luc.getTime() - a.luc.getTime()) / 1000);
  return (kc / giay) * 3.6;
}

/** Đường dẫn "Xem trên bản đồ" — Google Maps theo toạ độ, không nhúng thư viện bản đồ nào. */
export function duongDanBanDo(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** Bấm trùng: lần chấm trước cùng người cách chưa tới `giay` giây thì bỏ qua (NS-13). */
export function laBamTrung(truoc: Date | null, bayGio: Date, giay: number): boolean {
  return truoc !== null && bayGio.getTime() - truoc.getTime() >= 0 && bayGio.getTime() - truoc.getTime() < giay * 1000;
}

// ---------------------------------------------------------------------------
// Ca, lịch tuần, công dự kiến (NS-06 → NS-08)
// ---------------------------------------------------------------------------

export const PHAN_NGAY = ["ca", "sang", "chieu", "nghi"] as const;
export type PhanNgay = (typeof PHAN_NGAY)[number];
export const NHAN_PHAN_NGAY: Record<PhanNgay, string> = { ca: "Cả ca", sang: "Nửa ca sáng", chieu: "Nửa ca chiều", nghi: "Nghỉ" };

export type LoaiNgay = "thuong" | "nghi-tuan" | "le";
export const NHAN_LOAI_NGAY: Record<LoaiNgay, string> = { thuong: "Ngày thường", "nghi-tuan": "Nghỉ hằng tuần", le: "Ngày lễ" };

export interface CaLam {
  batDauPhut: number;
  ketThucPhut: number;
  nghiBatDauPhut: number | null;
  nghiPhut: number;
  /** Phút cho phép đi muộn / về sớm của riêng ca; null = mặc định Cấu hình. */
  choPhepMuonPhut: number | null;
  choPhepSomPhut: number | null;
}

/** Ca qua nửa đêm khi giờ kết thúc ≤ giờ bắt đầu (22:00 → 06:00). */
export function laCaQuaDem(ca: Pick<CaLam, "batDauPhut" | "ketThucPhut">): boolean {
  return ca.ketThucPhut <= ca.batDauPhut;
}

/** Phút làm việc thực của cả ca (trừ nghỉ giữa ca). */
export function phutLamCuaCa(ca: CaLam): number {
  const ket = ca.ketThucPhut + (laCaQuaDem(ca) ? 1440 : 0);
  return Math.max(0, ket - ca.batDauPhut - ca.nghiPhut);
}

interface KhoangPhut {
  batDau: number;
  ketThuc: number;
}

/**
 * Chia ca thành nửa sáng / nửa chiều (phút tính từ 0h ngày bắt đầu ca). Có giờ nghỉ giữa ca thì
 * cắt ở đó; không có thì chia đôi phần làm việc.
 */
export function chiaNuaCa(ca: CaLam): { ca: KhoangPhut; sang: KhoangPhut; chieu: KhoangPhut } {
  const bd = ca.batDauPhut;
  const kt = ca.ketThucPhut + (laCaQuaDem(ca) ? 1440 : 0);
  let nghiBd: number;
  if (ca.nghiBatDauPhut !== null) {
    nghiBd = ca.nghiBatDauPhut;
    if (nghiBd < bd) nghiBd += 1440; // giờ nghỉ của ca qua đêm rơi vào ngày sau
    if (nghiBd > kt) nghiBd = bd + Math.floor((kt - bd - ca.nghiPhut) / 2);
  } else {
    nghiBd = bd + Math.floor((kt - bd - ca.nghiPhut) / 2);
  }
  const nghiKt = Math.min(kt, nghiBd + ca.nghiPhut);
  return { ca: { batDau: bd, ketThuc: kt }, sang: { batDau: bd, ketThuc: nghiBd }, chieu: { batDau: nghiKt, ketThuc: kt } };
}

export interface KhoangGio {
  batDau: Date;
  ketThuc: Date;
}

export interface CongDuKien {
  ngay: string;
  loaiNgay: LoaiNgay;
  phan: PhanNgay;
  /** Giá trị công phải làm: 1 · 0,5 · 0. */
  giaTri: number;
  /** Khoảng phải có mặt (cả ca hoặc nửa ca); null khi không có ca. */
  khoang: KhoangGio | null;
  /** Hai nửa của cả ca — để tính công khi nghỉ phép nửa ngày. Null khi không có ca. */
  nuaSang: KhoangGio | null;
  nuaChieu: KhoangGio | null;
  nghiPhut: number;
  choPhepMuonPhut: number | null;
  choPhepSomPhut: number | null;
  coLich: boolean;
}

function veKhoang(ngay: string, k: KhoangPhut): KhoangGio {
  return { batDau: mocVN(ngay, k.batDau), ketThuc: mocVN(ngay, k.ketThuc) };
}

/**
 * Công dự kiến của một ngày (NS-08). `lichNgay` = 7 ô của lịch tuần (thứ Hai trước); null = người đó
 * chưa được gán lịch. Ngày lễ: không phải làm, loại ngày "le" (tăng ca ngày lễ tính riêng).
 */
export function congDuKien(ngay: string, ca: CaLam | null, lichNgay: readonly PhanNgay[] | null, laNgayLe: boolean): CongDuKien {
  const coLich = Boolean(ca && lichNgay && lichNgay.length === 7);
  const phanLich: PhanNgay = coLich ? lichNgay![thuTrongTuan(ngay)] ?? "nghi" : "nghi";
  const choPhep = { choPhepMuonPhut: ca?.choPhepMuonPhut ?? null, choPhepSomPhut: ca?.choPhepSomPhut ?? null };
  const loaiNgay: LoaiNgay = laNgayLe ? "le" : coLich && phanLich === "nghi" ? "nghi-tuan" : "thuong";
  if (!ca || !coLich || phanLich === "nghi" || laNgayLe) {
    // Ngày nghỉ tuần / ngày lễ vẫn giữ khung ca để tính tăng ca theo ca (nếu có).
    const nua = ca && coLich ? chiaNuaCa(ca) : null;
    return {
      ngay,
      loaiNgay,
      phan: "nghi",
      giaTri: 0,
      khoang: null,
      nuaSang: nua ? veKhoang(ngay, nua.sang) : null,
      nuaChieu: nua ? veKhoang(ngay, nua.chieu) : null,
      nghiPhut: ca?.nghiPhut ?? 0,
      ...choPhep,
      coLich,
    };
  }
  const nua = chiaNuaCa(ca);
  const k = phanLich === "ca" ? nua.ca : phanLich === "sang" ? nua.sang : nua.chieu;
  return {
    ngay,
    loaiNgay,
    phan: phanLich,
    giaTri: phanLich === "ca" ? 1 : 0.5,
    khoang: veKhoang(ngay, k),
    nuaSang: veKhoang(ngay, nua.sang),
    nuaChieu: veKhoang(ngay, nua.chieu),
    nghiPhut: phanLich === "ca" ? ca.nghiPhut : 0,
    ...choPhep,
    coLich,
  };
}

/**
 * Ghép lần chấm vào NGÀY CÔNG (NS-09). Mỗi lần chấm thuộc ngày có khung ca chứa nó — khung = [bắt đầu
 * ca − `truocPhut`, kết thúc ca + `sauPhut`]; nhiều khung cùng chứa thì chọn ca gần nhất. Không khung
 * nào chứa thì thuộc ngày lịch VN của chính nó (làm ngày nghỉ, chưa có lịch). Nhờ vậy ca 22:00 → 06:00
 * ghép lần ra ca lúc 06:05 sáng hôm sau về đúng ngày bắt đầu ca.
 */
export function ganNgayCong(
  lanCham: Date[],
  cacNgay: { ngay: string; khoang: KhoangGio | null }[],
  truocPhut: number,
  sauPhut: number,
): Map<string, Date[]> {
  const kq = new Map<string, Date[]>();
  for (const luc of lanCham) {
    let chon: string | null = null;
    let tot = Infinity;
    for (const d of cacNgay) {
      if (!d.khoang) continue;
      const bd = d.khoang.batDau.getTime();
      const kt = d.khoang.ketThuc.getTime();
      const t = luc.getTime();
      if (t < bd - truocPhut * PHUT_MS || t > kt + sauPhut * PHUT_MS) continue;
      const lech = t < bd ? bd - t : t > kt ? t - kt : 0;
      if (lech < tot) {
        tot = lech;
        chon = d.ngay;
      }
    }
    const ngay = chon ?? ngayVNCua(luc);
    const ds = kq.get(ngay) ?? [];
    ds.push(luc);
    kq.set(ngay, ds);
  }
  for (const ds of kq.values()) ds.sort((a, b) => a.getTime() - b.getTime());
  return kq;
}

// ---------------------------------------------------------------------------
// Đi muộn, về sớm, giá trị công (NS-08)
// ---------------------------------------------------------------------------

/**
 * Phút đi muộn. Trong khoảng cho phép → 0; vượt → tính TOÀN BỘ số phút muộn (vào 08:20 với cho phép
 * 5 phút = muộn 20 phút, không phải 15). Chưa vào / không có ca → 0.
 */
export function phutDiMuon(vaoLuc: Date | null, batDau: Date | null, choPhepPhut: number): number {
  if (!vaoLuc || !batDau) return 0;
  const p = Math.floor((vaoLuc.getTime() - batDau.getTime()) / PHUT_MS);
  return p > choPhepPhut ? p : 0;
}

/** Phút về sớm, cùng cách tính với đi muộn. */
export function phutVeSom(raLuc: Date | null, ketThuc: Date | null, choPhepPhut: number): number {
  if (!raLuc || !ketThuc) return 0;
  const p = Math.floor((ketThuc.getTime() - raLuc.getTime()) / PHUT_MS);
  return p > choPhepPhut ? p : 0;
}

export interface NghiTrongNgay {
  /** 1 = nghỉ cả ngày, 0,5 = nửa ngày. */
  giaTri: number;
  phan: "ca-ngay" | "sang" | "chieu";
  maLoai: string;
  coLuong: boolean;
}

export interface CongNgay {
  vaoDau: Date | null;
  raCuoi: Date | null;
  giaTriCong: number;
  phutMuon: number;
  phutSom: number;
  nghiNgay: number;
  co: string[];
}

/**
 * Công thực tế của một ngày (NS-08):
 *  - phần phải làm = công dự kiến − phần nghỉ phép đã duyệt;
 *  - có cả giờ vào lẫn giờ ra (hai lần chấm khác nhau) → đủ công phần phải làm, ghi phút muộn / sớm;
 *  - chỉ một lần chấm → 0 công, cờ thiếu chấm vào / ra (nhân viên giải trình để được chấm bù);
 *  - không chấm → 0 công, cờ vắng mặt.
 * Đi muộn / về sớm KHÔNG tự trừ công — số phút được ghi để tính lương theo quy chế (NS-08).
 */
export function tinhCongNgay(
  duKien: CongDuKien,
  lanCham: Date[],
  nghi: NghiTrongNgay | null,
  macDinh: { choPhepMuonPhut: number; choPhepSomPhut: number },
): CongNgay {
  const ds = [...lanCham].sort((a, b) => a.getTime() - b.getTime());
  const vaoDau = ds[0] ?? null;
  const cuoi = ds.length > 1 ? ds[ds.length - 1] : null;
  const raCuoi = cuoi && vaoDau && cuoi.getTime() - vaoDau.getTime() >= PHUT_MS ? cuoi : null;
  const co: string[] = [];

  const nghiNgay = nghi ? Math.min(nghi.giaTri, duKien.giaTri) : 0;
  const canLam = Math.max(0, duKien.giaTri - (nghi ? nghi.giaTri : 0));
  if (canLam === 0) {
    if (nghi && ds.length > 0) co.push("cham-cong-ngay-nghi-phep");
    if (!duKien.coLich && ds.length > 0) co.push("chua-co-lich");
    return { vaoDau, raCuoi, giaTriCong: 0, phutMuon: 0, phutSom: 0, nghiNgay, co };
  }

  // Khoảng phải có mặt sau khi trừ nửa ngày nghỉ.
  let khoang = duKien.khoang;
  if (nghi && nghi.giaTri < duKien.giaTri && duKien.phan === "ca") {
    khoang = nghi.phan === "sang" ? duKien.nuaChieu : duKien.nuaSang;
  }

  if (ds.length === 0) {
    co.push("vang-mat");
    return { vaoDau: null, raCuoi: null, giaTriCong: 0, phutMuon: 0, phutSom: 0, nghiNgay, co };
  }
  if (!raCuoi) {
    // Một lần chấm: gần giờ vào hay giờ ra hơn thì thiếu phía còn lại.
    const t = vaoDau!.getTime();
    const ganVao = !khoang || Math.abs(t - khoang.batDau.getTime()) <= Math.abs(t - khoang.ketThuc.getTime());
    co.push(ganVao ? "thieu-cham-ra" : "thieu-cham-vao");
    return {
      vaoDau: ganVao ? vaoDau : null,
      raCuoi: ganVao ? null : vaoDau,
      giaTriCong: 0,
      phutMuon: ganVao && khoang ? phutDiMuon(vaoDau, khoang.batDau, duKien.choPhepMuonPhut ?? macDinh.choPhepMuonPhut) : 0,
      phutSom: !ganVao && khoang ? phutVeSom(vaoDau, khoang.ketThuc, duKien.choPhepSomPhut ?? macDinh.choPhepSomPhut) : 0,
      nghiNgay,
      co,
    };
  }
  const phutMuon = khoang ? phutDiMuon(vaoDau, khoang.batDau, duKien.choPhepMuonPhut ?? macDinh.choPhepMuonPhut) : 0;
  const phutSom = khoang ? phutVeSom(raCuoi, khoang.ketThuc, duKien.choPhepSomPhut ?? macDinh.choPhepSomPhut) : 0;
  if (phutMuon > 0) co.push("di-muon");
  if (phutSom > 0) co.push("ve-som");
  return { vaoDau, raCuoi, giaTriCong: canLam, phutMuon, phutSom, nghiNgay, co };
}

// ---------------------------------------------------------------------------
// Tăng ca (NS-40 → NS-43)
// ---------------------------------------------------------------------------

export interface KhungDem {
  /** Giờ bắt đầu / kết thúc giờ đêm (0–23), từ Cấu hình. */
  batDauGio: number;
  ketThucGio: number;
}

/** Số phút giao giữa [a, b] và các khung giờ đêm quanh ngày `ngay`. */
export function phutGiaoDem(a: Date, b: Date, ngay: string, dem: KhungDem): number {
  if (b <= a) return 0;
  let tong = 0;
  for (let i = -1; i <= 2; i++) {
    const d = congNgay(ngay, i);
    const bd = mocVN(d, dem.batDauGio * 60);
    const kt = dem.ketThucGio * 60 > dem.batDauGio * 60 ? mocVN(d, dem.ketThucGio * 60) : mocVN(d, 1440 + dem.ketThucGio * 60);
    const s = Math.max(a.getTime(), bd.getTime());
    const e = Math.min(b.getTime(), kt.getTime());
    if (e > s) tong += e - s;
  }
  return Math.round(tong / PHUT_MS);
}

export interface KetQuaTangCa {
  loaiNgay: LoaiNgay;
  /** Phút làm thêm thực tế theo lần chấm (chưa áp trần duyệt). */
  phutThucTe: number;
  /** Phút được tính = min(thực tế, giờ đã duyệt). Chưa duyệt → 0. */
  phut: number;
  phutDem: number;
}

/**
 * Giờ tăng ca từ lần chấm (NS-41):
 *  - ngày thường có ca: phần làm SAU giờ kết thúc ca (đến sớm không tính tăng ca);
 *  - ngày nghỉ tuần / ngày lễ / ngày không có ca: cả khoảng vào → ra, trừ nghỉ giữa ca nếu khoảng đó
 *    phủ trọn giờ nghỉ của ca;
 *  - chỉ tính khi có đơn tăng ca đã duyệt, tối đa đúng số giờ duyệt (cắt từ đầu khoảng làm thêm);
 *  - phần rơi vào khung giờ đêm (Cấu hình) tách riêng.
 */
export function tinhTangCa(
  duKien: CongDuKien,
  vaoDau: Date | null,
  raCuoi: Date | null,
  gioDuyet: number | null,
  dem: KhungDem,
): KetQuaTangCa {
  const rong = { loaiNgay: duKien.loaiNgay, phutThucTe: 0, phut: 0, phutDem: 0 };
  if (!vaoDau || !raCuoi || raCuoi <= vaoDau) return rong;

  let bd: Date;
  let truNghi = 0;
  if (duKien.giaTri > 0 && duKien.khoang) {
    if (raCuoi <= duKien.khoang.ketThuc) return rong;
    bd = vaoDau > duKien.khoang.ketThuc ? vaoDau : duKien.khoang.ketThuc;
  } else {
    bd = vaoDau;
    if (duKien.nuaSang && duKien.nuaChieu && duKien.nghiPhut >= 0) {
      const nghiBd = duKien.nuaSang.ketThuc;
      const nghiKt = duKien.nuaChieu.batDau;
      if (vaoDau <= nghiBd && raCuoi >= nghiKt) truNghi = Math.round((nghiKt.getTime() - nghiBd.getTime()) / PHUT_MS);
    }
  }
  const phutThucTe = Math.max(0, Math.floor((raCuoi.getTime() - bd.getTime()) / PHUT_MS) - truNghi);
  if (!gioDuyet || gioDuyet <= 0) return { ...rong, phutThucTe };
  const phut = Math.min(phutThucTe, Math.round(gioDuyet * 60));
  const kt = new Date(bd.getTime() + (phut + truNghi) * PHUT_MS);
  const phutDem = Math.min(phut, phutGiaoDem(bd, kt > raCuoi ? raCuoi : kt, duKien.ngay, dem));
  return { loaiNgay: duKien.loaiNgay, phutThucTe, phut, phutDem };
}

export type MucCanhBaoTangCa = "vuot" | "gan" | null;

/**
 * Cảnh báo trần tăng ca tháng / năm (NS-43). Trần lấy từ Cấu hình; chưa đặt → không cảnh báo
 * (hệ thống không tự chọn con số pháp lý). "Gần" = đạt `phanTramCanhBao`% trần.
 */
export function canhBaoTangCa(
  phutDaDung: number,
  phutThem: number,
  tranGio: number | null,
  phanTramCanhBao: number,
): { muc: MucCanhBaoTangCa; gioSau: number; tranGio: number | null } {
  const gioSau = Math.round(((phutDaDung + phutThem) / 60) * 100) / 100;
  if (tranGio === null || tranGio <= 0) return { muc: null, gioSau, tranGio: null };
  if (gioSau > tranGio) return { muc: "vuot", gioSau, tranGio };
  if (gioSau >= (tranGio * phanTramCanhBao) / 100) return { muc: "gan", gioSau, tranGio };
  return { muc: null, gioSau, tranGio };
}

// ---------------------------------------------------------------------------
// Bảng công tháng (NS-50 → NS-54)
// ---------------------------------------------------------------------------

export interface DongCongThang {
  userId: string;
  ngay: string;
  laDieuChinh: boolean;
  loaiNgay: LoaiNgay;
  congDuKien: number;
  congThucTe: number;
  phutMuon: number;
  phutSom: number;
  nghiNgay: number;
  nghiCoLuong: boolean;
  phutTangCa: number;
  phutTangCaDem: number;
  co: string[];
}

export interface TongHopNguoi {
  userId: string;
  congDuKien: number;
  congThucTe: number;
  nghiCoLuong: number;
  nghiKhongLuong: number;
  soLanMuon: number;
  phutMuon: number;
  soLanSom: number;
  phutSom: number;
  tangCaThuongPhut: number;
  tangCaNghiTuanPhut: number;
  tangCaLePhut: number;
  tangCaDemPhut: number;
  soNgayCo: number;
  soDongDieuChinh: number;
}

const lam1 = (x: number) => Math.round(x * 10) / 10;

/** Tổng hợp tháng theo người. Dòng điều chỉnh (chênh lệch so với kỳ đã khóa) cộng thẳng vào tổng. */
export function tongHopThang(dong: DongCongThang[]): TongHopNguoi[] {
  const theoNguoi = new Map<string, TongHopNguoi>();
  for (const d of dong) {
    const t =
      theoNguoi.get(d.userId) ??
      {
        userId: d.userId, congDuKien: 0, congThucTe: 0, nghiCoLuong: 0, nghiKhongLuong: 0, soLanMuon: 0, phutMuon: 0,
        soLanSom: 0, phutSom: 0, tangCaThuongPhut: 0, tangCaNghiTuanPhut: 0, tangCaLePhut: 0, tangCaDemPhut: 0,
        soNgayCo: 0, soDongDieuChinh: 0,
      };
    t.congDuKien = lam1(t.congDuKien + d.congDuKien);
    t.congThucTe = lam1(t.congThucTe + d.congThucTe);
    if (d.nghiNgay !== 0) {
      if (d.nghiCoLuong) t.nghiCoLuong = lam1(t.nghiCoLuong + d.nghiNgay);
      else t.nghiKhongLuong = lam1(t.nghiKhongLuong + d.nghiNgay);
    }
    t.phutMuon += d.phutMuon;
    t.phutSom += d.phutSom;
    if (!d.laDieuChinh && d.phutMuon > 0) t.soLanMuon += 1;
    if (!d.laDieuChinh && d.phutSom > 0) t.soLanSom += 1;
    if (d.loaiNgay === "le") t.tangCaLePhut += d.phutTangCa;
    else if (d.loaiNgay === "nghi-tuan") t.tangCaNghiTuanPhut += d.phutTangCa;
    else t.tangCaThuongPhut += d.phutTangCa;
    t.tangCaDemPhut += d.phutTangCaDem;
    if (!d.laDieuChinh && d.co.length > 0) t.soNgayCo += 1;
    if (d.laDieuChinh) t.soDongDieuChinh += 1;
    theoNguoi.set(d.userId, t);
  }
  return [...theoNguoi.values()];
}

/** Các trường số của một dòng công, để so với số đã khóa và sinh dòng điều chỉnh (NS-53). */
export type SoLieuCong = Pick<DongCongThang, "congDuKien" | "congThucTe" | "phutMuon" | "phutSom" | "nghiNgay" | "phutTangCa" | "phutTangCaDem">;

/** Chênh lệch `moi − daKhoa`; null nếu không có gì khác. */
export function chenhLechCong(moi: SoLieuCong, daKhoa: SoLieuCong): SoLieuCong | null {
  const kq: SoLieuCong = {
    congDuKien: lam1(moi.congDuKien - daKhoa.congDuKien),
    congThucTe: lam1(moi.congThucTe - daKhoa.congThucTe),
    phutMuon: moi.phutMuon - daKhoa.phutMuon,
    phutSom: moi.phutSom - daKhoa.phutSom,
    nghiNgay: lam1(moi.nghiNgay - daKhoa.nghiNgay),
    phutTangCa: moi.phutTangCa - daKhoa.phutTangCa,
    phutTangCaDem: moi.phutTangCaDem - daKhoa.phutTangCaDem,
  };
  return Object.values(kq).every((v) => v === 0) ? null : kq;
}

/** Cộng dồn số liệu (dòng đã khóa + các dòng điều chỉnh trước đó). */
export function congSoLieu(a: SoLieuCong, b: SoLieuCong): SoLieuCong {
  return {
    congDuKien: lam1(a.congDuKien + b.congDuKien),
    congThucTe: lam1(a.congThucTe + b.congThucTe),
    phutMuon: a.phutMuon + b.phutMuon,
    phutSom: a.phutSom + b.phutSom,
    nghiNgay: lam1(a.nghiNgay + b.nghiNgay),
    phutTangCa: a.phutTangCa + b.phutTangCa,
    phutTangCaDem: a.phutTangCaDem + b.phutTangCaDem,
  };
}

/** Còn trong hạn phản hồi bảng công nháp không (NS-51). */
export function conHanPhanHoi(hanPhanHoi: Date, bayGio: Date): boolean {
  return bayGio.getTime() <= hanPhanHoi.getTime();
}

// ---------------------------------------------------------------------------
// Trạng thái trực tiếp hôm nay (NS-60)
// ---------------------------------------------------------------------------

export type TrangThaiHomNay =
  | "nghi-phep"
  | "hien-truong"
  | "da-ra-ca"
  | "di-muon"
  | "da-vao-ca"
  | "chua-den"
  | "chua-toi-gio"
  | "khong-co-ca";

export const NHAN_TRANG_THAI_HOM_NAY: Record<TrangThaiHomNay, string> = {
  "nghi-phep": "Nghỉ phép",
  "hien-truong": "Đang ở hiện trường",
  "da-ra-ca": "Đã ra ca",
  "di-muon": "Đi muộn",
  "da-vao-ca": "Đã vào ca",
  "chua-den": "Chưa đến",
  "chua-toi-gio": "Chưa tới giờ vào ca",
  "khong-co-ca": "Không có ca hôm nay",
};

/**
 * Trạng thái một người lúc `bayGio`. Lần chấm cuối có hướng `ra` (hoặc đã quá giờ kết thúc ca mà có
 * ≥ 2 lần chấm) → đã ra ca. Lần chấm GPS "hiện trường" gần nhất → đang ở hiện trường.
 */
export function trangThaiHomNay(
  duKien: CongDuKien,
  lanCham: { luc: Date; huong: "vao" | "ra" | null; ketQuaGps: string | null }[],
  nghiCaNgay: boolean,
  bayGio: Date,
  choPhepMuonPhut: number,
): TrangThaiHomNay {
  const ds = [...lanCham].sort((a, b) => a.luc.getTime() - b.luc.getTime());
  const cuoi = ds[ds.length - 1];
  if (nghiCaNgay && ds.length === 0) return "nghi-phep";
  if (cuoi) {
    const daRa = cuoi.huong === "ra" || (ds.length >= 2 && cuoi.huong === null && duKien.khoang !== null && cuoi.luc >= duKien.khoang.ketThuc);
    if (daRa) return "da-ra-ca";
    if (cuoi.ketQuaGps === "hien-truong") return "hien-truong";
    const muon = phutDiMuon(ds[0].luc, duKien.khoang?.batDau ?? null, duKien.choPhepMuonPhut ?? choPhepMuonPhut);
    return muon > 0 ? "di-muon" : "da-vao-ca";
  }
  if (nghiCaNgay) return "nghi-phep";
  if (!duKien.khoang || duKien.giaTri === 0) return "khong-co-ca";
  return bayGio < duKien.khoang.batDau ? "chua-toi-gio" : "chua-den";
}
