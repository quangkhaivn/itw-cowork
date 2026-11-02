import { kiemTraMauPhieu, LuocDoMauPhieu, type MauPhieu } from "./tinh-toan";

/**
 * Trình soạn mẫu phiếu thực tập dạng biểu mẫu (QĐ-131) — phần thuần, dùng chung cho giao diện và bài thử.
 * Người dùng không gõ JSON: mã (ô thông tin, tiêu chí, ô nhận xét, ô ký) tự sinh từ tên khi để trống; kết
 * quả vẫn kiểm bằng đúng `LuocDoMauPhieu` + `kiemTraMauPhieu` như máy chủ, lỗi nói bằng vị trí dễ hiểu.
 */

/** Mã không dấu từ tên tiếng Việt: chữ thường, số, gạch ngang, ≤ 30 ký tự; trùng thì thêm -2, -3… */
export function maTuTen(ten: string, daCo: ReadonlySet<string>, duPhong = "muc"): string {
  const goc =
    ten
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 26)
      .replace(/-+$/g, "") || duPhong;
  if (!daCo.has(goc)) return goc;
  for (let i = 2; ; i++) {
    const m = `${goc}-${i}`;
    if (!daCo.has(m)) return m;
  }
}

/** Đổi chỗ phần tử `i` với phần tử kế bên (lên: -1, xuống: +1). Ngoài biên → giữ nguyên. Trả mảng mới. */
export function diChuyen<T>(ds: readonly T[], i: number, huong: -1 | 1): T[] {
  const j = i + huong;
  if (i < 0 || i >= ds.length || j < 0 || j >= ds.length) return [...ds];
  const kq = [...ds];
  [kq[i], kq[j]] = [kq[j], kq[i]];
  return kq;
}

/** Điền mã còn trống từ tên (mỗi loại mã duy nhất trong mẫu). Không đổi mã đã có — phiếu cũ đã chấm theo mã. */
export function dienMaTrong(m: MauPhieu): MauPhieu {
  const dien = <T extends { ma: string }>(ds: T[], ten: (x: T) => string, duPhong: string): T[] => {
    const daCo = new Set(ds.map((x) => x.ma.trim()).filter(Boolean));
    return ds.map((x) => {
      if (x.ma.trim()) return x;
      const ma = maTuTen(ten(x), daCo, duPhong);
      daCo.add(ma);
      return { ...x, ma };
    });
  };
  const tieuChi = dien(m.phan.flatMap((p) => p.tieuChi), (t) => t.ten, "tieu-chi");
  let k = 0;
  return {
    ...m,
    thongTin: dien(m.thongTin, (t) => t.nhan, "thong-tin"),
    phan: m.phan.map((p) => ({ ...p, tieuChi: p.tieuChi.map(() => tieuChi[k++]) })),
    oNhanXet: dien(m.oNhanXet, (o) => o.nhan, "nhan-xet"),
    oKy: dien(m.oKy, (o) => o.nhan, "ky"),
  };
}

/** Tổng trọng số các tiêu chí (điểm tổng chia cho tổng này, nên không bắt buộc bằng 100). */
export function tongTrongSo(m: Pick<MauPhieu, "phan">): number {
  return Math.round(m.phan.reduce((s, p) => s + p.tieuChi.reduce((t, c) => t + (Number.isFinite(c.trongSo) ? c.trongSo : 0), 0), 0) * 100) / 100;
}

const NHAN_DUONG: Record<string, string> = {
  tieuDe: "Tiêu đề phiếu", tieuDePhu: "Tiêu đề phụ", tenDonVi: "Tên đơn vị", thongTin: "Ô thông tin", phan: "Phần", tieuChi: "Tiêu chí",
  ten: "tên", ma: "mã", nhan: "nhãn", trongSo: "trọng số", thang: "thang", nguon: "nguồn", moTa: "mô tả", thangChu: "Thang chữ",
  chu: "chữ", diem: "điểm quy đổi", tu: "ngưỡng", oNhanXet: "Ô nhận xét", oKy: "Ô ký", ghiChu: "ghi chú",
};

function moTaDuong(duong: PropertyKey[]): string {
  const ra: string[] = [];
  for (let i = 0; i < duong.length; i++) {
    const p = duong[i];
    if (typeof p === "number") ra.push(`thứ ${p + 1}`);
    else ra.push(NHAN_DUONG[String(p)] ?? String(p));
  }
  return ra.join(" ");
}

type VanDeZod = { code: string; message: string; minimum?: unknown; maximum?: unknown; origin?: string };

/** Lời nhắn tiếng Việt cho lỗi Zod (lời nhắn tự viết trong lược đồ — ví dụ của mã — giữ nguyên). */
function thongBaoVanDe(v: VanDeZod): string {
  if (/[À-ỹ]/.test(v.message)) return v.message;
  const laChuoi = v.origin === "string";
  const laMang = v.origin === "array";
  if (v.code === "too_small") return laChuoi ? (Number(v.minimum) <= 1 ? "chưa nhập" : `tối thiểu ${v.minimum} ký tự`) : laMang ? `cần ít nhất ${v.minimum} mục` : `tối thiểu ${v.minimum}`;
  if (v.code === "too_big") return laChuoi ? `tối đa ${v.maximum} ký tự` : laMang ? `tối đa ${v.maximum} mục` : `tối đa ${v.maximum}`;
  if (v.code === "invalid_type") return "chưa nhập hoặc sai kiểu";
  if (v.code === "invalid_value") return "giá trị không hợp lệ";
  return "không hợp lệ";
}

/**
 * Kiểm mẫu đang soạn đúng như máy chủ: điền mã trống → Zod → luật thêm. Trả mẫu đã chuẩn hóa (giá trị mặc
 * định của lược đồ) hoặc danh sách lỗi tiếng Việt kèm vị trí ("Phần thứ 2 Tiêu chí thứ 1 tên: …").
 */
export function kiemMauSoan(m: MauPhieu): { mau: MauPhieu | null; loi: string[] } {
  const r = LuocDoMauPhieu.safeParse(dienMaTrong(m));
  if (!r.success) return { mau: null, loi: [...new Set(r.error.issues.map((i) => `${moTaDuong(i.path)}: ${thongBaoVanDe(i as unknown as VanDeZod)}`))] };
  const them = kiemTraMauPhieu(r.data);
  return them.length ? { mau: null, loi: them } : { mau: r.data, loi: [] };
}
