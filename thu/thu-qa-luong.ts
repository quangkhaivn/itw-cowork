import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { kiemTraGioiHanAI, VAI_TRO, phamViCuaQuyen } from "../src/lib/vai-tro";
import { congCuChoNguoi, SO_CONG_CU } from "../src/modules/tro-ly/cong-cu";
import { cacNgayTrongThang, thuTrongTuan } from "../src/modules/cham-cong/tinh-toan";
import { danhSachNguoiDung } from "../src/modules/nguoi-dung/service";
import { LuocDoLocNguoiDung } from "../src/modules/nguoi-dung/luoc-do";
import { docCsv } from "../src/lib/csv";
import { chiTietHoSoNhanSu, danhSachHoSoNhanSu } from "../src/modules/nhan-su/service";
import { danhSachHoSo, danhSachLoaiPhuCap, lichSuHoSo, taoHoSoLuong, themNguoiPhuThuoc } from "../src/modules/luong/ho-so";
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
} from "../src/modules/luong/service";
import { danhSachThamSo, luuMauNganHang, taoThamSo, xacNhanThamSo, xemMauNganHang } from "../src/modules/luong/tham-so";
import { guiEmailPhieuLuong, taoBangTinhXml, xuatBangLuong, xuatButToan, xuatNganHang } from "../src/modules/luong/xuat";
import type { DauVaoLuong, KetQuaLuong } from "../src/modules/luong/tinh-toan";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * QA độc lập 0.21.0 — Nhân sự giai đoạn 3: tính lương. Mỗi phần tái hiện một lỗi QA tìm thấy (đã sửa) hoặc khẳng
 * định một chốt chặn đã kiểm theo hướng đối kháng mà không thấy lỗi. Không dùng giờ thật cho dữ liệu nghiệp vụ.
 * Chạy: npm run thu:qa-luong (CSDL phát triển).
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Math.floor(performance.timeOrigin).toString(36);
const MOC = new Date("2026-04-03T03:00:00Z");
const NGAY = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-qa-luong"));
  });
}

/** Bị từ chối theo bất kỳ cách nào an toàn: thiếu quyền, không thấy, hoặc lỗi nghiệp vụ có mã `ma` (nếu chỉ định). */
async function biChan(ten: string, khoi: () => Promise<unknown>, ma?: string) {
  try {
    await khoi();
    dat(ten, false, "không bị chặn");
  } catch (e) {
    const ok = ma ? e instanceof LoiNghiepVu && e.ma === ma : e instanceof LoiThieuQuyen || e instanceof LoiKhongTimThay || (e instanceof LoiNghiepVu && e.status >= 400 && e.status < 500);
    dat(ten, ok, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}
async function csdlChan(ten: string, khoi: () => Promise<unknown>) {
  try {
    const kq = await khoi();
    dat(ten, false, `CSDL không chặn (${String(kq)})`);
  } catch {
    dat(ten, true);
  }
}
const docTep = async (r: unknown) => (r as Response).text();

async function main() {
  console.log("=== QA 0.21.0 — tính lương ===\n");
  const tenant = await seedNenMong(chu, `qa-lu-${DAU}`, "Doanh nghiệp QA lương");
  const T = tenant.id;
  const vaiTro = async (code: string, t = T) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: t, code } } })).id;
  async function nguoi(ten: string, vai: string, o: { hai?: boolean; t?: string; ma?: string; vao?: string } = {}) {
    const t = o.t ?? T;
    const u = await chu.user.create({
      data: {
        tenantId: t, email: `qa${Math.random().toString(36).slice(2, 8)}.${DAU}@thu.test`, passwordHash: "x", fullName: ten,
        ...(o.hai !== false ? { totpEnabledAt: MOC, totpSecretEnc: "v1:thu" } : {}),
        userRoles: { create: { tenantId: t, roleId: await vaiTro(vai, t) } },
        staffProfile: { create: { tenantId: t, employeeCode: o.ma ?? null, hiredAt: NGAY(o.vao ?? "2025-01-01") } },
      },
    });
    return u.id;
  }
  const gd = await nguoi("Giám đốc QA", "ceo");
  const gd2 = await nguoi("Phó giám đốc QA", "ceo");
  const kt = await nguoi("Kế toán QA", "finance");
  const kt2 = await nguoi("Kế toán chưa 2 lớp", "finance", { hai: false });
  const hr = await nguoi("Nhân sự QA", "nhan-su-hr");
  const hr2 = await nguoi("Nhân sự chưa 2 lớp", "nhan-su-hr", { hai: false });
  const nvA = await nguoi("Nhân viên A", "sales", { ma: "QA01", hai: false });
  const nvB = await nguoi("\t=1+1 Tab", "technical", { ma: "QA02", hai: false });
  const nvC = await nguoi('C</Data></Cell><Cell><Data ss:Type="Number">9', "warehouse", { ma: "@SUM(A1)", hai: false });
  const nvD = await nguoi("\r-3+3 Đặng Thị Đ", "customer-service", { ma: "QA04", hai: false });
  const moi = await nguoi("Người mới giữa tháng", "sales", { ma: "QA05", hai: false, vao: "2026-03-16" });
  const tt = await nguoi("Thực tập QA", "sinh-vien-thuc-tap", { ma: "TT01", hai: false });
  const tpkd = await nguoi("Trưởng phòng KD", "sales-manager", { hai: true });
  const ai = await nguoi("Trợ lý QA", "ai-assistant");

  // Lịch T2–T6 cả ca, T7 sáng, CN nghỉ: tháng 3/2026 công chuẩn 22 + 4 × 0,5 = 24.
  const ca = await chu.workShift.create({ data: { tenantId: T, code: "hc", name: "Hành chính", startMinute: 480, endMinute: 1020, breakStartMinute: 720, breakMinutes: 60 } });
  const lich = await chu.workSchedule.create({ data: { tenantId: T, code: "hc", name: "Hành chính", shiftId: ca.id, days: ["ca", "ca", "ca", "ca", "ca", "sang", "nghi"] } });
  for (const u of [nvA, nvB, nvC, nvD, tt]) await chu.scheduleAssignment.create({ data: { tenantId: T, userId: u, scheduleId: lich.id, effectiveFrom: NGAY("2026-01-01") } });
  // Người vào làm 16/03: Nhân sự gán lịch TỪ NGÀY VÀO (cách làm tự nhiên).
  await chu.scheduleAssignment.create({ data: { tenantId: T, userId: moi, scheduleId: lich.id, effectiveFrom: NGAY("2026-03-16") } });

  // Tham số: xác nhận mọi bộ nạp sẵn (mốc cố định), hoa hồng 2%.
  await chu.payrollParamSet.updateMany({ where: { tenantId: T, confirmedAt: null }, data: { confirmedBy: kt, confirmedAt: MOC } });
  await voi(T, kt, (nc) => taoThamSo(nc, LuocDoThamSo.parse({ loai: "hoa-hong", hieuLucTu: "2026-01-01", giaTri: { kieu: "phang", tyLe: 2, bac: [] }, ghiChu: "Hoa hồng 2% (QA)" })));

  const hs = (o: Record<string, unknown>) => LuocDoHoSoLuong.parse({ hieuLucTu: "2026-01-01", loaiHopDong: "chinh-thuc", cachTra: "thang", phuongPhapThue: "luy-tien", ...o });
  const loaiPc = await chu.salaryAllowanceType.findMany({ where: { tenantId: T } });
  const xang = loaiPc.find((l) => l.code === "xang-xe")!;
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvA, luongCoBan: 17_345_678, luongDongBH: 17_345_678, huongHoaHong: true, soTaiKhoan: "0011001234567", nganHang: "Vietcombank", chuTaiKhoan: "Nguyễn Văn A" })));
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvB, luongCoBan: 23_456_789, luongDongBH: 23_456_789, soTaiKhoan: "0099", nganHang: "ACB", chuTaiKhoan: "+cmd|' /C calc'!A0" })));
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvC, luongCoBan: 11_111_111, luongDongBH: 11_111_111, phuCap: [{ loaiId: xang.id, soTien: 777_777 }], soTaiKhoan: "0088", nganHang: "MB" })));
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvD, luongCoBan: 9_876_543, luongDongBH: 9_876_543, soTaiKhoan: "0077", nganHang: "BIDV" })));
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: moi, hieuLucTu: "2026-03-16", luongCoBan: 12_000_000, luongDongBH: 12_000_000, soTaiKhoan: "0066", nganHang: "TCB" })));
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: tt, loaiHopDong: "thuc-tap", luongCoBan: 3_333_333, phuongPhapThue: "khau-tru-10", soTaiKhoan: "0055", nganHang: "MB" })));
  await voi(T, hr, (nc) => themNguoiPhuThuoc(nc, { nguoiId: nvB, hoTen: "Con của B", quanHe: "Con", soGiayTo: "001200000001", tuThang: "2026-01", denThang: null }));

  // Bảng công tháng 3/2026 đã khóa: ai có lịch thì đủ công các ngày có lịch.
  const bc = await chu.timesheet.create({ data: { tenantId: T, year: 2026, month: 3, generatedAt: MOC, generatedBy: hr, feedbackDeadline: MOC } });
  for (const [u, tu] of [[nvA, "2026-03-01"], [nvB, "2026-03-01"], [nvC, "2026-03-01"], [nvD, "2026-03-01"], [tt, "2026-03-01"], [moi, "2026-03-16"]] as const) {
    for (const ngay of cacNgayTrongThang(2026, 3)) {
      if (ngay < tu) continue;
      const thu = thuTrongTuan(ngay);
      if (thu === 6) continue;
      const v = thu === 5 ? 0.5 : 1;
      await chu.timesheetRow.create({ data: { tenantId: T, timesheetId: bc.id, userId: u, workDate: NGAY(ngay), isAdjustment: false, dayType: "thuong", expectedValue: v, workValue: v, flags: [] } });
    }
  }
  await chu.timesheet.update({ where: { id: bc.id }, data: { status: "da-khoa", lockedAt: MOC, lockedBy: hr } });

  // Hoa hồng: phiếu thu 30.000.000 cho đơn của A (hóa đơn có giá vốn không liên quan).
  const kh = await chu.customer.create({ data: { tenantId: T, code: `KQ${DAU}`.slice(0, 30), name: "Khách QA lương", nameNormalized: "khach qa luong", ownerId: nvA } });
  const hd = await chu.invoice.create({ data: { tenantId: T, number: `HQ-${DAU}`, customerId: kh.id, ownerId: nvA, status: "ISSUED", issueDate: NGAY("2026-03-01"), dueDate: NGAY("2026-04-30"), issuedAt: MOC, issuedBy: kt, subtotal: 300_000_000, total: 300_000_000 } });
  await chu.payment.create({ data: { tenantId: T, number: `PQ-${DAU}-1`, customerId: kh.id, method: "chuyen-khoan", amount: 30_000_000, receivedAt: NGAY("2026-03-31"), createdAt: new Date("2026-03-31T09:00:00Z"), allocations: { create: { tenantId: T, invoiceId: hd.id, amount: 30_000_000 } } } });

  // ==================================================================
  console.log("— A. LỖI 1 (đã sửa): người vào làm giữa tháng được trả đủ lương tháng —");
  const k3 = await voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 3 }));
  await voi(T, kt, (nc) => tinhKyLuong(nc, k3.id));
  const dong = async (kyId: string, u: string) => chu.payrollLine.findFirstOrThrow({ where: { runId: kyId, userId: u } });
  const dMoi = await dong(k3.id, moi);
  const vMoi = dMoi.inputs as unknown as DauVaoLuong;
  const rMoi = dMoi.result as unknown as KetQuaLuong;
  dat("Công chuẩn của người mới = công chuẩn CẢ THÁNG (24), không phải số ngày từ lúc gán lịch (13)", vMoi.cong.chuan === 24, `chuẩn ${vMoi.cong.chuan}`);
  dat("Lương theo công = 12.000.000 × 13 / 24 = 6.500.000 (trước khi sửa: đủ 12.000.000)", rMoi.luongTheoCong === 6_500_000, String(rMoi.luongTheoCong));
  const rA = (await dong(k3.id, nvA)).result as unknown as KetQuaLuong;
  dat("Người đủ công cả tháng vẫn đủ lương (không ảnh hưởng)", rA.luongTheoCong === 17_345_678);
  dat("Hoa hồng tiền đã thu ngày cuối tháng (31/03) được tính: 30tr × 2%", rA.hoaHong.tien === 600_000);

  // ==================================================================
  console.log("\n— B. Kiểm tay một dòng: bảo hiểm, giảm trừ, thuế, thực lĩnh —");
  const rB = (await dong(k3.id, nvB)).result as unknown as KetQuaLuong;
  // B: 23.456.789; BH NLĐ 8 + 1,5 + 1 % (dưới trần) = 1.876.543,12 + 351.851,835 + 234.567,89 → 1.876.543 + 351.852 + 234.568
  const bhB = 1_876_543 + 351_852 + 234_568;
  dat("BH NLĐ làm tròn TỪNG khoản một lần", rB.baoHiem.nld.tong === bhB, String(rB.baoHiem.nld.tong));
  // TNTT = 23.456.789 − 2.462.963 − 15.500.000 − 6.200.000 = −706.174 → 0
  dat("Giảm trừ 15,5tr + 1 người phụ thuộc 6,2tr → thu nhập tính thuế 0, thuế 0", rB.thuNhapTinhThue === 0 && rB.thue.tien === 0);
  dat("Thực lĩnh = tổng thu nhập − BH NLĐ", rB.thucLinh === 23_456_789 - bhB);
  const rT = (await dong(k3.id, tt)).result as unknown as KetQuaLuong;
  dat("Thực tập 10% trên 3.333.333 = 333.333", rT.thue.tien === 333_333);
  const rC = (await dong(k3.id, nvC)).result as unknown as KetQuaLuong;
  dat("Phụ cấp xăng xe (chịu thuế) cố định tháng vào thu nhập chịu thuế", rC.thuNhapChiuThue === 11_111_111 + 777_777);

  // ==================================================================
  console.log("\n— C. Lộ dữ liệu lương: IDOR qua mọi API, nhân viên / thực tập sinh / trưởng phòng —");
  let lA = await dong(k3.id, nvA);
  let lB = await dong(k3.id, nvB);
  for (const [ten, u] of [["Nhân viên", nvA], ["Thực tập sinh", tt], ["Trưởng phòng (phạm vi team, lương own)", tpkd]] as const) {
    await biChan(`${ten}: danh sách kỳ`, () => voi(T, u, (nc) => danhSachKyLuong(nc)));
    await biChan(`${ten}: chi tiết kỳ`, () => voi(T, u, (nc) => chiTietKyLuong(nc, k3.id)));
    await biChan(`${ten}: phiếu người khác`, () => voi(T, u, (nc) => chiTietPhieuLuong(nc, lB.id)));
    await biChan(`${ten}: kiểm lại phiếu người khác`, () => voi(T, u, (nc) => kiemLaiPhieuLuong(nc, lB.id)));
    await biChan(`${ten}: danh sách hồ sơ lương`, () => voi(T, u, (nc) => danhSachHoSo(nc, "2026-03-31")));
    await biChan(`${ten}: lịch sử hồ sơ người khác`, () => voi(T, u, (nc) => lichSuHoSo(nc, nvB)));
    await biChan(`${ten}: danh mục phụ cấp`, () => voi(T, u, (nc) => danhSachLoaiPhuCap(nc)));
    await biChan(`${ten}: tham số`, () => voi(T, u, (nc) => danhSachThamSo(nc, "2026-03-31")));
    await biChan(`${ten}: xuất bảng lương`, () => voi(T, u, (nc) => xuatBangLuong(nc, k3.id, "csv")));
    await biChan(`${ten}: xuất ngân hàng`, () => voi(T, u, (nc) => xuatNganHang(nc, k3.id, "csv")));
    await biChan(`${ten}: bút toán`, () => voi(T, u, (nc) => xuatButToan(nc, k3.id)));
    await biChan(`${ten}: gửi email phiếu`, () => voi(T, u, (nc) => guiEmailPhieuLuong(nc, k3.id)));
    await biChan(`${ten}: mẫu ngân hàng`, () => voi(T, u, (nc) => xemMauNganHang(nc)));
  }
  await biChan("LU-42: nhân viên xem phiếu CỦA MÌNH khi kỳ còn nháp → không thấy", () => voi(T, nvA, (nc) => chiTietPhieuLuong(nc, lA.id)));
  dat("…danh sách phiếu của tôi rỗng khi kỳ chưa khóa", (await voi(T, nvA, (nc) => phieuLuongCuaToi(nc))).length === 0);
  await biChan("Trợ lý AI: danh sách kỳ", () => voi(T, ai, (nc) => danhSachKyLuong(nc)));
  await biChan("Trợ lý AI: phiếu lương", () => voi(T, ai, (nc) => chiTietPhieuLuong(nc, lA.id)));
  await biChan("Trợ lý AI: hồ sơ lương", () => voi(T, ai, (nc) => lichSuHoSo(nc, nvA)));
  dat("LU-60: định nghĩa + CSDL: vai trò AI không có luong.*", kiemTraGioiHanAI().dat && (await chu.rolePermission.count({ where: { roleId: await vaiTro("ai-assistant"), permission: { module: "luong" } } })) === 0);
  const hoSoGd = (await voiTenant(T, (tx) => layHoSoQuyen(tx, gd)))!;
  const tenCc = congCuChoNguoi(hoSoGd).map((c) => `${c.ten} ${c.moTa} ${c.quyen}`).join(" ").toLowerCase();
  dat("Sổ công cụ trợ lý (kể cả cho Giám đốc toàn quyền) không có công cụ chạm tới lương", !/luong|lương|payroll|salary/.test(tenCc) && SO_CONG_CU.every((c) => !c.quyen.startsWith("luong.")));

  // Trường lương không lọt vào API người dùng / hồ sơ nhân sự.
  const soLuong = ["17345678", "23456789", "11111111", "9876543", "12000000", "3333333", "0011001234567", "001200000001"];
  const dsNd = JSON.stringify(await voi(T, gd, (nc) => danhSachNguoiDung(nc, LuocDoLocNguoiDung.parse({ coTrang: 100 }))));
  const dsNs = JSON.stringify(await voi(T, hr, (nc) => danhSachHoSoNhanSu(nc)));
  const ctNs = JSON.stringify(await voi(T, hr, (nc) => chiTietHoSoNhanSu(nc, nvB)));
  dat("Danh sách người dùng / hồ sơ nhân sự không chứa số lương, số tài khoản, giấy tờ người phụ thuộc", soLuong.every((s) => !dsNd.includes(s) && !dsNs.includes(s) && !ctNs.includes(s)));

  // ==================================================================
  console.log("\n— D. 2 lớp bắt buộc: người có quyền rộng nhưng chưa bật 2 lớp —");
  for (const [ten, f] of [
    ["danh sách kỳ", (nc: NguCanh) => danhSachKyLuong(nc)],
    ["chi tiết kỳ", (nc: NguCanh) => chiTietKyLuong(nc, k3.id)],
    ["phiếu người khác", (nc: NguCanh) => chiTietPhieuLuong(nc, lB.id)],
    ["kiểm lại", (nc: NguCanh) => kiemLaiPhieuLuong(nc, lB.id)],
    ["danh sách hồ sơ", (nc: NguCanh) => danhSachHoSo(nc, "2026-03-31")],
    ["lịch sử hồ sơ", (nc: NguCanh) => lichSuHoSo(nc, nvB)],
    ["tham số", (nc: NguCanh) => danhSachThamSo(nc, "2026-03-31")],
    ["xuất bảng lương", (nc: NguCanh) => xuatBangLuong(nc, k3.id, "xls")],
    ["tính lương", (nc: NguCanh) => tinhKyLuong(nc, k3.id)],
    ["thêm khoản", (nc: NguCanh) => themKhoanLuong(nc, k3.id, LuocDoKhoan.parse({ nguoiId: nvA, chieu: "cong", loai: "thuong", soTien: 1, lyDo: "Thưởng thử 2 lớp" }))],
  ] as const) {
    await biChan(`LU-61: Kế toán chưa 2 lớp — ${ten}`, () => voi(T, kt2, f), "luong-can-2-lop");
  }
  await biChan("LU-61: Nhân sự chưa 2 lớp — tạo hồ sơ lương", () => voi(T, hr2, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvA, luongCoBan: 1 }))), "luong-can-2-lop");
  await biChan("LU-61: Nhân sự chưa 2 lớp — danh mục phụ cấp", () => voi(T, hr2, (nc) => danhSachLoaiPhuCap(nc)), "luong-can-2-lop");
  // Tắt 2 lớp sau khi đăng nhập: quyền đọc lại mỗi yêu cầu → bị chặn ngay ở yêu cầu kế tiếp.
  await chu.user.update({ where: { id: hr }, data: { totpEnabledAt: null, totpSecretEnc: null } });
  await biChan("Tắt 2 lớp giữa phiên → yêu cầu kế tiếp bị chặn", () => voi(T, hr, (nc) => lichSuHoSo(nc, nvB)), "luong-can-2-lop");
  await chu.user.update({ where: { id: hr }, data: { totpEnabledAt: MOC, totpSecretEnc: "v1:thu" } });

  // ==================================================================
  console.log("\n— E. Phân tách nhiệm vụ, ảnh chụp đầu vào khi đang chờ duyệt, duyệt / khóa đồng thời —");
  // Giám đốc 2 tự tính lại → không được duyệt / khóa.
  await voi(T, gd2, (nc) => tinhKyLuong(nc, k3.id));
  lA = await dong(k3.id, nvA);
  lB = await dong(k3.id, nvB);
  await voi(T, gd2, (nc) => guiDuyetKyLuong(nc, k3.id));
  await biChan("LU-41: người tính (Giám đốc) không duyệt được", () => voi(T, gd2, (nc) => duyetKyLuong(nc, k3.id)), "nguoi-tinh-khong-duyet");
  await csdlChan("LU-41: CSDL chặn khóa bởi người tính", () => voiTenant(T, (tx) => tx.$executeRaw`UPDATE payroll_runs SET locked_by = calculated_by, locked_at = now() WHERE id = ${k3.id}::uuid`));
  const truoc = await chu.payrollLine.findMany({ where: { runId: k3.id }, orderBy: { userId: "asc" }, select: { id: true, netPay: true, inputs: true } });
  // Đang chờ duyệt: Nhân sự đổi lương A (hiệu lực từ đầu tháng 3), Kế toán nhập biểu thuế mới, thêm người phụ thuộc cho A.
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvA, hieuLucTu: "2026-03-01", luongCoBan: 99_000_000, luongDongBH: 17_345_678, huongHoaHong: true, soTaiKhoan: "0011001234567", nganHang: "Vietcombank" })));
  await voi(T, kt, (nc) => taoThamSo(nc, LuocDoThamSo.parse({ loai: "giam-tru", hieuLucTu: "2026-03-01", giaTri: { banThan: 1, nguoiPhuThuoc: 1 }, ghiChu: "Đổi giữa lúc chờ duyệt (QA)" })));
  await voi(T, hr, (nc) => themNguoiPhuThuoc(nc, { nguoiId: nvA, hoTen: "Mẹ của A", quanHe: "Mẹ", soGiayTo: null, tuThang: "2026-03", denThang: null }));
  const song = await Promise.allSettled([voi(T, gd, (nc) => duyetKyLuong(nc, k3.id)), voi(T, gd, (nc) => duyetKyLuong(nc, k3.id))]);
  dat("Duyệt hai lần cùng lúc: một thành công, một 409", song.filter((s) => s.status === "fulfilled").length === 1 && song.some((s) => s.status === "rejected" && s.reason instanceof LoiNghiepVu && s.reason.status === 409));
  const khoa2 = await Promise.allSettled([voi(T, gd, (nc) => khoaKyLuong(nc, k3.id)), voi(T, gd, (nc) => traLaiKyLuong(nc, k3.id, { lyDo: "Trả lại cùng lúc với khóa" }))]);
  const kyNay = await chu.payrollRun.findUniqueOrThrow({ where: { id: k3.id } });
  dat("Khóa và trả lại cùng lúc: đúng một việc thành công, trạng thái nhất quán", khoa2.filter((s) => s.status === "fulfilled").length === 1 && ["da-khoa", "nhap"].includes(kyNay.status), `${kyNay.status} ${JSON.stringify(khoa2.map((s) => s.status))}`);
  if (kyNay.status === "nhap") {
    // Trả lại thắng: tính lại sẽ dùng tham số mới — đưa tham số về như cũ bằng bộ mới cùng ngày rồi tính lại, duyệt, khóa.
    await voi(T, kt, (nc) => taoThamSo(nc, LuocDoThamSo.parse({ loai: "giam-tru", hieuLucTu: "2026-03-01", giaTri: { banThan: 15_500_000, nguoiPhuThuoc: 6_200_000 }, ghiChu: "Trả về mức đúng (QA)" })));
    await voi(T, gd2, (nc) => tinhKyLuong(nc, k3.id));
    await voi(T, gd2, (nc) => guiDuyetKyLuong(nc, k3.id));
    await voi(T, gd, (nc) => duyetKyLuong(nc, k3.id));
    await voi(T, gd, (nc) => khoaKyLuong(nc, k3.id));
  } else {
    const sau = await chu.payrollLine.findMany({ where: { runId: k3.id }, orderBy: { userId: "asc" }, select: { id: true, netPay: true, inputs: true } });
    dat("Đổi hồ sơ / tham số / người phụ thuộc lúc chờ duyệt: dòng đã khóa giữ nguyên ảnh chụp và số tiền", truoc.length === sau.length && truoc.every((d, i) => d.id === sau[i].id && d.netPay === sau[i].netPay && JSON.stringify(d.inputs) === JSON.stringify(sau[i].inputs)));
    const kl = await voi(T, kt, (nc) => kiemLaiPhieuLuong(nc, lA.id));
    dat("…kiểm lại từ ảnh chụp vẫn khớp", kl.khop);
  }
  dat("Kỳ đã khóa", (await chu.payrollRun.findUniqueOrThrow({ where: { id: k3.id } })).status === "da-khoa");
  lA = await dong(k3.id, nvA);
  lB = await dong(k3.id, nvB);
  const khoa3 = await Promise.allSettled([voi(T, gd, (nc) => khoaKyLuong(nc, k3.id)), voi(T, gd2, (nc) => traLaiKyLuong(nc, k3.id, { lyDo: "Thử lùi trạng thái" }))]);
  dat("Đã khóa → không khóa lại / không trả lại về nháp", khoa3.every((s) => s.status === "rejected"));

  // ==================================================================
  console.log("\n— F. Bất biến sau khóa: SQL thẳng qua vai cowork_app —");
  const k4 = await voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 4 }));
  await csdlChan("Chuyển dòng lương đã khóa sang kỳ nháp", () => voiTenant(T, (tx) => tx.$executeRaw`UPDATE payroll_lines SET run_id = ${k4.id}::uuid WHERE id = ${lA.id}::uuid`));
  await csdlChan("Thêm dòng lương vào kỳ đã khóa", () => voiTenant(T, (tx) => tx.$executeRaw`INSERT INTO payroll_lines (tenant_id, run_id, user_id, full_name, gross_income, taxable_income, employee_insurance, personal_income_tax, other_deductions, net_pay, employer_insurance, inputs, result) VALUES (${T}::uuid, ${k3.id}::uuid, ${gd}::uuid, 'X', 1, 1, 0, 0, 0, 1, 0, '{}', '{}')`));
  await csdlChan("Thêm khoản vào kỳ đã khóa", () => voiTenant(T, (tx) => tx.$executeRaw`INSERT INTO payroll_items (tenant_id, run_id, user_id, direction, category, amount, reason, created_by) VALUES (${T}::uuid, ${k3.id}::uuid, ${nvA}::uuid, 'cong', 'thuong', 1, 'Lén thêm', ${kt}::uuid)`));
  await csdlChan("Đã khóa → nháp", () => voiTenant(T, (tx) => tx.$executeRaw`UPDATE payroll_runs SET status = 'nhap', locked_at = NULL, locked_by = NULL WHERE id = ${k3.id}::uuid`));
  await csdlChan("Đã khóa → đã chi kèm sửa người duyệt", () => voiTenant(T, (tx) => tx.$executeRaw`UPDATE payroll_runs SET status = 'da-chi', paid_at = now(), paid_by = ${kt}::uuid, approved_by = ${gd2}::uuid WHERE id = ${k3.id}::uuid`));
  await csdlChan("Xóa hoa hồng của kỳ đã khóa", () => voiTenant(T, (tx) => tx.$executeRaw`DELETE FROM payroll_commission_items WHERE run_id = ${k3.id}::uuid`));
  await csdlChan("Sửa ảnh chụp dòng lương đã khóa", () => voiTenant(T, (tx) => tx.$executeRaw`UPDATE payroll_lines SET result = '{}' WHERE run_id = ${k3.id}::uuid`));
  await csdlChan("TRUNCATE bảng lương", () => voiTenant(T, (tx) => tx.$executeRawUnsafe(`TRUNCATE payroll_lines`)));

  // ==================================================================
  console.log("\n— G. Phiếu của mình sau khóa; nhật ký xem mọi đường (xuất file, bản in, kiểm lại) —");
  dat("Sau khóa: nhân viên thấy phiếu của mình (không cần 2 lớp)", (await voi(T, nvA, (nc) => chiTietPhieuLuong(nc, lA.id))).nguoi.id === nvA);
  await biChan("…vẫn không thấy phiếu người khác", () => voi(T, nvA, (nc) => chiTietPhieuLuong(nc, lB.id)));
  const demXem = async () => chu.auditLog.findMany({ where: { tenantId: T, action: "xem-luong", actorId: kt }, orderBy: { createdAt: "asc" } });
  const x0 = (await demXem()).length;
  await voi(T, kt, (nc) => xuatBangLuong(nc, k3.id, "csv"));
  await voi(T, kt, (nc) => xuatNganHang(nc, k3.id, "csv"));
  await voi(T, kt, (nc) => chiTietPhieuLuong(nc, lB.id)); // bản in /luong/phieu/[id]/in gọi đúng hàm này
  await voi(T, kt, (nc) => kiemLaiPhieuLuong(nc, lB.id));
  await voi(T, kt, (nc) => lichSuHoSo(nc, nvB));
  const xs = (await demXem()).slice(x0);
  const loaiXem = xs.map((x) => (x.after as { xem: string }).xem).sort();
  dat("LU-62: xuất bảng lương, xuất ngân hàng, bản in phiếu, kiểm lại, hồ sơ — mỗi lần một dòng nhật ký xem", JSON.stringify(loaiXem) === JSON.stringify(["kiem-lai-phieu-luong", "lich-su-ho-so-luong", "phieu-luong", "xuat-bang-luong", "xuat-chi-luong-ngan-hang"]), loaiXem.join(","));
  dat("…nhật ký ghi những ai bị xem", xs.every((x) => ((x.after as { nguoiDuocXem: string[] }).nguoiDuocXem ?? []).length > 0));

  // ==================================================================
  console.log("\n— H. Xuất file: chèn công thức, chèn XML, tổng file ngân hàng —");
  await voi(T, kt, (nc) => luuMauNganHang(nc, { cot: ["stt", "so-tai-khoan", "chu-tai-khoan", "so-tien", "noi-dung", "ma-nhan-vien", "ho-ten"], noiDung: "{ho_ten} luong {thang}/{nam}", boDau: false }));
  const nh = await docTep(await voi(T, kt, (nc) => xuatNganHang(nc, k3.id, "csv")));
  const o = (s: string) => new RegExp(`(^|,|")${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "m");
  dat("CSV: ô bắt đầu bằng tab được vô hiệu", nh.includes("'\t=1+1 Tab") && !o("\t=1+1").test(nh));
  dat("CSV: ô bắt đầu bằng CR được vô hiệu", nh.includes("'\r-3+3") && !o("\r-3").test(nh));
  dat("CSV: ô bắt đầu bằng @ (mã NV) và + (chủ tài khoản) được vô hiệu", nh.includes("'@SUM(A1)") && nh.includes("'+CMD|") && !o("@SUM").test(nh) && !o("+CMD").test(nh));
  dat("Nội dung chuyển khoản giữ dấu khi tắt bỏ dấu", nh.includes("Đặng Thị Đ luong 03/2026"));
  const tongNet = (await chu.payrollLine.findMany({ where: { runId: k3.id } })).reduce((a, d) => a + (d.netPay > 0n ? Number(d.netPay) : 0), 0);
  const bangNh = docCsv(nh, ",");
  const tongFile = bangNh.slice(1).reduce((a, r) => a + Number(r[3]), 0);
  dat("Tổng file ngân hàng (cột Số tiền) = tổng thực lĩnh của kỳ", tongFile === tongNet && bangNh.length - 1 === 6, `${tongFile} / ${tongNet} (${bangNh.length - 1} dòng)`);
  const blx = await docTep(await voi(T, kt, (nc) => xuatBangLuong(nc, k3.id, "xls")));
  dat("SpreadsheetML: tên chứa </Data></Cell> được thoát, không sinh ô mới", blx.includes("C&lt;/Data&gt;&lt;/Cell&gt;") && !blx.includes('C</Data></Cell><Cell><Data ss:Type="Number">9'));
  dat("SpreadsheetML: ô chữ bắt đầu bằng @ / tab vẫn được thêm '", blx.includes("'@SUM(A1)") && blx.includes("'\t=1+1"));
  const bl = await docTep(await voi(T, kt, (nc) => xuatBangLuong(nc, k3.id, "csv")));
  const dongTong = bl.split("\r\n").find((d) => d.includes("TỔNG CỘNG")) ?? "";
  const ky = await voi(T, kt, (nc) => chiTietKyLuong(nc, k3.id));
  dat("Bảng lương CSV: dòng tổng thực lĩnh = tổng các dòng = tổng bảng", dongTong.split(",").includes(String(ky.tong.thucLinh)) && ky.tong.thucLinh === (await chu.payrollLine.findMany({ where: { runId: k3.id } })).reduce((a, d) => a + Number(d.netPay), 0));

  // LỖI 2 (đã sửa): ký tự U+FFFE / U+FFFF (không hợp lệ trong XML 1.0) làm hỏng cả tệp Excel.
  const xmlHong = taoBangTinhXml("Thử", ["Họ tên"], [["Tên\uFFFFlạ\uFFFE"], ["Bình thường"]]);
  dat("LỖI 2: SpreadsheetML bỏ ký tự U+FFFE / U+FFFF (tệp vẫn mở được)", !xmlHong.includes("\uFFFF") && !xmlHong.includes("\uFFFE") && xmlHong.includes("Tênlạ"));
  let xmllint = "";
  try {
    xmllint = execFileSync("sh", ["-c", "command -v xmllint || true"]).toString().trim();
  } catch {
    xmllint = "";
  }
  if (xmllint) {
    const thu = mkdtempSync(path.join(tmpdir(), "qa-luong-"));
    try {
      const tep = path.join(thu, "bang.xml");
      writeFileSync(tep, blx + "\n");
      let hop = true;
      try { execFileSync(xmllint, ["--noout", tep], { stdio: "pipe" }); } catch { hop = false; }
      writeFileSync(tep, xmlHong);
      let hop2 = true;
      try { execFileSync(xmllint, ["--noout", tep], { stdio: "pipe" }); } catch { hop2 = false; }
      dat("xmllint: bảng lương .xls (tên có ký tự đặc biệt) là XML hợp lệ", hop && hop2);
    } finally {
      rmSync(thu, { recursive: true, force: true });
    }
  }

  // ==================================================================
  console.log("\n— I. Nhật ký, sự kiện, thông báo, hàng chờ thư không chứa số tiền lương —");
  await voi(T, kt, (nc) => guiEmailPhieuLuong(nc, k3.id));
  await voi(T, kt, (nc) => daChiKyLuong(nc, k3.id));
  const soTien = new Set<string>();
  for (const d of await chu.payrollLine.findMany({ where: { tenantId: T } })) {
    for (const v of [d.netPay, d.grossIncome, d.personalIncomeTax, d.employeeInsurance, d.employerInsurance]) if (v >= 100_000n) soTien.add(v.toString());
  }
  for (const v of ["17345678", "23456789", "11111111", "9876543", "12000000", "3333333", "99000000", "777777"]) soTien.add(v);
  const nk = JSON.stringify(await chu.auditLog.findMany({ where: { tenantId: T, objectType: { in: ["payroll_run", "payroll_line", "payroll_item", "salary_profile", "salary_dependent", "salary_allowance_type", "setting"] } }, select: { before: true, after: true } }));
  const sk = JSON.stringify(await chu.businessEvent.findMany({ where: { tenantId: T }, select: { payload: true } }));
  const tb = JSON.stringify(await chu.notification.findMany({ where: { tenantId: T }, select: { title: true, body: true } }));
  const em = JSON.stringify(await chu.emailTransactional.findMany({ where: { tenantId: T }, select: { payload: true } }));
  const lo = [...soTien].filter((s) => nk.includes(s) || sk.includes(s) || tb.includes(s) || em.includes(s));
  dat("LU-62 / QĐ-148: không số lương nào trong nhật ký, sự kiện, thông báo, hàng chờ thư", lo.length === 0, lo.join(","));

  // ==================================================================
  console.log("\n— J. RLS trên 8 bảng lương giữa hai doanh nghiệp —");
  const t2 = await seedNenMong(chu, `qa-lu2-${DAU}`, "Doanh nghiệp QA lương 2");
  const gdKhac = await nguoi("Giám đốc DN2", "ceo", { t: t2.id });
  const BANG = ["salary_allowance_types", "salary_profiles", "salary_dependents", "payroll_param_sets", "payroll_runs", "payroll_lines", "payroll_items", "payroll_commission_items"];
  for (const b of BANG) {
    const ngoai = await voiTenant(t2.id, (tx) => tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM ${b} WHERE tenant_id = '${T}'::uuid`));
    const sua = await voiTenant(t2.id, (tx) => tx.$executeRawUnsafe(`UPDATE ${b} SET tenant_id = tenant_id WHERE tenant_id = '${T}'::uuid`)).catch(() => 0);
    dat(`RLS ${b}: doanh nghiệp khác không đọc / không sửa được`, Number(ngoai[0].n) === 0 && sua === 0);
  }
  await csdlChan("RLS: không ghi được dòng mang tenant_id doanh nghiệp khác", () => voiTenant(t2.id, (tx) => tx.$executeRaw`INSERT INTO payroll_runs (tenant_id, year, month, updated_at) VALUES (${T}::uuid, 2031, 1, now())`));
  await biChan("RLS: Giám đốc DN2 không đọc được phiếu / kỳ / hồ sơ DN1", async () => {
    await voi(t2.id, gdKhac, (nc) => chiTietPhieuLuong(nc, lA.id));
  });
  await biChan("RLS: …kỳ lương DN1", () => voi(t2.id, gdKhac, (nc) => chiTietKyLuong(nc, k3.id)));
  await biChan("RLS: …xuất ngân hàng DN1", () => voi(t2.id, gdKhac, (nc) => xuatNganHang(nc, k3.id)));
  await biChan("RLS: …hồ sơ lương DN1", () => voi(t2.id, gdKhac, (nc) => lichSuHoSo(nc, nvA)));
  await biChan("RLS: …thêm khoản vào kỳ DN1", () => voi(t2.id, gdKhac, (nc) => themKhoanLuong(nc, k4.id, LuocDoKhoan.parse({ nguoiId: nvA, chieu: "cong", loai: "thuong", soTien: 1, lyDo: "Chéo doanh nghiệp" }))));
  await biChan("RLS: …xác nhận tham số DN1", async () => {
    const bo = await chu.payrollParamSet.findFirstOrThrow({ where: { tenantId: T } });
    await voi(t2.id, gdKhac, (nc) => xacNhanThamSo(nc, bo.id));
  });

  // ==================================================================
  console.log("\n— K. Quyền luong.* trong CSDL khớp vai-tro.ts —");
  for (const t of [T, t2.id]) {
    const rp = await chu.rolePermission.findMany({ where: { tenantId: t, permission: { module: "luong" }, status: "hoat-dong" }, select: { dataScope: true, permission: { select: { code: true } }, role: { select: { code: true } } } });
    const thuc = rp.map((r) => `${r.role.code}|${r.permission.code}|${r.dataScope}`).sort();
    const mong = VAI_TRO.flatMap((v) => {
      const ma = v.quyen === "*" ? ["luong.view", "luong.create", "luong.update", "luong.delete", "luong.approve", "luong.export"] : v.quyen.filter((q) => q.startsWith("luong."));
      return [...new Set(ma)].map((m) => `${v.code}|${m}|${phamViCuaQuyen(v, m)}`);
    }).sort();
    dat(`Doanh nghiệp ${t === T ? "1" : "2"}: quyền lương trong CSDL = định nghĩa vai trò`, JSON.stringify(thuc) === JSON.stringify(mong), thuc.filter((x) => !mong.includes(x)).concat(mong.filter((x) => !thuc.includes(x)).map((x) => `thiếu ${x}`)).join("; "));
  }

  await chu.$disconnect();
  ketLuan("QA tính lương (0.21.0)");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
