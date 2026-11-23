import { chuanHoaDsHashtag } from "./bien-the";

/**
 * Hồ sơ thương hiệu (0.25.0, QĐ-235) — phần THUẦN. Dùng cho (1) lời nhắc AI và (2) CẢNH BÁO (không chặn) trên bài soạn
 * tay: chứa từ cấm, thiếu câu bắt buộc, thiếu hashtag bắt buộc.
 */

export interface HoSoThuongHieu {
  giongVan: string | null;
  tuCam: string[];
  hashtagBatBuoc: string[];
  cauBatBuoc: string[];
  cta: string[];
  baiMau: string[];
}

export const GIOI_HAN_THUONG_HIEU = {
  giongVan: 2000,
  tuCam: { so: 200, dai: 100 },
  hashtag: 30,
  cauBatBuoc: { so: 20, dai: 300 },
  cta: { so: 10, dai: 300 },
  baiMau: { so: 5, dai: 3000 },
} as const;

function dsChuoi(ds: readonly unknown[] | null | undefined, so: number, dai: number): string[] {
  const kq: string[] = [];
  const da = new Set<string>();
  for (const x of ds ?? []) {
    if (typeof x !== "string") continue;
    const s = x.normalize("NFC").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, dai);
    if (!s || da.has(s.toLowerCase())) continue;
    da.add(s.toLowerCase());
    kq.push(s);
    if (kq.length >= so) break;
  }
  return kq;
}

/** Chuẩn hóa hồ sơ nhập / đọc từ CSDL: cắt độ dài, bỏ trùng, bỏ ký tự điều khiển. */
export function chuanHoaHoSo(d: Partial<{ giongVan: string | null; tuCam: unknown[]; hashtagBatBuoc: unknown[]; cauBatBuoc: unknown[]; cta: unknown[]; baiMau: unknown[] }>): HoSoThuongHieu {
  const G = GIOI_HAN_THUONG_HIEU;
  const gv = (d.giongVan ?? "").normalize("NFC").trim().slice(0, G.giongVan);
  return {
    giongVan: gv || null,
    tuCam: dsChuoi(d.tuCam, G.tuCam.so, G.tuCam.dai),
    hashtagBatBuoc: chuanHoaDsHashtag(dsChuoi(d.hashtagBatBuoc, G.hashtag, 101)),
    cauBatBuoc: dsChuoi(d.cauBatBuoc, G.cauBatBuoc.so, G.cauBatBuoc.dai),
    cta: dsChuoi(d.cta, G.cta.so, G.cta.dai),
    // Bài mẫu giữ xuống dòng.
    baiMau: (d.baiMau ?? []).filter((x): x is string => typeof x === "string").map((x) => x.normalize("NFC").trim().slice(0, G.baiMau.dai)).filter(Boolean).slice(0, G.baiMau.so),
  };
}

export const HO_SO_TRONG: HoSoThuongHieu = { giongVan: null, tuCam: [], hashtagBatBuoc: [], cauBatBuoc: [], cta: [], baiMau: [] };

const thuong = (s: string) => s.normalize("NFC").toLowerCase();

/** Từ cấm có trong chữ: so không phân biệt hoa thường, theo ranh giới chữ (Unicode) để "lừa" không khớp "lửa". */
export function timTuCam(chu: string, tuCam: readonly string[]): string[] {
  const c = thuong(chu);
  const kq: string[] = [];
  for (const t of tuCam) {
    const tt = thuong(t).trim();
    if (!tt) continue;
    const thoat = tt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(^|[^\\p{L}\\p{N}])${thoat}($|[^\\p{L}\\p{N}])`, "u").test(c)) kq.push(t);
  }
  return kq;
}

/**
 * Cảnh báo thương hiệu cho một nội dung (tiêu đề + nội dung đã gắn hashtag). Không chặn — người soạn quyết định.
 * `tienTo` = tên kênh khi kiểm nội dung riêng của kênh.
 */
export function kiemThuongHieu(nd: { tieuDe: string | null; noiDung: string }, hs: HoSoThuongHieu, tienTo = ""): string[] {
  const chu = `${nd.tieuDe ?? ""}\n${nd.noiDung}`;
  const c = thuong(chu);
  const p = tienTo ? `${tienTo}: ` : "";
  const ds: string[] = [];
  const cam = timTuCam(chu, hs.tuCam);
  if (cam.length) ds.push(`${p}Có từ nằm trong danh sách cấm của hồ sơ thương hiệu: ${cam.map((x) => `“${x}”`).join(", ")}.`);
  const thieuCau = hs.cauBatBuoc.filter((x) => !c.includes(thuong(x)));
  if (thieuCau.length) ds.push(`${p}Thiếu câu bắt buộc: ${thieuCau.map((x) => `“${x}”`).join(", ")}.`);
  const co = new Set((chu.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => thuong(h)));
  const thieuTag = hs.hashtagBatBuoc.filter((h) => !co.has(thuong(h)));
  if (thieuTag.length) ds.push(`${p}Thiếu hashtag bắt buộc: ${thieuTag.join(" ")}.`);
  return ds;
}
