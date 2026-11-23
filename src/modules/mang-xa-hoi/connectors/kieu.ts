import type { LoaiLoi, NenTang } from "../hang-so";

/**
 * Interface `SocialConnector` (mục 7.1 tài liệu gốc ITW SOCIAL MCP, QĐ-195).
 *
 * Connector KHÔNG đọc CSDL, KHÔNG giải mã: worker đưa vào thông tin xác thực đã mở niêm phong, connector gọi nền tảng
 * và trả kết quả đã PHÂN LOẠI (RETRYABLE / PERMANENT / NEEDS_REAUTH / UNKNOWN) kèm nhật ký từng lần gọi (để ghi
 * `social_publish_attempts`). Connector không bao giờ tự quyết "đã đăng": chỉ trả mã bài nền tảng; worker đánh dấu
 * PUBLISHED sau khi `verify` đọc lại khớp (ADR-05).
 *
 * Các phương thức OAuth (`buildAuthUrl`, `handleCallback`, `refreshCredential`, `revoke`) để tùy chọn — WordPress dùng
 * Application Password nên không có; Facebook / Instagram / YouTube / Zalo (0.24) sẽ cài.
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

/** Thông tin xác thực đã mở niêm phong (chỉ sống trong bộ nhớ worker / trong một yêu cầu kiểm tra có bản rõ người dùng vừa nhập). */
export interface ThongTinXacThuc {
  tenDangNhap: string;
  matKhau: string;
}

export interface TepMedia {
  attachmentId: string;
  tenTep: string;
  mime: string;
  noiDung: Buffer;
}

export interface NoiDungDang {
  tieuDe: string | null;
  noiDung: string;
  /** Khóa đối soát (slug) gửi kèm bài. */
  khoaDoiSoat: string;
  media: TepMedia[];
  /** attachmentId → mã media trên nền tảng đã tải ở lần trước (không tải lại). */
  mediaDaTai: Record<string, string>;
}

export interface BoiCanhGoi {
  hanMs: number;
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
  validate(nd: Pick<NoiDungDang, "tieuDe" | "noiDung"> & { soAnh: number }): ViPham[];
  /** Cảnh báo KHÔNG chặn của bước kiểm bài (QA 0.23.0, QĐ-208) — ví dụ ảnh thừa không được đăng. */
  canhBao?(nd: { soAnh: number }): string[];
  /**
   * Đối soát KHÔNG dùng bí mật (QA 0.23.0, QĐ-207): kênh đã ngắt (bản niêm phong đã hủy) mà kênh-bài còn đang xác minh.
   * Chỉ đọc dữ liệu công khai của nền tảng. Thấy bài đã công khai, đúng khóa đối soát → kết quả đã xác minh; không thấy /
   * không đọc được → `ok: false` (không kết luận được — cần kiểm tay).
   */
  doiSoatCongKhai?(kenh: KenhGoi, khoaDoiSoat: string, externalId: string | null, bc: BoiCanhGoi): Promise<KetQuaXacMinh>;
  publish(kenh: KenhGoi, xt: ThongTinXacThuc, nd: NoiDungDang, bc: BoiCanhGoi): Promise<KetQuaDang>;
  verify(kenh: KenhGoi, xt: ThongTinXacThuc, externalId: string, nd: Pick<NoiDungDang, "tieuDe" | "khoaDoiSoat">, bc: BoiCanhGoi): Promise<KetQuaXacMinh>;
  /** Tìm bài theo khóa đối soát — dùng khi kết quả chưa rõ (UNKNOWN) và trước mọi lần đăng lại. */
  reconcile(kenh: KenhGoi, xt: ThongTinXacThuc, khoaDoiSoat: string, bc: BoiCanhGoi): Promise<KetQuaDoiSoat>;
  buildAuthUrl?(trangThai: string, redirectUri: string): Promise<string>;
  handleCallback?(thamSo: Record<string, string>): Promise<unknown[]>;
  refreshCredential?(xt: ThongTinXacThuc): Promise<ThongTinXacThuc>;
  revoke?(xt: ThongTinXacThuc): Promise<void>;
}
