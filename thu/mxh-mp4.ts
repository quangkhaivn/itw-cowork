/**
 * Dựng tệp MP4 tối thiểu (ISO BMFF: ftyp + moov[mvhd, trak[tkhd, mdia[hdlr vide, minf[stbl[stsd]]]]] + mdat) cho bài thử
 * — đủ để đọc thời lượng, rộng × cao, mã hóa. Không phát được (không có khung hình thật).
 */
function hop(loai: string, ...than: Buffer[]): Buffer {
  const noi = Buffer.concat(than);
  const dau = Buffer.alloc(8);
  dau.writeUInt32BE(8 + noi.length, 0);
  dau.write(loai, 4, "latin1");
  return Buffer.concat([dau, noi]);
}

function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n >>> 0, 0);
  return b;
}

function maTran(xoay: boolean): Buffer {
  const b = Buffer.alloc(36);
  const v = xoay ? [0, 0x00010000, 0, -0x00010000, 0, 0, 0, 0, 0x40000000] : [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];
  v.forEach((x, i) => b.writeInt32BE(x, i * 4));
  return b;
}

export function taoMp4(o: { rong: number; cao: number; giay: number; maHoa?: string; tongByte?: number; xoay?: boolean; quicktime?: boolean }): Buffer {
  const ts = 1000;
  const ftyp = hop("ftyp", Buffer.from(o.quicktime ? "qt  " : "isom", "latin1"), u32(0x200), Buffer.from(o.quicktime ? "qt  " : "isommp41", "latin1"));
  const mvhd = hop("mvhd", u32(0), u32(0), u32(0), u32(ts), u32(Math.round(o.giay * ts)), u32(0x00010000), Buffer.from([1, 0]), Buffer.alloc(10), maTran(false), Buffer.alloc(24), u32(2));
  // Video xoay 90°: rộng/cao mã hóa là (cao, rộng), ma trận xoay → hiện (rộng, cao).
  const [w, h] = o.xoay ? [o.cao, o.rong] : [o.rong, o.cao];
  const tkhd = hop("tkhd", u32(3), u32(0), u32(0), u32(1), u32(0), u32(Math.round(o.giay * ts)), Buffer.alloc(8), Buffer.alloc(8), maTran(Boolean(o.xoay)), u32(w * 65536), u32(h * 65536));
  const hdlr = hop("hdlr", u32(0), u32(0), Buffer.from("vide", "latin1"), Buffer.alloc(12), Buffer.from([0]));
  const stsd = hop("stsd", u32(0), u32(1), hop((o.maHoa ?? "avc1").padEnd(4, " ").slice(0, 4), Buffer.alloc(78)));
  const trak = hop("trak", tkhd, hop("mdia", hdlr, hop("minf", hop("stbl", stsd))));
  const moov = hop("moov", mvhd, trak);
  const dau = Buffer.concat([ftyp, moov]);
  const conLai = Math.max(16, (o.tongByte ?? dau.length + 4096) - dau.length - 8);
  const du = Buffer.alloc(conLai);
  for (let i = 0; i < du.length; i++) du[i] = (i * 31 + 7) & 0xff;
  return Buffer.concat([dau, hop("mdat", du)]);
}
