import { voiTenant } from "../src/lib/db";
import { taoNguCanh, type NguCanh } from "../src/lib/api";
import { layHoSoQuyen, LoiThieuQuyen } from "../src/lib/phan-quyen";
import { LoiKhongTimThay, LoiNghiepVu } from "../src/lib/loi";
import { seedNenMong } from "../prisma/seed/index";
import { chamCongGps, chamCongCuaToi, xacNhanThongBaoViTri, xemXetLanCham } from "../src/modules/cham-cong/service";
import { bangTrucTiep } from "../src/modules/cham-cong/truc-tiep";
import { anhXaPin, danhSachMay, danhSachPinChuaKhop, nhapCsvChamCong, taoMay, suaMay, xuLyAdms } from "../src/modules/cham-cong/may-cham-cong";
import { quetChamCong } from "../src/modules/cham-cong/nhac-viec";
import { quyetDinhGiaiTrinh, quyetDinhTangCa, taoDonTangCa, taoGiaiTrinh, tangCaThucTe } from "../src/modules/cham-cong/don-tu";
import { chiTietBangCong, giaiQuyetPhanHoi, guiPhanHoiCong, khoaBangCong, sinhBangCong, xuatCsvBangCong } from "../src/modules/cham-cong/bang-cong";
import { quyetDinhNghi, soDuPhepCua, taoDonNghi } from "../src/modules/nghi-phep/service";
import { LuocDoDonNghi } from "../src/modules/nghi-phep/luoc-do";
import { LuocDoCa, LuocDoDiaDiem, LuocDoHoSoNhanSu, LuocDoLich } from "../src/modules/nhan-su/luoc-do";
import { dieuChinhPhep, ganLich, taoCa, taoDiaDiem, taoLich, taoNgayLe, suaHoSoNhanSu } from "../src/modules/nhan-su/service";
import { LuocDoGiaiTrinh } from "../src/modules/cham-cong/luoc-do";
import { clientChuSoHuu, dat, ketLuan } from "./thu-lib";

/**
 * Kiểm chứng 0.19.0 — Nhân sự: chấm công (GPS + máy vân tay ADMS), đơn từ, nghỉ phép, tăng ca, bảng
 * công tháng, nhắc việc — trên CSDL THẬT, qua đúng service / bộ xử lý mà API và route /iclock gọi.
 * Luật: BUSINESS_RULES.md mục 30 (NS). Chạy: npm run thu:cham-cong (CSDL phát triển).
 */

if (process.env.NODE_ENV === "production" && !process.env.CHO_PHEP_THU_TREN_MAY_THAT) {
  console.error("Bài thử này ghi dữ liệu thử vĩnh viễn. Không chạy trên môi trường thật.");
  process.exit(1);
}

const chu = clientChuSoHuu();
const DAU = Date.now().toString(36);
const vn = (s: string) => new Date(`${s}+07:00`);
// Văn phòng thử (toạ độ minh họa) và một điểm cách ~5 km.
const VP = { lat: 10.7769, lng: 106.7009 };
const XA = { lat: 10.8219, lng: 106.7009 };
const HA_NOI = { lat: 21.0285, lng: 105.8542 };

async function voi<T>(tenantId: string, userId: string, viec: (nc: NguCanh) => Promise<T>, ip = "203.0.113.7"): Promise<T> {
  return voiTenant(tenantId, async (tx) => {
    const hoSo = await layHoSoQuyen(tx, userId);
    if (!hoSo) throw new Error(`Không đọc được hồ sơ quyền của ${userId}`);
    return viec(taoNguCanh(tx, tenantId, hoSo, ip, "thu-cham-cong/1.0 (Android)"));
  });
}

async function nemLoi(ten: string, khoi: () => Promise<unknown>, ma?: string, kieu: "nghiep-vu" | "quyen" | "khong-thay" | "csdl" = "nghiep-vu") {
  try {
    await khoi();
    dat(ten, false, "không ném lỗi");
  } catch (e) {
    const dungKieu =
      kieu === "quyen" ? e instanceof LoiThieuQuyen
      : kieu === "khong-thay" ? e instanceof LoiKhongTimThay
      : kieu === "csdl" ? !(e instanceof LoiNghiepVu) && /23514|chi duoc ghi them|da khoa|check|Unique|P2002/i.test(String((e as Error)?.message ?? e))
      : e instanceof LoiNghiepVu;
    const dungMa = !ma || (e instanceof LoiNghiepVu && e.ma === ma);
    dat(ten, dungKieu && dungMa, e instanceof Error ? `${e.name}: ${e.message}${e instanceof LoiNghiepVu ? ` [${e.ma}]` : ""}` : String(e));
  }
}

async function main() {
  console.log("=== Thử Nhân sự – chấm công (0.19.0) ===\n");
  const T = (await seedNenMong(chu, `thu-cc-${DAU}`, "Doanh nghiệp thử chấm công")).id;
  const T2 = (await seedNenMong(chu, `thu-cc2-${DAU}`, "Doanh nghiệp thử chấm công 2")).id;
  const vaiTro = async (t: string, code: string) => (await chu.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId: t, code } } })).id;
  async function nguoi(t: string, ten: string, vai: string, quanLyId?: string) {
    const u = await chu.user.create({
      data: {
        tenantId: t, email: `${ten}.${DAU}@thu.test`, passwordHash: "x", fullName: ten,
        userRoles: { create: { tenantId: t, roleId: await vaiTro(t, vai) } },
        staffProfile: { create: { tenantId: t, managerId: quanLyId ?? null, hiredAt: new Date("2020-01-01T00:00:00Z") } },
      },
    });
    return u.id;
  }
  const hr = await nguoi(T, "nhan-su", "nhan-su-hr");
  const tp = await nguoi(T, "truong-phong", "sales-manager");
  const nvA = await nguoi(T, "nhan-vien-a", "sales", tp);
  const nvB = await nguoi(T, "nhan-vien-b", "sales", tp);
  const nvC = await nguoi(T, "nhan-vien-c", "sales");
  const ktv = await nguoi(T, "ky-thuat-vien", "technical");
  const tts = await nguoi(T, "thuc-tap-sinh", "sinh-vien-thuc-tap", tp);
  const ngoai = await nguoi(T2, "nguoi-ngoai", "nhan-su-hr");
  const caiDat = (t: string, key: string, value: number) => chu.tenantSetting.create({ data: { tenantId: t, key, value } });
  await caiDat(T, "nghi_phep.cong_don_theo_thang", 0);
  await caiDat(T, "nghi_phep.so_ngay_nam", 5);
  await caiDat(T, "nghi_phep.tham_nien_so_nam", 50);

  // ------------------------------------------------------------------
  console.log("— Thiết lập: địa điểm, ca, lịch, ngày lễ, mã chấm công —");
  const vp = await voi(T, hr, (nc) => taoDiaDiem(nc, LuocDoDiaDiem.parse({ ten: "Văn phòng thử", diaChi: "Q1", viDo: VP.lat, kinhDo: VP.lng })));
  const ca = await voi(T, hr, (nc) => taoCa(nc, LuocDoCa.parse({ ma: "HC", ten: "Hành chính", gioVao: "08:00", gioRa: "17:00", gioNghi: "12:00", phutNghi: 60 })));
  const lich = await voi(T, hr, (nc) => taoLich(nc, LuocDoLich.parse({ ma: "T2T7S", ten: "T2–T6 + sáng T7", caId: ca.id, ngay: ["ca", "ca", "ca", "ca", "ca", "sang", "nghi"] })));
  await voi(T, hr, (nc) => ganLich(nc, { nguoiIds: [tp, nvA, nvB, nvC, ktv, tts], lichId: lich.id, tuNgay: "2026-01-01", ghiChu: null }));
  await voi(T, hr, (nc) => taoNgayLe(nc, { ngay: "2026-10-20", ten: "Ngày lễ thử" }));
  const PIN_A = "1001";
  const PIN_B = "1002";
  await voi(T, hr, (nc) => suaHoSoNhanSu(nc, nvA, LuocDoHoSoNhanSu.parse({ maChamCong: PIN_A, diaDiemMacDinhId: vp.id })));
  await voi(T, hr, (nc) => suaHoSoNhanSu(nc, nvB, LuocDoHoSoNhanSu.parse({ maChamCong: PIN_B })));
  await nemLoi("NS-02: mã chấm công trùng trong doanh nghiệp bị chặn", () => voi(T, hr, (nc) => suaHoSoNhanSu(nc, nvC, LuocDoHoSoNhanSu.parse({ maChamCong: PIN_A }))));
  await voi(T, hr, (nc) => suaHoSoNhanSu(nc, tts, LuocDoHoSoNhanSu.parse({ loaiNhanSu: "thuc-tap", thucTap: { truong: "ĐH Bách khoa", khoa: "CNTT", mssv: "B2012345", giangVienHuongDan: "TS. Thử", nguoiHuongDanId: tp, tuNgay: "2026-09-01", denNgay: "2026-12-31" } })));
  const tp2 = await chu.internProfile.findUnique({ where: { userId: tts } });
  dat("NS-01: hồ sơ thực tập lưu trường, MSSV, người hướng dẫn", tp2?.studentCode === "B2012345" && tp2.mentorId === tp);
  const hoSoTts = await voiTenant(T, (tx) => layHoSoQuyen(tx, tts));
  dat("NS-04: Thực tập sinh không có quyền khách hàng / giá", !hoSoTts!.quyen.has("customer.view") && !hoSoTts!.quyen.has("product.view") && hoSoTts!.quyen.has("cham_cong.create"));

  // ------------------------------------------------------------------
  console.log("\n— NS-11 → NS-13, NS-18: chấm công GPS —");
  await nemLoi("Chưa xác nhận thông báo vị trí → chặn", () => voi(T, nvA, (nc) => chamCongGps(nc, { huong: "vao", viDo: VP.lat, kinhDo: VP.lng, doChinhXacM: 15 }, vn("2026-10-05T07:55:00"))), "chua-xac-nhan-vi-tri");
  for (const u of [nvA, nvB, nvC, ktv, tts, tp]) await voi(T, u, (nc) => xacNhanThongBaoViTri(nc));
  const lai = await voi(T, nvA, (nc) => xacNhanThongBaoViTri(nc));
  dat("Xác nhận lần hai không ghi thêm dòng", lai.moi === false && (await chu.attendanceConsent.count({ where: { userId: nvA } })) === 1);
  await nemLoi("Bảng xác nhận vị trí chỉ ghi thêm", () => chu.attendanceConsent.deleteMany({ where: { userId: nvA } }), undefined, "csdl");

  const g1 = await voi(T, nvA, (nc) => chamCongGps(nc, { huong: "vao", viDo: VP.lat + 0.0003, kinhDo: VP.lng, doChinhXacM: 15, gioMay: "2026-10-05T07:54:00+07:00" }, vn("2026-10-05T07:55:00")));
  dat("Trong bán kính → hợp lệ, không cần xem xét", g1.ketQua === "hop-le" && !g1.canXemXet && g1.diaDiem?.id === vp.id);
  const p1 = await chu.attendancePunch.findUniqueOrThrow({ where: { id: g1.id } });
  dat("Giờ chấm = giờ máy chủ; giờ điện thoại chỉ lưu tham khảo; ghi IP + trình duyệt", p1.punchedAt.toISOString() === vn("2026-10-05T07:55:00").toISOString() && p1.clientTime?.toISOString() === vn("2026-10-05T07:54:00").toISOString() && p1.ipAddress === "203.0.113.7" && Boolean(p1.userAgent?.includes("Android")));
  const g2 = await voi(T, nvA, (nc) => chamCongGps(nc, { huong: "vao", viDo: VP.lat, kinhDo: VP.lng, doChinhXacM: 15 }, vn("2026-10-05T07:55:20")));
  dat("NS-13: bấm lại trong 60 giây → không ghi thêm", g2.trungLap === true && g2.id === g1.id && (await chu.attendancePunch.count({ where: { userId: nvA, source: "gps" } })) === 1);

  const g3 = await voi(T, nvA, (nc) => chamCongGps(nc, { huong: "ra", viDo: XA.lat, kinhDo: XA.lng, doChinhXacM: 20 }, vn("2026-10-05T12:05:00")));
  dat("Ngoài vùng, không có phiếu hỗ trợ → ngoai-vung, cần xem xét", g3.ketQua === "ngoai-vung" && g3.canXemXet);
  const tbTp = await chu.notification.count({ where: { userId: tp, type: "cham-cong-can-xem-xet", objectId: g3.id } });
  dat("Quản lý trực tiếp được báo ngay lần chấm cần xem xét", tbTp === 1);

  const kh = await chu.customer.create({ data: { tenantId: T, code: `KH-${DAU}`, name: "Khách thử", nameNormalized: "khach thu", ownerId: tp } });
  const phieu = await chu.supportTicket.create({ data: { tenantId: T, number: `HT-${DAU}`, customerId: kh.id, type: "su-co", title: "Sửa camera", ownerId: tp, assigneeId: ktv, status: "DANG_XU_LY" } });
  const g4 = await voi(T, ktv, (nc) => chamCongGps(nc, { huong: "vao", viDo: XA.lat, kinhDo: XA.lng, doChinhXacM: 30 }, vn("2026-10-05T08:10:00")));
  dat("Ngoài vùng nhưng đang có phiếu hỗ trợ được giao → hiện trường, gắn phiếu", g4.ketQua === "hien-truong" && g4.phieu?.id === phieu.id);
  const g5 = await voi(T, nvB, (nc) => chamCongGps(nc, { huong: "vao", viDo: VP.lat, kinhDo: VP.lng, doChinhXacM: 500 }, vn("2026-10-05T07:59:00")));
  dat("Độ chính xác kém hơn ngưỡng → vẫn trong vùng nhưng gắn cờ", g5.ketQua === "hop-le" && g5.co.includes("do-chinh-xac-thap") && g5.canXemXet);
  const g6 = await voi(T, ktv, (nc) => chamCongGps(nc, { huong: "ra", viDo: HA_NOI.lat, kinhDo: HA_NOI.lng, doChinhXacM: 20 }, vn("2026-10-05T08:40:00")));
  dat("Tốc độ di chuyển bất thường (TP.HCM → Hà Nội trong 30 phút) → cờ", g6.co.includes("toc-do-bat-thuong"));
  const g7 = await voi(T, nvC, (nc) => chamCongGps(nc, { huong: "vao", loiViTri: "tu-choi" }, vn("2026-10-05T08:02:00")));
  dat("Không cho quyền vị trí → ngoài vùng + cờ thiếu quyền vị trí", g7.ketQua === "ngoai-vung" && g7.co.includes("thieu-quyen-vi-tri"));

  let soChan = 0;
  for (let i = 0; i < 11; i++) {
    try {
      await voi(T, tts, (nc) => chamCongGps(nc, { huong: "vao", viDo: VP.lat, kinhDo: VP.lng, doChinhXacM: 10 }, vn("2026-10-05T08:00:00")));
    } catch (e) {
      if (e instanceof LoiNghiepVu && e.ma === "qua-toc") soChan++;
    }
  }
  dat("Giới hạn tốc độ: lần bấm thứ 11 trong một phút bị chặn", soChan === 1, `chặn ${soChan}`);

  await nemLoi("NS-10: lần chấm chỉ ghi thêm — không sửa giờ", () => chu.attendancePunch.update({ where: { id: g1.id }, data: { punchedAt: new Date() } }), undefined, "csdl");
  await nemLoi("NS-10: lần chấm chỉ ghi thêm — không xóa", () => chu.attendancePunch.delete({ where: { id: g1.id } }), undefined, "csdl");

  console.log("\n— NS-12: quản lý xem xét —");
  await nemLoi("Nhân viên không tự xem xét lần chấm của mình", () => voi(T, nvA, (nc) => xemXetLanCham(nc, g3.id, { quyetDinh: "chap-nhan", ghiChu: null })), "khong-tu-duyet");
  await nemLoi("Trưởng phòng không xem xét được người ngoài nhóm (C)", () => voi(T, tp, (nc) => xemXetLanCham(nc, g7.id, { quyetDinh: "chap-nhan", ghiChu: null })));
  await voi(T, tp, (nc) => xemXetLanCham(nc, g3.id, { quyetDinh: "chap-nhan", ghiChu: "Đi gặp khách" }));
  dat("Quản lý chấp nhận → dòng xem xét + báo nhân viên", (await chu.attendancePunchReview.count({ where: { punchId: g3.id, decision: "chap-nhan" } })) === 1 && (await chu.notification.count({ where: { userId: nvA, type: "cham-cong-da-xem-xet" } })) === 1);
  await nemLoi("Từ chối phải ghi lý do", () => voi(T, hr, (nc) => xemXetLanCham(nc, g7.id, { quyetDinh: "tu-choi", ghiChu: null })), "thieu-ly-do");

  // ------------------------------------------------------------------
  console.log("\n— NS-14 → NS-17: máy vân tay ADMS —");
  const SN = `THU${DAU.toUpperCase()}`.slice(0, 20);
  const adms = (phuongThuc: string, doan: string, ts: string, than: string | null = null, ip = "198.51.100.10") =>
    xuLyAdms({ phuongThuc, doan, truyVan: new URLSearchParams(ts), than, ip });
  const la = await adms("GET", "cdata", `SN=${SN}&options=all&pushver=2.4.1`);
  dat("SN chưa đăng ký → từ chối (401)", la.status === 401);
  dat("Đường lạ dưới /iclock → 404", (await adms("GET", "upload", `SN=${SN}`)).status === 404);
  dat("SN sai khuôn → 400", (await adms("GET", "cdata", "SN=a'b")).status === 400);
  const may = await voi(T, hr, (nc) => taoMay(nc, { soSeri: SN, ten: "Máy cổng chính", diaDiemId: vp.id, ipChoPhep: [] }));
  const vpT2 = await voi(T2, ngoai, (nc) => taoDiaDiem(nc, LuocDoDiaDiem.parse({ ten: "VP khác", viDo: 10, kinhDo: 106 })));
  await nemLoi("SN duy nhất toàn hệ thống — doanh nghiệp khác không đăng ký trùng", () => voi(T2, ngoai, (nc) => taoMay(nc, { soSeri: SN, ten: "Máy giả", diaDiemId: vpT2.id, ipChoPhep: [] })));
  const bt = await adms("GET", "cdata", `SN=${SN}&options=all&pushver=2.4.1&language=69`);
  dat("Bắt tay: 200 + GET OPTION FROM + ATTLOGStamp", bt.status === 200 && bt.than.startsWith(`GET OPTION FROM: ${SN}`) && bt.than.includes("ATTLOGStamp=None"));
  const thanAttlog = [
    `${PIN_A}\t2026-10-05 17:05:10\t1\t1\t0\t0\t0`,
    `${PIN_B}\t2026-10-05 17:20:00\t1\t1\t0\t0\t0`,
    `9999\t2026-10-05 08:00:00\t0\t1\t0\t0\t0`,
    `xx yy`,
  ].join("\n");
  const up1 = await adms("POST", "cdata", `SN=${SN}&table=ATTLOG&Stamp=100`, thanAttlog);
  dat("Tải ATTLOG: trả OK: 4 (3 dòng tốt + 1 dòng hỏng đã xử lý)", up1.status === 200 && up1.than === "OK: 4", up1.than);
  const vt = await chu.attendancePunch.findMany({ where: { tenantId: T, deviceId: may.id }, orderBy: { pin: "asc" } });
  dat("3 lần chấm vân tay; PIN 1001 gán đúng người; PIN 9999 chưa khớp", vt.length === 3 && vt.find((p) => p.pin === PIN_A)?.userId === nvA && vt.find((p) => p.pin === "9999")?.userId === null);
  dat("Giờ máy (giờ VN) đổi sang UTC", vt.find((p) => p.pin === PIN_A)?.punchedAt.toISOString() === "2026-10-05T10:05:10.000Z");
  const up2 = await adms("POST", "cdata", `SN=${SN}&table=ATTLOG&Stamp=100`, thanAttlog);
  dat("Gửi lại cùng lô → không nhân đôi", up2.than === "OK: 4" && (await chu.attendancePunch.count({ where: { deviceId: may.id } })) === 3);
  dat("Mốc ATTLOGStamp được lưu và trả trong lần bắt tay sau", (await adms("GET", "cdata", `SN=${SN}&options=all`)).than.includes("ATTLOGStamp=100"));
  dat("OPERLOG được nhận và báo OK", (await adms("POST", "cdata", `SN=${SN}&table=OPERLOG&Stamp=5`, "OPLOG 4\t0\t2026-10-05 08:00:00\t0\t0\t0\t0\nOPLOG 3\t0\t2026-10-05 08:01:00\t0\t0\t0\t0")).than === "OK: 2");
  dat("getrequest / devicecmd → OK", (await adms("GET", "getrequest.aspx", `SN=${SN}&INFO=Ver 6.60,5,4,10,192.168.1.201`)).than === "OK" && (await adms("POST", "devicecmd", `SN=${SN}`, "ID=1&Return=0&CMD=INFO")).than === "OK");
  const mayDb = await chu.attendanceDevice.findUniqueOrThrow({ where: { id: may.id } });
  dat("NS-17: máy gọi vào cập nhật lần cuối + IP + thông tin máy", mayDb.lastSeenAt !== null && mayDb.lastIp === "198.51.100.10" && (mayDb.info as { phienBan?: string } | null)?.phienBan === "Ver 6.60");

  const chuaKhop = await voi(T, hr, (nc) => danhSachPinChuaKhop(nc));
  dat("NS-15: danh sách PIN chưa khớp có 9999", chuaKhop.some((p) => p.pin === "9999" && p.soLanCham === 1));
  const ax = await voi(T, hr, (nc) => anhXaPin(nc, { pin: "9999", nguoiId: nvC }));
  const p9999 = await chu.attendancePunch.findFirstOrThrow({ where: { deviceId: may.id, pin: "9999" } });
  dat("Gán PIN 9999 cho C → lần chấm cũ được áp lại cho C", ax.soLanCham === 1 && p9999.userId === nvC && p9999.matchedAt !== null);
  await nemLoi("Đã gán người thì không đổi sang người khác được (chỉ ghi thêm)", () => chu.attendancePunch.update({ where: { id: p9999.id }, data: { userId: nvA } }), undefined, "csdl");

  await voi(T, hr, (nc) => suaMay(nc, may.id, { ipChoPhep: ["198.51.100.99"] }));
  dat("Danh sách IP cho phép: IP khác bị từ chối 403", (await adms("GET", "getrequest", `SN=${SN}`)).status === 403);
  dat("…IP đúng thì qua", (await adms("GET", "getrequest", `SN=${SN}`, null, "198.51.100.99")).than === "OK");

  // NS-17: máy im lặng → báo Nhân sự một lần.
  // Mốc quét CỐ ĐỊNH ngoài giờ ca (tối Chủ nhật): quét bằng giờ thật trong giờ làm ngày thường sẽ sinh luôn
  // nhắc "chưa chấm công" cho cả doanh nghiệp thử và làm hỏng các bài nhắc việc phía dưới (QA 0.19.0).
  const quetMay = vn("2026-10-25T23:00:00");
  await chu.attendanceDevice.update({ where: { id: may.id }, data: { lastSeenAt: new Date(quetMay.getTime() - 30 * 60_000) } });
  await quetChamCong(T, quetMay);
  await quetChamCong(T, quetMay);
  const tbMay = await chu.notification.count({ where: { userId: hr, type: "may-cham-cong-mat-ket-noi" } });
  dat("Máy im lặng quá ngưỡng → Nhân sự nhận đúng 1 cảnh báo (quét lại không báo lặp)", tbMay === 1, `${tbMay}`);
  await adms("GET", "getrequest", `SN=${SN}`, null, "198.51.100.99");
  dat("Máy gọi lại → xóa mốc đã báo", (await chu.attendanceDevice.findUniqueOrThrow({ where: { id: may.id } })).offlineAlertedAt === null);
  const dsMay = await voi(T, hr, (nc) => danhSachMay(nc));
  dat("Bảng máy: trực tuyến sau khi gọi lại", dsMay.dong.find((m) => m.id === may.id)?.trucTuyen === true);

  // ------------------------------------------------------------------
  console.log("\n— NS-60: bảng trực tiếp theo phạm vi, cách ly doanh nghiệp —");
  const bay = vn("2026-10-05T09:00:00");
  const bA = await voi(T, nvA, (nc) => bangTrucTiep(nc, { phongBanId: null, diaDiemId: null }, bay));
  dat("Nhân viên chỉ thấy chính mình", bA.dong.length === 1 && bA.dong[0].id === nvA);
  dat("A đã vào ca lúc 07:55 (GPS) → Đã vào ca", bA.dong[0].trangThai === "da-vao-ca" && bA.dong[0].lanCuoi?.nguon === "gps", bA.dong[0].trangThai);
  const bTp = await voi(T, tp, (nc) => bangTrucTiep(nc, { phongBanId: null, diaDiemId: null }, bay));
  const idsTp = new Set(bTp.dong.map((d) => d.id));
  dat("Trưởng phòng thấy nhóm mình (A, B, thực tập sinh), không thấy C", idsTp.has(nvA) && idsTp.has(nvB) && idsTp.has(tts) && !idsTp.has(nvC));
  dat("Trưởng phòng thấy lần chấm cần xem xét của nhóm", bTp.canXemXet.some((p) => p.id === g5.id) && !bTp.canXemXet.some((p) => p.id === g7.id));
  const bHr = await voi(T, hr, (nc) => bangTrucTiep(nc, { phongBanId: null, diaDiemId: null }, bay));
  const dongC = bHr.dong.find((d) => d.id === nvC);
  dat("Nhân sự thấy cả công ty; C: lần GPS ngoài vùng chưa chấp nhận không tính, lần vân tay 08:00 (PIN vừa gán) → Đã vào ca", Boolean(dongC) && dongC?.trangThai === "da-vao-ca" && dongC.lanCuoi?.nguon === "van-tay" && bHr.may !== null, `${dongC?.trangThai} ${dongC?.lanCuoi?.nguon}`);
  dat("Kỹ thuật viên ở hiện trường", bHr.dong.find((d) => d.id === ktv)?.trangThai !== undefined);
  const bLoc = await voi(T, hr, (nc) => bangTrucTiep(nc, { phongBanId: null, diaDiemId: vp.id }, bay));
  dat("Lọc theo địa điểm mặc định", bLoc.dong.length === 1 && bLoc.dong[0].id === nvA);
  const bNgoai = await voi(T2, ngoai, (nc) => bangTrucTiep(nc, { phongBanId: null, diaDiemId: null }, bay));
  dat("RLS: doanh nghiệp khác không thấy ai của doanh nghiệp này", !bNgoai.dong.some((d) => [nvA, nvB, nvC].includes(d.id)));
  dat("RLS: đọc thẳng lần chấm trong ngữ cảnh doanh nghiệp khác → 0 dòng", (await voiTenant(T2, (tx) => tx.attendancePunch.count({ where: { userId: nvA } }))) === 0);
  const cuaToi = await voi(T, nvA, (nc) => chamCongCuaToi(nc, bay));
  dat("Chấm công của tôi: đã xác nhận vị trí, lịch 08:00–17:00", cuaToi.daXacNhanViTri && cuaToi.homNay.gioVao === "08:00" && cuaToi.homNay.gioRa === "17:00");

  // ------------------------------------------------------------------
  console.log("\n— NS-20, NS-21: giải trình / chấm bù —");
  const gt = await voi(T, nvB, (nc) => taoGiaiTrinh(nc, LuocDoGiaiTrinh.parse({ ngay: "2026-10-07", gio: "08:00", huong: "vao", lyDo: "Quên chấm vân tay buổi sáng" })));
  await nemLoi("Đơn trùng ngày, cùng chiều đang chờ → chặn", () => voi(T, nvB, (nc) => taoGiaiTrinh(nc, LuocDoGiaiTrinh.parse({ ngay: "2026-10-07", gio: "08:05", huong: "vao", lyDo: "Gửi lại lần nữa" }))), "trung-don");
  await nemLoi("Không tự duyệt đơn của mình", () => voi(T, nvB, (nc) => quyetDinhGiaiTrinh(nc, gt.id, { hanhDong: "duyet", ghiChu: null })), "khong-tu-duyet");
  await nemLoi("Người không quản lý, không có quyền duyệt → bị chặn", () => voi(T, nvC, (nc) => quyetDinhGiaiTrinh(nc, gt.id, { hanhDong: "duyet", ghiChu: null })), undefined, "quyen");
  const dgt = await voi(T, tp, (nc) => quyetDinhGiaiTrinh(nc, gt.id, { hanhDong: "duyet", ghiChu: "OK" }));
  const pbs = await chu.attendancePunch.findUniqueOrThrow({ where: { id: dgt.punchId! } });
  dat("Duyệt → sinh lần chấm nguồn bo-sung gắn đơn, đúng giờ xin", pbs.source === "bo-sung" && pbs.correctionId === gt.id && pbs.punchedAt.toISOString() === vn("2026-10-07T08:00:00").toISOString());
  await nemLoi("Duyệt lần hai → đã xử lý", () => voi(T, hr, (nc) => quyetDinhGiaiTrinh(nc, gt.id, { hanhDong: "duyet", ghiChu: null })), "da-xu-ly");

  // ------------------------------------------------------------------
  console.log("\n— NS-30 → NS-35: nghỉ phép, duyệt đồng thời —");
  const loaiPhep = await chu.leaveType.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code: "phep-nam" } } });
  const loaiKhongLuong = await chu.leaveType.findUniqueOrThrow({ where: { tenantId_code: { tenantId: T, code: "khong-luong" } } });
  const sd0 = await voi(T, nvA, (nc) => soDuPhepCua(nc, null, 2026));
  dat("Quỹ phép theo Cấu hình (5 ngày, không cộng dồn)", sd0.quyNam === 5 && sd0.duocDung === 5, JSON.stringify(sd0));
  const d1 = await voi(T, nvA, (nc) => taoDonNghi(nc, LuocDoDonNghi.parse({ loaiNghiId: loaiPhep.id, tuNgay: "2026-11-09", denNgay: "2026-11-11", lyDo: "Về quê" })));
  dat("Đơn 3 ngày T2–T4 = 3 ngày công", d1.soNgay === 3);
  await nemLoi("Đơn thứ hai vượt quỹ (đã trừ đơn đang chờ) → chặn khi gửi", () => voi(T, nvA, (nc) => taoDonNghi(nc, LuocDoDonNghi.parse({ loaiNghiId: loaiPhep.id, tuNgay: "2026-11-16", denNgay: "2026-11-18", lyDo: "Việc nhà" }))), "vuot-quy-phep");
  await voi(T, hr, (nc) => dieuChinhPhep(nc, { nguoiId: nvA, nam: 2026, soNgay: 3, lyDo: "Tạm cộng để dựng tình huống thử" }));
  const d2 = await voi(T, nvA, (nc) => taoDonNghi(nc, LuocDoDonNghi.parse({ loaiNghiId: loaiPhep.id, tuNgay: "2026-11-16", denNgay: "2026-11-18", lyDo: "Việc nhà" })));
  await voi(T, hr, (nc) => dieuChinhPhep(nc, { nguoiId: nvA, nam: 2026, soNgay: -3, lyDo: "Bỏ phần cộng tạm của bài thử" }));
  await nemLoi("Điều chỉnh quỹ phép chỉ ghi thêm", () => chu.leaveAdjustment.deleteMany({ where: { userId: nvA } }), undefined, "csdl");
  // Giao dịch thứ nhất duyệt xong rồi GIỮ chưa commit 800 ms; giao dịch thứ hai bắt đầu sau 200 ms.
  // Có khóa quỹ phép: lần hai phải chờ, đọc thấy 3 ngày đã dùng → chặn. Gỡ khóa: cả hai cùng qua.
  const ngu = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const dua = await Promise.allSettled([
    voi(T, tp, async (nc) => {
      const kq = await quyetDinhNghi(nc, d1.id, { hanhDong: "duyet", ghiChu: null });
      await ngu(800);
      return kq;
    }),
    ngu(200).then(() => voi(T, hr, (nc) => quyetDinhNghi(nc, d2.id, { hanhDong: "duyet", ghiChu: null }))),
  ]);
  const thanhCong = dua.filter((r) => r.status === "fulfilled").length;
  const loiDua = dua.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
  dat("Hai lần duyệt cùng lúc: đúng MỘT đơn được duyệt, đơn kia bị chặn vượt quỹ", thanhCong === 1 && loiDua?.reason instanceof LoiNghiepVu && loiDua.reason.ma === "vuot-quy-phep", `${thanhCong} thành công, ${loiDua?.reason?.message}`);
  const sd1 = await voi(T, nvA, (nc) => soDuPhepCua(nc, null, 2026));
  dat("Quỹ phép sau duyệt: đã dùng 3, còn 2", sd1.daDung === 3 && sd1.duocDung === 2, JSON.stringify(sd1));
  const daDuyet = (await chu.leaveRequest.findFirstOrThrow({ where: { userId: nvA, status: "da-duyet" } })).id;
  await nemLoi("Nhân viên không tự hủy đơn đã duyệt", () => voi(T, nvA, (nc) => quyetDinhNghi(nc, daDuyet, { hanhDong: "huy", ghiChu: "Đổi kế hoạch" })), "nho-quan-ly-huy");
  await nemLoi("Hủy đơn phải ghi lý do", () => voi(T, tp, (nc) => quyetDinhNghi(nc, daDuyet, { hanhDong: "huy", ghiChu: null })), "thieu-ly-do");
  await voi(T, tp, (nc) => quyetDinhNghi(nc, daDuyet, { hanhDong: "huy", ghiChu: "Nhân viên đổi kế hoạch" }));
  const sd2 = await voi(T, nvA, (nc) => soDuPhepCua(nc, null, 2026));
  dat("Hủy đơn đã duyệt → trả phép về quỹ", sd2.daDung === 0, JSON.stringify(sd2));
  const dLe = await voi(T, nvB, (nc) => taoDonNghi(nc, LuocDoDonNghi.parse({ loaiNghiId: loaiKhongLuong.id, tuNgay: "2026-10-19", denNgay: "2026-10-21", lyDo: "Việc riêng" })));
  dat("Đơn qua ngày lễ 20/10: chỉ tính 2 ngày công", dLe.soNgay === 2, `${dLe.soNgay}`);
  await voi(T, tp, (nc) => quyetDinhNghi(nc, dLe.id, { hanhDong: "duyet", ghiChu: null }));
  const nuaNgay = await voi(T, nvA, (nc) => taoDonNghi(nc, LuocDoDonNghi.parse({ loaiNghiId: loaiKhongLuong.id, tuNgay: "2026-10-23", denNgay: "2026-10-23", phan: "sang", lyDo: "Đi khám" })));
  dat("Nghỉ nửa ngày = 0,5", nuaNgay.soNgay === 0.5);
  await voi(T, tp, (nc) => quyetDinhNghi(nc, nuaNgay.id, { hanhDong: "duyet", ghiChu: null }));
  await nemLoi("Đơn chồng lên đơn nửa ngày sáng (cả ngày) → chặn", () => voi(T, nvA, (nc) => taoDonNghi(nc, LuocDoDonNghi.parse({ loaiNghiId: loaiKhongLuong.id, tuNgay: "2026-10-23", denNgay: "2026-10-23", lyDo: "Trùng" }))), "trung-don");

  // ------------------------------------------------------------------
  console.log("\n— NS-40 → NS-43: tăng ca —");
  await caiDat(T, "cham_cong.tang_ca_toi_da_thang", 2);
  const tc = await voi(T, nvA, (nc) => taoDonTangCa(nc, { ngay: "2026-10-06", soGio: 3, lyDo: "Lắp đặt gấp cho khách" }));
  await nemLoi("Không duyệt quá số giờ xin", () => voi(T, tp, (nc) => quyetDinhTangCa(nc, tc.id, { hanhDong: "duyet", ghiChu: null, gioDuyet: 4 })));
  const dtc = await voi(T, tp, (nc) => quyetDinhTangCa(nc, tc.id, { hanhDong: "duyet", ghiChu: null, gioDuyet: 2.5 }));
  dat("Duyệt 2,5 giờ vượt trần tháng 2 giờ → cảnh báo (không chặn)", dtc.trangThai === "da-duyet" && dtc.canhBao.some((c) => c.includes("Vượt")), JSON.stringify(dtc.canhBao));
  await voi(T, nvA, (nc) => chamCongGps(nc, { huong: "vao", viDo: VP.lat, kinhDo: VP.lng, doChinhXacM: 10 }, vn("2026-10-06T07:58:00")));
  await voi(T, nvA, (nc) => chamCongGps(nc, { huong: "ra", viDo: VP.lat, kinhDo: VP.lng, doChinhXacM: 10 }, vn("2026-10-06T22:40:00")));
  const tt = await voi(T, nvA, (nc) => tangCaThucTe(nc, tc.id));
  dat("Giờ tăng ca thực tế = sau 17:00 tới 22:40 (340 phút) nhưng chỉ tính 150 phút đã duyệt", tt.phutThucTe === 340 && tt.phut === 150 && tt.loaiNgay === "thuong", JSON.stringify(tt));
  dat("Không có phần đêm trong 150 phút đầu (17:00–19:30)", tt.phutDem === 0);

  // ------------------------------------------------------------------
  console.log("\n— NS-61: nhắc chưa chấm công —");
  // Bước NS-17 ở trên quét bằng giờ THẬT: chạy bài thử vào giờ làm của một ngày làm việc thì đã có nhắc
  // "chưa chấm công" cho hôm nay. Xóa trước để phần này chỉ đếm nhắc của các ngày thử tháng 10 (sửa ở 0.20.0
  // — bài thử phụ thuộc giờ chạy, chỉ đạt khi chạy ngoài giờ làm).
  await chu.notification.deleteMany({ where: { tenantId: T, type: { in: ["cham-cong-chua-vao", "cham-cong-nhan-vien-chua-vao"] } } });
  await quetChamCong(T, vn("2026-10-20T08:30:00"));
  dat("Ngày lễ: không nhắc ai", (await chu.notification.count({ where: { tenantId: T, type: "cham-cong-chua-vao" } })) === 0);
  await quetChamCong(T, vn("2026-10-25T09:30:00"));
  dat("Chủ nhật (ngày nghỉ tuần): không nhắc", (await chu.notification.count({ where: { tenantId: T, type: "cham-cong-chua-vao" } })) === 0);
  await quetChamCong(T, vn("2026-10-21T08:10:00"));
  dat("Chưa quá 15 phút sau giờ vào ca: chưa nhắc", (await chu.notification.count({ where: { tenantId: T, type: "cham-cong-chua-vao" } })) === 0);
  await quetChamCong(T, vn("2026-10-21T08:30:00"));
  await quetChamCong(T, vn("2026-10-21T08:45:00"));
  const nhacB = await chu.notification.count({ where: { userId: nvB, type: "cham-cong-chua-vao" } });
  const nhacC = await chu.notification.count({ where: { userId: nvC, type: "cham-cong-chua-vao" } });
  const nhacTpA = await chu.notification.count({ where: { userId: tp, type: "cham-cong-nhan-vien-chua-vao", objectId: nvA } });
  dat("Nghỉ phép đã duyệt (B ngày 21/10): không nhắc", nhacB === 0);
  dat("C chưa chấm: nhắc đúng 1 lần dù quét lại", nhacC === 1, `${nhacC}`);
  dat("Quản lý trực tiếp được báo nhân viên A chưa vào ca", nhacTpA === 1, `${nhacTpA}`);

  // ------------------------------------------------------------------
  console.log("\n— NS-16: nhập CSV dự phòng —");
  const csv = `Mã chấm công,Thời gian\n${PIN_A},22/10/2026 08:02\n${PIN_A},22/10/2026 17:10\nabc!,22/10/2026 08:00\n`;
  const xt = await voi(T, hr, (nc) => nhapCsvChamCong(nc, csv, false));
  dat("Xem trước: 2 dòng tốt, 1 lỗi, chưa ghi", xt.soDong === 2 && xt.soLoi === 1 && xt.daGhi === 0);
  const ghi1 = await voi(T, hr, (nc) => nhapCsvChamCong(nc, csv, true));
  const ghi2 = await voi(T, hr, (nc) => nhapCsvChamCong(nc, csv, true));
  dat("Ghi 2 dòng; nhập lại không nhân đôi", ghi1.daGhi === 2 && ghi2.daGhi === 0 && ghi2.trung === 2);
  await nemLoi("Nhân viên không nhập CSV được", () => voi(T, nvA, (nc) => nhapCsvChamCong(nc, csv, false)), undefined, "quyen");

  // ------------------------------------------------------------------
  console.log("\n— NS-50 → NS-54: bảng công tháng 10/2026 —");
  const sinhLuc = vn("2026-11-01T09:00:00");
  const bc = await voi(T, hr, (nc) => sinhBangCong(nc, { nam: 2026, thang: 10 }, sinhLuc), "127.0.0.1");
  dat("Sinh bảng công nháp có dòng", bc.soDong > 0);
  await nemLoi("Nhân viên không sinh bảng công được", () => voi(T, nvA, (nc) => sinhBangCong(nc, { nam: 2026, thang: 10 }, sinhLuc)), undefined, "quyen");
  const ctA = await voi(T, nvA, (nc) => chiTietBangCong(nc, bc.id, null, sinhLuc));
  dat("Nhân viên chỉ thấy dòng của chính mình", ctA.dong.length > 0 && ctA.dong.every((r) => r.userId === nvA));
  const a05 = ctA.dong.find((r) => r.ngay === "2026-10-05" && !r.laDieuChinh);
  dat("A ngày 05/10: GPS 07:55 + vân tay 17:05 → 1 công, nguồn hai loại", a05?.congThucTe === 1 && a05.nguon.length === 2, JSON.stringify(a05));
  const a06 = ctA.dong.find((r) => r.ngay === "2026-10-06");
  dat("A ngày 06/10: tăng ca 150 phút ngày thường", a06?.phutTangCa === 150 && a06.loaiNgay === "thuong");
  const a22 = ctA.dong.find((r) => r.ngay === "2026-10-22");
  dat("A ngày 22/10: lần chấm nhập CSV được tính 1 công", a22?.congThucTe === 1);
  const a23 = ctA.dong.find((r) => r.ngay === "2026-10-23");
  dat("A ngày 23/10: nghỉ nửa ngày sáng → nghỉ 0,5", a23?.nghiNgay === 0.5);
  const ctHr = await voi(T, hr, (nc) => chiTietBangCong(nc, bc.id, null, sinhLuc));
  const b20 = ctHr.dong.find((r) => r.userId === nvB && r.ngay === "2026-10-20");
  dat("Ngày lễ không phải làm → không có dòng vắng mặt", !b20 || !b20.co.includes("vang-mat"));
  const b21 = ctHr.dong.find((r) => r.userId === nvB && r.ngay === "2026-10-21");
  dat("B ngày 21/10 nghỉ không lương 1 ngày", b21?.nghiNgay === 1 && b21.nghiCoLuong === false);
  const b07 = ctHr.dong.find((r) => r.userId === nvB && r.ngay === "2026-10-07");
  dat("B ngày 07/10: chỉ có lần chấm bù giờ vào → thiếu giờ ra, 0 công", b07?.congThucTe === 0 && b07.co.includes("thieu-cham-ra"), JSON.stringify(b07?.co));
  const thA = ctHr.tongHop.find((t) => t.userId === nvA);
  dat("Tổng hợp tháng có tăng ca ngày thường 150 phút cho A", thA?.tangCaThuongPhut === 150);

  await nemLoi("Người không có dòng không phản hồi được", () => voi(T, hr, (nc) => guiPhanHoiCong(nc, bc.id, { ngay: null, noiDung: "Thử phản hồi" }, sinhLuc)), "khong-co-dong");
  const ph = await voi(T, nvB, (nc) => guiPhanHoiCong(nc, bc.id, { ngay: "2026-10-07", noiDung: "Chiều 07/10 em có chấm ra lúc 17:30" }, sinhLuc));
  dat("Nhân viên phản hồi trong hạn; Nhân sự được báo", (await chu.notification.count({ where: { userId: hr, type: "bang-cong-phan-hoi" } })) === 1);
  await nemLoi("Khóa trước hạn phản hồi → chặn", () => voi(T, hr, (nc) => khoaBangCong(nc, bc.id, sinhLuc)), "con-han-phan-hoi");
  const sauHan = new Date(sinhLuc.getTime() + 4 * 86_400_000);
  await nemLoi("Hết hạn phản hồi → không gửi thêm", () => voi(T, nvA, (nc) => guiPhanHoiCong(nc, bc.id, { ngay: null, noiDung: "Phản hồi muộn" }, sauHan)), "het-han-phan-hoi");
  await nemLoi("Còn phản hồi chưa giải quyết → chưa khóa", () => voi(T, hr, (nc) => khoaBangCong(nc, bc.id, sauHan)), "con-phan-hoi");
  await voi(T, hr, (nc) => giaiQuyetPhanHoi(nc, ph.id, { giaiQuyet: "Nhân viên gửi giải trình giờ ra để quản lý duyệt" }));
  const csvTh = await voi(T, hr, (nc) => xuatCsvBangCong(nc, bc.id, "tong-hop"));
  dat("Xuất CSV tổng hợp (bản nháp ghi rõ NHAP)", csvTh.noiDung.includes("Công thực tế") && csvTh.ten.includes("NHAP"));
  await nemLoi("Nhân viên không có quyền xuất CSV", () => voi(T, nvA, (nc) => xuatCsvBangCong(nc, bc.id, "tong-hop")), undefined, "quyen");
  await voi(T, hr, (nc) => khoaBangCong(nc, bc.id, sauHan));
  dat("Khóa bảng công", (await chu.timesheet.findUniqueOrThrow({ where: { id: bc.id } })).status === "da-khoa");
  await nemLoi("Bảng đã khóa: không sinh lại", () => voi(T, hr, (nc) => sinhBangCong(nc, { nam: 2026, thang: 10 }, sauHan)), "da-khoa");
  const dongKhoa = await chu.timesheetRow.findFirstOrThrow({ where: { timesheetId: bc.id } });
  await nemLoi("Bảng đã khóa bất biến kể cả với vai chủ sở hữu (sửa dòng)", () => chu.timesheetRow.update({ where: { id: dongKhoa.id }, data: { lateMinutes: 999 } }), undefined, "csdl");
  await nemLoi("…(mở khóa bảng)", () => chu.timesheet.update({ where: { id: bc.id }, data: { status: "nhap" } }), undefined, "csdl");
  await nemLoi("…(thêm dòng)", () => chu.timesheetRow.create({ data: { tenantId: T, timesheetId: bc.id, userId: nvA, workDate: new Date("2026-10-31T00:00:00Z"), isAdjustment: true, dayType: "thuong" } }), undefined, "csdl");
  await nemLoi("Phản hồi sau khi khóa → chặn", () => voi(T, nvB, (nc) => guiPhanHoiCong(nc, bc.id, { ngay: null, noiDung: "Sau khi khóa" }, sauHan)), "da-khoa");

  console.log("\n— NS-53: sửa sau khóa = dòng điều chỉnh kỳ sau —");
  const gt2 = await voi(T, nvB, (nc) => taoGiaiTrinh(nc, LuocDoGiaiTrinh.parse({ ngay: "2026-10-07", gio: "17:30", huong: "ra", lyDo: "Bổ sung giờ ra theo phản hồi bảng công" })));
  await voi(T, tp, (nc) => quyetDinhGiaiTrinh(nc, gt2.id, { hanhDong: "duyet", ghiChu: null }));
  const bc11 = await voi(T, hr, (nc) => sinhBangCong(nc, { nam: 2026, thang: 11 }, sauHan));
  const dc = await chu.timesheetRow.findMany({ where: { timesheetId: bc11.id, isAdjustment: true, userId: nvB } });
  const dc07 = dc.find((r) => r.workDate.toISOString().startsWith("2026-10-07"));
  dat("Bảng tháng 11 có dòng điều chỉnh +1 công cho B ngày 07/10", Number(dc07?.workValue) === 1 && Number(dc07?.expectedValue) === 0, JSON.stringify(dc.map((r) => [r.workDate, r.workValue])));
  const daKhoaB07 = await chu.timesheetRow.findFirstOrThrow({ where: { timesheetId: bc.id, userId: nvB, workDate: new Date("2026-10-07T00:00:00Z"), isAdjustment: false } });
  dat("Số đã khóa của tháng 10 giữ nguyên", Number(daKhoaB07.workValue) === 0);
  const bc11b = await voi(T, hr, (nc) => sinhBangCong(nc, { nam: 2026, thang: 11 }, sauHan));
  dat("Sinh lại tháng 11 không nhân đôi dòng điều chỉnh", (await chu.timesheetRow.count({ where: { timesheetId: bc11b.id, isAdjustment: true, userId: nvB } })) === dc.length);

  ketLuan("Thử Nhân sự – chấm công");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
