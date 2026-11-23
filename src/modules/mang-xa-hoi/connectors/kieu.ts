import type { LoaiLoi, NenTang } from "../hang-so";
import type { KieuNoiDung, MoiTruongKiem, NoiDungKiem, TuyChonDang } from "../luat-nen-tang";

/**
 * Interface `SocialConnector` (mục 7.1 tài liệu gốc ITW SOCIAL MCP, QĐ-195).
 *
 * Connector KHÔNG đọc CSDL, KHÔNG giải mã: worker đưa vào thông tin xác thực đã mở niêm phong, connector gọi nền tảng
 * và trả kết quả đã PHÂN LOẠI (RETRYABLE / PERMANENT / NEEDS_REAUTH / UNKNOWN) kèm nhật ký từng lần gọi (để ghi
 * `social_publish_attempts`). Connector không bao giờ tự quyết "đã đăng": chỉ trả mã bài nền tảng; worker đánh dấu
 * PUBLISHED sau khi `verify` đọc lại khớp (ADR-05).
 *
 * 0.24.0: Facebook Page, Instagram, YouTube dùng OAuth. Đổi mã lấy token, làm mới token nằm ở `oauth-meta.ts` /
 * `oauth-google.ts` (worker gọi — bí mật app chỉ worker mở được); connector chỉ nhận access token đã còn hạn.
 */

export interface KhaNang {
  /** Kiểu nội dung đăng được. */
  kieuNoiDung: ("bai-viet" | "anh" | "video")[];
  /** Ảnh đẩy lên (push) hay nền tảng kéo từ URL công khai (pull — cần link ký). */
  media: "push" | "pull";
  soAnhToiDa: number;
  doDaiTieuDeToiDa: number | null;
  doDaiNoiDungToiDa: number | null;
  canTieuDe: boolean;
}

/** Kênh như connector cần biết — không có bí mật. */
export interface KenhGoi {
  id: string;
  diaChi: string;
  tenDangNhap: string | null;
  meta: Record<string, unknown>;
}

/**
 * Thông tin xác thực đã mở niêm phong (chỉ sống trong bộ nhớ worker / trong một yêu cầu kiểm tra có bản rõ người dùng
 * vừa nhập). WordPress: tên đăng nhập + mật khẩu ứng dụng. OAuth (0.24): access token (+ refresh token Google, hạn).
 */
export interface ThongTinXacThuc {
  tenDangNhap?: string;
  matKhau?: string;
  loai?: "meta" | "google";
  accessToken?: string;
  refreshToken?: string;
  /** ISO — hạn access token (Google). */
  hetHan?: string;
}

export interface TepMedia {
  attachmentId: string;
  tenTep: string;
  mime: string;
  dungLuong: number;
  rong?: number | null;
  cao?: number | null;
  thoiLuongGiay?: number | null;
  /** Đọc byte khi cần (Instagram kéo từ link ký — không đọc video vào bộ nhớ). */
  docNoiDung: () => Promise<Buffer>;
}

export interface NoiDungDang {
  tieuDe: string | null;
  noiDung: string;
  /** Khóa đối soát (slug) gửi kèm bài. */
  khoaDoiSoat: string;
  media: TepMedia[];
  /** attachmentId → mã media trên nền tảng đã tải ở lần trước (không tải lại). Khóa bắt đầu "__" = trạng thái dở dang của connector. */
  mediaDaTai: Record<string, string>;
  /** Kiểu nội dung chốt lúc xếp hàng (0.24). */
  kieu?: KieuNoiDung | null;
  tuyChon?: TuyChonDang;
  /** Mốc bắt đầu lượt đăng đầu tiên — đối soát theo nội dung chỉ xét bài tạo sau mốc này (Facebook / Instagram). */
  batDauLuot?: Date | null;
}

/** Thông tin app (không bí mật + bí mật đã mở) — chỉ worker có. */
export interface ThongTinAppGoi {
  graphVersion?: string;
  appSecret?: string;
}

export interface BoiCanhGoi {
  hanMs: number;
  app?: ThongTinAppGoi;
  /** Link ký công khai cho một tệp của bài (Instagram kéo media). `jpeg` = phát bản đổi sang JPEG. */
  linkMedia?: (attachmentId: string, jpeg: boolean) => string;
  /** Chờ (bài thử thay bằng hàm không chờ). */
  ngu?: (ms: number) => Promise<void>;
  /** Cỡ mỗi đoạn tải YouTube (bội số 256 KiB). */
  doanYoutube?: number;
  /**
   * Làm mới mốc giữ khóa của việc đang chạy (luật QA 0.23.0 "mốc giữ khóa theo từng việc"): connector gọi giữa các bước
   * dài (từng đoạn video, từng lần hỏi trạng thái container) để worker khác không coi lượt là "kẹt" rồi đăng lại.
   */
  giuKhoa?: () => Promise<void>;
}

/** Một lần gọi nền tảng — ghi vào social_publish_attempts. Không chứa tiêu đề yêu cầu / bí mật. */
export interface BuocGoi {
  kieu: "media" | "publish" | "verify" | "reconcile" | "check";
  ketQua: "success" | "retryable" | "permanent" | "needs_reauth" | "unknown" | "found" | "not_found";
  loaiLoi: LoaiLoi | null;
  httpStatus: number | null;
  thongBao: string | null;
  trichDoan: Record<string, unknown> | null;
  batDau: Date;
  ketThuc: Date;
}

export interface LoiPhanLoai {
  loai: LoaiLoi;
  ma: string;
  thongBao: string;
  httpStatus: number | null;
  /** 0.24: hoãn lượt (không tính lần thử) sau số ms này; -1 = tới đầu ngày quota kế tiếp (YouTube). */
  hoanMs?: number;
}

export type KetQuaDang =
  | { ok: true; externalId: string; url: string | null; mediaDaTai: Record<string, string>; nhatKy: BuocGoi[] }
  | ({ ok: false; mediaDaTai: Record<string, string>; nhatKy: BuocGoi[] } & LoiPhanLoai);

export type KetQuaXacMinh =
  | { ok: true; externalId: string; url: string; nhatKy: BuocGoi[] }
  | ({ ok: false; khongThay: boolean; nhatKy: BuocGoi[] } & LoiPhanLoai);

export type KetQuaDoiSoat =
  | { ok: true; externalId: string | null; nhatKy: BuocGoi[] }
  | ({ ok: false; nhatKy: BuocGoi[] } & LoiPhanLoai);

export interface KetQuaKiemTra {
  ok: boolean;
  thongBao: string;
  loai: LoaiLoi | null;
  /** Thông tin không bí mật để lưu vào social_connections.meta (tên site, user id, tên hiển thị, kiểu đường API). */
  meta: Record<string, unknown>;
}

export interface ViPham {
  truong: string;
  thongBao: string;
}

export interface SocialConnector {
  nenTang: NenTang;
  khaNang(): KhaNang;
  kiemTraKetNoi(kenh: KenhGoi, xt: ThongTinXacThuc, bc: BoiCanhGoi): Promise<KetQuaKiemTra>;
  validate(nd: NoiDungKiem, mt: MoiTruongKiem): ViPham[];
  /** Cảnh báo KHÔNG chặn của bước kiểm bài (QA 0.23.0, QĐ-208) — ví dụ ảnh thừa không được đăng. */
  canhBao?(nd: { soAnh: number }): string[];
  /**
   * Đối soát KHÔNG dùng bí mật (QA 0.23.0, QĐ-207): kênh đã ngắt (bản niêm phong đã hủy) mà kênh-bài còn đang xác minh.
   * Chỉ đọc dữ liệu công khai của nền tảng. Thấy bài đã công khai, đúng khóa đối soát → kết quả đã xác minh; không thấy /
   * không đọc được → `ok: false` (không kết luận được — cần kiểm tay).
   */
  doiSoatCongKhai?(kenh: KenhGoi, khoaDoiSoat: string, externalId: string | null, bc: BoiCanhGoi): Promise<KetQuaXacMinh>;
  publish(kenh: KenhGoi, xt: ThongTinXacThuc, nd: NoiDungDang, bc: BoiCanhGoi): Promise<KetQuaDang>;
  verify(kenh: KenhGoi, xt: ThongTinXacThuc, externalId: string, nd: Pick<NoiDungDang, "tieuDe" | "khoaDoiSoat"> & Partial<Pick<NoiDungDang, "kieu" | "noiDung">>, bc: BoiCanhGoi): Promise<KetQuaXacMinh>;
  /**
   * Tìm bài theo khóa đối soát — dùng khi kết quả chưa rõ (UNKNOWN) và trước mọi lần đăng lại. Nền tảng không có slug
   * (Facebook / Instagram) so theo nội dung + mốc thời gian; YouTube theo thẻ (tag) chứa khóa đối soát.
   */
  reconcile(kenh: KenhGoi, xt: ThongTinXacThuc, khoaDoiSoat: string, bc: BoiCanhGoi, nd?: Partial<NoiDungDang>): Promise<KetQuaDoiSoat>;
}
