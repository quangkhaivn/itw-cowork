import { createVerify, X509Certificate } from "node:crypto";
import { z } from "zod";
import { vungCuaTopic } from "./tinh-toan";

/**
 * Amazon SNS — xác minh thông điệp HTTPS mà SNS đẩy về webhook sự kiện SES (EG-03, QĐ-95).
 *
 * Phần thuần (dựng chuỗi ký, kiểm URL chứng chỉ, đọc sự kiện SES) có kiểm thử đơn vị. Phần mạng
 * (tải chứng chỉ, gọi SubscribeURL) đi qua `MangSns` — bài thử cắm bản giả bằng `datMangSns()` và
 * ký thông điệp bằng chứng chỉ tự ký; không bài thử nào gọi ra AWS.
 *
 * Luật:
 *  - Chỉ tải chứng chỉ từ `https://sns.<vùng>.amazonaws.com/…pem` — host so bằng biểu thức chặt,
 *    không cổng, không tên đăng nhập, không chuyển hướng (redirect: "error"), trần kích thước.
 *  - Vùng của host chứng chỉ phải trùng vùng trong TopicArn.
 *  - SignatureVersion 1 = SHA1withRSA, 2 = SHA256withRSA (AWS khuyên dùng 2).
 *  - SubscribeURL chỉ gọi khi host đúng `sns.<vùng>.amazonaws.com` (https).
 */

// ---------------------------------------------------------------------------
// Lược đồ thông điệp
// ---------------------------------------------------------------------------

const chuoi = (toiDa: number) => z.string().max(toiDa);

export const LuocDoThongDiepSns = z.object({
  Type: z.enum(["Notification", "SubscriptionConfirmation", "UnsubscribeConfirmation"]),
  MessageId: z.string().min(1).max(100).regex(/^[A-Za-z0-9-]+$/),
  TopicArn: chuoi(300),
  Subject: chuoi(200).optional(),
  Message: z.string().max(262_144),
  Timestamp: chuoi(40),
  SignatureVersion: z.enum(["1", "2"]),
  Signature: z.string().min(16).max(2048).regex(/^[A-Za-z0-9+/=]+$/),
  SigningCertURL: chuoi(500),
  SubscribeURL: chuoi(2000).optional(),
  Token: chuoi(2000).optional(),
  UnsubscribeURL: chuoi(2000).optional(),
});
export type ThongDiepSns = z.infer<typeof LuocDoThongDiepSns>;

/**
 * Chuỗi được ký (theo tài liệu "Verifying the signatures of Amazon SNS messages"): mỗi khóa
 * một dòng tên, một dòng giá trị, theo thứ tự byte; Notification không có Subject thì bỏ cả cặp.
 */
export function chuoiKySns(m: ThongDiepSns): string {
  const khoa =
    m.Type === "Notification"
      ? (["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"] as const)
      : (["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"] as const);
  let s = "";
  for (const k of khoa) {
    const v = m[k];
    if (v === undefined) {
      if (k === "Subject") continue;
      throw new Error(`Thông điệp SNS thiếu ${k}`);
    }
    s += `${k}\n${v}\n`;
  }
  return s;
}

const LA_HOST_SNS = /^sns\.([a-z]{2}(?:-[a-z]+)+-\d)\.amazonaws\.com$/;

export { vungCuaTopic };

function docUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

/** URL chứng chỉ ký hợp lệ: https, host sns.<vùng>.amazonaws.com (đúng vùng nếu có), không cổng, đuôi .pem. */
export function laUrlChungChiSns(s: string, vung?: string | null): boolean {
  const u = docUrl(s);
  if (!u || u.protocol !== "https:" || u.port || u.username || u.password || u.search || u.hash) return false;
  const m = LA_HOST_SNS.exec(u.hostname);
  if (!m || (vung && m[1] !== vung)) return false;
  return /^\/[A-Za-z0-9._/-]+\.pem$/.test(u.pathname) && !u.pathname.includes("..");
}

/** SubscribeURL hợp lệ: https, host sns.<vùng>.amazonaws.com (đúng vùng nếu có), không cổng. */
export function laUrlDangKySns(s: string, vung?: string | null): boolean {
  const u = docUrl(s);
  if (!u || u.protocol !== "https:" || u.port || u.username || u.password) return false;
  const m = LA_HOST_SNS.exec(u.hostname);
  return Boolean(m) && (!vung || m![1] === vung);
}

/** Kiểm chữ ký bằng chứng chỉ PEM. Chứng chỉ hết hạn / chưa hiệu lực / sai → false. Không bao giờ ném lỗi. */
export function xacMinhChuKySns(m: ThongDiepSns, pem: string, bayGio: Date = new Date()): boolean {
  try {
    const cc = new X509Certificate(pem);
    if (bayGio < new Date(cc.validFrom) || bayGio > new Date(cc.validTo)) return false;
    const v = createVerify(m.SignatureVersion === "1" ? "RSA-SHA1" : "RSA-SHA256");
    v.update(chuoiKySns(m), "utf8");
    return v.verify(cc.publicKey, m.Signature, "base64");
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Mạng (thay được trong bài thử)
// ---------------------------------------------------------------------------

export interface MangSns {
  /** Tải chứng chỉ PEM (URL đã kiểm bằng `laUrlChungChiSns`). */
  layChungChi(url: string): Promise<string>;
  /** GET SubscribeURL để xác nhận đăng ký (URL đã kiểm bằng `laUrlDangKySns`). */
  xacNhanDangKy(url: string): Promise<void>;
}

const TOI_DA_BYTE_CHUNG_CHI = 16_384;
const HAN_GOI_MS = 5_000;

async function docGioiHan(r: Response, toiDa: number): Promise<string> {
  const khai = Number(r.headers.get("content-length") ?? "0");
  if (khai > toiDa) throw new Error("Phản hồi quá lớn");
  const b = Buffer.from(await r.arrayBuffer());
  if (b.length > toiDa) throw new Error("Phản hồi quá lớn");
  return b.toString("utf8");
}

const mangThat: MangSns = {
  async layChungChi(url) {
    const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(HAN_GOI_MS) });
    if (!r.ok) throw new Error(`Tải chứng chỉ SNS lỗi ${r.status}`);
    const pem = await docGioiHan(r, TOI_DA_BYTE_CHUNG_CHI);
    if (!pem.includes("-----BEGIN CERTIFICATE-----")) throw new Error("Không phải chứng chỉ PEM");
    return pem;
  },
  async xacNhanDangKy(url) {
    const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(HAN_GOI_MS) });
    if (!r.ok) throw new Error(`Xác nhận đăng ký SNS lỗi ${r.status}`);
    await docGioiHan(r, 65_536);
  },
};

const bienToanCuc = globalThis as unknown as { mangSnsThu?: MangSns | null; khoChungChiSns?: Map<string, { pem: string; het: number }> };

/** Chỉ dùng trong bài thử. `null` = quay về mạng thật. Xóa bộ nhớ đệm chứng chỉ. */
export function datMangSns(m: MangSns | null): void {
  bienToanCuc.mangSnsThu = m;
  bienToanCuc.khoChungChiSns = new Map();
}

function mang(): MangSns {
  return bienToanCuc.mangSnsThu ?? mangThat;
}

const GIU_CHUNG_CHI_MS = 6 * 3_600_000;
const TOI_DA_CHUNG_CHI_GIU = 32;

/** Tải chứng chỉ có bộ nhớ đệm (theo URL, tối đa 6 giờ, tối đa 32 mục). */
export async function layChungChiSns(url: string, bayGio = Date.now()): Promise<string> {
  const kho = (bienToanCuc.khoChungChiSns ??= new Map());
  const co = kho.get(url);
  if (co && co.het > bayGio) return co.pem;
  const pem = await mang().layChungChi(url);
  if (kho.size >= TOI_DA_CHUNG_CHI_GIU) kho.delete(kho.keys().next().value!);
  kho.set(url, { pem, het: bayGio + GIU_CHUNG_CHI_MS });
  return pem;
}

export async function goiXacNhanDangKySns(url: string): Promise<void> {
  await mang().xacNhanDangKy(url);
}

// ---------------------------------------------------------------------------
// Sự kiện SES (nội dung `Message` của Notification)
// ---------------------------------------------------------------------------

const nguoiNhanSes = z.object({ emailAddress: chuoi(320), diagnosticCode: chuoi(2000).optional(), status: chuoi(30).optional(), action: chuoi(30).optional() });

const LuocDoSuKienSes = z.object({
  /** Sự kiện qua configuration set. */
  eventType: chuoi(40).optional(),
  /** Thông báo theo danh tính (identity notifications) — cùng nội dung, khác tên khóa. */
  notificationType: chuoi(40).optional(),
  mail: z.object({
    messageId: chuoi(255),
    timestamp: chuoi(40).optional(),
    destination: z.array(chuoi(320)).max(50).optional(),
    tags: z.record(chuoi(256), z.array(chuoi(256)).max(10)).optional(),
  }),
  bounce: z
    .object({
      bounceType: chuoi(30),
      bounceSubType: chuoi(60).optional(),
      bouncedRecipients: z.array(nguoiNhanSes).max(50).default([]),
      timestamp: chuoi(40).optional(),
    })
    .optional(),
  complaint: z
    .object({
      complainedRecipients: z.array(z.object({ emailAddress: chuoi(320) })).max(50).default([]),
      complaintFeedbackType: chuoi(60).optional(),
      timestamp: chuoi(40).optional(),
    })
    .optional(),
  delivery: z.object({ timestamp: chuoi(40).optional(), recipients: z.array(chuoi(320)).max(50).optional(), smtpResponse: chuoi(1000).optional() }).optional(),
  reject: z.object({ reason: chuoi(500) }).optional(),
  failure: z.object({ errorMessage: chuoi(1000), templateName: chuoi(200).optional() }).optional(),
  deliveryDelay: z
    .object({ delayType: chuoi(60).optional(), delayedRecipients: z.array(nguoiNhanSes).max(50).optional(), expirationTime: chuoi(40).optional(), timestamp: chuoi(40).optional() })
    .optional(),
});

export type LoaiSuKienSes = "send" | "delivery" | "bounce" | "complaint" | "reject" | "rendering-failure" | "delivery-delay" | "khac";

const BANG_LOAI: Record<string, LoaiSuKienSes> = {
  Send: "send",
  Delivery: "delivery",
  Bounce: "bounce",
  Complaint: "complaint",
  Reject: "reject",
  "Rendering Failure": "rendering-failure",
  DeliveryDelay: "delivery-delay",
};

export interface SuKienSes {
  loai: LoaiSuKienSes;
  /** Tên gốc ("Bounce", "Rendering Failure"…) để ghi nhật ký. */
  tenGoc: string;
  sesMessageId: string;
  theTenant: string | null;
  theNguoiNhan: string | null;
  luc: Date | null;
  /** Permanent | Transient | Undetermined (chỉ với bounce). */
  loaiTraLai: "Permanent" | "Transient" | "Undetermined" | null;
  /** Các địa chỉ sự kiện nói tới (chữ thường). */
  diaChi: string[];
  /** Chi tiết đã lọc để lưu — không chứa nội dung thư. */
  chiTiet: Record<string, unknown>;
}

function ngay(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Đọc `Message` (chuỗi JSON) thành sự kiện SES đã chuẩn hóa. Sai khuôn → null. */
export function docSuKienSes(message: string): SuKienSes | null {
  let tho: unknown;
  try {
    tho = JSON.parse(message);
  } catch {
    return null;
  }
  const p = LuocDoSuKienSes.safeParse(tho);
  if (!p.success) return null;
  const e = p.data;
  const tenGoc = e.eventType ?? e.notificationType ?? "";
  const loai = BANG_LOAI[tenGoc] ?? "khac";
  const the = (k: string) => {
    const v = e.mail.tags?.[k]?.[0];
    return v && /^[A-Za-z0-9_-]{1,256}$/.test(v) ? v : null;
  };
  const thuong = (ds: string[] | undefined) => (ds ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean);
  let luc: Date | null = null;
  let loaiTraLai: SuKienSes["loaiTraLai"] = null;
  let diaChi: string[] = [];
  let chiTiet: Record<string, unknown> = {};
  switch (loai) {
    case "bounce": {
      const b = e.bounce;
      if (!b) return null;
      loaiTraLai = b.bounceType === "Permanent" ? "Permanent" : b.bounceType === "Transient" ? "Transient" : "Undetermined";
      luc = ngay(b.timestamp);
      diaChi = thuong(b.bouncedRecipients.map((r) => r.emailAddress));
      chiTiet = {
        loaiTraLai,
        loaiPhu: b.bounceSubType ?? null,
        chanDoan: b.bouncedRecipients.map((r) => r.diagnosticCode ?? r.status ?? "").filter(Boolean).join(" | ").slice(0, 500) || null,
      };
      break;
    }
    case "complaint": {
      const c = e.complaint;
      if (!c) return null;
      luc = ngay(c.timestamp);
      diaChi = thuong(c.complainedRecipients.map((r) => r.emailAddress));
      chiTiet = { loaiPhanHoi: c.complaintFeedbackType ?? null };
      break;
    }
    case "delivery":
      luc = ngay(e.delivery?.timestamp);
      diaChi = thuong(e.delivery?.recipients);
      chiTiet = { phanHoi: e.delivery?.smtpResponse?.slice(0, 300) ?? null };
      break;
    case "reject":
      chiTiet = { lyDo: e.reject?.reason ?? null };
      break;
    case "rendering-failure":
      chiTiet = { loi: e.failure?.errorMessage?.slice(0, 500) ?? null };
      break;
    case "delivery-delay":
      luc = ngay(e.deliveryDelay?.timestamp);
      diaChi = thuong(e.deliveryDelay?.delayedRecipients?.map((r) => r.emailAddress));
      chiTiet = { loaiTre: e.deliveryDelay?.delayType ?? null, hetHan: e.deliveryDelay?.expirationTime ?? null };
      break;
    default:
      break;
  }
  return {
    loai,
    tenGoc: tenGoc.slice(0, 40) || "khong-ro",
    sesMessageId: e.mail.messageId,
    theTenant: the("cowork_tenant"),
    theNguoiNhan: the("cowork_recipient"),
    luc: luc ?? ngay(e.mail.timestamp),
    loaiTraLai,
    diaChi,
    chiTiet,
  };
}
