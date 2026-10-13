/**
 * Tham số chọn người nhận email trên màn hình — dùng chung cho trang (Server Component) và
 * ô chọn (Client Component), nên KHÔNG đặt trong tệp "use client".
 */
export interface ThamSoLoc {
  /** "phan-khuc" = nguồn phân khúc của gói Marketing; còn lại là nguồn "loc-don-gian". */
  doiTuong: "lead" | "lien-he" | "phan-khuc";
  giaiDoan: string[];
  nguon: string[];
  phanKhuc: string[];
  nganh: string[];
  phanKhucId?: string;
  tenPhanKhuc?: string;
}

export interface PhanKhucChon {
  id: string;
  ten: string;
  doiTuong: "lead" | "lien-he";
}

/** Tách lựa chọn trên màn hình thành `{ nguon, thamSo }` gửi lên API chiến dịch email. */
export function nguonVaThamSo(t: ThamSoLoc): { nguon: string; thamSo: Record<string, unknown> } {
  if (t.doiTuong === "phan-khuc") return { nguon: "phan-khuc", thamSo: { phanKhucId: t.phanKhucId ?? "", tenPhanKhuc: t.tenPhanKhuc ?? "" } };
  return { nguon: "loc-don-gian", thamSo: { doiTuong: t.doiTuong, giaiDoan: t.giaiDoan, nguon: t.nguon, phanKhuc: t.phanKhuc, nganh: t.nganh } };
}

/** Ngược lại: dựng giá trị màn hình từ nguồn + tham số đã lưu trên chiến dịch. */
export function thamSoTuChienDich(nguon: string, thamSo: unknown): ThamSoLoc {
  const goc: ThamSoLoc = { doiTuong: "lead", giaiDoan: [], nguon: [], phanKhuc: [], nganh: [] };
  const t = (thamSo ?? {}) as Record<string, unknown>;
  if (nguon === "phan-khuc") return { ...goc, doiTuong: "phan-khuc", phanKhucId: String(t.phanKhucId ?? ""), tenPhanKhuc: String(t.tenPhanKhuc ?? "") };
  return { ...goc, ...(t as Partial<ThamSoLoc>) };
}
