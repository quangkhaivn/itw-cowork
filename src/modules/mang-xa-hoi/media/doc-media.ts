/**
 * Đọc THÔNG SỐ media (0.24.0) — thuần, không thư viện, không chuyển mã (QĐ-212):
 *  - Ảnh JPEG / PNG / GIF / WebP: rộng × cao (đọc tiêu đề tệp).
 *  - Video MP4 / MOV (ISO BMFF): thời lượng (mvhd), rộng × cao của rãnh hình (tkhd, có tính ma trận xoay 90° của
 *    video quay dọc trên điện thoại), mã hóa hình (stsd: avc1 / hvc1 / hev1…).
 * Đọc hỏng → trả `null` từng trường; luật nền tảng coi "không đọc được" là vi phạm có lời giải thích, không đoán.
 */

export interface ThongSoAnh {
  rong: number | null;
  cao: number | null;
}

export interface ThongSoVideo {
  rong: number | null;
  cao: number | null;
  thoiLuongGiay: number | null;
  maHoa: string | null;
}

function u16be(b: Uint8Array, i: number) {
  return (b[i] << 8) | b[i + 1];
}
function u32be(b: Uint8Array, i: number) {
  return ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
}
function u16le(b: Uint8Array, i: number) {
  return b[i] | (b[i + 1] << 8);
}
function u24le(b: Uint8Array, i: number) {
  return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
}
function chu(b: Uint8Array, i: number, n: number) {
  return String.fromCharCode(...b.subarray(i, i + n));
}

export function docThongSoAnh(mime: string, b: Uint8Array): ThongSoAnh {
  const rong: ThongSoAnh = { rong: null, cao: null };
  try {
    if (mime === "image/png") {
      if (b.length >= 24 && chu(b, 12, 4) === "IHDR") return { rong: u32be(b, 16), cao: u32be(b, 20) };
      return rong;
    }
    if (mime === "image/gif") {
      if (b.length >= 10) return { rong: u16le(b, 6), cao: u16le(b, 8) };
      return rong;
    }
    if (mime === "image/webp") {
      if (b.length < 30 || chu(b, 0, 4) !== "RIFF" || chu(b, 8, 4) !== "WEBP") return rong;
      const loai = chu(b, 12, 4);
      if (loai === "VP8X") return { rong: u24le(b, 24) + 1, cao: u24le(b, 27) + 1 };
      if (loai === "VP8L") {
        const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
        return { rong: (v & 0x3fff) + 1, cao: ((v >>> 14) & 0x3fff) + 1 };
      }
      if (loai === "VP8 ") return { rong: u16le(b, 26) & 0x3fff, cao: u16le(b, 28) & 0x3fff };
      return rong;
    }
    if (mime === "image/jpeg") {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) {
          i++;
          continue;
        }
        const m = b[i + 1];
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) {
          i += m === 0xff ? 1 : 2;
          continue;
        }
        const dai = u16be(b, i + 2);
        // SOF0..SOF15 trừ DHT (C4), JPG (C8), DAC (CC).
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { cao: u16be(b, i + 5), rong: u16be(b, i + 7) };
        if (m === 0xda) break;
        i += 2 + dai;
      }
      return rong;
    }
  } catch {
    /* tệp hỏng */
  }
  return rong;
}

interface Hop {
  loai: string;
  dau: number; // vị trí nội dung (sau tiêu đề hộp)
  cuoi: number; // vị trí hết hộp
}

function cacHop(b: Uint8Array, tu: number, den: number): Hop[] {
  const ds: Hop[] = [];
  let i = tu;
  while (i + 8 <= den) {
    let co = u32be(b, i);
    const loai = chu(b, i + 4, 4);
    let tieuDe = 8;
    if (co === 1) {
      if (i + 16 > den) break;
      // Hộp 64-bit: phần cao phải bằng 0 với tệp < 4 GB.
      const cao = u32be(b, i + 8);
      if (cao !== 0) break;
      co = u32be(b, i + 12);
      tieuDe = 16;
    } else if (co === 0) co = den - i;
    if (co < tieuDe || i + co > den) {
      // Hộp cụt (tệp tải dở / mdat ở cuối bị cắt): vẫn ghi để không mất moov đứng trước.
      ds.push({ loai, dau: i + tieuDe, cuoi: den });
      break;
    }
    ds.push({ loai, dau: i + tieuDe, cuoi: i + co });
    i += co;
  }
  return ds;
}

function tim(b: Uint8Array, cha: Hop | null, loai: string): Hop | undefined {
  return cacHop(b, cha ? cha.dau : 0, cha ? cha.cuoi : b.length).find((h) => h.loai === loai);
}

export function docThongSoVideo(b: Uint8Array): ThongSoVideo {
  const kq: ThongSoVideo = { rong: null, cao: null, thoiLuongGiay: null, maHoa: null };
  try {
    const moov = tim(b, null, "moov");
    if (!moov) return kq;
    const mvhd = tim(b, moov, "mvhd");
    if (mvhd) {
      const ver = b[mvhd.dau];
      if (ver === 1) {
        const ts = u32be(b, mvhd.dau + 20);
        const dur = u32be(b, mvhd.dau + 24) * 2 ** 32 + u32be(b, mvhd.dau + 28);
        if (ts > 0) kq.thoiLuongGiay = dur / ts;
      } else {
        const ts = u32be(b, mvhd.dau + 12);
        const dur = u32be(b, mvhd.dau + 16);
        if (ts > 0) kq.thoiLuongGiay = dur / ts;
      }
    }
    for (const trak of cacHop(b, moov.dau, moov.cuoi).filter((h) => h.loai === "trak")) {
      const mdia = tim(b, trak, "mdia");
      const hdlr = mdia ? tim(b, mdia, "hdlr") : undefined;
      if (!hdlr || chu(b, hdlr.dau + 8, 4) !== "vide") continue;
      const tkhd = tim(b, trak, "tkhd");
      if (tkhd) {
        const ver = b[tkhd.dau];
        // tkhd: ver/flags(4) + [v1: 8+8+4+4+8 | v0: 4+4+4+4+4] + 8 reserved + 2 layer + 2 alt + 2 volume + 2 reserved + 36 ma trận + 4 rộng + 4 cao
        const dauMaTran = tkhd.dau + 4 + (ver === 1 ? 32 : 20) + 8 + 8;
        const a = u32be(b, dauMaTran) | 0;
        const bb = u32be(b, dauMaTran + 4) | 0;
        const w = u32be(b, dauMaTran + 36) / 65536;
        const h = u32be(b, dauMaTran + 40) / 65536;
        // Ma trận xoay 90° / 270°: a = 0, b = ±1 (16.16) → video hiện dọc dù mã hóa ngang.
        const xoay = a === 0 && Math.abs(bb) === 65536;
        kq.rong = Math.round(xoay ? h : w);
        kq.cao = Math.round(xoay ? w : h);
      }
      const minf = mdia ? tim(b, mdia, "minf") : undefined;
      const stbl = minf ? tim(b, minf, "stbl") : undefined;
      const stsd = stbl ? tim(b, stbl, "stsd") : undefined;
      if (stsd && stsd.dau + 16 <= stsd.cuoi) kq.maHoa = chu(b, stsd.dau + 12, 4).trim();
      break;
    }
  } catch {
    /* tệp hỏng */
  }
  return kq;
}
