import { bangNhau, docKhoa, hmac } from "@/lib/ma-hoa";

/**
 * Mã ký cho liên kết công khai trong thư: huỷ nhận tin, điểm ảnh mở, chuyển hướng bấm (EM-10, EM-11).
 *
 * Mã = base64url( loại[1] · tenant[16] · người nhận[16] · chỉ số liên kết[2] · HMAC[16] ).
 *  - **Không chứa email** hay tên: người cầm liên kết không đọc ra được ai là người nhận.
 *  - **Không đoán được**: HMAC-SHA256 (cắt 128 bit) bằng khóa con của APP_ENC_KEY.
 *  - **Loại nằm trong phần ký**: mã của điểm ảnh mở không dùng làm mã huỷ nhận tin được,
 *    và chỉ số liên kết không sửa tay được để chuyển hướng sang liên kết khác.
 */

export type LoaiMa = "huy" | "mo" | "bam";
const BYTE_LOAI: Record<LoaiMa, number> = { huy: 1, mo: 2, bam: 3 };
const DO_DAI_MAC = 16;

function uuidVeByte(id: string): Buffer {
  const hex = id.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error("uuid không hợp lệ");
  return Buffer.from(hex, "hex");
}

function byteVeUuid(b: Buffer): string {
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function kyMaLienKet(loai: LoaiMa, tenantId: string, nguoiNhanId: string, chiSo = 0, khoa: Buffer = docKhoa()): string {
  const than = Buffer.alloc(35);
  than[0] = BYTE_LOAI[loai];
  uuidVeByte(tenantId).copy(than, 1);
  uuidVeByte(nguoiNhanId).copy(than, 17);
  than.writeUInt16BE(chiSo, 33);
  const mac = hmac("email-lien-ket", than, khoa).subarray(0, DO_DAI_MAC);
  return Buffer.concat([than, mac]).toString("base64url");
}

export interface MaDaDoc {
  tenantId: string;
  nguoiNhanId: string;
  chiSo: number;
}

/** Đọc và kiểm chữ ký. Sai dạng / sai loại / sai chữ ký → null (không phân biệt, không lộ lý do). */
export function docMaLienKet(ma: string, loai: LoaiMa, khoa?: Buffer): MaDaDoc | null {
  if (!/^[A-Za-z0-9_-]{60,80}$/.test(ma)) return null;
  const b = Buffer.from(ma, "base64url");
  if (b.length !== 35 + DO_DAI_MAC) return null;
  const than = b.subarray(0, 35);
  let k: Buffer;
  try {
    k = khoa ?? docKhoa();
  } catch {
    return null;
  }
  const dung = hmac("email-lien-ket", than, k).subarray(0, DO_DAI_MAC);
  if (!bangNhau(dung, b.subarray(35))) return null;
  if (than[0] !== BYTE_LOAI[loai]) return null;
  return { tenantId: byteVeUuid(than.subarray(1, 17)), nguoiNhanId: byteVeUuid(than.subarray(17, 33)), chiSo: than.readUInt16BE(33) };
}

/** Gốc URL công khai (APP_URL), không có dấu "/" cuối. */
export function gocUrl(): string {
  const u = process.env.APP_URL?.trim();
  if (!u) throw new Error("Thiếu APP_URL — cần để dựng liên kết huỷ nhận tin trong thư.");
  return u.replace(/\/+$/, "");
}

export function urlHuyNhanTin(tenantId: string, nguoiNhanId: string): string {
  return `${gocUrl()}/huy-nhan-tin/${kyMaLienKet("huy", tenantId, nguoiNhanId)}`;
}
/** Đích của List-Unsubscribe-Post (RFC 8058): POST một chạm, không qua trang. */
export function urlHuyMotCham(tenantId: string, nguoiNhanId: string): string {
  return `${gocUrl()}/api/cong-khai/huy-nhan-tin/${kyMaLienKet("huy", tenantId, nguoiNhanId)}`;
}
export function urlAnhMo(tenantId: string, nguoiNhanId: string): string {
  return `${gocUrl()}/api/cong-khai/email/mo/${kyMaLienKet("mo", tenantId, nguoiNhanId)}`;
}
export function urlBam(tenantId: string, nguoiNhanId: string, chiSo: number): string {
  return `${gocUrl()}/api/cong-khai/email/bam/${kyMaLienKet("bam", tenantId, nguoiNhanId, chiSo)}`;
}
