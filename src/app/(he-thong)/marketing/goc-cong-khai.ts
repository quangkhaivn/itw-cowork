import { headers } from "next/headers";

/**
 * Gốc URL công khai để in đường dẫn / mã nhúng cho Marketing. Ưu tiên APP_URL (địa chỉ thật
 * sau nginx); máy phát triển không đặt thì lấy host của chính yêu cầu.
 */
export async function gocCongKhai(): Promise<string> {
  const appUrl = process.env.APP_URL?.replace(/\/+$/, "");
  if (appUrl) return appUrl;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  return `${host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https"}://${host}`;
}
