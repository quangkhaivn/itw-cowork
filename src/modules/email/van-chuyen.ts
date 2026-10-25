import nodemailer from "nodemailer";

/**
 * Lớp "vận chuyển" thư — chỗ duy nhất hệ thống nói chuyện với máy chủ SMTP (QĐ-67).
 *
 * Dùng `nodemailer` thay vì tự viết SMTP: giao thức có nhiều bẫy (STARTTLS, AUTH, mã hóa
 * tiêu đề tiếng Việt, chấm đầu dòng, độ dài dòng) mà thư viện đã kiểm qua nhiều năm.
 *
 * Bài thử cắm vận chuyển giả qua `datVanChuyenThu()` (giống `datNhaCungCapThu()` của trợ lý),
 * hoặc chạy nodemailer thật vào một máy chủ SMTP giả viết bằng `node:net` — không bao giờ gửi
 * thư thật ra ngoài trong lúc kiểm thử.
 */

export interface CauHinhSmtp {
  host: string;
  port: number;
  baoMat: "tls" | "starttls" | "none";
  tenDangNhap: string | null;
  matKhau: string | null;
}

export interface ThuGui {
  tu: { ten: string; email: string };
  den: { ten: string; email: string };
  traLoi?: string | null;
  tieuDe: string;
  html: string;
  text: string;
  /** Tiêu đề phụ (List-Unsubscribe…). Chỉ máy chủ đặt, không nhận từ người dùng. */
  tieuDePhu?: Record<string, string>;
}

export interface VanChuyenThu {
  /** `phanHoi`: câu trả lời SMTP sau DATA (SES: "250 Ok <mã thư SES>") — 0.18.0 đọc mã thư SES từ đây. */
  gui(thu: ThuGui): Promise<{ messageId: string | null; phanHoi?: string | null }>;
  dong(): void;
}

type HamTao = (c: CauHinhSmtp) => VanChuyenThu;
const bienToanCuc = globalThis as unknown as { taoVanChuyenThu?: HamTao | null };

/** Chỉ dùng trong bài thử. `null` = quay về nodemailer thật. */
export function datVanChuyenThu(ham: HamTao | null): void {
  bienToanCuc.taoVanChuyenThu = ham;
}

export function taoVanChuyen(c: CauHinhSmtp): VanChuyenThu {
  if (bienToanCuc.taoVanChuyenThu) return bienToanCuc.taoVanChuyenThu(c);
  return taoVanChuyenNodemailer(c);
}

/** nodemailer thật. Xuất ra để bài thử bọc lại (ghi cấu hình rồi trỏ sang máy chủ SMTP giả). */
export function taoVanChuyenNodemailer(c: CauHinhSmtp): VanChuyenThu {
  const t = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.baoMat === "tls",
    requireTLS: c.baoMat === "starttls",
    ignoreTLS: c.baoMat === "none",
    auth: c.tenDangNhap ? { user: c.tenDangNhap, pass: c.matKhau ?? "" } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
    // Không ghi nội dung phiên SMTP ra log: trong đó có lệnh AUTH.
    logger: false,
    debug: false,
  });
  return {
    async gui(thu) {
      const kq = await t.sendMail({
        from: { name: thu.tu.ten, address: thu.tu.email },
        to: { name: thu.den.ten, address: thu.den.email },
        replyTo: thu.traLoi || undefined,
        subject: thu.tieuDe,
        html: thu.html,
        text: thu.text,
        headers: thu.tieuDePhu,
      });
      return { messageId: typeof kq.messageId === "string" ? kq.messageId.slice(0, 255) : null, phanHoi: typeof kq.response === "string" ? kq.response.slice(0, 500) : null };
    },
    dong() {
      t.close();
    },
  };
}
