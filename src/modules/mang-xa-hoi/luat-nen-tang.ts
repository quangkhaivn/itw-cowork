import type { NenTang } from "./hang-so";

/**
 * LUẬT NỀN TẢNG dạng dữ liệu (0.24.0, QĐ-205) — thuần, dùng chung máy chủ + trình duyệt.
 *
 * Kiểm định dạng / giới hạn media và chữ theo từng nền tảng TRƯỚC khi xếp hàng đăng; quyết định "kiểu nội dung"
 * (ảnh / nhiều ảnh / video / Reels / carousel…) cho từng kênh. Không chuyển mã video ở bản này — video không hợp thì báo
 * rõ lý do. Ảnh không phải JPEG cho Instagram: đổi sang JPEG nếu máy chủ có thư viện ảnh (sharp, đi kèm Next.js), không
 * có thì từ chối kèm hướng dẫn.
 *
 * CÁC CON SỐ dưới đây lấy theo tài liệu chính thức mà người viết biết tới 11/2026 — CHƯA KIỂM VỚI API THẬT (ghi
 * `chuaKiem: true`). Sửa ở MỘT chỗ này khi nền tảng đổi.
 */

export const KIEU_NOI_DUNG = ["wp-bai", "fb-chu", "fb-anh", "fb-nhieu-anh", "fb-video", "fb-reels", "ig-anh", "ig-carousel", "ig-reels", "yt-video"] as const;
export type KieuNoiDung = (typeof KIEU_NOI_DUNG)[number];

export const NHAN_KIEU_NOI_DUNG: Record<KieuNoiDung, string> = {
  "wp-bai": "Bài viết",
  "fb-chu": "Chữ / liên kết",
  "fb-anh": "Một ảnh",
  "fb-nhieu-anh": "Nhiều ảnh",
  "fb-video": "Video",
  "fb-reels": "Reels",
  "ig-anh": "Ảnh",
  "ig-carousel": "Carousel (nhiều ảnh)",
  "ig-reels": "Reels",
  "yt-video": "Video YouTube",
};

export const QUYEN_RIENG_TU_YT = ["private", "unlisted", "public"] as const;
export type QuyenRiengTuYt = (typeof QUYEN_RIENG_TU_YT)[number];
export const NHAN_QUYEN_RIENG_TU_YT: Record<QuyenRiengTuYt, string> = { private: "Riêng tư", unlisted: "Không công khai (ai có link mới xem)", public: "Công khai" };

export interface TuyChonDang {
  /** Facebook: một video đăng thành Reels thay vì video thường. */
  facebookReels?: boolean;
  /** Facebook: liên kết đính kèm bài chữ (Facebook dựng khung xem trước). */
  lienKet?: string | null;
  youtubeRiengTu?: QuyenRiengTuYt;
}

export interface MediaKiem {
  attachmentId: string;
  tenTep: string;
  mime: string;
  dungLuong: number;
  rong: number | null;
  cao: number | null;
  thoiLuongGiay: number | null;
  maHoa?: string | null;
}

export interface NoiDungKiem {
  tieuDe: string | null;
  noiDung: string;
  media: MediaKiem[];
  tuyChon: TuyChonDang;
}

export interface MoiTruongKiem {
  /** APP_URL là https (Instagram kéo media từ link ký trên tên miền Cowork). */
  appUrlHttps: boolean;
  /** Máy chủ đổi được ảnh sang JPEG (có thư viện ảnh). */
  coDoiJpeg: boolean;
}

export interface ViPhamNenTang {
  truong: string;
  thongBao: string;
}

export interface KetQuaKiemNenTang {
  kieu: KieuNoiDung | null;
  viPham: ViPhamNenTang[];
  ghiChu: string[];
}

const MB = 1024 * 1024;
export const ANH = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const VIDEO = ["video/mp4", "video/quicktime"];
const laAnh = (m: MediaKiem) => ANH.includes(m.mime);
const laVideo = (m: MediaKiem) => VIDEO.includes(m.mime);

/** Bảng số liệu — CHƯA KIỂM VỚI API THẬT. */
export const LUAT = {
  chuaKiem: true,
  FACEBOOK_PAGE: {
    noiDungToiDa: 63_206,
    anhDungLuongToiDa: 10 * MB,
    soAnhToiDa: 10,
    videoThoiLuongToiDa: 240 * 60,
    reelsThoiLuong: [3, 90] as [number, number],
    reelsTiLe: [0.5, 0.6] as [number, number], // ~9:16
    reelsKichThuocToiThieu: [540, 960] as [number, number],
    reelsMoi24Gio: 30,
  },
  INSTAGRAM: {
    noiDungToiDa: 2_200,
    hashtagToiDa: 30,
    anhDungLuongToiDa: 8 * MB,
    anhTiLe: [0.8, 1.91] as [number, number], // 4:5 → 1.91:1
    carousel: [2, 10] as [number, number],
    reelsThoiLuong: [3, 15 * 60] as [number, number],
    reelsTiLe: [0.01, 10] as [number, number],
    maHoaVideo: ["avc1", "avc3", "hvc1", "hev1"],
  },
  YOUTUBE: {
    tieuDeToiDa: 100,
    moTaToiDaByte: 5_000,
    thoiLuongToiDa: 12 * 3600,
    thoiLuongChuaXacMinh: 15 * 60,
    shortsToiDa: 180,
  },
  WORDPRESS: { tieuDeToiDa: 300, noiDungToiDa: 100_000 },
} as const;

/** Dung lượng tối đa của một tệp media của bài (tải thẳng từ máy: theo trần đính kèm 20 MB; lấy từ Google Drive: video tới 200 MB). */
export const VIDEO_DUNG_LUONG_TOI_DA = 200 * MB;

function mb(n: number) {
  return `${(n / MB).toFixed(1).replace(".", ",")} MB`;
}
function giay(n: number) {
  return n >= 60 ? `${Math.floor(n / 60)} phút ${Math.round(n % 60)} giây` : `${Math.round(n * 10) / 10} giây`;
}

function chonKieu(nenTang: NenTang, nd: NoiDungKiem): { kieu: KieuNoiDung | null; loi: string | null } {
  const anh = nd.media.filter(laAnh);
  const video = nd.media.filter(laVideo);
  const khac = nd.media.filter((m) => !laAnh(m) && !laVideo(m));
  if (khac.length) return { kieu: null, loi: `Tệp ${khac.map((m) => m.tenTep).join(", ")} không phải ảnh / video đăng được.` };
  if (nenTang === "WORDPRESS") return { kieu: "wp-bai", loi: null };
  if (nenTang === "FACEBOOK_PAGE") {
    if (video.length && anh.length) return { kieu: null, loi: "Facebook: một bài không trộn ảnh và video — tách thành hai bài." };
    if (video.length > 1) return { kieu: null, loi: "Facebook: mỗi bài chỉ một video." };
    if (video.length === 1) return { kieu: nd.tuyChon.facebookReels ? "fb-reels" : "fb-video", loi: null };
    if (anh.length === 0) return { kieu: "fb-chu", loi: null };
    return { kieu: anh.length === 1 ? "fb-anh" : "fb-nhieu-anh", loi: null };
  }
  if (nenTang === "INSTAGRAM") {
    if (!nd.media.length) return { kieu: null, loi: "Instagram cần ít nhất một ảnh hoặc một video." };
    if (video.length && anh.length) return { kieu: null, loi: "Instagram: bản này chưa đăng carousel trộn ảnh và video — dùng toàn ảnh, hoặc một video (Reels)." };
    if (video.length > 1) return { kieu: null, loi: "Instagram: mỗi bài chỉ một video (Reels)." };
    if (video.length === 1) return { kieu: "ig-reels", loi: null };
    return { kieu: anh.length === 1 ? "ig-anh" : "ig-carousel", loi: null };
  }
  if (nenTang === "YOUTUBE") {
    if (video.length !== 1 || anh.length) return { kieu: null, loi: "YouTube: mỗi bài đúng một video, không kèm ảnh." };
    return { kieu: "yt-video", loi: null };
  }
  return { kieu: null, loi: "Nền tảng chưa được hỗ trợ." };
}

function tiLe(m: MediaKiem): number | null {
  return m.rong && m.cao ? m.rong / m.cao : null;
}

/**
 * Kiểm một bài cho một nền tảng. Trả kiểu nội dung (null khi không đăng được), danh sách vi phạm (chặn) và ghi chú
 * (không chặn — ví dụ "ảnh sẽ được đổi sang JPEG", "YouTube xếp vào Shorts").
 */
export function kiemTheoNenTang(nenTang: NenTang, nd: NoiDungKiem, mt: MoiTruongKiem): KetQuaKiemNenTang {
  const v: ViPhamNenTang[] = [];
  const g: string[] = [];
  const { kieu, loi } = chonKieu(nenTang, nd);
  if (loi) v.push({ truong: "media", thongBao: loi });
  const chuNoiDung = nd.noiDung.trim();

  if (nenTang === "WORDPRESS") {
    const L = LUAT.WORDPRESS;
    if (!nd.tieuDe?.trim()) v.push({ truong: "tieuDe", thongBao: "Bài WordPress cần tiêu đề." });
    if ((nd.tieuDe ?? "").length > L.tieuDeToiDa) v.push({ truong: "tieuDe", thongBao: `Tiêu đề tối đa ${L.tieuDeToiDa} ký tự.` });
    if (!chuNoiDung) v.push({ truong: "noiDung", thongBao: "Nội dung trống." });
    if (nd.noiDung.length > L.noiDungToiDa) v.push({ truong: "noiDung", thongBao: "Nội dung tối đa 100.000 ký tự." });
    if (nd.media.some(laVideo)) g.push("WordPress: video của bài không được đăng (bản này chỉ đăng ảnh đầu tiên làm ảnh đại diện).");
    return { kieu, viPham: v, ghiChu: g };
  }

  if (nenTang === "FACEBOOK_PAGE") {
    const L = LUAT.FACEBOOK_PAGE;
    if (!chuNoiDung && !nd.media.length) v.push({ truong: "noiDung", thongBao: "Facebook: bài cần nội dung hoặc ảnh / video." });
    if (nd.noiDung.length > L.noiDungToiDa) v.push({ truong: "noiDung", thongBao: `Facebook: nội dung tối đa ${L.noiDungToiDa.toLocaleString("vi-VN")} ký tự.` });
    if (nd.tuyChon.lienKet && !/^https?:\/\/[^\s]+$/.test(nd.tuyChon.lienKet)) v.push({ truong: "lienKet", thongBao: "Liên kết phải bắt đầu bằng https:// hoặc http://." });
    if (nd.tuyChon.lienKet && nd.media.length) g.push("Facebook: bài có ảnh / video thì liên kết được để trong nội dung, không dựng khung xem trước.");
    const anh = nd.media.filter(laAnh);
    if (anh.length > L.soAnhToiDa) v.push({ truong: "media", thongBao: `Facebook: tối đa ${L.soAnhToiDa} ảnh mỗi bài.` });
    for (const a of anh) if (a.dungLuong > L.anhDungLuongToiDa) v.push({ truong: "media", thongBao: `Facebook: ảnh ${a.tenTep} ${mb(a.dungLuong)} vượt ${mb(L.anhDungLuongToiDa)}.` });
    const vd = nd.media.find(laVideo);
    if (vd && kieu === "fb-video") {
      if (vd.thoiLuongGiay === null) v.push({ truong: "media", thongBao: `Facebook: không đọc được thời lượng video ${vd.tenTep} (tệp MP4 / MOV hỏng hoặc thiếu phần mô tả “moov”). Xuất lại video bằng phần mềm dựng.` });
      else if (vd.thoiLuongGiay > L.videoThoiLuongToiDa) v.push({ truong: "media", thongBao: `Facebook: video dài ${giay(vd.thoiLuongGiay)}, tối đa 240 phút.` });
    }
    if (vd && kieu === "fb-reels") {
      const [ngan, dai] = L.reelsThoiLuong;
      const t = vd.thoiLuongGiay;
      if (t === null) v.push({ truong: "media", thongBao: `Reels: không đọc được thời lượng video ${vd.tenTep}.` });
      else if (t < ngan || t > dai) v.push({ truong: "media", thongBao: `Reels Facebook dài ${ngan}–${dai} giây; video này ${giay(t)}. Cắt lại video (Cowork không chuyển mã), hoặc bỏ chọn “Đăng thành Reels” để đăng video thường.` });
      const tl = tiLe(vd);
      if (tl === null || tl < L.reelsTiLe[0] || tl > L.reelsTiLe[1]) v.push({ truong: "media", thongBao: `Reels cần video dọc 9:16${vd.rong && vd.cao ? ` (video này ${vd.rong}×${vd.cao})` : ""}. Xuất lại video khổ 1080×1920.` });
      if (vd.rong !== null && vd.cao !== null && (vd.rong < L.reelsKichThuocToiThieu[0] || vd.cao < L.reelsKichThuocToiThieu[1])) v.push({ truong: "media", thongBao: `Reels cần tối thiểu 540×960 (video này ${vd.rong}×${vd.cao}).` });
    }
    return { kieu, viPham: v, ghiChu: g };
  }

  if (nenTang === "INSTAGRAM") {
    const L = LUAT.INSTAGRAM;
    if (!mt.appUrlHttps) v.push({ truong: "moiTruong", thongBao: "Instagram cần Cowork chạy ở địa chỉ https công khai (APP_URL bắt đầu bằng https://) — Instagram tải ảnh / video từ link trên tên miền Cowork. Báo quản trị máy chủ." });
    if (nd.noiDung.length > L.noiDungToiDa) v.push({ truong: "noiDung", thongBao: `Instagram: chú thích tối đa ${L.noiDungToiDa.toLocaleString("vi-VN")} ký tự.` });
    const soHashtag = (nd.noiDung.match(/(^|\s)#[^\s#]+/g) ?? []).length;
    if (soHashtag > L.hashtagToiDa) v.push({ truong: "noiDung", thongBao: `Instagram: tối đa ${L.hashtagToiDa} hashtag (bài có ${soHashtag}).` });
    const anh = nd.media.filter(laAnh);
    if (kieu === "ig-carousel" && (anh.length < L.carousel[0] || anh.length > L.carousel[1])) v.push({ truong: "media", thongBao: `Instagram carousel ${L.carousel[0]}–${L.carousel[1]} ảnh (bài có ${anh.length}).` });
    for (const a of anh) {
      if (a.mime !== "image/jpeg") {
        if (mt.coDoiJpeg) g.push(`Instagram chỉ nhận JPEG — ảnh ${a.tenTep} sẽ được đổi sang JPEG khi đăng.`);
        else v.push({ truong: "media", thongBao: `Instagram chỉ nhận ảnh JPEG; ảnh ${a.tenTep} là ${a.mime.replace("image/", "").toUpperCase()} và máy chủ không có thư viện đổi ảnh. Mở ảnh bằng Paint / Photos → Lưu thành (Save as) JPEG rồi tải lên lại.` });
      } else if (a.dungLuong > L.anhDungLuongToiDa) v.push({ truong: "media", thongBao: `Instagram: ảnh ${a.tenTep} ${mb(a.dungLuong)} vượt ${mb(L.anhDungLuongToiDa)}.` });
      const tl = tiLe(a);
      if (tl === null) v.push({ truong: "media", thongBao: `Instagram: không đọc được kích thước ảnh ${a.tenTep}.` });
      else if (tl < L.anhTiLe[0] - 0.005 || tl > L.anhTiLe[1] + 0.005) v.push({ truong: "media", thongBao: `Instagram nhận ảnh tỉ lệ từ 4:5 (dọc) tới 1,91:1 (ngang); ảnh ${a.tenTep} là ${a.rong}×${a.cao}. Cắt lại ảnh.` });
    }
    const vd = nd.media.find(laVideo);
    if (vd && kieu === "ig-reels") {
      const t = vd.thoiLuongGiay;
      if (t === null) v.push({ truong: "media", thongBao: `Instagram: không đọc được thời lượng video ${vd.tenTep}.` });
      else if (t < L.reelsThoiLuong[0] || t > L.reelsThoiLuong[1]) v.push({ truong: "media", thongBao: `Reels Instagram dài 3 giây – 15 phút; video này ${giay(t)}.` });
      const tl = tiLe(vd);
      if (tl !== null && (tl < L.reelsTiLe[0] || tl > L.reelsTiLe[1])) v.push({ truong: "media", thongBao: `Instagram: tỉ lệ khung video ${vd.rong}×${vd.cao} không nhận.` });
      if (vd.maHoa && !(L.maHoaVideo as readonly string[]).includes(vd.maHoa)) v.push({ truong: "media", thongBao: `Instagram nhận video mã hóa H.264 hoặc HEVC; video này mã hóa “${vd.maHoa}”. Xuất lại video H.264 (Cowork không chuyển mã).` });
      if (tl !== null && Math.abs(tl - 9 / 16) > 0.02) g.push("Instagram khuyến nghị Reels khổ dọc 9:16 (1080×1920).");
    }
    return { kieu, viPham: v, ghiChu: g };
  }

  if (nenTang === "YOUTUBE") {
    const L = LUAT.YOUTUBE;
    const td = nd.tieuDe?.trim() ?? "";
    if (!td) v.push({ truong: "tieuDe", thongBao: "Video YouTube cần tiêu đề." });
    if (td.length > L.tieuDeToiDa) v.push({ truong: "tieuDe", thongBao: `Tiêu đề YouTube tối đa ${L.tieuDeToiDa} ký tự.` });
    if (/[<>]/.test(td) || /[<>]/.test(nd.noiDung)) v.push({ truong: "noiDung", thongBao: "YouTube không nhận ký tự < hoặc > trong tiêu đề / mô tả." });
    if (new TextEncoder().encode(nd.noiDung).length > L.moTaToiDaByte) v.push({ truong: "noiDung", thongBao: "Mô tả YouTube tối đa 5.000 byte (khoảng 1.600–5.000 ký tự tùy dấu)." });
    const vd = nd.media.find(laVideo);
    if (vd) {
      const t = vd.thoiLuongGiay;
      if (t === null) v.push({ truong: "media", thongBao: `YouTube: không đọc được thời lượng video ${vd.tenTep}.` });
      else {
        if (t > L.thoiLuongToiDa) v.push({ truong: "media", thongBao: "YouTube: video tối đa 12 giờ." });
        else if (t > L.thoiLuongChuaXacMinh) g.push("Video dài hơn 15 phút: kênh YouTube phải đã xác minh số điện thoại, nếu không YouTube từ chối.");
        if (vd.rong !== null && vd.cao !== null && vd.cao >= vd.rong && t <= L.shortsToiDa) g.push("Video dọc (hoặc vuông) ≤ 3 phút — YouTube tự xếp vào Shorts.");
      }
    }
    g.push(`Quyền riêng tư khi đăng: ${NHAN_QUYEN_RIENG_TU_YT[nd.tuyChon.youtubeRiengTu ?? "private"]}.`);
    return { kieu, viPham: v, ghiChu: g };
  }

  return { kieu: null, viPham: [{ truong: "nenTang", thongBao: "Nền tảng chưa được hỗ trợ." }], ghiChu: [] };
}

/** Đọc tùy chọn đăng đã lưu (JSON) an toàn. */
export function docTuyChon(o: unknown): TuyChonDang {
  const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
  const rt = QUYEN_RIENG_TU_YT.includes(x.youtubeRiengTu as QuyenRiengTuYt) ? (x.youtubeRiengTu as QuyenRiengTuYt) : "private";
  return {
    facebookReels: x.facebookReels === true,
    lienKet: typeof x.lienKet === "string" && x.lienKet.trim() ? x.lienKet.trim() : null,
    youtubeRiengTu: rt,
  };
}
