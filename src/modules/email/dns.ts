import { Resolver } from "node:dns/promises";

/**
 * Kiểm tra DNS của tên miền gửi (EG-12, QĐ-98). Phần dựng danh sách bản ghi và chấm từng bản ghi là
 * hàm thuần (kiểm thử đơn vị); phần tra cứu dùng `node:dns` có hạn giờ, thay được trong bài thử.
 * Luôn chạy NGOÀI giao dịch CSDL (route dùng `xuLyApiNhieuBuoc`, QĐ-89).
 *
 * Hai phần, đúng thứ tự chủ tên miền làm được:
 *  - **Làm ngay**: DMARC `_dmarc.<tên miền gửi>` (p=none để quan sát trước) — không phụ thuộc AWS.
 *  - **Sau khi có AWS**: 3 CNAME DKIM (mã lấy từ SES), MX + SPF của tên miền MAIL FROM riêng.
 * Bản ghi nào chưa đủ dữ liệu để tra (chưa dán mã DKIM) vẫn có dòng, trạng thái "chưa khai".
 */

export type PhanBanGhi = "lam-ngay" | "sau-aws";
export type LoaiBanGhi = "TXT" | "CNAME" | "MX";

export interface BanGhiDns {
  ma: string;
  phan: PhanBanGhi;
  loai: LoaiBanGhi;
  /** Tên đầy đủ (FQDN, không dấu chấm cuối). */
  ten: string;
  /** Giá trị cần đặt (MX: "10 feedback-smtp…"). */
  giaTri: string;
  moTa: string;
  /** false = không đủ dữ liệu để tra (vd chưa dán mã DKIM). */
  traDuoc: boolean;
}

export interface CauHinhTenMien {
  tenMienGui: string;
  mailFrom: string | null;
  vung: string;
  dkim: string[];
  dmarcRua: string | null;
}

/** Tên miền MAIL FROM mặc định: bounce.<tên miền gửi>. */
export function mailFromMacDinh(tenMienGui: string): string {
  return `bounce.${tenMienGui}`;
}

export function banGhiCanCo(c: CauHinhTenMien): BanGhiDns[] {
  const mf = c.mailFrom || mailFromMacDinh(c.tenMienGui);
  const ds: BanGhiDns[] = [
    {
      ma: "dmarc",
      phan: "lam-ngay",
      loai: "TXT",
      ten: `_dmarc.${c.tenMienGui}`,
      giaTri: `v=DMARC1; p=none;${c.dmarcRua ? ` rua=mailto:${c.dmarcRua};` : ""} fo=1`,
      moTa: "DMARC chế độ quan sát (p=none): Gmail / Yahoo bắt buộc người gửi số lượng lớn phải có DMARC. Báo cáo gửi về hộp thư rua. Sau vài tuần ổn định mới nâng lên p=quarantine.",
      traDuoc: true,
    },
  ];
  for (let i = 0; i < 3; i++) {
    const t = c.dkim[i];
    ds.push({
      ma: `dkim-${i + 1}`,
      phan: "sau-aws",
      loai: "CNAME",
      ten: t ? `${t}._domainkey.${c.tenMienGui}` : `<mã DKIM ${i + 1}>._domainkey.${c.tenMienGui}`,
      giaTri: t ? `${t}.dkim.amazonses.com` : `<mã DKIM ${i + 1}>.dkim.amazonses.com`,
      moTa: "Easy DKIM của Amazon SES — ký thư bằng tên miền của mình. Mã lấy ở trang xác minh tên miền trong SES, dán vào ô Mã DKIM.",
      traDuoc: Boolean(t),
    });
  }
  ds.push(
    {
      ma: "mail-from-mx",
      phan: "sau-aws",
      loai: "MX",
      ten: mf,
      giaTri: `10 feedback-smtp.${c.vung}.amazonses.com`,
      moTa: "Tên miền MAIL FROM riêng (custom MAIL FROM) nhận thư báo lỗi của SES — để SPF khớp tên miền mình (DMARC).",
      traDuoc: true,
    },
    {
      ma: "mail-from-spf",
      phan: "sau-aws",
      loai: "TXT",
      ten: mf,
      giaTri: "v=spf1 include:amazonses.com ~all",
      moTa: "SPF của tên miền MAIL FROM: cho phép máy chủ SES gửi thư thay tên miền này.",
      traDuoc: true,
    },
  );
  return ds;
}

export type TrangThaiBanGhi = "dat" | "sai" | "thieu" | "loi" | "chua-khai";

export interface KetQuaTraCuu {
  /** Mã lỗi node:dns (ENODATA, ENOTFOUND, ETIMEOUT…) nếu tra hỏng. */
  loi?: string;
  txt?: string[][];
  cname?: string[];
  mx?: { exchange: string; priority: number }[];
}

export interface KetQuaBanGhi extends BanGhiDns {
  trangThai: TrangThaiBanGhi;
  thayDuoc: string;
  ghiChu: string;
}

const boCham = (s: string) => s.trim().toLowerCase().replace(/\.$/, "");

/** Chấm một bản ghi theo kết quả tra cứu. */
export function danhGiaBanGhi(b: BanGhiDns, kq: KetQuaTraCuu): KetQuaBanGhi {
  const ra = (trangThai: TrangThaiBanGhi, thayDuoc: string, ghiChu: string): KetQuaBanGhi => ({ ...b, trangThai, thayDuoc: thayDuoc.slice(0, 500), ghiChu });
  if (!b.traDuoc) return ra("chua-khai", "", "Chưa có mã DKIM — làm sau khi xác minh tên miền trong Amazon SES.");
  if (kq.loi) {
    if (["ENODATA", "ENOTFOUND", "NOTFOUND", "NODATA"].includes(kq.loi)) return ra("thieu", "", "Chưa thấy bản ghi này trên DNS (bản ghi mới có thể mất tới vài giờ mới thấy).");
    return ra("loi", "", `Không tra được DNS lúc này (${kq.loi}) — thử lại sau.`);
  }
  if (b.loai === "CNAME") {
    const ds = (kq.cname ?? []).map(boCham);
    if (!ds.length) return ra("thieu", "", "Chưa thấy CNAME.");
    return ds.includes(boCham(b.giaTri)) ? ra("dat", ds.join(", "), "") : ra("sai", ds.join(", "), `CNAME phải trỏ tới ${b.giaTri}.`);
  }
  if (b.loai === "MX") {
    const ds = kq.mx ?? [];
    if (!ds.length) return ra("thieu", "", "Chưa thấy MX.");
    const can = boCham(b.giaTri.split(/\s+/).pop()!);
    const thay = ds.map((m) => `${m.priority} ${boCham(m.exchange)}`).join(", ");
    return ds.some((m) => boCham(m.exchange) === can) ? ra("dat", thay, "") : ra("sai", thay, `MX phải trỏ tới ${can}.`);
  }
  // TXT: mỗi bản ghi có thể bị chia thành nhiều chuỗi 255 ký tự — nối lại.
  const ds = (kq.txt ?? []).map((m) => m.join(""));
  if (b.ma === "dmarc") {
    const dm = ds.filter((t) => /^v=DMARC1\b/i.test(t.trim()));
    if (!dm.length) return ra("thieu", ds.join(" | "), "Chưa có bản ghi DMARC.");
    if (dm.length > 1) return ra("sai", dm.join(" | "), "Có nhiều hơn một bản ghi DMARC — chỉ được một.");
    const p = /(?:^|;)\s*p\s*=\s*(none|quarantine|reject)\s*(?:;|$)/i.exec(dm[0]);
    if (!p) return ra("sai", dm[0], "Bản ghi DMARC thiếu chính sách p=none / quarantine / reject.");
    const coRua = /(?:^|;)\s*rua\s*=/i.test(dm[0]);
    return ra("dat", dm[0], coRua ? "" : "Nên thêm rua=mailto:… để nhận báo cáo DMARC.");
  }
  const spf = ds.filter((t) => /^v=spf1\b/i.test(t.trim()));
  if (!spf.length) return ra("thieu", ds.join(" | "), "Chưa có bản ghi SPF.");
  if (spf.length > 1) return ra("sai", spf.join(" | "), "Có nhiều hơn một bản ghi SPF — gộp lại thành một.");
  return /\binclude:amazonses\.com\b/i.test(spf[0]) ? ra("dat", spf[0], "") : ra("sai", spf[0], "SPF phải có include:amazonses.com.");
}

// ---------------------------------------------------------------------------
// Tra cứu (thay được trong bài thử)
// ---------------------------------------------------------------------------

export interface BoTraDns {
  txt(ten: string): Promise<string[][]>;
  cname(ten: string): Promise<string[]>;
  mx(ten: string): Promise<{ exchange: string; priority: number }[]>;
}

const HAN_MOI_LAN_MS = 3_000;

function boTraThat(): BoTraDns {
  const r = new Resolver({ timeout: HAN_MOI_LAN_MS, tries: 2 });
  return { txt: (t) => r.resolveTxt(t), cname: (t) => r.resolveCname(t), mx: (t) => r.resolveMx(t) };
}

const bienToanCuc = globalThis as unknown as { boTraDnsThu?: BoTraDns | null };

/** Chỉ dùng trong bài thử. `null` = quay về node:dns thật. */
export function datBoTraDns(b: BoTraDns | null): void {
  bienToanCuc.boTraDnsThu = b;
}

const HAN_TONG_MS = 10_000;

async function traMot(bo: BoTraDns, b: BanGhiDns): Promise<KetQuaTraCuu> {
  if (!b.traDuoc) return {};
  const viec = (async (): Promise<KetQuaTraCuu> => {
    if (b.loai === "CNAME") return { cname: await bo.cname(b.ten) };
    if (b.loai === "MX") return { mx: await bo.mx(b.ten) };
    return { txt: await bo.txt(b.ten) };
  })();
  const het = new Promise<KetQuaTraCuu>((ok) => setTimeout(() => ok({ loi: "ETIMEOUT" }), HAN_TONG_MS).unref?.());
  try {
    return await Promise.race([viec, het]);
  } catch (e) {
    return { loi: (e as { code?: string }).code ?? "LOI" };
  }
}

/** Tra mọi bản ghi song song, mỗi bản ghi có hạn giờ. Không bao giờ ném lỗi. */
export async function kiemTraDns(c: CauHinhTenMien): Promise<KetQuaBanGhi[]> {
  const bo = bienToanCuc.boTraDnsThu ?? boTraThat();
  const ds = banGhiCanCo(c);
  const kq = await Promise.all(ds.map((b) => traMot(bo, b)));
  return ds.map((b, i) => danhGiaBanGhi(b, kq[i]));
}
