/**
 * Chính sách mật khẩu. Tách riêng để kiểm thử đơn vị và để mọi đường đặt mật khẩu
 * (tạo người dùng, tự đổi, quản trị đặt lại, script khẩn cấp) dùng chung một luật.
 */

export const DO_DAI_TOI_THIEU = 10;

/** Trả về danh sách lỗi; mảng rỗng nghĩa là đạt. */
export function kiemTraMatKhauManh(matKhau: string, email?: string | null): string[] {
  const loi: string[] = [];
  if (matKhau.length < DO_DAI_TOI_THIEU) loi.push(`Dài tối thiểu ${DO_DAI_TOI_THIEU} ký tự.`);
  if (matKhau.length > 200) loi.push("Dài tối đa 200 ký tự.");
  if (!/\p{L}/u.test(matKhau)) loi.push("Phải có ít nhất một chữ cái.");
  if (!/\d/.test(matKhau)) loi.push("Phải có ít nhất một chữ số.");
  if (email) {
    const phanTen = email.split("@")[0]?.toLowerCase() ?? "";
    if (phanTen.length >= 4 && matKhau.toLowerCase().includes(phanTen)) {
      loi.push("Không được chứa tên đăng nhập.");
    }
  }
  return loi;
}

/**
 * Sinh mật khẩu tạm để quản trị viên trao cho nhân viên mới. Bỏ các ký tự dễ nhầm
 * (0/O, 1/l/I). Dùng Web Crypto nên chạy được cả trên máy chủ lẫn trình duyệt.
 */
export function sinhMatKhauTam(doDai = 14): string {
  const bang = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const so = "23456789";
  const ngauNhien = new Uint32Array(doDai);
  crypto.getRandomValues(ngauNhien);
  const kyTu = Array.from(ngauNhien, (n) => bang[n % bang.length]);
  // Đảm bảo có ít nhất một chữ số và một chữ cái để luôn qua chính sách.
  const chu = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const viTri = ngauNhien[0] % doDai;
  kyTu[viTri] = so[ngauNhien[doDai - 1] % so.length];
  kyTu[(viTri + 1) % doDai] = chu[ngauNhien[1] % chu.length];
  return kyTu.join("");
}
