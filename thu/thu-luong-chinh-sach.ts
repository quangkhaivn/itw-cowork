import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { cacNgayTrongThang, thuTrongTuan } from "../src/modules/cham-cong/tinh-toan";
import { ketThucNguoiPhuThuoc, taoHoSoLuong, themNguoiPhuThuoc } from "../src/modules/luong/ho-so";
import { LuocDoHoSoLuong, LuocDoKhoan } from "../src/modules/luong/luoc-do";
import {
  chiTietKyLuong,
  duyetKyLuong,
  guiDuyetKyLuong,
  khoaKyLuong,
  kiemLaiPhieuLuong,
  taoKyLuong,
  themKhoanLuong,
  tinhKyLuong,
} from "../src/modules/luong/service";
import { danhSachThamSo, xacNhanThamSo } from "../src/modules/luong/tham-so";
import { guiEmailPhieuLuong, guiLaiPhieuLuong, xuatNganHang } from "../src/modules/luong/xuat";
import type { DauVaoLuong, KetQuaLuong } from "../src/modules/luong/tinh-toan";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng chính sách lương Giám đốc quyết sau QA 0.21.0 (QĐ-156 → QĐ-166) trên CSDL THẬT, qua đúng service API gọi.
 * Tháng lương, ngày công, ngày thu tiền là hằng số (không dùng giờ thật cho dữ liệu nghiệp vụ).
 * Chạy: npm run thu:luong-chinh-sach (CSDL phát triển).
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
    return viec(taoNguCanh(tx, tenantId, hoSo, "127.0.0.1", "thu-luong-chinh-sach"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "zod";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string): Promise<LoiNghiepVu | null> {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
    return null;
  } catch (e) {
    const dungKieu =
      kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "zod" ? (e as Error)?.name === "ZodError"
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
    return e instanceof LoiNghiepVu ? e : null;
  }
}

async function main() {
  console.log("=== Thử chính sách lương sau QA (QĐ-156 → QĐ-166) ===\n");
  const tenant = await seedNenMong(chu, `thu-lucs-${DAU}`, "Doanh nghiệp thử chính sách lương");
  const T = tenant.id;
  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  async function nguoi(ten: string, vai: string, hiredAt = "2025-01-01") {
    const u = await chu.user.create({
      data: {
        tenantId: T, email: `${ten.replace(/[^a-z0-9]/gi, "").toLowerCase()}.${DAU}@thu.test`, passwordHash: "x", fullName: ten,
        totpEnabledAt: MOC, totpSecretEnc: "v1:thu",
        userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } },
        staffProfile: { create: { tenantId: T, hiredAt: NGAY(hiredAt) } },
      },
    });
    return u.id;
  }
  const gd = await nguoi("Giám đốc", "ceo");
  const ad = await nguoi("Quản trị", "admin");
  const kt = await nguoi("Kế toán", "finance");
  const hr = await nguoi("Nhân sự", "nhan-su-hr");
  const nvP = await nguoi("Nhân viên P", "sales");
  const nvQ = await nguoi("Nhân viên Q", "sales", "2026-03-16");
  const nvR = await nguoi("Nhân viên R", "technical");

  const ca = await chu.workShift.create({ data: { tenantId: T, code: "hc", name: "Hành chính", startMinute: 480, endMinute: 1020, breakStartMinute: 720, breakMinutes: 60 } });
  const lich = await chu.workSchedule.create({ data: { tenantId: T, code: "hc", name: "Hành chính", shiftId: ca.id, days: ["ca", "ca", "ca", "ca", "ca", "sang", "nghi"] } });
  for (const u of [gd, ad, nvP, nvR]) await chu.scheduleAssignment.create({ data: { tenantId: T, userId: u, scheduleId: lich.id, effectiveFrom: NGAY("2026-01-01") } });
  await chu.scheduleAssignment.create({ data: { tenantId: T, userId: nvQ, scheduleId: lich.id, effectiveFrom: NGAY("2026-03-16") } });

  // Tham số nạp sẵn: kế toán xác nhận (để gửi duyệt được).
  for (const b of (await voi(T, kt, (nc) => danhSachThamSo(nc))).canXacNhan) await voi(T, kt, (nc) => xacNhanThamSo(nc, b.id));

  const pc = await chu.salaryAllowanceType.findMany({ where: { tenantId: T } });
  const dienThoai = pc.find((x) => x.code === "dien-thoai")!;
  const guiXe = await chu.salaryAllowanceType.create({ data: { tenantId: T, code: "gui-xe", name: "Gửi xe", taxable: false, insurable: false, basis: "thang", fullMonth: true } });
  const hs = (o: Record<string, unknown>) => LuocDoHoSoLuong.parse({ hieuLucTu: "2026-01-01", loaiHopDong: "chinh-thuc", cachTra: "thang", phuongPhapThue: "luy-tien", ...o });

  // ==================================================================
  console.log("— A. QĐ-159: không ai tự lập / sửa hồ sơ lương của chính mình —");
  await nemLoi("Nhân sự không tự lập hồ sơ lương cho mình (403)", "nghiep-vu", () => voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: hr, luongCoBan: 1_000_000 }))), "tu-sua-ho-so");
  await nemLoi("Giám đốc (toàn quyền) cũng không tự lập hồ sơ cho mình", "nghiep-vu", () => voi(T, gd, (nc) => taoHoSoLuong(nc, hs({ nguoiId: gd, luongCoBan: 1_000_000 }))), "tu-sua-ho-so");
  await nemLoi("Quản trị không tự lập hồ sơ cho mình", "nghiep-vu", () => voi(T, ad, (nc) => taoHoSoLuong(nc, hs({ nguoiId: ad, luongCoBan: 1_000_000 }))), "tu-sua-ho-so");
  await nemLoi("Nhân sự không tự thêm người phụ thuộc cho mình", "nghiep-vu", () => voi(T, hr, (nc) => themNguoiPhuThuoc(nc, { nguoiId: hr, hoTen: "Con H", quanHe: "Con", soGiayTo: null, tuThang: "2026-01", denThang: null })), "tu-sua-ho-so");
  const nptGd = await voi(T, hr, (nc) => themNguoiPhuThuoc(nc, { nguoiId: gd, hoTen: "Con GĐ", quanHe: "Con", soGiayTo: "079200000002", tuThang: "2026-01", denThang: null }));
  await nemLoi("Giám đốc không tự kết thúc người phụ thuộc của mình", "nghiep-vu", () => voi(T, gd, (nc) => ketThucNguoiPhuThuoc(nc, nptGd.id, { denThang: "2026-02" })), "tu-sua-ho-so");

  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: gd, luongCoBan: 50_000_000, luongDongBH: 40_000_000, soTaiKhoan: "1111", nganHang: "VCB" })));
  await voi(T, gd, (nc) => taoHoSoLuong(nc, hs({ nguoiId: ad, luongCoBan: 30_000_000, luongDongBH: 30_000_000, soTaiKhoan: "2222", nganHang: "VCB" })));
  // nvP: thử việc 85% từ 01/01, chính thức 24tr từ 16/03 (QĐ-156). Điện thoại 600k cố định tháng ở cả hai phiên bản.
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvP, loaiHopDong: "thu-viec", tyLeThuViec: 85, luongCoBan: 20_000_000, luongDongBH: 20_000_000, phuCap: [{ loaiId: dienThoai.id, soTien: 600_000 }], soTaiKhoan: "0011001234567", nganHang: "Vietcombank" })));
  const tbTruoc = await chu.notification.count({ where: { userId: nvP, type: "doi-tai-khoan-luong" } });
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvP, hieuLucTu: "2026-03-16", luongCoBan: 24_000_000, luongDongBH: 24_000_000, phuCap: [{ loaiId: dienThoai.id, soTien: 600_000 }], soTaiKhoan: "0011001234567", nganHang: "Vietcombank" })));
  dat("Phiên bản mới cùng tài khoản: không báo đổi tài khoản", (await chu.notification.count({ where: { userId: nvP, type: "doi-tai-khoan-luong" } })) === tbTruoc);
  // nvQ: vào làm 16/03, chưa khai tài khoản; phụ cấp điện thoại (chia theo công) + gửi xe (trả đủ).
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvQ, hieuLucTu: "2026-03-16", luongCoBan: 12_000_000, luongDongBH: 12_000_000, phuCap: [{ loaiId: dienThoai.id, soTien: 600_000 }, { loaiId: guiXe.id, soTien: 200_000 }] })));
  // nvR: nghỉ không lương cả tháng 3.
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvR, luongCoBan: 15_000_000, luongDongBH: 15_000_000, phuCap: [{ loaiId: dienThoai.id, soTien: 600_000 }], soTaiKhoan: "3333", nganHang: "MB" })));

  // Bảng công dựng tay (đã khóa) — mỗi ngày phải làm một dòng.
  async function bangCong(nam: number, thang: number, ds: { userId: string; tu?: string; nghiKhongLuong?: boolean; tangCa?: Record<string, number>; dieuChinhTangCa?: { ngay: string; phut: number }[]; dieuChinhCong?: { ngay: string; cong: number }[] }[]) {
    const bc = await chu.timesheet.create({ data: { tenantId: T, year: nam, month: thang, generatedAt: MOC, generatedBy: hr, feedbackDeadline: MOC } });
    for (const d of ds) {
      for (const ngay of cacNgayTrongThang(nam, thang)) {
        const thu = thuTrongTuan(ngay);
        if (thu === 6 || (d.tu && ngay < d.tu)) continue;
        const duKien = thu === 5 ? 0.5 : 1;
        await chu.timesheetRow.create({
          data: {
            tenantId: T, timesheetId: bc.id, userId: d.userId, workDate: NGAY(ngay), isAdjustment: false, dayType: "thuong", expectedValue: duKien,
            workValue: d.nghiKhongLuong ? 0 : duKien, leaveDays: d.nghiKhongLuong ? duKien : 0, leavePaid: false, leaveTypeCode: d.nghiKhongLuong ? "khong-luong" : null,
            otMinutes: d.tangCa?.[ngay] ?? 0,
          },
        });
      }
      for (const a of d.dieuChinhCong ?? []) {
        await chu.timesheetRow.create({ data: { tenantId: T, timesheetId: bc.id, userId: d.userId, workDate: NGAY(a.ngay), isAdjustment: true, dayType: "thuong", expectedValue: 0, workValue: a.cong, flags: ["dieu-chinh-ky-truoc"] } });
      }
      for (const a of d.dieuChinhTangCa ?? []) {
        await chu.timesheetRow.create({ data: { tenantId: T, timesheetId: bc.id, userId: d.userId, workDate: NGAY(a.ngay), isAdjustment: true, dayType: "thuong", otMinutes: a.phut, flags: ["dieu-chinh-ky-truoc"] } });
      }
    }
    await chu.timesheet.update({ where: { id: bc.id }, data: { status: "da-khoa", lockedAt: MOC, lockedBy: hr } });
    return bc;
  }
  await bangCong(2026, 3, [
    { userId: gd }, { userId: ad }, { userId: nvP, tangCa: { "2026-03-02": 120 } }, { userId: nvQ, tu: "2026-03-16" }, { userId: nvR, nghiKhongLuong: true },
  ]);
  const dong = async (kyId: string, u: string) => chu.payrollLine.findFirstOrThrow({ where: { runId: kyId, userId: u } });
  const kq = (d: { result: unknown }) => d.result as unknown as KetQuaLuong;

  // ==================================================================
  console.log("\n— B. QĐ-165: không còn người duyệt → báo rõ; tách kỳ lương riêng cho lãnh đạo —");
  const k3 = await voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 3 }));
  await voi(T, kt, (nc) => tinhKyLuong(nc, k3.id));
  dat("Kỳ chung ban đầu có cả Giám đốc và Quản trị", (await chu.payrollLine.count({ where: { runId: k3.id, userId: { in: [gd, ad] } } })) === 2);
  const loiDuyet = await nemLoi("Mọi người có quyền duyệt đều có dòng → gửi duyệt báo rõ", "nghiep-vu", () => voi(T, kt, (nc) => guiDuyetKyLuong(nc, k3.id)), "khong-con-nguoi-duyet");
  dat("…lời báo hướng dẫn tách sang kỳ lương riêng", /kỳ lương riêng/.test(loiDuyet?.message ?? ""));
  dat("…màn hình kỳ lương cũng báo không còn người duyệt", (await voi(T, kt, (nc) => chiTietKyLuong(nc, k3.id))).conNguoiDuyet === false);
  await nemLoi("Kỳ riêng phải có tên", "zod", () => voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 3, thanhVien: [gd] })));
  const k3L = await voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 3, ten: "Lãnh đạo", thanhVien: [gd] }));
  dat("Tách người khỏi kỳ chung còn nháp → kỳ chung phải tính lại", (await chu.payrollRun.findUniqueOrThrow({ where: { id: k3.id } })).dirty);
  await nemLoi("Một người không thuộc hai kỳ riêng cùng tháng", "nghiep-vu", () => voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 3, ten: "Lãnh đạo 2", thanhVien: [gd, ad] })), "trung-thanh-vien");
  await nemLoi("Chỉ một kỳ chung mỗi tháng", "nghiep-vu", () => voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 3 })), "ky-da-co");
  await voi(T, kt, (nc) => tinhKyLuong(nc, k3.id));
  await voi(T, kt, (nc) => tinhKyLuong(nc, k3L.id));
  dat("Kỳ chung không còn dòng Giám đốc; kỳ riêng chỉ có Giám đốc", (await chu.payrollLine.count({ where: { runId: k3.id, userId: gd } })) === 0 && (await chu.payrollLine.findMany({ where: { runId: k3L.id } })).map((d) => d.userId).join() === gd);
  dat("Kỳ riêng có nhãn tên", (await voi(T, kt, (nc) => chiTietKyLuong(nc, k3L.id))).nhan === "03/2026 — Lãnh đạo");

  // ==================================================================
  console.log("\n— C. QĐ-156: hết thử việc / đổi lương giữa tháng — chia theo công từng phiên bản —");
  const dP = await dong(k3.id, nvP);
  const vP = dP.inputs as unknown as DauVaoLuong;
  const rP = kq(dP);
  dat("Ảnh chụp ghi đủ hai đoạn (01–15/03 thử việc, 16–31/03 chính thức)", vP.doan?.length === 2 && vP.doan[0].tu === "2026-03-01" && vP.doan[0].den === "2026-03-15" && vP.doan[1].tu === "2026-03-16" && vP.doan[0].loaiHopDong === "thu-viec" && vP.doan[1].luongCoBan === 24_000_000, JSON.stringify(vP.doan?.map((x) => [x.tu, x.den, x.cong.thucTe])));
  dat("Công từng đoạn theo ngày công: 11 + 13 / chuẩn 24", vP.doan?.[0].cong.thucTe === 11 && vP.doan?.[1].cong.thucTe === 13 && vP.cong.chuan === 24);
  dat("Lương = 20tr × 85% × 11/24 + 24tr × 13/24 = 7.791.667 + 13.000.000", rP.luongTheoCong === 7_791_667 + 13_000_000, String(rP.luongTheoCong));
  dat("Tăng ca ngày trong đoạn thử việc tính theo lương giờ của đoạn đó (2 giờ × 150%)", rP.tangCa.tien === 265_625, String(rP.tangCa.tien));
  dat("Phụ cấp cố định tháng cộng theo từng đoạn: 275.000 + 325.000", rP.tongPhuCap === 600_000);
  dat("Kiểm lại từ ảnh chụp nhiều đoạn vẫn khớp", (await voi(T, kt, (nc) => kiemLaiPhieuLuong(nc, dP.id))).khop);

  // ==================================================================
  console.log("\n— D. QĐ-157: phụ cấp cố định tháng chia theo công; cờ trả đủ —");
  const rQ = kq(await dong(k3.id, nvQ));
  dat("Vào làm 16/03: lương 12tr × 13/24", rQ.luongTheoCong === 6_500_000, String(rQ.luongTheoCong));
  dat("…phụ cấp điện thoại chia theo công: 600.000 × 13/24 = 325.000", rQ.phuCap.find((p) => p.ma === "dien-thoai")?.soTien === 325_000);
  dat("…phụ cấp gửi xe đánh dấu trả đủ: 200.000", rQ.phuCap.find((p) => p.ma === "gui-xe")?.soTien === 200_000);
  const rR = kq(await dong(k3.id, nvR));
  dat("Nghỉ không lương cả tháng: phụ cấp tháng = 0, không đóng BH", rR.tongPhuCap === 0 && rR.luongTheoCong === 0 && !rR.baoHiem.thamGia);

  // ==================================================================
  console.log("\n— E. QĐ-160 / 161: chụp tài khoản lúc khóa, chặn khóa khi thiếu tài khoản, cảnh báo đổi tài khoản —");
  await voi(T, kt, (nc) => guiDuyetKyLuong(nc, k3.id));
  await voi(T, gd, (nc) => duyetKyLuong(nc, k3.id));
  // 0.22.0 (QĐ-173): thiếu tài khoản KHÔNG còn chặn khóa — dòng đó trả tay. Trước khi khóa, màn hình kỳ lương dự kiến Q
  // vào danh sách "Trả tay"; ở đây Nhân sự bổ sung tài khoản cho Q trước khi khóa nên Q vẫn chuyển khoản.
  const ctTruocKhoa = await voi(T, gd, (nc) => chiTietKyLuong(nc, k3.id));
  dat("0.22.0: người chưa có tài khoản → dự kiến trả tay (không chặn khóa), báo đúng tên", ctTruocKhoa.traTay.ds.some((d) => d.hoTen === "Nhân viên Q") && ctTruocKhoa.traTay.tong > 0);
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvQ, hieuLucTu: "2026-03-16", luongCoBan: 12_000_000, luongDongBH: 12_000_000, phuCap: [{ loaiId: dienThoai.id, soTien: 600_000 }, { loaiId: guiXe.id, soTien: 200_000 }], soTaiKhoan: "0099887766", nganHang: "ACB" })));
  await voi(T, gd, (nc) => khoaKyLuong(nc, k3.id));
  const dQ = await dong(k3.id, nvQ);
  dat("Khóa kỳ: tài khoản chụp vào dòng lương (số, ngân hàng, chủ TK, thời điểm)", dQ.bankAccount === "0099887766" && dQ.bankName === "ACB" && dQ.accountHolder === "Nhân viên Q" && Boolean(dQ.bankCapturedAt));
  // Sau khóa, Nhân sự đổi tài khoản của P → thông báo + kiểm toán che số; file chi kỳ 3 vẫn tài khoản cũ.
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvP, hieuLucTu: "2026-04-01", luongCoBan: 24_000_000, luongDongBH: 24_000_000, phuCap: [{ loaiId: dienThoai.id, soTien: 600_000 }], soTaiKhoan: "9999000011112222", nganHang: "Techcombank" })));
  const tb = await chu.notification.findMany({ where: { userId: nvP, type: "doi-tai-khoan-luong" } });
  dat("QĐ-159: đổi tài khoản → nhân viên nhận thông báo trong ứng dụng (số che, chỉ 4 số cuối)", tb.length === 1 && /\*\*\*\*2222/.test(tb[0].body ?? "") && !(tb[0].body ?? "").includes("9999000011112222"));
  const nkTk = await chu.auditLog.findMany({ where: { tenantId: T, action: "doi-tai-khoan-luong" } });
  const nkP = nkTk.filter((n) => (n.after as { nguoi?: string }).nguoi === nvP);
  dat("…ghi kiểm toán đổi tài khoản (cả lần khai tài khoản đầu cho Q), không lưu số tài khoản đầy đủ",
    nkP.length === 1 && nkTk.length === 2 && !JSON.stringify(nkTk).includes("9999000011112222") && !JSON.stringify(nkTk).includes("0011001234567") && JSON.stringify(nkP[0].after).includes("****2222") && JSON.stringify(nkP[0].before).includes("****4567"));
  const nhXls = await (await voi(T, kt, (nc) => xuatNganHang(nc, k3.id))).text();
  dat("QĐ-164: file chi ngân hàng mặc định là bản Excel", nhXls.includes("<Workbook"));
  dat("QĐ-160: file chi kỳ đã khóa dùng tài khoản ĐÃ CHỤP (cũ), không dùng tài khoản vừa đổi", nhXls.includes("0011001234567") && !nhXls.includes("9999000011112222"));
  const nhCsv = await (await voi(T, kt, (nc) => xuatNganHang(nc, k3.id, "csv"))).text();
  dat("QĐ-164: CSV ghi số tài khoản là chuỗi trong ngoặc kép", nhCsv.includes(',"0011001234567",') && nhCsv.includes(',"0099887766",'), nhCsv.split("\r\n")[1]);
  const ctK3 = await voi(T, kt, (nc) => chiTietKyLuong(nc, k3.id));
  dat("QĐ-161: màn hình kỳ lương cảnh báo người đổi tài khoản trong 30 ngày (P, Q), không cảnh báo người không đổi (R)",
    Boolean(ctK3.dong.find((d) => d.userId === nvP)?.taiKhoanDoiLuc) && Boolean(ctK3.dong.find((d) => d.userId === nvQ)?.taiKhoanDoiLuc) && !ctK3.dong.find((d) => d.userId === nvR)?.taiKhoanDoiLuc);
  // Kỳ riêng: Giám đốc có dòng → không tự duyệt; Quản trị duyệt + khóa.
  await voi(T, kt, (nc) => guiDuyetKyLuong(nc, k3L.id));
  await nemLoi("Kỳ riêng lãnh đạo: Giám đốc không tự duyệt", "nghiep-vu", () => voi(T, gd, (nc) => duyetKyLuong(nc, k3L.id)), "tu-duyet");
  await voi(T, ad, (nc) => duyetKyLuong(nc, k3L.id));
  await voi(T, ad, (nc) => khoaKyLuong(nc, k3L.id));
  dat("Kỳ riêng do Quản trị duyệt và khóa", (await chu.payrollRun.findUniqueOrThrow({ where: { id: k3L.id } })).status === "da-khoa");

  // ==================================================================
  console.log("\n— F. QĐ-163: gửi lại phiếu lương —");
  await voi(T, kt, (nc) => guiEmailPhieuLuong(nc, k3.id));
  await voi(T, kt, (nc) => guiLaiPhieuLuong(nc, dP.id));
  await voi(T, kt, (nc) => guiLaiPhieuLuong(nc, dP.id));
  const thuP = await chu.emailTransactional.findMany({ where: { tenantId: T, kind: "phieu-luong", dedupeKey: { startsWith: `phieu-luong:${dP.id}` } } });
  dat("Mỗi lần gửi lại là một thư mới với khóa chống trùng mới", thuP.length === 3 && new Set(thuP.map((t) => t.dedupeKey)).size === 3);
  dat("…ghi kiểm toán từng lần gửi lại", (await chu.auditLog.count({ where: { tenantId: T, action: "gui-lai-phieu-luong", objectId: dP.id } })) === 2);
  await nemLoi("Nhân sự (không có quyền xuất) không gửi lại được", "quyen", () => voi(T, hr, (nc) => guiLaiPhieuLuong(nc, dP.id)));

  // ==================================================================
  console.log("\n— G. QĐ-158: thu hồi trả thừa kỳ trước — trước thuế / sau thuế —");
  await nemLoi("Khoản điều chỉnh bắt buộc chọn trước / sau thuế", "zod", async () => LuocDoKhoan.parse({ nguoiId: nvQ, chieu: "tru", loai: "dieu-chinh", soTien: 1_000_000, lyDo: "Trả thừa lương tháng 3", kyGocId: k3.id }));
  await nemLoi("Sau thuế không tính vào lương đóng BH", "zod", async () => LuocDoKhoan.parse({ nguoiId: nvQ, chieu: "tru", loai: "dieu-chinh", soTien: 1, cachTinh: "sau-thue", tinhBH: true, lyDo: "Trả thừa lương tháng 3", kyGocId: k3.id }));
  await bangCong(2026, 4, [
    { userId: gd }, { userId: ad }, { userId: nvR },
    { userId: nvQ, dieuChinhCong: [{ ngay: "2026-03-13", cong: 1 }] },
    { userId: nvP, tangCa: { "2026-04-01": 60 }, dieuChinhTangCa: [{ ngay: "2026-03-02", phut: -300 }] },
  ]);
  const k4L = await voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 4, ten: "Lãnh đạo", thanhVien: [gd] }));
  const k4 = await voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 4 }));
  await voi(T, kt, (nc) => themKhoanLuong(nc, k4.id, LuocDoKhoan.parse({ nguoiId: nvQ, chieu: "tru", loai: "dieu-chinh", soTien: 1_000_000, chiuThue: true, cachTinh: "truoc-thue", tinhBH: true, lyDo: "Thu hồi lương tháng 3 trả thừa", kyGocId: k3.id })));
  await voi(T, kt, (nc) => themKhoanLuong(nc, k4.id, LuocDoKhoan.parse({ nguoiId: nvR, chieu: "tru", loai: "dieu-chinh", soTien: 300_000, cachTinh: "sau-thue", lyDo: "Thu hồi tạm ứng tháng 3 trừ thiếu", kyGocId: k3.id })));
  await voi(T, kt, (nc) => tinhKyLuong(nc, k4.id));
  await voi(T, kt, (nc) => tinhKyLuong(nc, k4L.id));
  const rQ4 = kq(await dong(k4.id, nvQ));
  dat("Thu hồi trước thuế: giảm tổng thu nhập và thu nhập chịu thuế 1tr", rQ4.dieuChinhTruocThue === -1_000_000 && rQ4.tongThuNhap === rQ4.luongTheoCong + rQ4.tongPhuCap - 1_000_000 && rQ4.thuNhapChiuThue === rQ4.tongThuNhap - rQ4.phuCapKhongChiuThue);
  dat("…giảm lương đóng BH 1tr (đã chọn tính BH)", rQ4.baoHiem.luongDong === 12_000_000 - 1_000_000, String(rQ4.baoHiem.luongDong));
  const dQ4 = await dong(k4.id, nvQ);
  dat("QĐ-168: công tháng 4 = 24 + 1 công điều chỉnh tháng 3 → phụ cấp điện thoại kẹp ở mức tháng 600.000, có cảnh báo phần chưa trả",
    rQ4.congTinhLuong === 25 && rQ4.phuCap.find((p) => p.ma === "dien-thoai")?.soTien === 600_000 && (dQ4.warnings as unknown as { ma: string; noiDung: string }[]).some((c) => c.ma === "phu-cap-vuot-muc-thang" && /25\.000 đ/.test(c.noiDung)),
    JSON.stringify(rQ4.phuCap));
  const rR4 = kq(await dong(k4.id, nvR));
  dat("Thu hồi sau thuế: thuế / BH như không có khoản, trừ thẳng thực lĩnh", rR4.khoanTru === 300_000 && rR4.dieuChinhTruocThue === 0 && rR4.baoHiem.luongDong === 15_000_000 && rR4.thucLinh === rR4.tongThuNhap - rR4.baoHiem.nld.tong - rR4.thue.tien - 300_000);
  const kh = await chu.payrollItem.findMany({ where: { runId: k4.id }, orderBy: { amount: "desc" } });
  dat("Khoản điều chỉnh lưu cách tính + cờ BH", kh[0].taxStage === "truoc-thue" && kh[0].insurable && kh[1].taxStage === "sau-thue" && !kh[1].insurable);

  // ==================================================================
  console.log("\n— H. QĐ-166: điều chỉnh giảm tăng ca lớn hơn tăng ca kỳ này → chuyển kỳ sau —");
  const dP4 = await dong(k4.id, nvP);
  const rP4 = kq(dP4);
  dat("Tháng 4: 60 phút tăng ca − 300 phút điều chỉnh → không trả tăng ca, không kẹp lặng lẽ", rP4.tangCa.tien === 0 && rP4.tangCaNoChuyenKySau?.thuong === -240, JSON.stringify(rP4.tangCaNoChuyenKySau));
  dat("…có cảnh báo chuyển phần còn lại sang kỳ sau", (dP4.warnings as unknown as { ma: string }[]).some((c) => c.ma === "tang-ca-am-chuyen-ky-sau"));
  await voi(T, kt, (nc) => guiDuyetKyLuong(nc, k4.id));
  await voi(T, gd, (nc) => duyetKyLuong(nc, k4.id));
  await voi(T, gd, (nc) => khoaKyLuong(nc, k4.id));
  dat("Khoản thu hồi được duyệt cùng kỳ (người duyệt ghi trên khoản)", (await chu.payrollItem.findMany({ where: { runId: k4.id } })).every((k) => k.approvedBy === gd));
  await bangCong(2026, 5, [{ userId: nvP, tangCa: { "2026-05-04": 300 } }, { userId: gd }, { userId: ad }, { userId: nvQ }, { userId: nvR }]);
  const k5 = await voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 5 }));
  await voi(T, kt, (nc) => tinhKyLuong(nc, k5.id));
  const dP5 = await dong(k5.id, nvP);
  const vP5 = dP5.inputs as unknown as DauVaoLuong;
  const rP5 = kq(dP5);
  dat("Tháng 5: nợ −240 phút của kỳ 4 (đã khóa) chuyển sang, ghi trong ảnh chụp", vP5.cong.tangCaNoKyTruoc?.thuong === -240);
  dat("…tăng ca tháng 5 chỉ trả 300 − 240 = 60 phút", rP5.tangCa.chiTiet.find((c) => c.loai === "thuong")?.phut === 60 && rP5.tangCaNoChuyenKySau === null, JSON.stringify(rP5.tangCa.chiTiet));
  // QĐ-169: tháng 6 khi kỳ tháng 5 chưa khóa → nợ lấy từ kỳ ĐÃ KHÓA GẦN NHẤT (tháng 4) + cảnh báo.
  await bangCong(2026, 6, [{ userId: nvP }, { userId: gd }, { userId: ad }, { userId: nvQ }, { userId: nvR }]);
  const k6 = await voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 6 }));
  const r6 = await voi(T, kt, (nc) => tinhKyLuong(nc, k6.id));
  const vP6 = (await dong(k6.id, nvP)).inputs as unknown as DauVaoLuong;
  dat("QĐ-169: tháng 5 chưa khóa → nợ tăng ca lấy từ kỳ đã khóa gần nhất (tháng 4: −240 phút)", vP6.cong.tangCaNoKyTruoc?.thuong === -240, JSON.stringify(vP6.cong.tangCaNoKyTruoc));
  dat("…kèm cảnh báo kỳ tháng trước chưa khóa", r6.canhBao.some((c) => c.ma === "ky-truoc-chua-khoa"));
  await nemLoi("Kỳ chung đã gửi duyệt có dòng người được chọn → không tách sang kỳ riêng", "nghiep-vu", async () => {
    await voi(T, kt, (nc) => guiDuyetKyLuong(nc, k5.id)).catch(() => undefined);
    await chu.payrollRun.update({ where: { id: k5.id }, data: { status: "cho-duyet", submittedAt: MOC, submittedBy: kt } });
    return voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 5, ten: "Lãnh đạo", thanhVien: [gd] }));
  }, "da-co-dong-ky-chung");

  await chu.$disconnect();
  ketLuan("Chính sách lương sau QA (QĐ-156 → QĐ-166)");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
