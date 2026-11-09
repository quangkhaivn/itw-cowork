import type { PrismaClient } from "../../src/generated/prisma/client";
import { voiTenant } from "../../src/lib/db";
import { taoNguCanh, type NguCanh } from "../../src/lib/api";
import { layHoSoQuyen } from "../../src/lib/phan-quyen";
import { homNayVN, ngayVeDate } from "../../src/modules/crm/chung";
import { cacNgayTrongThang, congNgay, mocVN, thuTrongTuan } from "../../src/modules/cham-cong/tinh-toan";
import { docCauHinhChamCong, so } from "../../src/modules/cham-cong/chung";
import { chamCongGps, xacNhanThongBaoViTri } from "../../src/modules/cham-cong/service";
import { taoMay, xuLyAdms } from "../../src/modules/cham-cong/may-cham-cong";
import { quyetDinhGiaiTrinh, quyetDinhTangCa, taoDonTangCa, taoGiaiTrinh } from "../../src/modules/cham-cong/don-tu";
import { khoaBangCong, sinhBangCong } from "../../src/modules/cham-cong/bang-cong";
import { LuocDoGiaiTrinh, LuocDoQuyetDinh } from "../../src/modules/cham-cong/luoc-do";
import { quyetDinhNghi, taoDonNghi } from "../../src/modules/nghi-phep/service";
import { LuocDoDonNghi, LuocDoQuyetDinhNghi } from "../../src/modules/nghi-phep/luoc-do";
import { ganLich, suaHoSoNhanSu, taoCa, taoDiaDiem, taoLich, taoNgayLe } from "../../src/modules/nhan-su/service";
import { LuocDoCa, LuocDoDiaDiem, LuocDoGanLich, LuocDoHoSoNhanSu, LuocDoLich, LuocDoNgayLe } from "../../src/modules/nhan-su/luoc-do";
import { LuocDoTaoViec, suaViec, taoViec } from "../../src/modules/cong-viec/service";
import { capNhatTienDo, duyetViec, nhanViec, traLaiViec } from "../../src/modules/cong-viec/giao-viec";
import { LuocDoLapViec, LuocDoMauViec, taoLapViec, taoMauViec } from "../../src/modules/cong-viec/mau-lap";
import { LuocDoBaoCao, luuBaoCao, moBaoCao, nhanXetBaoCao } from "../../src/modules/bao-cao-cong-viec/service";
import { chotPhieu, LuocDoBoKpi, quanLyCham, taoBoKpi, taoKyDanhGia, tuDanhGia } from "../../src/modules/danh-gia/service";
import { dauTuan, kyBaoCao } from "../../src/modules/danh-gia/tinh-toan";
import { chamPhieuThucTap, luuNhatKy, nhanXetNhatKy, taoPhieuThucTap } from "../../src/modules/thuc-tap/service";
import { taoKyLuong, themKhoanLuong, tinhKyLuong } from "../../src/modules/luong/service";
import { LuocDoKhoan } from "../../src/modules/luong/luoc-do";
import { taoPhieu } from "../../src/modules/ho-tro/service";
import { LuocDoTaoPhieu } from "../../src/modules/ho-tro/luoc-do";

/**
 * Dữ liệu mẫu DEMO cho phân hệ Nhân sự (0.19 → 0.21) trong doanh nghiệp `demo`: chấm công (địa điểm, ca, lịch, máy
 * vân tay, ngày lễ, lần chấm tháng trước + hôm nay), đơn nghỉ / tăng ca / giải trình, bảng công tháng trước ĐÃ KHÓA,
 * giao việc, báo cáo, KPI + đánh giá, thực tập, kỳ lương tháng trước đã tính.
 *
 * Mọi thứ tạo QUA SERVICE thật bằng đúng tài khoản mẫu (người giao, người duyệt, kế toán…), để dữ liệu mẫu đi qua cùng
 * luật với dữ liệu thật. Mọi tên / ghi chú có chữ "DEMO". Chạy lại không nhân đôi: mỗi mục kiểm theo mã / tên / khóa
 * tự nhiên (người + ngày) trước khi tạo; lần chấm máy vân tay có giờ cố định (băm theo người + ngày) và máy tự chống trùng.
 *
 * "Hôm nay" tính theo ngày chạy (giờ Việt Nam); chỉ tạo lần chấm có giờ ≤ lúc chạy. "Tháng trước" là tháng liền trước
 * tháng chạy; dữ liệu tháng trước chỉ dựng một lần (bảng công đã có thì bỏ qua).
 *
 * Tính lương bắt buộc 2 lớp (LU-61) ở MÁY CHỦ; tài khoản mẫu không bật 2 lớp (bật thì người thử bị khóa ngoài vì không
 * có điện thoại giữ khóa). Bản nạp này chạy như tác vụ máy chủ nên chỉ đánh dấu 2 lớp TRONG BỘ NHỚ cho ngữ cảnh của kế
 * toán mẫu — không đổi tài khoản; giao diện vẫn bắt bật 2 lớp như thường. Tham số lương nạp sẵn KHÔNG được xác nhận
 * thay kế toán: kỳ lương dừng ở trạng thái nháp đã tính (cảnh báo "tham số chưa xác nhận" chặn gửi duyệt).
 */

type Db = PrismaClient;

const QT = "quantri@demo.test"; // đóng vai Nhân sự (Quản trị toàn quyền)
const GD = "giamdoc@demo.test";
const TPKD = "tp.kinhdoanh@demo.test";
const KD1 = "kd1@demo.test";
const KD2 = "kd2@demo.test";
const MKT = "marketing@demo.test";
const TPKT = "tp.kythuat@demo.test";
const KTV = "ktv1@demo.test";
const CSKH = "cskh@demo.test";
const KT = "ketoan@demo.test";
const KHO = "kho@demo.test";
const TTS = "thuctap@demo.test";

/** 10 nhân viên mẫu có lịch + mã chấm công (mọi người trừ Giám đốc), theo thứ tự PIN 1001 → 1010. */
const NHAN_VIEN_CHAM_CONG = [QT, TPKD, KD1, KD2, MKT, TPKT, KTV, CSKH, KT, KHO];

/** Toạ độ minh họa ở TP.HCM. */
const VP = { lat: 10.7769, lng: 106.7009 };
const NGOAI_VUNG = { lat: 10.8015, lng: 106.714 }; // ~3 km, Bình Thạnh
const HIEN_TRUONG = { lat: 10.7626, lng: 106.6602 }; // ~4,6 km, quận 5

const SN_MAY = "DEMO0001";
const TEN_DIA_DIEM = "Văn phòng DEMO";
const MA_CA = "DEMO-HC";
const MA_LICH = "DEMO-T2T7S";
const MA_BO_KPI = "kd-demo";

/** Băm FNV-1a 32 bit — giờ chấm "ngẫu nhiên" nhưng cố định theo (người, ngày) để chạy lại không sinh lần chấm mới. */
function bam(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const hhmm = (phut: number) => `${String(Math.floor(phut / 60)).padStart(2, "0")}:${String(phut % 60).padStart(2, "0")}`;

export async function seedNhanSuMau(db: Db, tenantId: string, idTheoEmail: Map<string, string>, matKhauBam: string) {
  const bayGio = new Date();
  const homNay = homNayVN(bayGio);
  const [namNay, thangNay] = homNay.split("-").map(Number);
  const tt = thangNay === 1 ? { nam: namNay - 1, thang: 12 } : { nam: namNay, thang: thangNay - 1 };
  const dauThangTruoc = `${tt.nam}-${String(tt.thang).padStart(2, "0")}-01`;
  const dem: string[] = [];

  // ---------------------------------------------------------------- thực tập sinh mẫu (tài khoản)
  const tts = await taoTaiKhoanThucTap(db, tenantId, idTheoEmail, matKhauBam);
  idTheoEmail.set(TTS, tts);

  const id = (email: string) => {
    const u = idTheoEmail.get(email);
    if (!u) throw new Error(`Thiếu tài khoản mẫu ${email}`);
    return u;
  };
  const voi = <T>(email: string, viec: (nc: NguCanh) => Promise<T>, tc: { haiLop?: boolean; timeoutMs?: number } = {}) =>
    voiTenant(
      tenantId,
      async (tx) => {
        const hoSo = await layHoSoQuyen(tx, id(email));
        if (!hoSo) throw new Error(`Không đọc được quyền của ${email}`);
        return viec(taoNguCanh(tx, tenantId, tc.haiLop ? { ...hoSo, da2Lop: true } : hoSo, null, "seed-mau"));
      },
      tc.timeoutMs ? { timeoutMs: tc.timeoutMs } : {},
    );

  // ================================================================ 1. Thiết lập chấm công
  let diaDiem = await db.workLocation.findFirst({ where: { tenantId, name: TEN_DIA_DIEM }, select: { id: true } });
  if (!diaDiem) {
    diaDiem = await voi(QT, (nc) =>
      taoDiaDiem(nc, LuocDoDiaDiem.parse({ ten: TEN_DIA_DIEM, diaChi: "Số 1 Đường Mẫu, Quận 1, TP. Hồ Chí Minh (DEMO)", viDo: VP.lat, kinhDo: VP.lng, banKinhM: 150 })),
    );
  }
  let ca = await db.workShift.findFirst({ where: { tenantId, code: MA_CA }, select: { id: true } });
  if (!ca) {
    ca = await voi(QT, (nc) => taoCa(nc, LuocDoCa.parse({ ma: MA_CA, ten: "Ca hành chính DEMO 08:00 – 17:00", gioVao: "08:00", gioRa: "17:00", gioNghi: "12:00", phutNghi: 60 })));
  }
  let lich = await db.workSchedule.findFirst({ where: { tenantId, code: MA_LICH }, select: { id: true } });
  if (!lich) {
    lich = await voi(QT, (nc) =>
      taoLich(nc, LuocDoLich.parse({ ma: MA_LICH, ten: "Lịch DEMO: thứ 2 – thứ 6 cả ca, sáng thứ 7", caId: ca!.id, ngay: ["ca", "ca", "ca", "ca", "ca", "sang", "nghi"] })),
    );
  }
  // Gán lịch từ đầu tháng trước cho người chưa có lịch nào (không đè lịch Nhân sự đã gán).
  const daCoLich = new Set((await db.scheduleAssignment.findMany({ where: { tenantId }, select: { userId: true } })).map((x) => x.userId));
  const canGan = NHAN_VIEN_CHAM_CONG.map(id).filter((u) => !daCoLich.has(u));
  if (canGan.length) {
    await voi(QT, (nc) => ganLich(nc, LuocDoGanLich.parse({ nguoiIds: canGan, lichId: lich!.id, tuNgay: dauThangTruoc, ghiChu: "DEMO — lịch mẫu" })));
  }
  // Mã chấm công (PIN), địa điểm mặc định, ngày vào làm — chỉ điền ô còn trống.
  const pinDaDung = new Set(
    (await db.staffProfile.findMany({ where: { tenantId, attendancePin: { not: null } }, select: { attendancePin: true } })).map((x) => x.attendancePin!),
  );
  const pinCua = new Map<string, string>();
  for (const [i, email] of NHAN_VIEN_CHAM_CONG.entries()) {
    const hs = await db.staffProfile.findUnique({ where: { userId: id(email) }, select: { attendancePin: true, defaultLocationId: true, hiredAt: true } });
    const sua: Record<string, unknown> = {};
    let pin = hs?.attendancePin ?? null;
    if (!pin) {
      const muon = String(1001 + i);
      if (!pinDaDung.has(muon)) {
        sua.maChamCong = muon;
        pin = muon;
        pinDaDung.add(muon);
      }
    }
    if (!hs?.defaultLocationId) sua.diaDiemMacDinhId = diaDiem.id;
    if (!hs?.hiredAt) sua.ngayVaoLam = `2025-0${1 + (i % 9)}-01`;
    if (Object.keys(sua).length) await voi(QT, (nc) => suaHoSoNhanSu(nc, id(email), LuocDoHoSoNhanSu.parse(sua)));
    if (pin) pinCua.set(email, pin);
  }
  if (!(await db.attendanceDevice.findFirst({ where: { tenantId, serialNumber: SN_MAY }, select: { id: true } }))) {
    if (await db.attendanceDevice.findFirst({ where: { serialNumber: SN_MAY }, select: { id: true } })) {
      console.log(`  (bỏ qua máy chấm công mẫu: SN ${SN_MAY} đã được đăng ký ở doanh nghiệp khác)`);
    } else {
      await voi(QT, (nc) => taoMay(nc, { soSeri: SN_MAY, ten: "Máy chấm công DEMO – cửa chính", diaDiemId: diaDiem!.id, ipChoPhep: [] }));
    }
  }
  const coMay = Boolean(await db.attendanceDevice.findFirst({ where: { tenantId, serialNumber: SN_MAY }, select: { id: true } }));
  // Ngày lễ dương lịch cố định của năm nay (lễ âm lịch đổi theo năm — Nhân sự tự thêm).
  for (const [ngay, ten] of [
    [`${namNay}-01-01`, "Tết Dương lịch (DEMO)"],
    [`${namNay}-04-30`, "Ngày Giải phóng miền Nam (DEMO)"],
    [`${namNay}-05-01`, "Ngày Quốc tế Lao động (DEMO)"],
    [`${namNay}-09-02`, "Quốc khánh (DEMO)"],
  ] as const) {
    if (!(await db.holiday.findFirst({ where: { tenantId, date: ngayVeDate(ngay) }, select: { id: true } }))) {
      await voi(QT, (nc) => taoNgayLe(nc, LuocDoNgayLe.parse({ ngay, ten })));
    }
  }
  // Hồ sơ thực tập (trường, người hướng dẫn) — trước khi giao việc / mở kỳ đánh giá để loại nhân sự đã là "thực tập".
  if (!(await db.internProfile.findFirst({ where: { tenantId, userId: tts }, select: { id: true } }))) {
    await voi(QT, (nc) =>
      suaHoSoNhanSu(nc, tts, LuocDoHoSoNhanSu.parse({
        loaiNhanSu: "thuc-tap", ngayVaoLam: dauThangTruoc,
        thucTap: {
          truong: "Trường Đại học DEMO Kinh tế", khoa: "Quản trị kinh doanh", mssv: "DEMO2026001", giangVienHuongDan: "ThS. Lê Văn Hướng (DEMO)",
          nguoiHuongDanId: id(KD1), tuNgay: dauThangTruoc, denNgay: congNgay(dauThangTruoc, 90), ghiChu: "DEMO — hồ sơ thực tập mẫu",
        },
      })),
    );
  }
  dem.push("thiết lập chấm công, hồ sơ thực tập");

  /** Gửi lần chấm vân tay qua đúng đường máy thật gọi (ADMS /iclock/cdata, bảng ATTLOG). */
  async function guiVanTay(dong: { email: string; luc: string; vao: boolean }[]) {
    if (!coMay || dong.length === 0) return 0;
    const than = dong
      .filter((d) => pinCua.has(d.email))
      .map((d) => `${pinCua.get(d.email)}\t${d.luc}\t${d.vao ? 0 : 1}\t1\t0\t0\t0`)
      .join("\n");
    const kq = await xuLyAdms({ phuongThuc: "POST", doan: "cdata", truyVan: new URLSearchParams(`SN=${SN_MAY}&table=ATTLOG`), than, ip: "127.0.0.1" });
    if (kq.status !== 200) throw new Error(`Máy chấm công mẫu bị từ chối: ${kq.status} ${kq.than}`);
    return dong.length;
  }

  // ================================================================ 2. Tháng trước: lần chấm, đơn từ, bảng công đã khóa
  const ngayLe = new Set(
    (await db.holiday.findMany({ where: { tenantId, status: "hoat-dong", date: { gte: ngayVeDate(dauThangTruoc), lte: ngayVeDate(congNgay(`${namNay}-${String(thangNay).padStart(2, "0")}-01`, -1)) } }, select: { date: true } }))
      .map((h) => h.date.toISOString().slice(0, 10)),
  );
  const ngayLam = cacNgayTrongThang(tt.nam, tt.thang).filter((d) => thuTrongTuan(d) < 6 && !ngayLe.has(d));
  const caNgay = ngayLam.filter((d) => thuTrongTuan(d) < 5);
  const pick = (i: number) => caNgay[Math.min(i, caNgay.length - 1)];
  const dacBiet = {
    muonKd2: new Set([pick(1), pick(6), pick(11)]),
    muonKd1: pick(3),
    somCskh: pick(4),
    tangCaKtv: pick(5),
    quenKd1: pick(7),
    somKho: pick(9),
    nghiKd2: pick(13),
  };

  let bangCong = await db.timesheet.findFirst({ where: { tenantId, year: tt.nam, month: tt.thang }, select: { id: true, status: true } });
  if (!bangCong || bangCong.status !== "da-khoa") {
    // Đơn nghỉ phép (đã duyệt) — tạo trước lần chấm cho đúng câu chuyện: ngày nghỉ không có lần chấm.
    const phepNam = await db.leaveType.findFirst({ where: { tenantId, code: "phep-nam" }, select: { id: true } });
    if (phepNam && !(await db.leaveRequest.findFirst({ where: { tenantId, userId: id(KD2), startDate: ngayVeDate(dacBiet.nghiKd2) }, select: { id: true } }))) {
      const don = await voi(KD2, (nc) =>
        taoDonNghi(nc, LuocDoDonNghi.parse({ loaiNghiId: phepNam.id, tuNgay: dacBiet.nghiKd2, denNgay: dacBiet.nghiKd2, lyDo: "DEMO — Việc gia đình, đã bàn giao khách cho anh An" })),
      );
      await voi(TPKD, (nc) => quyetDinhNghi(nc, don.id, LuocDoQuyetDinhNghi.parse({ hanhDong: "duyet", ghiChu: "DEMO — Đồng ý" })));
    }

    const dong: { email: string; luc: string; vao: boolean }[] = [];
    for (const email of NHAN_VIEN_CHAM_CONG) {
      for (const d of ngayLam) {
        if (email === KD2 && d === dacBiet.nghiKd2) continue;
        const h = bam(`${email}|${d}`);
        let vao = 7 * 60 + 40 + (h % 18);
        if (email === KD2 && dacBiet.muonKd2.has(d)) vao = 8 * 60 + 18 + (h % 17);
        if (email === KD1 && d === dacBiet.muonKd1) vao = 8 * 60 + 12;
        let ra: number | null = thuTrongTuan(d) === 5 ? 12 * 60 + 1 + ((h >>> 8) % 15) : 17 * 60 + 1 + ((h >>> 8) % 25);
        if (email === CSKH && d === dacBiet.somCskh) ra = 16 * 60 + 25;
        if (email === KHO && d === dacBiet.somKho) ra = 16 * 60 + 40;
        if (email === KTV && d === dacBiet.tangCaKtv) ra = 19 * 60 + 20;
        if (email === KD1 && d === dacBiet.quenKd1) ra = null; // quên chấm ra → giải trình bên dưới
        dong.push({ email, luc: `${d} ${hhmm(vao)}:${String(h % 60).padStart(2, "0")}`, vao: true });
        if (ra !== null) dong.push({ email, luc: `${d} ${hhmm(ra)}:${String((h >>> 16) % 60).padStart(2, "0")}`, vao: false });
      }
    }
    await guiVanTay(dong);

    // Quên chấm ra → giải trình, trưởng phòng duyệt (sinh lần chấm bù).
    if (!(await db.attendanceCorrection.findFirst({ where: { tenantId, userId: id(KD1), workDate: ngayVeDate(dacBiet.quenKd1) }, select: { id: true } }))) {
      const gt = await voi(KD1, (nc) =>
        taoGiaiTrinh(nc, LuocDoGiaiTrinh.parse({ ngay: dacBiet.quenKd1, gio: "17:15", huong: "ra", lyDo: "DEMO — Quên chấm vân tay lúc ra về, đi cùng trưởng phòng gặp khách đến 17:15" })),
      );
      await voi(TPKD, (nc) => quyetDinhGiaiTrinh(nc, gt.id, LuocDoQuyetDinh.parse({ hanhDong: "duyet", ghiChu: "DEMO — Xác nhận có mặt" })));
    }
    // Tăng ca có đơn đã duyệt.
    if (!(await db.overtimeRequest.findFirst({ where: { tenantId, userId: id(KTV), workDate: ngayVeDate(dacBiet.tangCaKtv) }, select: { id: true } }))) {
      const tc = await voi(KTV, (nc) => taoDonTangCa(nc, { ngay: dacBiet.tangCaKtv, soGio: 2, lyDo: "DEMO — Lắp đặt camera gấp cho khách sau giờ làm" }));
      await voi(TPKT, (nc) => quyetDinhTangCa(nc, tc.id, LuocDoQuyetDinh.parse({ hanhDong: "duyet", ghiChu: "DEMO — Duyệt 2 giờ", gioDuyet: 2 })));
    }

    // Bảng công: sinh (giờ sinh lùi về đầu tháng này, hoặc sớm hơn để hạn phản hồi đã qua) rồi khóa.
    const ch = await voi(QT, (nc) => docCauHinhChamCong(nc.tx));
    const hanNgay = so(ch.hanPhanHoiNgay, 3);
    const sinhLuc = new Date(Math.min(mocVN(`${namNay}-${String(thangNay).padStart(2, "0")}-01`, 9 * 60).getTime(), bayGio.getTime() - (hanNgay + 1) * 86_400_000));
    const khoaLuc = new Date(sinhLuc.getTime() + hanNgay * 86_400_000 + 3_600_000);
    const sinh = await voi(QT, (nc) => sinhBangCong(nc, { nam: tt.nam, thang: tt.thang }, sinhLuc), { timeoutMs: 120_000 });
    await voi(QT, (nc) => khoaBangCong(nc, sinh.id, khoaLuc));
    bangCong = { id: sinh.id, status: "da-khoa" };
    dem.push(`bảng công ${tt.thang}/${tt.nam} (${sinh.soNguoi} người, ${sinh.soDong} dòng) đã khóa`);
  }

  // ================================================================ 3. Hôm nay: bảng trực tiếp
  const lucHomNay = (phut: number) => mocVN(homNay, phut);
  const daChamHomNay = async (email: string) =>
    (await db.attendancePunch.count({ where: { tenantId, userId: id(email), punchedAt: { gte: lucHomNay(0), lt: lucHomNay(24 * 60) } } })) > 0;
  const vanTayHomNay: { email: string; luc: string; vao: boolean }[] = [];
  for (const [email, phut] of [[TPKD, 7 * 60 + 45], [KD1, 7 * 60 + 52], [KHO, 7 * 60 + 40], [KT, 7 * 60 + 58], [CSKH, 8 * 60 + 3]] as const) {
    if (lucHomNay(phut) <= bayGio && !(await daChamHomNay(email))) vanTayHomNay.push({ email, luc: `${homNay} ${hhmm(phut)}:12`, vao: true });
  }
  await guiVanTay(vanTayHomNay);
  // Phiếu hỗ trợ đang mở giao cho kỹ thuật viên → lần chấm GPS ở nhà khách là "hiện trường".
  const TIEU_DE_PHIEU = "DEMO — Bảo trì đầu ghi camera tại cửa hàng số 5";
  if (!(await db.supportTicket.findFirst({ where: { tenantId, title: TIEU_DE_PHIEU }, select: { id: true } }))) {
    const khach = await db.customer.findFirst({ where: { tenantId }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (khach) {
      await voi(CSKH, (nc) =>
        taoPhieu(nc, LuocDoTaoPhieu.parse({ khachHangId: khach.id, loai: "bao-tri", uuTien: "trung-binh", tieuDe: TIEU_DE_PHIEU, moTa: "DEMO — Bảo trì định kỳ, kiểm tra ổ cứng đầu ghi.", nguoiXuLyId: id(KTV) })),
      );
    }
  }
  const gps: { email: string; phut: number; viTri: { lat: number; lng: number } }[] = [
    { email: KTV, phut: 8 * 60 + 5, viTri: HIEN_TRUONG }, // hiện trường theo phiếu hỗ trợ
    { email: KD2, phut: 8 * 60 + 24, viTri: VP }, // trong vùng, đi muộn
    { email: MKT, phut: 8 * 60 + 41, viTri: NGOAI_VUNG }, // ngoài vùng, chờ quản lý xem xét
  ];
  for (const g of gps) {
    const luc = lucHomNay(g.phut);
    if (luc > bayGio || (await daChamHomNay(g.email))) continue;
    await voi(g.email, (nc) => xacNhanThongBaoViTri(nc));
    await voi(g.email, (nc) => chamCongGps(nc, { huong: "vao", viDo: g.viTri.lat, kinhDo: g.viTri.lng, doChinhXacM: 18 }, luc));
  }

  // ================================================================ 4. Công việc: mẫu, định kỳ, việc giao
  const TEN_MAU = "DEMO — Lắp đặt camera tại khách";
  let mau = await db.taskTemplate.findFirst({ where: { tenantId, name: TEN_MAU }, select: { id: true } });
  if (!mau) {
    mau = await voi(TPKT, (nc) =>
      taoMauViec(nc, LuocDoMauViec.parse({
        ten: TEN_MAU, tieuDe: "DEMO — Lắp đặt camera tại khách", moTa: "DEMO — Mẫu việc: khảo sát, lắp, cấu hình xem trên điện thoại, nghiệm thu.",
        doKho: 4, canDuyet: true, soNgayHan: 3,
        mucKiemTra: [{ nhan: "Chụp ảnh vị trí lắp", batBuoc: true }, { nhan: "Biên bản nghiệm thu có chữ ký khách", batBuoc: true }],
        chuoiDuyet: [{ loai: "nguoi-giao" }],
      })),
    );
  }
  const TEN_LAP = "DEMO — Gọi chăm sóc khách đầu tuần";
  if (!(await db.taskRecurrence.findFirst({ where: { tenantId, name: TEN_LAP }, select: { id: true } }))) {
    await voi(TPKD, (nc) =>
      taoLapViec(nc, LuocDoLapViec.parse({
        ten: TEN_LAP, tieuDe: "DEMO — Gọi chăm sóc 5 khách cũ đầu tuần", doKho: 2, tanSuat: "tuan", thu: [1], gioHan: "11:00",
        nguoiIds: [id(KD1), id(KD2)], tuNgay: homNay,
      })),
    );
  }

  const han = (ngay: number) => new Date(bayGio.getTime() + ngay * 86_400_000).toISOString();
  const KQ = "DEMO — Đã hoàn thành, gửi kèm biên bản và ảnh chụp.";
  type BuocViec = "cho-nhan" | "dang-lam" | "cho-duyet" | "da-duyet" | "tra-lai";
  const viecMau: { tieuDe: string; giao: string; lam: string; doKho: number; buoc: BuocViec; mauId?: string; chatLuong?: number }[] = [
    { tieuDe: "DEMO — Khảo sát mạng LAN văn phòng khách An Phú", giao: TPKD, lam: KD1, doKho: 4, buoc: "cho-nhan" },
    { tieuDe: "DEMO — Lập danh sách khách cần chăm sóc quý IV", giao: TPKD, lam: KD2, doKho: 2, buoc: "cho-nhan" },
    { tieuDe: "DEMO — Lắp camera cho kho hàng Hạnh Phúc", giao: TPKT, lam: KTV, doKho: 4, buoc: "cho-nhan", mauId: mau.id },
    { tieuDe: "DEMO — Chuẩn bị hồ sơ dự thầu phòng máy trường học", giao: TPKD, lam: KD1, doKho: 5, buoc: "dang-lam" },
    { tieuDe: "DEMO — Cập nhật bảng giá camera cho khách đại lý", giao: TPKD, lam: KD2, doKho: 3, buoc: "cho-duyet" },
    { tieuDe: "DEMO — Gửi báo giá bảo trì định kỳ cho khách cũ", giao: TPKD, lam: KD1, doKho: 3, buoc: "da-duyet", chatLuong: 5 },
    { tieuDe: "DEMO — Bảo trì đầu ghi camera cửa hàng số 5", giao: TPKT, lam: KTV, doKho: 4, buoc: "da-duyet", chatLuong: 4 },
    { tieuDe: "DEMO — Tổng hợp phản hồi khách hàng tháng trước", giao: TPKD, lam: TTS, doKho: 2, buoc: "da-duyet", chatLuong: 4 },
    { tieuDe: "DEMO — Viết hướng dẫn xem camera trên điện thoại", giao: TPKT, lam: KTV, doKho: 2, buoc: "tra-lai" },
  ];
  let soViecMoi = 0;
  for (const v of viecMau) {
    if (await db.task.findFirst({ where: { tenantId, title: v.tieuDe }, select: { id: true } })) continue;
    const viec = await voi(v.giao, (nc) =>
      taoViec(nc, LuocDoTaoViec.parse({
        tieuDe: v.tieuDe, moTa: "DEMO — việc giao mẫu", nguoiPhuTrachId: id(v.lam), doKho: v.doKho, canDuyet: true, han: han(v.buoc === "cho-nhan" ? 4 : 2),
        uuTien: v.doKho >= 4 ? "cao" : "trung-binh", ...(v.mauId && { mauViecId: v.mauId }),
      })),
    );
    soViecMoi++;
    if (v.buoc === "cho-nhan") continue;
    await voi(v.lam, (nc) => nhanViec(nc, viec.id));
    if (v.buoc === "dang-lam") {
      await voi(v.lam, (nc) => capNhatTienDo(nc, viec.id, { phanTram: 40, ghiChu: "DEMO — Đã có bản vẽ sơ bộ, đang chờ báo giá thiết bị" }));
      continue;
    }
    await voi(v.lam, (nc) => suaViec(nc, viec.id, { trangThai: "xong", ketQua: KQ, danhGia: "dat" }));
    if (v.buoc === "da-duyet") await voi(v.giao, (nc) => duyetViec(nc, viec.id, { chatLuong: v.chatLuong ?? 4, nhanXet: "DEMO — Làm tốt, đúng hạn" }));
    if (v.buoc === "tra-lai") await voi(v.giao, (nc) => traLaiViec(nc, viec.id, { lyDo: "DEMO — Thiếu ảnh chụp màn hình từng bước, bổ sung giúp anh" }));
  }
  dem.push(`${soViecMoi} việc giao mới`);

  // ================================================================ 5. Báo cáo ngày (tuần này) + báo cáo tuần có nhận xét
  const daCoBaoCao = async (email: string, loai: "ngay" | "tuan", ngay: string) =>
    Boolean(await db.workReport.findFirst({ where: { tenantId, userId: id(email), kind: loai, periodStart: ngayVeDate(kyBaoCao(loai, ngay).tu) }, select: { id: true } }));
  const ngayTuanNay = Array.from({ length: thuTrongTuan(homNay) + 1 }, (_, i) => congNgay(dauTuan(homNay), i)).filter((d) => thuTrongTuan(d) < 6);
  const noiDungNgay: Record<string, [string, string, string]> = {
    [KD1]: ["DEMO — Gọi 6 khách cũ, hẹn 2 buổi khảo sát; gửi 1 báo giá bảo trì.", "DEMO — Hoàn thiện hồ sơ dự thầu phòng máy.", ""],
    [KD2]: ["DEMO — Cập nhật bảng giá camera, gửi cho 3 đại lý.", "DEMO — Gọi lại khách Tân Tiến chốt số điểm camera.", "DEMO — Chờ giá mới của nhà cung cấp."],
    [KTV]: ["DEMO — Bảo trì đầu ghi cửa hàng số 5, thay 1 ổ cứng.", "DEMO — Viết lại hướng dẫn xem camera có ảnh từng bước.", ""],
  };
  for (const d of ngayTuanNay) {
    for (const email of d === homNay ? [KD1, KD2, KTV] : [KD1]) {
      if (await daCoBaoCao(email, "ngay", d)) continue;
      const [daLam, seLam, vuongMac] = noiDungNgay[email];
      await voi(email, (nc) => luuBaoCao(nc, LuocDoBaoCao.parse({ loai: "ngay", ngay: d, daLam, seLam, vuongMac, nop: true })));
    }
  }
  if (!(await daCoBaoCao(KD1, "tuan", homNay))) {
    const mo = await voi(KD1, (nc) => moBaoCao(nc, "tuan"));
    const bc = await voi(KD1, (nc) =>
      luuBaoCao(nc, LuocDoBaoCao.parse({
        loai: "tuan",
        daLam: `${mo.daLam ? `${mo.daLam}\n` : ""}DEMO — Chăm sóc 12 khách cũ, 2 buổi khảo sát mạng; gửi báo giá bảo trì định kỳ.`,
        seLam: `${mo.seLam ? `${mo.seLam}\n` : ""}DEMO — Nộp hồ sơ dự thầu phòng máy trường học trước thứ Sáu.`,
        vuongMac: "DEMO — Cần kỹ thuật đi khảo sát cùng ở trường học.",
        nop: true,
      })),
    );
    await voi(TPKD, (nc) => nhanXetBaoCao(nc, bc.id, { noiDung: "DEMO — Tốt. Anh sẽ xếp anh Cường đi khảo sát trường học cùng em ngày thứ Tư." }));
  }

  // ================================================================ 6. KPI + đánh giá tháng trước (3 phiếu đã chốt, xếp loại khác nhau)
  if (!(await db.kpiSet.findFirst({ where: { tenantId, code: MA_BO_KPI }, select: { id: true } }))) {
    await voi(QT, (nc) =>
      taoBoKpi(nc, LuocDoBoKpi.parse({
        ma: MA_BO_KPI, ten: "KPI Kinh doanh (DEMO)", moTa: "DEMO — bộ KPI mẫu cho nhân viên kinh doanh", maVaiTro: "sales",
        chiTieu: [
          { ten: "Doanh số đã thu tiền", trongSo: 40, nguon: "tu-dong", chiSo: "doanh-thu-da-thu", mucTieuThang: 150_000_000, mucTieuQuy: 450_000_000 },
          { ten: "Tỷ lệ việc xong đúng hạn", trongSo: 20, nguon: "tu-dong", chiSo: "ty-le-dung-han", mucTieuThang: 90, mucTieuQuy: 90 },
          { ten: "Chăm sóc khách hàng, thái độ phục vụ", trongSo: 40, nguon: "thu-cong" },
        ],
      })),
    );
  }
  let kyDg = await db.evaluationPeriod.findFirst({ where: { tenantId, kind: "thang", year: tt.nam, number: tt.thang }, select: { id: true } });
  if (!kyDg) kyDg = await voi(QT, (nc) => taoKyDanhGia(nc, { loai: "thang", nam: tt.nam, so: tt.thang, nguoiIds: [id(KD1), id(KD2), id(KTV)] }), { timeoutMs: 60_000 });
  // [người, quản lý chấm, điểm tay theo thứ tự chỉ tiêu, nhận xét] → A (≥ 90), B (≥ 75), C (≥ 60).
  const chamMau: [string, string, number[], string][] = [
    [KD1, TPKD, [100, 95, 92], "DEMO — Vượt doanh số, khách khen thái độ. Xếp loại A."],
    [KD2, TPKD, [80, 75, 82], "DEMO — Đạt yêu cầu, cần chủ động gọi lại khách đúng hẹn. Xếp loại B."],
    [KTV, TPKT, [68], "DEMO — Xử lý sự cố ổn nhưng còn trễ biên bản nghiệm thu. Xếp loại C."],
  ];
  for (const [email, quanLy, diem, nhanXet] of chamMau) {
    const p = await db.evaluation.findFirst({ where: { tenantId, periodId: kyDg.id, userId: id(email) }, include: { items: { orderBy: { position: "asc" } } } });
    if (!p) continue;
    if (p.status === "nhan-vien") await voi(email, (nc) => tuDanhGia(nc, p.id, { ghiChu: "DEMO — Tự đánh giá: hoàn thành phần việc chính trong tháng.", chiTieu: [], nop: true }));
    if (p.status === "nhan-vien" || p.status === "quan-ly") {
      await voi(quanLy, (nc) =>
        quanLyCham(nc, p.id, { nhanXet, chiTieu: p.items.map((c, i) => ({ id: c.id, diem: diem[i] ?? diem[diem.length - 1], ghiChu: "DEMO — chấm tay" })), nop: true }),
      );
    }
    if (p.status !== "da-chot") await voi(GD, (nc) => chotPhieu(nc, p.id, { ghiChu: "DEMO — Chốt" }));
  }

  // ================================================================ 7. Thực tập: 2 nhật ký tuần, phiếu đánh giá (nháp)
  const nhatKy: [number, string, string, string][] = [
    [-14, "DEMO — Làm quen sản phẩm camera, laptop; đi cùng anh An gặp 2 khách.", "DEMO — Cách đọc nhu cầu khách và lập báo giá.", "DEMO — Chưa quen phần mềm báo giá."],
    [-7, "DEMO — Gọi 15 khách cũ hỏi nhu cầu bảo trì; tổng hợp phản hồi khách.", "DEMO — Kỹ năng gọi điện chăm sóc khách.", ""],
  ];
  for (const [lui, daLam, hocDuoc, vuongMac] of nhatKy) {
    const tuan = congNgay(dauTuan(homNay), lui);
    if (await db.internJournal.findFirst({ where: { tenantId, userId: tts, weekStart: ngayVeDate(tuan) }, select: { id: true } })) continue;
    const nk = await voi(TTS, (nc) => luuNhatKy(nc, { ngay: tuan, daLam, hocDuoc, vuongMac, nop: true }));
    if (lui === -14) await voi(KD1, (nc) => nhanXetNhatKy(nc, nk.id, { noiDung: "DEMO — Tốt. Tuần sau em thử tự lập một báo giá nhỏ, anh xem lại." }));
  }
  if (!(await db.internEvaluation.findFirst({ where: { tenantId, userId: tts }, select: { id: true } }))) {
    const mauChung = await db.internEvalTemplate.findFirst({ where: { tenantId, code: "mau-chung", status: "hoat-dong" }, select: { id: true } });
    if (mauChung) {
      const pt = await voi(KD1, (nc) => taoPhieuThucTap(nc, { nguoiId: tts, mauId: mauChung.id }));
      await voi(KD1, (nc) =>
        chamPhieuThucTap(nc, pt.id, {
          thongTin: { "de-tai": "DEMO — Chăm sóc khách hàng doanh nghiệp" },
          diem: { "thai-do": 9, "ky-nang-mem": 8 },
          nhanXet: { "uu-diem": "DEMO — Chăm chỉ, giao tiếp tốt với khách." },
        }),
      );
    }
  }

  // ================================================================ 8. Kỳ lương tháng trước — nháp, đã tính
  if (bangCong?.status === "da-khoa") {
    let ky = await db.payrollRun.findFirst({ where: { tenantId, year: tt.nam, month: tt.thang, name: null }, select: { id: true, status: true } });
    if (!ky) ky = { ...(await voi(KT, (nc) => taoKyLuong(nc, { nam: tt.nam, thang: tt.thang }), { haiLop: true })), status: "nhap" };
    if (ky.status === "nhap") {
      const LY_DO = "DEMO — Thưởng nóng hoàn thành khảo sát mạng cho khách An Phú";
      if (!(await db.payrollItem.findFirst({ where: { tenantId, runId: ky.id, reason: LY_DO }, select: { id: true } }))) {
        await voi(KT, (nc) => themKhoanLuong(nc, ky!.id, LuocDoKhoan.parse({ nguoiId: id(KD1), chieu: "cong", loai: "thuong", soTien: 500_000, chiuThue: true, lyDo: LY_DO })), { haiLop: true });
      }
      const run = await db.payrollRun.findUniqueOrThrow({ where: { id: ky.id }, select: { dirty: true, _count: { select: { lines: true } } } });
      if (run.dirty || run._count.lines === 0) await voi(KT, (nc) => tinhKyLuong(nc, ky!.id), { haiLop: true, timeoutMs: 120_000 });
    }
  }

  const soLanCham = await db.attendancePunch.count({ where: { tenantId } });
  const soDong = await db.payrollLine.count({ where: { tenantId, run: { year: tt.nam, month: tt.thang } } });
  console.log(`✓ Nhân sự mẫu (DEMO): ${dem.join(", ")}; ${soLanCham} lần chấm; kỳ lương ${tt.thang}/${tt.nam}: ${soDong} dòng (nháp, đã tính)`);
}

/** Tài khoản thực tập sinh mẫu — cùng cách tạo với các tài khoản mẫu khác (mau.ts). */
async function taoTaiKhoanThucTap(db: Db, tenantId: string, idTheoEmail: Map<string, string>, matKhauBam: string): Promise<string> {
  const phong = await db.department.findUniqueOrThrow({ where: { tenantId_code: { tenantId, code: "kinh-doanh" } } });
  const vaiTro = await db.role.findUniqueOrThrow({ where: { tenantId_code: { tenantId, code: "sinh-vien-thuc-tap" } } });
  const u = await db.user.upsert({
    where: { tenantId_email: { tenantId, email: TTS } },
    update: {},
    create: { tenantId, email: TTS, fullName: "Phan Minh Tâm (DEMO)", passwordHash: matKhauBam, passwordChangedAt: new Date() },
  });
  await db.staffProfile.upsert({
    where: { userId: u.id },
    update: {},
    create: { tenantId, userId: u.id, departmentId: phong.id, jobTitle: "Thực tập sinh kinh doanh (DEMO)", managerId: idTheoEmail.get(TPKD) ?? null },
  });
  await db.userRole.upsert({
    where: { userId_roleId: { userId: u.id, roleId: vaiTro.id } },
    update: {},
    create: { tenantId, userId: u.id, roleId: vaiTro.id },
  });
  return u.id;
}
