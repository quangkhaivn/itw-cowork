import type { KetQuaLuong } from "./tinh-toan";

/**
 * Thư phiếu lương (LU-44) — hàm thuần, tách khỏi xuat.ts để worker gửi thư nạp được mà không kéo theo Next.
 */

/**
 * Thoát ký tự đặc biệt XML / HTML và bỏ ký tự XML 1.0 không cho phép: ký tự điều khiển, U+FFFE / U+FFFF và nửa cặp
 * thay thế lẻ (QA 0.21.0: một tên có U+FFFF làm Excel từ chối mở cả bảng lương .xls).
 */
export function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, "");
}

function dongTien(n: number) {
  return `${n.toLocaleString("vi-VN")} đ`;
}

/** Nội dung thư phiếu lương — dựng LÚC GỬI từ dòng lương đã khóa (hàng chờ chỉ giữ mã dòng). Hàm thuần. */
export function dungThuPhieuLuong(tenCongTy: string, d: { hoTen: string; nam: number; thang: number; ketQua: KetQuaLuong; duongDan: string | null }) {
  const k = d.ketQua;
  const muc: [string, number][] = [
    ["Lương theo công", k.luongTheoCong],
    ["Phụ cấp", k.tongPhuCap],
    ["Tăng ca", k.tangCa.tien],
    ["Thưởng KPI", k.thuongKpi],
    ["Hoa hồng", k.hoaHong.tien + k.hoaHong.truyThu],
    ["Khoản cộng khác", k.khoanCong],
    ["Tổng thu nhập", k.tongThuNhap],
    ["Bảo hiểm (người lao động)", -k.baoHiem.nld.tong],
    ["Thuế TNCN", -k.thue.tien],
    ["Khoản trừ khác", -k.khoanTru],
    ["THỰC LĨNH", k.thucLinh],
  ];
  const ky = `${String(d.thang).padStart(2, "0")}/${d.nam}`;
  const tieuDe = `Phiếu lương tháng ${ky} — ${tenCongTy}`;
  const bang = muc.filter(([, v], i) => v !== 0 || i >= 6).map(([n, v]) => `<tr><td style="padding:4px 12px 4px 0">${xml(n)}</td><td style="padding:4px 0;text-align:right">${xml(dongTien(v))}</td></tr>`).join("");
  const html = `<p>Chào ${xml(d.hoTen)},</p><p>${xml(tenCongTy)} gửi bạn phiếu lương tháng ${ky} (công tính lương: ${k.congTinhLuong}).</p><table style="border-collapse:collapse">${bang}</table>${d.duongDan ? `<p>Xem chi tiết và in phiếu: <a href="${xml(d.duongDan)}">${xml(d.duongDan)}</a></p>` : ""}<p style="color:#666;font-size:12px">Thư tự động từ hệ thống. Thông tin lương là bảo mật — không chuyển tiếp thư này.</p>`;
  const text = `Chào ${d.hoTen},\n\nPhiếu lương tháng ${ky}:\n${muc.filter(([, v], i) => v !== 0 || i >= 6).map(([n, v]) => `- ${n}: ${dongTien(v)}`).join("\n")}\n${d.duongDan ? `\nXem chi tiết: ${d.duongDan}\n` : ""}\nThông tin lương là bảo mật — không chuyển tiếp thư này.`;
  return { tieuDe, html, text };
}
