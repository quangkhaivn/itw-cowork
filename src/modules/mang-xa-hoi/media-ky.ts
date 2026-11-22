import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { bangNhau, hmac } from "@/lib/ma-hoa";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { docTep, maBam } from "@/modules/dinh-kem/kho-tep";
import { dieuKienXemBai, docCauHinhMxh } from "./chung";

/**
 * Link ảnh công khai CÓ KÝ, NGẮN HẠN (QĐ-198) — để nền tảng kéo ảnh từ URL (Instagram, ảnh Facebook… từ 0.24; WordPress
 * 0.23.0 đẩy byte nên chưa dùng). Phát ra trên chính tên miền Cowork (`/api/cong-khai/mxh/media/<mã>`), không tên miền phụ.
 *
 * Mã = base64url(doanh nghiệp | bài | tệp | hết hạn giây) "." base64url(HMAC-SHA256 khóa con "mxh-media" của APP_ENC_KEY).
 * Kiểm: khuôn → chữ ký (so thời gian hằng) → hạn (đồng hồ truyền vào) → trong ngữ cảnh doanh nghiệp: tệp phải đang là ảnh
 * của bài (social_post_media), bài chưa xóa, tệp chưa gỡ, mã băm khớp → trả byte, Content-Type đã nhận dạng lúc tải lên,
 * KHÔNG chuyển hướng. Mỗi lần phát ghi kiểm toán.
 */

const LA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface NoiDungMa {
  tenantId: string;
  postId: string;
  attachmentId: string;
  hetHanGiay: number;
}

function chuoiKy(n: NoiDungMa): string {
  return `${n.tenantId}|${n.postId}|${n.attachmentId}|${n.hetHanGiay}`;
}

export function kyMaMedia(n: NoiDungMa, khoa?: Buffer): string {
  const than = Buffer.from(chuoiKy(n), "utf8").toString("base64url");
  return `${than}.${hmac("mxh-media", chuoiKy(n), khoa).toString("base64url")}`;
}

export type KetQuaMa = { ok: true; noiDung: NoiDungMa } | { ok: false; ly: "sai-dang" | "sai-chu-ky" | "het-han" };

export function kiemMaMedia(ma: string, bayGio: Date, khoa?: Buffer): KetQuaMa {
  const m = /^([A-Za-z0-9_-]{20,400})\.([A-Za-z0-9_-]{43})$/.exec(ma);
  if (!m) return { ok: false, ly: "sai-dang" };
  const phan = Buffer.from(m[1], "base64url").toString("utf8").split("|");
  if (phan.length !== 4 || !LA_UUID.test(phan[0]) || !LA_UUID.test(phan[1]) || !LA_UUID.test(phan[2]) || !/^\d{1,12}$/.test(phan[3])) return { ok: false, ly: "sai-dang" };
  const n: NoiDungMa = { tenantId: phan[0], postId: phan[1], attachmentId: phan[2], hetHanGiay: Number(phan[3]) };
  // Ký lại từ nội dung đã đọc: đổi bất kỳ byte nào (kể cả hạn) → chữ ký không khớp.
  if (!bangNhau(hmac("mxh-media", chuoiKy(n), khoa), Buffer.from(m[2], "base64url"))) return { ok: false, ly: "sai-chu-ky" };
  if (n.hetHanGiay * 1000 <= bayGio.getTime()) return { ok: false, ly: "het-han" };
  return { ok: true, noiDung: n };
}

function goc(): string {
  return (process.env.APP_URL ?? "").replace(/\/+$/, "");
}

/** Tạo link công khai cho một ảnh của bài (người có mxh.view trong phạm vi). Hạn theo Cấu hình mxh.han_link_media_phut. */
export async function taoLinkMedia(nc: NguCanh, postId: string, attachmentId: string, bayGio: Date = new Date()) {
  batBuocQuyen(nc.hoSo, "mxh.view");
  const b = await nc.tx.socialPost.findFirst({ where: { AND: [{ id: postId, deletedAt: null }, await dieuKienXemBai(nc)] }, select: { id: true } });
  if (!b) throw new LoiKhongTimThay("Bài");
  const m = await nc.tx.socialPostMedia.findFirst({ where: { postId, attachmentId, attachment: { deletedAt: null } }, select: { id: true } });
  if (!m) throw new LoiKhongTimThay("Ảnh của bài");
  const phut = (await docCauHinhMxh(nc.tx)).hanLinkMediaPhut;
  const hetHanGiay = Math.floor(bayGio.getTime() / 1000) + phut * 60;
  const ma = kyMaMedia({ tenantId: nc.tenantId, postId, attachmentId, hetHanGiay });
  await nc.kiemToan({ action: "tao-link-media-mxh", objectType: "attachment", objectId: attachmentId, after: { baiId: postId, hetHan: new Date(hetHanGiay * 1000).toISOString() } });
  return { url: `${goc()}/api/cong-khai/mxh/media/${ma}`, hetHan: new Date(hetHanGiay * 1000) };
}

/**
 * Đọc tệp cho route công khai (đã kiểm mã, đang trong voiTenant của doanh nghiệp trong mã). Trả null = không phục vụ
 * (404 — không nói lý do cho người ngoài).
 */
export async function docMediaCongKhai(tx: ClientTenant, n: NoiDungMa): Promise<{ noiDung: Buffer; mime: string; tenTep: string } | null> {
  const m = await tx.socialPostMedia.findFirst({
    where: { postId: n.postId, attachmentId: n.attachmentId, post: { deletedAt: null }, attachment: { deletedAt: null, objectType: "social_post", objectId: n.postId } },
    select: { attachment: { select: { storedPath: true, mimeType: true, sha256: true, fileName: true } } },
  });
  if (!m) return null;
  const noiDung = await docTep(m.attachment.storedPath);
  if (maBam(noiDung) !== m.attachment.sha256) throw new LoiNghiepVu("Tệp trên đĩa không khớp với tệp đã tải lên.", 500, "tep-khong-khop");
  return { noiDung, mime: m.attachment.mimeType, tenTep: m.attachment.fileName };
}
