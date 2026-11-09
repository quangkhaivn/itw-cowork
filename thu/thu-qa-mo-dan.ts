import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu, LoiDinhDang } from "../src/lib/loi";
import { seedLichMacDinh, seedNenMong } from "../prisma/seed/index";
import { apCongTay, cacNgayTrongThang, thuTrongTuan } from "../src/modules/cham-cong/tinh-toan";
import { anhXaPin, cheSoSeri, danhSachMayLa, danhSachPinChuaKhop, huyDangKyMay, nhapCsvAnhXaPin, taoMay, xuLyAdms } from "../src/modules/cham-cong/may-cham-cong";
import { khoaBangCong } from "../src/modules/cham-cong/bang-cong";
import { datLichMacDinh } from "../src/modules/nhan-su/service";
import { lichCuaNhieuNguoi } from "../src/modules/cham-cong/chung";
import { datCongTay } from "../src/modules/cham-cong/cong-tay";
import { LuocDoDatCongTay } from "../src/modules/cham-cong/luoc-do";
import { nhapCsvHoSoLuong, suaNguoiPhuThuoc, taoHoSoLuong } from "../src/modules/luong/ho-so";
import { LuocDoCongTayLuong, LuocDoHoSoLuong } from "../src/modules/luong/luoc-do";
import {
  chiTietKyLuong,
  duyetKyLuong,
  guiDuyetKyLuong,
  khoaKyLuong,
  layLaiCongTuBangCong,
  nhapCongTayLuong,
  taoKyLuong,
  tinhKyLuong,
  xoaCongTayLuong,
} from "../src/modules/luong/service";
import { xuatButToan, xuatNganHang, xuatTraTay } from "../src/modules/luong/xuat";
import { daChiKyLuong } from "../src/modules/luong/service";
import { viecThietLap } from "../src/modules/thiet-lap-ban-dau/service";
import type { KetQuaLuong } from "../src/modules/luong/tinh-toan";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/** Vấn đề đã báo nhưng chờ quyết định chính sách — in ra, không làm hỏng bài. */
function tonDong(ten: string, conTonTai: boolean, chiTiet = "") {
  console.log(conTonTai ? `  ⚠ TỒN ĐỌNG (chờ chính sách): ${ten}${chiTiet ? ` — ${chiTiet}` : ""}` : `  ✓ (đã đóng) ${ten}`);
}

/**
 * QA 0.22.0 — "Mở dần — bổ sung sau": việc nới lỏng (chặn → cảnh báo) không được mở lỗ hổng toàn vẹn / bảo mật. Mỗi lỗi
 * QA tìm được có một bài tái hiện ở đây (đạt = đã sửa). Chạy: npm run thu:qa-mo-dan (nối cuối thu:tich-hop).
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Math.floor(performance.timeOrigin).toString(36);
const NGAY = (s: string) => new Date(`${s}T00:00:00.000Z`);
const MOC = new Date("2026-03-02T03:00:00Z");
const IP_A = `192.0.2.${(Number.parseInt(DAU.slice(-2), 36) % 200) + 20}`;
const IP_B = "203.0.113.77";

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>, ip: string | null = IP_B): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, ip, "thu-qa-mo-dan"));
  });
}

type KieuLoi = "nghiep-vu" | "quyen" | "khong-thay" | "csdl" | "bat-ky";
async function nemLoi(ten: string, kieu: KieuLoi, khoi: () => Promise<unknown>, ma?: string | string[]): Promise<void> {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu =
      kieu === "bat-ky" ? true
      : kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "csdl" ? !(e instanceof LoiNghiepVu) && !(e instanceof LoiThieuQuyen)
      : e instanceof LoiNghiepVu;
    const dsMa = ma === undefined ? null : Array.isArray(ma) ? ma : [ma];
    const dungMa = !dsMa || (e instanceof LoiNghiepVu && dsMa.includes(e.ma ?? ""));
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}

async function main() {
  console.log("=== QA 0.22.0 — Mở dần, bổ sung sau ===\n");
  const T = (await seedNenMong(chu, `qa-md-${DAU}`, "Doanh nghiệp QA mở dần")).id;
  const T2 = (await seedNenMong(chu, `qa-md2-${DAU}`, "Doanh nghiệp QA mở dần 2")).id;
  // QĐ-181: bài này thử máy chấm công sau khi đã tin máy — tắt xác minh sở hữu cho hai doanh nghiệp thử (xác minh thử ở thu-mo-dan).
  for (const t of [T, T2]) await chu.tenantSetting.create({ data: { tenantId: t, key: "may_cham_cong.xac_minh_so_huu", value: 0 } });
  await seedLichMacDinh(chu, T, "2025-01-01");
  const vaiTro = async (code: string, t = T) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: t, code } } })).id;
  async function nguoi(ten: string, vai: string, o: { hai?: boolean; t?: string } = {}) {
    const t = o.t ?? T;
    const u = await chu.user.create({
      data: {
        tenantId: t, email: `${ten}.${DAU}@qa.test`, passwordHash: "x", fullName: ten,
        ...(o.hai ? { totpEnabledAt: MOC, totpSecretEnc: "v1:thu" } : {}),
        userRoles: { create: { tenantId: t, roleId: await vaiTro(vai, t) } },
        staffProfile: { create: { tenantId: t, hiredAt: NGAY("2025-01-01") } },
      },
    });
    return u.id;
  }
  const gd = await nguoi("giam-doc", "ceo", { hai: true });
  const kt = await nguoi("ke-toan", "finance", { hai: true });
  const hr = await nguoi("nhan-su", "nhan-su-hr", { hai: true });
  const hr2 = await nguoi("nhan-su-2", "nhan-su-hr", { hai: true });
  const nvA = await nguoi("nhan-vien-a", "sales");
  const nvB = await nguoi("nhan-vien-b", "sales");
  const ktv = await nguoi("ky-thuat-vien", "technical");
  const ktvT2 = await nguoi("ky-thuat-vien-t2", "technical", { t: T2 });
  const hs = (o: Partial<Record<string, unknown>> & { nguoiId: string }) =>
    LuocDoHoSoLuong.parse({ hieuLucTu: "2026-01-01", loaiHopDong: "chinh-thuc", cachTra: "thang", luongCoBan: 10_000_000, luongDongBH: 0, phuongPhapThue: "luy-tien", ...o });
  const congTay = (o: Record<string, unknown>) => LuocDoCongTayLuong.parse({ lyDo: "Bảng chấm công giấy của phòng", ...o });

  // ==================================================================
  console.log("— L. Lương khi nới lỏng —");
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvA, luongCoBan: 22_000_000, soTaiKhoan: "1111222233", nganHang: "VCB", chuTaiKhoan: "NGUYEN VAN A" })));
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvB, luongCoBan: 11_000_000, soTaiKhoan: "4444555566", nganHang: "ACB" })));
  await voi(T, hr2, (nc) => taoHoSoLuong(nc, hs({ nguoiId: hr, luongCoBan: 15_000_000, soTaiKhoan: "7777888899", nganHang: "TCB" })));
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: kt, luongCoBan: 15_000_000, soTaiKhoan: "1212121212", nganHang: "TCB" })));
  const so3 = cacNgayTrongThang(2026, 3).filter((d) => thuTrongTuan(d) < 5).length;
  const k3 = await voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 3 }));

  // L1: tự bỏ công nhập tay của chính mình → dòng của mình quay về "mặc định đủ công chuẩn".
  await voi(T, kt, (nc) => nhapCongTayLuong(nc, k3.id, congTay({ nguoiId: hr, soNgayCong: 5, lyDo: "Nghỉ 3 tuần, theo bảng giấy" })));
  await nemLoi("L1: Nhân sự KHÔNG tự bỏ công nhập tay của chính mình (đường vòng về mặc định đủ công)", "nghiep-vu",
    () => voi(T, hr, (nc) => xoaCongTayLuong(nc, k3.id, hr)), "tu-nhap-cong");
  dat("…công nhập tay của Nhân sự còn nguyên", (await chu.payrollManualInput.count({ where: { runId: k3.id, userId: hr } })) === 1);
  await voi(T, kt, (nc) => xoaCongTayLuong(nc, k3.id, hr));
  dat("…người khác (Kế toán) bỏ được", (await chu.payrollManualInput.count({ where: { runId: k3.id, userId: hr } })) === 0);

  // L2: số công nhập tay vượt công chuẩn → phải có cảnh báo riêng (không chỉ "Công nhập tay: 31 công").
  await voi(T, hr, (nc) => nhapCongTayLuong(nc, k3.id, congTay({ nguoiId: nvA, soNgayCong: 31 })));
  await voi(T, kt, (nc) => tinhKyLuong(nc, k3.id));
  const lA = await chu.payrollLine.findFirstOrThrow({ where: { runId: k3.id, userId: nvA } });
  const kqA = lA.result as unknown as KetQuaLuong;
  dat(`L2: công nhập tay 31 > công chuẩn ${so3} → cảnh báo “vượt công chuẩn” trên dòng`,
    (lA.warnings as { ma: string }[]).some((c) => c.ma === "cong-tay-vuot-chuan"), `lương theo công ${kqA.luongTheoCong}, cảnh báo ${JSON.stringify((lA.warnings as { ma: string }[]).map((c) => c.ma))}`);
  await voi(T, hr, (nc) => nhapCongTayLuong(nc, k3.id, congTay({ nguoiId: nvA, soNgayCong: so3 - 1 })));

  // L3: bảng công NHÁP đã ghi vắng mà lương vẫn "mặc định đủ công" → cảnh báo phải chỉ ra chênh lệch.
  const bc3 = await chu.timesheet.create({ data: { tenantId: T, year: 2026, month: 3, generatedAt: MOC, generatedBy: hr, feedbackDeadline: MOC } });
  const ngay3 = cacNgayTrongThang(2026, 3).filter((x) => thuTrongTuan(x) < 5);
  for (const d of ngay3) {
    await chu.timesheetRow.create({
      data: { tenantId: T, timesheetId: bc3.id, userId: nvB, workDate: NGAY(d), isAdjustment: false, dayType: "thuong", expectedValue: 1, workValue: d < "2026-03-16" ? 0 : 1, flags: d < "2026-03-16" ? ["vang"] : [] },
    });
  }
  await voi(T, kt, (nc) => tinhKyLuong(nc, k3.id));
  const lB = await chu.payrollLine.findFirstOrThrow({ where: { runId: k3.id, userId: nvB } });
  const wB = lB.warnings as { ma: string; noiDung: string }[];
  // QĐ-183 (chính sách sau QA): có bảng công nháp → dùng làm nguồn công TẠM (không còn "mặc định đủ công") + cảnh báo.
  const kqB = lB.result as unknown as KetQuaLuong;
  dat("L3 (QĐ-183): bảng công nháp ghi B vắng nửa tháng → lương lấy công TẠM từ bảng nháp (nguồn bang-cong-nhap) + cảnh báo",
    (lB.inputs as { nguon: { nguonCong: string } }).nguon.nguonCong === "bang-cong-nhap" && wB.some((c) => c.ma === "cong-bang-nhap") && kqB.congTinhLuong === ngay3.filter((d) => d >= "2026-03-16").length,
    `${JSON.stringify(wB.map((c) => c.ma))} công ${kqB.congTinhLuong}`);
  await chu.timesheetRow.deleteMany({ where: { timesheetId: bc3.id } });
  await chu.timesheet.delete({ where: { id: bc3.id } });

  // L4: đổi sang tiền mặt (giữ nguyên tài khoản) né cảnh báo đổi tài khoản (QĐ-159 / QĐ-161).
  const tbTruoc = await chu.notification.count({ where: { userId: nvB } });
  await voi(T, hr, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvB, hieuLucTu: "2026-03-01", luongCoBan: 11_000_000, soTaiKhoan: "4444555566", nganHang: "ACB", hinhThucTra: "tien-mat" })));
  dat("L4: đổi hình thức nhận lương sang tiền mặt → báo chính nhân viên (như đổi tài khoản, QĐ-159)",
    (await chu.notification.count({ where: { userId: nvB } })) > tbTruoc);
  dat("…ghi kiểm toán đổi tài khoản / hình thức nhận lương", (await chu.auditLog.count({ where: { tenantId: T, action: "doi-tai-khoan-luong", after: { path: ["nguoi"], equals: nvB } } })) >= 1);
  await voi(T, kt, (nc) => tinhKyLuong(nc, k3.id));
  const ct3 = await voi(T, gd, (nc) => chiTietKyLuong(nc, k3.id), IP_B);
  dat("…màn hình duyệt gắn cờ “mới đổi” trên dòng B (QĐ-161)", Boolean(ct3.dong.find((d) => d.userId === nvB)?.taiKhoanDoiLuc));

  // L5: tổng file ngân hàng + tổng trả tay = tổng thực lĩnh; bút toán 1121 / 1111.
  await voi(T, kt, (nc) => guiDuyetKyLuong(nc, k3.id));
  await nemLoi("G1: người tính (Kế toán) không duyệt", "bat-ky", () => voi(T, kt, (nc) => duyetKyLuong(nc, k3.id)));
  await nemLoi("G1: Nhân sự có dòng trong kỳ không duyệt (không có quyền duyệt)", "quyen", () => voi(T, hr, (nc) => duyetKyLuong(nc, k3.id)));
  await voi(T, gd, (nc) => duyetKyLuong(nc, k3.id));
  await voi(T, gd, (nc) => khoaKyLuong(nc, k3.id));
  const run3 = await chu.payrollRun.findUniqueOrThrow({ where: { id: k3.id } });
  dat("L0: khóa được kỳ lương tính KHÔNG có bảng công (trước đây vi phạm CHECK payroll_runs_buoc_check → lỗi 500)", run3.status === "da-khoa" && run3.timesheetId === null);
  const dong3 = await chu.payrollLine.findMany({ where: { runId: k3.id } });
  const tongNet = dong3.reduce((a, d) => a + (d.netPay > 0n ? d.netPay : 0n), 0n);
  const tongCk = dong3.filter((d) => d.payMethod === "chuyen-khoan" && d.netPay > 0n).reduce((a, d) => a + d.netPay, 0n);
  const tongTay = dong3.filter((d) => d.payMethod === "tien-mat" && d.netPay > 0n).reduce((a, d) => a + d.netPay, 0n);
  const nh = await (await voi(T, kt, (nc) => xuatNganHang(nc, k3.id, "csv"))).text();
  const tay = await (await voi(T, kt, (nc) => xuatTraTay(nc, k3.id, "csv"))).text();
  dat("L5: chuyển khoản + trả tay = tổng thực lĩnh; B (tiền mặt) không có trong file ngân hàng, có trong danh sách trả tay",
    tongCk + tongTay === tongNet && !nh.includes("4444555566") && tay.includes("nhan-vien-b") && tay.includes(String(tongTay)));
  await voi(T, kt, (nc) => daChiKyLuong(nc, k3.id));
  const bt = await (await voi(T, kt, (nc) => xuatButToan(nc, k3.id))).text();
  dat("…bút toán chi: 334/1121 = chuyển khoản, 334/1111 = trả tay", bt.includes(`,334,1121,${tongCk}`) && bt.includes(`,334,1111,${tongTay}`), bt);
  await nemLoi("G2: kỳ đã khóa → công nhập tay bất biến (trigger, kể cả chủ sở hữu)", "csdl",
    () => chu.payrollManualInput.updateMany({ where: { runId: k3.id }, data: { otMinutes: 600 } }));
  await nemLoi("G2: …không thêm công nhập tay vào kỳ đã khóa (trigger)", "csdl",
    () => chu.payrollManualInput.create({ data: { tenantId: T, runId: k3.id, userId: nvB, reason: "thu sau khoa", createdBy: gd, updatedAt: new Date() } }));
  await nemLoi("G2: …API nhập công vào kỳ đã khóa bị chặn", "nghiep-vu", () => voi(T, hr, (nc) => nhapCongTayLuong(nc, k3.id, congTay({ nguoiId: nvB, soNgayCong: 1 }))));

  // L6: đồng thời — "Lấy lại công từ bảng công" chạy cùng lúc gửi duyệt.
  const k4 = await voi(T, kt, (nc) => taoKyLuong(nc, { nam: 2026, thang: 4 }));
  await voi(T, hr, (nc) => nhapCongTayLuong(nc, k4.id, congTay({ nguoiId: nvA, soNgayCong: 10 })));
  await voi(T, kt, (nc) => tinhKyLuong(nc, k4.id));
  const bc4 = await chu.timesheet.create({ data: { tenantId: T, year: 2026, month: 4, generatedAt: MOC, generatedBy: hr, feedbackDeadline: MOC } });
  for (const d of cacNgayTrongThang(2026, 4).filter((x) => thuTrongTuan(x) < 5)) {
    await chu.timesheetRow.create({ data: { tenantId: T, timesheetId: bc4.id, userId: nvA, workDate: NGAY(d), isAdjustment: false, dayType: "thuong", expectedValue: 1, workValue: 1, flags: [] } });
  }
  await chu.timesheet.update({ where: { id: bc4.id }, data: { status: "da-khoa", lockedAt: MOC, lockedBy: hr } });
  const kqDt = await Promise.allSettled([voi(T, kt, (nc) => layLaiCongTuBangCong(nc, k4.id)), voi(T, kt, (nc) => guiDuyetKyLuong(nc, k4.id))]);
  const run4 = await chu.payrollRun.findUniqueOrThrow({ where: { id: k4.id } });
  const lA4 = await chu.payrollLine.findFirstOrThrow({ where: { runId: k4.id, userId: nvA } });
  const nguonA4 = (lA4.inputs as { nguon: { nguonCong: string } }).nguon.nguonCong;
  const conTay4 = await chu.payrollManualInput.count({ where: { runId: k4.id } });
  dat("L6: lấy lại công ‖ gửi duyệt → kết quả nhất quán (chờ duyệt thì dòng đúng nguồn lúc gửi; nháp thì đã lấy bảng công)",
    kqDt.every((k) => k.status === "fulfilled" || k.reason instanceof LoiNghiepVu) &&
      ((run4.status === "cho-duyet" && !run4.dirty && (nguonA4 === "bang-cong" ? conTay4 === 0 : conTay4 === 1)) || (run4.status === "nhap" && nguonA4 === "bang-cong" && conTay4 === 0)),
    `${run4.status} ${nguonA4} congTay=${conTay4} ${kqDt.map((k) => k.status === "rejected" ? String(k.reason?.message) : "ok").join(" | ")}`);

  // L7: nhập CSV hồ sơ lương.
  const csv = [
    "Email,Lương cơ bản,Số tài khoản,Ngân hàng,Số người phụ thuộc,% thử việc",
    `nhan-vien-a.${DAU}@qa.test,23000000,9999000011,VCB,,`,
    `ky-thuat-vien-t2.${DAU}@qa.test,9000000,,,,`,
    `ke-toan.${DAU}@qa.test,9000000,,=HYPERLINK("x"),,`,
    `nhan-vien-a.${DAU}@qa.test,1,,,,`,
    `nhan-su.${DAU}@qa.test,99000000,,,,`,
    `ky-thuat-vien.${DAU}@qa.test,"8000000",,"@SUM(1)",,`,
  ].join("\n");
  const xt = await voi(T, hr, (nc) => nhapCsvHoSoLuong(nc, csv, false, "2026-05-01"));
  const loiDong = (n: number) => xt.loi.find((l) => l.soDong === n)?.lyDo ?? "";
  dat("L7: CSV — email doanh nghiệp khác, ô công thức (=, @), dòng trùng, tự nhập hồ sơ của mình: lỗi theo dòng; 1 dòng hợp lệ",
    xt.hopLe.length === 1 && /Không có nhân viên/.test(loiDong(3)) && /công thức/.test(loiDong(4)) && /Trùng/.test(loiDong(5)) && /chính mình/.test(loiDong(6)) && /công thức/.test(loiDong(7)),
    JSON.stringify(xt.loi));
  await voi(T, hr, (nc) => nhapCsvHoSoLuong(nc, csv, true, "2026-05-01"));
  const hsA = await chu.salaryProfile.findFirstOrThrow({ where: { userId: nvA }, orderBy: { createdAt: "desc" } });
  dat("L7b: CSV đổi số tài khoản → không mang tên chủ tài khoản của tài khoản CŨ sang tài khoản mới",
    hsA.bankAccount === "9999000011" && hsA.accountHolder === null, `${hsA.bankAccount} / ${hsA.accountHolder}`);

  // ==================================================================
  console.log("\n— C. Chấm công —");
  const ccNgay = apCongTay({ vaoDau: null, raCuoi: null, giaTriCong: 0, phutMuon: 0, phutSom: 0, nghiNgay: 1, co: ["nghi-phep"] }, 1);
  dat("C1: đặt công tay 1 cho ngày đã nghỉ phép cả ngày → không trả hai lần (công + nghỉ ≤ 1)", ccNgay.giaTriCong + ccNgay.nghiNgay <= 1, JSON.stringify(ccNgay));
  const ccNua = apCongTay({ vaoDau: null, raCuoi: null, giaTriCong: 0.5, phutMuon: 0, phutSom: 0, nghiNgay: 0.5, co: [] }, 1);
  dat("…nghỉ nửa ngày + đặt 1 → công còn 0,5", ccNua.giaTriCong === 0.5, JSON.stringify(ccNua));

  // C2: lịch mặc định không ghi đè người đã có lần gán (kể cả gán từ tháng sau); người vào làm giữa tháng tính từ ngày vào.
  const lichRieng = await chu.workSchedule.create({ data: { tenantId: T, code: `rieng-${DAU}`, name: "Lịch riêng", shiftId: (await chu.workShift.findFirstOrThrow({ where: { tenantId: T } })).id, days: ["ca", "ca", "ca", "ca", "ca", "ca", "nghi"] } });
  await chu.scheduleAssignment.create({ data: { tenantId: T, userId: nvB, scheduleId: lichRieng.id, effectiveFrom: NGAY("2026-12-01"), createdBy: hr } });
  await chu.staffProfile.update({ where: { userId: nvA }, data: { hiredAt: NGAY("2026-11-16") } });
  const lich11 = await voiTenant(T, (tx) => lichCuaNhieuNguoi(tx, [nvA, nvB], "2026-12-31"));
  dat("C2: người đã được gán lịch từ tháng sau KHÔNG bị lịch mặc định ghi đè (tháng này không có lịch)", lich11.get(nvB)!("2026-11-10") === null && lich11.get(nvB)!("2026-12-05")?.scheduleId === lichRieng.id);
  dat("…người vào làm giữa tháng: lịch mặc định từ ngày vào làm", lich11.get(nvA)!("2026-11-13") === null && lich11.get(nvA)!("2026-11-16")?.macDinh === true);
  await chu.staffProfile.update({ where: { userId: nvA }, data: { hiredAt: NGAY("2025-01-01") } });

  // C3: đặt công tay — phạm vi (vai trò tự tạo có cham_cong.update phạm vi "team").
  const vaiTeam = await chu.role.create({ data: { tenantId: T, code: `cc-team-${DAU}`, name: "Chấm công nhóm", isBuiltIn: false } });
  for (const ma of ["cham_cong.view", "cham_cong.update"]) {
    const pq = await chu.permission.findUniqueOrThrow({ where: { code: ma } });
    await chu.rolePermission.create({ data: { tenantId: T, roleId: vaiTeam.id, permissionId: pq.id, dataScope: "team" } });
  }
  const tn = await chu.user.create({ data: { tenantId: T, email: `truong-nhom.${DAU}@qa.test`, passwordHash: "x", fullName: "truong-nhom", userRoles: { create: { tenantId: T, roleId: vaiTeam.id } }, staffProfile: { create: { tenantId: T, hiredAt: NGAY("2025-01-01") } } } });
  await nemLoi("C3: người có cham_cong.update phạm vi nhóm không đặt công tay cho người ngoài nhóm", "khong-thay",
    () => voi(T, tn.id, (nc) => datCongTay(nc, LuocDoDatCongTay.parse({ nguoiId: nvB, ngay: "2026-11-02", cong: 1, lyDo: "Làm ở công trình" }), "2026-11-09")));

  // ==================================================================
  console.log("\n— Q. Quyền máy chấm công (Kỹ thuật) —");
  const SN = `QA${DAU.toUpperCase()}`.slice(0, 20);
  const BAY = new Date("2026-11-03T02:00:00Z");
  const adms = (phuongThuc: string, doan: string, ts: string, than: string | null = null, ip = IP_A) =>
    xuLyAdms({ phuongThuc, doan, truyVan: new URLSearchParams(ts), than, ip }, { bayGio: () => BAY });
  const may = await voi(T, ktv, (nc) => taoMay(nc, { soSeri: SN, ten: "Máy QA", diaDiemId: null, ipChoPhep: [] }));
  await adms("POST", "cdata", `SN=${SN}&table=ATTLOG&Stamp=1`, "8801\t2026-11-03 08:00:00\t0\t1\t0\t0\n8801\t2026-11-03 17:00:00\t1\t1\t0\t0\n8802\t2026-11-03 08:01:00\t0\t1\t0\t0\n");
  // PIN 8802 đã gán cho A nhưng lần chấm trước ngày vào làm → còn trong danh sách kèm "người đã gán".
  await chu.staffProfile.update({ where: { userId: nvA }, data: { attendancePin: "8802", hiredAt: NGAY("2026-11-04") } });
  const dsPin = await voi(T, ktv, (nc) => danhSachPinChuaKhop(nc));
  const p8802 = dsPin.find((p) => p.pin === "8802");
  dat("Q1: Kỹ thuật xem PIN chưa khớp — chỉ thấy TÊN người đã gán, không thấy ngày vào làm (hồ sơ nhân sự)",
    Boolean(p8802?.nguoiDaGan) && p8802!.nguoiDaGan!.hoTen === "nhan-vien-a" && !("ngayVaoLam" in p8802!.nguoiDaGan! && p8802!.nguoiDaGan!.ngayVaoLam), JSON.stringify(p8802));
  dat("…Nhân sự vẫn thấy ngày vào làm", (await voi(T, hr, (nc) => danhSachPinChuaKhop(nc))).find((p) => p.pin === "8802")?.nguoiDaGan?.ngayVaoLam === "2026-11-04");
  await chu.staffProfile.update({ where: { userId: nvA }, data: { hiredAt: NGAY("2025-01-01") } });
  await nemLoi("Q2: Kỹ thuật KHÔNG tự gán PIN có lần chấm chưa khớp cho chính mình (nhận công của người khác)", "nghiep-vu",
    () => voi(T, ktv, (nc) => anhXaPin(nc, { pin: "8801", nguoiId: ktv })), "khong-tu-gan-pin");
  dat("…lần chấm của PIN 8801 vẫn chưa khớp", (await chu.attendancePunch.count({ where: { tenantId: T, pin: "8801", userId: null } })) === 2);
  const gan = await voi(T, hr, (nc) => anhXaPin(nc, { pin: "8801", nguoiId: ktv }));
  dat("…Nhân sự gán cho Kỹ thuật được", gan.soLanCham === 2);
  const csvPin = `Mã chấm công,Email\n8805,ky-thuat-vien.${DAU}@qa.test\n8806,nhan-vien-b.${DAU}@qa.test\n8807,nhan-vien-b.${DAU}@qa.test\n`;
  const xtPin = await voi(T, hr, (nc) => nhapCsvAnhXaPin(nc, csvPin, false));
  dat("Q2b: CSV ánh xạ PIN — một người hai dòng (hai PIN) báo lỗi ngay ở xem trước, không để lúc ghi hỏng cả lô",
    xtPin.hopLe.length === 1 && xtPin.loi.some((l) => l.soDong === 4 && /trùng dòng 3/.test(l.lyDo)), JSON.stringify(xtPin));
  const xtTu = await voi(T, ktv, (nc) => nhapCsvAnhXaPin(nc, csvPin, false));
  dat("…CSV: Kỹ thuật tự gán PIN cho mình → lỗi dòng", xtTu.loi.some((l) => l.soDong === 2 && /chính mình/.test(l.lyDo)));
  await nemLoi("Q3: Kỹ thuật không đọc thẳng hồ sơ nhân sự qua ánh xạ PIN áp kỳ khóa (cần cham_cong.approve)", "quyen",
    () => voi(T, ktv, (nc) => anhXaPin(nc, { pin: "8803", nguoiId: nvB, apCaKyDaKhoa: true })));

  // ==================================================================
  console.log("\n— M. Máy lạ (QĐ-175) —");
  // M1: SN đã đăng ký ở doanh nghiệp A — doanh nghiệp B đăng ký bản chữ thường / hoa khác.
  await nemLoi("M1: doanh nghiệp B không đăng ký trùng SN của A (khác hoa / thường)", "bat-ky",
    () => voi(T2, ktvT2, (nc) => taoMay(nc, { soSeri: SN.toLowerCase(), ten: "Chiếm", diaDiemId: null, ipChoPhep: [] })));
  // M2: máy lạ gọi từ văn phòng A; B ở IP khác không thấy, kể cả khi B có máy đăng ký ở IP khác.
  const SNLA = `QL${DAU.toUpperCase()}`.slice(0, 20);
  await adms("GET", "cdata", `SN=${SNLA}&options=all`, null, IP_A);
  dat("M2: B ở IP khác không thấy máy lạ đang gọi từ văn phòng A (dù A đã có máy ở IP đó)",
    !(await voi(T2, ktvT2, (nc) => danhSachMayLa(nc), IP_B)).some((m) => m.soSeri === SNLA));
  dat("…A thấy (IP máy đã đăng ký của A) — SN che", (await voi(T, ktv, (nc) => danhSachMayLa(nc), IP_B)).some((m) => m.soSeri === cheSoSeri(SNLA)));
  // M3: hàm SECURITY DEFINER không bị che bởi bảng tạm (pg_temp) của phiên ứng dụng.
  let thayQuaBangTam = false;
  let loiBangTam = "";
  try {
    thayQuaBangTam = await voiTenant(T2, async (tx) => {
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE attendance_devices (serial_number text, tenant_id uuid, last_ip text) ON COMMIT DROP`);
      await tx.$executeRawUnsafe(`GRANT ALL ON pg_temp.attendance_devices TO PUBLIC`);
      await tx.$executeRawUnsafe(`INSERT INTO pg_temp.attendance_devices VALUES ('ZZZZ', '${T2}', '${IP_A}')`);
      const r = await tx.$queryRawUnsafe<{ serial_number: string }[]>(`SELECT serial_number FROM public.ds_may_la(NULL, NULL)`);
      return r.some((x) => x.serial_number === SNLA);
    });
  } catch (e) {
    loiBangTam = e instanceof Error ? e.message : String(e);
  }
  dat("M3: bảng tạm trùng tên trong phiên ứng dụng không che được bảng thật trong ds_may_la (search_path có pg_temp cuối)", !thayQuaBangTam && !loiBangTam, loiBangTam);
  // M4: trần dòng máy lạ trong CSDL không phụ thuộc tham số p_tran do ứng dụng truyền.
  const daCo = await chu.attendanceUnknownDevice.count();
  const can = Math.max(0, 500 - daCo);
  if (can > 0) await chu.attendanceUnknownDevice.createMany({ data: Array.from({ length: can }, (_, i) => ({ serialNumber: `QAF${DAU.toUpperCase()}${i}`.slice(0, 64), lastIp: "198.18.0.1" })) });
  const ghiVuot = await voiTenant(T, async (tx) => (await tx.$queryRaw<{ ok: boolean }[]>`SELECT public.ghi_may_la(${`QAX${DAU.toUpperCase()}`}, '198.18.0.2', NULL, 1000000) AS ok`)[0]?.ok);
  dat("M4: ghi_may_la giữ trần 500 dòng dù tham số p_tran truyền lớn", ghiVuot === false && (await chu.attendanceUnknownDevice.count()) <= 500, String(ghiVuot));
  await chu.attendanceUnknownDevice.deleteMany({ where: { serialNumber: { startsWith: `QA` } } });
  await chu.attendanceUnknownDevice.deleteMany({ where: { lastIp: { in: ["198.18.0.1", "198.18.0.2"] } } });
  // M5: flood qua /iclock bị trần theo IP trước khi tra SN.
  let bi429 = false;
  for (let i = 0; i < 700 && !bi429; i++) {
    const r = await adms("GET", "cdata", `SN=QAR${i}${DAU.toUpperCase()}`.slice(0, 40), null, "198.18.9.9");
    if (r.status === 429) bi429 = true;
  }
  dat("M5: gọi /iclock với SN rác hàng loạt từ một IP → bị trần 429", bi429);
  await chu.attendanceUnknownDevice.deleteMany({ where: { lastIp: "198.18.9.9" } });
  void may;

  // ==================================================================
  console.log("\n— T. Thiết lập ban đầu —");
  const vT2 = await voi(T2, ktvT2, (nc) => viecThietLap(nc), IP_B);
  dat("T1: Kỹ thuật doanh nghiệp B chỉ thấy nhóm Kỹ thuật, đếm máy của B (0) — không thấy máy / máy lạ của A",
    vT2.nhom.map((n) => n.ma).join() === "ky-thuat" && vT2.nhom[0].viec.find((v) => v.ma === "may-cham-cong")!.conThieu === 1 && vT2.nhom[0].viec.find((v) => v.ma === "may-la")!.conThieu === 0);
  dat("T2: không trả số tiền / tên người", !JSON.stringify(await voi(T, gd, (nc) => viecThietLap(nc))).match(/nhan-vien|22000000|\d{7,}/));

  // ==================================================================
  console.log("\n— G. RLS các bảng mới —");
  dat("G3: doanh nghiệp B không đọc được công nhập tay / đặt công tay của A", (await voiTenant(T2, (tx) => tx.payrollManualInput.count())) === 0 && (await voiTenant(T2, (tx) => tx.attendanceManualDay.count())) === 0);
  await nemLoi("G3: …không ghi đặt công tay mang tenant_id của A từ phiên B (RLS WITH CHECK)", "csdl",
    () => voiTenant(T2, (tx) => tx.attendanceManualDay.create({ data: { tenantId: T, userId: nvA, workDate: NGAY("2026-02-02"), workValue: 1, reason: "chen cheo tenant", createdBy: ktvT2 } })));

  // ==================================================================
  console.log("\n— V2. Vòng QA 2: xác minh sở hữu máy (QĐ-181), nguồn công, lịch mặc định —");
  const TA = (await seedNenMong(chu, `qa-v2a-${DAU}`, "QA v2 A")).id;
  const TB = (await seedNenMong(chu, `qa-v2b-${DAU}`, "QA v2 B")).id;
  const ktvA = await nguoi("ktv-a", "technical", { t: TA });
  const hrA = await nguoi("hr-a", "nhan-su-hr", { t: TA, hai: true });
  const ktvB = await nguoi("ktv-b", "technical", { t: TB });
  const IP_CHUNG = "198.51.100.200";
  const BAY2 = new Date("2026-11-05T02:00:00Z");
  const adms2 = (phuongThuc: string, ts: string, than: string | null = null, ip = IP_CHUNG) =>
    xuLyAdms({ phuongThuc, doan: "cdata", truyVan: new URLSearchParams(ts), than, ip }, { bayGio: () => BAY2 });
  const dongLog = (pin: string, luc: string) => `${pin}\t${luc}\t0\t1\t0\t0\n`;

  // V1: B cùng IP thấy máy lạ của A, đăng ký trước, rồi GIẢ một lần chấm mang mã của chính B (B biết mã vì B là người đăng ký).
  const SNX = `VX${DAU.toUpperCase()}`.slice(0, 20);
  await adms2("GET", `SN=${SNX}&options=all`);
  const bThay = await voi(TB, ktvB, (nc) => danhSachMayLa(nc), IP_CHUNG);
  dat("V1a: B cùng IP thấy máy lạ của A nhưng KHÔNG thấy SN đầy đủ (che, chỉ 3 ký tự cuối)",
    bThay.some((m) => m.soSeri === cheSoSeri(SNX) && !m.soSeriDayDu) && !JSON.stringify(bThay).includes(SNX), JSON.stringify(bThay.map((m) => m.soSeri)));
  let doSn = 0;
  for (let i = 0; i < 40; i++) {
    try { await voi(TB, ktvB, (nc) => danhSachMayLa(nc, `VX${String(i).padStart(4, "0")}`), IP_CHUNG); } catch (e) { if (e instanceof LoiNghiepVu && e.ma === "qua-nhieu-lan") { doSn = i; break; } }
  }
  dat("V1b: tra đúng SN (máy dò có / không) bị giới hạn mỗi phút → không dò SN hàng loạt", doSn > 0 && doSn <= 30, `chặn ở lần ${doSn}`);
  // Phần còn lại: ai ĐÃ BIẾT SN (đọc nhãn máy, nhà cung cấp…) vẫn giả được lần chấm mang mã của chính mình.
  const mayX = await voi(TB, ktvB, (nc) => taoMay(nc, { soSeri: SNX, ten: "Chiếm", diaDiemId: null, ipChoPhep: [] }, BAY2), IP_CHUNG);
  await adms2("POST", `SN=${SNX}&table=ATTLOG&Stamp=1`, dongLog("31", "2026-11-04 08:00:00") + dongLog("32", "2026-11-04 08:02:00"));
  await adms2("POST", `SN=${SNX}&table=ATTLOG&Stamp=2`, dongLog(mayX.maXacMinh!, "2026-11-05 08:59:00"));
  const xX = await chu.attendanceDevice.findUniqueOrThrow({ where: { id: mayX.id } });
  const nhanCuaA = await chu.attendancePunch.count({ where: { tenantId: TB, deviceId: mayX.id } });
  tonDong("V1c (QĐ-181): B ĐÃ BIẾT SN của A đăng ký trước rồi GIẢ lần chấm mang mã của chính B qua /iclock (không cần máy) → máy “đã xác minh” cho B, B nhận log tồn của A",
    xX.verifyStatus === "da-xac-minh" && nhanCuaA === 2, `trạng thái ${xX.verifyStatus}, B nhận ${nhanCuaA} lần chấm của A`);

  // V2: hai lần kích hoạt đồng thời → không trùng lần chấm, khu cách ly trống, Stamp đúng.
  const SNY = `VY${DAU.toUpperCase()}`.slice(0, 20);
  const mayY = await voi(TA, ktvA, (nc) => taoMay(nc, { soSeri: SNY, ten: "Máy Y", diaDiemId: null, ipChoPhep: [] }, BAY2));
  await adms2("POST", `SN=${SNY}&table=ATTLOG&Stamp=5`, dongLog("41", "2026-11-04 08:00:00") + dongLog("42", "2026-11-04 17:00:00"));
  const kichHoat = dongLog("42", "2026-11-04 17:00:00") + dongLog("43", "2026-11-05 08:00:00") + dongLog(mayY.maXacMinh!, "2026-11-05 08:30:00");
  const kqY = await Promise.allSettled([adms2("POST", `SN=${SNY}&table=ATTLOG&Stamp=9`, kichHoat), adms2("POST", `SN=${SNY}&table=ATTLOG&Stamp=9`, kichHoat)]);
  const pY = await chu.attendancePunch.findMany({ where: { tenantId: TA, deviceId: mayY.id }, select: { pin: true, punchedAt: true } });
  const yY = await chu.attendanceDevice.findUniqueOrThrow({ where: { id: mayY.id } });
  dat("V2: hai lần kích hoạt đồng thời → đã xác minh, 3 lần chấm (41, 42, 43) mỗi lần đúng 1 bản, không có lần chấm mã xác minh, cách ly trống, Stamp=9",
    yY.verifyStatus === "da-xac-minh" && pY.length === 3 && new Set(pY.map((x) => `${x.pin}|${x.punchedAt.toISOString()}`)).size === 3 && !pY.some((x) => x.pin === mayY.maXacMinh)
      && (await chu.attendanceQuarantineLog.count({ where: { deviceId: mayY.id } })) === 0 && yY.attlogStamp === "9",
    `${yY.verifyStatus} ${JSON.stringify(pY.map((x) => x.pin))} stamp=${yY.attlogStamp} ${kqY.map((k) => k.status === "fulfilled" ? k.value.status : String(k.reason)).join(" | ")}`);

  // V3: lần chấm mang mã xác minh SAU khi đã xác minh (người dùng tạm chưa xóa) → không thành "PIN chưa khớp" chờ gán.
  await adms2("POST", `SN=${SNY}&table=ATTLOG&Stamp=10`, dongLog(mayY.maXacMinh!, "2026-11-05 09:30:00"));
  const conMa = await chu.attendancePunch.count({ where: { tenantId: TA, deviceId: mayY.id, pin: mayY.maXacMinh! } });
  dat("V3: chấm lại bằng người dùng tạm mang mã xác minh sau khi đã xác minh → không lưu (không vào “PIN chưa khớp”, không gán nhầm được)", conMa === 0, `${conMa} lần chấm mã xác minh được lưu`);

  // V4: kích hoạt ‖ hủy đăng ký → nhất quán.
  const SNZ = `VZ${DAU.toUpperCase()}`.slice(0, 20);
  const mayZ = await voi(TA, ktvA, (nc) => taoMay(nc, { soSeri: SNZ, ten: "Máy Z", diaDiemId: null, ipChoPhep: [] }, BAY2));
  await adms2("POST", `SN=${SNZ}&table=ATTLOG&Stamp=1`, dongLog("51", "2026-11-04 08:00:00"));
  const kqZ = await Promise.allSettled([adms2("POST", `SN=${SNZ}&table=ATTLOG&Stamp=2`, dongLog(mayZ.maXacMinh!, "2026-11-05 08:30:00")), voi(TA, ktvA, (nc) => huyDangKyMay(nc, mayZ.id))]);
  const zCon = await chu.attendanceDevice.findUnique({ where: { id: mayZ.id } });
  const zPunch = await chu.attendancePunch.count({ where: { tenantId: TA, pin: "51" } });
  const zCachLy = await chu.attendanceQuarantineLog.count({ where: { deviceId: mayZ.id } });
  dat("V4: kích hoạt ‖ hủy đăng ký → hoặc máy bị xóa (0 lần chấm, cách ly trống) hoặc đã xác minh (hủy bị 409)",
    (!zCon && zPunch === 0 && zCachLy === 0) || (zCon?.verifyStatus === "da-xac-minh" && zPunch === 1 && kqZ[1].status === "rejected"),
    `${zCon?.verifyStatus ?? "đã xóa"} punch=${zPunch} cachLy=${zCachLy} ${kqZ.map((k) => k.status === "fulfilled" ? JSON.stringify(k.value).slice(0, 60) : String((k.reason as Error).message).slice(0, 80)).join(" | ")}`);

  // V5: hàm SECURITY DEFINER mới — search_path có pg_temp cuối, PUBLIC không EXECUTE.
  const ham = await chu.$queryRaw<{ proname: string; cfg: string | null; acl: string | null }[]>`
    SELECT proname, array_to_string(proconfig, ',') AS cfg, proacl::text AS acl FROM pg_proc
     WHERE proname IN ('ghi_log_cach_ly', 'lay_log_cach_ly', 'dem_log_cach_ly', 'giai_phong_sn_cho_xac_minh') AND pronamespace = 'public'::regnamespace`;
  dat("V5: 4 hàm khu cách ly: SECURITY DEFINER với search_path=public, pg_temp; PUBLIC không có EXECUTE; cowork_app có",
    ham.length === 4 && ham.every((h) => h.cfg === "search_path=public, pg_temp" && !/(^|[{,])=X/.test(h.acl ?? "") && /cowork_app=X/.test(h.acl ?? "")), JSON.stringify(ham));

  // V6: người phụ thuộc "chưa ghi tên" — số giấy tờ rác có gỡ được cờ không giảm trừ?
  const nvNpt = await nguoi("nv-npt", "sales", { t: TA });
  await voi(TA, hrA, (nc) => taoHoSoLuong(nc, hs({ nguoiId: nvNpt })));
  await voi(TA, hrA, (nc) => nhapCsvHoSoLuong(nc, `Email,Lương cơ bản,Số người phụ thuộc\nnv-npt.${DAU}@qa.test,10000000,1\n`, true, "2026-05-01"));
  const npt0 = await chu.salaryDependent.findFirstOrThrow({ where: { tenantId: TA, userId: nvNpt } });
  const sua = await voi(TA, hrA, (nc) => suaNguoiPhuThuoc(nc, npt0.id, { hoTen: "Nguyễn Văn Con", quanHe: "con", soGiayTo: "x" }));
  tonDong("V6 (QĐ-182): số giấy tờ một ký tự (“x”) đủ để gỡ cờ “chưa ghi tên” → được giảm trừ", !sua.chuaDuThongTin);

  // V7: lịch mặc định — ngày không hợp lệ phải báo lỗi nghiệp vụ (không 500).
  const lichA2 = await chu.workSchedule.create({ data: { tenantId: TA, code: `md-${DAU}`, name: "Lịch A", shiftId: (await chu.workShift.create({ data: { tenantId: TA, code: `ca-${DAU}`, name: "Ca", startMinute: 480, endMinute: 1020 } })).id, days: ["ca", "ca", "ca", "ca", "ca", "nghi", "nghi"] } });
  await nemLoi("V7: đặt lịch mặc định với ngày không tồn tại (2026-02-30) → lỗi định dạng, không ghi lịch sử", "bat-ky",
    () => voi(TA, hrA, (nc) => datLichMacDinh(nc, lichA2.id, "2026-02-30")));
  dat("…không có dòng lịch sử lịch mặc định nào bị ghi với ngày sai", (await chu.defaultScheduleChange.count({ where: { tenantId: TA } })) === 0);
  let loi7 = "";
  try { await voi(TA, hrA, (nc) => datLichMacDinh(nc, lichA2.id, "2026-13-45")); } catch (e) { loi7 = e instanceof LoiNghiepVu || e instanceof LoiDinhDang ? "nghiep-vu" : String((e as Error).message).slice(0, 80); }
  dat("…tháng 13 → lỗi nghiệp vụ / định dạng (không phải lỗi CSDL → 500)", loi7 === "nghiep-vu", loi7);

  // V8: đặt lịch mặc định ‖ khóa bảng công cùng tháng → không được cả hai cùng thành công (hồi tố vào tháng đã khóa).
  let caHaiThanhCong = 0;
  for (const thang of [1, 2, 3, 4, 5]) {
    const bc = await chu.timesheet.create({ data: { tenantId: TA, year: 2027, month: thang, generatedAt: BAY2, generatedBy: hrA, feedbackDeadline: new Date("2026-01-01T00:00:00Z") } });
    const r = await Promise.allSettled([
      voi(TA, hrA, (nc) => khoaBangCong(nc, bc.id)),
      voi(TA, hrA, (nc) => datLichMacDinh(nc, lichA2.id, `2027-${String(thang).padStart(2, "0")}-10`)),
    ]);
    if (r.every((x) => x.status === "fulfilled")) caHaiThanhCong++;
  }
  dat("V8: đặt lịch mặc định ‖ khóa bảng công cùng tháng (5 lần) → không lần nào cả hai cùng thành công", caHaiThanhCong === 0, `${caHaiThanhCong}/5 lần lịch mặc định lọt vào tháng vừa khóa`);

  void LoiDinhDang;
  await chu.$disconnect();
  ketLuan("QA 0.22.0 mở dần");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
