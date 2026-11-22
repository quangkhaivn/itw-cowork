import { LoiNghiepVu } from "@/lib/loi";

/**
 * Khóa chủ của Mạng xã hội — `SOCIAL_MASTER_KEY` (SEC-05, QĐ-194).
 *
 * Biến môi trường RIÊNG, không dùng chung `APP_ENC_KEY` và KHÔNG rơi về `APP_ENC_KEY` khi thiếu: mất / lộ một khóa không
 * kéo theo bí mật của phân hệ kia. Khóa chủ chỉ BỌC data key (mỗi bản niêm phong một data key AES-256-GCM riêng).
 *
 * Xoay khóa: đặt khóa mới vào `SOCIAL_MASTER_KEY`, tăng `SOCIAL_MASTER_KEY_VERSION` (mặc định 1), giữ khóa cũ ở
 * `SOCIAL_MASTER_KEY_V<n>`; chạy `npm run mxh:boc-lai-khoa` (worker) để bọc lại mọi data key bằng phiên bản mới.
 */

export class LoiKhoaChuMxh extends LoiNghiepVu {
  constructor(message: string) {
    super(message, 503, "thieu-social-master-key");
    this.name = "LoiKhoaChuMxh";
  }
}

const CACH_SINH = "Sinh bằng: openssl rand -base64 32 (bộ cài / trien-khai.sh tự sinh nếu .env chưa có), rồi khởi động lại app + worker.";

function docMotKhoa(ten: string, giaTri: string | undefined): Buffer {
  if (!giaTri || !giaTri.trim()) {
    throw new LoiKhoaChuMxh(`Máy chủ chưa đặt ${ten} (khóa chủ mã hóa bí mật mạng xã hội, 32 byte base64). ${CACH_SINH}`);
  }
  const k = Buffer.from(giaTri.trim(), "base64");
  if (k.length !== 32) throw new LoiKhoaChuMxh(`${ten} phải là đúng 32 byte mã hóa base64. ${CACH_SINH}`);
  return k;
}

export function phienBanKhoaHienTai(env: NodeJS.ProcessEnv = process.env): number {
  const v = Number(env.SOCIAL_MASTER_KEY_VERSION ?? "1");
  if (!Number.isInteger(v) || v < 1 || v > 1000) throw new LoiKhoaChuMxh("SOCIAL_MASTER_KEY_VERSION phải là số nguyên ≥ 1.");
  return v;
}

/**
 * Khóa chủ của một phiên bản. Không truyền phiên bản = phiên bản hiện tại (dùng để niêm phong mới). Phiên bản cũ đọc từ
 * `SOCIAL_MASTER_KEY_V<n>`; phiên bản hiện tại cũng đọc được qua tên đó nếu có đặt.
 */
export function docKhoaChu(phienBan?: number, env: NodeJS.ProcessEnv = process.env): { khoa: Buffer; phienBan: number } {
  const hienTai = phienBanKhoaHienTai(env);
  const v = phienBan ?? hienTai;
  const k = v === hienTai ? docMotKhoa("SOCIAL_MASTER_KEY", env.SOCIAL_MASTER_KEY) : docMotKhoa(`SOCIAL_MASTER_KEY_V${v}`, env[`SOCIAL_MASTER_KEY_V${v}`]);
  // Dùng trùng APP_ENC_KEY là vô hiệu hóa việc tách khóa — từ chối thay vì im lặng chạy.
  if (env.APP_ENC_KEY && Buffer.from(env.APP_ENC_KEY.trim(), "base64").equals(k)) {
    throw new LoiKhoaChuMxh("SOCIAL_MASTER_KEY không được trùng APP_ENC_KEY — sinh một khóa riêng. " + CACH_SINH);
  }
  return { khoa: k, phienBan: v };
}

export interface TrangThaiKhoaChu {
  coKhoa: boolean;
  phienBan: number | null;
  loi: string | null;
}

/** Cho màn hình biết máy chủ đã có khóa chưa (không trả khóa). */
export function trangThaiKhoaChu(env: NodeJS.ProcessEnv = process.env): TrangThaiKhoaChu {
  try {
    const { phienBan } = docKhoaChu(undefined, env);
    return { coKhoa: true, phienBan, loi: null };
  } catch (e) {
    return { coKhoa: false, phienBan: null, loi: e instanceof Error ? e.message : String(e) };
  }
}

/** AAD của bí mật một kênh: doanh nghiệp + kênh. Chép bản niêm phong sang kênh / doanh nghiệp khác → mở hỏng. */
export function aadKenh(tenantId: string, connectionId: string): string {
  return `mxh:kenh:${tenantId}:${connectionId}`;
}

/** AAD của bí mật app một nền tảng: doanh nghiệp + nền tảng. */
export function aadApp(tenantId: string, nhaCungCap: string): string {
  return `mxh:app:${tenantId}:${nhaCungCap}`;
}

/** AAD khi bọc data key — ràng buộc thêm phiên bản khóa chủ. */
export function aadBoc(aad: string, phienBan: number): string {
  return `boc:v${phienBan}:${aad}`;
}
