import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { demVaKiem } from "@/lib/gioi-han-toc-do";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { batBuocQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { taoThongBao } from "@/modules/thong-bao/service";
import { banDoTen, congDuKienCuaNguoi, docCauHinhChamCong, kiemDuocDuyet, nghiDaDuyet, so } from "./chung";
import { PHIEN_BAN_THONG_BAO_VI_TRI, type DuLieuChamGps } from "./luoc-do";
import {
  CO,
  danhGiaViTri,
  duongDanBanDo,
  ganNgayCong,
  laBamTrung,
  mocVN,
  ngayVNCua,
  phutVeGio,
  tocDoToiThieuKmh,
  trangThaiHomNay,
} from "./tinh-toan";

/**
 * Chấm công GPS ngay trên Cowork, xác nhận thông báo vị trí, "chấm công của tôi", quản lý xem xét lần
 * chấm bị gắn cờ. Luật: BUSINESS_RULES.md mục 30 (NS-10 → NS-13, NS-18).
 */

/** Trần KỸ THUẬT chống bấm dồn (không phải ngưỡng nghiệp vụ): 10 lần chấm GPS / phút / người. */
const GPS_TOI_DA_MOI_PHUT = 10;
const TRANG_THAI_PHIEU_MO = ["MOI", "DANG_XU_LY", "CHO_KHACH"];

export const NHAN_NGUON: Record<string, string> = { "van-tay": "Máy vân tay", gps: "GPS", "bo-sung": "Chấm bù (đã duyệt)", "nhap-csv": "Nhập từ tệp" };
export const NHAN_KET_QUA_GPS: Record<string, string> = { "hop-le": "Trong vùng", "hien-truong": "Hiện trường", "ngoai-vung": "Ngoài vùng" };
export const NHAN_CO: Record<string, string> = {
  [CO.doChinhXacThap]: "Độ chính xác GPS thấp",
  [CO.tocDoBatThuong]: "Tốc độ di chuyển bất thường",
  [CO.thieuQuyenViTri]: "Không lấy được vị trí",
  [CO.gioMayLech]: "Giờ máy chấm công lệch",
  "di-muon": "Đi muộn",
  "ve-som": "Về sớm",
  "vang-mat": "Vắng mặt",
  "thieu-cham-ra": "Thiếu giờ ra",
  "thieu-cham-vao": "Thiếu giờ vào",
  "cho-xem-xet": "Có lần chấm chờ quản lý xem xét",
  "cham-cong-ngay-nghi-phep": "Có chấm công trong ngày nghỉ phép",
  "chua-co-lich": "Chưa được gán lịch làm",
  "tang-ca-vuot-tran": "Tăng ca vượt trần",
};

// ---------------------------------------------------------------------------
// Thông báo xử lý dữ liệu vị trí (NS-18)
// ---------------------------------------------------------------------------

export async function daXacNhanViTri(tx: ClientTenant, userId: string): Promise<boolean> {
  return (await tx.attendanceConsent.count({ where: { userId, noticeVersion: PHIEN_BAN_THONG_BAO_VI_TRI } })) > 0;
}

/** Ghi nhận nhân viên đã đọc thông báo — chỉ ghi thêm; đã có cho phiên bản này thì không ghi lại. */
export async function xacNhanThongBaoViTri(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "cham_cong.create", { objectType: "attendance_consent" });
  if (await daXacNhanViTri(nc.tx, nc.hoSo.userId)) return { daXacNhan: true, moi: false };
  const r = await nc.tx.attendanceConsent.create({
    data: {
      tenantId: nc.tenantId, userId: nc.hoSo.userId, noticeVersion: PHIEN_BAN_THONG_BAO_VI_TRI,
      ipAddress: nc.ip, userAgent: nc.userAgent?.slice(0, 500) ?? null,
    },
  });
  await nc.kiemToan({ action: "xac-nhan-vi-tri", objectType: "attendance_consent", objectId: r.id, after: { phienBan: PHIEN_BAN_THONG_BAO_VI_TRI } });
  await nc.suKien({ eventType: SU_KIEN.ATTENDANCE_CONSENT_RECORDED, objectType: "attendance_consent", objectId: r.id, payload: { phienBan: PHIEN_BAN_THONG_BAO_VI_TRI } });
  return { daXacNhan: true, moi: true };
}

// ---------------------------------------------------------------------------
// Chấm công GPS (NS-11 → NS-13)
// ---------------------------------------------------------------------------

function docGioMay(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Một lần bấm Vào ca / Ra ca. Giờ chấm là GIỜ MÁY CHỦ (giờ điện thoại chỉ lưu tham khảo). Kết quả:
 *  - `hop-le`: trong bán kính một địa điểm làm việc đang hoạt động;
 *  - `hien-truong`: ngoài vùng nhưng hôm nay đang có phiếu hỗ trợ giao cho mình (mở / đang xử lý /
 *    chờ khách, hoặc vừa xong hôm nay) — gắn phiếu, quản lý xem lại (không có dịch địa chỉ);
 *  - `ngoai-vung`: còn lại, hoặc không lấy được vị trí — vẫn ghi, gắn cờ, chờ quản lý chấp nhận.
 * Cờ: độ chính xác kém hơn ngưỡng, tốc độ di chuyển bất thường so với lần chấm trước, không lấy được
 * vị trí. Bấm trùng trong `cham_cong.chong_bam_trung_giay` giây → không ghi thêm, trả lại lần trước.
 */
export async function chamCongGps(nc: NguCanh, d: DuLieuChamGps, bayGio = new Date()) {
  batBuocQuyen(nc.hoSo, "cham_cong.create", { objectType: "attendance_punch" });
  const userId = nc.hoSo.userId;

  const gh = await demVaKiem(`cham-cong-gps:${nc.tenantId}:${userId}`, GPS_TOI_DA_MOI_PHUT, 60);
  if (!gh.choPhep) throw new LoiNghiepVu("Bạn bấm quá nhiều lần. Chờ một phút rồi thử lại.", 429, "qua-toc");
  if (!(await daXacNhanViTri(nc.tx, userId))) {
    throw new LoiNghiepVu("Đọc và xác nhận thông báo về dữ liệu vị trí trước khi chấm công lần đầu.", 422, "chua-xac-nhan-vi-tri");
  }

  // Hai lần bấm cùng lúc (mạng chậm, bấm đúp) phải xếp hàng để lần sau thấy lần trước.
  await nc.tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cham-cong-gps:${userId}`}, 0))`;
  const ch = await docCauHinhChamCong(nc.tx);
  const truocGps = await nc.tx.attendancePunch.findFirst({
    where: { userId, source: "gps" },
    orderBy: { punchedAt: "desc" },
    select: { id: true, punchedAt: true, direction: true, gpsResult: true },
  });
  if (truocGps && laBamTrung(truocGps.punchedAt, bayGio, so(ch.chongBamTrungGiay, 60))) {
    return { id: truocGps.id, luc: truocGps.punchedAt, huong: truocGps.direction, ketQua: truocGps.gpsResult, trungLap: true, co: [] as string[], diaDiem: null, phieu: null, canXemXet: false };
  }

  const viTri = d.viDo !== null && d.viDo !== undefined && d.kinhDo !== null && d.kinhDo !== undefined && !d.loiViTri
    ? { lat: d.viDo, lng: d.kinhDo, doChinhXacM: d.doChinhXacM ?? null }
    : null;
  const diaDiems = await nc.tx.workLocation.findMany({ where: { status: "hoat-dong" }, select: { id: true, name: true, latitude: true, longitude: true, radiusM: true } });
  const dg = danhGiaViTri(
    viTri,
    diaDiems.map((x) => ({ id: x.id, ten: x.name, lat: x.latitude, lng: x.longitude, banKinhM: x.radiusM })),
    { banKinhMacDinhM: so(ch.banKinhMacDinhM, 150), doChinhXacToiDaM: so(ch.doChinhXacToiDaM, 100) },
  );
  const co = [...dg.co];

  let ketQua: "hop-le" | "hien-truong" | "ngoai-vung" = dg.trongVung ? "hop-le" : "ngoai-vung";
  let phieu: { id: string; number: string; title: string } | null = null;
  if (!dg.trongVung && viTri) {
    phieu = await nc.tx.supportTicket.findFirst({
      where: {
        assigneeId: userId,
        OR: [{ status: { in: TRANG_THAI_PHIEU_MO } }, { resolvedAt: { gte: mocVN(ngayVNCua(bayGio), 0) } }],
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, number: true, title: true },
    });
    if (phieu) ketQua = "hien-truong";
  }

  // Tốc độ so với lần chấm trước có toạ độ (GPS, hoặc máy vân tay — lấy toạ độ địa điểm đặt máy).
  if (viTri) {
    const truoc = await nc.tx.attendancePunch.findFirst({
      where: { userId, punchedAt: { lte: bayGio }, OR: [{ latitude: { not: null } }, { locationId: { not: null } }] },
      orderBy: { punchedAt: "desc" },
      select: { punchedAt: true, latitude: true, longitude: true, accuracyM: true, location: { select: { latitude: true, longitude: true } } },
    });
    const lat = truoc?.latitude ?? truoc?.location?.latitude;
    const lng = truoc?.longitude ?? truoc?.location?.longitude;
    if (truoc && lat !== undefined && lat !== null && lng !== undefined && lng !== null) {
      const v = tocDoToiThieuKmh({ lat, lng, luc: truoc.punchedAt, doChinhXacM: truoc.accuracyM }, { ...viTri, luc: bayGio });
      if (v > so(ch.tocDoToiDaKmh, 120)) co.push(CO.tocDoBatThuong);
    }
  }

  const canXemXet = ketQua !== "hop-le" || co.length > 0;
  const lan = await nc.tx.attendancePunch.create({
    data: {
      tenantId: nc.tenantId,
      userId,
      punchedAt: bayGio,
      source: "gps",
      direction: d.huong,
      locationId: dg.trongVung ? dg.diaDiem?.id ?? null : null,
      latitude: viTri?.lat ?? null,
      longitude: viTri?.lng ?? null,
      accuracyM: viTri?.doChinhXacM ?? null,
      distanceM: dg.diaDiem?.khoangCachM ?? null,
      gpsResult: ketQua,
      ticketId: phieu?.id ?? null,
      flags: co,
      needsReview: canXemXet,
      clientTime: docGioMay(d.gioMay),
      ipAddress: nc.ip,
      userAgent: nc.userAgent?.slice(0, 500) ?? null,
      createdBy: userId,
    },
  });
  await nc.kiemToan({
    action: "cham-cong", objectType: "attendance_punch", objectId: lan.id,
    after: { nguon: "gps", huong: d.huong, ketQua, khoangCachM: dg.diaDiem?.khoangCachM ?? null, co, phieu: phieu?.number ?? null, loiViTri: d.loiViTri ?? null },
  });
  await nc.suKien({ eventType: SU_KIEN.ATTENDANCE_PUNCHED, objectType: "attendance_punch", objectId: lan.id, payload: { nguon: "gps", huong: d.huong, ketQua, co } });

  // Lần chấm cần xem xét → báo quản lý trực tiếp ngay (bảng trực tiếp cũng tự hiện trong 10 giây).
  if (canXemXet) {
    const hs = await nc.tx.staffProfile.findFirst({ where: { userId }, select: { managerId: true } });
    if (hs?.managerId && hs.managerId !== userId) {
      await taoThongBao(nc.tx, nc.tenantId, {
        nguoiNhanId: hs.managerId,
        loai: "cham-cong-can-xem-xet",
        mucDo: ketQua === "ngoai-vung" ? "canh-bao" : "thong-tin",
        tieuDe: `${nc.hoSo.hoTen} chấm ${d.huong === "vao" ? "vào" : "ra"} ca ${NHAN_KET_QUA_GPS[ketQua].toLowerCase()}`,
        noiDung: [phieu ? `Phiếu ${phieu.number}: ${phieu.title}` : null, ...co.map((c) => NHAN_CO[c] ?? c)].filter(Boolean).join(" · ") || null,
        duongDan: "/cham-cong/truc-tiep",
        doiTuong: "attendance_punch",
        doiTuongId: lan.id,
        khoaChongTrung: `cham-cong-xem-xet:${lan.id}`,
      });
    }
  }

  return {
    id: lan.id,
    luc: lan.punchedAt,
    huong: d.huong,
    ketQua,
    trungLap: false,
    co,
    diaDiem: dg.diaDiem,
    phieu: phieu ? { id: phieu.id, so: phieu.number } : null,
    canXemXet,
  };
}

// ---------------------------------------------------------------------------
// Xem xét lần chấm bị gắn cờ (NS-12)
// ---------------------------------------------------------------------------

export async function xemXetLanCham(nc: NguCanh, punchId: string, d: { quyetDinh: "chap-nhan" | "tu-choi"; ghiChu: string | null }) {
  const lan = await nc.tx.attendancePunch.findFirst({ where: { id: punchId }, select: { id: true, userId: true, needsReview: true, punchedAt: true, gpsResult: true } });
  if (!lan || !lan.userId) throw new LoiKhongTimThay("Lần chấm công");
  // NS-12: KHÔNG tự xem xét — kể cả người có phạm vi duyệt "all" (Nhân sự, Giám đốc). Khác với đơn từ
  // (NS-21 cho phạm vi all tự duyệt): lần chấm ngoài vùng của chính mình mà tự chấp nhận là tự cho mình công.
  if (lan.userId === nc.hoSo.userId) {
    throw new LoiNghiepVu("Không tự xem xét lần chấm công của chính mình — quản lý trực tiếp hoặc Nhân sự khác xem xét.", 403, "khong-tu-duyet");
  }
  await kiemDuocDuyet(nc, lan.userId, { objectType: "attendance_punch", objectId: punchId });
  if (!lan.needsReview) throw new LoiNghiepVu("Lần chấm này hợp lệ, không cần xem xét.", 422, "khong-can-xem-xet");
  if (d.quyetDinh === "tu-choi" && (!d.ghiChu || d.ghiChu.length < 2)) throw new LoiNghiepVu("Không chấp nhận thì ghi lý do để nhân viên biết.", 422, "thieu-ly-do");
  const r = await nc.tx.attendancePunchReview.create({
    data: { tenantId: nc.tenantId, punchId, decision: d.quyetDinh, note: d.ghiChu, reviewedBy: nc.hoSo.userId },
  });
  await nc.kiemToan({ action: "xem-xet-lan-cham", objectType: "attendance_punch", objectId: punchId, after: { quyetDinh: d.quyetDinh, ghiChu: d.ghiChu } });
  await nc.suKien({ eventType: SU_KIEN.ATTENDANCE_PUNCH_REVIEWED, objectType: "attendance_punch", objectId: punchId, payload: { quyetDinh: d.quyetDinh } });
  if (lan.userId !== nc.hoSo.userId) {
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: lan.userId,
      loai: "cham-cong-da-xem-xet",
      mucDo: d.quyetDinh === "tu-choi" ? "canh-bao" : "thong-tin",
      tieuDe: d.quyetDinh === "tu-choi" ? "Lần chấm công của bạn KHÔNG được chấp nhận" : "Lần chấm công của bạn đã được chấp nhận",
      noiDung: d.ghiChu,
      duongDan: "/cham-cong",
      doiTuong: "attendance_punch",
      doiTuongId: punchId,
      khoaChongTrung: `cham-cong-da-xem-xet:${r.id}`,
    });
  }
  return { id: r.id, quyetDinh: d.quyetDinh };
}

/** Quyết định xem xét MỚI NHẤT theo lần chấm. */
export async function quyetDinhMoiNhat(tx: ClientTenant, punchIds: string[]): Promise<Map<string, string>> {
  if (punchIds.length === 0) return new Map();
  const ds = await tx.attendancePunchReview.findMany({ where: { punchId: { in: punchIds } }, orderBy: { reviewedAt: "asc" }, select: { punchId: true, decision: true } });
  const kq = new Map<string, string>();
  for (const r of ds) kq.set(r.punchId, r.decision);
  return kq;
}

/**
 * Lần chấm có được TÍNH CÔNG không (NS-12): bị từ chối → không; GPS "ngoài vùng" → chỉ khi đã được
 * chấp nhận; còn lại (trong vùng, hiện trường, vân tay, bổ sung, CSV) → có, kể cả khi đang chờ xem xét.
 */
export function duocTinhCong(p: { gpsResult: string | null }, quyetDinh: string | undefined): boolean {
  if (quyetDinh === "tu-choi") return false;
  if (p.gpsResult === "ngoai-vung") return quyetDinh === "chap-nhan";
  return true;
}

// ---------------------------------------------------------------------------
// Chấm công của tôi
// ---------------------------------------------------------------------------

export async function chamCongCuaToi(nc: NguCanh, bayGio = new Date()) {
  batBuocQuyen(nc.hoSo, "cham_cong.view");
  const userId = nc.hoSo.userId;
  const ngay = ngayVNCua(bayGio);
  const ch = await docCauHinhChamCong(nc.tx);
  const [duKien] = await congDuKienCuaNguoi(nc.tx, userId, ngay, ngay);
  const nghi = (await nghiDaDuyet(nc.tx, [userId], ngay, ngay)).get(userId)?.get(ngay) ?? null;
  const ganDay = await nc.tx.attendancePunch.findMany({
    where: { userId, punchedAt: { gte: new Date(bayGio.getTime() - 14 * 86_400_000) } },
    orderBy: { punchedAt: "desc" },
    take: 40,
    select: {
      id: true, punchedAt: true, source: true, direction: true, gpsResult: true, flags: true, needsReview: true, latitude: true, longitude: true,
      distanceM: true, location: { select: { name: true } }, device: { select: { name: true } },
    },
  });
  const qd = await quyetDinhMoiNhat(nc.tx, ganDay.map((p) => p.id));
  const tinh = ganDay.filter((p) => duocTinhCong(p, qd.get(p.id)));
  const nhom = ganNgayCong(
    tinh.map((p) => p.punchedAt),
    [{ ngay, khoang: duKien.khoang }],
    so(ch.cuaSoTruocPhut, 240),
    so(ch.cuaSoSauPhut, 480),
  ).get(ngay) ?? [];
  const homNay = tinh.filter((p) => nhom.some((t) => t.getTime() === p.punchedAt.getTime()));
  const trangThai = trangThaiHomNay(
    duKien,
    homNay.map((p) => ({ luc: p.punchedAt, huong: (p.direction as "vao" | "ra" | null) ?? null, ketQuaGps: p.gpsResult })),
    Boolean(nghi && nghi.giaTri >= duKien.giaTri && duKien.giaTri > 0),
    bayGio,
    so(ch.choPhepMuonPhut, 5),
  );
  return {
    daXacNhanViTri: await daXacNhanViTri(nc.tx, userId),
    phienBanThongBao: PHIEN_BAN_THONG_BAO_VI_TRI,
    homNay: {
      ngay,
      loaiNgay: duKien.loaiNgay,
      phan: duKien.phan,
      gioVao: duKien.khoang ? phutVeGio(Math.round((duKien.khoang.batDau.getTime() - mocVN(ngay, 0).getTime()) / 60000)) : null,
      gioRa: duKien.khoang ? phutVeGio(Math.round((duKien.khoang.ketThuc.getTime() - mocVN(ngay, 0).getTime()) / 60000)) : null,
      coLich: duKien.coLich,
      nghi: nghi ? { phan: nghi.phan, giaTri: nghi.giaTri } : null,
      trangThai,
      soLanCham: homNay.length,
    },
    ganDay: ganDay.map((p) => ({
      id: p.id,
      luc: p.punchedAt,
      nguon: p.source,
      huong: p.direction,
      ketQuaGps: p.gpsResult,
      co: Array.isArray(p.flags) ? (p.flags as string[]) : [],
      canXemXet: p.needsReview,
      quyetDinh: qd.get(p.id) ?? null,
      tinhCong: duocTinhCong(p, qd.get(p.id)),
      noi: p.device?.name ?? p.location?.name ?? null,
      khoangCachM: p.distanceM,
      banDo: p.latitude !== null && p.longitude !== null ? duongDanBanDo(p.latitude, p.longitude) : null,
    })),
  };
}

/** Lần chấm cần xem xét trong phạm vi duyệt của người đang xem (chưa có quyết định). */
export async function lanChamCanXemXet(nc: NguCanh, nguoiIds: string[] | "tat-ca", tu: Date) {
  const ds = await nc.tx.attendancePunch.findMany({
    where: {
      needsReview: true, punchedAt: { gte: tu }, ...(nguoiIds !== "tat-ca" && { userId: { in: nguoiIds } }), reviews: { none: {} },
      // Không bao giờ hiện lần chấm của chính người xem (NS-12: không tự xem xét).
      NOT: { userId: nc.hoSo.userId },
    },
    orderBy: { punchedAt: "desc" },
    take: 200,
    select: {
      id: true, userId: true, punchedAt: true, direction: true, gpsResult: true, flags: true, latitude: true, longitude: true, distanceM: true, ticketId: true,
    },
  });
  const ten = await banDoTen(nc.tx, ds.map((p) => p.userId));
  const phieu = await nc.tx.supportTicket.findMany({ where: { id: { in: ds.map((p) => p.ticketId).filter((x): x is string => Boolean(x)) } }, select: { id: true, number: true } });
  const soPhieu = new Map(phieu.map((p) => [p.id, p.number]));
  return ds.map((p) => ({
    id: p.id,
    nguoi: { id: p.userId, hoTen: ten.get(p.userId ?? "") ?? "—" },
    luc: p.punchedAt,
    huong: p.direction,
    ketQuaGps: p.gpsResult,
    co: Array.isArray(p.flags) ? (p.flags as string[]) : [],
    khoangCachM: p.distanceM,
    phieu: p.ticketId ? { id: p.ticketId, so: soPhieu.get(p.ticketId) ?? "" } : null,
    banDo: p.latitude !== null && p.longitude !== null ? duongDanBanDo(p.latitude, p.longitude) : null,
  }));
}
