import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen } from "../src/lib/phan-quyen";
import { maHoa } from "../src/lib/ma-hoa";
import { base32Giai, sinhKhoaTotp, totp } from "../src/lib/totp";
import { bamMatKhau } from "../src/lib/xac-thuc";
import { cacNgayTrongThang, thuTrongTuan } from "../src/modules/cham-cong/tinh-toan";
import { taoHoSoLuong } from "../src/modules/luong/ho-so";
import { LuocDoHoSoLuong } from "../src/modules/luong/luoc-do";
import { duyetKyLuong, guiDuyetKyLuong, khoaKyLuong, taoKyLuong, tinhKyLuong } from "../src/modules/luong/service";
import { seedNenMong } from "../prisma/seed/index";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * QA ĐỐI KHÁNG qua HTTP cho phân hệ lương (0.21.0) — chạy vào một bản `next start` ĐANG CHẠY cùng CSDL:
 *
 *   THU_URL=http://localhost:3023 npm run thu:qa-luong-http
 *
 * Dựng một doanh nghiệp thử mới (vai chủ sở hữu + service), rồi đi đúng đường người dùng: đăng nhập 2 bước bằng mã
 * TOTP thật, cookie phiên, bản in, xuất file. Kiểm 2 lớp bắt buộc qua phiên thật: phiên tạo TRƯỚC khi bật 2 lớp bị thu
 * hồi, tắt 2 lớp giữa phiên → bị chặn, phiên tạm giữa hai bước không gọi được API. CHỈ trên máy phát triển.
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Không chạy trên môi trường thật.");
  process.exit(1);
}

const URL_GOC = (process.env.THU_URL ?? "http://localhost:3023").replace(/\/$/, "");
const ORIGIN = new URL(URL_GOC).origin;
const chu = clientChuSoHuu();
const DAU = Math.floor(performance.timeOrigin).toString(36);
const MOC = new Date("2026-04-03T03:00:00Z");
const NGAY = (s: string) => new Date(`${s}T00:00:00.000Z`);
const MAT_KHAU = `Qa-${DAU}-Luong9`;
const ip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

interface PhanHoi {
  status: number;
  json: Record<string, unknown>;
  text: string;
  headers: Headers;
  cookies: Record<string, string>;
}

async function goi(duong: string, o: { method?: string; than?: unknown; cookie?: string; ipKhach?: string } = {}): Promise<PhanHoi> {
  const headers: Record<string, string> = { "x-real-ip": o.ipKhach ?? "10.254.1.1" };
  if (o.than !== undefined) headers["content-type"] = "application/json";
  if (o.cookie) headers.cookie = o.cookie;
  if ((o.method ?? "GET") !== "GET") headers.origin = ORIGIN;
  const r = await fetch(`${URL_GOC}${duong}`, { method: o.method ?? "GET", headers, body: o.than === undefined ? undefined : JSON.stringify(o.than), redirect: "manual" });
  const text = await r.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML / CSV */
  }
  const cookies: Record<string, string> = {};
  for (const c of r.headers.getSetCookie()) {
    const m = c.match(/^([^=]+)=([^;]*)/);
    if (m) cookies[m[1]] = m[2];
  }
  return { status: r.status, json, text, headers: r.headers, cookies };
}

const maTotp = (khoa: string, lech = 0) => totp(base32Giai(khoa), Date.now() + lech * 30_000);

async function main() {
  console.log(`=== QA HTTP tính lương: ${URL_GOC} ===\n`);
  const khoe = await goi("/api/khoe");
  if (khoe.status !== 200) {
    console.error(`Máy chủ ${URL_GOC} không trả lời /api/khoe (${khoe.status}).`);
    process.exit(1);
  }

  // ---------------- Dựng dữ liệu: một kỳ lương đã khóa ----------------
  const tenant = await seedNenMong(chu, `qa-luh-${DAU}`, "DN QA lương HTTP");
  const T = tenant.id;
  console.log("");
  const bam = await bamMatKhau(MAT_KHAU);
  const vaiTro = async (code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code } } })).id;
  const khoaTotp = new Map<string, string>();
  async function nguoi(ten: string, vai: string, coTotp: boolean) {
    const email = `${ten}.${DAU}@thu.test`;
    const u = await chu.user.create({
      data: { tenantId: T, email, passwordHash: bam, passwordChangedAt: new Date(Date.now() - 60_000), fullName: ten, userRoles: { create: { tenantId: T, roleId: await vaiTro(vai) } }, staffProfile: { create: { tenantId: T, hiredAt: NGAY("2025-01-01") } } },
    });
    if (coTotp) {
      const k = sinhKhoaTotp();
      khoaTotp.set(u.id, k);
      await chu.user.update({ where: { id: u.id }, data: { totpSecretEnc: maHoa(k, `totp:${u.id}`), totpEnabledAt: MOC } });
    }
    return { id: u.id, email };
  }
  const gd = await nguoi("qa-gd", "ceo", true);
  const kt = await nguoi("qa-kt", "finance", true);
  const kt2 = await nguoi("qa-kt2", "finance", false);
  const hr = await nguoi("qa-hr", "nhan-su-hr", false);
  const nv = await nguoi("qa-nv", "sales", false);
  const nv2 = await nguoi("qa-nv2", "technical", false);

  const voi = <R>(u: string, f: (nc: NguCanh) => Promise<R>) => voiTenant(T, async (tx) => f(taoNguCanh(tx, T, (await layHoSoQuyen(tx, u))!, "127.0.0.1", "thu-qa-luong-http")));
  const ca = await chu.workShift.create({ data: { tenantId: T, code: "hc", name: "HC", startMinute: 480, endMinute: 1020, breakStartMinute: 720, breakMinutes: 60 } });
  const lich = await chu.workSchedule.create({ data: { tenantId: T, code: "hc", name: "HC", shiftId: ca.id, days: ["ca", "ca", "ca", "ca", "ca", "nghi", "nghi"] } });
  const bc = await chu.timesheet.create({ data: { tenantId: T, year: 2026, month: 3, generatedAt: MOC, generatedBy: gd.id, feedbackDeadline: MOC } });
  for (const u of [nv.id, nv2.id]) {
    await chu.scheduleAssignment.create({ data: { tenantId: T, userId: u, scheduleId: lich.id, effectiveFrom: NGAY("2026-01-01") } });
    for (const ngay of cacNgayTrongThang(2026, 3)) {
      if (thuTrongTuan(ngay) >= 5) continue;
      await chu.timesheetRow.create({ data: { tenantId: T, timesheetId: bc.id, userId: u, workDate: NGAY(ngay), isAdjustment: false, dayType: "thuong", expectedValue: 1, workValue: 1, flags: [] } });
    }
  }
  await chu.timesheet.update({ where: { id: bc.id }, data: { status: "da-khoa", lockedAt: MOC, lockedBy: gd.id } });
  await chu.payrollParamSet.updateMany({ where: { tenantId: T, confirmedAt: null }, data: { confirmedBy: kt.id, confirmedAt: MOC } });
  const hs = (nguoiId: string, luong: number) => LuocDoHoSoLuong.parse({ nguoiId, hieuLucTu: "2026-01-01", loaiHopDong: "chinh-thuc", cachTra: "thang", phuongPhapThue: "luy-tien", luongCoBan: luong, luongDongBH: luong, soTaiKhoan: "0123", nganHang: "VCB" });
  await voi(gd.id, (nc) => taoHoSoLuong(nc, hs(nv.id, 13_579_246)));
  await voi(gd.id, (nc) => taoHoSoLuong(nc, hs(nv2.id, 24_681_357)));
  const ky = await voi(kt.id, (nc) => taoKyLuong(nc, { nam: 2026, thang: 3 }));
  await voi(kt.id, (nc) => tinhKyLuong(nc, ky.id));
  await voi(kt.id, (nc) => guiDuyetKyLuong(nc, ky.id));
  await voi(gd.id, (nc) => duyetKyLuong(nc, ky.id));
  const dNv = await chu.payrollLine.findFirstOrThrow({ where: { runId: ky.id, userId: nv.id } });
  const dNv2 = await chu.payrollLine.findFirstOrThrow({ where: { runId: ky.id, userId: nv2.id } });
  const so2 = Number(dNv2.netPay).toLocaleString("vi-VN");

  const dangNhap = (email: string) => goi("/api/dang-nhap", { method: "POST", than: { maDoanhNghiep: tenant.code, email, matKhau: MAT_KHAU }, ipKhach: ip() });
  async function dangNhapDu(u: { id: string; email: string }): Promise<string> {
    const b1 = await dangNhap(u.email);
    if (b1.cookies.cowork_phien) return `cowork_phien=${b1.cookies.cowork_phien}`;
    const b2 = await goi("/api/dang-nhap/2-lop", { method: "POST", than: { ma: maTotp(khoaTotp.get(u.id)!) }, cookie: `cowork_2lop=${b1.cookies.cowork_2lop}`, ipKhach: ip() });
    if (!b2.cookies.cowork_phien) throw new Error(`Đăng nhập 2 lớp hỏng: ${b2.status} ${b2.text.slice(0, 200)}`);
    return `cowork_phien=${b2.cookies.cowork_phien}`;
  }

  // ==================================================================
  console.log("— A. Nhân viên: phiếu của mình chỉ khi kỳ đã khóa, không thấy phiếu người khác —");
  const cNv = await dangNhapDu(nv);
  const p0 = await goi(`/api/v1/luong/dong/${dNv.id}`, { cookie: cNv });
  dat("Kỳ đã duyệt nhưng CHƯA khóa: phiếu của mình → 404", p0.status === 404, String(p0.status));
  const in0 = await goi(`/luong/phieu/${dNv.id}/in`, { cookie: cNv });
  dat("…bản in phiếu của mình khi chưa khóa → 404, không có số tiền", in0.status === 404 && !in0.text.includes(Number(dNv.netPay).toLocaleString("vi-VN")), String(in0.status));
  await voi(gd.id, (nc) => khoaKyLuong(nc, ky.id));
  const p1 = await goi(`/api/v1/luong/dong/${dNv.id}`, { cookie: cNv });
  dat("Sau khóa: phiếu của mình 200 (không cần 2 lớp)", p1.status === 200 && (p1.json.ketQua as { thucLinh: number }).thucLinh === Number(dNv.netPay));
  const in1 = await goi(`/luong/phieu/${dNv.id}/in`, { cookie: cNv });
  dat("…bản in phiếu của mình 200", in1.status === 200 && in1.text.includes("PHIẾU LƯƠNG"));
  const tc0 = await chu.auditLog.count({ where: { tenantId: T, action: "tu-choi-quyen", actorId: nv.id } });
  const inKhac = await goi(`/luong/phieu/${dNv2.id}/in`, { cookie: cNv });
  dat("LỖI 4: nhân viên mở bản in phiếu người khác → 404 (trước khi sửa: lỗi máy 500), không lộ số tiền", inKhac.status === 404 && !inKhac.text.includes(so2), String(inKhac.status));
  const kyTrang = await goi(`/luong/${ky.id}`, { cookie: cNv });
  dat("LỖI 4: nhân viên mở trang bảng lương → 404 (trước khi sửa: trang lỗi)", kyTrang.status === 404 && !kyTrang.text.includes(so2), String(kyTrang.status));
  const hsTrang = await goi(`/luong/ho-so?nguoi=${nv2.id}`, { cookie: cNv });
  dat("LỖI 4: nhân viên mở trang hồ sơ lương → 404", hsTrang.status === 404, String(hsTrang.status));
  dat("…mỗi lần dò ở trang đều ghi vết từ chối quyền", (await chu.auditLog.count({ where: { tenantId: T, action: "tu-choi-quyen", actorId: nv.id } })) - tc0 >= 3);
  for (const [ten, duong] of [
    ["phiếu người khác", `/api/v1/luong/dong/${dNv2.id}`],
    ["bản in phiếu người khác", `/luong/phieu/${dNv2.id}/in`],
    ["danh sách kỳ", "/api/v1/luong/ky"],
    ["chi tiết kỳ", `/api/v1/luong/ky/${ky.id}`],
    ["xuất bảng lương", `/api/v1/luong/ky/${ky.id}/xuat?loai=bang-luong&dinhDang=csv`],
    ["xuất ngân hàng", `/api/v1/luong/ky/${ky.id}/xuat?loai=ngan-hang`],
    ["hồ sơ lương", `/api/v1/luong/ho-so/${nv2.id}`],
    ["trang bảng lương", `/luong/${ky.id}`],
  ] as const) {
    const r = await goi(duong, { cookie: cNv });
    dat(`Nhân viên: ${ten} → từ chối, không lộ số tiền`, [401, 403, 404, 307].includes(r.status) && !r.text.includes(so2), String(r.status));
  }
  const cuaToi = await goi("/api/v1/luong/phieu-cua-toi", { cookie: cNv });
  dat("Phiếu của tôi chỉ có dòng của mình", cuaToi.status === 200 && cuaToi.text.includes(dNv.id) && !cuaToi.text.includes(dNv2.id), cuaToi.text.slice(0, 120));

  // ==================================================================
  console.log("\n— B. 2 lớp bắt buộc qua phiên thật —");
  const cHr = await dangNhapDu(hr);
  const hr1 = await goi("/api/v1/luong/ky", { cookie: cHr });
  dat("Nhân sự chưa bật 2 lớp: API → 403 luong-can-2-lop", hr1.status === 403 && hr1.json.ma === "luong-can-2-lop", `${hr1.status} ${hr1.text.slice(0, 120)}`);
  const hrIn = await goi(`/luong/phieu/${dNv2.id}/in`, { cookie: cHr });
  dat("…bản in phiếu người khác: trang hướng dẫn bật 2 lớp, không có số tiền", hrIn.status === 200 && !hrIn.text.includes(so2) && hrIn.text.includes("bắt buộc bật xác thực 2 lớp"), String(hrIn.status));
  const hrTrang = await goi(`/luong/${ky.id}`, { cookie: cHr });
  dat("…trang bảng lương: không có số tiền", !hrTrang.text.includes(so2), String(hrTrang.status));

  const kt1 = await dangNhap(kt.email);
  dat("Người có 2 lớp: bước 1 chỉ có phiên tạm, không có phiên thật", !kt1.cookies.cowork_phien && Boolean(kt1.cookies.cowork_2lop));
  const tam = await goi("/api/v1/luong/ky", { cookie: `cowork_phien=${kt1.cookies.cowork_2lop}` });
  dat("Phiên tạm giữa hai bước dùng làm cookie phiên → 401", tam.status === 401, String(tam.status));
  const cKt = await dangNhapDu(kt);
  const ktKy = await goi("/api/v1/luong/ky", { cookie: cKt });
  dat("Kế toán đã 2 lớp: danh sách kỳ 200", ktKy.status === 200);
  const xuat = await goi(`/api/v1/luong/ky/${ky.id}/xuat?loai=ngan-hang&dinhDang=csv`, { cookie: cKt });
  dat("Xuất ngân hàng: tệp đính kèm, không lưu đệm", xuat.status === 200 && (xuat.headers.get("content-disposition") ?? "").startsWith("attachment") && (xuat.headers.get("cache-control") ?? "").includes("no-store"));
  const sai = await goi(`/api/v1/luong/dong/khong-phai-uuid`, { cookie: cKt });
  dat("Mã dòng không phải UUID → 4xx, không 500", sai.status >= 400 && sai.status < 500, String(sai.status));
  const sai2 = await goi(`/api/v1/luong/ky/00000000-0000-4000-8000-000000000000/xuat?loai=bang-luong`, { cookie: cKt });
  dat("Kỳ không tồn tại → 404", sai2.status === 404, String(sai2.status));
  const sai3 = await goi(`/api/v1/luong/ky/${ky.id}/xuat?loai=khong-co`, { cookie: cKt });
  dat("Loại xuất lạ → 400", sai3.status === 400, String(sai3.status));

  // Phiên tạo TRƯỚC khi bật 2 lớp: bật xong phiên cũ bị thu hồi; phiên mới có quyền.
  const cKt2Cu = await dangNhapDu(kt2);
  const truoc = await goi("/api/v1/luong/ky", { cookie: cKt2Cu });
  dat("Kế toán chưa bật 2 lớp → 403", truoc.status === 403 && truoc.json.ma === "luong-can-2-lop");
  const bd = await goi("/api/v1/tai-khoan/2-lop/bat-dau", { method: "POST", than: {}, cookie: cKt2Cu });
  const khoaMoi = String(bd.json.khoa ?? "");
  const xn = await goi("/api/v1/tai-khoan/2-lop/xac-nhan", { method: "POST", than: { ma: maTotp(khoaMoi) }, cookie: cKt2Cu });
  const cKt2Moi = xn.cookies.cowork_phien ? `cowork_phien=${xn.cookies.cowork_phien}` : "";
  dat("Bật 2 lớp qua API thành công, nhận phiên mới + mã khôi phục", xn.status === 200 && Boolean(cKt2Moi) && Array.isArray(xn.json.maKhoiPhuc), `${bd.status} ${xn.status}`);
  const cu = await goi("/api/v1/luong/ky", { cookie: cKt2Cu });
  dat("Phiên tạo trước khi bật 2 lớp bị thu hồi (401)", cu.status === 401, String(cu.status));
  const moi = await goi("/api/v1/luong/ky", { cookie: cKt2Moi });
  dat("Phiên mới sau khi bật 2 lớp: 200", moi.status === 200, String(moi.status));
  // Tắt 2 lớp sau khi đăng nhập: phiên đang dùng bị thu hồi; phiên mới (đã tắt) bị chặn lương.
  const mk = (xn.json.maKhoiPhuc as string[])[0];
  const tat = await goi("/api/v1/tai-khoan/2-lop/tat", { method: "POST", than: { matKhau: MAT_KHAU, ma: mk }, cookie: cKt2Moi });
  const cSauTat = tat.cookies.cowork_phien ? `cowork_phien=${tat.cookies.cowork_phien}` : "";
  dat("Tắt 2 lớp (mật khẩu + mã khôi phục) thành công", tat.status === 200 && Boolean(cSauTat), `${tat.status} ${tat.text.slice(0, 150)}`);
  const sauTat = await goi("/api/v1/luong/ky", { cookie: cSauTat });
  dat("Sau khi tắt 2 lớp: phiên mới → 403 luong-can-2-lop", sauTat.status === 403 && sauTat.json.ma === "luong-can-2-lop", String(sauTat.status));
  const phienCo2Lop = await goi("/api/v1/luong/ky", { cookie: cKt2Moi });
  dat("…phiên cũ (lúc còn 2 lớp) bị thu hồi (401)", phienCo2Lop.status === 401, String(phienCo2Lop.status));

  // ==================================================================
  console.log("\n— C. Nhật ký xem qua HTTP: bản in + xuất file của Kế toán —");
  const n0 = await chu.auditLog.count({ where: { tenantId: T, action: "xem-luong", actorId: kt.id } });
  await goi(`/luong/phieu/${dNv2.id}/in`, { cookie: cKt });
  await goi(`/api/v1/luong/ky/${ky.id}/xuat?loai=bang-luong&dinhDang=xls`, { cookie: cKt });
  const nk = await chu.auditLog.findMany({ where: { tenantId: T, action: "xem-luong", actorId: kt.id }, orderBy: { createdAt: "asc" } });
  dat("Bản in phiếu người khác + xuất bảng lương: mỗi lần một dòng nhật ký xem", nk.length - n0 === 2 && nk.slice(-2).some((x) => (x.after as { xem: string }).xem === "phieu-luong") && nk.slice(-2).some((x) => (x.after as { xem: string }).xem === "xuat-bang-luong"), `${nk.length - n0}`);

  await chu.$disconnect();
  ketLuan("QA HTTP tính lương (0.21.0)");
}

main().catch(async (e) => {
  console.error(e);
  await chu.$disconnect();
  process.exit(1);
});
