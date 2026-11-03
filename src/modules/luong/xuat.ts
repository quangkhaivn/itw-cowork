import { NextResponse } from "next/server";
import type { NguCanh } from "@/lib/api";
import { taoCsv, voHieuCongThuc } from "@/lib/csv";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { SU_KIEN } from "@/lib/su-kien";
import { homNayVN } from "@/modules/crm/chung";
import { batBuocQuyenLuong, docCauHinhLuong, docMauNganHang, ghiXem, locNguoiLuong, taiKhoanTu } from "./chung";
import { hoSoApDung } from "./ho-so";
import { xml } from "./thu-phieu";
import {
  boDau,
  butToanLuong,
  dienNoiDung,
  khoangThang,
  laKyDaKhoa,
  nhanKy,
  NHAN_COT_NGAN_HANG,
  type CotNganHang,
  type DauVaoLuong,
  type KetQuaLuong,
} from "./tinh-toan";

/**
 * Xuất file lương (LU-50 → LU-54): bảng lương Excel, file chi lương ngân hàng (CSV / Excel, cột cấu hình được),
 * bút toán lương (CSV theo tài khoản — chưa có module MISA). Mọi ô chữ chống chèn công thức (= + - @ đầu ô).
 * Gửi email phiếu lương: xếp vào hàng chờ thư giao dịch (worker gửi), không gửi đồng bộ (LU-44).
 */

// ---------------------------------------------------------------------------
// Bảng tính Excel không cần thư viện: SpreadsheetML 2003 (XML) — Excel / LibreOffice mở trực tiếp (QĐ-150)
// ---------------------------------------------------------------------------


/** Dựng bảng tính SpreadsheetML (.xls). Ô số giữ kiểu số; ô chữ qua `voHieuCongThuc` + thoát XML. Hàm thuần. */
export function taoBangTinhXml(tenTrang: string, tieuDe: string[], dong: (string | number | null | undefined)[][], dongDau: string[] = []): string {
  const o = (x: string | number | null | undefined, kieu = "") => {
    if (x === null || x === undefined || x === "") return `<Cell${kieu}/>`;
    if (typeof x === "number") return `<Cell${kieu || ' ss:StyleID="so"'}><Data ss:Type="Number">${x}</Data></Cell>`;
    return `<Cell${kieu}><Data ss:Type="String">${xml(voHieuCongThuc(String(x)))}</Data></Cell>`;
  };
  const hang = (cells: string) => `<Row>${cells}</Row>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    '<Styles><Style ss:ID="dau"><Font ss:Bold="1"/><Interior ss:Color="#EEEEEE" ss:Pattern="Solid"/></Style><Style ss:ID="so"><NumberFormat ss:Format="#,##0"/></Style><Style ss:ID="tieu-de"><Font ss:Bold="1" ss:Size="13"/></Style></Styles>',
    `<Worksheet ss:Name="${xml(tenTrang.slice(0, 31))}"><Table>`,
    ...dongDau.map((d) => hang(o(d, ' ss:StyleID="tieu-de"'))),
    hang(tieuDe.map((t) => o(t, ' ss:StyleID="dau"')).join("")),
    ...dong.map((d) => hang(d.map((x) => o(x)).join(""))),
    "</Table></Worksheet></Workbook>",
  ].join("\n");
}

function tepTraVe(noiDung: string, ten: string, loai: "csv" | "xls"): NextResponse {
  return new NextResponse(noiDung, {
    headers: {
      "Content-Type": loai === "csv" ? "text/csv; charset=utf-8" : "application/vnd.ms-excel; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ten}"`,
      "Cache-Control": "no-store",
    },
  });
}

async function docKyVaDong(nc: NguCanh, id: string) {
  const ky = await nc.tx.payrollRun.findFirst({ where: { id } });
  if (!ky) throw new LoiKhongTimThay("Kỳ lương");
  const loc = await locNguoiLuong(nc);
  const dong = await nc.tx.payrollLine.findMany({ where: { runId: id, ...loc }, orderBy: { fullName: "asc" } });
  const ma = new Map((await nc.tx.staffProfile.findMany({ where: { userId: { in: dong.map((d) => d.userId) } }, select: { userId: true, employeeCode: true } })).map((s) => [s.userId, s.employeeCode]));
  return { ky, dong, ma };
}

const thang2 = (n: number) => String(n).padStart(2, "0");

/** Bảng lương Excel (LU-50). Kỳ chưa khóa: tên tệp có chữ NHAP. */
export async function xuatBangLuong(nc: NguCanh, id: string, dinhDang: "xls" | "csv" = "xls") {
  batBuocQuyenLuong(nc, "luong.export", { objectType: "payroll_run", objectId: id });
  const { ky, dong, ma } = await docKyVaDong(nc, id);
  const tieuDe = ["STT", "Mã NV", "Họ tên", "Công chuẩn", "Công tính lương", "Lương theo công", "Phụ cấp", "Tăng ca", "Thưởng KPI", "Hoa hồng", "Khoản cộng", "Tổng thu nhập", "Thu nhập chịu thuế", "BHXH (NLĐ)", "BHYT (NLĐ)", "BHTN (NLĐ)", "Giảm trừ gia cảnh", "Thuế TNCN", "Khoản trừ", "Thực lĩnh", "BH + KPCĐ doanh nghiệp", "Chi phí doanh nghiệp"];
  const rows = dong.map((d, i) => {
    const dv = d.inputs as unknown as DauVaoLuong;
    const kq = d.result as unknown as KetQuaLuong;
    return [
      i + 1, ma.get(d.userId) ?? "", d.fullName, dv.cong.chuan, kq.congTinhLuong, kq.luongTheoCong, kq.tongPhuCap, kq.tangCa.tien, kq.thuongKpi,
      kq.hoaHong.tien + kq.hoaHong.truyThu, kq.khoanCong, kq.tongThuNhap, kq.thuNhapChiuThue, kq.baoHiem.nld.bhxh, kq.baoHiem.nld.bhyt, kq.baoHiem.nld.bhtn,
      kq.giamTru.tong, kq.thue.tien, kq.khoanTru, kq.thucLinh, kq.baoHiem.dn.tong, kq.chiPhiDoanhNghiep,
    ];
  });
  const sum = (c: number) => rows.reduce((a, r) => a + Number(r[c] ?? 0), 0);
  rows.push(["", "", "TỔNG CỘNG", "", "", ...Array.from({ length: tieuDe.length - 5 }, (_, k) => sum(k + 5))]);
  const nhap = laKyDaKhoa(ky.status) ? "" : "-NHAP";
  const ten = `bang-luong-${ky.year}-${thang2(ky.month)}${nhap}.${dinhDang}`;
  await ghiXem(nc, "xuat-bang-luong", { objectType: "payroll_run", objectId: id }, dong.map((d) => d.userId));
  await nc.kiemToan({ action: "xuat-luong", objectType: "payroll_run", objectId: id, after: { loai: "bang-luong", dinhDang, soDong: dong.length } });
  await nc.suKien({ eventType: SU_KIEN.PAYROLL_EXPORTED, objectType: "payroll_run", objectId: id, payload: { loai: "bang-luong" } });
  const noiDung = dinhDang === "csv"
    ? taoCsv(tieuDe, rows)
    : taoBangTinhXml(`Lương ${nhanKy(ky.year, ky.month).replace("/", "-")}`, tieuDe, rows, [`BẢNG LƯƠNG THÁNG ${nhanKy(ky.year, ky.month)}${nhap ? " — BẢN NHÁP" : ""}`]);
  return tepTraVe(noiDung, ten, dinhDang);
}

/**
 * File chi lương ngân hàng (LU-51): chỉ kỳ ĐÃ KHÓA, số tiền = thực lĩnh > 0, cột + nội dung theo mẫu cấu hình.
 * Số tài khoản lấy từ phiên bản hồ sơ lương HIỆN HÀNH (tài khoản không phải đầu vào tính lương). Thiếu tài khoản → chặn.
 */
export async function xuatNganHang(nc: NguCanh, id: string, dinhDang: "csv" | "xls" = "csv") {
  batBuocQuyenLuong(nc, "luong.export", { objectType: "payroll_run", objectId: id });
  const { ky, dong, ma } = await docKyVaDong(nc, id);
  if (!laKyDaKhoa(ky.status)) throw new LoiNghiepVu("Chỉ xuất file chi lương khi kỳ lương đã khóa.", 409, "chua-khoa");
  const mau = await docMauNganHang(nc.tx);
  const hs = await hoSoApDung(nc.tx, dong.map((d) => d.userId), homNayVN());
  const chi = dong.filter((d) => d.netPay > 0n);
  const thieu = chi.filter((d) => !(hs.get(d.userId)?.bankAccount));
  if (thieu.length) {
    throw new LoiNghiepVu(`Chưa có số tài khoản ngân hàng: ${thieu.map((d) => d.fullName).join(", ")}. Nhân sự bổ sung ở Hồ sơ lương (phiên bản mới) rồi xuất lại.`, 422, "thieu-tai-khoan");
  }
  const rows = chi.map((d, i) => {
    const h = hs.get(d.userId)!;
    const nd = dienNoiDung(mau.noiDung, { hoTen: d.fullName, thang: ky.month, nam: ky.year, maNv: ma.get(d.userId) ?? null });
    const gt: Record<CotNganHang, string | number> = {
      stt: i + 1,
      "so-tai-khoan": h.bankAccount ?? "",
      "chu-tai-khoan": (mau.boDau ? boDau(h.accountHolder ?? d.fullName) : (h.accountHolder ?? d.fullName)).toUpperCase(),
      "ngan-hang": h.bankName ?? "",
      "so-tien": Number(d.netPay),
      "noi-dung": mau.boDau ? boDau(nd) : nd,
      "ma-nhan-vien": ma.get(d.userId) ?? "",
      "ho-ten": d.fullName,
    };
    // Số tài khoản là CHUỖI (giữ số 0 đầu) — ô chữ, đã chống chèn công thức.
    return mau.cot.map((c) => gt[c]);
  });
  const tieuDe = mau.cot.map((c) => NHAN_COT_NGAN_HANG[c]);
  await ghiXem(nc, "xuat-chi-luong-ngan-hang", { objectType: "payroll_run", objectId: id }, chi.map((d) => d.userId));
  await nc.kiemToan({ action: "xuat-luong", objectType: "payroll_run", objectId: id, after: { loai: "ngan-hang", dinhDang, soDong: rows.length } });
  await nc.suKien({ eventType: SU_KIEN.PAYROLL_EXPORTED, objectType: "payroll_run", objectId: id, payload: { loai: "ngan-hang" } });
  const ten = `chi-luong-${ky.year}-${thang2(ky.month)}.${dinhDang}`;
  return tepTraVe(dinhDang === "csv" ? taoCsv(tieuDe, rows) : taoBangTinhXml("Chi lương", tieuDe, rows), ten, dinhDang);
}

/** Bút toán lương (LU-53): CSV tổng hợp theo cặp tài khoản (Cấu hình nhóm Tính lương). Chỉ kỳ đã khóa. */
export async function xuatButToan(nc: NguCanh, id: string) {
  batBuocQuyenLuong(nc, "luong.export", { objectType: "payroll_run", objectId: id });
  const ky = await nc.tx.payrollRun.findFirst({ where: { id } });
  if (!ky) throw new LoiKhongTimThay("Kỳ lương");
  if (!laKyDaKhoa(ky.status)) throw new LoiNghiepVu("Chỉ xuất bút toán khi kỳ lương đã khóa.", 409, "chua-khoa");
  // Bút toán là số TỔNG của cả kỳ — đọc mọi dòng (người xuất có luong.export + 2 lớp).
  const dong = await nc.tx.payrollLine.findMany({ where: { runId: id } });
  const tk = taiKhoanTu(await docCauHinhLuong(nc.tx));
  const butToan = butToanLuong(
    dong.map((d) => {
      const kq = d.result as unknown as KetQuaLuong;
      const dv = d.inputs as unknown as DauVaoLuong;
      const tamUng = dv.khoan.filter((k) => k.chieu === "tru" && k.loai === "tam-ung").reduce((a, k) => a + k.soTien, 0);
      return {
        tongThuNhap: kq.tongThuNhap, bhNld: kq.baoHiem.nld, bhDn: kq.baoHiem.dn, thue: kq.thue.tien, tamUng, truKhac: kq.khoanTru - tamUng, congSauThue: kq.khoanCongSauThue ?? 0, thucLinh: kq.thucLinh,
      };
    }),
    tk,
    ky.status === "da-chi",
  );
  const ngay = khoangThang(ky.year, ky.month).den.split("-").reverse().join("/");
  const so = `BL${ky.year}${thang2(ky.month)}`;
  await nc.kiemToan({ action: "xuat-luong", objectType: "payroll_run", objectId: id, after: { loai: "but-toan", soButToan: butToan.length } });
  await nc.suKien({ eventType: SU_KIEN.PAYROLL_EXPORTED, objectType: "payroll_run", objectId: id, payload: { loai: "but-toan" } });
  const noiDung = taoCsv(
    ["Ngày hạch toán", "Ngày chứng từ", "Số chứng từ", "Diễn giải", "TK Nợ", "TK Có", "Số tiền"],
    butToan.map((b) => [ngay, ngay, so, `${b.dienGiai} tháng ${nhanKy(ky.year, ky.month)}`, String(b.no), String(b.co), b.soTien]),
  );
  return tepTraVe(noiDung, `but-toan-luong-${ky.year}-${thang2(ky.month)}.csv`, "csv");
}

// ---------------------------------------------------------------------------
// Email phiếu lương (LU-44, QĐ-151)
// ---------------------------------------------------------------------------

/** Xếp thư phiếu lương của mọi dòng vào hàng chờ thư giao dịch. Chống trùng theo dòng. Chỉ kỳ đã khóa. */
export async function guiEmailPhieuLuong(nc: NguCanh, id: string) {
  batBuocQuyenLuong(nc, "luong.export", { objectType: "payroll_run", objectId: id });
  const ky = await nc.tx.payrollRun.findFirst({ where: { id } });
  if (!ky) throw new LoiKhongTimThay("Kỳ lương");
  if (!laKyDaKhoa(ky.status)) throw new LoiNghiepVu("Chỉ gửi phiếu lương khi kỳ đã khóa.", 409, "chua-khoa");
  const dong = await nc.tx.payrollLine.findMany({ where: { runId: id }, select: { id: true, userId: true } });
  const email = new Map((await nc.tx.user.findMany({ where: { id: { in: dong.map((d) => d.userId) }, status: "hoat-dong" }, select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  const du = dong.filter((d) => email.get(d.userId));
  const kq = await nc.tx.emailTransactional.createMany({
    data: du.map((d) => ({ tenantId: nc.tenantId, kind: "phieu-luong", email: email.get(d.userId)!, dedupeKey: `phieu-luong:${d.id}`, payload: { dongId: d.id } })),
    skipDuplicates: true,
  });
  await nc.kiemToan({ action: "gui-phieu-luong", objectType: "payroll_run", objectId: id, after: { xepHang: kq.count, daCoTruoc: du.length - kq.count, khongEmail: dong.length - du.length } });
  return { xepHang: kq.count, daCoTruoc: du.length - kq.count, khongEmail: dong.length - du.length };
}
