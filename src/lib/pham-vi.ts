/**
 * Phạm vi dữ liệu (data scope) — mục 19 master prompt TGTH Business Cowork.
 *
 * Quyền trả lời "được làm gì" (view/create/update...). Phạm vi trả lời "trên
 * những bản ghi nào":
 *
 *   own        — bản ghi mình phụ trách
 *   team       — của mình và của những người mình quản lý (trực tiếp và gián tiếp)
 *   department — của mọi người trong phòng ban mình và các phòng ban con
 *   all        — toàn bộ doanh nghiệp
 *
 * Phạm vi lưu trên từng dòng `role_permissions.data_scope`. Một người có nhiều vai
 * trò thì lấy phạm vi RỘNG NHẤT trong các vai trò cho cùng một quyền.
 *
 * Phần thuần (không đụng cơ sở dữ liệu) nằm ở đầu tệp để kiểm thử đơn vị được.
 */

export const PHAM_VI = ["own", "team", "department", "all"] as const;
export type PhamVi = (typeof PHAM_VI)[number];

export const NHAN_PHAM_VI: Record<PhamVi, string> = {
  own: "Của tôi",
  team: "Nhóm tôi quản lý",
  department: "Phòng ban",
  all: "Toàn công ty",
};

const THU_HANG: Record<PhamVi, number> = { own: 0, team: 1, department: 2, all: 3 };

export function laPhamVi(x: unknown): x is PhamVi {
  return typeof x === "string" && (PHAM_VI as readonly string[]).includes(x);
}

/** Phạm vi rộng hơn trong hai phạm vi. */
export function rongHon(a: PhamVi, b: PhamVi): PhamVi {
  return THU_HANG[a] >= THU_HANG[b] ? a : b;
}

/** Gộp danh sách (mã quyền, phạm vi) thành bản đồ mã quyền → phạm vi rộng nhất. */
export function gopPhamVi(ds: { ma: string; phamVi: string }[]): Map<string, PhamVi> {
  const ketQua = new Map<string, PhamVi>();
  for (const { ma, phamVi } of ds) {
    // Giá trị lạ trong cơ sở dữ liệu (đã có CHECK chặn) thì coi là hẹp nhất, không mở rộng quyền.
    const pv: PhamVi = laPhamVi(phamVi) ? phamVi : "own";
    const cu = ketQua.get(ma);
    ketQua.set(ma, cu ? rongHon(cu, pv) : pv);
  }
  return ketQua;
}
