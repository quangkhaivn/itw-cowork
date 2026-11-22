import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { aadBoc, docKhoaChu } from "../../src/modules/mang-xa-hoi/bao-mat/khoa-chu";
import type { BanNiemPhong } from "../../src/modules/mang-xa-hoi/bao-mat/niem-phong";

/**
 * MỞ niêm phong envelope — CHỈ worker (SEC-06, QĐ-194).
 *
 * Tệp nằm ở `worker/`, ngoài `src/`: route API, trang, service web không import được (luật ESLint `no-restricted-imports`
 * cho `src/**` + bài thử quét đồ thị import trong `thu:mang-xa-hoi`). Bản rõ chỉ sống trong bộ nhớ worker trong lúc gọi
 * nền tảng; không bao giờ ghi log, CSDL, nhật ký.
 */

type DongNiemPhong = Pick<BanNiemPhong, "ciphertext" | "iv" | "authTag" | "wrappedKey" | "keyVersion">;

function moDataKey(dong: DongNiemPhong, aad: string, khoa: Buffer): Buffer {
  const boc = Buffer.from(dong.wrappedKey);
  if (boc.length !== 60) throw new Error("Bản niêm phong sai dạng.");
  const d = createDecipheriv("aes-256-gcm", khoa, boc.subarray(0, 12));
  d.setAAD(Buffer.from(aadBoc(aad, dong.keyVersion), "utf8"));
  d.setAuthTag(boc.subarray(12, 28));
  return Buffer.concat([d.update(boc.subarray(28)), d.final()]);
}

export function moNiemPhong(dong: DongNiemPhong, aad: string, env: NodeJS.ProcessEnv = process.env): string {
  const { khoa } = docKhoaChu(dong.keyVersion, env);
  const dataKey = moDataKey(dong, aad, khoa);
  try {
    const d = createDecipheriv("aes-256-gcm", dataKey, Buffer.from(dong.iv));
    d.setAAD(Buffer.from(aad, "utf8"));
    d.setAuthTag(Buffer.from(dong.authTag));
    return Buffer.concat([d.update(Buffer.from(dong.ciphertext)), d.final()]).toString("utf8");
  } finally {
    dataKey.fill(0);
  }
}

/**
 * Xoay khóa: mở data key bằng khóa chủ cũ (phiên bản của dòng) rồi bọc lại bằng khóa chủ hiện tại. Bản mã dữ liệu giữ
 * nguyên — không cần giải mã bí mật.
 */
export function bocLaiKhoa(dong: DongNiemPhong, aad: string, env: NodeJS.ProcessEnv = process.env): { wrappedKey: Uint8Array<ArrayBuffer>; keyVersion: number } {
  const cu = docKhoaChu(dong.keyVersion, env);
  const moi = docKhoaChu(undefined, env);
  const dataKey = moDataKey(dong, aad, cu.khoa);
  try {
    const iv = randomBytes(12);
    const c = createCipheriv("aes-256-gcm", moi.khoa, iv);
    c.setAAD(Buffer.from(aadBoc(aad, moi.phienBan), "utf8"));
    const ma = Buffer.concat([c.update(dataKey), c.final()]);
    const b = Buffer.concat([iv, c.getAuthTag(), ma]);
    const u = new Uint8Array(new ArrayBuffer(b.length));
    u.set(b);
    return { wrappedKey: u, keyVersion: moi.phienBan };
  } finally {
    dataKey.fill(0);
  }
}
