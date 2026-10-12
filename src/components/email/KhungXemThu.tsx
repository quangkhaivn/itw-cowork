/**
 * Khung xem trước thư. HTML do **máy chủ** dựng từ khối an toàn (đã thoát ký tự) và hiện trong
 * iframe `sandbox=""` — không chạy script, không cùng nguồn với ứng dụng. Không dùng
 * `dangerouslySetInnerHTML`: thư không bao giờ được chèn vào DOM của trang.
 */
export default function KhungXemThu({ html, tieuDe }: { html: string; tieuDe: string }) {
  return <iframe className="khung-xem-thu" sandbox="" srcDoc={html} title={`Xem trước: ${tieuDe}`} referrerPolicy="no-referrer" />;
}
