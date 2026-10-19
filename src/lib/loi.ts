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
 * Giao dịch bị PostgreSQL hủy vì tranh chấp khóa — khóa chéo (40P01) hoặc xung đột tuần tự
 * (40001). Prisma bọc thành P2034 (truy vấn thường) hoặc P2010 kèm mã gốc (truy vấn thô, ví
 * dụ `khoaChungTu`). Không phải lỗi của máy chủ: cả giao dịch đã cuộn ngược, người dùng chỉ
 * cần thử lại — nên trả 409 chứ không phải 500 (QA 0.16.1).
 */
export function laLoiTranhChapGiaoDich(loi: unknown): boolean {
  if (typeof loi !== "object" || loi === null) return false;
  const l = loi as { code?: unknown; meta?: { driverAdapterError?: { cause?: { originalCode?: unknown } }; code?: unknown }; message?: unknown };
  if (l.code === "P2034") return true;
  const maGoc = l.meta?.driverAdapterError?.cause?.originalCode ?? l.meta?.code;
  if (maGoc === "40P01" || maGoc === "40001") return true;
  return typeof l.message === "string" && /deadlock detected|could not serialize access/.test(l.message);
}
