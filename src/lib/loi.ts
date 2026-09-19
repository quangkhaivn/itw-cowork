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
