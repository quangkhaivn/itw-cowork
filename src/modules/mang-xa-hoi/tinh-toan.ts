import type { LoaiLoi, TrangThaiBai, TrangThaiKenhBai } from "./hang-so";

/**
 * Phần THUẦN của Mạng xã hội (0.23.0): máy trạng thái bài / kênh, tổng hợp trạng thái, giãn cách thử lại, phân loại lỗi
 * HTTP, khóa đối soát, chuyển chữ thường sang HTML an toàn, chuẩn hóa địa chỉ site. Không chạm CSDL, mạng, đồng hồ.
 */

// ---------------------------------------------------------------------------
// Máy trạng thái (mục 3–4 tài liệu gốc)
// ---------------------------------------------------------------------------

/** Chuyển trạng thái BÀI được phép. Mọi service đổi trạng thái kiểm qua `duocChuyenBai`. */
export const CHUYEN_BAI: Record<TrangThaiBai, readonly TrangThaiBai[]> = {
  DRAFT: ["PENDING_APPROVAL", "SCHEDULED", "PUBLISHING"],
  PENDING_APPROVAL: ["DRAFT", "APPROVED", "SCHEDULED", "PUBLISHING"],
  APPROVED: ["DRAFT", "SCHEDULED", "PUBLISHING"],
  SCHEDULED: ["PUBLISHING", "CANCELED"],
  PUBLISHING: ["PUBLISHED", "PARTIALLY_FAILED", "FAILED"],
  PUBLISHED: [],
  PARTIALLY_FAILED: ["PUBLISHING"],
  FAILED: ["PUBLISHING", "DRAFT"],
  CANCELED: ["DRAFT"],
};

export function duocChuyenBai(tu: TrangThaiBai, sang: TrangThaiBai): boolean {
  return tu === sang || CHUYEN_BAI[tu]?.includes(sang) === true;
}

/** Chuyển trạng thái KÊNH (bài × kênh). PUBLISHED là đích cuối — trigger CSDL chặn lùi. */
export const CHUYEN_KENH: Record<TrangThaiKenhBai, readonly TrangThaiKenhBai[]> = {
  PENDING: ["QUEUED", "CANCELED", "SKIPPED"],
  QUEUED: ["PUBLISHING", "CANCELED", "PENDING"],
  PUBLISHING: ["VERIFYING", "PUBLISHED", "QUEUED", "FAILED"],
  VERIFYING: ["PUBLISHED", "QUEUED", "FAILED", "VERIFYING"],
  PUBLISHED: [],
  FAILED: ["QUEUED", "PENDING"],
  SKIPPED: [],
  CANCELED: ["PENDING"],
};

export function duocChuyenKenh(tu: TrangThaiKenhBai, sang: TrangThaiKenhBai): boolean {
  return tu === sang || CHUYEN_KENH[tu]?.includes(sang) === true;
}

/** Bài sửa được nội dung / ảnh / kênh khi đang ở các trạng thái này (sửa bài đã duyệt → về nháp, mất duyệt). */
export const SUA_DUOC: readonly TrangThaiBai[] = ["DRAFT", "APPROVED", "CANCELED"];

const KENH_DANG_CHAY: readonly TrangThaiKenhBai[] = ["QUEUED", "PUBLISHING", "VERIFYING"];

/**
 * Trạng thái BÀI suy ra từ các kênh khi bài đã vào giai đoạn đăng. Còn kênh đang chạy → giữ `hienTai` nếu là SCHEDULED
 * (chưa tới giờ) hoặc PUBLISHING. Hết kênh đang chạy: tất cả đã đăng → PUBLISHED; có đăng có lỗi → PARTIALLY_FAILED;
 * không kênh nào đăng mà có lỗi → FAILED; còn lại (đều hủy / bỏ qua) → CANCELED.
 */
export function tongHopTrangThaiBai(hienTai: TrangThaiBai, kenh: readonly TrangThaiKenhBai[]): TrangThaiBai {
  if (kenh.length === 0) return hienTai;
  if (kenh.some((k) => KENH_DANG_CHAY.includes(k))) {
    if (hienTai === "SCHEDULED" && kenh.every((k) => k === "QUEUED" || k === "CANCELED" || k === "SKIPPED")) return "SCHEDULED";
    return "PUBLISHING";
  }
  const da = kenh.filter((k) => k === "PUBLISHED").length;
  const loi = kenh.filter((k) => k === "FAILED").length;
  if (da > 0 && loi === 0) return "PUBLISHED";
  if (da > 0 && loi > 0) return "PARTIALLY_FAILED";
  if (loi > 0) return "FAILED";
  if (kenh.some((k) => k === "PENDING")) return hienTai;
  return "CANCELED";
}

// ---------------------------------------------------------------------------
// Thử lại, phân loại lỗi
// ---------------------------------------------------------------------------

/** Giãn cách trước lần thử thứ `lanDaThu + 1`: 30 giây × 2^(n−1), trần 30 phút. */
export function gianCachThuLai(lanDaThu: number): number {
  const n = Math.max(1, lanDaThu);
  return Math.min(30_000 * 2 ** (n - 1), 30 * 60_000);
}

export interface KetQuaPhanLoai {
  loai: LoaiLoi;
  ma: string;
}

/**
 * Phân loại một phản hồi HTTP lỗi của nền tảng (mục 7.1): 401 / 403 → NEEDS_REAUTH; 408, 425, 429, 5xx → RETRYABLE;
 * 4xx khác → PERMANENT. 2xx mà thiếu mã bài / JSON hỏng không đi qua đây (connector trả UNKNOWN — đối soát).
 */
export function phanLoaiHttp(status: number): KetQuaPhanLoai {
  if (status === 401 || status === 403) return { loai: "NEEDS_REAUTH", ma: `http-${status}` };
  if (status === 408 || status === 425 || status === 429 || status >= 500) return { loai: "RETRYABLE", ma: `http-${status}` };
  return { loai: "PERMANENT", ma: `http-${status}` };
}

export type QuyetDinhSauLoi =
  | { loai: "thu-lai"; sauMs: number }
  | { loai: "doi-soat"; sauMs: number }
  | { loai: "that-bai"; canNhapLai: boolean };

/**
 * Sau một lỗi: RETRYABLE còn lượt → thử lại có giãn cách; hết lượt → thất bại. UNKNOWN → đối soát (không đăng lại mù).
 * PERMANENT / NEEDS_REAUTH → thất bại ngay (NEEDS_REAUTH đánh dấu kênh cần nhập lại).
 */
export function quyetDinhSauLoi(loai: LoaiLoi, lanDaThu: number, soLanToiDa: number, choDoiSoatMs: number): QuyetDinhSauLoi {
  if (loai === "UNKNOWN") return { loai: "doi-soat", sauMs: choDoiSoatMs };
  if (loai === "RETRYABLE" && lanDaThu < soLanToiDa) return { loai: "thu-lai", sauMs: gianCachThuLai(lanDaThu) };
  return { loai: "that-bai", canNhapLai: loai === "NEEDS_REAUTH" };
}

// ---------------------------------------------------------------------------
// Nội dung, địa chỉ
// ---------------------------------------------------------------------------

/** Bỏ dấu tiếng Việt + ký tự lạ → slug chữ thường, gạch nối. */
export function slugHoa(s: string, toiDa = 60): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, toiDa)
    .replace(/-+$/g, "");
}

/**
 * Khóa đối soát của một kênh (WordPress: slug bài). Tên dễ đọc + đuôi `cw<10 ký tự id kênh>` — duy nhất, nên khi kết quả
 * chưa rõ, đọc lại theo slug này biết chắc bài đã lên hay chưa.
 */
export function khoaDoiSoat(tieuDe: string | null, targetId: string): string {
  const duoi = `cw${targetId.replace(/-/g, "").slice(0, 10).toLowerCase()}`;
  const dau = slugHoa(tieuDe ?? "", 60);
  return dau ? `${dau}-${duoi}` : `bai-${duoi}`;
}

const THOAT: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function thoatHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => THOAT[c]);
}

/**
 * Nội dung bài là CHỮ THƯỜNG (không nhận HTML tự do). Chuyển sang HTML an toàn: thoát ký tự, đoạn cách bằng dòng trống
 * thành `<p>`, xuống dòng đơn thành `<br>`, liên kết http(s) thành thẻ a (đã thoát).
 */
export function vanBanSangHtml(noiDung: string): string {
  return noiDung
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((doan) => doan.trim())
    .filter(Boolean)
    .map((doan) => {
      const html = thoatHtml(doan)
        .replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" rel="noopener">${u}</a>`)
        .replace(/\n/g, "<br>\n");
      return `<p>${html}</p>`;
    })
    .join("\n");
}

export interface DiaChiSite {
  hopLe: boolean;
  url?: string;
  lyDo?: string;
}

/**
 * Chuẩn hóa địa chỉ site WordPress người dùng nhập: chỉ HTTPS (http://localhost chỉ khi `choPhepLocalhost` — bài thử),
 * bỏ đường dẫn rác cuối (`/wp-admin`, `/wp-json`), bỏ `/` cuối, không nhận tài khoản / mật khẩu trong URL, không query.
 */
export function chuanHoaDiaChiSite(nhap: string, choPhepLocalhost = false): DiaChiSite {
  const s = nhap.trim();
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return { hopLe: false, lyDo: "Địa chỉ site không hợp lệ." };
  }
  const laLocalhost = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && laLocalhost && choPhepLocalhost)) {
    return { hopLe: false, lyDo: "Chỉ nhận site HTTPS (https://…). Mật khẩu ứng dụng không được gửi qua kết nối không mã hóa." };
  }
  if (u.username || u.password) return { hopLe: false, lyDo: "Không ghi tên đăng nhập / mật khẩu trong địa chỉ site." };
  if (u.search || u.hash) return { hopLe: false, lyDo: "Địa chỉ site không được có ? hoặc #." };
  let duong = u.pathname.replace(/\/+$/, "");
  duong = duong.replace(/\/(wp-admin|wp-json|wp-login\.php)(\/.*)?$/i, "");
  return { hopLe: true, url: `${u.protocol}//${u.host}${duong}` };
}

/** 4 ký tự cuối để hiện thay cho bí mật (không bao giờ hiện cả chuỗi). */
export function bonKyTuCuoi(biMat: string): string {
  const s = biMat.replace(/\s+/g, "");
  return s.slice(-4);
}

/** Lỗi của nền tảng thu gọn để lưu / hiện: bỏ thẻ HTML, cắt độ dài, không bao giờ kèm tiêu đề yêu cầu. */
export function cauLoiGon(s: unknown, toiDa = 300): string {
  const chu = typeof s === "string" ? s : s instanceof Error ? s.message : JSON.stringify(s ?? "");
  return chu.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, toiDa);
}
