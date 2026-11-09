import { readFileSync } from "node:fs";
import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { seedLichMacDinh, seedNenMong } from "../prisma/seed/index";
import { capNhatCauHinh } from "../src/modules/cau-hinh/service";
import { lichCuaNhieuNguoi } from "../src/modules/cham-cong/chung";
import { datCongTay } from "../src/modules/cham-cong/cong-tay";
import { sinhBangCong } from "../src/modules/cham-cong/bang-cong";
import { bangTrucTiep } from "../src/modules/cham-cong/truc-tiep";
import {
  danhSachMay,
  danhSachMayLa,
  danhSachPinChuaKhop,
  kiemTraKetNoiMay,
  nhanVienChoAnhXa,
  nhapCsvAnhXaPin,
  suaMay,
  taoMay,
  xuLyAdms,
} from "../src/modules/cham-cong/may-cham-cong";
import { LuocDoDatCongTay } from "../src/modules/cham-cong/luoc-do";
import { danhSachHoSoNhanSu, datLichMacDinh, suaHoSoNhanSu } from "../src/modules/nhan-su/service";
import { LuocDoHoSoNhanSu } from "../src/modules/nhan-su/luoc-do";
import { chiTietPhieu, taoKyDanhGia } from "../src/modules/danh-gia/service";
import { chiTietPhieuThucTap, taoPhieuThucTap } from "../src/modules/thuc-tap/service";
import { danhSachHoSo, nhapCsvHoSoLuong, taoHoSoLuong } from "../src/modules/luong/ho-so";
import { LuocDoCongTayLuong, LuocDoHoSoLuong } from "../src/modules/luong/luoc-do";
import {
  chiTietKyLuong,
  daChiKyLuong,
  danhSachKyLuong,
  duyetKyLuong,
  guiDuyetKyLuong,
  khoaKyLuong,
  layLaiCongTuBangCong,
  nhapCongTayLuong,
  taoKyLuong,
  tinhKyLuong,
} from "../src/modules/luong/service";
import { danhSachThamSo, xacNhanThamSo } from "../src/modules/luong/tham-so";
import { xuatButToan, xuatNganHang, xuatTraTay } from "../src/modules/luong/xuat";
import { cacNgayTrongThang, thuTrongTuan } from "../src/modules/cham-cong/tinh-toan";
import type { DauVaoLuong, KetQuaLuong } from "../src/modules/luong/tinh-toan";
import { viecThietLap } from "../src/modules/thiet-lap-ban-dau/service";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng 0.22.0 — "Mở dần — bổ sung sau" (BUSINESS_RULES mục 33, QĐ-170 → QĐ-180) trên CSDL THẬT, qua đúng service
 * mà API / route /iclock gọi. Thiếu dữ liệu → phần mềm vẫn chạy + cảnh báo; chỉ chặn vi phạm toàn vẹn / bảo mật.
 * Không dùng giờ thật cho phần phụ thuộc giờ: mọi mốc nghiệp vụ là hằng số. Chạy: npm run thu:mo-dan.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Math.floor(performance.timeOrigin).toString(36);
const MOC = new Date("2026-05-02T03:00:00Z");
const NGAY = (s: string) => new Date(`${s}T00:00:00.000Z`);
const IP_VP = `198.51.${Number.parseInt(DAU.slice(-2), 36) % 250}.77`;
const IP_KHAC = "203.0.113.200";

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>, ip = IP_VP): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, ip, "thu-mo-dan"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "csdl";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string | string[]): Promise<void> {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu =
      kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "csdl" ? !(e instanceof LoiNghiepVu)
      : e instanceof LoiNghiepVu;
    const dsMa = ma === undefined ? null : Array.isArray(ma) ? ma : [ma];
    const dungMa = !dsMa || (e instanceof LoiNghiepVu && dsMa.includes(e.ma ?? ""));
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}

async function main() {
  console.log("=== Thử 0.22.0 — Mở dần, bổ sung sau ===\n");
  const T = (await seedNenMong(chu, `thu-md-${DAU}`, "Doanh nghiệp thử mở dần")).id;
  const T2 = (await seedNenMong(chu, `thu-md2-${DAU}`, "Doanh nghiệp thử mở dần 2")).id;
  const vaiTro = async (code: string, t = T) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: t, code } } })).id;
  async function nguoi(ten: string, vai: string, o: { hai?: boolean; t?: string; quanLy?: string } = {}) {
    const t = o.t ?? T;
    const u = await chu.user.create({
      data: {
        tenantId: t, email: `${ten}.${DAU}@thu.test`, passwordHash: "x", fullName: ten,
        ...(o.hai ? { totpEnabledAt: MOC, totpSecretEnc: "v1:thu" } : {}),
        userRoles: { create: { tenantId: t, roleId: await vaiTro(vai, t) } },
        staffProfile: { create: { tenantId: t, hiredAt: NGAY("2025-01-01"), managerId: o.quanLy ?? null } },
      },
    });
    return u.id;
  }
  const gd = await nguoi("giam-doc", "ceo", { hai: true });
  const ad = await nguoi("quan-tri", "admin", { hai: true });
  const kt = await nguoi("ke-toan", "finance", { hai: true });
  const kt2 = await nguoi("ke-toan-chua-2-lop", "finance");
  const hr = await nguoi("nhan-su", "nhan-su-hr", { hai: true });
  const nvA = await nguoi("nhan-vien-a", "sales", { quanLy: gd });
  const nvB = await nguoi("nhan-vien-b", "sales", { quanLy: gd });
  const nvC = await nguoi("nhan-vien-c", "sales", { quanLy: gd });
  const nvMoi = await nguoi("nhan-vien-moi", "sales", { quanLy: gd });
  const ktv = await nguoi("ky-thuat-vien", "technical");
  const ktvT2 = await nguoi("ky-thuat-vien-2", "technical", { t: T2 });
  const email = (ten: string) => `${ten}.${DAU}@thu.test`;

  // ==================================================================
  console.log("— B1. Lịch mặc định của doanh nghiệp (QĐ-171) —");
  dat("Seed: doanh nghiệp chưa có lịch → tạo “Hành chính T2–T6 08:00–17:00” làm mặc định", await seedLichMacDinh(chu, T));
  dat("Seed chạy lại: đã có lịch → không tạo thêm", !(await seedLichMacDinh(chu, T)) && (await chu.workSchedule.count({ where: { tenantId: T } })) === 1);
  const lichMd = await chu.workSchedule.findFirstOrThrow({ where: { tenantId: T, isDefault: true }, include: { shift: true } });
  dat("…lịch T2–T6 cả ca, ca 08:00–17:00", JSON.stringify(lichMd.days) === JSON.stringify(["ca", "ca", "ca", "ca", "ca", "nghi", "nghi"]) && lichMd.shift.startMinute === 480 && lichMd.shift.endMinute === 1020);
  const lichA = await voiTenant(T, async (tx) => (await lichCuaNhieuNguoi(tx, [nvA], "2026-05-31")).get(nvA)!);
  dat("Người chưa được gán lịch dùng lịch mặc định (đánh dấu macDinh)", lichA("2026-05-04")?.macDinh === true && lichA("2026-05-04")?.scheduleId === lichMd.id);
  dat("…chỉ từ ngày vào làm", lichA("2024-12-31") === null);
  const tt = await voi(T, hr, (nc) => bangTrucTiep(nc, { phongBanId: null, diaDiemId: null }, new Date("2026-05-04T03:00:00Z")));
  const dongTtA = tt.dong.find((d) => d.id === nvA);
  dat("Bảng trực tiếp ghi rõ “theo lịch mặc định”", dongTtA?.theoLichMacDinh === true && dongTtA.gioVaoCa !== null);
  const caPhu = await chu.workShift.create({ data: { tenantId: T, code: "ca-phu", name: "Ca phụ", startMinute: 540, endMinute: 1080 } });
  const lichPhu = await chu.workSchedule.create({ data: { tenantId: T, code: "lich-phu", name: "Lịch phụ", shiftId: caPhu.id, days: ["ca", "ca", "ca", "ca", "ca", "sang", "nghi"] } });
  await nemLoi("Nhân viên không đặt được lịch mặc định", "quyen", () => voi(T, nvA, (nc) => datLichMacDinh(nc, lichPhu.id)));
  await voi(T, hr, (nc) => datLichMacDinh(nc, lichPhu.id));
  dat("Nhân sự đặt lịch khác làm mặc định → chỉ một lịch mặc định", (await chu.workSchedule.count({ where: { tenantId: T, isDefault: true } })) === 1 && (await chu.workSchedule.findUniqueOrThrow({ where: { id: lichPhu.id } })).isDefault);
  dat("…ghi kiểm toán dat-lich-mac-dinh", (await chu.auditLog.count({ where: { tenantId: T, action: "dat-lich-mac-dinh" } })) === 1);
  await nemLoi("CSDL: hai lịch mặc định cùng doanh nghiệp bị chặn (chỉ mục duy nhất)", "csdl", () => chu.workSchedule.update({ where: { id: lichMd.id }, data: { isDefault: true } }));
  await voi(T, hr, (nc) => datLichMacDinh(nc, lichMd.id));

  // ==================================================================
  console.log("\n— A. Tính lương không đòi đủ dữ liệu (QĐ-170, QĐ-172, QĐ-173) —");
  const hs = (o: Partial<Record<string, unknown>> & { nguoiId: string }) =>
    LuocDoHoSoLuong.parse({ hieuLucTu: "2026-01-01", loaiHopDong: "chinh-thuc", cachTra: "thang", luongCoBan: 10_000_000, luongDongBH: 0, phuongPhapThue: "luy-tien", ...o });
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvA, luongCoBan: 21_000_000, soTaiKhoan: "0011223344", nganHang: "VCB" })));
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvB, luongCoBan: 10_500_000 })));
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvC, luongCoBan: 8_400_000, soTaiKhoan: "5566778899", nganHang: "ACB", hinhThucTra: "tien-mat" })));
  const so5 = cacNgayTrongThang(2026, 5).filter((d) => thuTrongTuan(d) < 5).length;

  const k5 = await voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 5 }));
  const r0 = await voi(T, kt, (nc) => tinhKyLuong(nc, k5.id));
  dat("A1: chưa có bảng công → vẫn tính, 3 dòng, nguồn công mặc định", r0.soDong === 3 && r0.nguonCong["mac-dinh"] === 3, JSON.stringify(r0.nguonCong));
  dat("…cảnh báo vàng cấp kỳ “bảng công chưa sinh”", r0.canhBao.some((c) => c.ma === "bang-cong-chua-khoa" && c.muc === "canh-bao"));
  const dong = (kyId: string, u: string) => chu.payrollLine.findFirstOrThrow({ where: { runId: kyId, userId: u } });
  const lA0 = await dong(k5.id, nvA);
  const kA0 = lA0.result as unknown as KetQuaLuong;
  dat(`…mặc định ĐỦ công chuẩn theo lịch mặc định: ${so5} công, lương đủ 21.000.000`, kA0.congTinhLuong === so5 && kA0.luongTheoCong === 21_000_000, `${kA0.congTinhLuong} ${kA0.luongTheoCong}`);
  dat("…dòng có cảnh báo vàng cong-mac-dinh, không lỗi", (lA0.warnings as { ma: string; muc: string }[]).some((c) => c.ma === "cong-mac-dinh" && c.muc === "canh-bao") && !lA0.hasError);
  dat("…ảnh chụp đầu vào ghi nguồn công", (lA0.inputs as { nguon: { nguonCong: string; bangCongId: string | null } }).nguon.nguonCong === "mac-dinh" && (lA0.inputs as { nguon: { bangCongId: null } }).nguon.bangCongId === null);
  dat("A2: tham số chưa xác nhận → cảnh báo vàng (mặc định không chặn)", r0.canhBao.some((c) => c.ma === "tham-so-chua-xac-nhan" && c.muc === "canh-bao"));

  // Công nhập tay (b).
  const congTay = (o: Record<string, unknown>) => LuocDoCongTayLuong.parse({ lyDo: "Bảng chấm công giấy của phòng", ...o });
  await voi(T, kt, (nc) => nhapCongTayLuong(nc, k5.id, congTay({ nguoiId: nvA, soNgayCong: 10, gioTangCa: 2 })));
  await nemLoi("Công nhập tay: không ai tự nhập công cho chính mình", "nghiep-vu", () => voi(T, kt, (nc) => nhapCongTayLuong(nc, k5.id, congTay({ nguoiId: kt, soNgayCong: 20 }))), "tu-nhap-cong");
  await nemLoi("…lý do phải ≥ 5 ký tự", "csdl", async () => LuocDoCongTayLuong.parse({ nguoiId: nvA, lyDo: "abc" }));
  await nemLoi("…Kế toán chưa bật 2 lớp → luong-can-2-lop", "nghiep-vu", () => voi(T, kt2, (nc) => nhapCongTayLuong(nc, k5.id, congTay({ nguoiId: nvA, soNgayCong: 9 }))), "luong-can-2-lop");
  await nemLoi("…nhân viên không có quyền", "quyen", () => voi(T, nvB, (nc) => nhapCongTayLuong(nc, k5.id, congTay({ nguoiId: nvA, soNgayCong: 9 }))));
  await voi(T, hr, (nc) => nhapCongTayLuong(nc, k5.id, congTay({ nguoiId: nvC, soNgayCong: null, nghiKhongLuong: 2 })));
  dat("Nhân sự (luong.update) cũng nhập được công tay; kỳ “cần tính lại”", (await chu.payrollRun.findUniqueOrThrow({ where: { id: k5.id } })).dirty);
  dat("…ghi kiểm toán nhap-cong-luong (không có số tiền)", (await chu.auditLog.count({ where: { tenantId: T, action: "nhap-cong-luong" } })) === 2);
  const r1 = await voi(T, kt, (nc) => tinhKyLuong(nc, k5.id));
  dat("A1(b): tính lại → 2 dòng nguồn công nhập tay, 1 mặc định", r1.nguonCong["nhap-tay"] === 2 && r1.nguonCong["mac-dinh"] === 1, JSON.stringify(r1.nguonCong));
  const lA1 = await dong(k5.id, nvA);
  const vA1 = lA1.inputs as unknown as DauVaoLuong & { nguon: { nguonCong: string; congTay: { soNgayCong: number; phutTangCa: number } } };
  const kA1 = lA1.result as unknown as KetQuaLuong;
  dat("…A: 10 công, tăng ca 120 phút ngày thường, ảnh chụp ghi công nhập tay", kA1.congTinhLuong === 10 && vA1.cong.tangCaPhut.thuong === 120 && vA1.nguon.nguonCong === "nhap-tay" && vA1.nguon.congTay.soNgayCong === 10 && vA1.nguon.congTay.phutTangCa === 120);
  dat("…lương theo công = 21.000.000 × 10 / chuẩn", kA1.luongTheoCong === Math.round((21_000_000 * 10) / so5));
  const kC1 = (await dong(k5.id, nvC)).result as unknown as KetQuaLuong;
  dat("…C: đủ công chuẩn trừ 2 ngày nghỉ không lương", kC1.congTinhLuong === so5 - 2, String(kC1.congTinhLuong));

  // Bảng công khóa SAU → lấy lại công.
  const bc5 = await chu.timesheet.create({ data: { tenantId: T, year: 2026, month: 5, generatedAt: MOC, generatedBy: hr, feedbackDeadline: MOC } });
  for (const u of [nvB, nvC]) {
    for (const d of cacNgayTrongThang(2026, 5).filter((x) => thuTrongTuan(x) < 5)) {
      await chu.timesheetRow.create({
        data: {
          tenantId: T, timesheetId: bc5.id, userId: u, workDate: NGAY(d), isAdjustment: false, dayType: "thuong", expectedValue: 1, workValue: d === "2026-05-05" && u === nvB ? 1 : 1,
          flags: d === "2026-05-05" && u === nvB ? ["thieu-gio", "thieu-gio-cho-xem-xet"] : [],
        },
      });
    }
  }
  await chu.timesheet.update({ where: { id: bc5.id }, data: { status: "da-khoa", lockedAt: MOC, lockedBy: hr } });
  await nemLoi("Người đã có trong bảng công khóa → không nhập công tay (409)", "nghiep-vu", () => voi(T, kt, (nc) => nhapCongTayLuong(nc, k5.id, congTay({ nguoiId: nvB, soNgayCong: 5 }))), "da-co-bang-cong");
  const rLai = await voi(T, kt, (nc) => layLaiCongTuBangCong(nc, k5.id));
  dat("“Lấy lại công từ bảng công”: xóa công nhập tay của người có trong bảng (C), giữ của người không có (A)", rLai.soCongTayXoa === 1 && (await chu.payrollManualInput.count({ where: { runId: k5.id } })) === 1);
  dat("…B, C chuyển sang nguồn bảng công; A giữ công nhập tay", rLai.nguonCong["bang-cong"] === 2 && rLai.nguonCong["nhap-tay"] === 1, JSON.stringify(rLai.nguonCong));
  dat("…ghi kiểm toán lay-lai-cong-bang-cong", (await chu.auditLog.count({ where: { tenantId: T, action: "lay-lai-cong-bang-cong" } })) === 1);
  dat("A2 (thiếu giờ chờ quyết): không chặn, cảnh báo vàng cấp kỳ + dòng B",
    rLai.canhBao.some((c) => c.ma === "con-ngay-thieu-gio" && c.muc === "canh-bao") && ((await dong(k5.id, nvB)).warnings as { ma: string }[]).some((c) => c.ma === "thieu-gio-cho-quyet"));
  const ct5 = await voi(T, kt, (nc) => chiTietKyLuong(nc, k5.id));
  dat("A5: người chưa có hồ sơ lương được liệt kê riêng (kèm nút tạo hồ sơ)", ct5.chuaCoHoSo.some((u) => u.id === nvMoi) && !ct5.chuaCoHoSo.some((u) => u.id === nvA));
  dat("A4 (trước khóa): dự kiến trả tay B (không tài khoản) + C (chọn tiền mặt)", ct5.traTay.ds.map((d) => d.userId).sort().join() === [nvB, nvC].sort().join() && !ct5.traTay.daKhoa);
  dat("Màn hình kỳ: mỗi dòng có nguồn công", ct5.dong.find((d) => d.userId === nvA)?.nguonCong === "nhap-tay" && ct5.dong.find((d) => d.userId === nvB)?.nguonCong === "bang-cong");

  // A3: tham số chưa xác nhận không chặn gửi duyệt / duyệt; ghi kiểm toán.
  await voi(T, kt, (nc) => guiDuyetKyLuong(nc, k5.id));
  dat("A3: gửi duyệt được dù tham số chưa xác nhận; kiểm toán gui-duyet-khi-tham-so-chua-xac-nhan", (await chu.auditLog.count({ where: { tenantId: T, action: "gui-duyet-khi-tham-so-chua-xac-nhan", objectId: k5.id } })) === 1);
  await voi(T, gd, (nc) => duyetKyLuong(nc, k5.id));
  const nkDuyet = await chu.auditLog.findFirst({ where: { tenantId: T, action: "duyet-khi-tham-so-chua-xac-nhan", objectId: k5.id } });
  dat("…duyệt được; kiểm toán “duyệt khi tham số chưa xác nhận” ghi danh sách bộ, không số tiền", Boolean(nkDuyet) && JSON.stringify(nkDuyet!.after).includes("thamSoChuaXacNhan") && !JSON.stringify(nkDuyet!.after).includes("21000000"));

  // A4: khóa khi thiếu tài khoản.
  await voi(T, gd, (nc) => khoaKyLuong(nc, k5.id));
  dat("A4: thiếu tài khoản KHÔNG chặn khóa", (await chu.payrollRun.findUniqueOrThrow({ where: { id: k5.id } })).status === "da-khoa");
  const [kA, kB, kC] = await Promise.all([dong(k5.id, nvA), dong(k5.id, nvB), dong(k5.id, nvC)]);
  dat("…chụp hình thức trả: A chuyển khoản (có TK), B trả tay (không TK), C trả tay (chọn tiền mặt, không chụp TK)",
    kA.payMethod === "chuyen-khoan" && kA.bankAccount === "0011223344" && kB.payMethod === "tien-mat" && !kB.bankAccount && kC.payMethod === "tien-mat" && !kC.bankAccount);
  const nh = await (await voi(T, kt, (nc) => xuatNganHang(nc, k5.id))).text();
  dat("…file ngân hàng chỉ có dòng chuyển khoản", nh.includes("0011223344") && !nh.includes("nhan-vien-b") && !nh.includes("5566778899"));
  const tay = await (await voi(T, kt, (nc) => xuatTraTay(nc, k5.id))).text();
  const tongTay = Number(kB.netPay + kC.netPay);
  dat("…danh sách “Trả tay” có B, C và dòng tổng", tay.includes("nhan-vien-b") && tay.includes("nhan-vien-c") && tay.includes("TỔNG CỘNG") && tay.includes(`>${tongTay}<`));
  await voi(T, kt, (nc) => daChiKyLuong(nc, k5.id));
  const bt = await (await voi(T, kt, (nc) => xuatButToan(nc, k5.id))).text();
  dat("…bút toán: chi chuyển khoản Có 1121 = thực lĩnh A, chi tay Có 1111 = B + C", bt.includes(`,334,1121,${Number(kA.netPay)}`) && bt.includes(`,334,1111,${tongTay}`), bt);

  // A3 chặt: bật Cấu hình chặn.
  await nemLoi("Cấu hình: Nhân sự không đổi được khóa Cấu hình (chỉ quản trị cấu hình)", "quyen", () => voi(T, hr, (nc) => capNhatCauHinh(nc, { giaTri: { "luong.chan_khi_tham_so_chua_xac_nhan": 1 } })));
  await voi(T, ad, (nc) => capNhatCauHinh(nc, { giaTri: { "luong.chan_khi_tham_so_chua_xac_nhan": 1 } }));
  const k6 = await voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 6 }));
  const r6 = await voi(T, kt, (nc) => tinhKyLuong(nc, k6.id));
  dat("A3 chặt (Cấu hình = 1): tham số chưa xác nhận → lỗi cấp kỳ", r6.canhBao.some((c) => c.ma === "tham-so-chua-xac-nhan" && c.muc === "loi"));
  await nemLoi("…và không gửi duyệt được", "nghiep-vu", () => voi(T, kt, (nc) => guiDuyetKyLuong(nc, k6.id)), ["ky-co-loi", "tham-so-chua-xac-nhan"]);
  await voi(T, ad, (nc) => capNhatCauHinh(nc, { giaTri: { "luong.chan_khi_tham_so_chua_xac_nhan": null } }));

  // A6: 2 lớp theo Cấu hình.
  await nemLoi("A6: mặc định bắt buộc 2 lớp — Kế toán chưa bật → luong-can-2-lop", "nghiep-vu", () => voi(T, kt2, (nc) => danhSachKyLuong(nc)), "luong-can-2-lop");
  await nemLoi("…Nhân sự không tắt được bắt buộc 2 lớp", "quyen", () => voi(T, hr, (nc) => capNhatCauHinh(nc, { giaTri: { "luong.bat_buoc_2_lop": 0 } })));
  await voi(T, ad, (nc) => capNhatCauHinh(nc, { giaTri: { "luong.bat_buoc_2_lop": 0 } }));
  const nk2Lop = await chu.auditLog.findFirst({ where: { tenantId: T, action: "sua", objectType: "setting", actorId: ad, after: { path: ["khoa"], equals: "luong.bat_buoc_2_lop" } } });
  dat("…Quản trị tắt được; ghi kiểm toán (trước 1 → sau 0)", Boolean(nk2Lop) && (nk2Lop!.after as { giaTri: number }).giaTri === 0);
  dat("…khi tắt: Kế toán chưa bật 2 lớp xem được kỳ lương", (await voi(T, kt2, (nc) => danhSachKyLuong(nc))).length >= 2);
  await voi(T, ad, (nc) => capNhatCauHinh(nc, { giaTri: { "luong.bat_buoc_2_lop": 1 } }));
  await nemLoi("…bật lại → chặn lại ngay", "nghiep-vu", () => voi(T, kt2, (nc) => danhSachKyLuong(nc)), "luong-can-2-lop");
  dat("…Can2Lop có hướng dẫn từng bước + nút đi tới trang bật", /Đi tới trang bật 2 lớp/.test(readFileSync("src/components/luong/Can2Lop.tsx", "utf8")) && /tai-khoan#xac-thuc-2-lop/.test(readFileSync("src/components/luong/Can2Lop.tsx", "utf8")));

  // ==================================================================
  console.log("\n— E. Nhập CSV hồ sơ lương (QĐ-179) —");
  const csv = [
    "Email,Loại hợp đồng,Lương cơ bản,Lương đóng BH,Số tài khoản,Ngân hàng,Mã số thuế,Số người phụ thuộc",
    `${email("nhan-vien-moi")},Thử việc,12.000.000,,9988776655,BIDV,0101234567,2`,
    `${email("nhan-vien-a")},,22.000.000,,0011223399,VCB,,`,
    `${email("nhan-su")},Chính thức,30.000.000,,,,,`,
    `khong-co.${DAU}@thu.test,Chính thức,1.000.000,,,,,`,
    `${email("nhan-vien-b")},Chính thức,1.000.000,,,=HYPERLINK("http://x"),,`,
    `${email("nhan-vien-c")},Chính thức,9.000.000,,,,,`,
    `${email("nhan-vien-c")},Chính thức,9.500.000,,,,,`,
  ].join("\n");
  const xt = await voi(T, hr, (nc) => nhapCsvHoSoLuong(nc, csv, false, "2026-07-01"));
  dat("Xem trước: 2 dòng hợp lệ (đổi TK A, C), lỗi theo từng dòng", xt.hopLe.length === 2 && xt.daGhi === 0, JSON.stringify(xt.loi));
  dat("…thử việc thiếu % → lỗi dòng 2; tự nhập hồ sơ của mình → lỗi (QĐ-159); email lạ; ô công thức; email trùng", (() => {
    const l = new Map(xt.loi.map((x) => [x.soDong, x.lyDo]));
    return /thử việc/i.test(l.get(2) ?? "") && /chính mình/.test(l.get(4) ?? "") && /Không có nhân viên/.test(l.get(5) ?? "") && /công thức/.test(l.get(6) ?? "") && /Trùng/.test(l.get(8) ?? "");
  })(), JSON.stringify(xt.loi));
  dat("Xem trước không ghi gì", (await chu.salaryProfile.count({ where: { tenantId: T, userId: nvMoi } })) === 0);
  const csv2 = csv.replace(",Thử việc,12.000.000,", ",Chính thức,12.000.000,");
  const ghi = await voi(T, hr, (nc) => nhapCsvHoSoLuong(nc, csv2, true, "2026-07-01"));
  dat("Ghi: 3 phiên bản hồ sơ mới", ghi.daGhi === 3 && (await chu.salaryProfile.count({ where: { tenantId: T, userId: nvMoi } })) === 1);
  const hsMoi = await chu.salaryProfile.findFirstOrThrow({ where: { tenantId: T, userId: nvMoi } });
  dat("…đúng lương, tài khoản, MST, hiệu lực từ ngày chọn", hsMoi.baseSalary === 12_000_000n && hsMoi.bankAccount === "9988776655" && hsMoi.taxCode === "0101234567" && hsMoi.effectiveFrom.toISOString().startsWith("2026-07-01"));
  dat("…2 người phụ thuộc “chưa ghi tên” để bổ sung sau", (await chu.salaryDependent.count({ where: { tenantId: T, userId: nvMoi, relationship: "chưa ghi" } })) === 2);
  const hsA = await chu.salaryProfile.findFirstOrThrow({ where: { tenantId: T, userId: nvA }, orderBy: { createdAt: "desc" } });
  dat("…A: giữ hình thức / thuế cũ, đổi lương + tài khoản", hsA.baseSalary === 22_000_000n && hsA.bankAccount === "0011223399" && hsA.taxMethod === "luy-tien");
  dat("Đổi tài khoản qua CSV vẫn báo nhân viên (QĐ-159)", (await chu.notification.count({ where: { userId: nvA, type: "doi-tai-khoan-luong" } })) === 1);
  dat("…kiểm toán nhap-ho-so-luong không ghi số tiền", !JSON.stringify((await chu.auditLog.findFirstOrThrow({ where: { tenantId: T, action: "nhap-ho-so-luong" } })).after).includes("12000000"));
  await nemLoi("Kế toán (không có luong.update) không nhập CSV hồ sơ", "quyen", () => voi(T, kt, (nc) => nhapCsvHoSoLuong(nc, csv2, false)));

  // ==================================================================
  console.log("\n— B2. Bảng công nhập tay (QĐ-174) —");
  const HN = "2026-11-09";
  const dct = (o: Record<string, unknown>) => LuocDoDatCongTay.parse({ cong: 1, lyDo: "Làm tại công trình, không có máy", ...o });
  await voi(T, hr, (nc) => datCongTay(nc, dct({ nguoiId: ktv, ngay: "2026-10-05" }), HN));
  await nemLoi("Không tự đặt công cho chính mình", "nghiep-vu", () => voi(T, hr, (nc) => datCongTay(nc, dct({ nguoiId: hr, ngay: "2026-10-05" }), HN)), "khong-tu-dat-cong");
  await nemLoi("Không đặt công cho ngày chưa tới", "nghiep-vu", () => voi(T, hr, (nc) => datCongTay(nc, dct({ nguoiId: ktv, ngay: "2026-12-01" }), HN)), "ngay-tuong-lai");
  await nemLoi("Lý do < 5 ký tự bị chặn", "csdl", async () => LuocDoDatCongTay.parse({ nguoiId: ktv, ngay: "2026-10-05", cong: 1, lyDo: "x" }));
  await nemLoi("Nhân viên không đặt công", "quyen", () => voi(T, nvA, (nc) => datCongTay(nc, dct({ nguoiId: ktv, ngay: "2026-10-05" }), HN)));
  const khoang = await voi(T, hr, (nc) => datCongTay(nc, dct({ nguoiId: ktv, ngay: "2026-10-09", denNgay: "2026-10-12", cong: 0.5 }), HN));
  dat("Khoảng ngày: chỉ ngày phải làm theo lịch (09/10 T6, 12/10 T2; bỏ T7, CN)", khoang.soNgay === 2 && khoang.ngay.join() === "2026-10-09,2026-10-12");
  dat("…ghi kiểm toán dat-cong-tay", (await chu.auditLog.count({ where: { tenantId: T, action: "dat-cong-tay" } })) === 2);
  await voi(T, hr, (nc) => sinhBangCong(nc, { nam: 2026, thang: 10 }, new Date("2026-11-02T03:00:00Z")));
  const bc10 = await chu.timesheet.findFirstOrThrow({ where: { tenantId: T, year: 2026, month: 10 } });
  const r05 = await chu.timesheetRow.findFirst({ where: { timesheetId: bc10.id, userId: ktv, workDate: NGAY("2026-10-05") } });
  dat("Bảng công dùng công đặt tay: 05/10 = 1 công, cờ công-nhập-tay, nguồn nhap-tay", Number(r05?.workValue) === 1 && JSON.stringify(r05?.flags).includes("cong-nhap-tay") && JSON.stringify(r05?.sources ?? []).includes("nhap-tay"));
  const r09 = await chu.timesheetRow.findFirst({ where: { timesheetId: bc10.id, userId: ktv, workDate: NGAY("2026-10-09") } });
  dat("…09/10 = 0,5 công", Number(r09?.workValue) === 0.5);
  const r06 = await chu.timesheetRow.findFirst({ where: { timesheetId: bc10.id, userId: ktv, workDate: NGAY("2026-10-06") } });
  dat("…ngày không đặt tay vẫn theo lần chấm (vắng = 0) — người chưa gán lịch vào bảng công theo lịch mặc định", Boolean(r06) && Number(r06!.workValue) === 0);
  await nemLoi("Bảng đặt công chỉ ghi thêm (chủ sở hữu cũng không sửa)", "csdl", () => chu.attendanceManualDay.updateMany({ where: { tenantId: T }, data: { workValue: 0 } }));
  await chu.timesheet.update({ where: { id: bc10.id }, data: { status: "da-khoa", lockedAt: MOC, lockedBy: hr } });
  await nemLoi("Kỳ đã khóa → không đặt công tay (409)", "nghiep-vu", () => voi(T, hr, (nc) => datCongTay(nc, dct({ nguoiId: ktv, ngay: "2026-10-06" }), HN)), "da-khoa");
  await nemLoi("…CSDL cũng chặn (trigger) kể cả chủ sở hữu", "csdl", () => chu.attendanceManualDay.create({ data: { tenantId: T, userId: ktv, workDate: NGAY("2026-10-06"), workValue: 1, reason: "Thử chặn sau khóa", createdBy: hr } }));

  // ==================================================================
  console.log("\n— B3–B6. Kỹ thuật, máy chấm công, máy lạ, PIN (QĐ-175 → QĐ-179) —");
  const hoSoKtv = await voiTenant(T, (tx) => layHoSoQuyen(tx, ktv));
  dat("B3: Kỹ thuật viên có may_cham_cong.view/create/update, KHÔNG có nhan_su.* / luong rộng", ["view", "create", "update"].every((h) => hoSoKtv!.quyen.has(`may_cham_cong.${h}`)) && !hoSoKtv!.quyen.has("nhan_su.view") && hoSoKtv!.phamVi.get("luong.view") === "own");
  await nemLoi("…không xem được hồ sơ nhân sự", "quyen", () => voi(T, ktv, (nc) => danhSachHoSoNhanSu(nc)));
  await nemLoi("…không xem được hồ sơ lương", "quyen", () => voi(T, ktv, (nc) => danhSachHoSo(nc)));
  const nvDs = await voi(T, ktv, (nc) => nhanVienChoAnhXa(nc));
  dat("…danh sách ánh xạ PIN chỉ có tên + PIN (không email, không hồ sơ)", nvDs.length > 0 && Object.keys(nvDs[0]).sort().join() === "hoTen,id,pin");
  const hoSoAi = await voiTenant(T, async (tx) => layHoSoQuyen(tx, (await tx.user.findFirstOrThrow({ where: { email: "ita@he-thong.noi-bo" } })).id));
  dat("…trợ lý AI không có may_cham_cong.*", ![...hoSoAi!.quyen].some((q) => q.startsWith("may_cham_cong.")));

  // Migration QĐ-117 cho mọi doanh nghiệp: gỡ quyền ở T2 rồi chạy lại migration → cấp lại, chạy hai lần không lỗi.
  const sqlQuyen = readFileSync("prisma/migrations/20261109090002_may_cham_cong_cap_quyen/migration.sql", "utf8");
  await chu.rolePermission.deleteMany({ where: { tenantId: T2, permission: { module: "may_cham_cong" } } });
  await chu.$executeRawUnsafe(sqlQuyen);
  await chu.$executeRawUnsafe(sqlQuyen);
  const capT2 = await chu.rolePermission.findMany({ where: { tenantId: T2, permission: { module: "may_cham_cong" } }, select: { dataScope: true, role: { select: { code: true } }, permission: { select: { code: true } } } });
  const vtCap = (code: string) => capT2.filter((x) => x.role.code === code).map((x) => x.permission.code).sort().join();
  dat("Migration may_cham_cong (idempotent) cấp lại cho doanh nghiệp khác: Kỹ thuật / Trưởng KT / Nhân sự view+create+update, phạm vi all",
    ["technical", "technical-manager", "nhan-su-hr"].every((c) => vtCap(c) === "may_cham_cong.create,may_cham_cong.update,may_cham_cong.view") && capT2.every((x) => x.dataScope === "all"));
  dat("…Giám đốc / Quản trị đủ 6 mã; AI không có", vtCap("ceo").split(",").length === 6 && vtCap("admin").split(",").length === 6 && vtCap("ai-assistant") === "");

  // B5: máy lạ.
  const SN = `MD${DAU.toUpperCase()}`.slice(0, 20);
  const SN2 = `MX${DAU.toUpperCase()}`.slice(0, 20);
  const BAY = new Date("2026-11-03T02:00:00Z");
  const adms = (phuongThuc: string, doan: string, ts: string, than: string | null = null, ip = IP_VP) =>
    xuLyAdms({ phuongThuc, doan, truyVan: new URLSearchParams(ts), than, ip }, { bayGio: () => BAY });
  const la1 = await adms("GET", "cdata", `SN=${SN}&options=all&pushver=2.4.1&DeviceType=att`);
  const la2 = await adms("GET", "cdata", `SN=${SN}&options=all`);
  dat("B5: SN chưa đăng ký → vẫn 401", la1.status === 401 && la2.status === 401);
  const dongLa = await chu.attendanceUnknownDevice.findUnique({ where: { serialNumber: SN } });
  dat("…ghi vào bảng máy lạ (SN, IP, model); trần tốc độ: lần gọi thứ hai trong 30 giây không ghi thêm", dongLa?.lastIp === IP_VP && dongLa.model === "att" && dongLa.hitCount === 1, JSON.stringify(dongLa));
  const punchTruoc = await chu.attendancePunch.count({ where: { tenantId: { in: [T, T2] } } });
  await adms("POST", "cdata", `SN=${SN2}&table=ATTLOG&Stamp=5`, "7001\t2026-11-03 08:00:00\t0\t1\t0\t0\n");
  dat("…máy lạ gửi ATTLOG: KHÔNG lưu lần chấm nào", (await chu.attendancePunch.count({ where: { tenantId: { in: [T, T2] } } })) === punchTruoc && (await chu.attendancePunch.count({ where: { tenantId: { in: [T, T2] }, pin: "7001" } })) === 0);
  const thayCungIp = await voi(T, ktv, (nc) => danhSachMayLa(nc), IP_VP);
  dat("…Kỹ thuật cùng IP với máy thấy máy lạ (đánh dấu cùng mạng)", thayCungIp.some((m) => m.soSeri === SN && m.cungIpVoiBan));
  dat("…người xem ở IP khác KHÔNG thấy (doanh nghiệp chưa có máy nào cùng IP)", !(await voi(T, ktv, (nc) => danhSachMayLa(nc), IP_KHAC)).some((m) => m.soSeri === SN));
  dat("…doanh nghiệp khác ở IP khác KHÔNG thấy", !(await voi(T2, ktvT2, (nc) => danhSachMayLa(nc), IP_KHAC)).some((m) => m.soSeri === SN));
  dat("…gõ đúng SN thì tìm thấy", (await voi(T, ktv, (nc) => danhSachMayLa(nc, SN.toLowerCase()), IP_KHAC)).some((m) => m.soSeri === SN));
  await nemLoi("…nhân viên không xem được máy lạ", "quyen", () => voi(T, nvA, (nc) => danhSachMayLa(nc)));
  await nemLoi("…vai ứng dụng không đọc thẳng bảng máy lạ (chỉ qua hàm)", "csdl", () => voiTenant(T, (tx) => tx.attendanceUnknownDevice.findMany()));
  const may = await voi(T, ktv, (nc) => taoMay(nc, { soSeri: SN, ten: "Máy kho", diaDiemId: null, ipChoPhep: [] }));
  dat("B3/B5: Kỹ thuật đăng ký máy này (chưa chọn địa điểm) — đánh dấu từ máy lạ", may.tuMayLa && may.chuaCoDiaDiem);
  dat("…dòng máy lạ được xóa; kiểm toán dang-ky-may-la", !(await chu.attendanceUnknownDevice.findUnique({ where: { serialNumber: SN } })) && (await chu.auditLog.count({ where: { tenantId: T, action: "dang-ky-may-la" } })) === 1);
  const batTay = await adms("GET", "cdata", `SN=${SN}&options=all`);
  dat("…lần gọi kế tiếp trả ATTLOGStamp=0 (máy gửi lại toàn bộ log)", batTay.status === 200 && batTay.than.includes("ATTLOGStamp=0"));
  dat("…sau khi có máy đăng ký ở IP này, doanh nghiệp thấy máy lạ khác gọi từ cùng IP dù người xem ở IP khác",
    (await voi(T, ktv, (nc) => danhSachMayLa(nc), IP_KHAC)).some((m) => m.soSeri === SN2.toUpperCase()));
  await voi(T, ktv, (nc) => suaMay(nc, may.id, { ten: "Máy kho tầng 1" }));
  dat("Kỹ thuật sửa tên máy được", (await chu.attendanceDevice.findUniqueOrThrow({ where: { id: may.id } })).name === "Máy kho tầng 1");
  const dsMay = await voi(T, ktv, (nc) => danhSachMay(nc, BAY));
  dat("Kỹ thuật xem trạng thái + SN + IP; máy chưa có địa điểm hiện null", dsMay.dong.some((m) => m.id === may.id && m.soSeri === SN && m.ipCuoi === IP_VP && m.diaDiem === null));

  // B4: kiểm tra kết nối.
  const kt0 = await voi(T, ktv, (nc) => kiemTraKetNoiMay(nc, may.id, new Date(BAY.getTime() + 60_000)));
  dat("B4: Kiểm tra kết nối → lần gọi cuối + IP nguồn + trực tuyến", kt0.trucTuyen && kt0.ipCuoi === IP_VP && kt0.giayTruoc === 60 && kt0.lanCuoi?.getTime() === BAY.getTime());
  const mayMoi = await voi(T, ktv, (nc) => taoMay(nc, { soSeri: `MN${DAU.toUpperCase()}`.slice(0, 20), ten: "Máy chưa cắm", diaDiemId: null, ipChoPhep: [] }));
  const kt1 = await voi(T, ktv, (nc) => kiemTraKetNoiMay(nc, mayMoi.id, BAY));
  dat("…máy chưa từng gọi → hướng dẫn kiểm địa chỉ / cổng / HTTPS", !kt1.trucTuyen && kt1.lanCuoi === null && /CHƯA nhận được/.test(kt1.goiY));
  dat("…đăng ký máy thường (không từ máy lạ) không đặt lại Stamp", (await chu.attendanceDevice.findUniqueOrThrow({ where: { id: mayMoi.id } })).attlogStamp === null);

  // B6: PIN chưa ánh xạ vẫn lưu + nhập CSV ánh xạ PIN ↔ email.
  await adms("POST", "cdata", `SN=${SN}&table=ATTLOG&Stamp=9`, "7001\t2026-11-03 08:00:00\t0\t1\t0\t0\n7001\t2026-11-03 17:05:00\t1\t1\t0\t0\n");
  dat("B6: PIN chưa ánh xạ → lần chấm vẫn lưu, chờ ánh xạ (QĐ-118)", (await voi(T, ktv, (nc) => danhSachPinChuaKhop(nc))).some((p) => p.pin === "7001" && p.soLanCham === 2));
  const csvPin = `Mã chấm công,Email\n7001,${email("nhan-vien-c").toUpperCase()}\n=7002,${email("nhan-vien-a")}\n7003,khong-co.${DAU}@thu.test\n`;
  const xtPin = await voi(T, ktv, (nc) => nhapCsvAnhXaPin(nc, csvPin, false));
  dat("…CSV xem trước: 1 hợp lệ, 2 lỗi theo dòng (ô công thức, email lạ)", xtPin.hopLe.length === 1 && xtPin.soLoi === 2 && xtPin.daGhi === 0);
  const ghiPin = await voi(T, ktv, (nc) => nhapCsvAnhXaPin(nc, csvPin, true));
  dat("…ghi: Kỹ thuật gán PIN 7001 cho C, 2 lần chấm cũ được gán", ghiPin.daGhi === 1 && ghiPin.soLanChamGanLai === 2 && (await chu.staffProfile.findUniqueOrThrow({ where: { userId: nvC } })).attendancePin === "7001");
  dat("…kiểm toán nhap-anh-xa-pin", (await chu.auditLog.count({ where: { tenantId: T, action: "nhap-anh-xa-pin" } })) === 1);

  // ==================================================================
  console.log("\n— C. Đánh giá, thực tập (QĐ-180) —");
  const kyDg = await voi(T, hr, (nc) => taoKyDanhGia(nc, { loai: "thang", nam: 2026, so: 9, nguoiIds: [nvB] }));
  const phieu = await chu.evaluation.findFirstOrThrow({ where: { periodId: kyDg.id, userId: nvB } });
  const ctPhieu = await voi(T, gd, (nc) => chiTietPhieu(nc, phieu.id));
  dat("C1: vai trò chưa có bộ KPI → phiếu vẫn tạo, chỉ phần quản lý chấm + cảnh báo", ctPhieu.phieu.khongCoBoKpi && ctPhieu.chiTieu.length === 1 && ctPhieu.chiTieu[0].nguon === "thu-cong");
  dat("…giao diện có đường dẫn “Tạo bộ KPI”", /Tạo bộ KPI/.test(readFileSync("src/app/(he-thong)/danh-gia/[id]/page.tsx", "utf8")));
  const tts = await nguoi("thuc-tap-sinh", "sinh-vien-thuc-tap", { quanLy: gd });
  await voi(T, hr, (nc) => suaHoSoNhanSu(nc, tts, LuocDoHoSoNhanSu.parse({ loaiNhanSu: "thuc-tap", thucTap: { truong: "ĐH Thử nghiệm", khoa: "CNTT", mssv: "TN001", nguoiHuongDanId: gd, tuNgay: "2026-09-01", denNgay: "2026-12-31" } })));
  const ptt = await voi(T, hr, (nc) => taoPhieuThucTap(nc, { nguoiId: tts, mauId: null }));
  const ctTt = await voi(T, hr, (nc) => chiTietPhieuThucTap(nc, ptt.id));
  dat("C2: chưa có mẫu phiếu của trường → dùng mẫu chung, có nhắc thay mẫu", ctTt.phieu.dungMauChung && /Thay bằng mẫu của trường|Thực tập → Mẫu phiếu/.test(readFileSync("src/app/(he-thong)/thuc-tap/danh-gia/[id]/page.tsx", "utf8")));
  const mauTruong = await chu.internEvalTemplate.findFirstOrThrow({ where: { tenantId: T, code: "mau-chung" } });
  await chu.internEvalTemplate.create({ data: { tenantId: T, code: "mau-truong", name: "Mẫu ĐH Thử nghiệm", school: "đh thử nghiệm", layout: mauTruong.layout as object } });
  const ptt2 = await voi(T, hr, (nc) => taoPhieuThucTap(nc, { nguoiId: tts, mauId: null }));
  dat("…có mẫu của đúng trường → tự chọn mẫu đó", !(await voi(T, hr, (nc) => chiTietPhieuThucTap(nc, ptt2.id))).phieu.dungMauChung);

  // ==================================================================
  console.log("\n— D. Thiết lập ban đầu theo người phụ trách (QĐ-180) —");
  const nhom = async (u: string) => (await voi(T, u, (nc) => viecThietLap(nc, "2026-11-09"))).nhom.map((n) => n.ma).join();
  dat("Nhân sự thấy: Nhân sự, Kế toán (hồ sơ lương), Kỹ thuật (máy)", (await nhom(hr)) === "nhan-su,ke-toan,ky-thuat");
  dat("Kế toán chỉ thấy phần Kế toán", (await nhom(kt)) === "ke-toan");
  dat("Kỹ thuật chỉ thấy phần Kỹ thuật", (await nhom(ktv)) === "ky-thuat");
  dat("Quản trị thấy đủ 4 nhóm", (await nhom(ad)) === "nhan-su,ke-toan,ky-thuat,quan-tri");
  dat("Nhân viên không thấy nhóm nào", (await nhom(nvA)) === "");
  const vNs = await voi(T, hr, (nc) => viecThietLap(nc, "2026-11-09"));
  const viecNs = (ma: string) => vNs.nhom.flatMap((n) => n.viec).find((v) => v.ma === ma)!;
  dat("…địa điểm còn thiếu 1, lịch mặc định xong, máy chưa có địa điểm = 2; mọi việc ghi “không bắt buộc”",
    viecNs("dia-diem").conThieu === 1 && viecNs("lich-mac-dinh").xong && viecNs("may-dia-diem").conThieu === 2 && vNs.nhom.flatMap((n) => n.viec).every((v) => v.ghiChu.startsWith("Không bắt buộc") && v.duongDan.startsWith("/")));
  const vKt = await voi(T, kt, (nc) => viecThietLap(nc, "2026-11-09"));
  const thamSoThieu = vKt.nhom[0].viec.find((v) => v.ma === "tham-so-luong")!.conThieu;
  dat("Kế toán: tham số chưa xác nhận > 0; tài khoản thiếu = 1 (B)", thamSoThieu > 0 && vKt.nhom[0].viec.find((v) => v.ma === "tai-khoan")!.conThieu === 1);
  for (const b of (await voi(T, kt, (nc) => danhSachThamSo(nc, "2026-11-09"))).canXacNhan) await voi(T, kt, (nc) => xacNhanThamSo(nc, b.id));
  dat("…xác nhận xong → việc tham số “Xong”", (await voi(T, kt, (nc) => viecThietLap(nc, "2026-11-09"))).nhom[0].viec.find((v) => v.ma === "tham-so-luong")!.xong);
  const vAd = await voi(T, ad, (nc) => viecThietLap(nc, "2026-11-09"));
  const viecAd = (ma: string) => vAd.nhom.flatMap((n) => n.viec).find((v) => v.ma === ma)!;
  dat("Quản trị: hồ sơ công ty thiếu 3, logo thiếu, mẫu phiếu của trường đã có", viecAd("ho-so-cong-ty").conThieu === 3 && !viecAd("logo").xong && viecAd("mau-phieu-thuc-tap").xong);
  dat("…bật 2 lớp: còn Kế toán chưa bật (kt2)", viecAd("bat-2-lop").conThieu >= 1);
  const vKtv = await voi(T, ktv, (nc) => viecThietLap(nc, "2026-11-09"), IP_VP);
  dat("Kỹ thuật: đã có máy; máy lạ chờ đăng ký đếm theo cách ly IP", vKtv.nhom[0].viec.find((v) => v.ma === "may-cham-cong")!.xong && vKtv.nhom[0].viec.find((v) => v.ma === "may-la")!.conThieu >= 1);

  ketLuan("Thử 0.22.0 — Mở dần");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
