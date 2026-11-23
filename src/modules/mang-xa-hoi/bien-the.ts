/**
 * Nội dung RIÊNG THEO KÊNH (0.25.0, QĐ-233) — thuần, dùng chung máy chủ + worker + trình duyệt.
 *
 * Một bài có nội dung chung (tiêu đề + nội dung). Mỗi kênh-bài có thể ghi đè: tiêu đề, nội dung, hashtag riêng (thêm vào
 * cuối nội dung khi đăng) và một tập con ảnh / video. Thứ tự ưu tiên khi đăng: ghi đè của kênh → biến thể theo nền tảng
 * (bảng `social_post_variants`, để sẵn từ 0.23.0) → nội dung chung. Kiểm theo luật nền tảng dùng ĐÚNG nội dung này.
 */

export const HASHTAG_TOI_DA = 30;
export const HASHTAG_DO_DAI_TOI_DA = 100;

/** "#Khuyến mãi", "khuyen-mai", "#a b" → "#Khuyếnmãi" … Chữ, số, gạch dưới (Unicode). Rỗng / lỗi → null. */
export function chuanHoaHashtag(s: string): string | null {
  const than = s.trim().replace(/^#+/, "").normalize("NFC").replace(/[^\p{L}\p{N}_]+/gu, "");
  if (!than) return null;
  return `#${than.slice(0, HASHTAG_DO_DAI_TOI_DA)}`;
}

/** Chuẩn hóa + bỏ trùng (không phân biệt hoa thường), giữ thứ tự, tối đa 30. */
export function chuanHoaDsHashtag(ds: readonly string[]): string[] {
  const kq: string[] = [];
  const da = new Set<string>();
  for (const x of ds) {
    const h = chuanHoaHashtag(x);
    if (!h || da.has(h.toLowerCase())) continue;
    da.add(h.toLowerCase());
    kq.push(h);
    if (kq.length >= HASHTAG_TOI_DA) break;
  }
  return kq;
}

/** Thêm hashtag vào cuối nội dung (dòng trống rồi một dòng hashtag) — bỏ hashtag đã có trong nội dung. */
export function ganHashtag(noiDung: string, hashtags: readonly string[]): string {
  if (!hashtags.length) return noiDung;
  const co = new Set((noiDung.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.toLowerCase()));
  const them = hashtags.filter((h) => !co.has(h.toLowerCase()));
  if (!them.length) return noiDung;
  return `${noiDung.replace(/\s+$/, "")}\n\n${them.join(" ")}`;
}

export interface NoiDungChung {
  tieuDe: string | null;
  noiDung: string;
}

export interface GhiDeKenh {
  titleOverride: string | null;
  bodyOverride: string | null;
  hashtags: readonly string[];
  mediaSubset: boolean;
  mediaIds: readonly string[];
}

export interface NoiDungHieuLuc {
  tieuDe: string | null;
  noiDung: string;
  /** null = mọi ảnh / video của bài; mảng = đúng các tệp này (theo thứ tự của bài). */
  mediaIds: string[] | null;
  /** Kênh có nội dung riêng (để hiện nhãn "Nội dung riêng"). */
  coRieng: boolean;
}

/** Nội dung thật sẽ đăng lên một kênh. `bienTheNenTang` = biến thể cũ theo nền tảng (nếu có). */
export function noiDungHieuLuc(chung: NoiDungChung, kenh: GhiDeKenh, bienTheNenTang?: { title: string | null; body: string } | null): NoiDungHieuLuc {
  const tieuDe = kenh.titleOverride?.trim() ? kenh.titleOverride.trim() : (bienTheNenTang?.title ?? chung.tieuDe);
  const goc = kenh.bodyOverride?.trim() ? kenh.bodyOverride : (bienTheNenTang?.body ?? chung.noiDung);
  return {
    tieuDe,
    noiDung: ganHashtag(goc, kenh.hashtags),
    mediaIds: kenh.mediaSubset ? [...kenh.mediaIds] : null,
    coRieng: Boolean(kenh.titleOverride?.trim() || kenh.bodyOverride?.trim() || kenh.hashtags.length || kenh.mediaSubset),
  };
}

/** Lọc media của bài theo tập con của kênh (giữ thứ tự của bài). */
export function locMediaTheoKenh<T extends { attachmentId: string }>(media: readonly T[], mediaIds: readonly string[] | null): T[] {
  if (mediaIds === null) return [...media];
  const chon = new Set(mediaIds);
  return media.filter((m) => chon.has(m.attachmentId));
}

/**
 * Sửa nội dung riêng của một kênh LỖI rồi đăng lại có an toàn không (QĐ-234) — "không bao giờ đăng trùng":
 *  - kênh đã có mã bài trên nền tảng → KHÔNG (bài có thể đã lên);
 *  - WordPress / YouTube đối soát theo KHÓA (slug / thẻ) — nội dung đổi vẫn tìm ra bài cũ → được;
 *  - Facebook / Instagram đối soát theo NỘI DUNG — chỉ được khi mọi lần gửi trước đều bị nền tảng TỪ CHỐI DỨT KHOÁT
 *    (permanent / needs_reauth) hoặc chưa từng gửi; có lần gửi lỗi tạm / không rõ thì không (bài cũ có thể đã lên với
 *    nội dung cũ, sửa xong đối soát theo nội dung mới sẽ không nhận ra).
 * `ketQuaGui` = kết quả các lần gọi bước "publish" của kênh-bài (social_publish_attempts.outcome).
 */
export function suaKenhLoiAnToan(nenTang: string, t: { externalPostId: string | null; errorClass: string | null }, ketQuaGui: readonly string[]): { duoc: boolean; lyDo: string | null } {
  if (t.externalPostId) {
    return { duoc: false, lyDo: "Kênh này đã có mã bài trên nền tảng — bài có thể đã lên. Kiểm tra trực tiếp trên nền tảng; không sửa để tránh đăng trùng (cần thì tạo bài mới)." };
  }
  if (nenTang === "WORDPRESS" || nenTang === "YOUTUBE") return { duoc: true, lyDo: null };
  const chacChan = ketQuaGui.every((k) => k === "permanent" || k === "needs_reauth");
  if (t.errorClass === "UNKNOWN" || !chacChan) {
    return { duoc: false, lyDo: "Facebook / Instagram đối soát bài cũ theo NỘI DUNG. Kênh này từng gửi mà kết quả chưa chắc chắn (lỗi tạm / không rõ) — sửa nội dung có thể khiến hệ thống không nhận ra bài cũ nếu nó đã lên, dẫn tới đăng trùng. Bấm “Đăng lại kênh này” với nội dung cũ (hệ thống đối soát trước khi gửi), hoặc tạo bài mới." };
  }
  return { duoc: true, lyDo: null };
}
