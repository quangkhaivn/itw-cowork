/**
 * Phần THUẦN của tệp đính kèm: danh sách trắng kiểu tệp, nhận dạng theo **nội dung**,
 * làm sạch tên tệp, và sinh đường dẫn lưu. Không chạm đĩa, không chạm CSDL.
 */

/** Trần kỹ thuật, không phải ngưỡng nghiệp vụ — đĩa máy chủ có hạn (DK-03). */
export const DUNG_LUONG_TOI_DA = 20 * 1024 * 1024;

/** Tối đa bao nhiêu tệp cho một chứng từ. Cũng là trần kỹ thuật. */
export const SO_TEP_TOI_DA = 20;

export const LOAI_DOI_TUONG = [
  "supplier_bill",
  "sales_return",
  "purchase_return",
  "stock_transfer",
  "sales_order",
  "support_ticket",
  "task",
] as const;
export type LoaiDoiTuong = (typeof LOAI_DOI_TUONG)[number];

export const NHAN_LOAI_DOI_TUONG: Record<string, string> = {
  supplier_bill: "Hóa đơn nhà cung cấp",
  sales_return: "Phiếu khách trả hàng",
  purchase_return: "Phiếu trả hàng nhà cung cấp",
  stock_transfer: "Phiếu chuyển kho",
  sales_order: "Đơn hàng",
  support_ticket: "Phiếu hỗ trợ",
  task: "Công việc",
};

/**
 * Danh sách trắng. Cố ý **không có SVG và không có HTML**: hai thứ đó là mã chạy
 * được trong trình duyệt, không phải tài liệu. Cũng không có zip — hộp kín thì
 * không kiểm được bên trong là gì.
 */
export interface KieuTep {
  mime: string;
  duoi: string[];
  /** Vài byte đầu nhận dạng tệp. Rỗng = kiểu văn bản, không nhận dạng được bằng byte. */
  dauTep: number[][];
  nhan: string;
}

export const KIEU_CHO_PHEP: KieuTep[] = [
  { mime: "application/pdf", duoi: ["pdf"], dauTep: [[0x25, 0x50, 0x44, 0x46]], nhan: "PDF" },
  { mime: "image/jpeg", duoi: ["jpg", "jpeg"], dauTep: [[0xff, 0xd8, 0xff]], nhan: "Ảnh JPEG" },
  { mime: "image/png", duoi: ["png"], dauTep: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]], nhan: "Ảnh PNG" },
  { mime: "image/gif", duoi: ["gif"], dauTep: [[0x47, 0x49, 0x46, 0x38]], nhan: "Ảnh GIF" },
  { mime: "image/webp", duoi: ["webp"], dauTep: [[0x52, 0x49, 0x46, 0x46]], nhan: "Ảnh WebP" },
  {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    duoi: ["docx"],
    dauTep: [[0x50, 0x4b, 0x03, 0x04]],
    nhan: "Word",
  },
  {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    duoi: ["xlsx"],
    dauTep: [[0x50, 0x4b, 0x03, 0x04]],
    nhan: "Excel",
  },
  { mime: "text/csv", duoi: ["csv"], dauTep: [], nhan: "CSV" },
  { mime: "text/plain", duoi: ["txt"], dauTep: [], nhan: "Văn bản" },
];

export function duoiTep(ten: string): string {
  const i = ten.lastIndexOf(".");
  return i < 0 ? "" : ten.slice(i + 1).toLowerCase();
}

function khopDauTep(kieu: KieuTep, byte: Uint8Array): boolean {
  if (kieu.dauTep.length === 0) return true;
  return kieu.dauTep.some((mau) => mau.every((b, i) => byte[i] === b));
}

export interface KetQuaNhanDang {
  hopLe: boolean;
  lyDo: string | null;
  mime: string | null;
  nhan: string | null;
}

/**
 * Nhận kiểu tệp theo **đuôi tên VÀ vài byte đầu**, không tin `Content-Type` trình
 * duyệt gửi lên — cái đó do phía người gửi đặt nên đặt gì cũng được.
 *
 * Đuôi và nội dung phải khớp nhau: một tệp `.pdf` mà byte đầu không phải PDF thì
 * bị từ chối, vì đó đúng là hình dạng của một tệp đội lốt.
 */
export function nhanDangTep(tenTep: string, byteDau: Uint8Array): KetQuaNhanDang {
  const duoi = duoiTep(tenTep);
  if (!duoi) {
    return { hopLe: false, lyDo: "Tệp không có phần đuôi tên nên không biết là kiểu gì.", mime: null, nhan: null };
  }
  const kieu = KIEU_CHO_PHEP.find((k) => k.duoi.includes(duoi));
  if (!kieu) {
    const dsDuoi = [...new Set(KIEU_CHO_PHEP.flatMap((k) => k.duoi))].join(", ");
    return { hopLe: false, lyDo: `Không nhận tệp .${duoi}. Chỉ nhận: ${dsDuoi}.`, mime: null, nhan: null };
  }
  if (!khopDauTep(kieu, byteDau)) {
    return {
      hopLe: false,
      lyDo: `Tệp đặt tên .${duoi} nhưng nội dung bên trong không phải ${kieu.nhan}.`,
      mime: null,
      nhan: null,
    };
  }
  return { hopLe: true, lyDo: null, mime: kieu.mime, nhan: kieu.nhan };
}

/**
 * Làm sạch tên tệp để hiện và để tải về.
 *
 * Bỏ mọi thứ có thể thoát khỏi thư mục hoặc đổi nghĩa khi ghi vào tiêu đề HTTP:
 * đường dẫn, ký tự điều khiển, dấu nháy, xuống dòng. Tên này **không** dùng để đặt
 * tên tệp trên đĩa — tên trên đĩa do hệ thống sinh (DK-05).
 */
export function lamSachTenTep(ten: string): string {
  const chiTen = ten.replace(/\\/g, "/").split("/").pop() ?? "";
  const sach = chiTen
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/["\\]/g, "")
    .trim()
    .replace(/^\.+/, "");
  return sach.slice(0, 200) || "tep-khong-ten";
}

/**
 * Đường dẫn tương đối để lưu tệp: `<tenant>/<năm>/<tháng>/<id>.<đuôi>`.
 *
 * Chia theo tháng để một thư mục không phình tới hàng trăm nghìn tệp. Tên tệp là
 * **id do hệ thống sinh**, không phải tên người dùng đặt — tên người dùng đặt có thể
 * là `../../.env`, và cũng có thể trùng nhau.
 */
export function duongDanLuu(tenantId: string, id: string, tenGoc: string, luc: Date = new Date()): string {
  const nam = luc.getUTCFullYear();
  const thang = String(luc.getUTCMonth() + 1).padStart(2, "0");
  const duoi = duoiTep(tenGoc);
  return `${tenantId}/${nam}/${thang}/${id}${duoi ? `.${duoi}` : ""}`;
}

/** Chặn đường dẫn thoát ra khỏi thư mục đính kèm. Chỉ nhận đúng khuôn đã sinh ra. */
export function duongDanHopLe(duongDan: string): boolean {
  return /^[0-9a-f-]{36}\/\d{4}\/\d{2}\/[0-9a-f-]{36}(\.[a-z0-9]{1,10})?$/.test(duongDan);
}

/** Dung lượng cho người đọc: 1,4 MB thay vì 1468006 byte. */
export function dinhDangDungLuong(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${(byte / 1024).toFixed(0)} KB`;
  return `${(byte / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
