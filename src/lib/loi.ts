/**
 * Lỗi nghiệp vụ có chủ đích — thông báo được phép hiện cho người dùng.
 * Lỗi khác (lỗi lập trình, lỗi cơ sở dữ liệu) chỉ hiện câu chung chung, chi tiết vào log.
 */
export class LoiNghiepVu extends Error {
  constructor(
    message: string,
    public readonly status: number = 422,
    public readonly ma?: string,
    /** Dữ liệu kèm theo để giao diện xử lý tiếp (ví dụ danh sách khách có thể trùng). */
    public readonly chiTiet?: unknown,
  ) {
    super(message);
    this.name = "LoiNghiepVu";
  }
}

export class LoiKhongTimThay extends LoiNghiepVu {
  constructor(doiTuong = "Bản ghi") {
    super(`${doiTuong} không tồn tại hoặc bạn không có quyền xem.`, 404, "khong-tim-thay");
    this.name = "LoiKhongTimThay";
  }
}

/** Sai định dạng một trường cụ thể (mã số thuế, điện thoại…) — trả 400 kèm tên trường. */
export class LoiDinhDang extends LoiNghiepVu {
  constructor(
    public readonly truong: string,
    message: string,
  ) {
    super(message, 400, "sai-dinh-dang");
    this.name = "LoiDinhDang";
  }
}

/** Lỗi trùng khóa duy nhất của Prisma (P2002). */
export function laLoiTrung(loi: unknown): boolean {
  return typeof loi === "object" && loi !== null && "code" in loi && (loi as { code: unknown }).code === "P2002";
}

/** Vi phạm ràng buộc CHECK của PostgreSQL (23514) — tên ràng buộc nằm trong thông báo. */
export function laViPhamRangBuoc(loi: unknown, tenRangBuoc?: string): boolean {
  const s = loi instanceof Error ? loi.message : String(loi);
  return (s.includes("23514") || s.includes("check constraint")) && (!tenRangBuoc || s.includes(tenRangBuoc));
}

/**
 * Lỗi tranh chấp đồng thời của PostgreSQL: khóa chéo (40P01), tuần tự hóa (40001), không lấy
 * được khóa (55P03). Prisma bọc nhiều kiểu: P2034, hoặc P2010 / lỗi bộ chuyển (adapter-pg) có
 * `cause.originalCode`. Không phải lỗi lập trình — người dùng chỉ cần thử lại, nên trả 409.
 */
export function laLoiTranhChap(loi: unknown): boolean {
  const MA_PG = ["40P01", "40001", "55P03"];
  const duyet = (x: unknown, sau: number): boolean => {
    if (typeof x !== "object" || x === null || sau > 4) return false;
    const o = x as { code?: unknown; originalCode?: unknown; kind?: unknown; cause?: unknown; meta?: { driverAdapterError?: unknown } };
    if (o.code === "P2034") return true;
    if (typeof o.code === "string" && MA_PG.includes(o.code)) return true;
    if (typeof o.originalCode === "string" && MA_PG.includes(o.originalCode)) return true;
    if (o.kind === "TransactionWriteConflict") return true;
    return duyet(o.cause, sau + 1) || duyet(o.meta?.driverAdapterError, sau + 1);
  };
  return duyet(loi, 0);
}

/** Giao dịch hết hạn / không mở được giao dịch kịp (Prisma P2028) — máy chủ đang bận. */
export function laLoiHetHanGiaoDich(loi: unknown): boolean {
  return typeof loi === "object" && loi !== null && "code" in loi && (loi as { code: unknown }).code === "P2028";
}
