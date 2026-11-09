import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PhieuLuongIn from "../src/components/luong/PhieuLuongIn";
import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { kiemTraGioiHanAI } from "../src/lib/vai-tro";
import { cacNgayTrongThang, thuTrongTuan } from "../src/modules/cham-cong/tinh-toan";
import { danhSachHoSo, lichSuHoSo, taoHoSoLuong, themNguoiPhuThuoc } from "../src/modules/luong/ho-so";
import { LuocDoHoSoLuong, LuocDoKhoan, LuocDoThamSo } from "../src/modules/luong/luoc-do";
import {
  chiTietKyLuong,
  chiTietPhieuLuong,
  daChiKyLuong,
  danhSachKyLuong,
  duyetKyLuong,
  guiDuyetKyLuong,
  khoaKyLuong,
  kiemLaiPhieuLuong,
  phieuLuongCuaToi,
  taoKyLuong,
  themKhoanLuong,
  tinhKyLuong,
  traLaiKyLuong,
  xoaKhoanLuong,
} from "../src/modules/luong/service";
import { danhSachThamSo, luuMauNganHang, taoThamSo, xacNhanThamSo } from "../src/modules/luong/tham-so";
import { guiEmailPhieuLuong, xuatBangLuong, xuatButToan, xuatNganHang } from "../src/modules/luong/xuat";
import type { DauVaoLuong, KetQuaLuong } from "../src/modules/luong/tinh-toan";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng 0.21.0 — tính lương trên CSDL THẬT, qua đúng service mà API gọi. Luật: BUSINESS_RULES.md mục 32
 * (LU-01 → LU-63). Không dùng giờ thật cho dữ liệu nghiệp vụ: tháng lương, ngày thu tiền, mốc khóa đều là hằng số.
 * Chạy: npm run thu:luong (CSDL phát triển).
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Math.floor(performance.timeOrigin).toString(36);
const MOC = new Date("2026-04-03T03:00:00Z"); // mốc cố định cho cột thời điểm dựng sẵn
const NGAY = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-luong"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string): Promise<LoiNghiepVu | null> {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
    return null;
  } catch (e) {
    const dungKieu = kieu === "quyen" ? e instanceof LoiThieuQuyen : kieu === "khong-thay" ? e instanceof LoiKhongTimThay : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
    return e instanceof LoiNghiepVu ? e : null;
  }
}
async function csdlChan(ten: string, khoi: () => Promise<unknown>) {
  try {
    await khoi();
    dat(ten, false, "CSDL không chặn");
  } catch {
    dat(ten, true);
  }
}

async function docTep(r: Response | unknown): Promise<string> {
  return (r as Response).text();
}

async function main() {
  console.log("=== Thử Nhân sự – tính lương (0.21.0) ===\n");
  const tenant = await seedNenMong(chu, `thu-lu-${DAU}`, "Doanh nghiệp thử lương");
  const T = tenant.id;
  const vaiTro = async (code: string, t = T) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: t, code } } })).id;
  async function nguoi(ten: string, vai: string, o: { hai?: boolean; t?: string; ma?: string } = {}) {
    const t = o.t ?? T;
    const u = await chu.user.create({
      data: {
        tenantId: t, email: `${ten.replace(/[^a-z0-9]/gi, "").toLowerCase()}.${DAU}@thu.test`, passwordHash: "x", fullName: ten,
        ...(o.hai !== false ? { totpEnabledAt: MOC, totpSecretEnc: "v1:thu" } : {}),
        userRoles: { create: { tenantId: t, roleId: await vaiTro(vai, t) } },
        staffProfile: { create: { tenantId: t, employeeCode: o.ma ?? null, hiredAt: NGAY("2025-01-01") } },
      },
    });
    return u.id;
  }
  const gd = await nguoi("Giám đốc", "ceo");
  const gd2 = await nguoi("Phó giám đốc", "ceo");
  const ad = await nguoi("Quản trị", "admin");
  const kt = await nguoi("Kế toán", "finance");
  const kt2 = await nguoi("Kế toán chưa bật 2 lớp", "finance", { hai: false });
  const hr = await nguoi("Nhân sự", "nhan-su-hr");
  const nvA = await nguoi("Nhân viên A", "sales", { ma: "NV001", hai: false });
  const nvB = await nguoi("Nhân viên B", "technical", { ma: "NV002", hai: false });
  const tt = await nguoi("+Thực tập T", "sinh-vien-thuc-tap", { ma: "TT001", hai: false });
  const ai = await nguoi("Trợ lý thử", "ai-assistant");

  // Lịch: T2–T6 cả ca, T7 sáng, CN nghỉ. Lễ thử 10/03/2026 (thứ Ba).
  const ca = await chu.workShift.create({ data: { tenantId: T, code: "hc", name: "Hành chính", startMinute: 480, endMinute: 1020, breakStartMinute: 720, breakMinutes: 60 } });
  const lich = await chu.workSchedule.create({ data: { tenantId: T, code: "hc", name: "Hành chính", shiftId: ca.id, days: ["ca", "ca", "ca", "ca", "ca", "sang", "nghi"] } });
  for (const u of [nvA, nvB, tt, ad]) await chu.scheduleAssignment.create({ data: { tenantId: T, userId: u, scheduleId: lich.id, effectiveFrom: NGAY("2026-01-01") } });
  await chu.holiday.create({ data: { tenantId: T, date: NGAY("2026-03-10"), name: "Lễ thử" } });

  // ==================================================================
  console.log("— A. Quyền, 2 lớp, trợ lý AI —");
  dat("LU-60: định nghĩa vai trò AI không có luong.*", kiemTraGioiHanAI().dat);
  dat("LU-60: CSDL — vai trò AI không có quyền lương", (await chu.rolePermission.count({ where: { roleId: await vaiTro("ai-assistant"), permission: { module: "luong" } } })) === 0);
  await nemLoi("Trợ lý AI không xem được kỳ lương", "quyen", () => voi(T, ai, (nc) => danhSachKyLuong(nc)));
  await nemLoi("LU-61: Kế toán chưa bật 2 lớp → lỗi rõ ràng", "nghiep-vu", () => voi(T, kt2, (nc) => danhSachKyLuong(nc)), "luong-can-2-lop");
  await nemLoi("Nhân viên (phiếu của mình) không xem được danh sách kỳ lương", "quyen", () => voi(T, nvA, (nc) => danhSachKyLuong(nc)));
  await nemLoi("Nhân viên không xem được hồ sơ lương", "quyen", () => voi(T, nvA, (nc) => danhSachHoSo(nc)));

  // ==================================================================
  console.log("\n— B. Hồ sơ lương (Nhân sự) —");
  const loaiPc = await chu.salaryAllowanceType.findMany({ where: { tenantId: T } });
  const anTrua = loaiPc.find((l) => l.code === "an-trua")!;
  dat("Danh mục phụ cấp nạp sẵn (ăn trưa không chịu thuế, theo ngày công)", loaiPc.length === 3 && !anTrua.taxable && anTrua.basis === "ngay-cong");
  const hs = (o: Record<string, unknown>) => LuocDoHoSoLuong.parse({ hieuLucTu: "2026-01-01", loaiHopDong: "chinh-thuc", cachTra: "thang", phuongPhapThue: "luy-tien", ...o });
  await nemLoi("Kế toán không lập hồ sơ lương (việc của Nhân sự)", "quyen", () => voi(T, kt, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvA, luongCoBan: 1 }))));
  const hsA = await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvA, luongCoBan: "15.000.000", luongDongBH: 15_000_000, huongHoaHong: true, phuCap: [{ loaiId: anTrua.id, soTien: 30_000 }], soTaiKhoan: "0011001234567", nganHang: "Vietcombank", chuTaiKhoan: "=CMD|' /C calc'!A0" })));
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvB, luongCoBan: 20_000_000, luongDongBH: 20_000_000, thuongKpi: 2_000_000, soTaiKhoan: "1903", nganHang: "Techcombank" })));
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: tt, loaiHopDong: "thuc-tap", luongCoBan: 4_000_000, phuongPhapThue: "khau-tru-10", soTaiKhoan: "7777", nganHang: "MB" })));
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: ad, luongCoBan: 30_000_000, luongDongBH: 30_000_000, soTaiKhoan: "8888", nganHang: "ACB" })));
  await voi(T, hr, (nc) => themNguoiPhuThuoc(nc, { nguoiId: nvB, hoTen: "Con của B", quanHe: "Con", soGiayTo: "079200000001", tuThang: "2026-01", denThang: null }));
  const nkHs = await chu.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "tao-ho-so-luong", objectId: hsA.id } });
  dat("QĐ-148: nhật ký tạo hồ sơ KHÔNG chứa số tiền", !JSON.stringify(nkHs.after).includes("15000000"));
  await csdlChan("LU-02: phiên bản hồ sơ lương chỉ ghi thêm (chủ sở hữu cũng không sửa được)", () => chu.salaryProfile.update({ where: { id: hsA.id }, data: { baseSalary: 99n } }));
  const truocXem = await chu.auditLog.count({ where: { tenantId: T, action: "xem-luong" } });
  const ls = await voi(T, hr, (nc) => lichSuHoSo(nc, nvB));
  dat("Lịch sử hồ sơ: phiên bản + người phụ thuộc", ls.phienBan.length === 1 && ls.nguoiPhuThuoc.length === 1);
  dat("LU-62: xem hồ sơ người khác → ghi nhật ký xem", (await chu.auditLog.count({ where: { tenantId: T, action: "xem-luong" } })) === truocXem + 1);

  // ==================================================================
  console.log("\n— C. Tham số có hiệu lực theo ngày —");
  const ts0 = await voi(T, kt, (nc) => danhSachThamSo(nc, "2026-04-30"));
  dat("LU-11: bộ nạp sẵn hiệu lực chưa xác nhận → băng cảnh báo", ts0.canXacNhan.length >= 8);
  await nemLoi("Nhân sự không nhập được tham số (việc của Kế toán)", "quyen", () => voi(T, hr, (nc) => taoThamSo(nc, LuocDoThamSo.parse({ loai: "thu-viec", hieuLucTu: "2026-01-01", giaTri: { tyLeToiThieu: 85 }, ghiChu: "Thử quyền" }))));
  await nemLoi("Tham số sai lược đồ bị chặn (biểu thuế bậc giảm dần)", "nghiep-vu", () => voi(T, kt, (nc) => taoThamSo(nc, LuocDoThamSo.parse({ loai: "bieu-thue", hieuLucTu: "2026-01-01", giaTri: { bac: [{ den: 10, tyLe: 5 }, { den: 5, tyLe: 10 }, { den: null, tyLe: 20 }] }, ghiChu: "Biểu sai" }))));
  await voi(T, kt, (nc) => taoThamSo(nc, LuocDoThamSo.parse({ loai: "hoa-hong", hieuLucTu: "2026-01-01", giaTri: { kieu: "phang", tyLe: 2, bac: [] }, ghiChu: "Chính sách hoa hồng 2% doanh số thu (thử)" })));

  // ==================================================================
  console.log("\n— D. Kỳ lương: chặn khi bảng công chưa khóa / còn ngày thiếu giờ —");
  const k3 = await voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 3 }));
  await nemLoi("Một tháng một kỳ lương", "nghiep-vu", () => voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 3 })), "ky-da-co");
  // 0.22.0 (QĐ-172): chưa có bảng công KHÔNG chặn — tính bằng công mặc định (đủ công chuẩn) + cảnh báo vàng.
  const r0 = await voi(T, kt, (nc) => tinhKyLuong(nc, k3.id));
  dat("0.22.0: chưa có bảng công → vẫn tính, cảnh báo vàng bang-cong-chua-khoa, mọi dòng nguồn công mặc định",
    r0.canhBao.some((c) => c.ma === "bang-cong-chua-khoa" && c.muc === "canh-bao") && r0.soDong > 0 && r0.nguonCong["mac-dinh"] === r0.soDong, JSON.stringify(r0.nguonCong));

  async function bangCong(nam: number, thang: number, dong: { userId: string; vang?: string[]; thieuGio?: string[]; tangCaPhut?: Record<string, number> }[]) {
    const bc = await chu.timesheet.create({ data: { tenantId: T, year: nam, month: thang, generatedAt: MOC, generatedBy: hr, feedbackDeadline: MOC } });
    for (const d of dong) {
      for (const ngay of cacNgayTrongThang(nam, thang)) {
        const thu = thuTrongTuan(ngay);
        if (thu === 6) continue;
        const le = ngay === "2026-03-10";
        const duKien = le ? 0 : thu === 5 ? 0.5 : 1;
        if (duKien === 0 && !d.tangCaPhut?.[ngay]) continue;
        const vang = d.vang?.includes(ngay);
        await chu.timesheetRow.create({
          data: {
            tenantId: T, timesheetId: bc.id, userId: d.userId, workDate: NGAY(ngay), isAdjustment: false, dayType: le ? "le" : "thuong",
            expectedValue: duKien, workValue: vang ? 0 : duKien, otMinutes: d.tangCaPhut?.[ngay] ?? 0,
            flags: d.thieuGio?.includes(ngay) ? ["thieu-gio", "thieu-gio-cho-xem-xet"] : vang ? ["vang-mat"] : [],
          },
        });
      }
    }
    return bc;
  }
  const bc3 = await bangCong(2026, 3, [
    { userId: nvA, tangCaPhut: { "2026-03-02": 120 } },
    { userId: nvB, thieuGio: ["2026-03-05"] },
    { userId: tt },
    { userId: ad },
  ]);
  // 0.22.0 (QĐ-183): bảng công NHÁP → nguồn công TẠM ("bảng công nháp") cho người có dòng, cảnh báo "chưa khóa".
  const rNhap = await voi(T, kt, (nc) => tinhKyLuong(nc, k3.id));
  dat("0.22.0: bảng công còn nháp → dùng làm nguồn công tạm (bang-cong-nhap) + cảnh báo chưa khóa",
    rNhap.nguonCong["bang-cong"] === 0 && rNhap.nguonCong["bang-cong-nhap"] === 4 && rNhap.canhBao.some((c) => c.ma === "bang-cong-chua-khoa" && /chưa khóa/.test(c.noiDung)), JSON.stringify(rNhap.nguonCong));
  await chu.timesheet.update({ where: { id: bc3.id }, data: { status: "da-khoa", lockedAt: MOC, lockedBy: hr } });
  // 0.22.0 (QĐ-172): ngày thiếu giờ còn chờ quyết KHÔNG chặn — tính theo công hiện tại + cảnh báo (kỳ và dòng).
  const rTg = await voi(T, kt, (nc) => tinhKyLuong(nc, k3.id));
  dat("0.22.0: còn ngày thiếu giờ chờ quyết → vẫn tính, cảnh báo vàng cấp kỳ", rTg.canhBao.some((c) => c.ma === "con-ngay-thieu-gio" && c.muc === "canh-bao"));
  const dTgB = await chu.payrollLine.findFirstOrThrow({ where: { runId: k3.id, userId: nvB } });
  dat("…dòng của B có cảnh báo ngày chờ quyết đúng ngày 05/03, nguồn công = bảng công",
    (dTgB.warnings as { ma: string; noiDung: string }[]).some((c) => c.ma === "thieu-gio-cho-quyet" && c.noiDung.includes("05/03/2026")) && (dTgB.inputs as { nguon: { nguonCong: string } }).nguon.nguonCong === "bang-cong");
  await chu.attendanceDayReview.create({ data: { tenantId: T, userId: nvB, workDate: NGAY("2026-03-05"), decision: "nua", note: "Về sớm có việc riêng", reviewedBy: gd, reviewedAt: MOC } });

  // Thu tiền (hoa hồng) + phiếu đánh giá đã chốt cho B.
  const kh = await chu.customer.create({ data: { tenantId: T, code: `KH${DAU}`.slice(0, 30), name: "Khách thử lương", nameNormalized: "khach thu luong", ownerId: nvA } });
  const hd = await chu.invoice.create({ data: { tenantId: T, number: `HD-${DAU}`, customerId: kh.id, ownerId: nvA, status: "ISSUED", issueDate: NGAY("2026-03-01"), dueDate: NGAY("2026-04-30"), issuedAt: MOC, issuedBy: kt, subtotal: 500_000_000, total: 500_000_000 } });
  let soPt = 0;
  async function thu(ngay: string, soTien: number, taoLuc: Date) {
    const p = await chu.payment.create({ data: { tenantId: T, number: `PT-${DAU}-${++soPt}`, customerId: kh.id, method: "chuyen-khoan", amount: soTien, receivedAt: NGAY(ngay), createdAt: taoLuc, allocations: { create: { tenantId: T, invoiceId: hd.id, amount: soTien } } } });
    return p;
  }
  const p1 = await thu("2026-03-15", 50_000_000, new Date("2026-03-15T03:00:00Z"));
  const p2 = await thu("2026-03-20", 10_000_000, new Date("2026-03-20T03:00:00Z"));
  const p3 = await thu("2026-04-02", 7_000_000, new Date("2026-04-02T03:00:00Z"));
  const kyDg = await chu.evaluationPeriod.create({ data: { tenantId: T, kind: "thang", year: 2026, number: 3, startDate: NGAY("2026-03-01"), endDate: NGAY("2026-03-31") } });
  await chu.evaluation.create({ data: { tenantId: T, periodId: kyDg.id, userId: nvB, status: "da-chot", totalScore: 92, grade: "A", bonusCoef: 1.2, finalizedBy: gd, finalizedAt: MOC } });

  // ==================================================================
  console.log("\n— E. Tính lương, ảnh chụp đầu vào, tham số chưa xác nhận —");
  const r1 = await voi(T, kt, (nc) => tinhKyLuong(nc, k3.id));
  dat("Tính được sau khi quyết ngày thiếu giờ; 4 dòng", r1.soDong === 4, JSON.stringify(r1));
  dat("Cảnh báo kỳ: ngày thiếu giờ quyết sau khi khóa bảng công", r1.canhBao.some((c) => c.ma === "thieu-gio-quyet-sau-khoa"));
  // 0.22.0 (QĐ-170): tham số chưa xác nhận → cảnh báo vàng (Cấu hình luong.chan_khi_tham_so_chua_xac_nhan = 0 mặc định);
  // bật chặn → lỗi cấp kỳ, không gửi duyệt được (đường chặt — thử ở thu-mo-dan).
  dat("0.22.0: tham số nạp sẵn chưa xác nhận → cảnh báo vàng cấp kỳ (không còn là lỗi)", r1.canhBao.some((c) => c.ma === "tham-so-chua-xac-nhan" && c.muc === "canh-bao"));
  for (const b of ts0.canXacNhan) await voi(T, kt, (nc) => xacNhanThamSo(nc, b.id));
  await nemLoi("Xác nhận lần hai → 409", "nghiep-vu", () => voi(T, kt, (nc) => xacNhanThamSo(nc, ts0.canXacNhan[0].id)), "da-xac-nhan");
  dat("Hết băng cảnh báo sau khi xác nhận", (await voi(T, kt, (nc) => danhSachThamSo(nc, "2026-04-30"))).canXacNhan.length === 0);
  const bo = await chu.payrollParamSet.findFirstOrThrow({ where: { tenantId: T, id: ts0.canXacNhan[0].id } });
  dat("Xác nhận ghi người + thời điểm", bo.confirmedBy === kt && Boolean(bo.confirmedAt));
  await csdlChan("LU-10: bộ tham số chỉ ghi thêm (sửa giá trị)", () => chu.payrollParamSet.update({ where: { id: bo.id }, data: { values: { tyLe: 1 } } }));
  await csdlChan("…(xóa)", () => chu.payrollParamSet.delete({ where: { id: bo.id } }));

  await voi(T, kt, (nc) => tinhKyLuong(nc, k3.id));
  const dong = async (kyId: string, u: string) => chu.payrollLine.findFirstOrThrow({ where: { runId: kyId, userId: u } });
  const dA = await dong(k3.id, nvA);
  const vA = dA.inputs as unknown as DauVaoLuong;
  const kA = dA.result as unknown as KetQuaLuong;
  dat("Công chuẩn theo lịch (22 ngày thường + 4 nửa ngày thứ Bảy = 24)", vA.cong.chuan === 24, String(vA.cong.chuan));
  dat("Ngày lễ được trả: 1; công thực tế 23 → công tính lương 24", vA.cong.le === 1 && vA.cong.thucTe === 23 && kA.congTinhLuong === 24);
  dat("Lương theo công đủ 15.000.000", kA.luongTheoCong === 15_000_000);
  dat("Phụ cấp ăn trưa theo ngày công thực tế: 30.000 × 23", kA.tongPhuCap === 690_000 && kA.phuCapKhongChiuThue === 690_000);
  dat("Tăng ca 2 giờ ngày thường đã duyệt: 15.000.000 / 24 / 8 × 2 × 150%", kA.tangCa.tien === 234_375);
  dat("LU-23: hoa hồng 2% trên tiền đã thu trong tháng (50tr + 10tr)", kA.hoaHong.doanhSo === 60_000_000 && kA.hoaHong.tien === 1_200_000);
  dat("Ảnh chụp ghi bảng công + bộ tham số đã dùng", (vA as unknown as { nguon: { bangCongId: string; thamSo: unknown[] } }).nguon.bangCongId === bc3.id && (vA as unknown as { nguon: { thamSo: unknown[] } }).nguon.thamSo.length === 8);
  const kiem = await voi(T, kt, (nc) => kiemLaiPhieuLuong(nc, dA.id));
  dat("LU-28: tính lại từ ảnh chụp ra đúng số", kiem.khop, JSON.stringify(kiem));
  const kB = (await dong(k3.id, nvB)).result as unknown as KetQuaLuong;
  dat("LU-26: thưởng KPI = 2.000.000 × hệ số 1,2 của phiếu đã chốt", kB.thuongKpi === 2_400_000);
  dat("Ngày thiếu giờ quyết SAU khóa: lương theo số đã khóa (đủ công)", kB.luongTheoCong === 20_000_000);
  dat("Người phụ thuộc: 1 người giảm trừ", kB.giamTru.soNguoi === 1 && kB.giamTru.phuThuoc === 6_200_000);
  const kT = (await dong(k3.id, tt)).result as unknown as KetQuaLuong;
  dat("LU-35: thực tập sinh khấu trừ 10% (4.000.000 → 400.000)", kT.thue.phuongPhap === "khau-tru-10" && kT.thue.tien === 400_000);
  dat("LU-26: không có phiếu đánh giá + không có mức thưởng → không cảnh báo", !kA.canhBao.some((c) => c.ma === "kpi-chua-chot"));

  // ==================================================================
  console.log("\n— F. Khoản cộng / trừ, lương âm —");
  const kTam = await voi(T, kt, (nc) => themKhoanLuong(nc, k3.id, LuocDoKhoan.parse({ nguoiId: nvA, chieu: "tru", loai: "tam-ung", soTien: 2_000_000, lyDo: "Tạm ứng giữa tháng" })));
  await nemLoi("Có khoản mới chưa tính → không gửi duyệt", "nghiep-vu", () => voi(T, kt, (nc) => guiDuyetKyLuong(nc, k3.id)), "can-tinh-lai");
  const kAm = await voi(T, kt, (nc) => themKhoanLuong(nc, k3.id, LuocDoKhoan.parse({ nguoiId: tt, chieu: "tru", loai: "tam-ung", soTien: 50_000_000, lyDo: "Nhập nhầm số tạm ứng" })));
  await voi(T, kt, (nc) => tinhKyLuong(nc, k3.id));
  dat("LU-36: thực lĩnh âm → dòng có lỗi", (await dong(k3.id, tt)).hasError);
  await nemLoi("…và không gửi duyệt được", "nghiep-vu", () => voi(T, kt, (nc) => guiDuyetKyLuong(nc, k3.id)), "dong-co-loi");
  await voi(T, kt, (nc) => xoaKhoanLuong(nc, kAm.id));
  await voi(T, kt, (nc) => tinhKyLuong(nc, k3.id));
  dat("Khoản trừ tạm ứng vào thực lĩnh, không giảm thuế", ((await dong(k3.id, nvA)).result as unknown as KetQuaLuong).khoanTru === 2_000_000);
  void kTam;

  // ==================================================================
  console.log("\n— G. Gửi duyệt, không tự duyệt, duyệt đồng thời, trả lại —");
  await voi(T, kt, (nc) => guiDuyetKyLuong(nc, k3.id));
  await nemLoi("Kế toán không có quyền duyệt", "quyen", () => voi(T, kt, (nc) => duyetKyLuong(nc, k3.id)));
  await nemLoi("LU-41: Quản trị có dòng lương trong bảng → không tự duyệt", "nghiep-vu", () => voi(T, ad, (nc) => duyetKyLuong(nc, k3.id)), "tu-duyet");
  await csdlChan("LU-41: CSDL chặn người duyệt = người tính", () => chu.payrollRun.update({ where: { id: k3.id }, data: { approvedBy: kt, approvedAt: MOC } }));
  const song = await Promise.allSettled([voi(T, gd, (nc) => duyetKyLuong(nc, k3.id)), voi(T, gd2, (nc) => duyetKyLuong(nc, k3.id))]);
  const ok = song.filter((s) => s.status === "fulfilled").length;
  const tc = song.filter((s) => s.status === "rejected" && s.reason instanceof LoiNghiepVu && s.reason.status === 409).length;
  dat("Duyệt đồng thời: đúng một thành công, lần kia 409", ok === 1 && tc === 1, JSON.stringify(song.map((s) => s.status)));
  dat("Khoản cộng / trừ ghi người duyệt", (await chu.payrollItem.findMany({ where: { runId: k3.id } })).every((k) => k.approvedBy === gd || k.approvedBy === gd2));
  // Hủy phiếu thu p2 sau khi tính → không khóa được.
  await chu.payment.update({ where: { id: p2.id }, data: { status: "huy", cancelledAt: MOC, cancelReason: "Séc không thanh toán" } });
  await nemLoi("Phiếu thu đã tính hoa hồng bị hủy trước khi khóa → chặn khóa", "nghiep-vu", () => voi(T, gd, (nc) => khoaKyLuong(nc, k3.id)), "phieu-thu-da-huy");
  await voi(T, gd, (nc) => traLaiKyLuong(nc, k3.id, { lyDo: "Phiếu thu PT2 đã hủy, tính lại" }));
  dat("Trả lại → nháp, xóa người duyệt", (await chu.payrollRun.findUniqueOrThrow({ where: { id: k3.id } })).status === "nhap" && (await chu.payrollItem.count({ where: { runId: k3.id, approvedBy: { not: null } } })) === 0);
  await voi(T, kt, (nc) => tinhKyLuong(nc, k3.id));
  dat("Tính lại: hoa hồng chỉ còn phiếu còn hiệu lực (50tr × 2%)", ((await dong(k3.id, nvA)).result as unknown as KetQuaLuong).hoaHong.tien === 1_000_000);
  await voi(T, kt, (nc) => guiDuyetKyLuong(nc, k3.id));
  await voi(T, gd, (nc) => duyetKyLuong(nc, k3.id));
  const dA3 = await dong(k3.id, nvA);
  await nemLoi("LU-42: nhân viên chưa xem được phiếu khi kỳ chưa khóa", "khong-thay", () => voi(T, nvA, (nc) => chiTietPhieuLuong(nc, dA3.id)));
  dat("…và danh sách phiếu của tôi rỗng", (await voi(T, nvA, (nc) => phieuLuongCuaToi(nc))).length === 0);
  await voi(T, gd2, (nc) => khoaKyLuong(nc, k3.id));
  dat("Khóa kỳ", (await chu.payrollRun.findUniqueOrThrow({ where: { id: k3.id } })).status === "da-khoa");

  // ==================================================================
  console.log("\n— H. Bất biến sau khóa (kể cả SQL qua vai cowork_app) —");
  await nemLoi("Service: không tính lại kỳ đã khóa", "nghiep-vu", () => voi(T, kt, (nc) => tinhKyLuong(nc, k3.id)), "sai-trang-thai");
  await nemLoi("Service: không thêm khoản vào kỳ đã khóa", "nghiep-vu", () => voi(T, kt, (nc) => themKhoanLuong(nc, k3.id, LuocDoKhoan.parse({ nguoiId: nvA, chieu: "cong", loai: "thuong", soTien: 1, lyDo: "Thưởng thử" }))), "sai-trang-thai");
  await csdlChan("cowork_app: UPDATE dòng lương kỳ đã khóa", () => voiTenant(T, (tx) => tx.$executeRaw`UPDATE payroll_lines SET net_pay = 1 WHERE run_id = ${k3.id}::uuid`));
  await csdlChan("cowork_app: mở lại kỳ đã khóa", () => voiTenant(T, (tx) => tx.$executeRaw`UPDATE payroll_runs SET status = 'nhap' WHERE id = ${k3.id}::uuid`));
  await csdlChan("cowork_app: xóa khoản của kỳ đã khóa", () => voiTenant(T, (tx) => tx.$executeRaw`DELETE FROM payroll_items WHERE run_id = ${k3.id}::uuid`));
  await csdlChan("cowork_app: sửa hoa hồng của kỳ đã khóa", () => voiTenant(T, (tx) => tx.$executeRaw`UPDATE payroll_commission_items SET commission = 0 WHERE run_id = ${k3.id}::uuid`));
  await csdlChan("cowork_app: không có quyền xóa kỳ lương", () => voiTenant(T, (tx) => tx.$executeRaw`DELETE FROM payroll_runs WHERE id = ${k3.id}::uuid`));
  await csdlChan("Chủ sở hữu cũng không sửa được dòng lương đã khóa", () => chu.payrollLine.update({ where: { id: dA3.id }, data: { netPay: 1n } }));

  // ==================================================================
  console.log("\n— I. Phiếu lương của tôi, IDOR, nhật ký xem —");
  const cuaToi = await voi(T, nvA, (nc) => phieuLuongCuaToi(nc));
  dat("LU-42: sau khóa nhân viên thấy phiếu của mình", cuaToi.length === 1 && cuaToi[0].id === dA3.id);
  const pA = await voi(T, nvA, (nc) => chiTietPhieuLuong(nc, dA3.id));
  dat("…xem chi tiết không cần 2 lớp", pA.ketQua.thucLinh === Number(dA3.netPay));
  const html = renderToStaticMarkup(createElement(PhieuLuongIn, { p: { congTy: { ten: "Công ty thử", diaChi: null, maSoThue: null }, ky: pA.ky.nhan, banNhap: false, nguoi: pA.nguoi, dauVao: pA.dauVao, ketQua: pA.ketQua, hoaHong: pA.hoaHong, ngayIn: "Ngày 03 tháng 04 năm 2026" } }));
  dat("LU-43: bản in phiếu lương A4 tiếng Việt có thực lĩnh, hoa hồng, không chữ BẢN NHÁP", html.includes("PHIẾU LƯƠNG") && html.includes(Number(dA3.netPay).toLocaleString("vi-VN")) && html.includes("Hoa hồng") && !html.includes("BẢN NHÁP"));
  const dB3 = await dong(k3.id, nvB);
  await nemLoi("IDOR: nhân viên A không xem được phiếu của B", "quyen", () => voi(T, nvA, (nc) => chiTietPhieuLuong(nc, dB3.id)));
  await nemLoi("IDOR: thực tập sinh không xem được phiếu của A", "quyen", () => voi(T, tt, (nc) => chiTietPhieuLuong(nc, dA3.id)));
  const dT3 = await dong(k3.id, tt);
  const cuaTt = await voi(T, tt, (nc) => phieuLuongCuaToi(nc));
  dat("Thực tập sinh chỉ thấy phiếu của mình", cuaTt.length === 1 && cuaTt[0].id === dT3.id);
  const xem0 = await chu.auditLog.count({ where: { tenantId: T, action: "xem-luong", actorId: kt } });
  await voi(T, kt, (nc) => chiTietPhieuLuong(nc, dB3.id));
  await voi(T, kt, (nc) => chiTietKyLuong(nc, k3.id));
  const nk = await chu.auditLog.findMany({ where: { tenantId: T, action: "xem-luong", actorId: kt }, orderBy: { createdAt: "desc" }, take: 2 });
  dat("LU-62: mỗi lần xem phiếu / bảng lương người khác ghi nhật ký (ai, lúc nào, xem gì)", (await chu.auditLog.count({ where: { tenantId: T, action: "xem-luong", actorId: kt } })) === xem0 + 2 && nk.some((n) => (n.after as { xem?: string }).xem === "phieu-luong" && JSON.stringify(n.after).includes(nvB)));
  dat("…nhật ký xem không chứa số tiền", !nk.some((n) => JSON.stringify(n.after).includes(String(dB3.netPay))));
  const xemCuaMinh = await chu.auditLog.count({ where: { tenantId: T, action: "xem-luong", actorId: nvA } });
  dat("Xem phiếu CỦA MÌNH không ghi nhật ký xem người khác", xemCuaMinh === 0);

  // ==================================================================
  console.log("\n— J. Xuất file, chống chèn công thức, email phiếu lương, đã chi —");
  await nemLoi("Xuất cần 2 lớp", "nghiep-vu", () => voi(T, kt2, (nc) => xuatNganHang(nc, k3.id)), "luong-can-2-lop");
  await voi(T, kt, (nc) => luuMauNganHang(nc, { cot: ["stt", "so-tai-khoan", "chu-tai-khoan", "so-tien", "noi-dung"], noiDung: "Luong {thang}/{nam} {ho_ten}", boDau: true }));
  const nh = await docTep(await voi(T, kt, (nc) => xuatNganHang(nc, k3.id, "csv")));
  dat("File ngân hàng: số tài khoản giữ số 0 đầu, nội dung bỏ dấu", nh.includes("0011001234567") && nh.includes("Luong 03/2026 Nhan vien A"));
  dat("Chống chèn công thức: ô bắt đầu bằng = được thêm dấu '", nh.includes("'=CMD") && !/,=CMD/.test(nh));
  const bl = await docTep(await voi(T, kt, (nc) => xuatBangLuong(nc, k3.id, "csv")));
  dat("Bảng lương CSV: tên bắt đầu bằng + được vô hiệu", bl.includes("'+Thực tập T") && !bl.includes(",+Thực tập T"));
  const blx = await docTep(await voi(T, kt, (nc) => xuatBangLuong(nc, k3.id, "xls")));
  dat("Bảng lương Excel (SpreadsheetML): ô chữ vô hiệu công thức, có dòng tổng", blx.includes("'+Thực tập T") && blx.includes("TỔNG CỘNG") && blx.includes("<Workbook"));
  const btCsv = await docTep(await voi(T, kt, (nc) => xuatButToan(nc, k3.id)));
  const tongGross = (await chu.payrollLine.findMany({ where: { runId: k3.id } })).reduce((a, d) => a + Number(d.grossIncome), 0);
  dat("Bút toán: Nợ 6421 / Có 334 = tổng thu nhập", btCsv.includes(`,6421,334,${tongGross}`), btCsv.split("\r\n").slice(0, 3).join(" | "));
  const em = await voi(T, kt, (nc) => guiEmailPhieuLuong(nc, k3.id));
  dat("LU-44: phiếu lương xếp hàng chờ thư giao dịch (không gửi đồng bộ)", em.xepHang === 4 && (await chu.emailTransactional.count({ where: { tenantId: T, kind: "phieu-luong", status: "QUEUED" } })) === 4);
  dat("…gửi lại không nhân đôi", (await voi(T, kt, (nc) => guiEmailPhieuLuong(nc, k3.id))).xepHang === 0);
  dat("…hàng chờ không giữ số tiền", (await chu.emailTransactional.findMany({ where: { tenantId: T, kind: "phieu-luong" } })).every((e) => !JSON.stringify(e.payload).includes(String(dA3.netPay))));
  await voi(T, kt, (nc) => daChiKyLuong(nc, k3.id));
  dat("Đã khóa → đã chi (ngoại lệ duy nhất của trigger)", (await chu.payrollRun.findUniqueOrThrow({ where: { id: k3.id } })).status === "da-chi");
  await csdlChan("Đã chi: không sửa gì nữa", () => chu.payrollRun.update({ where: { id: k3.id }, data: { returnReason: "sửa lén" } }));

  // ==================================================================
  console.log("\n— K. Kỳ sau: truy thu hoa hồng, phiếu thu ghi muộn, dòng điều chỉnh —");
  await chu.payment.update({ where: { id: p1.id }, data: { status: "huy", cancelledAt: MOC, cancelReason: "Khách đòi lại tiền" } });
  // Phiếu thu ngày 25/03 nhưng GHI VÀO HỆ THỐNG sau khi kỳ 3 đã tính (mốc lấy từ dữ liệu, không dùng giờ thật).
  const tinh3 = (await chu.payrollRun.findUniqueOrThrow({ where: { id: k3.id } })).calculatedAt!;
  const p4 = await thu("2026-03-25", 5_000_000, new Date(tinh3.getTime() + 60_000));
  const k4 = await voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 4 }));
  const bc4 = await bangCong(2026, 4, [{ userId: nvA }, { userId: nvB }, { userId: tt }, { userId: ad }]);
  await chu.timesheet.update({ where: { id: bc4.id }, data: { status: "da-khoa", lockedAt: MOC, lockedBy: hr } });
  await nemLoi("Điều chỉnh chỉ cho kỳ ĐÃ KHÓA", "nghiep-vu", () => voi(T, kt, (nc) => themKhoanLuong(nc, k4.id, LuocDoKhoan.parse({ nguoiId: nvB, chieu: "cong", loai: "dieu-chinh", soTien: 500_000, cachTinh: "truoc-thue", lyDo: "Điều chỉnh kỳ chưa khóa", kyGocId: k4.id }))), "ky-goc-chua-khoa");
  await voi(T, kt, (nc) => themKhoanLuong(nc, k4.id, LuocDoKhoan.parse({ nguoiId: nvB, chieu: "cong", loai: "dieu-chinh", soTien: 500_000, chiuThue: true, cachTinh: "truoc-thue", lyDo: "Bổ sung phụ cấp trực tháng 3 bị sót", kyGocId: k3.id })));
  await voi(T, kt, (nc) => tinhKyLuong(nc, k4.id));
  const hh4 = await chu.payrollCommissionItem.findMany({ where: { runId: k4.id }, orderBy: { paymentNo: "asc" } });
  const tru = hh4.find((h) => h.kind === "truy-thu");
  dat("LU-24: phiếu thu bị hủy sau khóa → dòng truy thu ở kỳ sau đúng số đã trả", tru?.paymentId === p1.id && tru.commission === -1_000_000n && tru.sourceRunId === k3.id);
  dat("Phiếu thu tháng 4 vào hoa hồng tháng 4", hh4.some((h) => h.kind === "thu" && h.paymentId === p3.id));
  dat("QĐ-146: phiếu thu tháng 3 ghi SAU khi kỳ 3 đã tính → tính ở kỳ 4", hh4.some((h) => h.kind === "thu" && h.paymentId === p4.id));
  const kA4 = (await dong(k4.id, nvA)).result as unknown as KetQuaLuong;
  dat("…hoa hồng kỳ 4 = 2% × (7tr + 5tr) − 1tr truy thu", kA4.hoaHong.tien === 240_000 && kA4.hoaHong.truyThu === -1_000_000);
  dat("LU-31: dòng điều chỉnh kỳ trước vào lương kỳ sau", ((await dong(k4.id, nvB)).result as unknown as KetQuaLuong).dieuChinhTruocThue === 500_000);
  await voi(T, kt, (nc) => guiDuyetKyLuong(nc, k4.id));
  await voi(T, gd, (nc) => duyetKyLuong(nc, k4.id));
  const dc = await chu.payrollItem.findFirstOrThrow({ where: { runId: k4.id, category: "dieu-chinh" } });
  dat("Dòng điều chỉnh có lý do và người duyệt", dc.approvedBy === gd && dc.reason.length >= 10 && dc.adjustsRunId === k3.id);
  await voi(T, gd, (nc) => khoaKyLuong(nc, k4.id));

  // ==================================================================
  console.log("\n— L. RLS giữa doanh nghiệp —");
  const t2 = await seedNenMong(chu, `thu-lu2-${DAU}`, "Doanh nghiệp thử lương 2");
  const gdKhac = await nguoi("Giám đốc DN2", "ceo", { t: t2.id });
  await nemLoi("RLS: Giám đốc doanh nghiệp khác không đọc được kỳ lương", "khong-thay", () => voi(t2.id, gdKhac, (nc) => chiTietKyLuong(nc, k3.id)));
  await nemLoi("RLS: …không đọc được phiếu lương", "khong-thay", () => voi(t2.id, gdKhac, (nc) => chiTietPhieuLuong(nc, dA3.id)));
  const dem = await voiTenant(t2.id, (tx) => tx.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM payroll_lines`);
  dat("RLS: SQL thẳng qua cowork_app chỉ thấy dòng của doanh nghiệp mình (0)", Number(dem[0].n) === 0);
  dat("Doanh nghiệp mới có kỳ lương trống", (await voi(t2.id, gdKhac, (nc) => danhSachKyLuong(nc))).length === 0);

  // ==================================================================
  console.log("\n— M. Migration cấp cho mọi doanh nghiệp khớp seed, chạy lại an toàn —");
  const sql = readFileSync("prisma/migrations/20261104090002_luong_cap_quyen_moi_doanh_nghiep/migration.sql", "utf8");
  const quyenTruoc = await chu.rolePermission.count({ where: { tenantId: T, permission: { module: "luong" } } });
  const tsTruoc = await chu.payrollParamSet.count({ where: { tenantId: T } });
  await chu.$executeRawUnsafe(sql);
  await chu.$executeRawUnsafe(sql);
  dat("Chạy lại migration không cấp thêm quyền ngoài seed", (await chu.rolePermission.count({ where: { tenantId: T, permission: { module: "luong" } } })) === quyenTruoc);
  dat("…không nạp trùng tham số", (await chu.payrollParamSet.count({ where: { tenantId: T } })) === tsTruoc);
  const t3 = await chu.tenant.create({ data: { code: `thu-lu3-${DAU}`, name: "DN chỉ có migration", status: "hoat-dong" } });
  await chu.role.create({ data: { tenantId: t3.id, code: "ceo", name: "Giám đốc", isBuiltIn: true } });
  await chu.$executeRawUnsafe(sql);
  const sap = (ds: { kind: string; effectiveFrom: Date; values: unknown }[]) => ds.map((d) => `${d.kind}|${d.effectiveFrom.toISOString().slice(0, 10)}|${JSON.stringify(d.values)}`).sort();
  const thamSoSeed = sap(await chu.payrollParamSet.findMany({ where: { tenantId: t2.id } }));
  const thamSoMig = sap(await chu.payrollParamSet.findMany({ where: { tenantId: t3.id } }));
  dat("Tham số nạp bằng migration giống hệt seed", JSON.stringify(thamSoSeed) === JSON.stringify(thamSoMig), `${thamSoSeed.length} / ${thamSoMig.length}`);
  dat("Giám đốc doanh nghiệp chỉ có migration nhận đủ luong.*", (await chu.rolePermission.count({ where: { tenantId: t3.id, permission: { module: "luong" } } })) === 6);
  const phuCapMig = (await chu.salaryAllowanceType.findMany({ where: { tenantId: t3.id }, orderBy: { code: "asc" } })).map((x) => `${x.code}|${x.taxable}|${x.basis}`);
  const phuCapSeed = (await chu.salaryAllowanceType.findMany({ where: { tenantId: t2.id }, orderBy: { code: "asc" } })).map((x) => `${x.code}|${x.taxable}|${x.basis}`);
  dat("Danh mục phụ cấp migration = seed", JSON.stringify(phuCapMig) === JSON.stringify(phuCapSeed));
  const pvSeed = await chu.rolePermission.findMany({ where: { tenantId: T, permission: { module: "luong" } }, select: { dataScope: true, permission: { select: { code: true } }, role: { select: { code: true } } } });
  dat("Seed: Kế toán xem / tính / xuất toàn công ty, không duyệt", ["luong.view", "luong.create", "luong.export"].every((m) => pvSeed.some((p) => p.role.code === "finance" && p.permission.code === m && p.dataScope === "all")) && !pvSeed.some((p) => p.role.code === "finance" && p.permission.code === "luong.approve"));
  dat("Seed: Nhân sự hồ sơ lương, KHÔNG duyệt", pvSeed.some((p) => p.role.code === "nhan-su-hr" && p.permission.code === "luong.update") && !pvSeed.some((p) => p.role.code === "nhan-su-hr" && p.permission.code === "luong.approve"));
  dat("Seed: nhân viên / thực tập sinh chỉ xem phiếu của mình", pvSeed.filter((p) => ["sales", "technical", "sinh-vien-thuc-tap", "marketing", "warehouse"].includes(p.role.code)).every((p) => p.permission.code === "luong.view" && p.dataScope === "own"));

  await chu.$disconnect();
  ketLuan("Tính lương (0.21.0)");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
