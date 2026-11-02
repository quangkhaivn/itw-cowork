import type { z } from "zod";
import type { NguCanh } from "@/lib/api";
import type { ClientTenant } from "@/lib/db";
import { taoCsv } from "@/lib/csv";
import { khoaChungTu } from "@/lib/khoa-chung-tu";
import { LoiKhongTimThay, LoiNghiepVu } from "@/lib/loi";
import { batBuocQuyen, coQuyen } from "@/lib/phan-quyen";
import { SU_KIEN } from "@/lib/su-kien";
import { dateVeNgay, ngayVeDate } from "@/modules/crm/chung";
import { baoChoNguoiCoQuyen, taoThongBao } from "@/modules/thong-bao/service";
import { banDoTen, docCauHinhChamCong, lichCuaNhieuNguoi, locNguoiXem, ngayLeTrongKhoang, nghiDaDuyet, so, type CauHinhChamCong } from "./chung";
import type { LuocDoGiaiQuyetPhanHoi, LuocDoPhanHoiCong, LuocDoSinhBangCong } from "./luoc-do";
import { duocTinhCong, NHAN_CO, NHAN_NGUON, quyetDinhMoiNhat } from "./service";
import {
  cacNgayTrongThang,
  chenhLechCong,
  congDuKien,
  congNgay,
  congSoLieu,
  conHanPhanHoi,
  ganNgayCong,
  mocVN,
  NHAN_LOAI_NGAY,
  tinhCongNgay,
  tinhTangCa,
  tongHopThang,
  type DongCongThang,
  type LoaiNgay,
  type SoLieuCong,
} from "./tinh-toan";

/**
 * Bảng công tháng (NS-50 → NS-54): Nhân sự sinh NHÁP → nhân viên xem của mình và phản hồi trong hạn →
 * Nhân sự giải quyết → KHÓA. Bảng đã khóa bất biến (trigger `chan_sua_bang_cong_da_khoa`); sai sót phát
 * hiện sau khi khóa đi vào kỳ sau dưới dạng DÒNG ĐIỀU CHỈNH (chênh lệch so với số đã khóa).
 */

/** Số tháng lùi lại để tìm thay đổi của các kỳ đã khóa (chấm bù duyệt muộn, đơn nghỉ hủy muộn…). */
const SO_THANG_DIEU_CHINH = 3;

interface DongTinh extends DongCongThang {
  vaoDau: Date | null;
  raCuoi: Date | null;
  nguon: string[];
  maLoaiNghi: string | null;
}

/** Tính công của nhiều người cho một danh sách ngày (một tháng) — dùng cho bảng công và điều chỉnh. */
async function tinhCong(tx: ClientTenant, ch: CauHinhChamCong, userIds: string[], cacNgay: string[]): Promise<DongTinh[]> {
  if (userIds.length === 0 || cacNgay.length === 0) return [];
  const tu = cacNgay[0];
  const den = cacNgay[cacNgay.length - 1];
  const truoc = congNgay(tu, -1);
  const sau = congNgay(den, 1);
  const lich = await lichCuaNhieuNguoi(tx, userIds, sau);
  const le = await ngayLeTrongKhoang(tx, truoc, sau);
  const nghi = await nghiDaDuyet(tx, userIds, tu, den);
  const lan = await tx.attendancePunch.findMany({
    where: { userId: { in: userIds }, punchedAt: { gte: mocVN(truoc, 0), lt: mocVN(congNgay(sau, 1), 0) } },
    select: { id: true, userId: true, punchedAt: true, source: true, gpsResult: true, flags: true, needsReview: true },
  });
  const qd = await quyetDinhMoiNhat(tx, lan.filter((p) => p.needsReview).map((p) => p.id));
  const tangCa = await tx.overtimeRequest.findMany({
    where: { userId: { in: userIds }, status: "da-duyet", workDate: { gte: ngayVeDate(tu), lte: ngayVeDate(den) } },
    select: { userId: true, workDate: true, approvedHours: true },
  });
  const gioTc = new Map(tangCa.map((t) => [`${t.userId}|${dateVeNgay(t.workDate)}`, Number(t.approvedHours ?? 0)]));
  const macDinh = { choPhepMuonPhut: so(ch.choPhepMuonPhut, 5), choPhepSomPhut: so(ch.choPhepSomPhut, 5) };
  const dem = { batDauGio: so(ch.gioDemBatDau, 22), ketThucGio: so(ch.gioDemKetThuc, 6) };

  const kq: DongTinh[] = [];
  for (const userId of userIds) {
    const lichNguoi = lich.get(userId)!;
    const tatCaNgay = [truoc, ...cacNgay, sau];
    const duKien = new Map(
      tatCaNgay.map((d) => {
        const l = lichNguoi(d);
        return [d, congDuKien(d, l?.ca ?? null, l?.ngay ?? null, le.has(d))];
      }),
    );
    const cuaNguoi = lan.filter((p) => p.userId === userId);
    const tinh = cuaNguoi.filter((p) => duocTinhCong(p, qd.get(p.id)));
    const theoLuc = new Map(tinh.map((p) => [p.punchedAt.getTime(), p]));
    const nhom = ganNgayCong(tinh.map((p) => p.punchedAt), [...duKien.values()], so(ch.cuaSoTruocPhut, 240), so(ch.cuaSoSauPhut, 480));
    const choXemXet = new Set(cuaNguoi.filter((p) => p.needsReview && !qd.has(p.id)).map((p) => p.punchedAt.getTime()));
    for (const ngay of cacNgay) {
      const dk = duKien.get(ngay)!;
      const ds = nhom.get(ngay) ?? [];
      const ng = nghi.get(userId)?.get(ngay) ?? null;
      if (dk.giaTri === 0 && ds.length === 0 && !ng) continue;
      const cong = tinhCongNgay(dk, ds, ng, macDinh);
      const tc = tinhTangCa(dk, cong.vaoDau, cong.raCuoi, gioTc.get(`${userId}|${ngay}`) ?? null, dem);
      const co = [...cong.co];
      if (ds.some((t) => choXemXet.has(t.getTime()))) co.push("cho-xem-xet");
      kq.push({
        userId, ngay, laDieuChinh: false, loaiNgay: dk.loaiNgay, congDuKien: dk.giaTri, congThucTe: cong.giaTriCong,
        phutMuon: cong.phutMuon, phutSom: cong.phutSom, nghiNgay: cong.nghiNgay, nghiCoLuong: ng?.coLuong ?? false,
        phutTangCa: tc.phut, phutTangCaDem: tc.phutDem, co, vaoDau: cong.vaoDau, raCuoi: cong.raCuoi,
        nguon: [...new Set(ds.map((t) => theoLuc.get(t.getTime())?.source).filter((x): x is string => Boolean(x)))],
        maLoaiNghi: ng?.maLoai ?? null,
      });
    }
  }
  return kq;
}

function soLieu(r: { expectedValue: unknown; workValue: unknown; lateMinutes: number; earlyMinutes: number; leaveDays: unknown; otMinutes: number; otNightMinutes: number }): SoLieuCong {
  return {
    congDuKien: Number(r.expectedValue), congThucTe: Number(r.workValue), phutMuon: r.lateMinutes, phutSom: r.earlyMinutes,
    nghiNgay: Number(r.leaveDays), phutTangCa: r.otMinutes, phutTangCaDem: r.otNightMinutes,
  };
}

function thangTruoc(nam: number, thang: number, lui: number): { nam: number; thang: number } {
  const t = nam * 12 + (thang - 1) - lui;
  return { nam: Math.floor(t / 12), thang: (t % 12) + 1 };
}

/** Người có mặt trong bảng công tháng: có lịch hiệu lực trong tháng hoặc có lần chấm trong tháng. */
async function nguoiCuaThang(tx: ClientTenant, tu: string, den: string): Promise<string[]> {
  const coLich = await tx.scheduleAssignment.findMany({ where: { effectiveFrom: { lte: ngayVeDate(den) } }, select: { userId: true }, distinct: ["userId"] });
  const coCham = await tx.attendancePunch.findMany({
    where: { userId: { not: null }, punchedAt: { gte: mocVN(tu, 0), lt: mocVN(congNgay(den, 1), 0) } },
    select: { userId: true },
    distinct: ["userId"],
  });
  const cham = coCham.map((x) => x.userId!);
  const ids = [...new Set([...coLich.map((x) => x.userId), ...cham])];
  // Người đã ngừng hoạt động chỉ vào bảng khi còn lần chấm trong tháng (nghỉ việc giữa tháng).
  const u = await tx.user.findMany({ where: { id: { in: ids }, isSystem: false, OR: [{ status: "hoat-dong" }, { id: { in: cham } }] }, select: { id: true } });
  return u.map((x) => x.id).sort();
}

export async function danhSachBangCong(nc: NguCanh) {
  batBuocQuyen(nc.hoSo, "cham_cong.view");
  const ds = await nc.tx.timesheet.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 36,
    select: { id: true, year: true, month: true, status: true, generatedAt: true, feedbackDeadline: true, lockedAt: true, _count: { select: { feedback: { where: { status: "mo" } } } } },
  });
  return ds.map((t) => ({ id: t.id, nam: t.year, thang: t.month, trangThai: t.status, sinhLuc: t.generatedAt, hanPhanHoi: t.feedbackDeadline, khoaLuc: t.lockedAt, phanHoiMo: t._count.feedback }));
}

/**
 * Sinh (hoặc sinh lại) bảng công NHÁP của tháng (NS-50). Sinh lại xóa dòng cũ của bản nháp và tính
 * lại từ lần chấm / đơn hiện có; phản hồi của nhân viên giữ nguyên; hạn phản hồi tính từ lần sinh đầu.
 * Kỳ đã khóa thì không sinh lại được.
 */
export async function sinhBangCong(nc: NguCanh, d: z.infer<typeof LuocDoSinhBangCong>, bayGio = new Date()) {
  batBuocQuyen(nc.hoSo, "cham_cong.update", { objectType: "timesheet" });
  const ch = await docCauHinhChamCong(nc.tx);
  const ngays = cacNgayTrongThang(d.nam, d.thang);
  let bang = await nc.tx.timesheet.findFirst({ where: { year: d.nam, month: d.thang } });
  if (bang) {
    await khoaChungTu(nc.tx, "timesheets", bang.id);
    bang = await nc.tx.timesheet.findFirstOrThrow({ where: { id: bang.id } });
    if (bang.status === "da-khoa") throw new LoiNghiepVu("Bảng công tháng này đã khóa — sai sót sửa bằng dòng điều chỉnh ở kỳ sau.", 409, "da-khoa");
    await nc.tx.timesheetRow.deleteMany({ where: { timesheetId: bang.id } });
    await nc.tx.timesheet.update({ where: { id: bang.id }, data: { generatedAt: bayGio, generatedBy: nc.hoSo.userId } });
  } else {
    bang = await nc.tx.timesheet.create({
      data: {
        tenantId: nc.tenantId, year: d.nam, month: d.thang, generatedAt: bayGio, generatedBy: nc.hoSo.userId,
        feedbackDeadline: new Date(bayGio.getTime() + so(ch.hanPhanHoiNgay, 3) * 86_400_000),
      },
    });
  }

  const nguoi = await nguoiCuaThang(nc.tx, ngays[0], ngays[ngays.length - 1]);
  const dong = await tinhCong(nc.tx, ch, nguoi, ngays);
  const duLieu = dong.map((r) => ({
    tenantId: nc.tenantId, timesheetId: bang!.id, userId: r.userId, workDate: ngayVeDate(r.ngay), isAdjustment: false, dayType: r.loaiNgay,
    expectedValue: r.congDuKien, firstIn: r.vaoDau, lastOut: r.raCuoi, sources: r.nguon, workValue: r.congThucTe, lateMinutes: r.phutMuon,
    earlyMinutes: r.phutSom, leaveTypeCode: r.maLoaiNghi, leaveDays: r.nghiNgay, leavePaid: r.nghiCoLuong, otMinutes: r.phutTangCa,
    otNightMinutes: r.phutTangCaDem, flags: r.co,
  }));

  // Dòng điều chỉnh cho các kỳ ĐÃ KHÓA gần đây (NS-53).
  const dieuChinh: typeof duLieu = [];
  for (let lui = 1; lui <= SO_THANG_DIEU_CHINH; lui++) {
    const k = thangTruoc(d.nam, d.thang, lui);
    const cu = await nc.tx.timesheet.findFirst({ where: { year: k.nam, month: k.thang, status: "da-khoa" }, select: { id: true } });
    if (!cu) continue;
    const ngayCu = cacNgayTrongThang(k.nam, k.thang);
    const daKhoa = await nc.tx.timesheetRow.findMany({ where: { timesheetId: cu.id, isAdjustment: false } });
    const dcTruoc = await nc.tx.timesheetRow.findMany({
      where: { isAdjustment: true, timesheetId: { not: bang.id }, workDate: { gte: ngayVeDate(ngayCu[0]), lte: ngayVeDate(ngayCu[ngayCu.length - 1]) } },
    });
    const nguoiCu = [...new Set([...daKhoa.map((r) => r.userId), ...(await nguoiCuaThang(nc.tx, ngayCu[0], ngayCu[ngayCu.length - 1]))])].sort();
    const moi = await tinhCong(nc.tx, ch, nguoiCu, ngayCu);
    const khoa = (u: string, n: string) => `${u}|${n}`;
    const goc = new Map<string, SoLieuCong>();
    for (const r of daKhoa) goc.set(khoa(r.userId, dateVeNgay(r.workDate)), soLieu(r));
    for (const r of dcTruoc) {
      const k2 = khoa(r.userId, dateVeNgay(r.workDate));
      goc.set(k2, congSoLieu(goc.get(k2) ?? soLieu({ expectedValue: 0, workValue: 0, lateMinutes: 0, earlyMinutes: 0, leaveDays: 0, otMinutes: 0, otNightMinutes: 0 }), soLieu(r)));
    }
    const rong: SoLieuCong = { congDuKien: 0, congThucTe: 0, phutMuon: 0, phutSom: 0, nghiNgay: 0, phutTangCa: 0, phutTangCaDem: 0 };
    const daXet = new Set<string>();
    const theoKhoa = new Map(moi.map((r) => [khoa(r.userId, r.ngay), r]));
    for (const k2 of new Set([...theoKhoa.keys(), ...goc.keys()])) {
      if (daXet.has(k2)) continue;
      daXet.add(k2);
      const m = theoKhoa.get(k2);
      const sm: SoLieuCong = m ? { congDuKien: m.congDuKien, congThucTe: m.congThucTe, phutMuon: m.phutMuon, phutSom: m.phutSom, nghiNgay: m.nghiNgay, phutTangCa: m.phutTangCa, phutTangCaDem: m.phutTangCaDem } : rong;
      const lech = chenhLechCong(sm, goc.get(k2) ?? rong);
      if (!lech) continue;
      const [userId, ngay] = k2.split("|");
      dieuChinh.push({
        tenantId: nc.tenantId, timesheetId: bang.id, userId, workDate: ngayVeDate(ngay), isAdjustment: true,
        dayType: (m?.loaiNgay ?? "thuong") as LoaiNgay, expectedValue: lech.congDuKien, firstIn: m?.vaoDau ?? null, lastOut: m?.raCuoi ?? null,
        sources: m?.nguon ?? [], workValue: lech.congThucTe, lateMinutes: lech.phutMuon, earlyMinutes: lech.phutSom,
        leaveTypeCode: m?.maLoaiNghi ?? null, leaveDays: lech.nghiNgay, leavePaid: m?.nghiCoLuong ?? false, otMinutes: lech.phutTangCa,
        otNightMinutes: lech.phutTangCaDem, flags: ["dieu-chinh-ky-truoc"],
      });
    }
  }
  if (duLieu.length) await nc.tx.timesheetRow.createMany({ data: duLieu });
  if (dieuChinh.length) await nc.tx.timesheetRow.createMany({ data: dieuChinh });

  await nc.kiemToan({ action: "sinh-bang-cong", objectType: "timesheet", objectId: bang.id, after: { nam: d.nam, thang: d.thang, soNguoi: nguoi.length, soDong: duLieu.length, soDieuChinh: dieuChinh.length } });
  await nc.suKien({ eventType: SU_KIEN.TIMESHEET_GENERATED, objectType: "timesheet", objectId: bang.id, payload: { nam: d.nam, thang: d.thang, soDong: duLieu.length, soDieuChinh: dieuChinh.length } });
  // Báo từng người có trong bảng (một lần mỗi bảng) để họ xem và phản hồi trong hạn.
  for (const u of nguoi) {
    if (u === nc.hoSo.userId) continue;
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: u, loai: "bang-cong-nhap", tieuDe: `Bảng công tháng ${d.thang}/${d.nam} đã có — xem và phản hồi nếu sai`,
      duongDan: `/cham-cong/bang-cong/${bang.id}`, doiTuong: "timesheet", doiTuongId: bang.id, khoaChongTrung: `bang-cong-nhap:${bang.id}`,
    });
  }
  return { id: bang.id, soNguoi: nguoi.length, soDong: duLieu.length, soDieuChinh: dieuChinh.length };
}

export async function chiTietBangCong(nc: NguCanh, id: string, nguoiId?: string | null, bayGio = new Date()) {
  batBuocQuyen(nc.hoSo, "cham_cong.view");
  const bang = await nc.tx.timesheet.findFirst({ where: { id } });
  if (!bang) throw new LoiKhongTimThay("Bảng công");
  const xem = await locNguoiXem(nc);
  const locNguoi = nguoiId ? (xem.userId && !xem.userId.in.includes(nguoiId) ? { userId: { in: [] as string[] } } : { userId: nguoiId }) : xem;
  const dong = await nc.tx.timesheetRow.findMany({
    where: { AND: [{ timesheetId: id }, locNguoi] },
    orderBy: [{ userId: "asc" }, { workDate: "asc" }, { isAdjustment: "asc" }],
  });
  const ten = await banDoTen(nc.tx, [...dong.map((r) => r.userId), bang.generatedBy, bang.lockedBy]);
  const dongCong: DongCongThang[] = dong.map((r) => ({
    userId: r.userId, ngay: dateVeNgay(r.workDate), laDieuChinh: r.isAdjustment, loaiNgay: r.dayType as LoaiNgay, congDuKien: Number(r.expectedValue),
    congThucTe: Number(r.workValue), phutMuon: r.lateMinutes, phutSom: r.earlyMinutes, nghiNgay: Number(r.leaveDays), nghiCoLuong: r.leavePaid,
    phutTangCa: r.otMinutes, phutTangCaDem: r.otNightMinutes, co: Array.isArray(r.flags) ? (r.flags as string[]) : [],
  }));
  const phanHoi = await nc.tx.timesheetFeedback.findMany({
    where: { AND: [{ timesheetId: id }, locNguoi] },
    orderBy: { createdAt: "asc" },
    select: { id: true, userId: true, workDate: true, content: true, status: true, resolution: true, resolvedBy: true, resolvedAt: true, createdAt: true },
  });
  const tenPh = await banDoTen(nc.tx, [...phanHoi.map((p) => p.userId), ...phanHoi.map((p) => p.resolvedBy)]);
  return {
    id: bang.id, nam: bang.year, thang: bang.month, trangThai: bang.status, sinhLuc: bang.generatedAt, nguoiSinh: bang.generatedBy ? ten.get(bang.generatedBy) ?? "—" : null,
    hanPhanHoi: bang.feedbackDeadline, conHanPhanHoi: bang.status === "nhap" && conHanPhanHoi(bang.feedbackDeadline, bayGio),
    khoaLuc: bang.lockedAt, nguoiKhoa: bang.lockedBy ? ten.get(bang.lockedBy) ?? "—" : null,
    duocQuanLy: coQuyen(nc.hoSo, "cham_cong.update"),
    duocXuat: coQuyen(nc.hoSo, "cham_cong.export"),
    tongHop: tongHopThang(dongCong).map((t) => ({ ...t, hoTen: ten.get(t.userId) ?? "—" })).sort((a, b) => a.hoTen.localeCompare(b.hoTen, "vi")),
    dong: dong.map((r, i) => ({
      id: r.id, ...dongCong[i], hoTen: ten.get(r.userId) ?? "—", vaoDau: r.firstIn, raCuoi: r.lastOut,
      nguon: Array.isArray(r.sources) ? (r.sources as string[]).map((s) => NHAN_NGUON[s] ?? s) : [], maLoaiNghi: r.leaveTypeCode,
      nhanCo: dongCong[i].co.map((c) => NHAN_CO[c] ?? (c === "dieu-chinh-ky-truoc" ? "Điều chỉnh kỳ đã khóa" : c)),
    })),
    phanHoi: phanHoi.map((p) => ({
      id: p.id, nguoi: { id: p.userId, hoTen: tenPh.get(p.userId) ?? "—" }, ngay: p.workDate ? dateVeNgay(p.workDate) : null, noiDung: p.content,
      trangThai: p.status, giaiQuyet: p.resolution, nguoiGiaiQuyet: p.resolvedBy ? tenPh.get(p.resolvedBy) ?? "—" : null, giaiQuyetLuc: p.resolvedAt, luc: p.createdAt,
    })),
  };
}

/** Nhân viên phản hồi về bảng công của CHÍNH MÌNH, khi bảng còn nháp và còn hạn (NS-51). */
export async function guiPhanHoiCong(nc: NguCanh, id: string, d: z.infer<typeof LuocDoPhanHoiCong>, bayGio = new Date()) {
  batBuocQuyen(nc.hoSo, "cham_cong.create", { objectType: "timesheet_feedback" });
  await khoaChungTu(nc.tx, "timesheets", id);
  const bang = await nc.tx.timesheet.findFirst({ where: { id } });
  if (!bang) throw new LoiKhongTimThay("Bảng công");
  if (bang.status !== "nhap") throw new LoiNghiepVu("Bảng công đã khóa — liên hệ Nhân sự để điều chỉnh ở kỳ sau.", 409, "da-khoa");
  if (!conHanPhanHoi(bang.feedbackDeadline, bayGio)) throw new LoiNghiepVu("Đã hết hạn phản hồi bảng công này.", 422, "het-han-phan-hoi");
  const coDong = await nc.tx.timesheetRow.count({ where: { timesheetId: id, userId: nc.hoSo.userId } });
  if (coDong === 0) throw new LoiNghiepVu("Bạn không có dòng công nào trong bảng này.", 422, "khong-co-dong");
  const ph = await nc.tx.timesheetFeedback.create({
    data: { tenantId: nc.tenantId, timesheetId: id, userId: nc.hoSo.userId, workDate: d.ngay ? ngayVeDate(d.ngay) : null, content: d.noiDung },
  });
  await nc.kiemToan({ action: "phan-hoi-bang-cong", objectType: "timesheet_feedback", objectId: ph.id, after: { bangCong: id, ...d } });
  await nc.suKien({ eventType: SU_KIEN.TIMESHEET_FEEDBACK, objectType: "timesheet", objectId: id, payload: { phanHoiId: ph.id, hanhDong: "gui" } });
  await baoChoNguoiCoQuyen(nc.tx, nc.tenantId, "cham_cong.update", {
    loai: "bang-cong-phan-hoi", tieuDe: `${nc.hoSo.hoTen} phản hồi bảng công ${bang.month}/${bang.year}`, noiDung: d.noiDung,
    duongDan: `/cham-cong/bang-cong/${id}`, doiTuong: "timesheet", doiTuongId: id, khoaChongTrung: `bang-cong-phan-hoi:${ph.id}`,
  }, nc.hoSo.userId);
  return { id: ph.id };
}

export async function giaiQuyetPhanHoi(nc: NguCanh, phanHoiId: string, d: z.infer<typeof LuocDoGiaiQuyetPhanHoi>) {
  batBuocQuyen(nc.hoSo, "cham_cong.update", { objectType: "timesheet_feedback", objectId: phanHoiId });
  const ph = await nc.tx.timesheetFeedback.findFirst({ where: { id: phanHoiId } });
  if (!ph) throw new LoiKhongTimThay("Phản hồi");
  await khoaChungTu(nc.tx, "timesheets", ph.timesheetId);
  const bang = await nc.tx.timesheet.findFirstOrThrow({ where: { id: ph.timesheetId } });
  if (bang.status !== "nhap") throw new LoiNghiepVu("Bảng công đã khóa.", 409, "da-khoa");
  if (ph.status !== "mo") throw new LoiNghiepVu("Phản hồi này đã được giải quyết.", 409, "da-xu-ly");
  await nc.tx.timesheetFeedback.update({ where: { id: phanHoiId }, data: { status: "da-giai-quyet", resolution: d.giaiQuyet, resolvedBy: nc.hoSo.userId, resolvedAt: new Date() } });
  await nc.kiemToan({ action: "phan-hoi-bang-cong", objectType: "timesheet_feedback", objectId: phanHoiId, before: { trangThai: "mo" }, after: { trangThai: "da-giai-quyet", giaiQuyet: d.giaiQuyet } });
  await nc.suKien({ eventType: SU_KIEN.TIMESHEET_FEEDBACK, objectType: "timesheet", objectId: ph.timesheetId, payload: { phanHoiId, hanhDong: "giai-quyet" } });
  if (ph.userId !== nc.hoSo.userId) {
    await taoThongBao(nc.tx, nc.tenantId, {
      nguoiNhanId: ph.userId, loai: "bang-cong-da-giai-quyet", tieuDe: `Phản hồi bảng công ${bang.month}/${bang.year} đã được giải quyết`, noiDung: d.giaiQuyet,
      duongDan: `/cham-cong/bang-cong/${bang.id}`, doiTuong: "timesheet", doiTuongId: bang.id, khoaChongTrung: `bang-cong-da-giai-quyet:${phanHoiId}`,
    });
  }
  return { id: phanHoiId };
}

/** Khóa bảng công (NS-52): hết hạn phản hồi và không còn phản hồi chưa giải quyết. Khóa rồi không mở lại. */
export async function khoaBangCong(nc: NguCanh, id: string, bayGio = new Date()) {
  batBuocQuyen(nc.hoSo, "cham_cong.update", { objectType: "timesheet", objectId: id });
  await khoaChungTu(nc.tx, "timesheets", id);
  const bang = await nc.tx.timesheet.findFirst({ where: { id } });
  if (!bang) throw new LoiKhongTimThay("Bảng công");
  if (bang.status === "da-khoa") throw new LoiNghiepVu("Bảng công đã khóa.", 409, "da-khoa");
  if (conHanPhanHoi(bang.feedbackDeadline, bayGio)) {
    throw new LoiNghiepVu(`Còn hạn phản hồi đến ${bang.feedbackDeadline.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} — chờ hết hạn để nhân viên kịp xem.`, 422, "con-han-phan-hoi");
  }
  const mo = await nc.tx.timesheetFeedback.count({ where: { timesheetId: id, status: "mo" } });
  if (mo > 0) throw new LoiNghiepVu(`Còn ${mo} phản hồi chưa giải quyết.`, 422, "con-phan-hoi");
  await nc.tx.timesheet.update({ where: { id }, data: { status: "da-khoa", lockedAt: bayGio, lockedBy: nc.hoSo.userId } });
  await nc.kiemToan({ action: "khoa-bang-cong", objectType: "timesheet", objectId: id, before: { trangThai: "nhap" }, after: { trangThai: "da-khoa", nam: bang.year, thang: bang.month } });
  await nc.suKien({ eventType: SU_KIEN.TIMESHEET_LOCKED, objectType: "timesheet", objectId: id, payload: { nam: bang.year, thang: bang.month } });
  return { id, trangThai: "da-khoa" };
}

/** Xuất CSV cho tính lương / kế toán (NS-54): tổng hợp theo người, hoặc chi tiết từng ngày. */
export async function xuatCsvBangCong(nc: NguCanh, id: string, kieu: "tong-hop" | "chi-tiet") {
  batBuocQuyen(nc.hoSo, "cham_cong.export", { objectType: "timesheet", objectId: id });
  const ct = await chiTietBangCong(nc, id);
  const gio = (p: number) => Math.round((p / 60) * 100) / 100;
  await nc.kiemToan({ action: "xuat-csv", objectType: "timesheet", objectId: id, after: { kieu, soDong: kieu === "tong-hop" ? ct.tongHop.length : ct.dong.length } });
  const ten = `bang-cong-${ct.nam}-${String(ct.thang).padStart(2, "0")}-${kieu}${ct.trangThai === "nhap" ? "-NHAP" : ""}.csv`;
  if (kieu === "tong-hop") {
    return {
      ten,
      noiDung: taoCsv(
        ["Họ tên", "Mã người dùng", "Công dự kiến", "Công thực tế", "Nghỉ có lương (ngày)", "Nghỉ không lương (ngày)", "Số lần đi muộn", "Phút đi muộn", "Số lần về sớm", "Phút về sớm", "Tăng ca ngày thường (giờ)", "Tăng ca nghỉ tuần (giờ)", "Tăng ca lễ (giờ)", "Trong đó giờ đêm", "Số ngày có cờ", "Số dòng điều chỉnh", "Trạng thái bảng"],
        ct.tongHop.map((t) => [
          t.hoTen, t.userId, t.congDuKien, t.congThucTe, t.nghiCoLuong, t.nghiKhongLuong, t.soLanMuon, t.phutMuon, t.soLanSom, t.phutSom,
          gio(t.tangCaThuongPhut), gio(t.tangCaNghiTuanPhut), gio(t.tangCaLePhut), gio(t.tangCaDemPhut), t.soNgayCo, t.soDongDieuChinh,
          ct.trangThai === "da-khoa" ? "Đã khóa" : "Nháp",
        ]),
      ),
    };
  }
  const gioVN = (d: Date | null) => (d ? d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false }) : "");
  return {
    ten,
    noiDung: taoCsv(
      ["Họ tên", "Ngày", "Điều chỉnh kỳ trước", "Loại ngày", "Công dự kiến", "Công thực tế", "Vào đầu", "Ra cuối", "Nguồn", "Phút muộn", "Phút sớm", "Nghỉ (ngày)", "Loại nghỉ", "Tăng ca (giờ)", "Tăng ca đêm (giờ)", "Cờ"],
      ct.dong.map((r) => [
        r.hoTen, r.ngay.split("-").reverse().join("/"), r.laDieuChinh ? "Có" : "", NHAN_LOAI_NGAY[r.loaiNgay], r.congDuKien, r.congThucTe,
        gioVN(r.vaoDau), gioVN(r.raCuoi), r.nguon.join(" + "), r.phutMuon, r.phutSom, r.nghiNgay, r.maLoaiNghi ?? "", gio(r.phutTangCa), gio(r.phutTangCaDem), r.nhanCo.join("; "),
      ]),
    ),
  };
}
