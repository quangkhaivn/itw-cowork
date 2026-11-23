/**
 * Địa chỉ gốc của API nền tảng (0.24.0). Bài thử trỏ sang máy chủ GIẢ cục bộ bằng `datGocApiChoBaiThu` (cấm trên
 * môi trường thật). Phiên bản Graph API KHÔNG nằm ở đây — sửa được ở màn hình Kết nối nền tảng (QĐ-199, mục 8b).
 *
 * CHƯA KIỂM VỚI API THẬT: tên máy `graph-video.facebook.com` (tải video theo phần), `rupload.facebook.com` (Reels),
 * `www.googleapis.com/upload` (YouTube resumable), `oauth2.googleapis.com` (token, tokeninfo, revoke).
 */
export interface GocApi {
  graph: string;
  graphVideo: string;
  rupload: string;
  facebookWeb: string;
  googleAuth: string;
  googleOAuth: string;
  googleApis: string;
}

const MAC_DINH: GocApi = {
  graph: "https://graph.facebook.com",
  graphVideo: "https://graph-video.facebook.com",
  rupload: "https://rupload.facebook.com",
  facebookWeb: "https://www.facebook.com",
  googleAuth: "https://accounts.google.com",
  googleOAuth: "https://oauth2.googleapis.com",
  googleApis: "https://www.googleapis.com",
};

let hienTai: GocApi = { ...MAC_DINH };

export function gocApi(): GocApi {
  return hienTai;
}

/** CHỈ bài thử: đổi địa chỉ gốc sang máy chủ giả. `null` = về mặc định. */
export function datGocApiChoBaiThu(doi: Partial<GocApi> | null): void {
  if (process.env.NODE_ENV === "production") throw new Error("Không đổi địa chỉ API nền tảng trên môi trường thật.");
  hienTai = doi ? { ...hienTai, ...doi } : { ...MAC_DINH };
}
