import { LoiNghiepVu } from "./loi";
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Mã hóa bí mật lưu trong CSDL — mật khẩu SMTP, khóa bí mật TOTP (QĐ-68).
 *
 * AES-256-GCM, khóa 32 byte đọc từ biến môi trường `APP_ENC_KEY` (base64). Mỗi lần mã hóa
 * một IV ngẫu nhiên 12 byte. **Ngữ cảnh** (ví dụ `smtp:<tenantId>`, `totp:<userId>`) đi vào
 * phần AAD: chép chuỗi mã hóa của người này sang dòng của người khác thì giải mã hỏng, không
 * ra bí mật của người kia.
 *
 * Dạng lưu: `v1:<iv>:<tag>:<bản mã>` (base64url). Tiền tố phiên bản để sau này đổi thuật toán
 * hoặc xoay khóa mà vẫn đọc được bản cũ; CSDL có CHECK chỉ nhận chuỗi bắt đầu bằng `v1:`.
 *
 * Thiếu khóa thì **ném lỗi rõ ràng**, không bao giờ lùi về lưu dạng thuần.
 */

export class LoiKhoaMaHoa extends Error {
  constructor(message = "Máy chủ chưa đặt APP_ENC_KEY (khóa mã hóa 32 byte, base64). Sinh bằng: openssl rand -base64 32") {
    super(message);
    this.name = "LoiKhoaMaHoa";
  }
}

/** Đọc và kiểm khóa. Xuất ra để kiểm thử đơn vị truyền khóa giả. */
export function docKhoa(giaTri: string | undefined = process.env.APP_ENC_KEY): Buffer {
  if (!giaTri) throw new LoiKhoaMaHoa();
  const khoa = Buffer.from(giaTri.trim(), "base64");
  if (khoa.length !== 32) throw new LoiKhoaMaHoa("APP_ENC_KEY phải là đúng 32 byte mã hóa base64 (openssl rand -base64 32).");
  return khoa;
}

export function coKhoaMaHoa(): boolean {
  try {
    docKhoa();
    return true;
  } catch {
    return false;
  }
}

/** Khóa con cho từng mục đích (HKDF) — khóa mã hóa và khóa ký liên kết không dùng chung một chuỗi byte. */
export function khoaCon(mucDich: string, khoa: Buffer = docKhoa()): Buffer {
  return Buffer.from(hkdfSync("sha256", khoa, Buffer.alloc(0), `cowork:${mucDich}`, 32));
}

export function maHoa(banRo: string, ngucanh: string, khoa: Buffer = docKhoa()): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", khoaCon("ma-hoa", khoa), iv);
  c.setAAD(Buffer.from(ngucanh, "utf8"));
  const ma = Buffer.concat([c.update(banRo, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ma.toString("base64url")].join(":");
}

export function giaiMa(chuoi: string, ngucanh: string, khoa: Buffer = docKhoa()): string {
  const [pb, iv, tag, ma] = chuoi.split(":");
  if (pb !== "v1" || !iv || !tag || ma === undefined) throw new Error("Chuỗi mã hóa sai dạng.");
  const d = createDecipheriv("aes-256-gcm", khoaCon("ma-hoa", khoa), Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(ngucanh, "utf8"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ma, "base64url")), d.final()]).toString("utf8");
}

/** HMAC-SHA256 có khóa con theo mục đích. Dùng cho mã ký liên kết và băm mã khôi phục. */
export function hmac(mucDich: string, duLieu: string | Buffer, khoa: Buffer = docKhoa()): Buffer {
  return createHmac("sha256", khoaCon(mucDich, khoa)).update(duLieu).digest();
}

/** So sánh hai bộ byte trong thời gian không phụ thuộc nội dung. */
export function bangNhau(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Giải mã cho nghiệp vụ: lỗi khóa (thiếu `APP_ENC_KEY`, khóa đã bị đổi, bản mã hỏng) thành
 * `LoiNghiepVu` 503 mã `khoa-ma-hoa-khong-khop` với câu tiếng Việt nói phải làm gì — thay vì một
 * lỗi giải mã thô thành 500 "Hệ thống gặp lỗi". Không đưa bản mã hay chi tiết mật mã vào câu lỗi.
 */
export function giaiMaNghiepVu(chuoi: string, ngucanh: string, viec: string, cachSua: string): string {
  try {
    return giaiMa(chuoi, ngucanh);
  } catch (e) {
    const thieuKhoa = e instanceof LoiKhoaMaHoa;
    console.error(`[ma-hoa] không giải mã được ${viec} (ngữ cảnh ${ngucanh.split(":")[0]}): ${thieuKhoa ? e.message : "khóa không khớp hoặc bản mã hỏng"}`);
    throw new LoiNghiepVu(
      thieuKhoa
        ? `Máy chủ chưa đặt APP_ENC_KEY (hoặc đặt sai độ dài) nên không giải mã được ${viec}. Báo quản trị máy chủ đặt lại đúng khóa đã dùng khi lưu.`
        : `Không giải mã được ${viec}: APP_ENC_KEY trên máy chủ không khớp với khóa lúc lưu, hoặc dữ liệu mã hóa đã hỏng. Kiểm lại APP_ENC_KEY; nếu khóa cũ đã mất thì ${cachSua}.`,
      503,
      "khoa-ma-hoa-khong-khop",
    );
  }
}
