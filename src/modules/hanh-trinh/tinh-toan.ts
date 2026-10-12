import { MOC_KEO_LAI } from "./moc";

/**
 * Phần THUẦN của hành trình khách hàng — có kiểm thử đơn vị (thu/don-vi/khach-nang-cao.test.ts).
 */

export interface TrangThaiGon {
  id: string;
  sortOrder: number;
  kind: string;
}

/**
 * Có tự chuyển khách sang `dich` khi mốc `moc` xảy ra không (KHN-04).
 *
 *   - Chỉ TIẾN, không bao giờ lùi: đích phải đứng sau trạng thái hiện tại trong thứ tự.
 *   - Khách chưa có trạng thái → nhận ngay.
 *   - Khách ở trạng thái "thất bại" → chỉ mốc mạnh (MOC_KEO_LAI) mới kéo lại.
 *   - Không đổi sang chính trạng thái đang đứng.
 */
export function coTuChuyen(hienTai: TrangThaiGon | null, dich: TrangThaiGon, moc: string): boolean {
  if (dich.kind === "that-bai") return false;
  if (!hienTai) return true;
  if (hienTai.id === dich.id) return false;
  if (hienTai.kind === "that-bai") return MOC_KEO_LAI.includes(moc);
  return dich.sortOrder > hienTai.sortOrder;
}

/** Tỷ lệ phần trăm làm tròn 1 số lẻ; mẫu số 0 → null (không phải 0%). */
export function tyLe(tu: number, mau: number): number | null {
  if (!mau) return null;
  return Math.round((tu * 1000) / mau) / 10;
}

export interface BuocPheu {
  id: string;
  ten: string;
  sortOrder: number;
  kind: string;
}

export interface KhachPheu {
  id: string;
  taoLuc: Date;
  hienTaiId: string | null;
  /** Các lần đổi trạng thái, theo thứ tự thời gian. */
  lichSu: { sangId: string | null; luc: Date }[];
}

export interface KetQuaBuoc {
  id: string;
  ten: string;
  kind: string;
  soDat: number;
  /** % trên tổng số khách trong kỳ. */
  tyLeTrenTong: number | null;
  /** % so với bước liền trước (bước đầu: so với tổng). */
  tyLeTuBuocTruoc: number | null;
  /** Số ngày trung bình từ lúc tạo khách tới lần đầu chạm bước này; chưa ai chạm → null. */
  soNgayTrungBinh: number | null;
}

export interface KetQuaPheu {
  tong: number;
  buoc: KetQuaBuoc[];
  soThanhCong: number;
  tyLeThanhCong: number | null;
  soThatBai: number;
  theoThatBai: { id: string; ten: string; so: number }[];
}

/**
 * Phễu chuyển đổi theo lịch sử (KHN-06). Mỗi khách tính **bước xa nhất từng chạm** (theo lịch sử,
 * cộng trạng thái hiện tại) — khách đã qua "Đã báo giá" rồi bị đánh "Ngừng quan tâm" vẫn được
 * tính là đã tới bước báo giá. Trạng thái "thất bại" không phải bước của phễu.
 */
export function tinhPheu(cacTrangThai: BuocPheu[], khach: KhachPheu[]): KetQuaPheu {
  const theoId = new Map(cacTrangThai.map((t) => [t.id, t]));
  const buoc = cacTrangThai.filter((t) => t.kind !== "that-bai").sort((a, b) => a.sortOrder - b.sortOrder);

  const tungKhach = khach.map((k) => {
    let xaNhat = -Infinity;
    let thanhCong = false;
    const lanDau = new Map<string, number>();
    const cham = (id: string | null, luc: Date) => {
      const t = id ? theoId.get(id) : undefined;
      if (!t || t.kind === "that-bai") return;
      if (t.kind === "thanh-cong") thanhCong = true;
      if (t.sortOrder > xaNhat) xaNhat = t.sortOrder;
      for (const b of buoc) if (b.sortOrder <= t.sortOrder && !lanDau.has(b.id)) lanDau.set(b.id, luc.getTime());
    };
    for (const l of [...k.lichSu].sort((a, b) => a.luc.getTime() - b.luc.getTime())) cham(l.sangId, l.luc);
    cham(k.hienTaiId, k.taoLuc);
    const ht = k.hienTaiId ? theoId.get(k.hienTaiId) : undefined;
    return { k, xaNhat, thanhCong, lanDau, thatBai: ht?.kind === "that-bai" ? ht : null };
  });

  const tong = khach.length;
  const ketQuaBuoc: KetQuaBuoc[] = buoc.map((b, i) => {
    const dat = tungKhach.filter((x) => x.xaNhat >= b.sortOrder);
    const truoc = i === 0 ? tong : tungKhach.filter((x) => x.xaNhat >= buoc[i - 1].sortOrder).length;
    const ngay = dat
      .map((x) => {
        const luc = x.lanDau.get(b.id);
        return luc === undefined ? null : (luc - x.k.taoLuc.getTime()) / 86_400_000;
      })
      .filter((n): n is number => n !== null && n >= 0);
    return {
      id: b.id,
      ten: b.ten,
      kind: b.kind,
      soDat: dat.length,
      tyLeTrenTong: tyLe(dat.length, tong),
      tyLeTuBuocTruoc: tyLe(dat.length, truoc),
      soNgayTrungBinh: ngay.length ? Math.round((ngay.reduce((s, n) => s + n, 0) / ngay.length) * 10) / 10 : null,
    };
  });

  const demThatBai = new Map<string, { id: string; ten: string; so: number }>();
  for (const x of tungKhach) {
    if (!x.thatBai) continue;
    const cu = demThatBai.get(x.thatBai.id) ?? { id: x.thatBai.id, ten: x.thatBai.ten, so: 0 };
    cu.so += 1;
    demThatBai.set(x.thatBai.id, cu);
  }
  const soThanhCong = tungKhach.filter((x) => x.thanhCong).length;
  return {
    tong,
    buoc: ketQuaBuoc,
    soThanhCong,
    tyLeThanhCong: tyLe(soThanhCong, tong),
    soThatBai: tungKhach.filter((x) => x.thatBai).length,
    theoThatBai: [...demThatBai.values()].sort((a, b) => b.so - a.so),
  };
}

/** Khách đã đứng ở trạng thái hiện tại bao nhiêu ngày (theo ngày lịch, giờ Việt Nam do người gọi quy đổi). */
export function soNgayDung(tuNgay: string, homNay: string): number {
  const a = Date.parse(`${tuNgay}T00:00:00Z`);
  const b = Date.parse(`${homNay}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Đứng lâu = có ngưỡng và số ngày đứng ≥ ngưỡng (KHN-14). Ngưỡng null = không nhắc. */
export function laDungLau(soNgay: number, nguong: number | null): boolean {
  return nguong !== null && nguong > 0 && soNgay >= nguong;
}
