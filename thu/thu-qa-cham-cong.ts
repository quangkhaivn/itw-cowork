import { NextRequest } from "next/server";
import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiDinhDang, LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { layIpKhach } from "../src/lib/yeu-cau";
import { readFileSync } from "node:fs";
import { seedDanhMucQuyen, seedDuLieuDoanhNghiep, seedNenMong } from "../prisma/seed/index";
import { POST as postIclock, GET as getIclock } from "../src/app/iclock/[...duong]/route";
import { chamCongGps, duocTinhCong, quyetDinhMoiNhat, xacNhanThongBaoViTri, xemXetLanCham } from "../src/modules/cham-cong/service";
import { bangTrucTiep } from "../src/modules/cham-cong/truc-tiep";
import { anhXaPin, taoMay, suaMay, xuLyAdms } from "../src/modules/cham-cong/may-cham-cong";
import { quetChamCong } from "../src/modules/cham-cong/nhac-viec";
import { ngayThieuGioCanXemXet, xetNgayThieuGio } from "../src/modules/cham-cong/ngay-cong";
import { tinhCong } from "../src/modules/cham-cong/tinh-cong";
import { docCauHinhChamCong } from "../src/modules/cham-cong/chung";
import { quyetDinhTangCa, taoDonTangCa, taoGiaiTrinh, tangCaThucTe } from "../src/modules/cham-cong/don-tu";
import { chiTietBangCong, guiPhanHoiCong, khoaBangCong, sinhBangCong, xuatCsvBangCong } from "../src/modules/cham-cong/bang-cong";
import { quyetDinhNghi, soDuPhepCua, taoDonNghi } from "../src/modules/nghi-phep/service";
import { LuocDoDonNghi } from "../src/modules/nghi-phep/luoc-do";
import { LuocDoChamGps, LuocDoGiaiTrinh } from "../src/modules/cham-cong/luoc-do";
import { LuocDoCa, LuocDoDiaDiem, LuocDoHoSoNhanSu, LuocDoLich, LuocDoMayChamCong } from "../src/modules/nhan-su/luoc-do";
import { ganLich, taoCa, taoDiaDiem, taoLich, taoNgayLe, suaHoSoNhanSu } from "../src/modules/nhan-su/service";
import { danhSachKhachHang } from "../src/modules/khach-hang/service";
import { danhSachSanPham } from "../src/modules/san-pham/service";
import { danhSachDonHang } from "../src/modules/don-hang/service";
import { timKiemToanCuc } from "../src/modules/tim-kiem/service";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * QA độc lập 0.19.0 — Nhân sự GĐ1: chấm công. Cố tình phá: cổng /iclock (SN lạ / của doanh nghiệp
 * khác / hoa thường, IP giả, thân lớn, dòng hỏng, giờ máy lệch, lô rất lớn), GPS (toạ độ bậy, IDOR,
 * phiếu hiện trường không phải của mình, tự xem xét), phân quyền + RLS từng bảng mới, nghỉ phép (nửa
 * ngày, gửi trùng đồng thời, xin bù ngày đã qua), tăng ca (gửi trùng đồng thời, qua nửa đêm, ngày lễ),
 * bảng công (CSV chèn công thức, khóa), nhắc việc. Luật: BUSINESS_RULES.md mục 30.
 * Chạy: npm run thu:qa-cham-cong (CSDL phát triển).
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const vn = (s: string) => new Date(`${s}+07:00`);
const VP = { lat: 10.7769, lng: 106.7009 };
const XA = { lat: 10.8219, lng: 106.7009 };

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>, ip = "203.0.113.9"): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, ip, "thu-qa-cham-cong/1.0"));
  });
}

function moTa(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e);
}

async function nemLoi(ten: string, khoi: () => Promise<unknown>, ma?: string, kieu: "nghiep-vu" | "quyen" | "khong-thay" | "csdl" | "bat-ky" = "nghiep-vu") {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu =
      kieu === "bat-ky" ? true
      : kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "csdl" ? !(e instanceof LoiNghiepVu) && /23514|23505|42501|row-level|chi duoc ghi them|da khoa|check|Unique|P2002|violates/i.test(moTa(e))
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, moTa(e));
  }
}

const ngu = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("=== QA độc lập Nhân sự – chấm công (0.19.0) ===\n");
  const T = (await seedNenMong(chu, `qa-cc-${DAU}`, "QA chấm công")).id;
  const T2 = (await seedNenMong(chu, `qa-cc2-${DAU}`, "QA chấm công 2")).id;
  const vaiTro = async (t: string, code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: t, code } } })).id;
  async function nguoi(t: string, ten: string, vai: string, quanLyId?: string, tenDay?: string) {
    const u = await chu.user.create({
      data: {
        tenantId: t, email: `${ten}.${DAU}@qa.test`, passwordHash: "x", fullName: tenDay ?? ten,
        userRoles: { create: { tenantId: t, roleId: await vaiTro(t, vai) } },
        staffProfile: { create: { tenantId: t, managerId: quanLyId ?? null, hiredAt: new Date("2020-01-01T00:00:00Z") } },
      },
    });
    return u.id;
  }
  const hr = await nguoi(T, "hr", "nhan-su-hr");
  const hr2 = await nguoi(T, "hr2", "nhan-su-hr");
  const tp = await nguoi(T, "tp", "sales-manager");
  const nvA = await nguoi(T, "nv-a", "sales", tp, "=HYPERLINK(\"http://x\")");
  const nvB = await nguoi(T, "nv-b", "sales", tp);
  const nvC = await nguoi(T, "nv-c", "sales");
  const ktv = await nguoi(T, "ktv", "technical");
  const ktv2 = await nguoi(T, "ktv2", "technical");
  const tts = await nguoi(T, "tts", "sinh-vien-thuc-tap", tp);
  const ngoai = await nguoi(T2, "ngoai", "nhan-su-hr");
  await chu.tenantSetting.create({ data: { tenantId: T, key: "nghi_phep.so_ngay_nam", value: 12 } });

  const vp = await voi(T, hr, (nc) => taoDiaDiem(nc, LuocDoDiaDiem.parse({ ten: "VP QA", viDo: VP.lat, kinhDo: VP.lng })));
  const ca = await voi(T, hr, (nc) => taoCa(nc, LuocDoCa.parse({ ma: "HC", ten: "Hành chính", gioVao: "08:00", gioRa: "17:00", gioNghi: "12:00", phutNghi: 60 })));
  const lich = await voi(T, hr, (nc) => taoLich(nc, LuocDoLich.parse({ ma: "T2T7S", ten: "T2–T6 + sáng T7", caId: ca.id, ngay: ["ca", "ca", "ca", "ca", "ca", "sang", "nghi"] })));
  await voi(T, hr, (nc) => ganLich(nc, { nguoiIds: [hr, hr2, tp, nvA, nvB, nvC, ktv, ktv2, tts], lichId: lich.id, tuNgay: "2026-01-01", ghiChu: null }));
  await voi(T, hr, (nc) => taoNgayLe(nc, { ngay: "2026-09-02", ten: "Quốc khánh (QA)" }));
  for (const u of [hr, hr2, tp, nvA, nvB, nvC, ktv, ktv2, tts]) await voi(T, u, (nc) => xacNhanThongBaoViTri(nc));
  await voi(T, hr, (nc) => suaHoSoNhanSu(nc, nvA, LuocDoHoSoNhanSu.parse({ maChamCong: "2001" })));
  await voi(T, hr, (nc) => suaHoSoNhanSu(nc, nvB, LuocDoHoSoNhanSu.parse({ maChamCong: "2002" })));

  // ==================================================================
  console.log("— /iclock: cổng máy chấm công —");
  const SN = `QA${DAU.toUpperCase()}X`.slice(0, 20);
  const adms = (phuongThuc: string, doan: string, ts: string, than: string | null = null, ip: string | null = "198.51.100.20", bayGio?: Date) =>
    xuLyAdms({ phuongThuc, doan, truyVan: new URLSearchParams(ts), than, ip }, bayGio ? { bayGio: () => bayGio } : {});
  const may = await voi(T, hr, (nc) => taoMay(nc, LuocDoMayChamCong.parse({ soSeri: SN, ten: "Máy QA", diaDiemId: vp.id })));
  const vpT2 = await voi(T2, ngoai, (nc) => taoDiaDiem(nc, LuocDoDiaDiem.parse({ ten: "VP T2", viDo: 21, kinhDo: 105.8 })));

  dat("SN có khoảng trắng hai đầu vẫn nhận ra đúng máy (đã cắt)", (await adms("GET", "getrequest", `SN=%20${SN}%20`)).status === 200);
  dat("SN chứa ký tự lạ / tiêm SQL → 400", (await adms("GET", "cdata", `SN=${SN}'%20OR%201=1--`)).status === 400);
  dat("Thiếu SN → 400", (await adms("GET", "cdata", "options=all")).status === 400);
  dat("Đường /iclock/cdata/thua (2 đoạn) → 404 ở route", (await getIclock(new NextRequest("http://x/iclock/cdata/thua"), { params: Promise.resolve({ duong: ["cdata", "thua"] }) })).status === 404);

  // SN hoa / thường: máy thật gửi CHỮ HOA. Doanh nghiệp khác đăng ký biến thể chữ thường của SN đã có
  // → phải bị chặn (SN duy nhất toàn hệ thống), không thì một bên có thể "giữ chỗ" SN của bên kia.
  await nemLoi("SN duy nhất toàn hệ thống KHÔNG phân biệt hoa thường — doanh nghiệp khác đăng ký chữ thường bị chặn",
    () => voi(T2, ngoai, (nc) => taoMay(nc, LuocDoMayChamCong.parse({ soSeri: SN.toLowerCase(), ten: "Máy giả", diaDiemId: vpT2.id }))), undefined, "bat-ky");
  const lower = await adms("GET", "getrequest", `SN=${SN.toLowerCase()}`);
  dat("Máy gửi SN chữ thường vẫn nhận ra đúng máy của doanh nghiệp đã đăng ký", lower.status === 200, `${lower.status}`);
  const soMayT2 = await chu.attendanceDevice.count({ where: { tenantId: T2 } });
  dat("…và doanh nghiệp khác không có máy nào mang SN đó", soMayT2 === 0);

  // IP: X-Forwarded-For do khách tự gửi không được tin; X-Real-IP do nginx đặt.
  const h = (o: Record<string, string>) => new Headers(o);
  dat("IP khách: X-Real-IP (nginx đặt) được ưu tiên", layIpKhach(h({ "x-real-ip": "198.51.100.99", "x-forwarded-for": "1.2.3.4" })) === "198.51.100.99");
  dat("IP khách: không lấy phần tử đầu (giả được) của X-Forwarded-For", layIpKhach(h({ "x-forwarded-for": "198.51.100.99, 10.0.0.5" })) === "10.0.0.5");
  await voi(T, hr, (nc) => suaMay(nc, may.id, { ipChoPhep: ["198.51.100.99"] }));
  const xffGia = await getIclock(
    new NextRequest(`http://x/iclock/getrequest?SN=${SN}`, { headers: { "x-forwarded-for": "198.51.100.99, 203.0.113.50" } }),
    { params: Promise.resolve({ duong: ["getrequest"] }) },
  );
  dat("Giả X-Forwarded-For bằng IP văn phòng → vẫn 403 (IP thật do proxy gần nhất thêm)", xffGia.status === 403, `${xffGia.status}`);
  dat("Không có IP nào (thiếu tiêu đề) + có danh sách IP → 403", (await adms("GET", "getrequest", `SN=${SN}`, null, null)).status === 403);
  await voi(T, hr, (nc) => suaMay(nc, may.id, { ipChoPhep: [] }));

  // Thân > 2 MB: khai Content-Length thật, khai sai, và chunked (không Content-Length).
  const tron = "1\t2026-10-05 08:00:00\t0\t1\n".repeat(Math.ceil((2 * 1024 * 1024 + 10) / 24));
  const r413a = await postIclock(new NextRequest(`http://x/iclock/cdata?SN=${SN}&table=ATTLOG`, { method: "POST", body: tron }), { params: Promise.resolve({ duong: ["cdata"] }) });
  dat("Thân > 2 MB (có Content-Length) → 413", r413a.status === 413, `${r413a.status}`);
  const luong = new ReadableStream<Uint8Array>({
    start(c) {
      const k = new TextEncoder().encode("9\t2026-10-05 08:00:00\t0\t1\n".repeat(4000));
      for (let i = 0; i < 30; i++) c.enqueue(k);
      c.close();
    },
  });
  const r413b = await postIclock(
    new NextRequest(`http://x/iclock/cdata?SN=${SN}&table=ATTLOG`, { method: "POST", body: luong, duplex: "half" } as never),
    { params: Promise.resolve({ duong: ["cdata"] }) },
  );
  dat("Thân > 2 MB kiểu chunked (không Content-Length) → 413, không ghi gì", r413b.status === 413 && (await chu.attendancePunch.count({ where: { deviceId: may.id, pin: "9" } })) === 0, `${r413b.status}`);
  const rCl = await postIclock(new NextRequest(`http://x/iclock/cdata?SN=${SN}&table=ATTLOG`, { method: "POST", body: "2001\t2026-10-01 08:00:00\t0\t1\n", headers: { "content-length": "abc" } }), { params: Promise.resolve({ duong: ["cdata"] }) });
  dat("Content-Length rác không làm hỏng (đọc thân thật)", rCl.status === 200, `${rCl.status} ${await rCl.text()}`);

  // Dòng hỏng / PIN bậy / trùng / không theo thứ tự.
  const lo = [
    "2001\t2026-10-02 17:30:00\t1\t1\t0",
    "2001\t2026-10-02 08:01:00\t0\t1\t0", // không theo thứ tự
    "2001\t2026-10-02 08:01:00\t0\t1\t0", // trùng trong cùng lô
    "'; DROP TABLE users;--\t2026-10-02 08:00:00",
    "2002\t2026-02-30 08:00:00", // ngày không có thật
    "2002\t2026-10-02 25:00:00",
    "\0\0",
    "2002",
    "2002 2026-10-02 08:05:00 0 1", // khoảng trắng thay TAB
    "<script>\t2026-10-02 08:00:00",
    "123456789012345678901\t2026-10-02 08:00:00", // PIN 21 ký tự
  ].join("\r\n");
  const up = await adms("POST", "cdata", `SN=${SN}&table=ATTLOG&Stamp=9`, lo);
  const sauUp = await chu.attendancePunch.findMany({ where: { deviceId: may.id }, orderBy: { punchedAt: "asc" } });
  dat("Lô có dòng hỏng / PIN tiêm mã: trả 200 OK: <số dòng không rỗng>", up.status === 200 && up.than === "OK: 10", up.than);
  dat("Chỉ ghi các dòng tốt (2001 ×2 + 2002 khoảng trắng + dòng Content-Length rác), trùng trong lô không nhân đôi", sauUp.length === 4, `${sauUp.length}`);
  const up2 = await adms("POST", "cdata", `SN=${SN}&table=ATTLOG&Stamp=10`, "2001\t2026-10-02 08:01:00\t0\t1\n2001\t2026-10-02 08:01:00\t0\t1");
  dat("Gửi lại dòng cũ → không thêm", up2.than === "OK: 2" && (await chu.attendancePunch.count({ where: { deviceId: may.id } })) === 4);
  const p0 = await adms("POST", "cdata", `SN=${SN}&table=ATTLOG`, "2002\t2026-10-03 00:00:00\t0\t1\n2002\t2026-10-02 23:59:59\t0\t1");
  const nuaDem = await chu.attendancePunch.findMany({ where: { deviceId: may.id, pin: "2002", punchedAt: { gte: new Date("2026-10-02T16:00:00Z"), lt: new Date("2026-10-02T18:00:00Z") } }, orderBy: { punchedAt: "asc" } });
  dat("Ranh giới nửa đêm giờ VN: 23:59:59 → 16:59:59Z, 00:00:00 → 17:00:00Z", p0.status === 200 && nuaDem.map((p) => p.punchedAt.toISOString()).join() === "2026-10-02T16:59:59.000Z,2026-10-02T17:00:00.000Z");

  // Giờ máy lệch: tương lai > 60 phút → cờ; quá khứ xa (mất pin đồng hồ) → vẫn nhận.
  const bayGioMay = vn("2026-10-10T09:00:00");
  await adms("POST", "cdata", `SN=${SN}&table=ATTLOG`, "2001\t2026-10-10 10:30:00\t0\t1\n2001\t2026-10-10 09:30:00\t0\t1\n2001\t2000-01-01 00:00:00\t0\t1", undefined, bayGioMay);
  const lech = await chu.attendancePunch.findMany({ where: { deviceId: may.id, pin: "2001", punchedAt: { gte: vn("2026-10-10T00:00:00") } } });
  const coCo = (iso: string) => (lech.find((p) => p.punchedAt.toISOString() === iso)?.flags as string[] | undefined)?.includes("gio-may-lech");
  dat("Giờ máy đi trước giờ máy chủ 90 phút → cờ giờ máy lệch; 30 phút → không cờ", coCo(vn("2026-10-10T10:30:00").toISOString()) === true && coCo(vn("2026-10-10T09:30:00").toISOString()) === false);

  // QĐ-113: lần chấm giờ máy lệch / vô lý → hàng chờ xem xét, chưa tính công tới khi được chấp nhận.
  const pLech = lech.find((p) => p.punchedAt.toISOString() === vn("2026-10-10T10:30:00").toISOString())!;
  const pThuong = lech.find((p) => p.punchedAt.toISOString() === vn("2026-10-10T09:30:00").toISOString())!;
  const p2000 = await chu.attendancePunch.findFirstOrThrow({ where: { deviceId: may.id, pin: "2001", punchedAt: vn("2000-01-01T00:00:00") } });
  dat("QĐ-113: giờ máy lệch → cần xem xét, CHƯA tính công; lần chấm bình thường không bị ảnh hưởng",
    pLech.needsReview && !duocTinhCong(pLech, undefined) && !pThuong.needsReview && duocTinhCong(pThuong, undefined));
  dat("QĐ-113: năm 2000 (mất pin đồng hồ) → cờ giờ máy vô lý, cần xem xét, chưa tính công",
    (p2000.flags as string[]).includes("gio-may-vo-ly") && p2000.needsReview && !duocTinhCong(p2000, undefined));
  const vl = "2001\t2026-10-12 09:00:00\t0\t1";
  await adms("POST", "cdata", `SN=${SN}&table=ATTLOG`, vl, undefined, bayGioMay);
  const pVl = await chu.attendancePunch.findFirstOrThrow({ where: { deviceId: may.id, pin: "2001", punchedAt: vn("2026-10-12T09:00:00") } });
  dat("QĐ-113: đi trước > 1 ngày → cả cờ lệch lẫn vô lý", ["gio-may-lech", "gio-may-vo-ly"].every((c) => (pVl.flags as string[]).includes(c)) && pVl.needsReview);
  const hangCho = await voi(T, tp, (nc) => bangTrucTiep(nc, { phongBanId: null, diaDiemId: null }, bayGioMay));
  const trongHang = hangCho.canXemXet.find((x) => x.id === pLech.id);
  dat("QĐ-113: quản lý trực tiếp thấy lần chấm vân tay lệch giờ trong hàng chờ (kèm 'chưa tính công'), cả lần năm 2000",
    Boolean(trongHang && trongHang.nguon === "van-tay" && trongHang.chuaTinh) && hangCho.canXemXet.some((x) => x.id === p2000.id));
  await nemLoi("QĐ-113: nhân viên không tự xem xét lần chấm vân tay của mình", () => voi(T, nvA, (nc) => xemXetLanCham(nc, pLech.id, { quyetDinh: "chap-nhan", ghiChu: null })), "khong-tu-duyet");
  await voi(T, tp, (nc) => xemXetLanCham(nc, pLech.id, { quyetDinh: "chap-nhan", ghiChu: "Máy đặt sai giờ, đã kiểm camera" }));
  await voi(T, tp, (nc) => xemXetLanCham(nc, p2000.id, { quyetDinh: "tu-choi", ghiChu: "Giờ máy sai — nhân viên làm giải trình" }));
  const qdLech = await voiTenant(T, (tx) => quyetDinhMoiNhat(tx, [pLech.id, p2000.id]));
  dat("QĐ-113: quản lý chấp nhận → tính công; bác → không tính", duocTinhCong(pLech, qdLech.get(pLech.id)) && !duocTinhCong(p2000, qdLech.get(p2000.id)));

  // Thiết bị ngừng hoạt động → như SN lạ.
  await voi(T, hr, (nc) => suaMay(nc, may.id, { trangThai: "ngung-hoat-dong" }));
  dat("Máy đã ngừng hoạt động → 401", (await adms("GET", "getrequest", `SN=${SN}`)).status === 401);
  await voi(T, hr, (nc) => suaMay(nc, may.id, { trangThai: "hoat-dong" }));

  // QĐ-114: trần tốc độ theo (SN, IP) + trần tổng theo SN, cả hai ở Cấu hình (thử ở doanh nghiệp 2 để không
  // ảnh hưởng máy chính của bài thử).
  const SN_R = `QR${DAU.toUpperCase()}Y`.slice(0, 20);
  await voi(T2, ngoai, (nc) => taoMay(nc, LuocDoMayChamCong.parse({ soSeri: SN_R, ten: "Máy thử trần", diaDiemId: vpT2.id })));
  await chu.tenantSetting.createMany({ data: [
    { tenantId: T2, key: "cham_cong.adms_toi_da_phut_sn_ip", value: 5 },
    { tenantId: T2, key: "cham_cong.adms_toi_da_phut_sn", value: 10 },
  ] });
  const goiR = async (ip: string) => (await adms("GET", "getrequest", `SN=${SN_R}`, null, ip)).status;
  const mayThat = "198.51.100.30";
  const kqThat1 = [await goiR(mayThat), await goiR(mayThat), await goiR(mayThat)];
  const kqLa: number[] = [];
  for (let i = 0; i < 7; i++) kqLa.push(await goiR("203.0.113.66"));
  dat("QĐ-114: người lạ biết SN gửi dồn từ IP khác → chính cặp (SN, IP lạ) bị 429 sau 5 lần (Cấu hình)",
    kqLa.slice(0, 5).every((x) => x === 200) && kqLa.slice(5).every((x) => x === 429), kqLa.join(","));
  const kqThat2 = await goiR(mayThat);
  dat("QĐ-114: …máy thật (IP văn phòng) vẫn gửi được, không bị 429", kqThat1.every((x) => x === 200) && kqThat2 === 200, `${kqThat1.join(",")},${kqThat2}`);
  // Tổng theo SN: 3 + 5 + 1 = 9 lần được nhận (lần bị chặn ở trần (SN, IP) không cộng); thêm hai IP lạ → lần thứ 11 bị chặn.
  const kqIp2 = await goiR("203.0.113.67");
  const kqIp3 = await goiR("203.0.113.68");
  const kqThat3 = await goiR(mayThat);
  dat("QĐ-114: trần TỔNG theo SN (mọi IP) chống lạm dụng nhiều IP: vượt 10 → 429 cho mọi IP",
    kqIp2 === 200 && kqIp3 === 429 && kqThat3 === 429, `${kqIp2},${kqIp3},${kqThat3}`);
  dat("QĐ-114: SN chữ thường đếm chung với SN chữ hoa (không lách trần bằng đổi hoa thường)", (await adms("GET", "getrequest", `SN=${SN_R.toLowerCase()}`, null, "203.0.113.69")).status === 429);

  // Lô rất lớn (lần đồng bộ đầu): ~2 MB, phải xong trong một yêu cầu, không 500 (giao dịch mặc định 5 giây).
  const dongLon: string[] = [];
  for (let i = 0; dongLon.join("\n").length < 1_900_000; i++) {
    const t = new Date(Date.UTC(2026, 0, 1) + i * 61_000 - 7 * 3_600_000);
    const s = new Date(t.getTime() + 7 * 3_600_000).toISOString().replace("T", " ").slice(0, 19);
    dongLon.push(`${3000 + (i % 50)}\t${s}\t0\t1\t0\t0\t0`);
  }
  const batDauLon = Date.now();
  const rLon = await postIclock(
    new NextRequest(`http://x/iclock/cdata?SN=${SN}&table=ATTLOG&Stamp=999`, { method: "POST", body: dongLon.join("\n"), headers: { "x-real-ip": "198.51.100.20" } }),
    { params: Promise.resolve({ duong: ["cdata"] }) },
  );
  const thanLon = await rLon.text();
  dat(`Lô ${dongLon.length.toLocaleString("vi-VN")} dòng (~1,9 MB) → 200 OK: n trong một yêu cầu`, rLon.status === 200 && thanLon === `OK: ${dongLon.length}`, `${rLon.status} ${thanLon} (${Date.now() - batDauLon} ms)`);
  dat("…đủ số lần chấm (PIN chưa khớp vẫn ghi)", (await chu.attendancePunch.count({ where: { deviceId: may.id, pin: { gte: "3000", lt: "3050" } } })) === dongLon.length);

  // PIN chưa khớp → gán người: gán lại lần hai không đổi gì, gán cho người khác bị chặn.
  const g1 = await voi(T, hr, (nc) => anhXaPin(nc, { pin: "3001", nguoiId: nvC }));
  const g2 = await voi(T, hr, (nc) => anhXaPin(nc, { pin: "3001", nguoiId: nvC }));
  dat("Gán PIN chưa khớp: lần hai không gán thêm (idempotent)", g1.soLanCham > 0 && g2.soLanCham === 0);
  await nemLoi("Gán PIN đã thuộc người này cho người khác → 409", () => voi(T, hr, (nc) => anhXaPin(nc, { pin: "3001", nguoiId: ktv })), "pin-da-gan");
  await nemLoi("Doanh nghiệp khác không gán được PIN của máy này (không thấy dòng)", async () => {
    const kq = await voi(T2, ngoai, (nc) => anhXaPin(nc, { pin: "3002", nguoiId: ngoai }));
    if (kq.soLanCham !== 0) throw new Error("đã gán chéo doanh nghiệp");
    throw new LoiNghiepVu("không gán gì", 200, "ok");
  });

  // ==================================================================
  console.log("\n— GPS: dữ liệu bậy, IDOR, hiện trường, xem xét —");
  for (const [ten, d] of [
    ["vĩ độ > 90", { huong: "vao", viDo: 91, kinhDo: 106 }],
    ["kinh độ < -180", { huong: "vao", viDo: 10, kinhDo: -181 }],
    ["vĩ độ là chuỗi", { huong: "vao", viDo: "10.7", kinhDo: 106 }],
    ["vĩ độ NaN", { huong: "vao", viDo: Number.NaN, kinhDo: 106 }],
    ["kinh độ Infinity", { huong: "vao", viDo: 10, kinhDo: Number.POSITIVE_INFINITY }],
    ["độ chính xác âm", { huong: "vao", viDo: 10, kinhDo: 106, doChinhXacM: -5 }],
    ["hướng lạ", { huong: "giua", viDo: 10, kinhDo: 106 }],
  ] as const) {
    dat(`Lược đồ GPS chặn ${ten}`, !LuocDoChamGps.safeParse(d).success);
  }
  const idor = LuocDoChamGps.parse({ huong: "vao", viDo: VP.lat, kinhDo: VP.lng, doChinhXacM: 10, userId: nvB, nguoiId: nvB, punchedAt: "2020-01-01" } as never);
  const gIdor = await voi(T, nvA, (nc) => chamCongGps(nc, idor, vn("2026-10-12T07:58:00")));
  const pIdor = await chu.attendancePunch.findUniqueOrThrow({ where: { id: gIdor.id } });
  dat("IDOR: gửi kèm userId / giờ chấm của người khác → bị bỏ, ghi cho chính mình, giờ máy chủ", pIdor.userId === nvA && pIdor.punchedAt.toISOString() === vn("2026-10-12T07:58:00").toISOString());

  // Phiếu hỗ trợ: của người khác / đã hủy / xong hôm qua → không phải hiện trường.
  const kh = await chu.customer.create({ data: { tenantId: T, code: `KH-${DAU}`, name: "Khách QA", nameNormalized: "khach qa", ownerId: tp } });
  const phieuKhac = await chu.supportTicket.create({ data: { tenantId: T, number: `HT1-${DAU}`, customerId: kh.id, type: "su-co", title: "Phiếu của KTV2", ownerId: tp, assigneeId: ktv2, status: "DANG_XU_LY" } });
  const gK = await voi(T, ktv, (nc) => chamCongGps(nc, { huong: "vao", viDo: XA.lat, kinhDo: XA.lng, doChinhXacM: 20 }, vn("2026-10-12T08:05:00")));
  dat("Ngoài vùng, phiếu đang mở nhưng giao cho NGƯỜI KHÁC → ngoài vùng", gK.ketQua === "ngoai-vung");
  await chu.supportTicket.create({ data: { tenantId: T, number: `HT2-${DAU}`, customerId: kh.id, type: "su-co", title: "Phiếu đã hủy", ownerId: tp, assigneeId: ktv, status: "HUY", closedAt: vn("2026-10-12T07:00:00") } });
  await chu.supportTicket.create({ data: { tenantId: T, number: `HT3-${DAU}`, customerId: kh.id, type: "su-co", title: "Xong hôm qua", ownerId: tp, assigneeId: ktv, status: "HOAN_THANH", resolution: "Đã thay linh kiện", resolvedAt: vn("2026-10-12T23:30:00") } });
  const gK2 = await voi(T, ktv, (nc) => chamCongGps(nc, { huong: "ra", viDo: XA.lat, kinhDo: XA.lng, doChinhXacM: 20 }, vn("2026-10-13T09:00:00")));
  dat("Phiếu của mình nhưng đã hủy / xong từ hôm qua → ngoài vùng", gK2.ketQua === "ngoai-vung", String(gK2.ketQua));
  const gK3 = await voi(T, ktv2, (nc) => chamCongGps(nc, { huong: "vao", viDo: XA.lat, kinhDo: XA.lng, doChinhXacM: 20 }, vn("2026-10-13T08:00:00")));
  dat("Phiếu đang mở giao cho mình → hiện trường, gắn đúng phiếu", gK3.ketQua === "hien-truong" && gK3.phieu?.id === phieuKhac.id);

  // QĐ-115: phiếu phải còn mở + có hoạt động trong N ngày (Cấu hình, mặc định 14) mới tính ngay.
  const ktv3 = await nguoi(T, "ktv3", "technical");
  await voi(T, hr, (nc) => ganLich(nc, { nguoiIds: [ktv3], lichId: lich.id, tuNgay: "2026-01-01", ghiChu: null }));
  await voi(T, ktv3, (nc) => xacNhanThongBaoViTri(nc));
  const cu = vn("2026-09-20T09:00:00");
  const phieuCu = await chu.supportTicket.create({ data: {
    tenantId: T, number: `HT4-${DAU}`, customerId: kh.id, type: "bao-tri", title: "Bảo trì định kỳ (bỏ quên)", ownerId: tp, assigneeId: ktv3, status: "DANG_XU_LY",
    createdAt: cu, updatedAt: cu,
  } });
  const ghiLai = await chu.supportTicket.findUniqueOrThrow({ where: { id: phieuCu.id } });
  dat("(chuẩn bị) phiếu thử giữ đúng mốc cập nhật cũ", ghiLai.updatedAt.getTime() === cu.getTime(), ghiLai.updatedAt.toISOString());
  const gCu = await voi(T, ktv3, (nc) => chamCongGps(nc, { huong: "vao", viDo: XA.lat, kinhDo: XA.lng, doChinhXacM: 20 }, vn("2026-10-16T08:00:00")));
  const pCu = await chu.attendancePunch.findUniqueOrThrow({ where: { id: gCu.id } });
  dat("QĐ-115: phiếu còn mở nhưng im lặng 26 ngày (> 14) → vẫn nhận là hiện trường, gắn phiếu, cờ phiếu cũ, CHƯA tính công",
    gCu.ketQua === "hien-truong" && gCu.phieu?.id === phieuCu.id && gCu.co.includes("phieu-hien-truong-cu") && gCu.choChapNhan && pCu.needsReview && !duocTinhCong(pCu, undefined));
  await chu.tenantSetting.create({ data: { tenantId: T, key: "cham_cong.phieu_hien_truong_ngay", value: 30 } });
  const gCu30 = await voi(T, ktv3, (nc) => chamCongGps(nc, { huong: "ra", viDo: XA.lat, kinhDo: XA.lng, doChinhXacM: 20 }, vn("2026-10-16T17:00:00")));
  dat("QĐ-115: số ngày lấy từ Cấu hình — đặt 30 thì cùng phiếu đó tính ngay", gCu30.ketQua === "hien-truong" && !gCu30.co.includes("phieu-hien-truong-cu") && !gCu30.choChapNhan);
  await chu.tenantSetting.deleteMany({ where: { tenantId: T, key: "cham_cong.phieu_hien_truong_ngay" } });
  await chu.supportTicketEvent.create({ data: { tenantId: T, ticketId: phieuCu.id, type: "ghi-chu", content: "Hẹn khách thứ Hai", createdAt: vn("2026-10-17T10:00:00") } });
  const gEv = await voi(T, ktv3, (nc) => chamCongGps(nc, { huong: "vao", viDo: XA.lat, kinhDo: XA.lng, doChinhXacM: 20 }, vn("2026-10-19T08:00:00")));
  dat("QĐ-115: phiếu có diễn biến xử lý gần đây (ghi chú 2 ngày trước) → hiện trường tính ngay", gEv.ketQua === "hien-truong" && !gEv.choChapNhan);
  await chu.supportTicket.update({ where: { id: phieuCu.id }, data: { status: "HOAN_THANH", resolution: "Xong", resolvedAt: vn("2026-10-20T10:00:00"), updatedAt: vn("2026-10-20T10:00:00") } });
  const gXong = await voi(T, ktv3, (nc) => chamCongGps(nc, { huong: "ra", viDo: XA.lat, kinhDo: XA.lng, doChinhXacM: 20 }, vn("2026-10-20T11:00:00")));
  dat("QĐ-115: phiếu đã xử lý xong trong ngày (không còn mở) → hiện trường + cờ phiếu đã xong, chờ chấp nhận",
    gXong.ketQua === "hien-truong" && gXong.co.includes("phieu-da-xong") && gXong.choChapNhan);
  await nemLoi("QĐ-115: kỹ thuật viên không tự chấp nhận lần chấm theo phiếu cũ của mình", () => voi(T, ktv3, (nc) => xemXetLanCham(nc, gCu.id, { quyetDinh: "chap-nhan", ghiChu: null })), undefined, "bat-ky");
  await voi(T, hr, (nc) => xemXetLanCham(nc, gCu.id, { quyetDinh: "chap-nhan", ghiChu: "Đã gọi khách xác nhận" }));
  const qdCu = await voiTenant(T, (tx) => quyetDinhMoiNhat(tx, [gCu.id]));
  dat("QĐ-115: Nhân sự chấp nhận → lần chấm theo phiếu cũ được tính công", duocTinhCong(pCu, qdCu.get(gCu.id)));

  // Tốc độ: đổi qua lại hai điểm cách 5 km trong 2 phút (bấm trùng 60 giây không chặn) → cờ.
  const s1 = await voi(T, nvB, (nc) => chamCongGps(nc, { huong: "vao", viDo: VP.lat, kinhDo: VP.lng, doChinhXacM: 10 }, vn("2026-10-14T08:00:00")));
  const s2 = await voi(T, nvB, (nc) => chamCongGps(nc, { huong: "ra", viDo: XA.lat, kinhDo: XA.lng, doChinhXacM: 10 }, vn("2026-10-14T08:01:30")));
  const s3 = await voi(T, nvB, (nc) => chamCongGps(nc, { huong: "vao", viDo: VP.lat, kinhDo: VP.lng, doChinhXacM: 10 }, vn("2026-10-14T08:03:00")));
  dat("Nhảy qua lại 5 km trong 90 giây → cả hai lần sau đều gắn cờ tốc độ", !s1.co.includes("toc-do-bat-thuong") && s2.co.includes("toc-do-bat-thuong") && s3.co.includes("toc-do-bat-thuong") && s3.canXemXet);
  const s4 = await voi(T, nvB, (nc) => chamCongGps(nc, { huong: "ra", viDo: XA.lat, kinhDo: XA.lng, doChinhXacM: 3000 }, vn("2026-10-14T08:05:00")));
  dat("Khai độ chính xác 3 km để 'trừ sai số' lách cờ tốc độ → vẫn bị cờ độ chính xác thấp, cần xem xét", s4.co.includes("do-chinh-xac-thap") && s4.canXemXet);

  // Xem xét: Nhân sự (phạm vi duyệt all) KHÔNG tự xem xét lần chấm ngoài vùng của chính mình (NS-12).
  const gHr = await voi(T, hr, (nc) => chamCongGps(nc, { huong: "vao", viDo: XA.lat, kinhDo: XA.lng, doChinhXacM: 10 }, vn("2026-10-15T08:00:00")));
  await nemLoi("NS-12: Nhân sự (phạm vi all) không tự chấp nhận lần chấm ngoài vùng của chính mình", () => voi(T, hr, (nc) => xemXetLanCham(nc, gHr.id, { quyetDinh: "chap-nhan", ghiChu: null })), "khong-tu-duyet");
  const bHr = await voi(T, hr, (nc) => bangTrucTiep(nc, { phongBanId: null, diaDiemId: null }, vn("2026-10-15T09:00:00")));
  dat("…và lần chấm của chính mình không nằm trong hàng chờ xem xét của mình", !bHr.canXemXet.some((p) => p.id === gHr.id));
  await voi(T, hr2, (nc) => xemXetLanCham(nc, gHr.id, { quyetDinh: "chap-nhan", ghiChu: null }));
  dat("…Nhân sự khác chấp nhận được", (await chu.attendancePunchReview.count({ where: { punchId: gHr.id } })) === 1);
  await nemLoi("Trưởng phòng không xem xét lần chấm của người ngoài nhóm (KTV)", () => voi(T, tp, (nc) => xemXetLanCham(nc, gK.id, { quyetDinh: "chap-nhan", ghiChu: null })), undefined, "bat-ky");
  await nemLoi("Nhân viên thường không xem xét lần chấm của đồng nghiệp", () => voi(T, nvA, (nc) => xemXetLanCham(nc, gK.id, { quyetDinh: "chap-nhan", ghiChu: null })), undefined, "bat-ky");
  await nemLoi("Doanh nghiệp khác không thấy lần chấm để xem xét", () => voi(T2, ngoai, (nc) => xemXetLanCham(nc, gK.id, { quyetDinh: "chap-nhan", ghiChu: null })), undefined, "khong-thay");

  // ==================================================================
  console.log("\n— Phân quyền: thực tập sinh, phạm vi, RLS từng bảng mới —");
  await nemLoi("Thực tập sinh không xem được khách hàng", () => voi(T, tts, (nc) => danhSachKhachHang(nc, {} as never)), undefined, "quyen");
  await nemLoi("Thực tập sinh không xem được sản phẩm / giá", () => voi(T, tts, (nc) => danhSachSanPham(nc, {} as never)), undefined, "quyen");
  await nemLoi("Thực tập sinh không xem được đơn hàng", () => voi(T, tts, (nc) => danhSachDonHang(nc, {} as never)), undefined, "quyen");
  const tk = await voi(T, tts, (nc) => timKiemToanCuc(nc, "Khách QA"));
  dat("Tìm kiếm toàn cục của thực tập sinh không trả khách hàng", !tk.some((k) => JSON.stringify(k).includes("Khách QA")), JSON.stringify(tk).slice(0, 200));
  const hsTts = await voiTenant(T, (tx) => layHoSoQuyen(tx, tts));
  const cam = [...hsTts!.quyen].filter((q) => /^(customer|crm|sales|order|product|finance|quote|purchasing|inventory|marketing)\./.test(q));
  dat("Thực tập sinh không có mã quyền khách / giá / đơn / tài chính", cam.length === 0, cam.join(","));
  const hsAi = await chu.rolePermission.count({ where: { tenantId: T, role: { code: "ai-assistant" }, permission: { code: { startsWith: "cham_cong" } } } });
  dat("Trợ lý AI không có quyền chấm công", hsAi === 0);

  const bTts = await voi(T, tts, (nc) => bangTrucTiep(nc, { phongBanId: null, diaDiemId: null }, vn("2026-10-15T09:00:00")));
  dat("Bảng trực tiếp: thực tập sinh chỉ thấy mình, không thấy máy, không có hàng chờ", bTts.dong.length === 1 && bTts.dong[0].id === tts && bTts.may === null && bTts.canXemXet.length === 0);
  const bKtv = await voi(T, ktv, (nc) => bangTrucTiep(nc, { phongBanId: null, diaDiemId: null }, vn("2026-10-15T09:00:00")));
  dat("Bảng trực tiếp: kỹ thuật viên (vai trò phạm vi rộng hơn ở phân hệ khác) vẫn chỉ thấy mình", bKtv.dong.length === 1 && bKtv.dong[0].id === ktv);
  await nemLoi("Nhân viên không đọc quỹ phép của đồng nghiệp", () => voi(T, nvA, (nc) => soDuPhepCua(nc, nvB, 2026)), undefined, "khong-thay");

  // RLS: mọi bảng mới có tenant_id — đọc trong ngữ cảnh doanh nghiệp khác = 0, chèn tenant_id lạ bị chặn.
  const bangMoi = [
    "work_locations", "work_shifts", "work_schedules", "schedule_assignments", "holidays", "intern_profiles", "employment_contracts",
    "attendance_devices", "attendance_punches", "attendance_punch_reviews", "attendance_consents", "attendance_corrections", "leave_types",
    "leave_balances", "leave_adjustments", "leave_requests", "overtime_requests", "timesheets", "timesheet_rows", "timesheet_feedback",
    "attendance_day_reviews",
  ];
  const rlsBat = await chu.$queryRawUnsafe<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>(
    `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = ANY($1::text[])`, bangMoi,
  );
  dat("RLS bật trên cả 21 bảng mới", rlsBat.length === bangMoi.length && rlsBat.every((r) => r.relrowsecurity), rlsBat.filter((r) => !r.relrowsecurity).map((r) => r.relname).join(","));
  const roRi: string[] = [];
  for (const b of bangMoi) {
    const n = await voiTenant(T2, (tx) => tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${b} WHERE tenant_id = $1::uuid`, T));
    if (Number(n[0].n) !== 0) roRi.push(b);
  }
  dat("Đọc trong ngữ cảnh doanh nghiệp khác: 0 dòng ở mọi bảng mới", roRi.length === 0, roRi.join(","));
  await nemLoi("RLS: chèn lần chấm mang tenant_id của doanh nghiệp khác bị chặn", () => voiTenant(T2, (tx) => tx.attendancePunch.create({ data: { tenantId: T, userId: nvA, punchedAt: new Date(), source: "gps", gpsResult: "hop-le" } })), undefined, "csdl");
  await nemLoi("RLS: chèn đơn nghỉ cho doanh nghiệp khác bị chặn", async () => {
    const lt = await chu.leaveType.findFirstOrThrow({ where: { tenantId: T } });
    await voiTenant(T2, (tx) => tx.leaveRequest.create({ data: { tenantId: T, userId: nvA, leaveTypeId: lt.id, startDate: new Date("2026-12-01"), endDate: new Date("2026-12-01"), days: 1, reason: "xx" } }));
  }, undefined, "csdl");
  await nemLoi("Vai ứng dụng không xóa được lần chấm (REVOKE DELETE)", () => voiTenant(T, (tx) => tx.$executeRawUnsafe(`DELETE FROM attendance_punches WHERE id = $1::uuid`, gIdor.id)), undefined, "csdl");

  // ==================================================================
  console.log("\n— Nghỉ phép —");
  const loaiPhep = await chu.leaveType.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code: "phep-nam" } } });
  const loaiKL = await chu.leaveType.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code: "khong-luong" } } });
  // Thứ Bảy 07/11/2026 chỉ làm SÁNG: xin nghỉ CHIỀU thứ Bảy là xin nghỉ phần không phải làm.
  await nemLoi("Nghỉ nửa ngày CHIỀU vào thứ Bảy (lịch chỉ làm sáng) → 0 ngày, chặn — không trừ oan 0,5 phép",
    () => voi(T, nvC, (nc) => taoDonNghi(nc, LuocDoDonNghi.parse({ loaiNghiId: loaiPhep.id, tuNgay: "2026-11-07", denNgay: "2026-11-07", phan: "chieu", lyDo: "Thử nửa ngày" }))), "khong-co-ngay-lam");
  const sang7 = await voi(T, nvC, (nc) => taoDonNghi(nc, LuocDoDonNghi.parse({ loaiNghiId: loaiKL.id, tuNgay: "2026-11-07", denNgay: "2026-11-07", phan: "sang", lyDo: "Nghỉ sáng thứ Bảy" })));
  dat("Nghỉ SÁNG thứ Bảy (lịch làm sáng) = 0,5 ngày", sang7.soNgay === 0.5);
  await voi(T, hr, (nc) => quyetDinhNghi(nc, sang7.id, { hanhDong: "duyet", ghiChu: null }));
  await nemLoi("Cả ngày chỉ gồm Chủ nhật → chặn", () => voi(T, nvC, (nc) => taoDonNghi(nc, LuocDoDonNghi.parse({ loaiNghiId: loaiPhep.id, tuNgay: "2026-11-08", denNgay: "2026-11-08", lyDo: "CN" }))), "khong-co-ngay-lam");
  const quaLe = await voi(T, nvC, (nc) => taoDonNghi(nc, LuocDoDonNghi.parse({ loaiNghiId: loaiKL.id, tuNgay: "2026-08-31", denNgay: "2026-09-06", lyDo: "Nghỉ tuần lễ" })));
  dat("Đơn 31/08 → 06/09 qua lễ 02/09 + thứ Bảy nửa ngày + Chủ nhật = 4,5 ngày", quaLe.soNgay === 4.5, `${quaLe.soNgay}`);
  await nemLoi("Đơn qua năm mới → tách", async () => LuocDoDonNghi.parse({ loaiNghiId: loaiPhep.id, tuNgay: "2026-12-31", denNgay: "2027-01-02", lyDo: "x x" }), undefined, "bat-ky");

  // Gửi trùng ĐỒNG THỜI: hai yêu cầu cùng khoảng → chỉ một đơn được tạo.
  const donDua = await Promise.allSettled([0, 1].map(() =>
    voi(T, nvB, (nc) => taoDonNghi(nc, LuocDoDonNghi.parse({ loaiNghiId: loaiKL.id, tuNgay: "2026-12-14", denNgay: "2026-12-15", lyDo: "Bấm đúp" })))));
  const soDonDua = await chu.leaveRequest.count({ where: { userId: nvB, startDate: new Date("2026-12-14T00:00:00Z") } });
  dat("Hai lần gửi đơn nghỉ chồng nhau cùng lúc → chỉ một đơn", soDonDua === 1, `${soDonDua} đơn; ${donDua.map((r) => r.status === "rejected" ? moTa(r.reason) : "ok").join(" | ")}`);

  // Xin bù phép năm cho ngày đã qua (cộng dồn theo tháng): gửi và duyệt phải cùng một mốc tích lũy.
  await chu.tenantSetting.create({ data: { tenantId: T, key: "nghi_phep.cong_don_theo_thang", value: 1 } });
  const homNay = new Date();
  const thangNay = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", month: "numeric" }).format(homNay));
  const namNay = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric" }).format(homNay));
  if (thangNay >= 3) {
    // Tháng 1 chỉ tích lũy 1/12 × 12 = 1 ngày; tới tháng hiện tại đã có ≥ 3 ngày. Xin 2 ngày phép cho tuần đầu tháng 1.
    await chu.scheduleAssignment.create({ data: { tenantId: T, userId: nvA, scheduleId: lich.id, effectiveFrom: new Date(`${namNay}-01-01T00:00:00Z`) } }).catch(() => null);
    const d = new Date(Date.UTC(namNay, 0, 5));
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
    const t2 = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
    const t3 = d.toISOString().slice(0, 10);
    try {
      const bu = await voi(T, nvA, (nc) => taoDonNghi(nc, LuocDoDonNghi.parse({ loaiNghiId: loaiPhep.id, tuNgay: t2, denNgay: t3, lyDo: "Bổ sung đơn nghỉ ốm đã nghỉ" })));
      const duyet = await voi(T, tp, (nc) => quyetDinhNghi(nc, bu.id, { hanhDong: "duyet", ghiChu: null }));
      dat("Xin phép năm bù cho ngày đã qua: gửi được (tích lũy tính tới hôm nay, như lúc duyệt)", duyet.trangThai === "da-duyet");
      // Hủy đơn đã duyệt hai lần → phép trả về đúng một lần.
      const truocHuy = await voi(T, nvA, (nc) => soDuPhepCua(nc, null, namNay));
      await voi(T, tp, (nc) => quyetDinhNghi(nc, bu.id, { hanhDong: "huy", ghiChu: "Nhập nhầm" }));
      await nemLoi("Hủy lần hai → đã xử lý", () => voi(T, tp, (nc) => quyetDinhNghi(nc, bu.id, { hanhDong: "huy", ghiChu: "Lần nữa" })), "da-xu-ly");
      const sauHuy = await voi(T, nvA, (nc) => soDuPhepCua(nc, null, namNay));
      dat("Hủy đơn đã duyệt: trả đúng 2 ngày, một lần", sauHuy.daDung === truocHuy.daDung - 2 && sauHuy.duocDung === truocHuy.duocDung + 2, `${truocHuy.duocDung} → ${sauHuy.duocDung}`);
    } catch (e) {
      dat("Xin phép năm bù cho ngày đã qua: gửi được (tích lũy tính tới hôm nay, như lúc duyệt)", false, moTa(e));
    }
  }
  const donTp = await voi(T, tp, (nc) => taoDonNghi(nc, LuocDoDonNghi.parse({ loaiNghiId: loaiKL.id, tuNgay: "2026-12-21", denNgay: "2026-12-21", lyDo: "Việc riêng" })));
  await nemLoi("Trưởng phòng (phạm vi duyệt team) không tự duyệt đơn của mình", () => voi(T, tp, (nc) => quyetDinhNghi(nc, donTp.id, { hanhDong: "duyet", ghiChu: null })), "khong-tu-duyet");
  await nemLoi("Nhân viên cùng nhóm không duyệt đơn của trưởng phòng", () => voi(T, nvA, (nc) => quyetDinhNghi(nc, donTp.id, { hanhDong: "duyet", ghiChu: null })), undefined, "bat-ky");

  // ==================================================================
  console.log("\n— Tăng ca, giải trình: gửi trùng đồng thời, qua nửa đêm, ngày lễ —");
  const tcDua = await Promise.allSettled([0, 1, 2].map(() => voi(T, nvB, (nc) => taoDonTangCa(nc, { ngay: "2026-10-20", soGio: 2, lyDo: "Bấm ba lần" }))));
  const soTc = await chu.overtimeRequest.count({ where: { userId: nvB, workDate: new Date("2026-10-20T00:00:00Z") } });
  dat("Ba lần gửi đơn tăng ca cùng ngày cùng lúc → chỉ một đơn", soTc === 1, `${soTc} đơn; ${tcDua.map((r) => r.status === "rejected" ? moTa(r.reason) : "ok").join(" | ")}`);
  const gtDua = await Promise.allSettled([0, 1].map(() =>
    voi(T, nvB, (nc) => taoGiaiTrinh(nc, LuocDoGiaiTrinh.parse({ ngay: "2026-10-21", gio: "08:00", huong: "vao", lyDo: "Quên chấm buổi sáng" })))));
  const soGt = await chu.attendanceCorrection.count({ where: { userId: nvB, workDate: new Date("2026-10-21T00:00:00Z"), status: "cho-duyet" } });
  dat("Hai lần gửi giải trình cùng ngày cùng chiều cùng lúc → chỉ một đơn chờ", soGt === 1, `${soGt} đơn; ${gtDua.map((r) => r.status === "rejected" ? moTa(r.reason) : "ok").join(" | ")}`);
  await nemLoi("Giải trình cho thời điểm chưa tới → chặn", () => voi(T, nvB, (nc) => taoGiaiTrinh(nc, LuocDoGiaiTrinh.parse({ ngay: "2099-01-01", gio: "08:00", huong: "vao", lyDo: "Chấm trước cho chắc" }))), undefined, "bat-ky");

  // Qua nửa đêm: ngày thường 22/10 (thứ Năm), vào 07:58, ra 00:40 sáng hôm sau; duyệt 6 giờ.
  const tcDem = await voi(T, nvC, (nc) => taoDonTangCa(nc, { ngay: "2026-10-22", soGio: 8, lyDo: "Triển khai ban đêm" }));
  await voi(T, hr, (nc) => quyetDinhTangCa(nc, tcDem.id, { hanhDong: "duyet", ghiChu: null, gioDuyet: 6 }));
  await voi(T, nvC, (nc) => chamCongGps(nc, { huong: "vao", viDo: VP.lat, kinhDo: VP.lng, doChinhXacM: 10 }, vn("2026-10-22T07:58:00")));
  await voi(T, nvC, (nc) => chamCongGps(nc, { huong: "ra", viDo: VP.lat, kinhDo: VP.lng, doChinhXacM: 10 }, vn("2026-10-23T00:40:00")));
  const ttDem = await voi(T, hr, (nc) => tangCaThucTe(nc, tcDem.id));
  dat("Tăng ca qua nửa đêm: thực tế 17:00 → 00:40 = 460 phút, tính 360 (trần duyệt), đêm 22:00 → 23:00 = 60", ttDem.phutThucTe === 460 && ttDem.phut === 360 && ttDem.phutDem === 60, JSON.stringify(ttDem));
  // Ngày lễ 02/09: làm 08:00 → 17:00 (phủ trọn nghỉ trưa) = 480 phút, loại "le".
  const tcLe = await voi(T, nvC, (nc) => taoDonTangCa(nc, { ngay: "2026-09-02", soGio: 10, lyDo: "Trực lễ" }));
  await voi(T, hr, (nc) => quyetDinhTangCa(nc, tcLe.id, { hanhDong: "duyet", ghiChu: null }));
  await chu.attendancePunch.createMany({ data: [
    { tenantId: T, userId: nvC, punchedAt: vn("2026-09-02T08:00:00"), source: "nhap-csv", pin: "QA1" },
    { tenantId: T, userId: nvC, punchedAt: vn("2026-09-02T17:00:00"), source: "nhap-csv", pin: "QA1" },
  ] });
  const ttLe = await voi(T, hr, (nc) => tangCaThucTe(nc, tcLe.id));
  dat("Tăng ca ngày lễ: cả khoảng trừ nghỉ trưa = 480 phút, loại ngày lễ", ttLe.loaiNgay === "le" && ttLe.phut === 480, JSON.stringify(ttLe));
  const tcCho = await voi(T, nvC, (nc) => taoDonTangCa(nc, { ngay: "2026-10-26", soGio: 1, lyDo: "Chưa duyệt" }));
  await voi(T, nvC, (nc) => chamCongGps(nc, { huong: "vao", viDo: VP.lat, kinhDo: VP.lng, doChinhXacM: 10 }, vn("2026-10-26T08:00:00")));
  await voi(T, nvC, (nc) => chamCongGps(nc, { huong: "ra", viDo: VP.lat, kinhDo: VP.lng, doChinhXacM: 10 }, vn("2026-10-26T19:00:00")));
  const ttCho = await voi(T, hr, (nc) => tangCaThucTe(nc, tcCho.id));
  dat("Đơn chưa duyệt: tăng ca tính = 0 dù làm thêm 120 phút", ttCho.phut === 0 && ttCho.phutThucTe === 120);

  // ==================================================================
  console.log("\n— QĐ-116: vào / ra sát nhau → ngày thiếu giờ, quản lý quyết —");
  await chu.attendancePunch.createMany({ data: [
    { tenantId: T, userId: nvB, punchedAt: vn("2026-10-27T08:00:00"), source: "nhap-csv", pin: "QA2" },
    { tenantId: T, userId: nvB, punchedAt: vn("2026-10-27T10:00:00"), source: "nhap-csv", pin: "QA2" },
    { tenantId: T, userId: nvB, punchedAt: vn("2026-10-28T08:00:00"), source: "nhap-csv", pin: "QA2" },
    { tenantId: T, userId: nvB, punchedAt: vn("2026-10-28T17:00:00"), source: "nhap-csv", pin: "QA2" },
  ] });
  const congB = async () => voiTenant(T, async (tx) => tinhCong(tx, await docCauHinhChamCong(tx), [nvB], ["2026-10-27", "2026-10-28"]));
  const [b27, b28] = await congB();
  dat("QĐ-116: vào 08:00 ra 10:00 (có mặt 120 / 480 phút < 50%) → cờ thiếu giờ, chờ xét, KHÔNG tự trừ (vẫn 1 công)",
    b27.co.includes("thieu-gio") && b27.co.includes("thieu-gio-cho-xem-xet") && b27.congThucTe === 1 && b27.phutCoMat === 120 && b27.phutPhaiCoMat === 480, JSON.stringify(b27.co));
  dat("QĐ-116: ngày làm đủ (08:00 → 17:00) không có cờ thiếu giờ", !b28.co.includes("thieu-gio"));
  const bayGioXet = vn("2026-10-29T09:00:00");
  const hangTp = await voi(T, tp, (nc) => ngayThieuGioCanXemXet(nc, bayGioXet));
  dat("QĐ-116: ngày thiếu giờ vào hàng chờ của quản lý trực tiếp (chỉ ngày đó)", hangTp.some((x) => x.nguoi.id === nvB && x.ngay === "2026-10-27") && !hangTp.some((x) => x.ngay === "2026-10-28"));
  const hangB = await voi(T, nvB, (nc) => ngayThieuGioCanXemXet(nc, bayGioXet));
  dat("QĐ-116: nhân viên không thấy hàng chờ (không có quyền duyệt)", hangB.length === 0);
  const hangHr = await voi(T, hr, (nc) => ngayThieuGioCanXemXet(nc, bayGioXet));
  dat("QĐ-116: Nhân sự (phạm vi toàn công ty) cũng thấy", hangHr.some((x) => x.nguoi.id === nvB && x.ngay === "2026-10-27"));
  await nemLoi("QĐ-116: không tự xét ngày công của mình", () => voi(T, nvB, (nc) => xetNgayThieuGio(nc, { nguoiId: nvB, ngay: "2026-10-27", quyetDinh: "du", ghiChu: null }, bayGioXet)), "khong-tu-duyet");
  await nemLoi("QĐ-116: đồng nghiệp không xét được", () => voi(T, nvA, (nc) => xetNgayThieuGio(nc, { nguoiId: nvB, ngay: "2026-10-27", quyetDinh: "du", ghiChu: null }, bayGioXet)), undefined, "bat-ky");
  await nemLoi("QĐ-116: không tính công phải có lý do", () => voi(T, tp, (nc) => xetNgayThieuGio(nc, { nguoiId: nvB, ngay: "2026-10-27", quyetDinh: "khong", ghiChu: null }, bayGioXet)), "thieu-ly-do");
  await nemLoi("QĐ-116: ngày không thiếu giờ thì không xét", () => voi(T, tp, (nc) => xetNgayThieuGio(nc, { nguoiId: nvB, ngay: "2026-10-28", quyetDinh: "khong", ghiChu: "Thử" }, bayGioXet)), "khong-thieu-gio");
  await nemLoi("QĐ-116: không xét ngày chưa qua", () => voi(T, tp, (nc) => xetNgayThieuGio(nc, { nguoiId: nvB, ngay: "2026-10-27", quyetDinh: "du", ghiChu: null }, vn("2026-10-27T11:00:00"))), "chua-het-ngay");
  await voi(T, tp, (nc) => xetNgayThieuGio(nc, { nguoiId: nvB, ngay: "2026-10-27", quyetDinh: "nua", ghiChu: "Về sớm có việc gia đình" }, bayGioXet));
  const [b27n] = await congB();
  dat("QĐ-116: quản lý tính NỬA công → 0,5; cờ ghi rõ quyết định, hết chờ xét", b27n.congThucTe === 0.5 && b27n.co.includes("thieu-gio-tinh-nua") && !b27n.co.includes("thieu-gio-cho-xem-xet"), JSON.stringify(b27n));
  const hangTp2 = await voi(T, tp, (nc) => ngayThieuGioCanXemXet(nc, bayGioXet));
  dat("QĐ-116: đã xét → rời hàng chờ", !hangTp2.some((x) => x.nguoi.id === nvB && x.ngay === "2026-10-27"));
  await nemLoi("QĐ-116: quyết định xét ngày chỉ ghi thêm (vai chủ sở hữu cũng không sửa được)", () => chu.attendanceDayReview.updateMany({ where: { userId: nvB }, data: { decision: "du" } }), undefined, "csdl");
  await chu.tenantSetting.create({ data: { tenantId: T, key: "cham_cong.co_mat_toi_thieu_phan_tram", value: 0 } });
  const [b27tat] = await congB();
  dat("QĐ-116: Cấu hình = 0 → không kiểm thiếu giờ", !b27tat.co.includes("thieu-gio") && b27tat.congThucTe === 1);
  await chu.tenantSetting.deleteMany({ where: { tenantId: T, key: "cham_cong.co_mat_toi_thieu_phan_tram" } });

  // ==================================================================
  console.log("\n— Bảng công: chèn công thức CSV, hạn phản hồi, khóa —");
  const sinhLuc = vn("2026-11-01T09:00:00");
  const bc = await voi(T, hr, (nc) => sinhBangCong(nc, { nam: 2026, thang: 10 }, sinhLuc));
  const ctBc = await voi(T, hr, (nc) => chiTietBangCong(nc, bc.id, nvB));
  const d27 = ctBc.dong.find((r) => r.ngay === "2026-10-27" && !r.laDieuChinh);
  dat("QĐ-116: bảng công hiển thị cờ thiếu giờ + quyết định, công 0,5", Boolean(d27 && d27.congThucTe === 0.5 && d27.nhanCo.some((n) => n.startsWith("Thiếu giờ — quản lý tính nửa"))), JSON.stringify(d27?.nhanCo));
  const csv1 = await voi(T, hr, (nc) => xuatCsvBangCong(nc, bc.id, "tong-hop"));
  const csv2 = await voi(T, hr, (nc) => xuatCsvBangCong(nc, bc.id, "chi-tiet"));
  const coCongThuc = (s: string) => s.split("\r\n").some((d) => d.split(",").some((o) => /^"?[=+\-@]/.test(o) && !/^"?-?\d/.test(o)));
  dat("CSV tổng hợp: họ tên bắt đầu '=' bị vô hiệu (không còn ô mở đầu = + - @)", csv1.noiDung.startsWith("﻿") && !coCongThuc(csv1.noiDung) && csv1.noiDung.includes("HYPERLINK"));
  dat("CSV chi tiết: cũng vô hiệu công thức", !coCongThuc(csv2.noiDung) && csv2.noiDung.includes("HYPERLINK"));
  await nemLoi("Phản hồi sau hạn → chặn", () => voi(T, nvB, (nc) => guiPhanHoiCong(nc, bc.id, { ngay: null, noiDung: "Phản hồi trễ hạn" }, new Date(sinhLuc.getTime() + 5 * 86_400_000))), "het-han-phan-hoi");
  const bc2 = await voi(T, hr, (nc) => sinhBangCong(nc, { nam: 2026, thang: 10 }, new Date(sinhLuc.getTime() + 2 * 86_400_000)));
  const ts = await chu.timesheet.findUniqueOrThrow({ where: { id: bc2.id } });
  dat("Sinh lại không dời hạn phản hồi (tính từ lần sinh đầu)", bc2.id === bc.id && ts.feedbackDeadline.getTime() === sinhLuc.getTime() + 3 * 86_400_000);
  await nemLoi("Doanh nghiệp khác không xem bảng công này", () => voi(T2, ngoai, (nc) => chiTietBangCong(nc, bc.id)), undefined, "khong-thay");
  const sau = new Date(sinhLuc.getTime() + 4 * 86_400_000);
  await voi(T, hr, (nc) => khoaBangCong(nc, bc.id, sau));
  await nemLoi("Đã khóa: không sinh lại", () => voi(T, hr, (nc) => sinhBangCong(nc, { nam: 2026, thang: 10 }, sau)), "da-khoa");
  await nemLoi("Đã khóa: không khóa lại", () => voi(T, hr, (nc) => khoaBangCong(nc, bc.id, sau)), "da-khoa");
  await nemLoi("Đã khóa: vai chủ sở hữu xóa dòng công → trigger chặn", () => chu.timesheetRow.deleteMany({ where: { timesheetId: bc.id } }), undefined, "csdl");
  await nemLoi("Đã khóa: vai chủ sở hữu chuyển dòng sang bảng khác → trigger chặn", async () => {
    const r = await chu.timesheetRow.findFirstOrThrow({ where: { timesheetId: bc.id } });
    const khac = await chu.timesheet.create({ data: { tenantId: T, year: 2026, month: 1, generatedAt: new Date(), feedbackDeadline: new Date() } });
    await chu.timesheetRow.update({ where: { id: r.id }, data: { timesheetId: khac.id } });
  }, undefined, "csdl");

  // ==================================================================
  console.log("\n— QĐ-117: doanh nghiệp khác sau nâng cấp có đủ dữ liệu nền Nhân sự —");
  // Doanh nghiệp "cũ" (trước 0.19.0): chỉ có Giám đốc / Quản trị, chưa có quyền chấm công, vai trò, loại nghỉ.
  const taoDnCu = async (ma: string) => {
    const t3 = await chu.tenant.create({ data: { code: ma, name: `Doanh nghiệp cũ ${ma}`, status: "hoat-dong" } });
    for (const code of ["ceo", "admin"]) {
      const r = await chu.role.create({ data: { tenantId: t3.id, code, name: code, isBuiltIn: true } });
      const p = await chu.permission.findFirstOrThrow({ where: { code: "customer.view" } });
      await chu.rolePermission.create({ data: { tenantId: t3.id, roleId: r.id, permissionId: p.id, dataScope: "all" } });
    }
    return t3.id;
  };
  type AnhQuyen = Record<string, string[]>;
  const anhQuyen = async (t: string): Promise<AnhQuyen> => {
    const ds = await chu.rolePermission.findMany({
      where: { tenantId: t, role: { code: { in: ["nhan-su-hr", "sinh-vien-thuc-tap", "ceo", "admin"] } } },
      select: { dataScope: true, role: { select: { code: true } }, permission: { select: { code: true } } },
    });
    const kq: AnhQuyen = {};
    for (const r of ds) {
      // Giám đốc / Quản trị: chỉ so phần Nhân sự (phần khác đã có từ trước, không thuộc QĐ này).
      if (["ceo", "admin"].includes(r.role.code) && !/^(cham_cong|nhan_su)\./.test(r.permission.code)) continue;
      (kq[r.role.code] ??= []).push(`${r.permission.code}:${r.dataScope}`);
    }
    for (const k of Object.keys(kq)) kq[k].sort();
    return kq;
  };
  const MIGRATION = readFileSync("prisma/migrations/20261102090006_qa_cham_cong_moi_doanh_nghiep/migration.sql", "utf8");
  const T3 = await taoDnCu(`qa-cc3-${DAU}`);
  await chu.$executeRawUnsafe(MIGRATION);
  const aT3 = await anhQuyen(T3);
  const aT = await anhQuyen(T); // doanh nghiệp tạo bằng seed — chuẩn để so
  dat("QĐ-117 (migration): doanh nghiệp thứ hai có vai trò Nhân sự (HR) đúng quyền + phạm vi như seed", JSON.stringify(aT3["nhan-su-hr"]) === JSON.stringify(aT["nhan-su-hr"]), JSON.stringify(aT3["nhan-su-hr"]));
  dat("QĐ-117 (migration): …vai trò Thực tập sinh đúng như seed", JSON.stringify(aT3["sinh-vien-thuc-tap"]) === JSON.stringify(aT["sinh-vien-thuc-tap"]));
  dat("QĐ-117 (migration): …Giám đốc / Quản trị có đủ 12 quyền chấm công + nhân sự (như seed)",
    aT3.ceo?.length === 12 && JSON.stringify(aT3.ceo) === JSON.stringify(aT.ceo) && JSON.stringify(aT3.admin) === JSON.stringify(aT.admin));
  const ln3 = (await chu.leaveType.findMany({ where: { tenantId: T3 }, select: { code: true, paid: true, usesBalance: true }, orderBy: { code: "asc" } }));
  const lnT = (await chu.leaveType.findMany({ where: { tenantId: T }, select: { code: true, paid: true, usesBalance: true }, orderBy: { code: "asc" } }));
  dat("QĐ-117 (migration): …4 loại nghỉ như seed", ln3.length === 4 && JSON.stringify(ln3) === JSON.stringify(lnT));
  // Chạy lại = không đổi gì; quyền đã gỡ trên màn hình Vai trò không bị cấp lại; loại nghỉ đã tắt không bật lại.
  const hr3 = await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T3, code: "nhan-su-hr" } } });
  await chu.rolePermission.deleteMany({ where: { roleId: hr3.id, permission: { code: "cham_cong.export" } } });
  await chu.leaveType.updateMany({ where: { tenantId: T3, code: "om-dau" }, data: { status: "ngung-hoat-dong" } });
  const demTruoc = await chu.rolePermission.count({ where: { tenantId: T3 } });
  await chu.$executeRawUnsafe(MIGRATION);
  dat("QĐ-117 (migration): chạy lại không đổi gì — quyền đã gỡ trên màn hình không bị cấp lại, loại nghỉ đã tắt giữ nguyên",
    (await chu.rolePermission.count({ where: { tenantId: T3 } })) === demTruoc && (await chu.leaveType.count({ where: { tenantId: T3 } })) === 4
      && (await chu.leaveType.findFirstOrThrow({ where: { tenantId: T3, code: "om-dau" } })).status === "ngung-hoat-dong");
  const chT3 = await voiTenant(T3, (tx) => docCauHinhChamCong(tx));
  dat("QĐ-117: khóa Cấu hình chấm công / nghỉ phép dùng được ngay ở doanh nghiệp mới (mặc định của danh mục)",
    chT3.banKinhMacDinhM === 150 && chT3.phepSoNgayNam === 12 && chT3.phieuHienTruongNgay === 14 && chT3.coMatToiThieuPhanTram === 50 && chT3.admsToiDaPhutSn === 600);
  // Đường seed: `npm run db:seed` nay gọi seedDuLieuDoanhNghiep cho MỌI doanh nghiệp.
  const T4 = await taoDnCu(`qa-cc4-${DAU}`);
  const t4 = await chu.tenant.findUniqueOrThrow({ where: { id: T4 } });
  await seedDuLieuDoanhNghiep(chu, t4, await seedDanhMucQuyen(chu));
  const aT4 = await anhQuyen(T4);
  dat("QĐ-117 (seed): seed cho doanh nghiệp không phải mã chính cũng cấp đủ vai trò + quyền Giám đốc / Quản trị + loại nghỉ",
    JSON.stringify(aT4) === JSON.stringify(aT) && (await chu.leaveType.count({ where: { tenantId: T4 } })) === 4, JSON.stringify(Object.keys(aT4)));
  const hoSoCeo4 = await chu.user.create({ data: {
    tenantId: T4, email: `ceo4.${DAU}@qa.test`, passwordHash: "x", fullName: "Giám đốc DN4",
    userRoles: { create: { tenantId: T4, roleId: (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T4, code: "ceo" } } })).id } },
  } });
  const ttCeo4 = await voi(T4, hoSoCeo4.id, (nc) => bangTrucTiep(nc, { phongBanId: null, diaDiemId: null }, vn("2026-10-15T09:00:00")));
  dat("QĐ-117: Giám đốc doanh nghiệp đó mở được bảng chấm công trực tiếp", Array.isArray(ttCeo4.dong));

  // ==================================================================
  console.log("\n— Nhắc việc —");
  await quetChamCong(T, vn("2026-11-07T08:30:00"));
  dat("Thứ Bảy làm sáng: người nghỉ sáng đã duyệt (C) không bị nhắc", (await chu.notification.count({ where: { userId: nvC, type: "cham-cong-chua-vao" } })) === 0);
  dat("…người khác chưa chấm (B) được nhắc", (await chu.notification.count({ where: { userId: nvB, type: "cham-cong-chua-vao" } })) === 1);
  await quetChamCong(T, vn("2026-11-07T11:30:00"));
  dat("Quét lại cùng ngày không nhắc lần hai", (await chu.notification.count({ where: { userId: nvB, type: "cham-cong-chua-vao" } })) === 1);
  await quetChamCong(T, vn("2026-11-08T09:00:00"));
  dat("Chủ nhật (nghỉ tuần): không nhắc", (await chu.notification.count({ where: { userId: nvB, type: "cham-cong-chua-vao" } })) === 1);
  const soNhacTruoc = await chu.notification.count({ where: { tenantId: T, type: "cham-cong-chua-vao" } });
  await quetChamCong(T, vn("2026-09-02T09:00:00"));
  dat("Ngày lễ: không nhắc", (await chu.notification.count({ where: { tenantId: T, type: "cham-cong-chua-vao" } })) === soNhacTruoc);
  const demMay = () => chu.notification.count({ where: { userId: hr, type: "may-cham-cong-mat-ket-noi", objectId: may.id } });
  await adms("GET", "getrequest", `SN=${SN}`);
  await chu.attendanceDevice.update({ where: { id: may.id }, data: { lastSeenAt: new Date(Date.now() - 60 * 60_000), offlineAlertedAt: null } });
  const may0 = await demMay();
  for (let i = 0; i < 3; i++) await quetChamCong(T, new Date());
  dat("Máy mất kết nối: quét 3 lần → báo đúng một lần", (await demMay()) === may0 + 1, `${may0} → ${await demMay()}`);
  await adms("GET", "getrequest", `SN=${SN}`);
  await chu.attendanceDevice.update({ where: { id: may.id }, data: { lastSeenAt: new Date(Date.now() - 50 * 60_000) } });
  await quetChamCong(T, new Date());
  await quetChamCong(T, new Date());
  dat("Đợt mất kết nối mới sau khi máy gọi lại → báo thêm đúng một lần", (await demMay()) === may0 + 2);

  await ngu(10);
  void LoiDinhDang;
  ketLuan("QA Nhân sự – chấm công");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
