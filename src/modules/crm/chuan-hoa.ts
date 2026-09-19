import { LoiDinhDang } from "@/lib/loi";

/**
 * Chuẩn hóa dữ liệu nhận diện khách hàng — nền của chống trùng (BUSINESS_RULES KH-02, KH-03, KH-07).
 *
 * Hàm thuần, không đụng cơ sở dữ liệu, có kiểm thử đơn vị. Dùng chung cho khách hàng,
 * liên hệ và lead để cùng một số điện thoại viết ba kiểu vẫn ra một khóa.
 */

/** Bỏ dấu tiếng Việt, về chữ thường. "Đồng Nai" → "dong nai". */
export function boDau(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

/**
 * Mã số thuế → chỉ giữ chữ số. Hợp lệ khi 10 số (doanh nghiệp) hoặc 13 số (chi nhánh,
 * viết "0305547654-001"). Trả `null` nếu trống; ném lỗi nếu có nội dung mà sai dạng.
 */
export function chuanHoaMaSoThue(s: string | null | undefined): string | null {
  if (!s || !s.trim()) return null;
  const so = s.replace(/\D/g, "");
  if (so.length !== 10 && so.length !== 13) {
    throw new LoiDinhDang("maSoThue", "Mã số thuế phải có 10 chữ số, hoặc 13 chữ số với chi nhánh (0305547654-001).");
  }
  return so;
}

/**
 * Điện thoại → dạng quốc nội "0xxxxxxxxx". Nhận "+84 909 123 456", "84909123456",
 * "0909.123.456", "(028) 3812 3456". Trả `null` nếu trống; ném lỗi nếu độ dài vô lý.
 */
export function chuanHoaDienThoai(s: string | null | undefined): string | null {
  if (!s || !s.trim()) return null;
  let so = s.replace(/\D/g, "");
  if (so.startsWith("0084")) so = so.slice(4);
  else if (so.startsWith("84") && so.length >= 11) so = so.slice(2);
  if (!so.startsWith("0")) so = `0${so}`;
  // Di động 10 số, cố định 10–11 số; chấp nhận 9–11 để không chặn số tổng đài ngắn hợp lệ.
  if (so.length < 9 || so.length > 11) {
    throw new LoiDinhDang("dienThoai", "Số điện thoại không hợp lệ (cần 9–11 chữ số, ví dụ 0909 123 456).");
  }
  return so;
}

/** Email → chữ thường, bỏ khoảng trắng. Kiểm dạng do lược đồ Zod làm trước đó. */
export function chuanHoaEmail(s: string | null | undefined): string | null {
  if (!s || !s.trim()) return null;
  return s.trim().toLowerCase();
}

/**
 * Các cụm chỉ loại hình pháp nhân — bỏ đi trước khi so tên, để
 * "Công ty TNHH Thế Giới Tin Học" và "Thế Giới Tin Học Co., Ltd" gần nhau.
 * Thứ tự quan trọng: cụm dài trước cụm ngắn.
 */
const CUM_PHAP_NHAN = [
  "trach nhiem huu han mot thanh vien",
  "trach nhiem huu han",
  "mot thanh vien",
  "doanh nghiep tu nhan",
  "cong ty co phan",
  "cong ty",
  "co phan",
  "chi nhanh",
  "tap doan",
  "joint stock company",
  "company limited",
  "co ltd",
  "company",
  "limited",
  "corporation",
  "corp",
  "jsc",
  "ltd",
  "tnhh",
  "mtv",
  "dntn",
  "ctcp",
  "cty",
  "cp",
  "inc",
  // Cố ý KHÔNG bỏ "co", "ct" đứng riêng: "cơ khí", "cô" bỏ dấu cũng thành "co".
];

/** Tên → khóa so sánh: bỏ dấu, bỏ loại hình pháp nhân, bỏ ký tự đặc biệt, gộp khoảng trắng. */
export function chuanHoaTen(s: string): string {
  let t = ` ${boDau(s).replace(/[^a-z0-9]+/g, " ")} `;
  for (const cum of CUM_PHAP_NHAN) t = t.split(` ${cum} `).join(" ");
  const ketQua = t.replace(/\s+/g, " ").trim();
  // Tên chỉ toàn loại hình pháp nhân (hiếm) thì giữ bản bỏ dấu để không ra chuỗi rỗng.
  return ketQua || boDau(s).replace(/[^a-z0-9]+/g, " ").trim();
}
