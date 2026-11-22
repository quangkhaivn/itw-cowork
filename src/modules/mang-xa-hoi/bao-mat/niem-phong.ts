import { createCipheriv, randomBytes } from "node:crypto";
import { aadBoc, docKhoaChu } from "./khoa-chu";

/**
 * NIÊM PHONG envelope (SEC-05) — phía ứng dụng web chỉ có hàm này.
 *
 * Mỗi lần niêm phong: sinh data key 32 byte ngẫu nhiên → AES-256-GCM mã bản rõ (IV 12 byte, AAD) → bọc data key bằng khóa
 * chủ (AES-256-GCM, IV riêng, AAD = phiên bản + AAD gốc) → xóa data key khỏi bộ nhớ.
 *
 * Hàm MỞ niêm phong KHÔNG nằm trong `src/` — chỉ có ở `worker/mang-xa-hoi/giai-ma.ts` (SEC-06). Route / trang không import
 * được thư mục `worker/` (luật ESLint + bài thử quét đồ thị import trong `thu:mang-xa-hoi`).
 */

export interface BanNiemPhong {
  ciphertext: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  authTag: Uint8Array<ArrayBuffer>;
  /** iv(12) | tag(16) | data key đã mã hóa (32). */
  wrappedKey: Uint8Array<ArrayBuffer>;
  keyVersion: number;
}

function sangU8(b: Buffer): Uint8Array<ArrayBuffer> {
  const u = new Uint8Array(new ArrayBuffer(b.length));
  u.set(b);
  return u;
}

export function niemPhong(banRo: string, aad: string, khoaChu: { khoa: Buffer; phienBan: number } = docKhoaChu()): BanNiemPhong {
  const dataKey = randomBytes(32);
  try {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", dataKey, iv);
    c.setAAD(Buffer.from(aad, "utf8"));
    const ma = Buffer.concat([c.update(banRo, "utf8"), c.final()]);
    const tag = c.getAuthTag();

    const ivBoc = randomBytes(12);
    const b = createCipheriv("aes-256-gcm", khoaChu.khoa, ivBoc);
    b.setAAD(Buffer.from(aadBoc(aad, khoaChu.phienBan), "utf8"));
    const keyMa = Buffer.concat([b.update(dataKey), b.final()]);
    const boc = Buffer.concat([ivBoc, b.getAuthTag(), keyMa]);
    return { ciphertext: sangU8(ma), iv: sangU8(iv), authTag: sangU8(tag), wrappedKey: sangU8(boc), keyVersion: khoaChu.phienBan };
  } finally {
    dataKey.fill(0);
  }
}
