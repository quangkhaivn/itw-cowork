/**
 * Ngân sách AI theo tháng (0.25.0, QĐ-236) — phần THUẦN. Tháng tính theo giờ Việt Nam. Tiền là số nguyên VND.
 */

export interface GiaAI {
  /** VND cho 1 triệu token vào / ra (ước tính theo bảng giá nhà cung cấp — Cấu hình). */
  vndTrieuTokenVao: number;
  vndTrieuTokenRa: number;
}

export interface HanNganSach {
  /** 0 = tắt AI viết bài; null = không giới hạn theo token. */
  tokenThang: number | null;
  vndThang: number | null;
}

export interface DaDung {
  token: number;
  vnd: number;
}

/** "YYYY-MM" theo giờ Việt Nam. */
export function thangVN(d: Date): string {
  return new Date(d.getTime() + 7 * 3_600_000).toISOString().slice(0, 7);
}

/** Chi phí ước tính (VND, làm tròn lên). */
export function chiPhiVnd(tokenVao: number, tokenRa: number, gia: GiaAI): number {
  return Math.ceil((Math.max(0, tokenVao) * gia.vndTrieuTokenVao + Math.max(0, tokenRa) * gia.vndTrieuTokenRa) / 1_000_000);
}

export type KetQuaNganSach = { duoc: true } | { duoc: false; ma: "ai-tat" | "vuot-ngan-sach"; lyDo: string };

const vnd = (n: number) => `${n.toLocaleString("vi-VN")} đ`;
const so = (n: number) => n.toLocaleString("vi-VN");

/**
 * Còn ngân sách cho một lượt mới giữ chỗ `duTru` (token + VND ước tính tối đa) không. Lượt vượt trần → từ chối hẳn (không
 * gọi một nửa). Thông báo tiếng Việt nói rõ đã dùng bao nhiêu, ai nâng được.
 */
export function kiemNganSach(daDung: DaDung, duTru: DaDung, han: HanNganSach): KetQuaNganSach {
  if (han.tokenThang === 0 || han.vndThang === 0) {
    return { duoc: false, ma: "ai-tat", lyDo: "AI viết bài đang tắt (ngân sách AI tháng này đặt bằng 0). Giám đốc / Quản trị nâng ở Quản trị → Cấu hình hệ thống → Mạng xã hội." };
  }
  if (han.tokenThang !== null && daDung.token + duTru.token > han.tokenThang) {
    return { duoc: false, ma: "vuot-ngan-sach", lyDo: `Đã dùng ${so(daDung.token)} / ${so(han.tokenThang)} token AI của tháng này — lượt viết mới (tối đa ~${so(duTru.token)} token) sẽ vượt ngân sách. Giám đốc / Quản trị nâng “Ngân sách AI mỗi tháng (token)” ở Quản trị → Cấu hình hệ thống → Mạng xã hội, hoặc chờ sang tháng.` };
  }
  if (han.vndThang !== null && daDung.vnd + duTru.vnd > han.vndThang) {
    return { duoc: false, ma: "vuot-ngan-sach", lyDo: `Đã dùng khoảng ${vnd(daDung.vnd)} / ${vnd(han.vndThang)} ngân sách AI của tháng này — lượt viết mới (tối đa ~${vnd(duTru.vnd)}) sẽ vượt. Giám đốc / Quản trị nâng “Ngân sách AI mỗi tháng (VND)” ở Quản trị → Cấu hình hệ thống → Mạng xã hội, hoặc chờ sang tháng.` };
  }
  return { duoc: true };
}

/** Phần trăm đã dùng (theo trần chặt hơn) — để hiện thanh tiến độ. */
export function phanTramDaDung(daDung: DaDung, han: HanNganSach): number | null {
  const ds: number[] = [];
  if (han.tokenThang) ds.push(daDung.token / han.tokenThang);
  if (han.vndThang) ds.push(daDung.vnd / han.vndThang);
  return ds.length ? Math.min(100, Math.round(Math.max(...ds) * 100)) : null;
}
