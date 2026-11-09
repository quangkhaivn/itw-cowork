/**
 * 0.22.0 (QĐ-179) — nhập CSV HỒ SƠ LƯƠNG hàng loạt: phần THUẦN (đọc + kiểm từng dòng). Ghi đi qua `taoHoSoLuong` (phiên
 * bản mới, QĐ-159 chặn tự nhập hồ sơ của mình, đổi tài khoản vẫn báo nhân viên).
 *
 * Cột: Email (bắt buộc), Loại hợp đồng, Lương cơ bản (bắt buộc), Lương đóng BH, Số tài khoản, Ngân hàng, Mã số thuế,
 * Số người phụ thuộc; tùy chọn: % lương thử việc, Hình thức trả. Ô bắt đầu bằng ký tự công thức (= + - @, tab) → lỗi dòng
 * (không bao giờ ghi nguyên văn vào hồ sơ — chống chèn công thức khi xuất lại ra Excel).
 */

import { docBangCsv } from "@/lib/csv";
import { LOAI_HOP_DONG, NHAN_LOAI_HOP_DONG, type LoaiHopDong } from "./tinh-toan";
import { TIEN_TOI_DA } from "./luoc-do";

export const SO_DONG_HO_SO_TOI_DA = 2000;

export interface DongCsvHoSoLuong {
  soDong: number;
  email: string;
  loaiHopDong: LoaiHopDong | null;
  tyLeThuViec: number | null;
  luongCoBan: number;
  luongDongBH: number | null;
  soTaiKhoan: string | null;
  nganHang: string | null;
  maSoThue: string | null;
  soNguoiPhuThuoc: number | null;
  hinhThucTra: "chuyen-khoan" | "tien-mat" | null;
}

const COT = [
  { truong: "email", ten: ["Email", "E-mail", "Thư điện tử"], batBuoc: true },
  { truong: "loaiHopDong", ten: ["Loại hợp đồng", "Loại HĐ", "Loai hop dong", "Hợp đồng"] },
  { truong: "luongCoBan", ten: ["Lương cơ bản", "Luong co ban", "Lương"], batBuoc: true },
  { truong: "luongDongBH", ten: ["Lương đóng BH", "Lương đóng bảo hiểm", "Luong dong BH"] },
  { truong: "soTaiKhoan", ten: ["Số tài khoản", "So tai khoan", "STK", "Tài khoản"] },
  { truong: "nganHang", ten: ["Ngân hàng", "Ngan hang"] },
  { truong: "maSoThue", ten: ["Mã số thuế", "MST", "Ma so thue"] },
  { truong: "soNguoiPhuThuoc", ten: ["Số người phụ thuộc", "Người phụ thuộc", "NPT", "So nguoi phu thuoc"] },
  { truong: "tyLeThuViec", ten: ["% lương thử việc", "% thử việc", "Tỷ lệ thử việc"] },
  { truong: "hinhThucTra", ten: ["Hình thức trả", "Hinh thuc tra"] },
];

const CONG_THUC = /^[=+\-@\t\r]/;

function boDauThuong(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
}

/** "Chính thức" / "chinh-thuc" / "Thử việc" … → mã loại hợp đồng; không nhận ra → undefined. Trống → null. */
export function docLoaiHopDong(s: string): LoaiHopDong | null | undefined {
  const k = boDauThuong(s).replace(/[\s_]+/g, "-");
  if (!k) return null;
  if ((LOAI_HOP_DONG as readonly string[]).includes(k)) return k as LoaiHopDong;
  for (const l of LOAI_HOP_DONG) if (boDauThuong(NHAN_LOAI_HOP_DONG[l]).replace(/[\s_]+/g, "-").startsWith(k)) return l;
  if (k.startsWith("thoi-vu") || k.startsWith("khoan")) return "thoi-vu";
  if (k.startsWith("thuc-tap")) return "thuc-tap";
  return undefined;
}

/** "12.500.000" / "12500000" / "12,500,000 đ" → số nguyên VND ≥ 0; sai → undefined; trống → null. */
export function docSoTien(s: string): number | null | undefined {
  const t = s.replace(/[.\s₫đ,]/gi, "").trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return Number.isSafeInteger(n) && n <= TIEN_TOI_DA ? n : undefined;
}

export function phanTichCsvHoSoLuong(noiDung: string): { dong: DongCsvHoSoLuong[]; loi: { soDong: number; lyDo: string }[]; thieuCot: string[] } {
  const bang = docBangCsv(noiDung, COT);
  const dong: DongCsvHoSoLuong[] = [];
  const loi: { soDong: number; lyDo: string }[] = [];
  if (bang.thieuCot.length) return { dong, loi, thieuCot: [...bang.thieuCot] };
  if (bang.dong.length > SO_DONG_HO_SO_TOI_DA) return { dong, loi: [{ soDong: 0, lyDo: `Tệp quá ${SO_DONG_HO_SO_TOI_DA} dòng — chia nhỏ.` }], thieuCot: [] };
  for (const { soDong, duLieu } of bang.dong) {
    const o = (k: string) => (duLieu[k] ?? "").trim();
    if (Object.values(duLieu).every((v) => !v.trim())) continue;
    const loiDong: string[] = [];
    for (const [k, v] of Object.entries(duLieu)) {
      if (CONG_THUC.test(v.trimStart()) && !(k === "luongCoBan" || k === "luongDongBH" || k === "soNguoiPhuThuoc" || k === "tyLeThuViec")) {
        loiDong.push(`ô “${COT.find((c) => c.truong === k)?.ten[0] ?? k}” bắt đầu bằng ký tự công thức (= + - @)`);
      }
    }
    const email = o("email").toLowerCase();
    if (!/^[^\s@,;"'<>]+@[^\s@,;"'<>]+\.[^\s@,;"'<>]+$/.test(email)) loiDong.push("email không hợp lệ");
    const loai = docLoaiHopDong(o("loaiHopDong"));
    if (loai === undefined) loiDong.push("loại hợp đồng không nhận ra (Chính thức / Thử việc / Thời vụ / Thực tập)");
    const luong = docSoTien(o("luongCoBan"));
    if (luong === undefined || luong === null) loiDong.push("lương cơ bản phải là số nguyên VND");
    const bh = docSoTien(o("luongDongBH"));
    if (bh === undefined) loiDong.push("lương đóng BH phải là số nguyên VND");
    const npt = o("soNguoiPhuThuoc");
    const soNpt = npt === "" ? null : /^\d{1,2}$/.test(npt) ? Number(npt) : NaN;
    if (Number.isNaN(soNpt)) loiDong.push("số người phụ thuộc là số nguyên 0–99");
    const tl = o("tyLeThuViec").replace("%", "").replace(",", ".");
    const tyLe = tl === "" ? null : Number(tl);
    if (tyLe !== null && (!Number.isFinite(tyLe) || tyLe < 1 || tyLe > 100)) loiDong.push("% lương thử việc 1–100");
    const tk = o("soTaiKhoan").replace(/\s/g, "");
    if (tk && !/^[0-9A-Za-z-]{1,50}$/.test(tk)) loiDong.push("số tài khoản chỉ gồm chữ số / chữ cái / gạch ngang");
    const mst = o("maSoThue");
    if (mst && !/^(\d{10}|\d{10}-\d{3}|\d{12})$/.test(mst)) loiDong.push("mã số thuế: 10 số, 10 số-3 số hoặc 12 số");
    const ht = boDauThuong(o("hinhThucTra"));
    const hinhThuc = !ht ? null : ht.startsWith("chuyen") ? "chuyen-khoan" : ht.startsWith("tien") || ht.startsWith("tra-tay") || ht.startsWith("tra tay") ? "tien-mat" : undefined;
    if (hinhThuc === undefined) loiDong.push("hình thức trả: Chuyển khoản / Tiền mặt");
    if (loiDong.length) {
      loi.push({ soDong, lyDo: loiDong.join("; ") });
      continue;
    }
    dong.push({
      soDong, email, loaiHopDong: loai ?? null, tyLeThuViec: tyLe, luongCoBan: luong as number, luongDongBH: bh ?? null,
      soTaiKhoan: tk || null, nganHang: o("nganHang") || null, maSoThue: mst || null, soNguoiPhuThuoc: soNpt, hinhThucTra: hinhThuc ?? null,
    });
  }
  return { dong, loi, thieuCot: [] };
}
