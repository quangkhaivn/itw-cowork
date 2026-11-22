import { lookup } from "node:dns/promises";
import { request as yeuCauHttp, type IncomingHttpHeaders } from "node:http";
import { request as yeuCauHttps } from "node:https";
import { isIP } from "node:net";
import { laDiaChiNoiBo, laLoopback, laTenMayBiChan } from "./dia-chi-ip";

/**
 * Gọi HTTP ra ngoài tới địa chỉ DO NGƯỜI DÙNG NHẬP (site WordPress) hoặc API nền tảng — chống SSRF (SEC-04, QĐ-196):
 *
 *  1. Chỉ `https:`. `http://localhost` chỉ khi bài thử bật `choPhepLocalhostChoBaiThu` (cấm khi NODE_ENV=production).
 *  2. Phân giải DNS MỘT lần, kiểm MỌI địa chỉ trả về (nội bộ, loopback, link-local, metadata, CGNAT, ULA…), rồi GHIM địa
 *     chỉ đã kiểm vào kết nối (`lookup` riêng) — DNS đổi giữa lúc kiểm và lúc nối (DNS rebinding) không lách được.
 *  3. Không theo chuyển hướng sang máy khác / giao thức khác; cùng máy thì theo tối đa 3 lần, chỉ với GET.
 *  4. Có hạn giờ; phân biệt hết giờ TRƯỚC khi gửi xong (thử lại an toàn) và SAU khi đã gửi (kết quả chưa rõ → đối soát).
 *  5. Trần dung lượng phản hồi (mặc định 5 MB).
 *
 * Không ghi log tiêu đề / thân yêu cầu (có thể chứa mật khẩu ứng dụng).
 */

export type LoaiLoiMang = "chan-dia-chi" | "dns" | "ket-noi" | "het-gio-truoc-gui" | "het-gio-sau-gui" | "dut-sau-gui" | "qua-lon" | "chuyen-huong" | "giao-thuc";

export class LoiGoiMang extends Error {
  constructor(
    public readonly loai: LoaiLoiMang,
    message: string,
    /** Yêu cầu đã gửi xong tới máy kia chưa — quyết định đăng lại được hay phải đối soát. */
    public readonly daGui: boolean,
  ) {
    super(message);
    this.name = "LoiGoiMang";
  }
}

let choPhepLocalhost = false;
/** CHỈ bài thử: cho gọi http://localhost / 127.0.0.1 (máy chủ WordPress giả). */
export function choPhepLocalhostChoBaiThu(bat: boolean): void {
  if (bat && process.env.NODE_ENV === "production") throw new Error("Không bật gọi localhost trên môi trường thật.");
  choPhepLocalhost = bat;
}
export function dangChoPhepLocalhost(): boolean {
  return choPhepLocalhost;
}

export interface YeuCauAnToan {
  url: string;
  phuongThuc?: "GET" | "POST" | "PUT" | "DELETE";
  tieuDe?: Record<string, string>;
  than?: Buffer | string;
  hanMs: number;
  tranPhanHoi?: number;
}

export interface PhanHoiAnToan {
  status: number;
  tieuDe: IncomingHttpHeaders;
  than: Buffer;
}

type DiaChiDaKiem = { address: string; family: 4 | 6 };

function laTenLocalhost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1";
}

/** Kiểm URL + phân giải + kiểm địa chỉ. Xuất ra để bài thử kiểm từng nhánh mà không cần nối mạng. */
export async function kiemDiaChi(url: URL, phanGiai: (h: string) => Promise<DiaChiDaKiem[]> = phanGiaiDns): Promise<DiaChiDaKiem> {
  const cucBo = choPhepLocalhost && laTenLocalhost(url.hostname);
  if (url.protocol !== "https:" && !(cucBo && url.protocol === "http:")) {
    throw new LoiGoiMang("giao-thuc", "Chỉ gọi được địa chỉ HTTPS.", false);
  }
  if (url.username || url.password) throw new LoiGoiMang("chan-dia-chi", "Địa chỉ không được chứa tên đăng nhập / mật khẩu.", false);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (laTenMayBiChan(host)) throw new LoiGoiMang("chan-dia-chi", "Địa chỉ trỏ vào máy nội bộ — bị chặn.", false);
  let ds: DiaChiDaKiem[];
  if (isIP(host)) ds = [{ address: host, family: isIP(host) as 4 | 6 }];
  else {
    try {
      ds = await phanGiai(host);
    } catch {
      throw new LoiGoiMang("dns", `Không tìm thấy máy chủ ${host} (DNS).`, false);
    }
  }
  if (ds.length === 0) throw new LoiGoiMang("dns", `Không tìm thấy máy chủ ${host} (DNS).`, false);
  for (const d of ds) {
    if (cucBo && laLoopback(d.address)) continue;
    if (laDiaChiNoiBo(d.address)) throw new LoiGoiMang("chan-dia-chi", "Địa chỉ trỏ vào mạng nội bộ / máy chủ đặc biệt — bị chặn.", false);
  }
  return ds[0];
}

async function phanGiaiDns(host: string): Promise<DiaChiDaKiem[]> {
  const ds = await lookup(host, { all: true, verbatim: true });
  return ds.map((d) => ({ address: d.address, family: d.family as 4 | 6 }));
}

function motLan(url: URL, dc: DiaChiDaKiem, yc: YeuCauAnToan): Promise<PhanHoiAnToan> {
  const tran = yc.tranPhanHoi ?? 5 * 1024 * 1024;
  const than = yc.than === undefined ? undefined : Buffer.isBuffer(yc.than) ? yc.than : Buffer.from(yc.than, "utf8");
  return new Promise((xong, hong) => {
    let daGui = false;
    let ketThuc = false;
    const ham = url.protocol === "https:" ? yeuCauHttps : yeuCauHttp;
    const req = ham(
      {
        protocol: url.protocol,
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || undefined,
        path: `${url.pathname}${url.search}`,
        method: yc.phuongThuc ?? "GET",
        headers: { "User-Agent": "TGTH-Cowork/0.23", Accept: "application/json", ...(yc.tieuDe ?? {}), ...(than ? { "Content-Length": String(than.length) } : {}) },
        agent: false,
        // Ghim địa chỉ đã kiểm — không phân giải lại.
        lookup: ((_h: string, o: { all?: boolean }, cb: (e: Error | null, a: unknown, f?: number) => void) => {
          if (o?.all) cb(null, [{ address: dc.address, family: dc.family }]);
          else cb(null, dc.address, dc.family);
        }) as never,
      },
      (res) => {
        const manh: Buffer[] = [];
        let tong = 0;
        res.on("data", (c: Buffer) => {
          tong += c.length;
          if (tong > tran) {
            ketThuc = true;
            clearTimeout(hen);
            req.destroy();
            hong(new LoiGoiMang("qua-lon", "Phản hồi của máy chủ vượt dung lượng cho phép.", true));
            return;
          }
          manh.push(c);
        });
        res.on("end", () => {
          if (ketThuc) return;
          ketThuc = true;
          clearTimeout(hen);
          xong({ status: res.statusCode ?? 0, tieuDe: res.headers, than: Buffer.concat(manh) });
        });
        res.on("error", () => {
          if (ketThuc) return;
          ketThuc = true;
          clearTimeout(hen);
          hong(new LoiGoiMang("dut-sau-gui", "Kết nối đứt khi đang nhận phản hồi.", true));
        });
      },
    );
    const hen = setTimeout(() => {
      if (ketThuc) return;
      ketThuc = true;
      req.destroy();
      hong(daGui
        ? new LoiGoiMang("het-gio-sau-gui", "Đã gửi yêu cầu nhưng quá hạn chờ trả lời.", true)
        : new LoiGoiMang("het-gio-truoc-gui", "Quá hạn kết nối tới máy chủ.", false));
    }, yc.hanMs);
    req.on("finish", () => {
      daGui = true;
    });
    req.on("error", (e: NodeJS.ErrnoException) => {
      if (ketThuc) return;
      ketThuc = true;
      clearTimeout(hen);
      hong(daGui
        ? new LoiGoiMang("dut-sau-gui", "Kết nối đứt sau khi đã gửi yêu cầu.", true)
        : new LoiGoiMang("ket-noi", `Không kết nối được máy chủ (${e.code ?? "lỗi mạng"}).`, false));
    });
    if (than) req.write(than);
    req.end();
  });
}

export async function goiAnToan(yc: YeuCauAnToan, phanGiai?: (h: string) => Promise<DiaChiDaKiem[]>): Promise<PhanHoiAnToan> {
  let url: URL;
  try {
    url = new URL(yc.url);
  } catch {
    throw new LoiGoiMang("giao-thuc", "Địa chỉ không hợp lệ.", false);
  }
  const goc = url;
  for (let lan = 0; lan <= 3; lan++) {
    const dc = await kiemDiaChi(url, phanGiai);
    const ph = await motLan(url, dc, yc);
    if (ph.status < 300 || ph.status >= 400 || !ph.tieuDe.location) return ph;
    let toi: URL;
    try {
      toi = new URL(String(ph.tieuDe.location), url);
    } catch {
      throw new LoiGoiMang("chuyen-huong", "Máy chủ chuyển hướng tới địa chỉ không hợp lệ.", true);
    }
    if (toi.host !== goc.host || toi.protocol !== goc.protocol) {
      throw new LoiGoiMang("chuyen-huong", `Máy chủ chuyển hướng sang địa chỉ khác (${toi.host}) — không theo. Kiểm lại địa chỉ site (www / https).`, true);
    }
    if ((yc.phuongThuc ?? "GET") !== "GET") {
      throw new LoiGoiMang("chuyen-huong", "Máy chủ trả chuyển hướng cho yêu cầu ghi — không theo. Kiểm lại địa chỉ site.", true);
    }
    url = toi;
  }
  throw new LoiGoiMang("chuyen-huong", "Chuyển hướng quá nhiều lần.", true);
}
