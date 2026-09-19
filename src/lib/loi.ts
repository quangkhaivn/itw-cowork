/**
 * Lỗi nghiệp vụ có chủ đích — thông báo được phép hiện cho người dùng.
 * Lỗi khác (lỗi lập trình, lỗi cơ sở dữ liệu) chỉ hiện câu chung chung, chi tiết vào log.
 */
export class LoiNghiepVu extends Error {
  constructor(
    message: string,
    public readonly status: number = 422,
    public readonly ma?: string,
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

/** Lỗi trùng khóa duy nhất của Prisma (P2002). */
export function laLoiTrung(loi: unknown): boolean {
  return typeof loi === "object" && loi !== null && "code" in loi && (loi as { code: unknown }).code === "P2002";
}
