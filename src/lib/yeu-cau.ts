/**
 * Tiện ích đọc thông tin từ yêu cầu HTTP.
 *
 * Đường đi của yêu cầu: trình duyệt → nginx máy chủ (giữ TLS) → nginx trong Docker → app.
 * nginx máy chủ đặt `X-Real-IP` = IP thật của khách; nginx trong Docker chuyển tiếp
 * nguyên giá trị đó (xem nginx/cowork.conf). Vì vậy tin `X-Real-IP` trước.
 * KHÔNG lấy phần tử đầu của `X-Forwarded-For`: phần đó do khách tự gửi, giả được.
 */

type DocHeader = { get(ten: string): string | null };

export function layIpKhach(headers: DocHeader): string | null {
  const thuc = headers.get("x-real-ip")?.trim();
  if (thuc) return thuc.slice(0, 45);
  const chuoi = headers.get("x-forwarded-for");
  if (!chuoi) return null;
  const ds = chuoi.split(",").map((s) => s.trim()).filter(Boolean);
  // Phần tử cuối do proxy gần nhất thêm vào — không giả được từ phía khách.
  return ds.length ? ds[ds.length - 1].slice(0, 45) : null;
}

/**
 * Chống CSRF (giả mạo yêu cầu liên trang) cho các yêu cầu thay đổi dữ liệu.
 *
 * Cookie phiên đã đặt SameSite=Lax, trình duyệt không gửi cookie trong POST liên
 * trang. Kiểm Origin là lớp thứ hai: yêu cầu thay đổi dữ liệu phải đến từ chính
 * trang của hệ thống. Thiếu cả Origin lẫn Referer thì từ chối — trình duyệt hiện
 * đại luôn gửi Origin khi fetch POST.
 */
export function cungNguonGoc(
  phuongThuc: string,
  headers: DocHeader,
  cacNguonHopLe: string[],
): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(phuongThuc.toUpperCase())) return true;
  const nguon = headers.get("origin") ?? headers.get("referer");
  if (!nguon) return false;
  let host: string;
  try {
    host = new URL(nguon).host;
  } catch {
    return false;
  }
  return cacNguonHopLe.some((h) => h && h.toLowerCase() === host.toLowerCase());
}

/**
 * Các host hợp lệ: host của chính yêu cầu, cộng host của APP_URL nếu có.
 * Không tin X-Forwarded-Host: khách tự gửi được, và nginx của ta không đặt nó.
 */
export function cacHostHopLe(headers: DocHeader): string[] {
  const ds = [headers.get("host") ?? ""];
  const appUrl = process.env.APP_URL;
  if (appUrl) {
    try {
      ds.push(new URL(appUrl).host);
    } catch {
      // APP_URL sai định dạng thì bỏ qua, vẫn còn host của yêu cầu.
    }
  }
  return ds.filter(Boolean);
}
