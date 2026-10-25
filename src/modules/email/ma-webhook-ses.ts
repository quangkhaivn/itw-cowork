import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { gocUrl } from "./ma-lien-ket";

/**
 * Mã webhook sự kiện SES (EG-02). Mã = "ses_" + base64url( tenant[16] · ngẫu nhiên[24] ).
 *  - Mang **doanh nghiệp** ở 16 byte đầu để route mở đúng `voiTenant()` mà không phải tra chéo mọi
 *    doanh nghiệp (RLS cấm) — biết doanh nghiệp không giúp đoán 24 byte ngẫu nhiên.
 *  - Máy chủ chỉ giữ SHA-256 của cả mã, so trong thời gian hằng; đổi mã → mã cũ vô hiệu ngay.
 */

const DAU = "ses_";
const LA_MA = /^ses_[A-Za-z0-9_-]{54}$/;

function byteVeUuid(b: Buffer): string {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function sinhMaWebhookSes(tenantId: string): string {
  const t = Buffer.from(tenantId.replace(/-/g, ""), "hex");
  if (t.length !== 16) throw new Error("tenantId không hợp lệ");
  return DAU + Buffer.concat([t, randomBytes(24)]).toString("base64url");
}

/** Doanh nghiệp ghi trong mã. Sai khuôn → null (không truy vấn gì). */
export function tenantCuaMaWebhook(ma: string): string | null {
  if (!LA_MA.test(ma)) return null;
  const b = Buffer.from(ma.slice(DAU.length), "base64url");
  return b.length === 40 ? byteVeUuid(b.subarray(0, 16)) : null;
}

export function bamMaWebhookSes(ma: string): string {
  return createHash("sha256").update(ma, "utf8").digest("hex");
}

export function khopMaWebhookSes(ma: string, bamDaLuu: string | null | undefined): boolean {
  if (!bamDaLuu) return false;
  const a = Buffer.from(bamMaWebhookSes(ma), "utf8");
  const b = Buffer.from(bamDaLuu, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function urlWebhookSes(ma: string): string {
  return `${gocUrl()}/api/cong-khai/email/ses/${ma}`;
}
